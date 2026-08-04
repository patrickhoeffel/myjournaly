from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.timeline import TimelineType
from app.services.auth import require_admin
from app.services.firestore import get_firestore_client, TIMELINE_TYPES

router = APIRouter(prefix="/admin", tags=["admin-timelines"])


@router.get("/timeline-types", response_model=list[TimelineType])
async def list_timeline_types(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(TIMELINE_TYPES).stream():
        results.append(TimelineType.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda t: t.order)
    return results


@router.post("/timeline-types", response_model=TimelineType)
async def create_timeline_type(tt: TimelineType, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = tt.to_firestore()
    doc_ref = db.collection(TIMELINE_TYPES).document()
    await doc_ref.set(data)
    return TimelineType.from_firestore(doc_ref.id, data)


@router.put("/timeline-types/{type_id}", response_model=TimelineType)
async def update_timeline_type(type_id: str, tt: TimelineType, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(TIMELINE_TYPES).document(type_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Timeline type not found")
    data = tt.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return TimelineType.from_firestore(type_id, data)


@router.delete("/timeline-types/{type_id}")
async def delete_timeline_type(type_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(TIMELINE_TYPES).document(type_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Timeline type not found")
    await doc_ref.delete()
    return {"deleted": type_id}
