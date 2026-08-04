from fastapi import APIRouter, Depends, HTTPException, status

from app.models.event import Event, EventBeliefLink, EventLocation
from app.services.auth import get_current_user
from app.services.firestore import (
    get_firestore_client,
    EVENTS,
    EVENT_BELIEF_LINKS,
    TIMELINE_SEASONS,
)

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=Event, status_code=status.HTTP_201_CREATED)
async def create_event(event: Event, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    event.user_id = user["uid"]
    doc_ref = db.collection(EVENTS).document()
    await doc_ref.set(event.to_firestore())
    return Event.from_firestore(doc_ref.id, event.to_firestore())


@router.get("", response_model=list[Event])
async def list_events(
    category: str | None = None,
    user: dict = Depends(get_current_user),
):
    db = get_firestore_client()
    query = db.collection(EVENTS).where("user_id", "==", user["uid"])
    if category:
        query = query.where("category", "==", category)
    results = []
    async for doc in query.stream():
        results.append(Event.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda e: e.began_at)
    return results


@router.get("/locations", response_model=list[EventLocation])
async def list_user_location_places(user: dict = Depends(get_current_user)):
    """Return the user's previously-used location places, deduplicated by place_id,
    sorted by usage frequency (then recency). Aggregates over both events and
    timeline seasons so a place pinned to either kind becomes a one-click shortcut
    on the other. Avoids an extra Maps API call when the user is re-using a place."""
    db = get_firestore_client()
    counts: dict[str, int] = {}
    latest_seen: dict[str, str] = {}
    place_data: dict[str, dict] = {}

    def absorb(places: list, when: str) -> None:
        for p in places:
            if not isinstance(p, dict):
                continue
            place_id = p.get("place_id")
            if not place_id:
                continue
            counts[place_id] = counts.get(place_id, 0) + 1
            if place_id not in latest_seen or when > latest_seen[place_id]:
                latest_seen[place_id] = when
                place_data[place_id] = p

    # Events
    async for doc in db.collection(EVENTS).where("user_id", "==", user["uid"]).stream():
        data = doc.to_dict()
        places = data.get("location_places") or []
        legacy = data.get("location_place")
        if legacy and not places:
            places = [legacy]
        absorb(places, str(data.get("began_at") or ""))

    # Seasons
    async for doc in db.collection(TIMELINE_SEASONS).where("user_id", "==", user["uid"]).stream():
        data = doc.to_dict()
        absorb(data.get("location_places") or [], str(data.get("start_date") or ""))

    # Stable sort: recency first, then count (final order is count desc, recency desc within ties)
    ids = list(place_data.keys())
    ids.sort(key=lambda pid: latest_seen.get(pid, ""), reverse=True)
    ids.sort(key=lambda pid: counts[pid], reverse=True)

    return [EventLocation(**place_data[pid]) for pid in ids[:20]]


@router.get("/{event_id}", response_model=Event)
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(EVENTS).document(event_id).get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Event not found")
    return Event.from_firestore(doc.id, doc.to_dict())


@router.put("/{event_id}", response_model=Event)
async def update_event(event_id: str, event: Event, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(EVENTS).document(event_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Event not found")
    event.user_id = user["uid"]
    data = event.to_firestore()
    await doc_ref.update(data)
    return Event.from_firestore(event_id, data)


@router.delete("/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(EVENTS).document(event_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Event not found")
    await doc_ref.delete()
    return {"deleted": event_id}


# --- Event-Belief Links ---


@router.post(
    "/{event_id}/beliefs",
    response_model=EventBeliefLink,
    status_code=status.HTTP_201_CREATED,
)
async def link_belief_to_event(
    event_id: str,
    link: EventBeliefLink,
    user: dict = Depends(get_current_user),
):
    db = get_firestore_client()
    # Verify event ownership
    event_doc = await db.collection(EVENTS).document(event_id).get()
    if not event_doc.exists or event_doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Event not found")
    link.event_id = event_id
    doc_ref = db.collection(EVENT_BELIEF_LINKS).document()
    await doc_ref.set(link.to_firestore())
    return EventBeliefLink.from_firestore(doc_ref.id, link.to_firestore())


@router.get("/{event_id}/beliefs", response_model=list[EventBeliefLink])
async def list_event_belief_links(event_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    query = db.collection(EVENT_BELIEF_LINKS).where("event_id", "==", event_id)
    results = []
    async for doc in query.stream():
        results.append(EventBeliefLink.from_firestore(doc.id, doc.to_dict()))
    return results
