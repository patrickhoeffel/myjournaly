from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.survey import Survey, SurveySection, SurveyQuestion
from app.services.auth import require_admin
from app.services.firestore import (
    get_firestore_client,
    SURVEYS,
    SURVEY_SECTIONS,
    SURVEY_QUESTIONS,
)

router = APIRouter(prefix="/admin", tags=["admin-surveys"])


# ── Surveys ──


@router.get("/surveys", response_model=list[Survey])
async def list_surveys(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(SURVEYS).stream():
        results.append(Survey.from_firestore(doc.id, doc.to_dict()))
    return results


@router.get("/surveys/{survey_id}", response_model=Survey)
async def get_survey(survey_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc = await db.collection(SURVEYS).document(survey_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Survey not found")
    return Survey.from_firestore(doc.id, doc.to_dict())


@router.post("/surveys", response_model=Survey)
async def create_survey(survey: Survey, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = survey.to_firestore()
    doc_ref = db.collection(SURVEYS).document()
    await doc_ref.set(data)
    return Survey.from_firestore(doc_ref.id, data)


@router.put("/surveys/{survey_id}", response_model=Survey)
async def update_survey(survey_id: str, survey: Survey, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(SURVEYS).document(survey_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Survey not found")
    data = survey.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Survey.from_firestore(survey_id, data)


@router.delete("/surveys/{survey_id}")
async def delete_survey(survey_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(SURVEYS).document(survey_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Survey not found")
    # Cascade delete sections and questions
    async for sec in db.collection(SURVEY_SECTIONS).where("survey_id", "==", survey_id).stream():
        await db.collection(SURVEY_SECTIONS).document(sec.id).delete()
    async for q in db.collection(SURVEY_QUESTIONS).where("survey_id", "==", survey_id).stream():
        await db.collection(SURVEY_QUESTIONS).document(q.id).delete()
    await doc_ref.delete()
    return {"deleted": survey_id}


# ── Sections ──


@router.get("/surveys/{survey_id}/sections", response_model=list[SurveySection])
async def list_sections(survey_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(SURVEY_SECTIONS).where("survey_id", "==", survey_id).stream():
        results.append(SurveySection.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda s: s.order)
    return results


@router.post("/surveys/{survey_id}/sections", response_model=SurveySection)
async def create_section(survey_id: str, section: SurveySection, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    section.survey_id = survey_id
    data = section.to_firestore()
    doc_ref = db.collection(SURVEY_SECTIONS).document()
    await doc_ref.set(data)
    return SurveySection.from_firestore(doc_ref.id, data)


@router.put("/surveys/{survey_id}/sections/{section_id}", response_model=SurveySection)
async def update_section(survey_id: str, section_id: str, section: SurveySection, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(SURVEY_SECTIONS).document(section_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Section not found")
    section.survey_id = survey_id
    data = section.to_firestore()
    await doc_ref.update(data)
    return SurveySection.from_firestore(section_id, data)


@router.delete("/surveys/{survey_id}/sections/{section_id}")
async def delete_section(survey_id: str, section_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(SURVEY_SECTIONS).document(section_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Section not found")
    # Cascade delete questions in this section
    async for q in db.collection(SURVEY_QUESTIONS).where("section_id", "==", section_id).stream():
        await db.collection(SURVEY_QUESTIONS).document(q.id).delete()
    await doc_ref.delete()
    return {"deleted": section_id}


# ── Questions ──


@router.get("/surveys/{survey_id}/questions", response_model=list[SurveyQuestion])
async def list_questions(survey_id: str, section_id: str | None = None, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    query = db.collection(SURVEY_QUESTIONS).where("survey_id", "==", survey_id)
    if section_id:
        query = query.where("section_id", "==", section_id)
    results = []
    async for doc in query.stream():
        results.append(SurveyQuestion.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda q: q.order)
    return results


@router.post("/surveys/{survey_id}/questions", response_model=SurveyQuestion)
async def create_question(survey_id: str, question: SurveyQuestion, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    question.survey_id = survey_id
    data = question.to_firestore()
    doc_ref = db.collection(SURVEY_QUESTIONS).document()
    await doc_ref.set(data)
    return SurveyQuestion.from_firestore(doc_ref.id, data)


@router.put("/surveys/{survey_id}/questions/{question_id}", response_model=SurveyQuestion)
async def update_question(survey_id: str, question_id: str, question: SurveyQuestion, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(SURVEY_QUESTIONS).document(question_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Question not found")
    question.survey_id = survey_id
    data = question.to_firestore()
    await doc_ref.update(data)
    return SurveyQuestion.from_firestore(question_id, data)


@router.delete("/surveys/{survey_id}/questions/{question_id}")
async def delete_question(survey_id: str, question_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(SURVEY_QUESTIONS).document(question_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Question not found")
    await doc_ref.delete()
    return {"deleted": question_id}
