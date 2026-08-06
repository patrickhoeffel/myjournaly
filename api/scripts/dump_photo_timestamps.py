"""Dump raw taken_at values straight from Firestore, bypassing Pydantic.
This tells us definitively what's in the DB (vs. what the API is coercing to).

Usage:
    python scripts/dump_photo_timestamps.py [--user <uid>] [--limit 20]
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.firestore import init_firebase, get_firestore_client, PHOTOS


async def dump(user_filter: str | None, limit: int):
    init_firebase()
    db = get_firestore_client()
    n = 0
    async for doc in db.collection(PHOTOS).stream():
        data = doc.to_dict()
        if user_filter and data.get("user_id") != user_filter:
            continue
        exif = data.get("exif") or {}
        print(
            f"{doc.id}  "
            f"taken_at={data.get('taken_at')!r}  "
            f"exif.DateTimeOriginal={exif.get('DateTimeOriginal')!r}  "
            f"exif.OffsetTimeOriginal={exif.get('OffsetTimeOriginal')!r}  "
            f"file={data.get('original_filename')!r}"
        )
        n += 1
        if n >= limit:
            break
    if n == 0:
        print("(no photos found)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", default=None)
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args()
    asyncio.run(dump(args.user, args.limit))
