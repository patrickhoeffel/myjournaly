from datetime import datetime
from enum import Enum
from typing import Literal
from pydantic import BaseModel, Field


class EventCategory(str, Enum):
    PROFESSIONAL = "professional"
    RELATIONSHIP = "relationship"
    FAMILY = "family"
    EDUCATIONAL = "educational"
    MEDICAL = "medical"
    SPIRITUAL = "spiritual"
    PERSONAL = "personal"
    FINANCIAL = "financial"
    OTHER = "other"


class BeliefDirection(str, Enum):
    AFFIRMS = "affirms"
    DISAFFIRMS = "disaffirms"


class EventBeliefLink(BaseModel):
    """Junction record linking an event to a belief with polarity."""

    id: str | None = None
    event_id: str
    belief_id: str
    direction: BeliefDirection
    strength: float = 0.5  # 0.0 to 1.0
    notes: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "EventBeliefLink":
        return cls(id=doc_id, **data)


class EventLocation(BaseModel):
    """A structured location resolved through a place provider (Google Maps for now)."""

    provider: Literal["google"] = "google"
    place_id: str
    name: str
    formatted_address: str
    lat: float
    lng: float
    types: list[str] = Field(default_factory=list)


class Event(BaseModel):
    """An event or experience in the user's life."""

    id: str | None = None
    user_id: str
    title: str
    description: str | None = None
    category: EventCategory = EventCategory.PERSONAL
    began_at: datetime
    ended_at: datetime | None = None
    kind: Literal["moment", "span", "ongoing"] | None = None
    location: str | None = None
    location_places: list[EventLocation] = Field(default_factory=list)
    image_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Event":
        # Migrate legacy single-place field into the new list at read time.
        legacy = data.pop("location_place", None)
        if legacy and not data.get("location_places"):
            data["location_places"] = [legacy]
        return cls(id=doc_id, **data)
