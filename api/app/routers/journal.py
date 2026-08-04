import json
import logging
from datetime import datetime

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.models.journal import JournalEntry
from app.services.auth import get_current_user
from app.services.firestore import (
    get_firestore_client,
    JOURNAL_ENTRIES,
    PEOPLE,
    USER_FEELINGS,
    EVENTS,
    BELIEFS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/journal", tags=["journal"])


@router.post("", response_model=JournalEntry, status_code=status.HTTP_201_CREATED)
async def create_entry(entry: JournalEntry, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    entry.user_id = user["uid"]
    doc_ref = db.collection(JOURNAL_ENTRIES).document()
    await doc_ref.set(entry.to_firestore())
    return JournalEntry.from_firestore(doc_ref.id, entry.to_firestore())


@router.get("", response_model=list[JournalEntry])
async def list_entries(tag: str | None = None, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    query = db.collection(JOURNAL_ENTRIES).where("user_id", "==", user["uid"])
    if tag:
        query = query.where("tags", "array_contains", tag)
    results = []
    async for doc in query.stream():
        results.append(JournalEntry.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda e: e.created_at, reverse=True)
    return results


@router.get("/{entry_id}", response_model=JournalEntry)
async def get_entry(entry_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(JOURNAL_ENTRIES).document(entry_id).get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Entry not found")
    return JournalEntry.from_firestore(doc.id, doc.to_dict())


@router.put("/{entry_id}", response_model=JournalEntry)
async def update_entry(entry_id: str, updates: dict, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(JOURNAL_ENTRIES).document(entry_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Entry not found")
    await doc_ref.update(updates)
    updated = await doc_ref.get()
    return JournalEntry.from_firestore(updated.id, updated.to_dict())


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc_ref = db.collection(JOURNAL_ENTRIES).document(entry_id)
    doc = await doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != user["uid"]:
        raise HTTPException(status_code=404, detail="Entry not found")
    await doc_ref.delete()


# ── LLM-powered analysis ──


class AnalyzeRequest(BaseModel):
    text: str  # plain text of the journal entry


class SuggestedAssociations(BaseModel):
    person_ids: list[str] = []
    feeling_ids: list[str] = []
    event_ids: list[str] = []
    belief_ids: list[str] = []


@router.post("/analyze", response_model=SuggestedAssociations)
async def analyze_entry(req: AnalyzeRequest, user: dict = Depends(get_current_user)):
    """Use LLM to suggest associations for a journal entry based on its text."""
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=501, detail="LLM not configured")

    db = get_firestore_client()
    uid = user["uid"]

    # Load user's entities for context
    people = []
    async for doc in db.collection(PEOPLE).where("user_id", "==", uid).stream():
        d = doc.to_dict()
        people.append({"id": doc.id, "name": f"{d.get('first_name', '')} {d.get('last_name', '') or ''}".strip()})

    feelings = []
    async for doc in db.collection(USER_FEELINGS).where("user_id", "==", uid).stream():
        d = doc.to_dict()
        feelings.append({"id": doc.id, "name": d.get("name", ""), "valence": d.get("valence", "")})

    events = []
    async for doc in db.collection(EVENTS).where("user_id", "==", uid).stream():
        d = doc.to_dict()
        events.append({"id": doc.id, "title": d.get("title", "")})

    beliefs = []
    async for doc in db.collection(BELIEFS).where("user_id", "==", uid).stream():
        d = doc.to_dict()
        if d.get("is_active", True):
            beliefs.append({"id": doc.id, "statement": d.get("statement", "")})

    prompt = f"""Analyze this journal entry and identify which of the user's existing people, feelings, events, and beliefs are relevant.

JOURNAL ENTRY:
{req.text}

AVAILABLE PEOPLE:
{json.dumps(people)}

AVAILABLE FEELINGS:
{json.dumps(feelings)}

AVAILABLE EVENTS:
{json.dumps(events)}

AVAILABLE BELIEFS:
{json.dumps(beliefs)}

Return a JSON object with these fields, using ONLY IDs from the lists above:
- person_ids: people mentioned or clearly referenced in the entry
- feeling_ids: feelings expressed or implied in the entry
- event_ids: events referenced or related to the entry
- belief_ids: beliefs that are affirmed, challenged, or relevant

Be selective — only include items that are clearly relevant, not tangentially related.
Return ONLY the JSON object, no explanation."""

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        result_text = response.content[0].text.strip()
        # Parse, stripping any markdown fences
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        parsed = json.loads(result_text)
        return SuggestedAssociations(**parsed)
    except Exception as e:
        logger.error(f"LLM analysis failed: {e}")
        return SuggestedAssociations()
