from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.models.agent import Agent
from app.models.conversation import Conversation, Message, MessageRole
from app.services.auth import get_current_user
from app.services.chat import build_system_prompt, stream_chat_response
from app.services.firestore import get_firestore_client, AGENTS, CONVERSATIONS

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/agents", response_model=list[Agent])
async def list_active_agents(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(AGENTS).where("is_active", "==", True).stream():
        results.append(Agent.from_firestore(doc.id, doc.to_dict()))
    return results


class ChatRequest(BaseModel):
    message: str
    agent_id: str
    conversation_id: str | None = None
    playbook_id: str | None = None


@router.get("/conversations", response_model=list[Conversation])
async def list_conversations(user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    results = []
    query = db.collection(CONVERSATIONS).where("user_id", "==", user["uid"]).order_by("updated_at", direction="DESCENDING")
    async for doc in query.stream():
        conv = Conversation.from_firestore(doc.id, doc.to_dict())
        results.append(conv)
    return results


@router.get("/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(CONVERSATIONS).document(conversation_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv = Conversation.from_firestore(doc.id, doc.to_dict())
    if conv.user_id != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your conversation")
    return conv


@router.post("/send")
async def send_message(req: ChatRequest, user: dict = Depends(get_current_user)):
    db = get_firestore_client()

    # Load or create conversation
    if req.conversation_id:
        doc = await db.collection(CONVERSATIONS).document(req.conversation_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conv = Conversation.from_firestore(doc.id, doc.to_dict())
        if conv.user_id != user["uid"]:
            raise HTTPException(status_code=403, detail="Not your conversation")
    else:
        conv = Conversation(
            user_id=user["uid"],
            agent_id=req.agent_id,
            playbook_id=req.playbook_id,
        )

    # Append user message
    user_msg = Message(role=MessageRole.USER, content=req.message)
    conv.messages.append(user_msg)

    # Build system prompt from agent + playbook + guardrails
    system_prompt = await build_system_prompt(req.agent_id, user["uid"], req.playbook_id)

    # Stream the response
    async def generate():
        full_response = []
        async for chunk in stream_chat_response(system_prompt, conv.messages, user["uid"]):
            full_response.append(chunk)
            yield chunk

        # Save conversation with assistant response
        assistant_msg = Message(
            role=MessageRole.ASSISTANT,
            content="".join(full_response),
        )
        conv.messages.append(assistant_msg)
        conv.updated_at = datetime.utcnow()

        if conv.id:
            await db.collection(CONVERSATIONS).document(conv.id).update(conv.to_firestore())
        else:
            # Auto-title from first message
            conv.title = req.message[:80]
            data = conv.to_firestore()
            doc_ref = db.collection(CONVERSATIONS).document()
            await doc_ref.set(data)
            # Send conversation ID as final SSE event
            yield f"\n[[CONV_ID:{doc_ref.id}]]"

    return StreamingResponse(generate(), media_type="text/plain")


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    db = get_firestore_client()
    doc = await db.collection(CONVERSATIONS).document(conversation_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv = Conversation.from_firestore(doc.id, doc.to_dict())
    if conv.user_id != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your conversation")
    await db.collection(CONVERSATIONS).document(conversation_id).delete()
    return {"deleted": conversation_id}
