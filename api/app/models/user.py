from datetime import date, datetime
from enum import Enum
from pydantic import BaseModel, Field


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    NON_BINARY = "non_binary"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"
    OTHER = "other"


class UserRole(str, Enum):
    USER = "user"
    PROVIDER = "provider"
    ADMIN = "admin"


class AccountStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class UserProfile(BaseModel):
    id: str | None = None
    firebase_uid: str
    email: str
    display_name: str
    role: UserRole = UserRole.USER
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: date | None = None
    place_of_birth: str | None = None
    gender: Gender | None = None
    ethnicity: str | None = None
    religious_affiliation: str | None = None
    photo_url: str | None = None
    account_status: AccountStatus = AccountStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        data = self.model_dump(exclude={"id"}, mode="json")
        return data

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "UserProfile":
        return cls(id=doc_id, **data)
