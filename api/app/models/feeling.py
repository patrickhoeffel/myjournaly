from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class FeelingValence(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"


class Feeling(BaseModel):
    """A default feeling managed by admins."""

    id: str | None = None
    name: str
    valence: FeelingValence
    sort_order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Feeling":
        return cls(id=doc_id, **data)


class UserFeeling(BaseModel):
    """A user's personal copy/customization of feelings."""

    id: str | None = None
    user_id: str = ""
    name: str
    valence: FeelingValence
    sort_order: int = 0
    is_default: bool = True  # True if copied from admin defaults
    degree: int | None = None  # 1-5, how strongly this feeling applies (None = unset)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "UserFeeling":
        return cls(id=doc_id, **data)
