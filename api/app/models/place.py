from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Place(BaseModel):
    """A first-class location entity. Owned by a user, identified internally by
    Firestore doc id and externally by the upstream provider's place_id
    (Google Maps for now). One Place can be referenced by many events, seasons,
    and journal entries."""

    id: str | None = None
    user_id: str = ""
    provider: Literal["google"] = "google"
    place_id: str            # Google's stable place identifier
    name: str                # user-overridable display label (defaults to Google's name)
    formatted_address: str
    lat: float
    lng: float
    types: list[str] = Field(default_factory=list)
    notes: str | None = None  # user's own description / why this place matters
    photo_url: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Place":
        return cls(id=doc_id, **data)
