from datetime import date, datetime
from enum import Enum
from pydantic import BaseModel, Field


class ResourceType(str, Enum):
    WEBSITE = "website"
    COURSE = "course"
    VIDEO = "video"
    PODCAST = "podcast"
    TEACHING = "teaching"
    BIBLE_VERSE = "bible_verse"
    BOOK = "book"
    ARTICLE = "article"
    WORKSHEET = "worksheet"
    EXERCISE = "exercise"
    QUESTION = "question"
    SURVEY = "survey"
    OTHER = "other"


class Resource(BaseModel):
    """A system-level resource managed by admins. Users get access via ResourceAccess grants."""

    id: str | None = None
    title: str
    resource_type: ResourceType
    url: str | None = None
    description: str | None = None
    content: str | None = None  # inline content for worksheets, exercises, etc.
    reference: str | None = None  # e.g. "John 3:16" for Bible verses
    author: str | None = None
    group_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Resource":
        return cls(id=doc_id, **data)


class ResourceGroup(BaseModel):
    """A logical grouping of resources (e.g. 'Grief Recovery Program', 'Bible Study Basics')."""

    id: str | None = None
    name: str
    description: str | None = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "ResourceGroup":
        return cls(id=doc_id, **data)


class AccessLevel(str, Enum):
    VIEW = "view"
    INTERACT = "interact"
    FULL = "full"


class ResourceAccess(BaseModel):
    """Grants a user access to a specific resource or resource group."""

    id: str | None = None
    user_id: str
    resource_id: str | None = None  # direct resource grant
    group_id: str | None = None  # group-level grant
    access_level: AccessLevel = AccessLevel.VIEW
    begin_date: date
    end_date: date | None = None
    granted_at: datetime = Field(default_factory=datetime.utcnow)
    granted_by: str | None = None  # admin user_id
    grant_justification: str | None = None
    revoked_at: datetime | None = None
    revoked_by: str | None = None
    revoke_reason: str | None = None

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "ResourceAccess":
        return cls(id=doc_id, **data)
