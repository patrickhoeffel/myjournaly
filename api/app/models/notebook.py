from datetime import datetime
from pydantic import BaseModel, Field


class Shelf(BaseModel):
    """Top-level organizer for notebooks."""

    id: str | None = None
    user_id: str = ""
    name: str
    icon: str | None = None
    color: str | None = None
    order: int = 0
    is_default: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Shelf":
        return cls(id=doc_id, **data)


class Notebook(BaseModel):
    """Mid-level organizer within a shelf."""

    id: str | None = None
    user_id: str = ""
    shelf_id: str
    name: str
    icon: str | None = None
    color: str | None = None
    order: int = 0
    is_default: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Notebook":
        return cls(id=doc_id, **data)


class Tag(BaseModel):
    """A managed tag entity owned by a user."""

    id: str | None = None
    user_id: str = ""
    name: str
    color: str | None = None
    is_default: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Tag":
        return cls(id=doc_id, **data)


# --- Admin templates ---


class ShelfTemplate(BaseModel):
    """Admin-defined shelf template. Part of a template set."""

    id: str | None = None
    template_set_id: str
    name: str
    icon: str | None = None
    color: str | None = None
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "ShelfTemplate":
        return cls(id=doc_id, **data)


class NotebookTemplate(BaseModel):
    """Admin-defined notebook template. Belongs to a shelf template."""

    id: str | None = None
    shelf_template_id: str
    name: str
    icon: str | None = None
    color: str | None = None
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "NotebookTemplate":
        return cls(id=doc_id, **data)


class TemplateSet(BaseModel):
    """A named collection of shelf/notebook templates (e.g. 'Spiritual Growth', 'Therapy')."""

    id: str | None = None
    name: str
    description: str | None = None
    is_default: bool = False  # the "General" starter set
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "TemplateSet":
        return cls(id=doc_id, **data)
