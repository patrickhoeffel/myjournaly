from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.loss import Loss
from app.services.auth import require_admin
from app.services.firestore import get_firestore_client, LOSSES

router = APIRouter(prefix="/admin", tags=["admin-losses"])


@router.get("/losses", response_model=list[Loss])
async def list_losses(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(LOSSES).stream():
        results.append(Loss.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda l: (l.sort_order, l.name))
    return results


@router.post("/losses", response_model=Loss)
async def create_loss(loss: Loss, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = loss.to_firestore()
    doc_ref = db.collection(LOSSES).document()
    await doc_ref.set(data)
    return Loss.from_firestore(doc_ref.id, data)


@router.put("/losses/{loss_id}", response_model=Loss)
async def update_loss(loss_id: str, loss: Loss, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(LOSSES).document(loss_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Loss not found")
    data = loss.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Loss.from_firestore(loss_id, data)


@router.delete("/losses/{loss_id}")
async def delete_loss(loss_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(LOSSES).document(loss_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Loss not found")
    await doc_ref.delete()
    return {"deleted": loss_id}
