from fastapi import APIRouter, Depends, HTTPException

from app.models.notebook import Tag
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, TAGS, DEFAULT_TAGS

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[Tag])
async def list_tags(user: dict = Depends(get_current_user)):
    """List user's tags. Copy admin defaults on first access."""
    db = get_firestore_client()
    uid = user["uid"]

    results = []
    query = db.collection(TAGS).where("user_id", "==", uid)
    async for doc in query.stream():
        results.append(Tag.from_firestore(doc.id, doc.to_dict()))

    if results:
        results.sort(key=lambda t: t.name)
        return results

    # First time: copy admin defaults
    async for doc in db.collection(DEFAULT_TAGS).stream():
        data = doc.to_dict()
        tag = Tag(
            user_id=uid,
            name=data["name"],
            color=data.get("color"),
            is_default=True,
        )
        tag_data = tag.to_firestore()
        ref = db.collection(TAGS).document()
        await ref.set(tag_data)
        results.append(Tag.from_firestore(ref.id, tag_data))

    results.sort(key=lambda t: t.name)
    return results


@router.post("", response_model=Tag)
async def create_tag(tag: Tag, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    tag.user_id = user["uid"]
    tag.is_default = False
    data = tag.to_firestore()
    ref = db.collection(TAGS).document()
    await ref.set(data)
    return Tag.from_firestore(ref.id, data)


@router.put("/{tag_id}", response_model=Tag)
async def update_tag(tag_id: str, tag: Tag, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    ref = db.collection(TAGS).document(tag_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Tag not found")
    if doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your tag")
    tag.user_id = user["uid"]
    data = tag.to_firestore()
    await ref.update(data)
    return Tag.from_firestore(tag_id, data)


@router.delete("/{tag_id}")
async def delete_tag(tag_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    ref = db.collection(TAGS).document(tag_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Tag not found")
    if doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your tag")
    await ref.delete()
    return {"deleted": tag_id}
