"""Backfill photo → event association links for EXISTING photos.

Phase 1 wires the engine to run on upload and on event-save, but photos already
in the library won't get links until something touches them. This script runs
the same planner across everything once.

SAFE BY DEFAULT: with no flag it only PREVIEWS (writes nothing). Pass --commit to
actually create the links. It is idempotent — it skips any (photo, event) pair
that already has a link in either direction and at any status, so re-running is
harmless and it never resurrects a removed or rejected link.

Usage:
    uv run python scripts/backfill_associations.py [USER_ID]            # preview
    uv run python scripts/backfill_associations.py [USER_ID] --commit   # write

Pinned to the my-journaly project (same as the dry run) regardless of ambient
gcloud/ADC config.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import google.auth
from google.cloud import firestore

from app.config import settings
from app.services.association_engine import (
    event_span_from_doc,
    photo_name_from_doc,
    photo_point_from_doc,
    plan_links_for_photo,
)


def _short(s: str, n: int = 8) -> str:
    return (s or "")[:n]


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--commit"]
    commit = "--commit" in sys.argv
    target_user = args[0] if args else None

    project_id = settings.project_id or "my-journaly"
    creds, _ = google.auth.default()
    if hasattr(creds, "with_quota_project"):
        creds = creds.with_quota_project(project_id)
    db = firestore.Client(project=project_id, credentials=creds)

    mode = "COMMIT (writing links)" if commit else "PREVIEW (no writes)"
    print("=== Photo → Event association BACKFILL ===")
    print(f"Firestore project: {db.project}")
    print(f"Mode: {mode}\n")

    # Events grouped by user.
    events_by_user: dict[str, list] = {}
    for doc in db.collection("events").stream():
        d = doc.to_dict()
        uid = d.get("user_id", "")
        if target_user and uid != target_user:
            continue
        events_by_user.setdefault(uid, []).append(event_span_from_doc(doc.id, d))

    # Existing links → per-entity "other side" ids (any direction, any status,
    # incl. soft-deleted). This is the idempotency + intent gate.
    linked: dict[str, set[str]] = {}
    for doc in db.collection("links").stream():
        d = doc.to_dict()
        uid = d.get("user_id", "")
        if target_user and uid != target_user:
            continue
        a, b = d.get("from_id"), d.get("to_id")
        if a and b:
            linked.setdefault(a, set()).add(b)
            linked.setdefault(b, set()).add(a)

    grand_auto = grand_proposed = grand_skipped = 0

    # Photos grouped by user.
    photos_by_user: dict[str, list] = {}
    for doc in db.collection("photos").stream():
        d = doc.to_dict()
        uid = d.get("user_id", "")
        if target_user and uid != target_user:
            continue
        photos_by_user.setdefault(uid, []).append((doc.id, d))

    for uid in sorted(photos_by_user):
        events = events_by_user.get(uid, [])
        photos = photos_by_user.get(uid, [])
        print(f"User {uid}:  photos: {len(photos)}   events: {len(events)}")
        if not events:
            print("  (no events — nothing to link)\n")
            continue

        u_auto = u_proposed = u_skipped = 0
        for photo_id, pdata in photos:
            photo = photo_point_from_doc(photo_id, pdata)
            already = linked.get(photo_id, set())
            plan = plan_links_for_photo(uid, photo, photo_name_from_doc(pdata), events, already)
            if not plan:
                if photo.taken_at is not None and already:
                    u_skipped += 1
                continue
            for link in plan:
                verb = "would link" if not commit else "linked"
                print(f"  {_short(photo_id):10} {link.status.value:9} "
                      f"{link.link_strength:.2f}  {verb} → {link.to_name}")
                if link.status.value == "auto":
                    u_auto += 1
                else:
                    u_proposed += 1
                if commit:
                    db.collection("links").document().set(link.to_firestore())

        print(f"  → auto: {u_auto}   proposed: {u_proposed}   "
              f"skipped (already linked): {u_skipped}\n")
        grand_auto += u_auto
        grand_proposed += u_proposed
        grand_skipped += u_skipped

    verb = "created" if commit else "would create"
    print("=== TOTAL ===")
    print(f"  {verb}: {grand_auto} auto + {grand_proposed} proposed"
          f"   (skipped {grand_skipped} already-linked)")
    if not commit:
        print("\nRe-run with --commit to write these links.")


if __name__ == "__main__":
    main()
