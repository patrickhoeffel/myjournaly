from datetime import datetime
from pydantic import BaseModel, Field


class Photo(BaseModel):
    """A user-uploaded photo with its metadata.

    Photos live on their own — not tied to a UserTimelineLine — so the
    TimelineViz can render them in a dedicated band regardless of what
    lines the user has configured. They may be linked to other entities
    (events, people, places, journal entries) via the Links system.
    """

    id: str | None = None
    user_id: str = ""
    # Firebase Storage path (users/{uid}/photos/{uuid}.jpg)
    storage_path: str
    # Public URL for display
    url: str
    # Optional thumbnail URL if generated separately (defaults to url)
    thumbnail_url: str | None = None

    # Original filename provided by the client
    original_filename: str | None = None
    mime_type: str = "image/jpeg"
    size_bytes: int | None = None
    width: int | None = None
    height: int | None = None

    # When the photo was actually taken (from EXIF DateTimeOriginal).
    # Falls back to file mtime, then to upload time.
    taken_at: datetime | None = None

    # GPS from EXIF if present
    gps_lat: float | None = None
    gps_lng: float | None = None
    gps_altitude: float | None = None

    # Additional EXIF fields kept as a free-form blob for future use
    exif: dict | None = None

    # User-editable metadata
    caption: str | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Photo":
        return cls(id=doc_id, **data)
