from fastapi import APIRouter, Depends, HTTPException

from app.models.person import Person
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, PEOPLE

router = APIRouter(prefix="/people", tags=["people"])


@router.get("", response_model=list[Person])
async def list_people(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(PEOPLE).where("user_id", "==", user["uid"]).stream():
        results.append(Person.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda p: (p.last_name or "", p.first_name))
    return results


@router.post("", response_model=Person)
async def create_person(p: Person, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    p.user_id = user["uid"]
    data = p.to_firestore()
    doc_ref = db.collection(PEOPLE).document()
    await doc_ref.set(data)
    return Person.from_firestore(doc_ref.id, data)


@router.get("/{person_id}", response_model=Person)
async def get_person(person_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(PEOPLE).document(person_id).get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Person not found")
    return Person.from_firestore(doc.id, doc.to_dict())


@router.put("/{person_id}", response_model=Person)
async def update_person(person_id: str, p: Person, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(PEOPLE).document(person_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Person not found")
    p.user_id = user["uid"]
    data = p.to_firestore()
    await doc_ref.update(data)
    return Person.from_firestore(person_id, data)


@router.delete("/{person_id}")
async def delete_person(person_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(PEOPLE).document(person_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Person not found")
    await doc_ref.delete()
    return {"deleted": person_id}
