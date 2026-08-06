"""Set Photo.taken_at to the (already-correct-UTC) value that exifr stored
in exif.DateTimeOriginal.

Background: my earlier upload code assumed exifr returned a *naive wall-clock*
Date object and then combined it with OffsetTimeOriginal. In fact exifr already
applies OffsetTimeOriginal when parsing EXIF DateTimeOriginal — its Date
represents the correct UTC instant. My code then applied the offset a SECOND
time, shifting every photo by the offset (~6 hours for MDT).

Because exifr stored the correct value in the exif blob (exif.DateTimeOriginal
is an ISO string with a trailing 'Z' representing correct UTC), we can just
copy that back to taken_at.

Usage:
    python scripts/fix_photo_timestamps.py              # DRY RUN
    python scripts/fix_photo_timestamps.py --apply      # write updates
    python scripts/fix_photo_timestamps.py --apply --user <uid>
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.firestore import init_firebase, get_firestore_client, PHOTOS


def parse_exif_datetime_as_utc(dt_val) -> str | None:
    """Given the exifr-serialized string like '2026-08-04T20:28:22.000Z',
    normalize to '2026-08-04T20:28:22+00:00' (a value Pydantic will accept
    and store round-trippably). Returns None if unparseable."""
    if dt_val is None:
        return None
    s = str(dt_val).replace("Z", "+00:00") if str(dt_val).endswith("Z") else str(dt_val)
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        # Trim fractional seconds if present
        try:
            base = s.split(".")[0]
            dt = datetime.fromisoformat(base + "+00:00" if "+" not in base and "-" not in base[10:] else base)
        except ValueError:
            return None
    if dt.tzinfo is None:
        # exifr always writes a trailing Z; if none, assume UTC
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


async def run(apply: bool, user_filter: str | None):
    init_firebase()
    db = get_firestore_client()

    fixed = 0
    would_fix = 0
    skipped_no_exif = 0
    skipped_same = 0
    total = 0

    async for doc in db.collection(PHOTOS).stream():
        data = doc.to_dict()
        if user_filter and data.get("user_id") != user_filter:
            continue
        total += 1

        exif = data.get("exif") or {}
        source = exif.get("DateTimeOriginal") or exif.get("CreateDate") or exif.get("DateTime")
        new_taken_at = parse_exif_datetime_as_utc(source)
        if not new_taken_at:
            skipped_no_exif += 1
            continue

        current = data.get("taken_at")
        # Normalize current to the same format for comparison
        current_norm = parse_exif_datetime_as_utc(current) if current else None
        if current_norm == new_taken_at:
            skipped_same += 1
            continue

        fn = data.get("original_filename") or "(unnamed)"
        print(f"  {fn}: {current!r}  →  {new_taken_at}")

        if apply:
            await db.collection(PHOTOS).document(doc.id).update({"taken_at": new_taken_at})
            fixed += 1
        else:
            would_fix += 1

    print(f"\nScanned {total} photos.")
    print(f"  {'fixed' if apply else 'would fix'}: {fixed if apply else would_fix}")
    print(f"  skipped (no EXIF DateTimeOriginal): {skipped_no_exif}")
    print(f"  skipped (already correct): {skipped_same}")
    if not apply:
        print("\nDRY RUN — re-run with --apply to write updates.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--user", default=None)
    args = parser.parse_args()
    asyncio.run(run(apply=args.apply, user_filter=args.user))
