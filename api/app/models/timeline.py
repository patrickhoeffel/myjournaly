from datetime import date, datetime
from pydantic import BaseModel, Field

from app.models.event import EventLocation


class TimelineType(BaseModel):
    """Admin-configurable timeline type (e.g. 'Medical', 'Spiritual', 'Relationship')."""

    id: str | None = None
    name: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_active: bool = True
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "TimelineType":
        return cls(id=doc_id, **data)


class UserTimeline(BaseModel):
    """A user's instance of a timeline type, with a custom label and color."""

    id: str | None = None
    user_id: str = ""
    timeline_type_id: str
    label: str  # user's custom label, e.g. "My Marriage"
    color: str = "#1976d2"  # user can override the default color
    start_date: date | None = None  # None means birth date / beginning
    end_date: date | None = None  # None means today / ongoing
    visible: bool = True  # show/hide the line
    events_visible: bool = True  # show/hide events on this line
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "UserTimeline":
        return cls(id=doc_id, **data)


class TimelineSeason(BaseModel):
    """A span of time (season) on a user's timeline."""

    id: str | None = None
    user_id: str = ""
    user_timeline_id: str
    title: str
    description: str | None = None
    start_date: date
    end_date: date | None = None  # None means ongoing
    location_places: list[EventLocation] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "TimelineSeason":
        return cls(id=doc_id, **data)
