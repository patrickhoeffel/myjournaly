from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class LinkEntityType(str, Enum):
    EVENT = "event"
    USER_TIMELINE = "user_timeline"
    TIMELINE_SEASON = "timeline_season"
    SEASON = "season"  # alias used by the UI for timeline seasons
    PLACE = "place"
    BELIEF = "belief"
    FEELING = "feeling"
    PERSON = "person"
    JOURNAL_ENTRY = "journal_entry"
    TAG = "tag"
    LOSS = "loss"
    PHOTO = "photo"


class LinkType(str, Enum):
    ASSOCIATION = "association"
    CAUSAL = "causal"
    TEMPORAL = "temporal"
    REFERENCE = "reference"


class Link(BaseModel):
    """Universal link record connecting any two entities."""

    id: str | None = None
    user_id: str = ""
    from_id: str
    from_type: LinkEntityType
    from_name: str = ""
    to_id: str
    to_type: LinkEntityType
    to_name: str = ""
    link_type: LinkType = LinkType.ASSOCIATION
    link_strength: float = 0.5  # 0.0 to 1.0
    link_description: str | None = None
    link_source: str | None = None  # provenance or rationale for this link - how did I arrive at this connection in my own mind?
    link_source_confidence: float = 1.0  # 0.0 to 1.0 - how confident am I in the source of this link?
    valid_begin_date: datetime | None = None  # when this relationship began in reality
    valid_end_date: datetime | None = None  # when this relationship ended in reality (None = ongoing)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    modified_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: datetime | None = None

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Link":
        return cls(id=doc_id, **data)
