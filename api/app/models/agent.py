from datetime import datetime
from pydantic import BaseModel, Field


class Agent(BaseModel):
    id: str | None = None
    name: str
    description: str
    system_prompt: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Agent":
        return cls(id=doc_id, **data)


class Playbook(BaseModel):
    id: str | None = None
    name: str
    description: str
    system_prompt: str
    agent_id: str | None = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Playbook":
        return cls(id=doc_id, **data)


class Guardrail(BaseModel):
    id: str | None = None
    name: str
    content: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Guardrail":
        return cls(id=doc_id, **data)
