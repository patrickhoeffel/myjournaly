from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.timeline_zoom_preset import DEFAULT_PRESETS, TimelineZoomPreset
from app.services.auth import get_current_user, require_admin
from app.services.firestore import get_firestore_client, TIMELINE_ZOOM_PRESETS

router = APIRouter(tags=["timeline-zoom-presets"])


async def _seed_defaults_if_empty(db) -> None:
    """Seed the collection with default presets if it's empty."""
    # Fast check: does any doc exist?
    async for _ in db.collection(TIMELINE_ZOOM_PRESETS).limit(1).stream():
        return
    now = datetime.utcnow().isoformat()
    for spec in DEFAULT_PRESETS:
        data = {**spec, "created_at": now, "updated_at": now}
        await db.collection(TIMELINE_ZOOM_PRESETS).document().set(data)


@router.get("/timeline-zoom-presets", response_model=list[TimelineZoomPreset])
async def list_presets(user: dict = Depends(get_current_user)):
    """Return the global list of zoom presets, auto-seeding defaults on first call."""
    db = get_firestore_client()
    await _seed_defaults_if_empty(db)
    results: list[TimelineZoomPreset] = []
    async for doc in db.collection(TIMELINE_ZOOM_PRESETS).stream():
        results.append(TimelineZoomPreset.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda p: (p.order, p.label))
    return results


@router.post("/admin/timeline-zoom-presets", response_model=TimelineZoomPreset)
async def create_preset(preset: TimelineZoomPreset, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = preset.to_firestore()
    doc_ref = db.collection(TIMELINE_ZOOM_PRESETS).document()
    await doc_ref.set(data)
    return TimelineZoomPreset.from_firestore(doc_ref.id, data)


@router.put("/admin/timeline-zoom-presets/{preset_id}", response_model=TimelineZoomPreset)
async def update_preset(preset_id: str, preset: TimelineZoomPreset, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(TIMELINE_ZOOM_PRESETS).document(preset_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Preset not found")
    data = preset.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return TimelineZoomPreset.from_firestore(preset_id, data)


@router.delete("/admin/timeline-zoom-presets/{preset_id}")
async def delete_preset(preset_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(TIMELINE_ZOOM_PRESETS).document(preset_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Preset not found")
    await doc_ref.delete()
    return {"deleted": preset_id}
