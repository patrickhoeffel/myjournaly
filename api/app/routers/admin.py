from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth

from app.models.user import AccountStatus, UserProfile, UserRole
from app.services.auth import require_admin
from app.services.firestore import get_firestore_client, USERS

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserProfile])
async def list_users(
    status: AccountStatus | None = None,
    admin: dict = Depends(require_admin),
):
    db = get_firestore_client()
    query = db.collection(USERS)
    if status:
        query = query.where("account_status", "==", status.value)
    results = []
    async for doc in query.stream():
        results.append(UserProfile.from_firestore(doc.id, doc.to_dict()))
    return results


@router.put("/users/{user_id}/status")
async def set_user_status(
    user_id: str,
    status: AccountStatus,
    admin: dict = Depends(require_admin),
):
    db = get_firestore_client()
    doc_ref = db.collection(USERS).document(user_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    await doc_ref.update({"account_status": status.value})
    return {"user_id": user_id, "account_status": status.value}


@router.put("/users/{user_id}/role")
async def set_user_role(
    user_id: str,
    role: UserRole,
    admin: dict = Depends(require_admin),
):
    db = get_firestore_client()
    doc_ref = db.collection(USERS).document(user_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="User not found")

    # Update Firebase custom claims based on role
    claims = {"admin": role == UserRole.ADMIN, "provider": role == UserRole.PROVIDER}
    auth.set_custom_user_claims(user_id, claims)

    # Update Firestore
    await doc_ref.update({"role": role.value})
    return {"user_id": user_id, "role": role.value}
