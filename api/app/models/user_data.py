from datetime import datetime
from pydantic import BaseModel, Field


class UserData(BaseModel):
    id: str | None = None
    category: str
    key: str
    value: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "UserData":
        return cls(id=doc_id, **data)
