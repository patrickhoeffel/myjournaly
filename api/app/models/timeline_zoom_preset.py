from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Anchor = Literal[
    "today",
    "start_of_week",
    "start_of_month",
    "start_of_year",
    "birth_date",
    "earliest_event",
    "latest_event",
    "all_time",
]

Unit = Literal["days", "weeks", "months", "years"]


class TimelineZoomPreset(BaseModel):
    id: str | None = None
    label: str
    anchor: Anchor = "today"
    offset_value: int = 0
    offset_unit: Unit = "days"
    duration_value: int = 1
    duration_unit: Unit = "days"
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_firestore(self) -> dict:
        return self.model_dump(exclude={"id"}, mode="json")

    @classmethod
    def from_firestore(cls, doc_id: str, data: dict) -> "TimelineZoomPreset":
        return cls(id=doc_id, **data)


DEFAULT_PRESETS: list[dict] = [
    {"label": "Today", "anchor": "today", "offset_value": 0, "offset_unit": "days", "duration_value": 1, "duration_unit": "days", "order": 0},
    {"label": "This Week", "anchor": "start_of_week", "offset_value": 0, "offset_unit": "weeks", "duration_value": 1, "duration_unit": "weeks", "order": 1},
    {"label": "Last Week", "anchor": "start_of_week", "offset_value": -1, "offset_unit": "weeks", "duration_value": 1, "duration_unit": "weeks", "order": 2},
    {"label": "Next Week", "anchor": "start_of_week", "offset_value": 1, "offset_unit": "weeks", "duration_value": 1, "duration_unit": "weeks", "order": 3},
    {"label": "This Month", "anchor": "start_of_month", "offset_value": 0, "offset_unit": "months", "duration_value": 1, "duration_unit": "months", "order": 4},
    {"label": "This Year", "anchor": "start_of_year", "offset_value": 0, "offset_unit": "years", "duration_value": 1, "duration_unit": "years", "order": 5},
    {"label": "Last Year", "anchor": "start_of_year", "offset_value": -1, "offset_unit": "years", "duration_value": 1, "duration_unit": "years", "order": 6},
    {"label": "All Time", "anchor": "all_time", "offset_value": 0, "offset_unit": "years", "duration_value": 0, "duration_unit": "years", "order": 7},
]
