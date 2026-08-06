import hashlib
import json
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from firebase_admin import storage as fb_storage

from app.models.photo import Photo, _to_utc_aware
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, PHOTOS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/photos", tags=["photos"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"}
MAX_SIZE = 20 * 1024 * 1024  # 20MB — photos from modern phones can be sizeable


def _get_bucket():
    return fb_storage.bucket()


def _parse_iso(dt_str: str | None) -> datetime | None:
    """Parse an ISO string and normalize to UTC-aware. Matches the Photo model validator."""
    return _to_utc_aware(dt_str)


@router.post("", response_model=Photo)
async def upload_photo(
    file: UploadFile = File(...),
    taken_at: str | None = Form(default=None),
    gps_lat: float | None = Form(default=None),
    gps_lng: float | None = Form(default=None),
    gps_altitude: float | None = Form(default=None),
    width: int | None = Form(default=None),
    height: int | None = Form(default=None),
    original_filename: str | None = Form(default=None),
    exif_json: str | None = Form(default=None),
    user: dict = Depends(get_current_user),
):
    """Upload a photo, storing bytes to Firebase Storage and metadata to Firestore.

    EXIF is extracted client-side and passed alongside the file; the server
    trusts the metadata (client is signed-in as the user, so no reason to
    re-parse). `taken_at` should be an ISO-8601 string.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    user_id = user["uid"]
    sha256_hash = hashlib.sha256(contents).hexdigest()

    # Dedup: if this user already has a photo with the same content hash, return it.
    db = get_firestore_client()
    dupe_q = (
        db.collection(PHOTOS)
        .where("user_id", "==", user_id)
        .where("sha256_hash", "==", sha256_hash)
        .limit(1)
    )
    async for doc in dupe_q.stream():
        return Photo.from_firestore(doc.id, doc.to_dict())

    ext = (
        file.filename.rsplit(".", 1)[-1].lower()
        if file.filename and "." in file.filename
        else (file.content_type or "image/jpeg").rsplit("/", 1)[-1]
    )
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = f"users/{user_id}/photos/{filename}"

    bucket = _get_bucket()
    blob = bucket.blob(path)
    blob.upload_from_string(contents, content_type=file.content_type)
    # Bucket uses uniform bucket-level access; per-object ACLs are disallowed.
    # Rely on bucket-level IAM (allUsers → Storage Object Viewer) and just
    # construct the canonical public URL.
    public_url = f"https://storage.googleapis.com/{bucket.name}/{path}"

    exif_blob: dict | None = None
    if exif_json:
        try:
            exif_blob = json.loads(exif_json)
        except (ValueError, TypeError):
            exif_blob = None

    photo = Photo(
        user_id=user_id,
        storage_path=path,
        url=public_url,
        thumbnail_url=None,
        original_filename=original_filename or file.filename,
        mime_type=file.content_type or "image/jpeg",
        size_bytes=len(contents),
        width=width,
        height=height,
        taken_at=_parse_iso(taken_at),
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        gps_altitude=gps_altitude,
        exif=exif_blob,
        sha256_hash=sha256_hash,
    )

    data = photo.to_firestore()
    doc_ref = db.collection(PHOTOS).document()
    await doc_ref.set(data)
    return Photo.from_firestore(doc_ref.id, data)


@router.get("", response_model=list[Photo])
async def list_photos(
    from_time: str | None = Query(default=None, alias="from"),
    to_time: str | None = Query(default=None, alias="to"),
    limit: int = Query(default=500, ge=1, le=2000),
    user: dict = Depends(get_current_user),
):
    """List the user's photos, optionally within [from, to] (ISO-8601, on taken_at)."""
    db = get_firestore_client()
    query = db.collection(PHOTOS).where("user_id", "==", user["uid"])

    from_dt = _parse_iso(from_time)
    to_dt = _parse_iso(to_time)

    results: list[Photo] = []
    async for doc in query.stream():
        p = Photo.from_firestore(doc.id, doc.to_dict())
        # Photos without taken_at fall back to created_at for filtering
        ref = p.taken_at or p.created_at
        if from_dt and ref < from_dt:
            continue
        if to_dt and ref > to_dt:
            continue
        results.append(p)
        if len(results) >= limit:
            break

    results.sort(key=lambda p: (p.taken_at or p.created_at))
    return results


@router.get("/{photo_id}", response_model=Photo)
async def get_photo(photo_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(PHOTOS).document(photo_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Photo not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your photo")
    return Photo.from_firestore(doc.id, data)


@router.put("/{photo_id}", response_model=Photo)
async def update_photo(photo_id: str, updates: dict, user: dict = Depends(get_current_user)):
    """Update a photo's user-editable fields (caption, taken_at, gps)."""
    db = get_firestore_client()
    doc_ref = db.collection(PHOTOS).document(photo_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Photo not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your photo")

    allowed = {"caption", "taken_at", "gps_lat", "gps_lng", "gps_altitude"}
    sanitized = {k: v for k, v in updates.items() if k in allowed}
    if not sanitized:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    sanitized["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(sanitized)
    return Photo.from_firestore(photo_id, {**data, **sanitized})


@router.delete("/{photo_id}")
async def delete_photo(photo_id: str, user: dict = Depends(get_current_user)):
    """Delete a photo — both the Firestore record and the underlying blob."""
    db = get_firestore_client()
    doc_ref = db.collection(PHOTOS).document(photo_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Photo not found")
    data = doc.to_dict()
    if data.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your photo")

    storage_path = data.get("storage_path")
    if storage_path:
        try:
            bucket = _get_bucket()
            blob = bucket.blob(storage_path)
            if blob.exists():
                blob.delete()
        except Exception as e:
            logger.warning("Failed to delete blob %s: %s", storage_path, e)

    await doc_ref.delete()
    return {"deleted": photo_id}
