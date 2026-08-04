"""LangGraph-based chat agent with tool access to user data."""

import logging
from collections.abc import AsyncIterator
from typing import Annotated

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from app.config import settings
from app.models.agent import Agent, Guardrail, Playbook
from app.models.conversation import Message
from app.services.agent_tools import ALL_TOOLS
from app.services.firestore import get_firestore_client, AGENTS, PLAYBOOKS, GUARDRAILS, USERS

logger = logging.getLogger(__name__)


async def build_system_prompt(agent_id: str, user_id: str, playbook_id: str | None = None) -> str:
    db = get_firestore_client()
    parts: list[str] = []

    agent_doc = await db.collection(AGENTS).document(agent_id).get()
    if agent_doc.exists:
        agent = Agent.from_firestore(agent_doc.id, agent_doc.to_dict())
        parts.append(agent.system_prompt)

    if playbook_id:
        pb_doc = await db.collection(PLAYBOOKS).document(playbook_id).get()
        if pb_doc.exists:
            playbook = Playbook.from_firestore(pb_doc.id, pb_doc.to_dict())
            parts.append(f"--- Playbook: {playbook.name} ---\n{playbook.system_prompt}")

    async for doc in db.collection(GUARDRAILS).where("is_active", "==", True).stream():
        guardrail = Guardrail.from_firestore(doc.id, doc.to_dict())
        parts.append(f"--- Safety Guardrail: {guardrail.name} ---\n{guardrail.content}")

    # Inject user profile and preferences into the system prompt
    user_context = await _build_user_context(db, user_id)
    if user_context:
        parts.append(user_context)

    return "\n\n".join(parts)


async def _build_user_context(db, user_id: str) -> str | None:
    """Build a user context section from profile data and 'My Story' preference."""
    sections: list[str] = []

    # User profile
    user_doc = await db.collection(USERS).document(user_id).get()
    if user_doc.exists:
        profile = user_doc.to_dict()
        name_parts = [profile.get("first_name"), profile.get("last_name")]
        display_name = profile.get("display_name", "")
        full_name = " ".join(p for p in name_parts if p)
        if full_name or display_name:
            sections.append(f"The user's name is {full_name or display_name}.")

    # System preferences (chatbot name, my_story)
    prefs: dict[str, str] = {}
    data_coll = db.collection(USERS).document(user_id).collection("data")
    async for doc in data_coll.where("category", "==", "system_preference").stream():
        d = doc.to_dict()
        prefs[d["key"]] = d["value"]

    chatbot_name = prefs.get("chatbot_name")
    if chatbot_name:
        sections.append(f"The user has asked you to identify yourself as \"{chatbot_name}\".")

    my_story = prefs.get("my_story")
    if my_story:
        sections.append(
            f"--- About the User (written by them) ---\n{my_story}"
        )

    if not sections:
        return None
    return "--- User Context ---\n" + "\n\n".join(sections)


# ── LangGraph State & Graph ──


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


def build_graph():
    """Build the LangGraph agent graph with tools."""
    llm = ChatAnthropic(
        model="claude-sonnet-4-20250514",
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )
    llm_with_tools = llm.bind_tools(ALL_TOOLS)

    async def call_model(state: AgentState):
        response = await llm_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    def should_continue(state: AgentState):
        last_message = state["messages"][-1]
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            return "tools"
        return END

    tool_node = ToolNode(ALL_TOOLS)

    graph = StateGraph(AgentState)
    graph.add_node("agent", call_model)
    graph.add_node("tools", tool_node)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")

    return graph.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def stream_chat_response(
    system_prompt: str,
    messages: list[Message],
    user_id: str,
) -> AsyncIterator[str]:
    """Stream the agent response, yielding text chunks as they arrive."""
    graph = get_graph()

    # Build LangChain message list
    lc_messages = [SystemMessage(content=system_prompt)]

    # Inject user_id so tools know who they're operating on
    lc_messages.append(SystemMessage(
        content=f"The current user's ID is: {user_id}. Use this when calling tools that require a user_id parameter."
    ))

    for msg in messages:
        if msg.role.value == "user":
            lc_messages.append(HumanMessage(content=msg.content))
        else:
            lc_messages.append(AIMessage(content=msg.content))

    # Stream with astream_events to get token-level chunks
    async for event in graph.astream_events(
        {"messages": lc_messages},
        version="v2",
    ):
        kind = event["event"]
        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if isinstance(chunk, AIMessage) and chunk.content:
                if isinstance(chunk.content, str):
                    yield chunk.content
                elif isinstance(chunk.content, list):
                    for block in chunk.content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            yield block["text"]
                        elif isinstance(block, str):
                            yield block
