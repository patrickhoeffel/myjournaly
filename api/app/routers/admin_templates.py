from fastapi import APIRouter, Depends, HTTPException

from app.models.notebook import ShelfTemplate, NotebookTemplate, TemplateSet
from app.services.auth import get_current_user
from app.services.firestore import (
    get_firestore_client,
    TEMPLATE_SETS,
    SHELF_TEMPLATES,
    NOTEBOOK_TEMPLATES,
)

router = APIRouter(prefix="/admin/templates", tags=["admin-templates"])


def _require_admin(user: dict):
    if not user.get("admin"):
        raise HTTPException(status_code=403, detail="Admin access required")


# --- Template Sets ---


@router.get("/sets", response_model=list[TemplateSet])
async def list_template_sets(user: dict = Depends(get_current_user)):
    """List all template sets."""
    _require_admin(user)
    db = get_firestore_client()
    results = []
    async for doc in db.collection(TEMPLATE_SETS).stream():
        results.append(TemplateSet.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda s: s.name)
    return results


@router.post("/sets", response_model=TemplateSet)
async def create_template_set(ts: TemplateSet, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    data = ts.to_firestore()
    ref = db.collection(TEMPLATE_SETS).document()
    await ref.set(data)
    return TemplateSet.from_firestore(ref.id, data)


@router.put("/sets/{set_id}", response_model=TemplateSet)
async def update_template_set(set_id: str, ts: TemplateSet, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    ref = db.collection(TEMPLATE_SETS).document(set_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Template set not found")
    data = ts.to_firestore()
    await ref.update(data)
    return TemplateSet.from_firestore(set_id, data)


@router.delete("/sets/{set_id}")
async def delete_template_set(set_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()

    # Delete child shelf templates and their notebook templates
    st_query = db.collection(SHELF_TEMPLATES).where("template_set_id", "==", set_id)
    async for st_doc in st_query.stream():
        nb_query = db.collection(NOTEBOOK_TEMPLATES).where("shelf_template_id", "==", st_doc.id)
        async for nb_doc in nb_query.stream():
            await db.collection(NOTEBOOK_TEMPLATES).document(nb_doc.id).delete()
        await db.collection(SHELF_TEMPLATES).document(st_doc.id).delete()

    await db.collection(TEMPLATE_SETS).document(set_id).delete()
    return {"deleted": set_id}


# --- Shelf Templates ---


@router.get("/sets/{set_id}/shelves", response_model=list[ShelfTemplate])
async def list_shelf_templates(set_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    results = []
    query = db.collection(SHELF_TEMPLATES).where("template_set_id", "==", set_id)
    async for doc in query.stream():
        results.append(ShelfTemplate.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda s: (s.order, s.name))
    return results


@router.post("/shelves", response_model=ShelfTemplate)
async def create_shelf_template(st: ShelfTemplate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    data = st.to_firestore()
    ref = db.collection(SHELF_TEMPLATES).document()
    await ref.set(data)
    return ShelfTemplate.from_firestore(ref.id, data)


@router.put("/shelves/{shelf_template_id}", response_model=ShelfTemplate)
async def update_shelf_template(
    shelf_template_id: str, st: ShelfTemplate, user: dict = Depends(get_current_user)
):
    _require_admin(user)
    db = get_firestore_client()
    ref = db.collection(SHELF_TEMPLATES).document(shelf_template_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shelf template not found")
    data = st.to_firestore()
    await ref.update(data)
    return ShelfTemplate.from_firestore(shelf_template_id, data)


@router.delete("/shelves/{shelf_template_id}")
async def delete_shelf_template(shelf_template_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    # Delete child notebook templates
    nb_query = db.collection(NOTEBOOK_TEMPLATES).where("shelf_template_id", "==", shelf_template_id)
    async for nb_doc in nb_query.stream():
        await db.collection(NOTEBOOK_TEMPLATES).document(nb_doc.id).delete()
    await db.collection(SHELF_TEMPLATES).document(shelf_template_id).delete()
    return {"deleted": shelf_template_id}


# --- Notebook Templates ---


@router.get("/shelves/{shelf_template_id}/notebooks", response_model=list[NotebookTemplate])
async def list_notebook_templates(shelf_template_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    results = []
    query = db.collection(NOTEBOOK_TEMPLATES).where("shelf_template_id", "==", shelf_template_id)
    async for doc in query.stream():
        results.append(NotebookTemplate.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda n: (n.order, n.name))
    return results


@router.post("/notebooks", response_model=NotebookTemplate)
async def create_notebook_template(nt: NotebookTemplate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    data = nt.to_firestore()
    ref = db.collection(NOTEBOOK_TEMPLATES).document()
    await ref.set(data)
    return NotebookTemplate.from_firestore(ref.id, data)


@router.put("/notebooks/{notebook_template_id}", response_model=NotebookTemplate)
async def update_notebook_template(
    notebook_template_id: str, nt: NotebookTemplate, user: dict = Depends(get_current_user)
):
    _require_admin(user)
    db = get_firestore_client()
    ref = db.collection(NOTEBOOK_TEMPLATES).document(notebook_template_id)
    doc = await ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Notebook template not found")
    data = nt.to_firestore()
    await ref.update(data)
    return NotebookTemplate.from_firestore(notebook_template_id, data)


@router.delete("/notebooks/{notebook_template_id}")
async def delete_notebook_template(notebook_template_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    db = get_firestore_client()
    await db.collection(NOTEBOOK_TEMPLATES).document(notebook_template_id).delete()
    return {"deleted": notebook_template_id}
