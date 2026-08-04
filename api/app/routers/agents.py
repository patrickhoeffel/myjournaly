from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.agent import Agent, Playbook, Guardrail
from app.services.auth import require_admin
from app.services.firestore import get_firestore_client, AGENTS, PLAYBOOKS, GUARDRAILS

router = APIRouter(prefix="/admin", tags=["agents"])


# --- Agents ---

@router.get("/agents", response_model=list[Agent])
async def list_agents(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(AGENTS).stream():
        results.append(Agent.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/agents", response_model=Agent)
async def create_agent(agent: Agent, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = agent.to_firestore()
    doc_ref = db.collection(AGENTS).document()
    await doc_ref.set(data)
    return Agent.from_firestore(doc_ref.id, data)


@router.put("/agents/{agent_id}", response_model=Agent)
async def update_agent(agent_id: str, agent: Agent, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(AGENTS).document(agent_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Agent not found")
    data = agent.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Agent.from_firestore(agent_id, data)


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(AGENTS).document(agent_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Agent not found")
    await doc_ref.delete()
    return {"deleted": agent_id}


# --- Playbooks ---

@router.get("/playbooks", response_model=list[Playbook])
async def list_playbooks(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(PLAYBOOKS).stream():
        results.append(Playbook.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/playbooks", response_model=Playbook)
async def create_playbook(playbook: Playbook, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = playbook.to_firestore()
    doc_ref = db.collection(PLAYBOOKS).document()
    await doc_ref.set(data)
    return Playbook.from_firestore(doc_ref.id, data)


@router.put("/playbooks/{playbook_id}", response_model=Playbook)
async def update_playbook(playbook_id: str, playbook: Playbook, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(PLAYBOOKS).document(playbook_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Playbook not found")
    data = playbook.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Playbook.from_firestore(playbook_id, data)


@router.delete("/playbooks/{playbook_id}")
async def delete_playbook(playbook_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(PLAYBOOKS).document(playbook_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Playbook not found")
    await doc_ref.delete()
    return {"deleted": playbook_id}


# --- Guardrails ---

@router.get("/guardrails", response_model=list[Guardrail])
async def list_guardrails(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(GUARDRAILS).stream():
        results.append(Guardrail.from_firestore(doc.id, doc.to_dict()))
    return results


@router.post("/guardrails", response_model=Guardrail)
async def create_guardrail(guardrail: Guardrail, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = guardrail.to_firestore()
    doc_ref = db.collection(GUARDRAILS).document()
    await doc_ref.set(data)
    return Guardrail.from_firestore(doc_ref.id, data)


@router.put("/guardrails/{guardrail_id}", response_model=Guardrail)
async def update_guardrail(guardrail_id: str, guardrail: Guardrail, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(GUARDRAILS).document(guardrail_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Guardrail not found")
    data = guardrail.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return Guardrail.from_firestore(guardrail_id, data)


@router.delete("/guardrails/{guardrail_id}")
async def delete_guardrail(guardrail_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(GUARDRAILS).document(guardrail_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Guardrail not found")
    await doc_ref.delete()
    return {"deleted": guardrail_id}
