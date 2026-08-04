from fastapi import APIRouter, Depends, HTTPException

from app.models.notebook import Notebook
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, NOTEBOOKS, SHELVES, JOURNAL_ENTRIES

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


@router.get("", response_model=list[Notebook])
async def list_notebooks(
    shelf_id: str | None = None,
    user: dict = Depends(get_current_user),
):
    """List notebooks, optionally filtered by shelf."""
    db = get_firestore_client()
    uid = user["uid"]
    query = db.collection(NOTEBOOKS).where("user_id", "==", uid)
    if shelf_id:
        query = query.where("shelf_id", "==", shelf_id)

    results = []
    async for doc in query.stream():
        results.append(Notebook.from_firestore(doc.id, doc.to_dict()))

    results.sort(key=lambda n: (n.order, n.name))
    return results


@router.post("", response_model=Notebook)
async def create_notebook(notebook: Notebook, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    uid = user["uid"]

    # Verify shelf belongs to user
    shelf_ref = db.collection(SHELVES).document(notebook.shelf_id)
    shelf_doc = await shelf_ref.get()
    if not shelf_doc.exists or shelf_doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=400, detail="Invalid shelf")

    notebook.user_id = uid
    notebook.is_default = False
    data = notebook.to_firestore()
    ref = db.collection(NOTEBOOKS).document()
    await ref.set(data)
    return Notebook.from_firestore(ref.id, data)


@router.put("/{notebook_id}", response_model=Notebook)
async def update_notebook(
    notebook_id: str,
    notebook: Notebook,
    user: dict = Depends(get_current_user),
):
    db = get_firestore_client()
    uid = user["uid"]
    ref = db.collection(NOTEBOOKS).document(notebook_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Not your notebook")

    # Verify new shelf belongs to user (in case of move)
    shelf_ref = db.collection(SHELVES).document(notebook.shelf_id)
    shelf_doc = await shelf_ref.get()
    if not shelf_doc.exists or shelf_doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=400, detail="Invalid shelf")

    notebook.user_id = uid
    data = notebook.to_firestore()
    await ref.update(data)
    return Notebook.from_firestore(notebook_id, data)


@router.delete("/{notebook_id}")
async def delete_notebook(notebook_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    uid = user["uid"]
    ref = db.collection(NOTEBOOKS).document(notebook_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Notebook not found")
    existing = doc.to_dict()
    if existing.get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Not your notebook")
    if existing.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete the default notebook")

    # Move orphaned entries to the default notebook in same shelf
    default_query = (
        db.collection(NOTEBOOKS)
        .where("user_id", "==", uid)
        .where("is_default", "==", True)
    )
    default_nb_id = None
    async for d in default_query.stream():
        default_nb_id = d.id
        break

    entry_query = db.collection(JOURNAL_ENTRIES).where("notebook_id", "==", notebook_id)
    async for entry_doc in entry_query.stream():
        await db.collection(JOURNAL_ENTRIES).document(entry_doc.id).update(
            {"notebook_id": default_nb_id}
        )

    await ref.delete()
    return {"deleted": notebook_id}
