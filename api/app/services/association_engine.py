"""Photo → event association ENGINE (the write side).

Wraps the pure scorer in `app/services/associations.py` with Firestore I/O:
find candidate matches for a photo (on upload) or for an event (on save) and
materialize `Link` records — idempotently, and respecting the user's intent.

Idempotency & respect (the whole ballgame):
  * We never create a second link for a (photo, event) pair we've already
    touched — in EITHER direction, at ANY status, deleted or not. So:
      - an existing auto/proposed/confirmed link is left alone (no duplicate),
      - a `rejected` tombstone suppresses re-proposing forever, and
      - a soft-deleted link (the user removed it) is not resurrected.
  * We only ADD links. We never retract an existing auto-link when the data
    later moves (e.g., an event's dates shift off a photo). Retraction is a
    later phase — for now, additions are safe and reversible by the user.

`plan_links_for_photo` is pure (no I/O) so the backfill script can reuse it
with a synchronous client.

See docs/photo-associations.md.
"""

from __future__ import annotations

import logging
from datetime import datetime

from app.models.link import Link, LinkEntityType, LinkStatus, LinkType
from app.services.associations import Candidate, EventSpan, PhotoPoint, score_photo
from app.services.firestore import EVENTS, LINKS, PHOTOS

logger = logging.getLogger(__name__)

# A photo can legitimately sit inside more than one (overlapping) event, but cap
# how many links a single photo may spawn so pathological overlaps can't explode.
MAX_LINKS_PER_PHOTO = 5


# ── Firestore-doc → scorer-input adapters (shared with the backfill script) ──


def _parse_dt(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        s = value.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            try:
                return datetime.fromisoformat(s[:10])
            except ValueError:
                return None
    return None


def event_span_from_doc(doc_id: str, data: dict) -> EventSpan:
    places: list[tuple[float, float]] = []
    for p in data.get("location_places") or []:
        lat, lng = p.get("lat"), p.get("lng")
        if lat is not None and lng is not None:
            places.append((float(lat), float(lng)))
    return EventSpan(
        id=doc_id,
        title=data.get("title", "(untitled)"),
        began_at=_parse_dt(data.get("began_at")),
        ended_at=_parse_dt(data.get("ended_at")),
        kind=data.get("kind"),
        places=tuple(places),
    )


def photo_point_from_doc(doc_id: str, data: dict) -> PhotoPoint:
    return PhotoPoint(
        id=doc_id,
        taken_at=_parse_dt(data.get("taken_at")) or _parse_dt(data.get("created_at")),
        lat=data.get("gps_lat"),
        lng=data.get("gps_lng"),
        caption=data.get("caption"),
    )


def photo_name_from_doc(data: dict) -> str:
    return data.get("caption") or data.get("original_filename") or "Photo"


# ── Pure planning ────────────────────────────────────────────────────────────


def _link_from_candidate(uid: str, photo: PhotoPoint, photo_name: str, cand: Candidate) -> Link:
    return Link(
        user_id=uid,
        from_id=photo.id,
        from_type=LinkEntityType.PHOTO,
        from_name=photo_name,
        to_id=cand.event_id,
        to_type=LinkEntityType.EVENT,
        to_name=cand.event_title,
        link_type=LinkType.ASSOCIATION,
        link_strength=cand.confidence,
        link_source=f"auto:{cand.signal}",
        link_source_confidence=cand.confidence,
        status=LinkStatus.AUTO if cand.tier == "auto" else LinkStatus.PROPOSED,
        valid_begin_date=photo.taken_at,
        valid_end_date=photo.taken_at,
    )


def plan_links_for_photo(
    uid: str,
    photo: PhotoPoint,
    photo_name: str,
    events: list[EventSpan],
    already_linked_event_ids: set[str],
) -> list[Link]:
    """PURE: decide which Link records to create for one photo. No I/O.

    Skips events already linked to this photo (any status/direction) so the
    caller stays idempotent and honors rejections/removals."""
    links: list[Link] = []
    for cand in score_photo(photo, events, limit=MAX_LINKS_PER_PHOTO):
        if cand.tier == "none" or cand.event_id in already_linked_event_ids:
            continue
        links.append(_link_from_candidate(uid, photo, photo_name, cand))
    return links


# ── Async I/O wrappers (called from the routers) ────────────────────────────


async def _linked_other_ids(db, uid: str, entity_id: str) -> set[str]:
    """Every entity id on the other side of ANY link touching `entity_id`
    (either direction, any status, including soft-deleted). This is the
    idempotency + intent gate."""
    ids: set[str] = set()
    async for doc in (
        db.collection(LINKS).where("user_id", "==", uid).where("from_id", "==", entity_id).stream()
    ):
        ids.add(doc.to_dict().get("to_id"))
    async for doc in (
        db.collection(LINKS).where("user_id", "==", uid).where("to_id", "==", entity_id).stream()
    ):
        ids.add(doc.to_dict().get("from_id"))
    ids.discard(None)
    return ids


async def _load_user_events(db, uid: str) -> list[EventSpan]:
    events: list[EventSpan] = []
    async for doc in db.collection(EVENTS).where("user_id", "==", uid).stream():
        events.append(event_span_from_doc(doc.id, doc.to_dict()))
    return events


async def _write_links(db, links: list[Link]) -> None:
    for link in links:
        await db.collection(LINKS).document().set(link.to_firestore())


async def associate_photo_on_upload(db, uid: str, photo_id: str, photo_data: dict) -> list[Link]:
    """Trigger: a photo was just uploaded — link it to matching events."""
    photo = photo_point_from_doc(photo_id, photo_data)
    if photo.taken_at is None:
        return []  # nothing to anchor on
    events = await _load_user_events(db, uid)
    if not events:
        return []
    already = await _linked_other_ids(db, uid, photo_id)
    links = plan_links_for_photo(uid, photo, photo_name_from_doc(photo_data), events, already)
    await _write_links(db, links)
    if links:
        logger.info("photo %s auto-associated to %d event(s)", photo_id, len(links))
    return links


async def associate_event_on_save(db, uid: str, event_id: str) -> list[Link]:
    """Trigger: an event was created/edited — link matching photos to it.

    Note: scans the user's photos. Fine at personal scale; a taken_at window is
    the obvious optimization once libraries get large."""
    doc = await db.collection(EVENTS).document(event_id).get()
    if not doc.exists or doc.to_dict().get("user_id") != uid:
        return []
    event = event_span_from_doc(event_id, doc.to_dict())
    already_photo_ids = await _linked_other_ids(db, uid, event_id)

    created: list[Link] = []
    async for pdoc in db.collection(PHOTOS).where("user_id", "==", uid).stream():
        if pdoc.id in already_photo_ids:
            continue
        pdata = pdoc.to_dict()
        photo = photo_point_from_doc(pdoc.id, pdata)
        if photo.taken_at is None:
            continue
        links = plan_links_for_photo(uid, photo, photo_name_from_doc(pdata), [event], set())
        if links:
            await _write_links(db, links)
            created.extend(links)
    if created:
        logger.info("event %s auto-associated to %d photo(s)", event_id, len(created))
    return created
