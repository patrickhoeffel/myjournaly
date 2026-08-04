from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.models.user import UserProfile
from app.models.user_data import UserData
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, USERS

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/me", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
async def create_profile(profile: UserProfile, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    profile.firebase_uid = user["uid"]
    profile.email = user.get("email", profile.email)
    doc_ref = db.collection(USERS).document(user["uid"])
    existing = await doc_ref.get()
    if existing.exists:
        raise HTTPException(status_code=409, detail="Profile already exists")
    await doc_ref.set(profile.to_firestore())
    return UserProfile.from_firestore(user["uid"], profile.to_firestore())


@router.get("/me", response_model=UserProfile)
async def get_profile(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(USERS).document(user["uid"]).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")
    return UserProfile.from_firestore(doc.id, doc.to_dict())


@router.put("/me", response_model=UserProfile)
async def update_profile(updates: dict, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(USERS).document(user["uid"])
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")
    await doc_ref.update(updates)
    updated = await doc_ref.get()
    return UserProfile.from_firestore(updated.id, updated.to_dict())


DATA_SUBCOLLECTION = "data"


def _data_collection(db, uid: str):
    return db.collection(USERS).document(uid).collection(DATA_SUBCOLLECTION)


@router.get("/me/data", response_model=list[UserData])
async def list_user_data(
    category: str | None = None,
    user: dict = Depends(get_current_user),
):
    db = get_firestore_client()
    query = _data_collection(db, user["uid"])
    if category:
        query = query.where("category", "==", category)
    results = []
    async for doc in query.stream():
        results.append(UserData.from_firestore(doc.id, doc.to_dict()))
    return results


@router.get("/me/data/{category}/{key}", response_model=UserData)
async def get_user_data(category: str, key: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    query = _data_collection(db, user["uid"]).where("category", "==", category).where("key", "==", key)
    async for doc in query.stream():
        return UserData.from_firestore(doc.id, doc.to_dict())
    raise HTTPException(status_code=404, detail="Not found")


class SetUserDataRequest(BaseModel):
    value: str


@router.put("/me/data/{category}/{key}", response_model=UserData)
async def set_user_data(
    category: str,
    key: str,
    body: SetUserDataRequest,
    user: dict = Depends(get_current_user),
):
    db = get_firestore_client()
    coll = _data_collection(db, user["uid"])

    # Upsert: find existing doc or create new
    existing_doc = None
    query = coll.where("category", "==", category).where("key", "==", key)
    async for doc in query.stream():
        existing_doc = doc
        break

    now = datetime.utcnow().isoformat()
    if existing_doc:
        await coll.document(existing_doc.id).update({"value": body.value, "updated_at": now})
        updated = await coll.document(existing_doc.id).get()
        return UserData.from_firestore(updated.id, updated.to_dict())
    else:
        data = UserData(category=category, key=key, value=body.value)
        doc_ref = coll.document()
        await doc_ref.set(data.to_firestore())
        return UserData.from_firestore(doc_ref.id, data.to_firestore())
