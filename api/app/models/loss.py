from datetime import date, datetime
from pydantic import BaseModel, Field


class Loss(BaseModel):
    """An admin-curated catalog entry of a kind of loss a person can experience."""

    id: str | None = None
    name: str
    category: str | None = None
    description: str | None = None
    sort_order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Loss":
        return cls(id=doc_id, **data)


class UserLoss(BaseModel):
    """A loss a user has experienced — either selected from the catalog or custom."""

    id: str | None = None
    user_id: str = ""
    loss_id: str | None = None  # references Loss.id when adopted from catalog
    name: str
    category: str | None = None
    degree: int | None = None  # 1-5
    note: str | None = None
    occurred_on: date | None = None
    is_default: bool = True
    sort_order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "UserLoss":
        return cls(id=doc_id, **data)
