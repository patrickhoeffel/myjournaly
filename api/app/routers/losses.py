from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.loss import Loss, UserLoss
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, LOSSES, USER_LOSSES

router = APIRouter(prefix="/losses", tags=["losses"])


@router.get("", response_model=list[UserLoss])
async def list_user_losses(user: dict = Depends(get_current_user)):
    """List the user's losses. If they have none yet, copy defaults from the catalog."""
    db = get_firestore_client()
    uid = user["uid"]

    results: list[UserLoss] = []
    query = db.collection(USER_LOSSES).where("user_id", "==", uid)
    async for doc in query.stream():
        results.append(UserLoss.from_firestore(doc.id, doc.to_dict()))

    if results:
        results.sort(key=lambda l: (l.sort_order, l.name))
        return results

    # First time: copy admin catalog
    defaults: list[Loss] = []
    async for doc in db.collection(LOSSES).stream():
        defaults.append(Loss.from_firestore(doc.id, doc.to_dict()))

    for d in defaults:
        ul = UserLoss(
            user_id=uid,
            loss_id=d.id,
            name=d.name,
            category=d.category,
            sort_order=d.sort_order,
            is_default=True,
        )
        data = ul.to_firestore()
        doc_ref = db.collection(USER_LOSSES).document()
        await doc_ref.set(data)
        results.append(UserLoss.from_firestore(doc_ref.id, data))

    results.sort(key=lambda l: (l.sort_order, l.name))
    return results


@router.post("", response_model=UserLoss)
async def create_user_loss(loss: UserLoss, user: dict = Depends(get_current_user)):
    """Add a custom loss."""
    db = get_firestore_client()
    loss.user_id = user["uid"]
    loss.is_default = False
    loss.loss_id = None
    data = loss.to_firestore()
    doc_ref = db.collection(USER_LOSSES).document()
    await doc_ref.set(data)
    return UserLoss.from_firestore(doc_ref.id, data)


@router.put("/{loss_id}", response_model=UserLoss)
async def update_user_loss(loss_id: str, updates: dict, user: dict = Depends(get_current_user)):
    """Update a user loss (e.g., set degree, note, occurred_on)."""
    db = get_firestore_client()
    doc_ref = db.collection(USER_LOSSES).document(loss_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Loss not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your loss")
    updates["updated_at"] = datetime.utcnow().isoformat()
    # Never let the client reassign ownership
    updates.pop("user_id", None)
    await doc_ref.update(updates)
    merged = {**data, **updates}
    return UserLoss.from_firestore(loss_id, merged)


@router.delete("/{loss_id}")
async def delete_user_loss(loss_id: str, user: dict = Depends(get_current_user)):
    """Remove a loss from the user's list."""
    db = get_firestore_client()
    doc_ref = db.collection(USER_LOSSES).document(loss_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Loss not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your loss")
    await doc_ref.delete()
    return {"deleted": loss_id}


@router.post("/reset", response_model=list[UserLoss])
async def reset_to_defaults(user: dict = Depends(get_current_user)):
    """Delete all user losses and re-copy from admin catalog."""
    db = get_firestore_client()
    uid = user["uid"]

    query = db.collection(USER_LOSSES).where("user_id", "==", uid)
    async for doc in query.stream():
        await db.collection(USER_LOSSES).document(doc.id).delete()

    results: list[UserLoss] = []
    async for doc in db.collection(LOSSES).stream():
        d = Loss.from_firestore(doc.id, doc.to_dict())
        ul = UserLoss(
            user_id=uid,
            loss_id=d.id,
            name=d.name,
            category=d.category,
            sort_order=d.sort_order,
            is_default=True,
        )
        data = ul.to_firestore()
        doc_ref = db.collection(USER_LOSSES).document()
        await doc_ref.set(data)
        results.append(UserLoss.from_firestore(doc_ref.id, data))

    results.sort(key=lambda l: (l.sort_order, l.name))
    return results
