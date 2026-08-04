from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.feeling import Feeling
from app.services.auth import require_admin
from app.services.firestore import get_firestore_client, FEELINGS

router = APIRouter(prefix="/admin", tags=["admin-feelings"])


@router.get("/feelings", response_model=list[Feeling])
async def list_feelings(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(FEELINGS).stream():
        results.append(Feeling.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda f: (f.valence.value, f.sort_order, f.name))
    return results


@router.post("/feelings", response_model=Feeling)
async def create_feeling(feeling: Feeling, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = feeling.to_firestore()
    doc_ref = db.collection(FEELINGS).document()
    await doc_ref.set(data)
    return Feeling.from_firestore(doc_ref.id, data)


@router.put("/feelings/{feeling_id}", response_model=Feeling)
async def update_feeling(feeling_id: str, feeling: Feeling, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(FEELINGS).document(feeling_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feeling not found")
    data = feeling.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Feeling.from_firestore(feeling_id, data)


@router.delete("/feelings/{feeling_id}")
async def delete_feeling(feeling_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(FEELINGS).document(feeling_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feeling not found")
    await doc_ref.delete()
    return {"deleted": feeling_id}
