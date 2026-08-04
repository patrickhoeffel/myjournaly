from datetime import datetime
from pydantic import BaseModel, Field


class JournalEntry(BaseModel):
    id: str | None = None
    user_id: str = ""
    title: str = ""
    text: str = ""  # plain-text fallback / search index
    content: str = ""  # rich HTML from Tiptap editor
    notebook_id: str | None = None
    tag_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)  # legacy freeform tags
    resource_ids: list[str] = Field(default_factory=list)
    person_ids: list[str] = Field(default_factory=list)
    feeling_ids: list[str] = Field(default_factory=list)
    event_ids: list[str] = Field(default_factory=list)
    belief_ids: list[str] = Field(default_factory=list)
    linked_entry_ids: list[str] = Field(default_factory=list)
    image_url: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "JournalEntry":
        return cls(id=doc_id, **data)
