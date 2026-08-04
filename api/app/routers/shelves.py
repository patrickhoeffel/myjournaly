from fastapi import APIRouter, Depends, HTTPException

from app.models.notebook import Shelf, ShelfTemplate, NotebookTemplate, Notebook
from app.services.auth import get_current_user
from app.services.firestore import (
    get_firestore_client,
    SHELVES,
    NOTEBOOKS,
    TEMPLATE_SETS,
    SHELF_TEMPLATES,
    NOTEBOOK_TEMPLATES,
)

router = APIRouter(prefix="/shelves", tags=["shelves"])

GENERAL_SHELF_NAME = "General"
GENERAL_NOTEBOOK_NAME = "General"


async def _ensure_shelves(db, uid: str) -> list[Shelf]:
    """Return user's shelves, creating the default General shelf if none exist."""
    results = []
    query = db.collection(SHELVES).where("user_id", "==", uid)
    async for doc in query.stream():
        results.append(Shelf.from_firestore(doc.id, doc.to_dict()))

    if results:
        results.sort(key=lambda s: (s.order, s.name))
        return results

    # First time: create a General shelf with a General notebook
    shelf = Shelf(user_id=uid, name=GENERAL_SHELF_NAME, order=0, is_default=True)
    shelf_data = shelf.to_firestore()
    shelf_ref = db.collection(SHELVES).document()
    await shelf_ref.set(shelf_data)
    shelf = Shelf.from_firestore(shelf_ref.id, shelf_data)

    nb = Notebook(
        user_id=uid,
        shelf_id=shelf_ref.id,
        name=GENERAL_NOTEBOOK_NAME,
        order=0,
        is_default=True,
    )
    nb_data = nb.to_firestore()
    nb_ref = db.collection(NOTEBOOKS).document()
    await nb_ref.set(nb_data)

    return [shelf]


@router.get("", response_model=list[Shelf])
async def list_shelves(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    return await _ensure_shelves(db, user["uid"])


@router.post("", response_model=Shelf)
async def create_shelf(shelf: Shelf, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    shelf.user_id = user["uid"]
    shelf.is_default = False
    data = shelf.to_firestore()
    ref = db.collection(SHELVES).document()
    await ref.set(data)
    return Shelf.from_firestore(ref.id, data)


@router.put("/{shelf_id}", response_model=Shelf)
async def update_shelf(shelf_id: str, shelf: Shelf, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    ref = db.collection(SHELVES).document(shelf_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shelf not found")
    if doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your shelf")
    shelf.user_id = user["uid"]
    data = shelf.to_firestore()
    await ref.update(data)
    return Shelf.from_firestore(shelf_id, data)


@router.delete("/{shelf_id}")
async def delete_shelf(shelf_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    uid = user["uid"]
    ref = db.collection(SHELVES).document(shelf_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shelf not found")
    existing = doc.to_dict()
    if existing.get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Not your shelf")
    if existing.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete the default shelf")

    # Move orphaned notebooks to the user's default shelf
    default_query = (
        db.collection(SHELVES)
        .where("user_id", "==", uid)
        .where("is_default", "==", True)
    )
    default_shelf_id = None
    async for d in default_query.stream():
        default_shelf_id = d.id
        break

    nb_query = db.collection(NOTEBOOKS).where("shelf_id", "==", shelf_id)
    async for nb_doc in nb_query.stream():
        await db.collection(NOTEBOOKS).document(nb_doc.id).update({"shelf_id": default_shelf_id})

    await ref.delete()
    return {"deleted": shelf_id}


@router.post("/apply-template/{template_set_id}")
async def apply_template(template_set_id: str, user: dict = Depends(get_current_user)):
    """Apply an admin-defined template set, creating shelves and notebooks."""
    db = get_firestore_client()
    uid = user["uid"]

    # Verify template set exists
    ts_ref = db.collection(TEMPLATE_SETS).document(template_set_id)
    ts_doc = await ts_ref.get()
    if not ts_doc.exists:
        raise HTTPException(status_code=404, detail="Template set not found")

    # Get shelf templates in this set
    created_shelves = []
    st_query = db.collection(SHELF_TEMPLATES).where("template_set_id", "==", template_set_id)
    async for st_doc in st_query.stream():
        st = ShelfTemplate.from_firestore(st_doc.id, st_doc.to_dict())

        # Create user shelf
        shelf = Shelf(user_id=uid, name=st.name, icon=st.icon, color=st.color, order=st.order)
        shelf_data = shelf.to_firestore()
        shelf_ref = db.collection(SHELVES).document()
        await shelf_ref.set(shelf_data)

        # Create notebooks for this shelf template
        nb_query = db.collection(NOTEBOOK_TEMPLATES).where("shelf_template_id", "==", st_doc.id)
        async for nb_doc in nb_query.stream():
            nt = NotebookTemplate.from_firestore(nb_doc.id, nb_doc.to_dict())
            nb = Notebook(
                user_id=uid,
                shelf_id=shelf_ref.id,
                name=nt.name,
                icon=nt.icon,
                color=nt.color,
                order=nt.order,
            )
            nb_data = nb.to_firestore()
            nb_ref = db.collection(NOTEBOOKS).document()
            await nb_ref.set(nb_data)

        created_shelves.append(Shelf.from_firestore(shelf_ref.id, shelf_data))

    return {"applied": template_set_id, "shelves_created": len(created_shelves)}
