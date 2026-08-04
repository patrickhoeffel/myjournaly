"""LangGraph tools that give the AI agent access to user data in Firestore."""

import json
from datetime import datetime
from typing import Annotated

from langchain_core.tools import tool

from app.models.belief import Belief, BeliefSource, BeliefStrength
from app.models.event import Event
from app.models.journal import JournalEntry
from app.models.user_data import UserData
from app.services.firestore import (
    get_firestore_client,
    BELIEFS,
    EVENT_BELIEF_LINKS,
    EVENTS,
    FEELINGS,
    JOURNAL_ENTRIES,
    LINKS,
    RESOURCES,
    RESOURCE_ACCESS,
    SURVEYS,
    SURVEY_ANSWERS,
    SURVEY_QUESTIONS,
    SURVEY_RESPONSES,
    SURVEY_SECTIONS,
    TIMELINE_TYPES,
    TIMELINE_SEASONS,
    USER_TIMELINES,
    USERS,
)


# ── User Data (preferences, observations, etc.) ──


@tool
async def get_user_data(
    user_id: Annotated[str, "The user's Firebase UID"],
    category: Annotated[str, "Category to filter by, e.g. 'system_preference', 'observation', 'personal_info'"],
) -> str:
    """Retrieve all stored data points for a user in a given category. Use this to recall what you already know about the user."""
    db = get_firestore_client()
    coll = db.collection(USERS).document(user_id).collection("data")
    query = coll.where("category", "==", category)
    results = []
    async for doc in query.stream():
        d = doc.to_dict()
        results.append({"key": d["key"], "value": d["value"]})
    if not results:
        return f"No data found for category '{category}'."
    return json.dumps(results)


@tool
async def save_user_data(
    user_id: Annotated[str, "The user's Firebase UID"],
    category: Annotated[str, "Category, e.g. 'personal_info', 'observation', 'system_preference'"],
    key: Annotated[str, "Specific key, e.g. 'favorite_color', 'family_size', 'emotional_state'"],
    value: Annotated[str, "The value to store"],
) -> str:
    """Save or update a data point about the user. Use this when the user shares something worth remembering, or when you observe something important."""
    db = get_firestore_client()
    coll = db.collection(USERS).document(user_id).collection("data")

    # Upsert
    existing = None
    query = coll.where("category", "==", category).where("key", "==", key)
    async for doc in query.stream():
        existing = doc
        break

    now = datetime.utcnow().isoformat()
    if existing:
        await coll.document(existing.id).update({"value": value, "updated_at": now})
    else:
        data = UserData(category=category, key=key, value=value)
        await coll.document().set(data.to_firestore())

    return f"Saved {category}/{key} = {value}"


# ── Beliefs ──


@tool
async def get_beliefs(
    user_id: Annotated[str, "The user's Firebase UID"],
    active_only: Annotated[bool, "Whether to only return active beliefs"] = True,
) -> str:
    """Retrieve the user's belief catalog — statements they have declared or that have been observed. IMPORTANT: This is the full catalog of beliefs, NOT necessarily beliefs that are actively in play in their life. To see which beliefs (and feelings, people) are actually associated with specific journal entries, events, or experiences, use get_linked_associations instead. Handle this content with great sensitivity — beliefs are deeply personal and should never be judged, listed clinically, or summarized carelessly."""
    db = get_firestore_client()
    query = db.collection(BELIEFS).where("user_id", "==", user_id)
    if active_only:
        query = query.where("is_active", "==", True)
    results = []
    async for doc in query.stream():
        b = doc.to_dict()
        results.append({
            "id": doc.id,
            "statement": b["statement"],
            "source": b["source"],
            "strength": b["strength"],
            "tags": b.get("tags", []),
        })
    if not results:
        return "No beliefs recorded yet."
    return json.dumps(results)


@tool
async def save_belief(
    user_id: Annotated[str, "The user's Firebase UID"],
    statement: Annotated[str, "The belief statement"],
    source: Annotated[str, "One of: user_declared, system_inferred, system_observed, conversation"] = "conversation",
    strength: Annotated[str, "One of: strong, moderate, weak, uncertain"] = "moderate",
    tags: Annotated[list[str], "Tags for categorization"] = [],
) -> str:
    """Record a new belief or observation about the user that emerged from conversation."""
    db = get_firestore_client()
    belief = Belief(
        user_id=user_id,
        statement=statement,
        source=BeliefSource(source),
        strength=BeliefStrength(strength),
        tags=tags,
    )
    doc_ref = db.collection(BELIEFS).document()
    await doc_ref.set(belief.to_firestore())
    return f"Belief recorded: '{statement}'"


# ── Linked Associations ──


@tool
async def get_linked_associations(
    user_id: Annotated[str, "The user's Firebase UID"],
    entity_type: Annotated[str, "Filter by entity type: 'feeling', 'belief', 'person', or empty for all"] = "",
) -> str:
    """Retrieve the feelings, beliefs, and people that the user has actually linked to their journal entries, events, and experiences. This is the best way to understand what is truly relevant in the user's life — unlike get_beliefs which returns the full catalog, this shows only what the user has actively associated with real entries. Also checks event-belief links (affirms/disaffirms relationships). IMPORTANT: This data is deeply personal. When discussing these associations, be gentle and empathetic — never list them clinically, never assume you understand the full context, and always let the user lead the conversation about their emotional landscape."""
    db = get_firestore_client()

    # Query the universal links collection
    results = []
    query = db.collection(LINKS).where("user_id", "==", user_id).where("deleted_at", "==", None)
    async for doc in query.stream():
        d = doc.to_dict()
        from_type = d.get("from_type", "")
        to_type = d.get("to_type", "")

        # If filtering by entity type, check both from and to
        if entity_type:
            if from_type != entity_type and to_type != entity_type:
                continue

        results.append({
            "from_type": from_type,
            "from_name": d.get("from_name", ""),
            "from_id": d.get("from_id", ""),
            "to_type": to_type,
            "to_name": d.get("to_name", ""),
            "to_id": d.get("to_id", ""),
            "link_type": d.get("link_type", "association"),
            "link_description": d.get("link_description"),
        })

    # Also query event-belief links
    if not entity_type or entity_type == "belief":
        # Get user's event IDs first
        event_ids = []
        async for doc in db.collection(EVENTS).where("user_id", "==", user_id).stream():
            event_ids.append(doc.id)

        for event_id in event_ids:
            async for doc in db.collection(EVENT_BELIEF_LINKS).where("event_id", "==", event_id).stream():
                d = doc.to_dict()
                # Resolve belief statement
                belief_doc = await db.collection(BELIEFS).document(d["belief_id"]).get()
                belief_statement = belief_doc.to_dict().get("statement", "") if belief_doc.exists else ""
                # Resolve event title
                event_doc = await db.collection(EVENTS).document(event_id).get()
                event_title = event_doc.to_dict().get("title", "") if event_doc.exists else ""

                results.append({
                    "from_type": "event",
                    "from_name": event_title,
                    "from_id": event_id,
                    "to_type": "belief",
                    "to_name": belief_statement,
                    "to_id": d["belief_id"],
                    "link_type": d.get("direction", "affirms"),
                    "link_description": d.get("notes"),
                })

    if not results:
        return "No linked associations found. The user has not yet connected feelings, beliefs, or people to their journal entries or events."

    # Summarize by entity for readability
    return json.dumps(results)


# ── Events ──


@tool
async def get_events(
    user_id: Annotated[str, "The user's Firebase UID"],
    limit: Annotated[int, "Max events to return"] = 20,
) -> str:
    """Retrieve recent events and experiences from the user's life."""
    db = get_firestore_client()
    query = (
        db.collection(EVENTS)
        .where("user_id", "==", user_id)
        .order_by("began_at", direction="DESCENDING")
        .limit(limit)
    )
    results = []
    async for doc in query.stream():
        e = doc.to_dict()
        results.append({
            "id": doc.id,
            "title": e["title"],
            "description": e.get("description"),
            "category": e["category"],
            "began_at": e["began_at"],
            "tags": e.get("tags", []),
        })
    if not results:
        return "No events recorded yet."
    return json.dumps(results)


# ── Journal Entries ──


@tool
async def get_journal_entries(
    user_id: Annotated[str, "The user's Firebase UID"],
    limit: Annotated[int, "Max entries to return"] = 10,
) -> str:
    """Retrieve recent journal entries to understand what the user has been writing about."""
    db = get_firestore_client()
    query = (
        db.collection(JOURNAL_ENTRIES)
        .where("user_id", "==", user_id)
        .order_by("created_at", direction="DESCENDING")
        .limit(limit)
    )
    results = []
    async for doc in query.stream():
        j = doc.to_dict()
        results.append({
            "id": doc.id,
            "title": j["title"],
            "text": j["text"][:500],  # truncate for context window
            "tags": j.get("tags", []),
            "created_at": j["created_at"],
        })
    if not results:
        return "No journal entries yet."
    return json.dumps(results)


@tool
async def save_journal_entry(
    user_id: Annotated[str, "The user's Firebase UID"],
    title: Annotated[str, "Title for the journal entry"],
    text: Annotated[str, "The journal entry content"],
    tags: Annotated[list[str], "Tags for categorization"] = [],
) -> str:
    """Create a journal entry on behalf of the user, such as a summary of a conversation or a reflection."""
    db = get_firestore_client()
    entry = JournalEntry(user_id=user_id, title=title, text=text, tags=tags)
    doc_ref = db.collection(JOURNAL_ENTRIES).document()
    await doc_ref.set(entry.to_firestore())
    return f"Journal entry '{title}' saved."


# ── Resources ──


@tool
async def get_accessible_resources(
    user_id: Annotated[str, "The user's Firebase UID"],
    resource_type: Annotated[str, "Filter by type, e.g. 'book', 'video', 'worksheet'. Leave empty for all."] = "",
    tag: Annotated[str, "Filter by tag. Leave empty for all."] = "",
) -> str:
    """Retrieve resources the user has access to. Use this to recommend resources, find relevant materials, or apply worksheets/exercises in conversation."""
    from datetime import date as date_type

    db = get_firestore_client()
    today = date_type.today().isoformat()

    # Get user's active access grants
    resource_ids: set[str] = set()
    group_ids: set[str] = set()
    query = db.collection(RESOURCE_ACCESS).where("user_id", "==", user_id)
    async for doc in query.stream():
        grant = doc.to_dict()
        if grant.get("revoked_at"):
            continue
        if grant.get("begin_date") and grant["begin_date"] > today:
            continue
        if grant.get("end_date") and grant["end_date"] < today:
            continue
        if grant.get("resource_id"):
            resource_ids.add(grant["resource_id"])
        if grant.get("group_id"):
            group_ids.add(grant["group_id"])

    if not resource_ids and not group_ids:
        return "User has no resource access grants."

    results = []
    async for doc in db.collection(RESOURCES).where("is_active", "==", True).stream():
        r = doc.to_dict()
        has_access = (
            doc.id in resource_ids
            or any(gid in group_ids for gid in r.get("group_ids", []))
        )
        if not has_access:
            continue
        if resource_type and r.get("resource_type") != resource_type:
            continue
        if tag and tag not in r.get("tags", []):
            continue
        results.append({
            "id": doc.id,
            "title": r["title"],
            "type": r["resource_type"],
            "description": r.get("description"),
            "reference": r.get("reference"),
            "content": (r.get("content") or "")[:500],
            "tags": r.get("tags", []),
        })

    if not results:
        return "No matching resources found for this user."
    return json.dumps(results)


# ── Surveys ──


@tool
async def get_available_surveys(
    user_id: Annotated[str, "The user's Firebase UID"],
) -> str:
    """Get surveys the user has access to. Use this when you want to offer or administer a survey to the user."""
    from datetime import date as date_type

    db = get_firestore_client()
    today = date_type.today().isoformat()

    # Find accessible resource IDs (surveys are resources)
    resource_ids: set[str] = set()
    group_ids: set[str] = set()
    async for doc in db.collection(RESOURCE_ACCESS).where("user_id", "==", user_id).stream():
        grant = doc.to_dict()
        if grant.get("revoked_at"):
            continue
        if grant.get("begin_date") and grant["begin_date"] > today:
            continue
        if grant.get("end_date") and grant["end_date"] < today:
            continue
        if grant.get("resource_id"):
            resource_ids.add(grant["resource_id"])
        if grant.get("group_id"):
            group_ids.add(grant["group_id"])

    # Find survey resources the user can access
    accessible_resource_ids: set[str] = set()
    async for doc in db.collection(RESOURCES).where("resource_type", "==", "survey").where("is_active", "==", True).stream():
        r = doc.to_dict()
        if doc.id in resource_ids or any(gid in group_ids for gid in r.get("group_ids", [])):
            accessible_resource_ids.add(doc.id)

    if not accessible_resource_ids:
        return "No surveys available for this user."

    # Get survey details
    results = []
    async for doc in db.collection(SURVEYS).where("is_active", "==", True).stream():
        s = doc.to_dict()
        if s["resource_id"] in accessible_resource_ids:
            results.append({
                "survey_id": doc.id,
                "title": s["title"],
                "description": s.get("description"),
            })
    if not results:
        return "No surveys configured yet."
    return json.dumps(results)


@tool
async def get_survey_questions(
    survey_id: Annotated[str, "The survey ID to load questions for"],
) -> str:
    """Load all sections and questions for a survey. Use this to administer a survey question by question in conversation."""
    db = get_firestore_client()

    sections = []
    async for doc in db.collection(SURVEY_SECTIONS).where("survey_id", "==", survey_id).stream():
        sections.append({**doc.to_dict(), "id": doc.id})
    sections.sort(key=lambda s: s["order"])

    questions = []
    async for doc in db.collection(SURVEY_QUESTIONS).where("survey_id", "==", survey_id).stream():
        questions.append({**doc.to_dict(), "id": doc.id})
    questions.sort(key=lambda q: q["order"])

    # Check for randomization
    survey_doc = await db.collection(SURVEYS).document(survey_id).get()
    if survey_doc.exists:
        survey = survey_doc.to_dict()
        if survey.get("randomize_questions"):
            import random
            by_section: dict[str, list] = {}
            for q in questions:
                by_section.setdefault(q["section_id"], []).append(q)
            questions = []
            for sec in sections:
                sec_qs = by_section.get(sec["id"], [])
                random.shuffle(sec_qs)
                questions.extend(sec_qs)

    result = {"sections": sections, "questions": questions}
    return json.dumps(result, default=str)


@tool
async def save_survey_answer(
    user_id: Annotated[str, "The user's Firebase UID"],
    survey_id: Annotated[str, "The survey ID"],
    response_id: Annotated[str, "The response session ID. Create one with start_survey_response if needed."],
    question_id: Annotated[str, "The question ID being answered"],
    value: Annotated[str, "The user's answer"],
) -> str:
    """Record a single survey answer during a conversational survey session."""
    db = get_firestore_client()

    # Score the answer if scoring is enabled
    score = None
    survey_doc = await db.collection(SURVEYS).document(survey_id).get()
    if survey_doc.exists and survey_doc.to_dict().get("scoring_enabled"):
        q_doc = await db.collection(SURVEY_QUESTIONS).document(question_id).get()
        if q_doc.exists:
            q = q_doc.to_dict()
            weights = q.get("score_weights", {})
            if weights:
                score = weights.get(value, 0)

    answer = {
        "response_id": response_id,
        "question_id": question_id,
        "value": value,
        "score": score,
        "answered_at": datetime.utcnow().isoformat(),
    }
    doc_ref = db.collection(SURVEY_ANSWERS).document()
    await doc_ref.set(answer)
    return f"Answer recorded for question {question_id}."


@tool
async def start_survey_response(
    user_id: Annotated[str, "The user's Firebase UID"],
    survey_id: Annotated[str, "The survey ID to start"],
) -> str:
    """Start a new survey response session for the user. Returns the response_id to use when saving answers."""
    db = get_firestore_client()
    response = {
        "survey_id": survey_id,
        "user_id": user_id,
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "total_score": None,
    }
    doc_ref = db.collection(SURVEY_RESPONSES).document()
    await doc_ref.set(response)
    return json.dumps({"response_id": doc_ref.id, "message": "Survey response started. Use this response_id when saving answers."})


@tool
async def complete_survey_response(
    response_id: Annotated[str, "The response session ID to complete"],
) -> str:
    """Mark a survey response as completed and compute the total score if scoring is enabled."""
    db = get_firestore_client()

    resp_doc = await db.collection(SURVEY_RESPONSES).document(response_id).get()
    if not resp_doc.exists:
        return "Response not found."
    resp = resp_doc.to_dict()

    # Sum scores
    total_score = 0.0
    has_scores = False
    async for doc in db.collection(SURVEY_ANSWERS).where("response_id", "==", response_id).stream():
        a = doc.to_dict()
        if a.get("score") is not None:
            total_score += a["score"]
            has_scores = True

    update = {"completed_at": datetime.utcnow().isoformat()}
    if has_scores:
        update["total_score"] = total_score
    await db.collection(SURVEY_RESPONSES).document(response_id).update(update)

    result = {"completed": True}
    if has_scores:
        result["total_score"] = total_score
    return json.dumps(result)


# ── User Timelines ──


@tool
async def get_user_timelines(
    user_id: Annotated[str, "The user's Firebase UID"],
) -> str:
    """Get all of the user's timeline lines. Each line has a type, label, and color."""
    db = get_firestore_client()
    results = []
    async for doc in db.collection(USER_TIMELINES).where("user_id", "==", user_id).stream():
        d = doc.to_dict()
        results.append({"id": doc.id, "label": d["label"], "color": d["color"], "timeline_type_id": d["timeline_type_id"]})
    if not results:
        return "User has no timelines yet."
    # Include available types for context
    types = []
    async for doc in db.collection(TIMELINE_TYPES).where("is_active", "==", True).stream():
        t = doc.to_dict()
        types.append({"id": doc.id, "name": t["name"]})
    return json.dumps({"lines": results, "available_types": types})


@tool
async def create_user_timeline(
    user_id: Annotated[str, "The user's Firebase UID"],
    timeline_type_id: Annotated[str, "The timeline type ID from available_types"],
    label: Annotated[str, "A custom label for this timeline, e.g. 'My Marriage', 'Career at Google'"],
    color: Annotated[str, "Hex color for the line, e.g. '#e53935'"] = "#1976d2",
    start_date: Annotated[str, "Start date of the line in YYYY-MM-DD, or empty for birth date"] = "",
    end_date: Annotated[str, "End date of the line in YYYY-MM-DD, or empty for ongoing/today"] = "",
) -> str:
    """Create a new timeline line for the user. First call get_user_timelines to see available types. Each line can have its own start and end date."""
    db = get_firestore_client()
    data = {
        "user_id": user_id,
        "timeline_type_id": timeline_type_id,
        "label": label,
        "color": color,
        "start_date": start_date or None,
        "end_date": end_date or None,
        "visible": True,
        "events_visible": True,
        "order": 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    doc_ref = db.collection(USER_TIMELINES).document()
    await doc_ref.set(data)
    return json.dumps({"id": doc_ref.id, "label": label, "message": f"Timeline '{label}' created."})


@tool
async def update_user_timeline(
    user_id: Annotated[str, "The user's Firebase UID"],
    timeline_id: Annotated[str, "The user timeline line ID to update"],
    label: Annotated[str, "New label, or empty to keep current"] = "",
    color: Annotated[str, "New hex color, or empty to keep current"] = "",
    start_date: Annotated[str, "New start date YYYY-MM-DD, or empty to keep current"] = "",
    end_date: Annotated[str, "New end date YYYY-MM-DD, or empty to keep current"] = "",
) -> str:
    """Update properties of a user's timeline line (label, color, start/end dates)."""
    db = get_firestore_client()
    doc_ref = db.collection(USER_TIMELINES).document(timeline_id)
    doc = await doc_ref.get()
    if not doc.exists:
        return "Timeline not found."
    if doc.to_dict().get("user_id") != user_id:
        return "Cannot update another user's timeline."

    updates: dict = {}
    if label:
        updates["label"] = label
    if color:
        updates["color"] = color
    if start_date:
        updates["start_date"] = start_date
    if end_date:
        updates["end_date"] = end_date

    if not updates:
        return "No changes provided."

    await doc_ref.update(updates)
    return f"Timeline '{updates.get('label', doc.to_dict().get('label', ''))}' updated."


@tool
async def add_timeline_event(
    user_id: Annotated[str, "The user's Firebase UID"],
    user_timeline_id: Annotated[str, "The user timeline line ID to add the event to"],
    title: Annotated[str, "Title of the event"],
    event_date: Annotated[str, "Date of the event in YYYY-MM-DD format"],
    description: Annotated[str, "Optional description"] = "",
) -> str:
    """Add a point-in-time event to one of the user's timeline lines. Creates a unified event and links it to the timeline."""
    db = get_firestore_client()
    now = datetime.utcnow().isoformat()
    began_at = f"{event_date}T00:00:00" if "T" not in event_date else event_date
    event_data = {
        "user_id": user_id,
        "title": title,
        "description": description or None,
        "category": "personal",
        "began_at": began_at,
        "ended_at": began_at,
        "kind": "moment",
        "location": None,
        "image_url": None,
        "tags": [],
        "created_at": now,
        "updated_at": now,
    }
    doc_ref = db.collection(EVENTS).document()
    await doc_ref.set(event_data)

    # Link event to timeline
    link_data = {
        "user_id": user_id,
        "from_id": doc_ref.id,
        "from_type": "event",
        "from_name": title,
        "to_id": user_timeline_id,
        "to_type": "user_timeline",
        "to_name": "",
        "link_type": "association",
        "link_strength": 0.5,
        "link_description": None,
        "link_source": None,
        "link_source_confidence": 1.0,
        "valid_begin_date": None,
        "valid_end_date": None,
        "created_at": now,
        "modified_at": now,
        "deleted_at": None,
    }
    await db.collection(LINKS).document().set(link_data)
    return f"Event '{title}' added on {event_date}."


@tool
async def add_timeline_season(
    user_id: Annotated[str, "The user's Firebase UID"],
    user_timeline_id: Annotated[str, "The user timeline line ID to add the season to"],
    title: Annotated[str, "Title of the season/span"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format, or empty string if ongoing"] = "",
    description: Annotated[str, "Optional description"] = "",
) -> str:
    """Add a season (span of time) to one of the user's timeline lines. Use this for periods like 'College', 'First Marriage', 'Depression', etc."""
    db = get_firestore_client()
    data = {
        "user_id": user_id,
        "user_timeline_id": user_timeline_id,
        "title": title,
        "start_date": start_date,
        "end_date": end_date or None,
        "description": description or None,
        "created_at": datetime.utcnow().isoformat(),
    }
    doc_ref = db.collection(TIMELINE_SEASONS).document()
    await doc_ref.set(data)
    end_str = end_date if end_date else "ongoing"
    return f"Season '{title}' added from {start_date} to {end_str}."


@tool
async def get_timeline_events_and_seasons(
    user_id: Annotated[str, "The user's Firebase UID"],
    user_timeline_id: Annotated[str, "The timeline line ID to get items for, or empty for all"] = "",
) -> str:
    """Get events and seasons on the user's timelines. Useful for reviewing what's already been recorded."""
    db = get_firestore_client()

    # Build event-to-timeline mapping from links
    link_query = db.collection(LINKS).where("user_id", "==", user_id).where("to_type", "==", "user_timeline").where("deleted_at", "==", None)
    if user_timeline_id:
        link_query = link_query.where("to_id", "==", user_timeline_id)
    event_timeline_map: dict[str, str] = {}  # event_id -> timeline_id
    async for doc in link_query.stream():
        d = doc.to_dict()
        if d.get("from_type") == "event":
            event_timeline_map[d["from_id"]] = d["to_id"]

    # Fetch the actual events
    events = []
    if event_timeline_map:
        all_events_query = db.collection(EVENTS).where("user_id", "==", user_id)
        async for doc in all_events_query.stream():
            if doc.id in event_timeline_map:
                d = doc.to_dict()
                events.append({
                    "id": doc.id,
                    "title": d["title"],
                    "date": d.get("began_at", ""),
                    "timeline_id": event_timeline_map[doc.id],
                })

    seasons_query = db.collection(TIMELINE_SEASONS).where("user_id", "==", user_id)
    if user_timeline_id:
        seasons_query = seasons_query.where("user_timeline_id", "==", user_timeline_id)
    seasons = []
    async for doc in seasons_query.stream():
        d = doc.to_dict()
        seasons.append({"id": doc.id, "title": d["title"], "start": d["start_date"], "end": d.get("end_date"), "timeline_id": d["user_timeline_id"]})

    if not events and not seasons:
        return "No events or seasons recorded on this timeline yet."
    return json.dumps({"events": events, "seasons": seasons}, default=str)


@tool
async def update_timeline_item(
    user_id: Annotated[str, "The user's Firebase UID"],
    item_id: Annotated[str, "The ID of the event or season to update"],
    item_type: Annotated[str, "Either 'event' or 'season'"],
    title: Annotated[str, "New title, or empty string to keep current"] = "",
    event_date: Annotated[str, "New date in YYYY-MM-DD (events only), or empty to keep current"] = "",
    start_date: Annotated[str, "New start date in YYYY-MM-DD (seasons only), or empty to keep current"] = "",
    end_date: Annotated[str, "New end date in YYYY-MM-DD (seasons only), or empty to keep current"] = "",
    description: Annotated[str, "New description, or empty to keep current"] = "",
) -> str:
    """Update an existing timeline event or season. Only provided (non-empty) fields are changed."""
    db = get_firestore_client()
    collection = EVENTS if item_type == "event" else TIMELINE_SEASONS
    doc_ref = db.collection(collection).document(item_id)
    doc = await doc_ref.get()
    if not doc.exists:
        return f"{item_type.title()} not found."
    if doc.to_dict().get("user_id") != user_id:
        return "Cannot update another user's timeline item."

    updates: dict = {}
    if title:
        updates["title"] = title
    if description:
        updates["description"] = description
    if item_type == "event" and event_date:
        updates["began_at"] = f"{event_date}T00:00:00" if "T" not in event_date else event_date
    if item_type == "season" and start_date:
        updates["start_date"] = start_date
    if item_type == "season" and end_date:
        updates["end_date"] = end_date

    if not updates:
        return "No changes provided."

    await doc_ref.update(updates)
    return f"{item_type.title()} '{updates.get('title', doc.to_dict().get('title', ''))}' updated."


@tool
async def delete_timeline_item(
    user_id: Annotated[str, "The user's Firebase UID"],
    item_id: Annotated[str, "The ID of the event or season to delete"],
    item_type: Annotated[str, "Either 'event' or 'season'"],
) -> str:
    """Delete an event or season from the user's timeline."""
    db = get_firestore_client()
    collection = EVENTS if item_type == "event" else TIMELINE_SEASONS
    doc_ref = db.collection(collection).document(item_id)
    doc = await doc_ref.get()
    if not doc.exists:
        return f"{item_type.title()} not found."
    if doc.to_dict().get("user_id") != user_id:
        return "Cannot delete another user's timeline item."
    title = doc.to_dict().get("title", "")
    # Clean up timeline links for events
    if item_type == "event":
        async for link_doc in db.collection(LINKS).where("from_id", "==", item_id).where("from_type", "==", "event").where("deleted_at", "==", None).stream():
            await db.collection(LINKS).document(link_doc.id).delete()
    await doc_ref.delete()
    return f"{item_type.title()} '{title}' deleted."


# All tools available to the agent
ALL_TOOLS = [
    get_user_data,
    save_user_data,
    get_beliefs,
    save_belief,
    get_linked_associations,
    get_events,
    get_journal_entries,
    save_journal_entry,
    get_accessible_resources,
    get_available_surveys,
    get_survey_questions,
    start_survey_response,
    save_survey_answer,
    complete_survey_response,
    get_user_timelines,
    create_user_timeline,
    update_user_timeline,
    add_timeline_event,
    add_timeline_season,
    get_timeline_events_and_seasons,
    update_timeline_item,
    delete_timeline_item,
]
