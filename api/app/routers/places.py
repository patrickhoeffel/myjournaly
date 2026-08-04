from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.place import Place
from app.services.auth import get_current_user
from app.services.firestore import (
    get_firestore_client,
    EVENTS,
    PLACES,
    TIMELINE_SEASONS,
)

router = APIRouter(prefix="/places", tags=["places"])


async def _existing_place_ids_for_user(db, uid: str) -> dict[str, str]:
    """Return a {google_place_id -> firestore_doc_id} map of Places the user already has."""
    result: dict[str, str] = {}
    async for doc in db.collection(PLACES).where("user_id", "==", uid).stream():
        data = doc.to_dict()
        gid = data.get("place_id")
        if gid:
            result[gid] = doc.id
    return result


async def _reconcile_places(db, uid: str) -> None:
    """Scan the user's events and seasons for any place_ids that don't yet have
    a Place doc and create one. Idempotent — safe to run on every list call."""
    existing = await _existing_place_ids_for_user(db, uid)
    seen: dict[str, dict] = {}  # place_id -> raw place dict (last-seen wins on conflict)

    async for doc in db.collection(EVENTS).where("user_id", "==", uid).stream():
        data = doc.to_dict()
        places = data.get("location_places") or []
        legacy = data.get("location_place")
        if legacy and not places:
            places = [legacy]
        for p in places:
            if isinstance(p, dict) and p.get("place_id"):
                seen[p["place_id"]] = p

    async for doc in db.collection(TIMELINE_SEASONS).where("user_id", "==", uid).stream():
        data = doc.to_dict()
        for p in data.get("location_places") or []:
            if isinstance(p, dict) and p.get("place_id"):
                seen[p["place_id"]] = p

    now = datetime.utcnow().isoformat()
    for gid, raw in seen.items():
        if gid in existing:
            continue
        place = Place(
            user_id=uid,
            place_id=gid,
            name=raw.get("name") or "",
            formatted_address=raw.get("formatted_address") or "",
            lat=float(raw.get("lat") or 0),
            lng=float(raw.get("lng") or 0),
            types=raw.get("types") or [],
        )
        data = place.to_firestore()
        data["created_at"] = now
        data["updated_at"] = now
        await db.collection(PLACES).document().set(data)


@router.get("", response_model=list[Place])
async def list_places(user: dict = Depends(get_current_user)):
    """Return all of the user's Places. Reconciles missing places from existing
    events/seasons on the way (lazy migration — no separate script needed)."""
    db = get_firestore_client()
    await _reconcile_places(db, user["uid"])
    results: list[Place] = []
    async for doc in db.collection(PLACES).where("user_id", "==", user["uid"]).stream():
        results.append(Place.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda p: (p.name or "").lower())
    return results


@router.post("", response_model=Place, status_code=status.HTTP_201_CREATED)
async def create_place(p: Place, user: dict = Depends(get_current_user)):
    """Create a new Place. If a Place with the same provider place_id already
    exists for this user, return it instead of creating a duplicate."""
    db = get_firestore_client()
    uid = user["uid"]

    # Dedupe by (user_id, place_id)
    existing = await _existing_place_ids_for_user(db, uid)
    if p.place_id in existing:
        doc = await db.collection(PLACES).document(existing[p.place_id]).get()
        return Place.from_firestore(doc.id, doc.to_dict())

    p.user_id = uid
    data = p.to_firestore()
    doc_ref = db.collection(PLACES).document()
    await doc_ref.set(data)
    return Place.from_firestore(doc_ref.id, data)


@router.get("/{place_id}", response_model=Place)
async def get_place(place_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(PLACES).document(place_id).get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Place not found")
    return Place.from_firestore(doc.id, doc.to_dict())


@router.put("/{place_id}", response_model=Place)
async def update_place(place_id: str, p: Place, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(PLACES).document(place_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Place not found")
    p.user_id = user["uid"]
    data = p.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Place.from_firestore(place_id, data)


@router.delete("/{place_id}")
async def delete_place(place_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(PLACES).document(place_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Place not found")
    await doc_ref.delete()
    return {"deleted": place_id}


@router.get("/{place_id}/references")
async def list_place_references(place_id: str, user: dict = Depends(get_current_user)):
    """Return events and seasons that reference this Place by Google's place_id.
    Used by the Place detail page to show what's happened here."""
    db = get_firestore_client()
    doc = await db.collection(PLACES).document(place_id).get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Place not found")
    google_pid = doc.to_dict().get("place_id")
    if not google_pid:
        return {"events": [], "seasons": []}

    def has_match(places: list) -> bool:
        return any(isinstance(p, dict) and p.get("place_id") == google_pid for p in (places or []))

    events: list[dict] = []
    async for d in db.collection(EVENTS).where("user_id", "==", user["uid"]).stream():
        data = d.to_dict()
        places = data.get("location_places") or []
        legacy = data.get("location_place")
        if legacy and not places:
            places = [legacy]
        if has_match(places):
            events.append({
                "id": d.id,
                "title": data.get("title") or "",
                "began_at": (data.get("began_at") or ""),
                "ended_at": data.get("ended_at"),
                "kind": data.get("kind"),
                "category": data.get("category"),
            })

    seasons: list[dict] = []
    async for d in db.collection(TIMELINE_SEASONS).where("user_id", "==", user["uid"]).stream():
        data = d.to_dict()
        if has_match(data.get("location_places") or []):
            seasons.append({
                "id": d.id,
                "title": data.get("title") or "",
                "start_date": str(data.get("start_date") or ""),
                "end_date": str(data.get("end_date")) if data.get("end_date") else None,
            })

    events.sort(key=lambda e: str(e.get("began_at") or ""), reverse=True)
    seasons.sort(key=lambda s: str(s.get("start_date") or ""), reverse=True)
    return {"events": events, "seasons": seasons}
