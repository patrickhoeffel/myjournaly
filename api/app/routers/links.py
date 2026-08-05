from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.link import Link, LinkEntityType
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, LINKS

router = APIRouter(prefix="/links", tags=["links"])


@router.post("", response_model=Link, status_code=status.HTTP_201_CREATED)
async def create_link(link: Link, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    link.user_id = user["uid"]
    link.created_at = datetime.utcnow()
    link.modified_at = datetime.utcnow()
    doc_ref = db.collection(LINKS).document()
    await doc_ref.set(link.to_firestore())
    return Link.from_firestore(doc_ref.id, link.to_firestore())


@router.get("", response_model=list[Link])
async def list_links(
    from_id: str | None = Query(None),
    to_id: str | None = Query(None),
    entity_id: str | None = Query(None),
    from_type: LinkEntityType | None = Query(None),
    to_type: LinkEntityType | None = Query(None),
    user: dict = Depends(get_current_user),
):
    if entity_id and (from_id or to_id):
        raise HTTPException(
            status_code=400,
            detail="entity_id cannot be combined with from_id or to_id",
        )

    db = get_firestore_client()
    base = db.collection(LINKS).where("user_id", "==", user["uid"]).where("deleted_at", "==", None)

    if entity_id:
        # Bidirectional: run two queries and merge
        q_from = base.where("from_id", "==", entity_id)
        q_to = base.where("to_id", "==", entity_id)
        seen = set()
        results = []
        for q in (q_from, q_to):
            async for doc in q.stream():
                if doc.id not in seen:
                    seen.add(doc.id)
                    results.append(Link.from_firestore(doc.id, doc.to_dict()))
        return results

    query = base
    if from_id:
        query = query.where("from_id", "==", from_id)
    if to_id:
        query = query.where("to_id", "==", to_id)
    if from_type:
        query = query.where("from_type", "==", from_type.value)
    if to_type:
        query = query.where("to_type", "==", to_type.value)
    results = []
    async for doc in query.stream():
        results.append(Link.from_firestore(doc.id, doc.to_dict()))
    return results


@router.put("/{link_id}", response_model=Link)
async def update_link(link_id: str, updates: dict, user: dict = Depends(get_current_user)):
    """Update mutable fields on a link (e.g., link_strength)."""
    db = get_firestore_client()
    doc_ref = db.collection(LINKS).document(link_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Link not found")
    # Restrict to safe-to-mutate fields
    allowed = {"link_strength", "link_description", "link_source", "link_source_confidence", "link_type", "status"}
    sanitized = {k: v for k, v in updates.items() if k in allowed}
    if not sanitized:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    sanitized["modified_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(sanitized)
    merged = {**doc.to_dict(), **sanitized}
    return Link.from_firestore(link_id, merged)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(link_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(LINKS).document(link_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Link not found")
    await doc_ref.update({
        "deleted_at": datetime.utcnow().isoformat(),
        "modified_at": datetime.utcnow().isoformat(),
    })
