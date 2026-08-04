from fastapi import APIRouter, Depends, HTTPException

from app.models.event import Event
from app.models.timeline import (
    TimelineSeason,
    TimelineType,
    UserTimeline,
)
from app.services.auth import get_current_user
from app.services.firestore import (
    get_firestore_client,
    EVENTS,
    LINKS,
    TIMELINE_TYPES,
    USER_TIMELINES,
    TIMELINE_SEASONS,
)

router = APIRouter(prefix="/timeline", tags=["timeline"])


# ── Timeline Types (read-only for users) ──


@router.get("/types", response_model=list[TimelineType])
async def list_timeline_types(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(TIMELINE_TYPES).where("is_active", "==", True).stream():
        results.append(TimelineType.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda t: t.order)
    return results


# ── User Timelines ──


@router.get("/lines", response_model=list[UserTimeline])
async def list_user_timelines(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(USER_TIMELINES).where("user_id", "==", user["uid"]).stream():
        results.append(UserTimeline.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda t: t.order)
    return results


@router.post("/lines", response_model=UserTimeline)
async def create_user_timeline(tl: UserTimeline, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    tl.user_id = user["uid"]
    data = tl.to_firestore()
    doc_ref = db.collection(USER_TIMELINES).document()
    await doc_ref.set(data)
    return UserTimeline.from_firestore(doc_ref.id, data)


@router.put("/lines/{line_id}", response_model=UserTimeline)
async def update_user_timeline(line_id: str, tl: UserTimeline, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(USER_TIMELINES).document(line_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Timeline not found")
    tl.user_id = user["uid"]
    data = tl.to_firestore()
    await doc_ref.update(data)
    return UserTimeline.from_firestore(line_id, data)


@router.delete("/lines/{line_id}")
async def delete_user_timeline(line_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(USER_TIMELINES).document(line_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Timeline not found")
    # Cascade delete event-timeline links (events themselves survive)
    async for d in db.collection(LINKS).where("to_id", "==", line_id).where("deleted_at", "==", None).stream():
        if d.to_dict().get("to_type") == "user_timeline":
            await db.collection(LINKS).document(d.id).delete()
    async for d in db.collection(TIMELINE_SEASONS).where("user_timeline_id", "==", line_id).stream():
        await db.collection(TIMELINE_SEASONS).document(d.id).delete()
    await doc_ref.delete()
    return {"deleted": line_id}


# ── Timeline Events (now stored in unified EVENTS collection, linked to timelines) ──


@router.get("/events", response_model=list[Event])
async def list_timeline_events(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(EVENTS).where("user_id", "==", user["uid"]).stream():
        results.append(Event.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/events")
async def create_timeline_event(payload: dict, user: dict = Depends(get_current_user)):
    """Create an event and optionally link it to a timeline line."""
    db = get_firestore_client()
    uid = user["uid"]
    user_timeline_id = payload.pop("user_timeline_id", None)

    # Map event_date -> began_at if the frontend sends the old field
    if "event_date" in payload and "began_at" not in payload:
        payload["began_at"] = payload.pop("event_date")

    # Ensure required fields
    payload.setdefault("category", "personal")
    payload["user_id"] = uid

    event = Event(**payload)
    event.user_id = uid
    data = event.to_firestore()
    doc_ref = db.collection(EVENTS).document()
    await doc_ref.set(data)
    event_id = doc_ref.id

    # Create link to timeline if specified
    if user_timeline_id:
        from datetime import datetime

        link_data = {
            "user_id": uid,
            "from_id": event_id,
            "from_type": "event",
            "from_name": event.title,
            "to_id": user_timeline_id,
            "to_type": "user_timeline",
            "to_name": "",
            "link_type": "association",
            "link_strength": 0.5,
            "link_description": None,
            "link_source": None,
            "link_source_confidence": 1.0,
            "valid_begin_date": None,
            "valid_end_date": None,
            "created_at": datetime.utcnow().isoformat(),
            "modified_at": datetime.utcnow().isoformat(),
            "deleted_at": None,
        }
        await db.collection(LINKS).document().set(link_data)

    result = Event.from_firestore(event_id, data).model_dump(mode="json")
    result["user_timeline_id"] = user_timeline_id or ""
    return result


@router.put("/events/{event_id}")
async def update_timeline_event(event_id: str, payload: dict, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(EVENTS).document(event_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Event not found")

    user_timeline_id = payload.pop("user_timeline_id", None)

    # Map event_date -> began_at if the frontend sends the old field
    if "event_date" in payload and "began_at" not in payload:
        payload["began_at"] = payload.pop("event_date")

    existing = doc.to_dict()
    existing.update(payload)
    existing["user_id"] = user["uid"]
    event = Event(**{k: v for k, v in existing.items() if k != "id"})
    data = event.to_firestore()
    await doc_ref.update(data)

    result = Event.from_firestore(event_id, data).model_dump(mode="json")
    result["user_timeline_id"] = user_timeline_id or ""
    return result


@router.delete("/events/{event_id}")
async def delete_timeline_event(event_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(EVENTS).document(event_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Event not found")
    # Clean up timeline links
    async for link_doc in db.collection(LINKS).where("from_id", "==", event_id).where("from_type", "==", "event").where("deleted_at", "==", None).stream():
        await db.collection(LINKS).document(link_doc.id).delete()
    await doc_ref.delete()
    return {"deleted": event_id}


# ── Timeline Seasons (spans) ──


@router.get("/seasons", response_model=list[TimelineSeason])
async def list_timeline_seasons(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(TIMELINE_SEASONS).where("user_id", "==", user["uid"]).stream():
        results.append(TimelineSeason.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/seasons", response_model=TimelineSeason)
async def create_timeline_season(s: TimelineSeason, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    s.user_id = user["uid"]
    data = s.to_firestore()
    doc_ref = db.collection(TIMELINE_SEASONS).document()
    await doc_ref.set(data)
    return TimelineSeason.from_firestore(doc_ref.id, data)


@router.put("/seasons/{season_id}", response_model=TimelineSeason)
async def update_timeline_season(season_id: str, s: TimelineSeason, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(TIMELINE_SEASONS).document(season_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Season not found")
    s.user_id = user["uid"]
    data = s.to_firestore()
    await doc_ref.update(data)
    return TimelineSeason.from_firestore(season_id, data)


@router.delete("/seasons/{season_id}")
async def delete_timeline_season(season_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(TIMELINE_SEASONS).document(season_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Season not found")
    await doc_ref.delete()
    return {"deleted": season_id}


# ── Full data load for D3 visualization ──


@router.get("/full")
async def get_full_timeline(user: dict = Depends(get_current_user)):
    """Load all timeline data in one request for the D3 visualization."""
    db = get_firestore_client()
    uid = user["uid"]

    types = []
    async for doc in db.collection(TIMELINE_TYPES).where("is_active", "==", True).stream():
        types.append(TimelineType.from_firestore(doc.id, doc.to_dict()).model_dump(mode="json"))

    lines = []
    async for doc in db.collection(USER_TIMELINES).where("user_id", "==", uid).stream():
        lines.append(UserTimeline.from_firestore(doc.id, doc.to_dict()).model_dump(mode="json"))

    # Load all events and build a lookup for timeline links
    all_events = {}
    async for doc in db.collection(EVENTS).where("user_id", "==", uid).stream():
        all_events[doc.id] = Event.from_firestore(doc.id, doc.to_dict())

    # Find which events are linked to which timeline lines
    event_timeline_map: dict[str, str] = {}  # event_id -> user_timeline_id
    async for doc in db.collection(LINKS).where("user_id", "==", uid).stream():
        d = doc.to_dict()
        if d.get("deleted_at") is not None:
            continue
        if d.get("to_type") == "user_timeline" and d.get("from_type") == "event" and d["from_id"] in all_events:
            event_timeline_map[d["from_id"]] = d["to_id"]

    # Build viz-compatible event list (only events linked to a timeline)
    events = []
    for event_id, timeline_id in event_timeline_map.items():
        ev = all_events[event_id]
        events.append({
            "id": event_id,
            "user_timeline_id": timeline_id,
            "title": ev.title,
            "event_date": ev.began_at.isoformat() if ev.began_at else "",
            "ended_at": ev.ended_at.isoformat() if ev.ended_at else None,
            "kind": ev.kind,
            "location_places": [p.model_dump(mode="json") for p in ev.location_places],
        })

    seasons = []
    async for doc in db.collection(TIMELINE_SEASONS).where("user_id", "==", uid).stream():
        seasons.append(TimelineSeason.from_firestore(doc.id, doc.to_dict()).model_dump(mode="json"))

    return {
        "types": sorted(types, key=lambda t: t.get("order", 0)),
        "lines": sorted(lines, key=lambda l: l.get("order", 0)),
        "events": events,
        "seasons": seasons,
    }
