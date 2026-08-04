import json
import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.survey import (
    Survey,
    SurveyAnswer,
    SurveyQuestion,
    SurveyResponse,
    SurveySection,
)
from app.services.auth import get_current_user
from app.services.firestore import (
    get_firestore_client,
    SURVEYS,
    SURVEY_ANSWERS,
    SURVEY_QUESTIONS,
    SURVEY_RESPONSES,
    SURVEY_SECTIONS,
)

router = APIRouter(prefix="/surveys", tags=["surveys"])


@router.get("/{survey_id}")
async def get_survey_for_user(survey_id: str, user: dict = Depends(get_current_user)):
    """Get a survey with its sections and questions, ready for the user to take."""
    db = get_firestore_client()

    survey_doc = await db.collection(SURVEYS).document(survey_id).get()
    if not survey_doc.exists:
        raise HTTPException(status_code=404, detail="Survey not found")
    survey = Survey.from_firestore(survey_doc.id, survey_doc.to_dict())
    if not survey.is_active:
        raise HTTPException(status_code=404, detail="Survey not available")

    # Load sections
    sections: list[SurveySection] = []
    async for doc in db.collection(SURVEY_SECTIONS).where("survey_id", "==", survey_id).stream():
        sections.append(SurveySection.from_firestore(doc.id, doc.to_dict()))
    sections.sort(key=lambda s: s.order)

    # Load questions
    questions: list[SurveyQuestion] = []
    async for doc in db.collection(SURVEY_QUESTIONS).where("survey_id", "==", survey_id).stream():
        questions.append(SurveyQuestion.from_firestore(doc.id, doc.to_dict()))
    questions.sort(key=lambda q: q.order)

    # Apply randomization
    if survey.randomize_sections:
        random.shuffle(sections)
    if survey.randomize_questions:
        # Randomize within each section
        by_section: dict[str, list] = {}
        for q in questions:
            by_section.setdefault(q.section_id, []).append(q)
        questions = []
        for sec in sections:
            sec_qs = by_section.get(sec.id, [])
            random.shuffle(sec_qs)
            questions.extend(sec_qs)

    # Group questions by section for the response
    section_data = []
    q_by_section: dict[str, list] = {}
    for q in questions:
        q_by_section.setdefault(q.section_id, []).append(q)
    for sec in sections:
        section_data.append({
            "id": sec.id,
            "title": sec.title,
            "description": sec.description,
            "questions": [q.model_dump(mode="json") for q in q_by_section.get(sec.id, [])],
        })

    return {
        "id": survey.id,
        "title": survey.title,
        "description": survey.description,
        "allow_back": survey.allow_back,
        "show_progress": survey.show_progress,
        "sections": section_data,
    }


class SubmitAnswerRequest(BaseModel):
    question_id: str
    value: str


class SubmitSurveyRequest(BaseModel):
    answers: list[SubmitAnswerRequest]


@router.post("/{survey_id}/responses")
async def start_survey_response(survey_id: str, user: dict = Depends(get_current_user)):
    """Start a new survey response session."""
    db = get_firestore_client()
    response = SurveyResponse(survey_id=survey_id, user_id=user["uid"])
    doc_ref = db.collection(SURVEY_RESPONSES).document()
    await doc_ref.set(response.to_firestore())
    return {"response_id": doc_ref.id}


@router.post("/{survey_id}/responses/{response_id}/submit")
async def submit_survey(
    survey_id: str,
    response_id: str,
    req: SubmitSurveyRequest,
    user: dict = Depends(get_current_user),
):
    """Submit all answers for a survey response and compute scores."""
    db = get_firestore_client()

    # Verify response belongs to user
    resp_doc = await db.collection(SURVEY_RESPONSES).document(response_id).get()
    if not resp_doc.exists:
        raise HTTPException(status_code=404, detail="Response not found")
    resp_data = resp_doc.to_dict()
    if resp_data["user_id"] != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your response")
    if resp_data.get("completed_at"):
        raise HTTPException(status_code=400, detail="Survey already completed")

    # Load survey for scoring config
    survey_doc = await db.collection(SURVEYS).document(survey_id).get()
    survey = Survey.from_firestore(survey_doc.id, survey_doc.to_dict())

    # Load questions for scoring
    questions_by_id: dict[str, SurveyQuestion] = {}
    async for doc in db.collection(SURVEY_QUESTIONS).where("survey_id", "==", survey_id).stream():
        q = SurveyQuestion.from_firestore(doc.id, doc.to_dict())
        questions_by_id[q.id] = q

    # Save answers and compute scores
    total_score = 0.0
    now = datetime.utcnow()
    for ans in req.answers:
        score = None
        if survey.scoring_enabled and ans.question_id in questions_by_id:
            q = questions_by_id[ans.question_id]
            if q.score_weights:
                # For select types, score the selected value(s)
                if q.answer_type.value.startswith("select"):
                    try:
                        selected = json.loads(ans.value) if ans.value.startswith("[") else [ans.value]
                    except json.JSONDecodeError:
                        selected = [ans.value]
                    score = sum(q.score_weights.get(v, 0) for v in selected)
                elif q.answer_type.value == "range":
                    score = q.score_weights.get(ans.value, float(ans.value))
                elif q.answer_type.value == "yes_no":
                    score = q.score_weights.get(ans.value, 0)
                total_score += score or 0

        answer = SurveyAnswer(
            response_id=response_id,
            question_id=ans.question_id,
            value=ans.value,
            score=score,
            answered_at=now,
        )
        doc_ref = db.collection(SURVEY_ANSWERS).document()
        await doc_ref.set(answer.to_firestore())

    # Mark response complete
    update_data: dict = {"completed_at": now.isoformat()}
    if survey.scoring_enabled:
        update_data["total_score"] = total_score
    await db.collection(SURVEY_RESPONSES).document(response_id).update(update_data)

    result = {"completed": True}
    if survey.scoring_enabled:
        result["total_score"] = total_score
    return result


@router.get("/{survey_id}/responses/{response_id}")
async def get_survey_response(survey_id: str, response_id: str, user: dict = Depends(get_current_user)):
    """Get a completed survey response with answers."""
    db = get_firestore_client()
    resp_doc = await db.collection(SURVEY_RESPONSES).document(response_id).get()
    if not resp_doc.exists:
        raise HTTPException(status_code=404, detail="Response not found")
    resp = SurveyResponse.from_firestore(resp_doc.id, resp_doc.to_dict())
    if resp.user_id != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your response")

    answers = []
    async for doc in db.collection(SURVEY_ANSWERS).where("response_id", "==", response_id).stream():
        answers.append(SurveyAnswer.from_firestore(doc.id, doc.to_dict()))

    return {
        "response": resp.model_dump(mode="json"),
        "answers": [a.model_dump(mode="json") for a in answers],
    }
