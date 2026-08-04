from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class AnswerType(str, Enum):
    SHORT_ANSWER = "short_answer"
    LONG_ANSWER = "long_answer"
    SELECT_ONE = "select_one"
    SELECT_ONE_OR_MORE = "select_one_or_more"
    SELECT_ZERO_OR_MORE = "select_zero_or_more"
    RANGE = "range"  # e.g. 1-10
    YES_NO = "yes_no"
    NUMBER = "number"


class SurveyQuestion(BaseModel):
    """A single question within a survey section."""

    id: str | None = None
    survey_id: str
    section_id: str
    text: str
    answer_type: AnswerType
    options: list[str] = Field(default_factory=list)  # for select_* types
    range_min: int = 1  # for range type
    range_max: int = 10
    range_min_label: str | None = None  # e.g. "Strongly disagree"
    range_max_label: str | None = None  # e.g. "Strongly agree"
    order: int = 0
    is_required: bool = True
    score_weights: dict[str, float] = Field(default_factory=dict)  # option_value -> score

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "SurveyQuestion":
        return cls(id=doc_id, **data)


class SurveySection(BaseModel):
    """A group of questions within a survey."""

    id: str | None = None
    survey_id: str
    title: str
    description: str | None = None
    order: int = 0

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "SurveySection":
        return cls(id=doc_id, **data)


class Survey(BaseModel):
    """A survey definition linked to a resource of type 'survey'."""

    id: str | None = None
    resource_id: str  # links to the parent Resource
    title: str
    description: str | None = None
    randomize_sections: bool = False
    randomize_questions: bool = False
    allow_back: bool = True  # can user go back to previous questions
    show_progress: bool = True
    scoring_enabled: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "Survey":
        return cls(id=doc_id, **data)


class SurveyResponse(BaseModel):
    """A user's response session for a survey."""

    id: str | None = None
    survey_id: str
    user_id: str
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    total_score: float | None = None

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "SurveyResponse":
        return cls(id=doc_id, **data)


class SurveyAnswer(BaseModel):
    """A single answer within a survey response."""

    id: str | None = None
    response_id: str
    question_id: str
    value: str  # text for short/long answer, selected option(s) as JSON, number for range
    score: float | None = None
    answered_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "SurveyAnswer":
        return cls(id=doc_id, **data)
