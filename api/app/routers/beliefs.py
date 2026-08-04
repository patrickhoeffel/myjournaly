from fastapi import APIRouter, Depends, HTTPException, status

from app.models.belief import Belief, BeliefCategory, BeliefValence, BeliefSource
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, BELIEFS, DEFAULT_BELIEFS

router = APIRouter(prefix="/beliefs", tags=["beliefs"])


@router.get("", response_model=list[Belief])
async def list_beliefs(active_only: bool = True, user: dict = Depends(get_current_user)):
    """List the user's beliefs. If they have none yet, copy defaults."""
    db = get_firestore_client()
    uid = user["uid"]

    query = db.collection(BELIEFS).where("user_id", "==", uid)
    if active_only:
        query = query.where("is_active", "==", True)

    results = []
    async for doc in query.stream():
        results.append(Belief.from_firestore(doc.id, doc.to_dict()))

    if results:
        results.sort(key=lambda b: (
            b.category.value if b.category else "zzz",
            b.valence.value if b.valence else "zzz",
            b.statement,
        ))
        return results

    # First time: copy admin defaults
    async for doc in db.collection(DEFAULT_BELIEFS).stream():
        d = doc.to_dict()
        belief = Belief(
            user_id=uid,
            statement=d["name"],
            source=BeliefSource.USER_DECLARED,
            source_description=d.get("description", ""),
            category=BeliefCategory(d["category"]),
            valence=BeliefValence(d["valence"]),
            is_default=True,
        )
        data = belief.to_firestore()
        doc_ref = db.collection(BELIEFS).document()
        await doc_ref.set(data)
        results.append(Belief.from_firestore(doc_ref.id, data))

    results.sort(key=lambda b: (
        b.category.value if b.category else "zzz",
        b.valence.value if b.valence else "zzz",
        b.statement,
    ))
    return results


@router.post("", response_model=Belief, status_code=status.HTTP_201_CREATED)
async def create_belief(belief: Belief, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    belief.user_id = user["uid"]
    belief.is_default = False
    data = belief.to_firestore()
    doc_ref = db.collection(BELIEFS).document()
    await doc_ref.set(data)
    return Belief.from_firestore(doc_ref.id, data)


@router.get("/{belief_id}", response_model=Belief)
async def get_belief(belief_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(BELIEFS).document(belief_id).get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Belief not found")
    return Belief.from_firestore(doc.id, doc.to_dict())


@router.put("/{belief_id}", response_model=Belief)
async def update_belief(belief_id: str, updates: dict, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(BELIEFS).document(belief_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Belief not found")
    await doc_ref.update(updates)
    updated = await doc_ref.get()
    return Belief.from_firestore(updated.id, updated.to_dict())


@router.delete("/{belief_id}")
async def delete_belief(belief_id: str, user: dict = Depends(get_current_user)):
    """Remove a belief from the user's list."""
    db = get_firestore_client()
    doc_ref = db.collection(BELIEFS).document(belief_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Belief not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your belief")
    await doc_ref.delete()
    return {"deleted": belief_id}


@router.post("/reset", response_model=list[Belief])
async def reset_to_defaults(user: dict = Depends(get_current_user)):
    """Delete all user beliefs and re-copy from admin defaults."""
    db = get_firestore_client()
    uid = user["uid"]

    # Delete existing
    query = db.collection(BELIEFS).where("user_id", "==", uid)
    async for doc in query.stream():
        await db.collection(BELIEFS).document(doc.id).delete()

    # Copy defaults
    results = []
    async for doc in db.collection(DEFAULT_BELIEFS).stream():
        d = doc.to_dict()
        belief = Belief(
            user_id=uid,
            statement=d["name"],
            source=BeliefSource.USER_DECLARED,
            source_description=d.get("description", ""),
            category=BeliefCategory(d["category"]),
            valence=BeliefValence(d["valence"]),
            is_default=True,
        )
        data = belief.to_firestore()
        doc_ref = db.collection(BELIEFS).document()
        await doc_ref.set(data)
        results.append(Belief.from_firestore(doc_ref.id, data))

    results.sort(key=lambda b: (
        b.category.value if b.category else "zzz",
        b.valence.value if b.valence else "zzz",
        b.statement,
    ))
    return results
