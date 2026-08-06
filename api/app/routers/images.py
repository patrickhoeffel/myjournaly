import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from firebase_admin import storage as fb_storage

from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, USERS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/images", tags=["images"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_SIZE = 5 * 1024 * 1024  # 5MB


def _get_bucket():
    return fb_storage.bucket()


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: str = Form(default=""),
    user: dict = Depends(get_current_user),
):
    """Upload an image to Firebase Storage and return the public URL.

    entity_type: profile | event | person | journal | timeline_event
    entity_id: optional, the ID of the entity to associate the image with
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    user_id = user["uid"]
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = f"users/{user_id}/{entity_type}/{filename}"

    bucket = _get_bucket()
    blob = bucket.blob(path)
    blob.upload_from_string(contents, content_type=file.content_type)
    # Bucket uses uniform bucket-level access; per-object ACLs are disallowed.
    # Rely on bucket-level IAM (allUsers → Storage Object Viewer) and just
    # construct the canonical public URL.
    public_url = f"https://storage.googleapis.com/{bucket.name}/{path}"

    # If entity_type is 'profile', update the user's photo_url in Firestore
    if entity_type == "profile":
        db = get_firestore_client()
        await db.collection(USERS).document(user_id).update({"photo_url": public_url})

    return {
        "url": public_url,
        "path": path,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }


@router.delete("")
async def delete_image(
    path: str,
    user: dict = Depends(get_current_user),
):
    """Delete an image from Firebase Storage. Path must belong to the user."""
    user_id = user["uid"]
    if not path.startswith(f"users/{user_id}/"):
        raise HTTPException(status_code=403, detail="Cannot delete another user's image")

    bucket = _get_bucket()
    blob = bucket.blob(path)
    if blob.exists():
        blob.delete()

    return {"status": "deleted", "path": path}
