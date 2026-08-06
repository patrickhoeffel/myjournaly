"""Dry-run the photo → event association scorer against real Firestore data.

READ-ONLY. This writes nothing — no Link records, no mutations. It exists to
calibrate the scoring thresholds in app/services/associations.py by showing
exactly what the engine *would* link, and at what confidence, on your actual
photos and events.

Usage:
    uv run python scripts/dry_run_associations.py [USER_ID]

    USER_ID   optional — restrict the report to one user. Omitted → every user,
              grouped.

Tune the knobs (AUTO_THRESHOLD, SUGGEST_THRESHOLD, TIME_TAU_HOURS, GEO_*) in
app/services/associations.py, then re-run until the matches look right.
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import firestore

from app.config import settings
from app.services.associations import (
    AUTO_THRESHOLD,
    SUGGEST_THRESHOLD,
    EventSpan,
    PhotoPoint,
    score_photo,
)


def _parse_dt(value) -> datetime | None:
    """Firestore stores our datetimes as ISO strings (model_dump mode='json'),
    but native Timestamps may also appear. Handle both, plus date-only."""
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
                return datetime.fromisoformat(s[:10])  # date-only fallback
            except ValueError:
                return None
    return None


def _places(event: dict) -> tuple[tuple[float, float], ...]:
    out: list[tuple[float, float]] = []
    for p in event.get("location_places") or []:
        lat, lng = p.get("lat"), p.get("lng")
        if lat is not None and lng is not None:
            out.append((float(lat), float(lng)))
    return tuple(out)


def _short(s: str, n: int = 8) -> str:
    return (s or "")[:n]


def main() -> None:
    target_user = sys.argv[1] if len(sys.argv) > 1 else None

    # Pin to the My Journaly project explicitly. This must not be left to the
    # ambient config because:
    #   * this worktree has no .env (it's gitignored), so settings.project_id is
    #     empty when run from here; and
    #   * the machine's gcloud/ADC default points at another project
    #     (delectable-cloud-dev) — not where the data lives.
    # Override by exporting JOURNALY_PROJECT_ID if you ever need a different one.
    project_id = settings.project_id or "my-journaly"
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)

    app = firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client(app)

    print("=== Photo → Event association DRY RUN ===")
    print(f"Firestore project: {db.project}")
    print(f"Thresholds: auto >= {AUTO_THRESHOLD}, propose >= {SUGGEST_THRESHOLD}  "
          f"(edit in app/services/associations.py)")
    print("No links will be written.\n")

    # Group events and photos by user.
    events_by_user: dict[str, list[EventSpan]] = {}
    for doc in db.collection("events").stream():
        d = doc.to_dict()
        uid = d.get("user_id", "")
        if target_user and uid != target_user:
            continue
        events_by_user.setdefault(uid, []).append(
            EventSpan(
                id=doc.id,
                title=d.get("title", "(untitled)"),
                began_at=_parse_dt(d.get("began_at")),
                ended_at=_parse_dt(d.get("ended_at")),
                kind=d.get("kind"),
                places=_places(d),
            )
        )

    photos_by_user: dict[str, list[PhotoPoint]] = {}
    for doc in db.collection("photos").stream():
        d = doc.to_dict()
        uid = d.get("user_id", "")
        if target_user and uid != target_user:
            continue
        photos_by_user.setdefault(uid, []).append(
            PhotoPoint(
                id=doc.id,
                taken_at=_parse_dt(d.get("taken_at")) or _parse_dt(d.get("created_at")),
                lat=d.get("gps_lat"),
                lng=d.get("gps_lng"),
                caption=d.get("caption"),
            )
        )

    grand = {"auto": 0, "proposed": 0, "none": 0}

    users = sorted(set(photos_by_user) | set(events_by_user))
    if not users:
        print("No photos or events found"
              + (f" for user {target_user}." if target_user else "."))
        return

    for uid in users:
        events = events_by_user.get(uid, [])
        photos = photos_by_user.get(uid, [])
        print(f"User {uid}:")
        print(f"  photos: {len(photos)}   events: {len(events)}")

        if not photos or not events:
            print("  (nothing to score — need both photos and events)\n")
            continue

        counts = {"auto": 0, "proposed": 0, "none": 0}
        with_gps = 0
        no_taken = 0

        print(f"  {'PHOTO':10} {'TAKEN':20} {'GPS':4} {'TIER':9} {'CONF':>5}  "
              f"{'(t / g)':13} {'SIGNAL':9} BEST MATCH")
        for photo in sorted(photos, key=lambda p: (p.taken_at or datetime.min.replace(tzinfo=None) if p.taken_at is None else p.taken_at)):
            if photo.taken_at is None:
                no_taken += 1
            has_gps = photo.lat is not None and photo.lng is not None
            if has_gps:
                with_gps += 1

            candidates = score_photo(photo, events)
            best = candidates[0] if candidates else None
            tier = best.tier if best else "none"
            counts[tier] += 1

            taken_str = photo.taken_at.isoformat()[:19] if photo.taken_at else "(unknown)"
            if best:
                g = f"{best.geo_score:.2f}" if best.geo_score is not None else "  - "
                extra = f"  (+{len(candidates) - 1} more)" if len(candidates) > 1 else ""
                match = f"{best.event_title}{extra}"
                line = (f"  {_short(photo.id):10} {taken_str:20} {'yes' if has_gps else 'no':4} "
                        f"{tier.upper():9} {best.confidence:5.2f}  "
                        f"({best.time_score:.2f}/{g}) {best.signal:9} {match}")
            else:
                line = (f"  {_short(photo.id):10} {taken_str:20} {'yes' if has_gps else 'no':4} "
                        f"{'—':9} {'':5}  {'':13} {'':9} (no match)")
            print(line)

        print(f"\n  Summary for {uid}:")
        print(f"    would AUTO-link: {counts['auto']}")
        print(f"    would PROPOSE:   {counts['proposed']}")
        print(f"    no match:        {counts['none']}")
        print(f"    photos with GPS: {with_gps} / {len(photos)}")
        print(f"    photos missing taken_at (fell back to created_at): {no_taken}\n")

        for k in grand:
            grand[k] += counts[k]

    print("=== TOTAL across users ===")
    print(f"  auto: {grand['auto']}   propose: {grand['proposed']}   none: {grand['none']}")


if __name__ == "__main__":
    main()
