from datetime import date, datetime
from enum import Enum
from pydantic import BaseModel, Field


class RelationshipType(str, Enum):
    FAMILY = "family"
    FRIEND = "friend"
    SPOUSE = "spouse"
    PARTNER = "partner"
    COLLEAGUE = "colleague"
    MENTOR = "mentor"
    THERAPIST = "therapist"
    PASTOR = "pastor"
    ACQUAINTANCE = "acquaintance"
    OTHER = "other"


class Person(BaseModel):
    id: str | None = None
    user_id: str = ""
    first_name: str
    last_name: str | None = None
    date_of_birth: date | None = None
    email: str | None = None
    phone: str | None = None
    relationship: RelationshipType = RelationshipType.OTHER
    photo_url: str | None = None
    notes: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Person":
        return cls(id=doc_id, **data)
