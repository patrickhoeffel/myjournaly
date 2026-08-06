"""Delete a user's Photo records + the underlying Storage blobs.

Use this to start clean — e.g. after fixing a bug in metadata extraction and
wanting to re-upload with the corrected pipeline.

Usage:
    python scripts/wipe_photos.py --user <uid>            # DRY RUN for one user
    python scripts/wipe_photos.py --user <uid> --apply    # actually delete
    python scripts/wipe_photos.py --apply                 # DANGER: wipes ALL users' photos
"""
import argparse
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from firebase_admin import storage as fb_storage

from app.services.firestore import init_firebase, get_firestore_client, PHOTOS

logger = logging.getLogger(__name__)


async def wipe(apply: bool, user_filter: str | None):
    init_firebase()
    db = get_firestore_client()
    bucket = fb_storage.bucket()

    if not user_filter and apply:
        confirm = input("You are about to wipe ALL photos for ALL users. Type 'WIPE ALL' to confirm: ")
        if confirm.strip() != "WIPE ALL":
            print("Aborted.")
            return

    to_delete: list[tuple[str, dict]] = []
    async for doc in db.collection(PHOTOS).stream():
        data = doc.to_dict()
        if user_filter and data.get("user_id") != user_filter:
            continue
        to_delete.append((doc.id, data))

    print(f"Found {len(to_delete)} photos" + (f" for user {user_filter}" if user_filter else ""))
    for doc_id, data in to_delete:
        fn = data.get("original_filename") or "(unnamed)"
        print(f"  {'DELETE' if apply else 'would delete'}  {doc_id}  {fn}  path={data.get('storage_path')}")

    if not to_delete:
        return
    if not apply:
        print("\nDRY RUN — nothing deleted. Re-run with --apply to remove them.")
        return

    print("\nDeleting…")
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
    print(f"\nDone. Removed {len(to_delete)} photos.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--user", default=None, help="Restrict to a single user_id.")
    args = parser.parse_args()
    asyncio.run(wipe(apply=args.apply, user_filter=args.user))
