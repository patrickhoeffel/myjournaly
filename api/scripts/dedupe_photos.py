"""Find and delete duplicate Photo records + their Storage blobs.

Duplication heuristic: same (user_id, original_filename, size_bytes, taken_at).
For each duplicate group, keeps the OLDEST record (earliest created_at) and
deletes the rest — both the Firestore doc and the underlying blob.

Also backfills sha256_hash for kept photos where it's missing (by downloading
the blob and hashing) so future dedup on upload catches re-uploads.

Runs against whatever Firestore project your ADC points to.

Usage:
    python scripts/dedupe_photos.py          # DRY RUN — reports what would be deleted
    python scripts/dedupe_photos.py --apply  # actually delete
    python scripts/dedupe_photos.py --apply --user <uid>   # limit to one user
"""
import argparse
import asyncio
import hashlib
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from firebase_admin import storage as fb_storage

from app.services.firestore import init_firebase, get_firestore_client, PHOTOS


def dupe_key(data: dict) -> tuple:
    """Duplication key: same file uploaded twice will match on all four."""
    return (
        data.get("user_id", ""),
        data.get("original_filename") or "",
        data.get("size_bytes") or 0,
        data.get("taken_at") or "",
    )


async def dedupe(apply: bool, user_filter: str | None):
    init_firebase()
    db = get_firestore_client()
    bucket = fb_storage.bucket()

    photos: list[tuple[str, dict]] = []
    async for doc in db.collection(PHOTOS).stream():
        data = doc.to_dict()
        if user_filter and data.get("user_id") != user_filter:
            continue
        photos.append((doc.id, data))

    print(f"Scanned {len(photos)} photos" + (f" for user {user_filter}" if user_filter else ""))

    # Group by dupe key
    groups: dict[tuple, list[tuple[str, dict]]] = defaultdict(list)
    for doc_id, data in photos:
        groups[dupe_key(data)].append((doc_id, data))

    to_delete: list[tuple[str, dict]] = []
    keepers: list[tuple[str, dict]] = []
    for key, items in groups.items():
        if len(items) < 2:
            keepers.append(items[0])
            continue
        # Sort by created_at ascending (oldest first)
        items.sort(key=lambda pair: pair[1].get("created_at", ""))
        keeper = items[0]
        losers = items[1:]
        keepers.append(keeper)
        to_delete.extend(losers)
        fn = key[1] or "(unnamed)"
        print(f"  DUPES x{len(items)}  {fn}  size={key[2]}  taken_at={key[3]}")
        print(f"    KEEP   {keeper[0]}  (created {keeper[1].get('created_at')})")
        for loser_id, loser_data in losers:
            print(f"    DELETE {loser_id}  (created {loser_data.get('created_at')})  storage_path={loser_data.get('storage_path')}")

    print(f"\nSummary: {len(keepers)} keepers, {len(to_delete)} duplicates to delete.")

    # Backfill sha256_hash on keepers that are missing it (helps future dedup).
    missing_hash = [(doc_id, data) for doc_id, data in keepers if not data.get("sha256_hash") and data.get("storage_path")]
    if missing_hash:
        print(f"\nBackfilling sha256_hash on {len(missing_hash)} keepers…")
        for doc_id, data in missing_hash:
            path = data["storage_path"]
            try:
                blob = bucket.blob(path)
                contents = blob.download_as_bytes()
                h = hashlib.sha256(contents).hexdigest()
                if apply:
                    await db.collection(PHOTOS).document(doc_id).update({"sha256_hash": h})
                print(f"  {'set' if apply else 'would set'} sha256_hash={h[:12]}… on {doc_id} ({path})")
            except Exception as e:
                print(f"  ! failed for {doc_id}: {e}")

    if not to_delete:
        print("\nNo duplicates found. Done.")
        return

    if not apply:
        print("\nDRY RUN — nothing deleted. Re-run with --apply to remove the duplicates.")
        return

    # Delete
    print("\nDeleting duplicates…")
    for doc_id, data in to_delete:
        path = data.get("storage_path")
        if path:
            try:
                blob = bucket.blob(path)
                if blob.exists():
                    blob.delete()
            except Exception as e:
                print(f"  ! blob delete failed for {path}: {e}")
        try:
            await db.collection(PHOTOS).document(doc_id).delete()
        except Exception as e:
            print(f"  ! doc delete failed for {doc_id}: {e}")
        print(f"  deleted {doc_id}")

    print(f"\nDone. Removed {len(to_delete)} duplicate photos.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually delete duplicates (default: dry run).")
    parser.add_argument("--user", default=None, help="Restrict to a single user_id.")
    args = parser.parse_args()
    asyncio.run(dedupe(apply=args.apply, user_filter=args.user))
