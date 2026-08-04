from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.feeling import Feeling, UserFeeling
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, FEELINGS, USER_FEELINGS

router = APIRouter(prefix="/feelings", tags=["feelings"])


@router.get("", response_model=list[UserFeeling])
async def list_user_feelings(user: dict = Depends(get_current_user)):
    """List the user's feelings. If they have none yet, copy defaults."""
    db = get_firestore_client()
    uid = user["uid"]

    # Check if user already has feelings
    results = []
    query = db.collection(USER_FEELINGS).where("user_id", "==", uid)
    async for doc in query.stream():
        results.append(UserFeeling.from_firestore(doc.id, doc.to_dict()))

    if results:
        results.sort(key=lambda f: (f.valence.value, f.sort_order, f.name))
        return results

    # First time: copy admin defaults
    defaults = []
    async for doc in db.collection(FEELINGS).stream():
        defaults.append(Feeling.from_firestore(doc.id, doc.to_dict()))

    for d in defaults:
        uf = UserFeeling(
            user_id=uid,
            name=d.name,
            valence=d.valence,
            sort_order=d.sort_order,
            is_default=True,
        )
        data = uf.to_firestore()
        doc_ref = db.collection(USER_FEELINGS).document()
        await doc_ref.set(data)
        results.append(UserFeeling.from_firestore(doc_ref.id, data))

    results.sort(key=lambda f: (f.valence.value, f.sort_order, f.name))
    return results


@router.post("", response_model=UserFeeling)
async def create_user_feeling(feeling: UserFeeling, user: dict = Depends(get_current_user)):
    """Add a custom feeling."""
    db = get_firestore_client()
    feeling.user_id = user["uid"]
    feeling.is_default = False
    data = feeling.to_firestore()
    doc_ref = db.collection(USER_FEELINGS).document()
    await doc_ref.set(data)
    return UserFeeling.from_firestore(doc_ref.id, data)


@router.put("/{feeling_id}", response_model=UserFeeling)
async def update_user_feeling(feeling_id: str, updates: dict, user: dict = Depends(get_current_user)):
    """Update a user feeling (e.g., set degree)."""
    db = get_firestore_client()
    doc_ref = db.collection(USER_FEELINGS).document(feeling_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feeling not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your feeling")
    updates["updated_at"] = datetime.utcnow().isoformat()
    updates.pop("user_id", None)
    await doc_ref.update(updates)
    merged = {**data, **updates}
    return UserFeeling.from_firestore(feeling_id, merged)


@router.delete("/{feeling_id}")
async def delete_user_feeling(feeling_id: str, user: dict = Depends(get_current_user)):
    """Remove a feeling from the user's list."""
    db = get_firestore_client()
    doc_ref = db.collection(USER_FEELINGS).document(feeling_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feeling not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your feeling")
    await doc_ref.delete()
    return {"deleted": feeling_id}


@router.post("/reset", response_model=list[UserFeeling])
async def reset_to_defaults(user: dict = Depends(get_current_user)):
    """Delete all user feelings and re-copy from admin defaults."""
    db = get_firestore_client()
    uid = user["uid"]

    # Delete existing
    query = db.collection(USER_FEELINGS).where("user_id", "==", uid)
    async for doc in query.stream():
        await db.collection(USER_FEELINGS).document(doc.id).delete()

    # Copy defaults
    results = []
    async for doc in db.collection(FEELINGS).stream():
        d = Feeling.from_firestore(doc.id, doc.to_dict())
        uf = UserFeeling(
            user_id=uid,
            name=d.name,
            valence=d.valence,
            sort_order=d.sort_order,
            is_default=True,
        )
        data = uf.to_firestore()
        doc_ref = db.collection(USER_FEELINGS).document()
        await doc_ref.set(data)
        results.append(UserFeeling.from_firestore(doc_ref.id, data))

    results.sort(key=lambda f: (f.valence.value, f.sort_order, f.name))
    return results
