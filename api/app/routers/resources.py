from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from app.models.resource import Resource, ResourceAccess
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, RESOURCES, RESOURCE_ACCESS

router = APIRouter(prefix="/resources", tags=["resources"])


async def _get_accessible_resource_ids(user_id: str) -> tuple[set[str], set[str]]:
    """Return (direct_resource_ids, group_ids) the user currently has access to."""
    db = get_firestore_client()
    today = date.today().isoformat()
    resource_ids: set[str] = set()
    group_ids: set[str] = set()

    query = db.collection(RESOURCE_ACCESS).where("user_id", "==", user_id)
    async for doc in query.stream():
        grant = doc.to_dict()
        # Skip revoked grants
        if grant.get("revoked_at"):
            continue
        # Check date range
        if grant.get("begin_date") and grant["begin_date"] > today:
            continue
        if grant.get("end_date") and grant["end_date"] < today:
            continue
        if grant.get("resource_id"):
            resource_ids.add(grant["resource_id"])
        if grant.get("group_id"):
            group_ids.add(grant["group_id"])

    return resource_ids, group_ids


@router.get("", response_model=list[Resource])
async def list_my_resources(
    resource_type: str | None = None,
    tag: str | None = None,
    user: dict = Depends(get_current_user),
):
    """List resources the current user has access to."""
    resource_ids, group_ids = await _get_accessible_resource_ids(user["uid"])

    if not resource_ids and not group_ids:
        return []

    db = get_firestore_client()
    results = []
    # Fetch all active resources and filter by access
    async for doc in db.collection(RESOURCES).where("is_active", "==", True).stream():
        r = Resource.from_firestore(doc.id, doc.to_dict())
        # Check direct access or group membership
        has_access = (
            r.id in resource_ids
            or any(gid in group_ids for gid in r.group_ids)
        )
        if not has_access:
            continue
        if resource_type and r.resource_type.value != resource_type:
            continue
        if tag and tag not in r.tags:
            continue
        results.append(r)
    return results


@router.get("/{resource_id}", response_model=Resource)
async def get_resource(resource_id: str, user: dict = Depends(get_current_user)):
    resource_ids, group_ids = await _get_accessible_resource_ids(user["uid"])

    db = get_firestore_client()
    doc = await db.collection(RESOURCES).document(resource_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Resource not found")

    r = Resource.from_firestore(doc.id, doc.to_dict())
    has_access = (
        r.id in resource_ids
        or any(gid in group_ids for gid in r.group_ids)
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to this resource")
    return r
