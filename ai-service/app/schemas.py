from datetime import datetime

from pydantic import BaseModel, Field, field_validator


def clip_str(v, n):
    return v[:n] if isinstance(v, str) else v


def clip_list(v, items=10, n=300):
    return [clip_str(x, n) for x in v[:items]] if isinstance(v, list) else v


# ---------- inputs ----------
class IntakeIn(BaseModel):
    symptoms: str = Field("", max_length=1000)
    medications: str = Field("", max_length=1000)
    allergies: str = Field("", max_length=1000)
    appointment_type: str = Field("", max_length=50)


class Upcoming(BaseModel):
    doctor: str = Field("", max_length=100)
    type: str = Field("", max_length=50)
    date_time: str = Field("", max_length=40)
    symptoms: str = Field("", max_length=1000)


class HistoryItem(BaseModel):
    date: str = Field("", max_length=30)
    type: str = Field("", max_length=50)
    status: str = Field("", max_length=20)
    notes: str = Field("", max_length=500)


class PatientPrepIn(BaseModel):
    upcoming: Upcoming | None = None
    history: list[HistoryItem] = Field(default_factory=list, max_length=10)
    medications: list[str] = Field(default_factory=list, max_length=30)


class ParseIn(BaseModel):
    text: str = Field(min_length=3, max_length=300)
    doctors: list[str] = Field(default_factory=list, max_length=100)
    types: list[str] = Field(default_factory=list, max_length=20)
    now: datetime | None = None  # injectable for tests


# ---------- LLM outputs (validated, never trusted) ----------
class IntakeSummary(BaseModel):
    summary: str
    key_symptoms: list[str] = []
    medications: list[str] = []
    allergies: list[str] = []
    red_flags: list[str] = []

    @field_validator("summary", mode="before")
    @classmethod
    def _summary(cls, v):
        return clip_str(v, 800)

    @field_validator("key_symptoms", "medications", "allergies", "red_flags", mode="before")
    @classmethod
    def _lists(cls, v):
        return clip_list(v)


class MedFlag(BaseModel):
    medication: str
    concern: str
    action: str = ""

    @field_validator("medication", "concern", "action", mode="before")
    @classmethod
    def _s(cls, v):
        return clip_str(v, 300)


class PatientPrep(BaseModel):
    things_to_tell_doctor: list[str] = []
    questions_to_ask: list[str] = []
    medication_flags: list[MedFlag] = []

    @field_validator("things_to_tell_doctor", "questions_to_ask", mode="before")
    @classmethod
    def _lists(cls, v):
        return clip_list(v, 6)

    @field_validator("medication_flags", mode="before")
    @classmethod
    def _flags(cls, v):
        return v[:10] if isinstance(v, list) else v


class Extracted(BaseModel):
    doctor_name: str | None = None
    type: str | None = None
    date_phrase: str | None = None
    time_phrase: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _clip(cls, v):
        return clip_str(v, 60)


class ParsedBooking(BaseModel):
    doctor_name: str | None
    type: str | None
    date_time: datetime | None
    missing: list[str]
