from datetime import date, datetime
from enum import Enum
from pydantic import BaseModel, Field


class BeliefSource(str, Enum):
    USER_DECLARED = "user_declared"
    SYSTEM_INFERRED = "system_inferred"
    SYSTEM_OBSERVED = "system_observed"
    CONVERSATION = "conversation"


class BeliefStrength(str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"
    UNCERTAIN = "uncertain"


class BeliefCategory(str, Enum):
    SELF = "self"
    GOD = "god"
    OTHERS = "others"
    WORLD = "world"


class BeliefValence(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"


class Belief(BaseModel):
    """A truth, preference, belief, or observation about the user.

    These form the user's 'Operating Context' — the system of beliefs
    and observations that describe who they are and how they see the world.
    """

    id: str | None = None
    user_id: str
    statement: str
    source: BeliefSource = BeliefSource.USER_DECLARED
    source_description: str | None = None
    strength: BeliefStrength = BeliefStrength.MODERATE
    category: BeliefCategory | None = None
    valence: BeliefValence | None = None
    is_default: bool = False
    began_on: date | None = None
    ended_on: date | None = None
    captured_at: datetime = Field(default_factory=datetime.utcnow)
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True
    degree: int | None = None  # 1-5, how strongly this belief is held (None = unset)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Belief":
        return cls(id=doc_id, **data)
