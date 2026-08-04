from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.resource import AccessLevel, Resource, ResourceAccess, ResourceGroup
from app.services.auth import require_admin
from app.services.firestore import (
    get_firestore_client,
    RESOURCES,
    RESOURCE_ACCESS,
    RESOURCE_GROUPS,
)

router = APIRouter(prefix="/admin", tags=["admin-resources"])


# ── Resources ──


@router.get("/resources", response_model=list[Resource])
async def list_resources(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(RESOURCES).stream():
        results.append(Resource.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/resources", response_model=Resource)
async def create_resource(resource: Resource, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = resource.to_firestore()
    doc_ref = db.collection(RESOURCES).document()
    await doc_ref.set(data)
    return Resource.from_firestore(doc_ref.id, data)


@router.put("/resources/{resource_id}", response_model=Resource)
async def update_resource(resource_id: str, resource: Resource, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(RESOURCES).document(resource_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Resource not found")
    data = resource.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Resource.from_firestore(resource_id, data)


@router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(RESOURCES).document(resource_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Resource not found")
    await doc_ref.delete()
    return {"deleted": resource_id}


# ── Resource Groups ──


@router.get("/resource-groups", response_model=list[ResourceGroup])
async def list_resource_groups(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(RESOURCE_GROUPS).stream():
        results.append(ResourceGroup.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/resource-groups", response_model=ResourceGroup)
async def create_resource_group(group: ResourceGroup, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = group.to_firestore()
    doc_ref = db.collection(RESOURCE_GROUPS).document()
    await doc_ref.set(data)
    return ResourceGroup.from_firestore(doc_ref.id, data)


@router.put("/resource-groups/{group_id}", response_model=ResourceGroup)
async def update_resource_group(group_id: str, group: ResourceGroup, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(RESOURCE_GROUPS).document(group_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Resource group not found")
    data = group.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return ResourceGroup.from_firestore(group_id, data)


@router.delete("/resource-groups/{group_id}")
async def delete_resource_group(group_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(RESOURCE_GROUPS).document(group_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Resource group not found")
    await doc_ref.delete()
    return {"deleted": group_id}


# ── Resource Access Grants ──


class GrantAccessRequest(BaseModel):
    user_id: str
    resource_id: str | None = None
    group_id: str | None = None
    access_level: AccessLevel = AccessLevel.VIEW
    begin_date: date
    end_date: date | None = None
    justification: str | None = None


@router.get("/resource-access", response_model=list[ResourceAccess])
async def list_access_grants(
    user_id: str | None = None,
    admin: dict = Depends(require_admin),
):
    db = get_firestore_client()
    query = db.collection(RESOURCE_ACCESS)
    if user_id:
        query = query.where("user_id", "==", user_id)
    results = []
    async for doc in query.stream():
        results.append(ResourceAccess.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/resource-access", response_model=ResourceAccess)
async def grant_access(req: GrantAccessRequest, admin: dict = Depends(require_admin)):
    if not req.resource_id and not req.group_id:
        raise HTTPException(status_code=400, detail="Must specify resource_id or group_id")
    db = get_firestore_client()
    grant = ResourceAccess(
        user_id=req.user_id,
        resource_id=req.resource_id,
        group_id=req.group_id,
        access_level=req.access_level,
        begin_date=req.begin_date,
        end_date=req.end_date,
        granted_by=admin["uid"],
        grant_justification=req.justification,
    )
    doc_ref = db.collection(RESOURCE_ACCESS).document()
    await doc_ref.set(grant.to_firestore())
    return ResourceAccess.from_firestore(doc_ref.id, grant.to_firestore())


class RevokeAccessRequest(BaseModel):
    reason: str | None = None


@router.put("/resource-access/{grant_id}/revoke")
async def revoke_access(grant_id: str, req: RevokeAccessRequest, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(RESOURCE_ACCESS).document(grant_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Access grant not found")
    now = datetime.utcnow().isoformat()
    await doc_ref.update({
        "revoked_at": now,
        "revoked_by": admin["uid"],
        "revoke_reason": req.reason,
    })
    updated = await doc_ref.get()
    return ResourceAccess.from_firestore(updated.id, updated.to_dict())
