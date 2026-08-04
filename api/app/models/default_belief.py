from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class BeliefCategory(str, Enum):
    SELF = "self"
    GOD = "god"
    OTHERS = "others"
    WORLD = "world"


class BeliefValence(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"


class DefaultBelief(BaseModel):
    """Admin-managed starter belief template that users can adopt."""

    id: str | None = None
    category: BeliefCategory
    name: str
    description: str = ""
    valence: BeliefValence = BeliefValence.POSITIVE
    sort_order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "DefaultBelief":
        return cls(id=doc_id, **data)
