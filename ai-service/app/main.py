import hmac
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import ValidationError

load_dotenv()

from . import booking, groq_client, prompts, safety  # noqa: E402
from .schemas import (  # noqa: E402
    Extracted, IntakeIn, IntakeSummary, ParsedBooking, ParseIn, PatientPrep, PatientPrepIn,
)

app = FastAPI(title="Appointment AI service")


def require_key(x_internal_key: str = Header(default="")):
    expected = os.getenv("INTERNAL_KEY", "")
    if not expected or not hmac.compare_digest(x_internal_key, expected):
        raise HTTPException(401, "Unauthorized")


async def ask(system: str, user: str, model_cls):
    try:
        return model_cls.model_validate(await groq_client.chat_json(system, user))
    except groq_client.AIError:
        raise HTTPException(502, "AI provider unavailable")
    except ValidationError:
        raise HTTPException(502, "AI returned an unexpected format")


def check_safe(data):
    try:
        safety.assert_safe(data)
    except safety.UnsafeOutput:
        raise HTTPException(502, "AI output was blocked by the safety filter")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/intake-summary", response_model=IntakeSummary, dependencies=[Depends(require_key)])
async def intake_summary(body: IntakeIn):
    if not (body.symptoms.strip() or body.medications.strip() or body.allergies.strip()):
        raise HTTPException(422, "Nothing to summarise")
    user = prompts.wrap(
        "patient_input",
        f"Appointment type: {body.appointment_type}\nSymptoms: {body.symptoms}\n"
        f"Current medications: {body.medications}\nAllergies: {body.allergies}",
    )
    result = await ask(prompts.INTAKE_SYSTEM, user, IntakeSummary)
    check_safe(result.model_dump())
    # Rule-based red flags always win over the model.
    flags = safety.detect_red_flags(body.symptoms) + result.red_flags
    result.red_flags = list(dict.fromkeys(flags))[:10]
    return result


@app.post("/patient-prep", response_model=PatientPrep, dependencies=[Depends(require_key)])
async def patient_prep(body: PatientPrepIn):
    lines = []
    if body.upcoming:
        u = body.upcoming
        lines.append(f"Upcoming visit: {u.type} with {u.doctor} on {u.date_time}. Symptoms: {u.symptoms}")
    for h in body.history:
        lines.append(f"Past visit {h.date} ({h.type}, {h.status}): {h.notes}")
    lines.append("Medications: " + "; ".join(body.medications))
    result = await ask(prompts.PREP_SYSTEM, prompts.wrap("data", "\n".join(lines)), PatientPrep)
    check_safe(result.model_dump())
    for flag in result.medication_flags:  # fixed wording, never model-written advice
        flag.action = prompts.CONFIRM_ACTION
    return result


@app.post("/parse-booking", response_model=ParsedBooking, dependencies=[Depends(require_key)])
async def parse_booking(body: ParseIn):
    now = body.now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    extracted = await ask(prompts.parse_system(body.types), prompts.wrap("user_text", body.text), Extracted)

    missing = []
    doctor = booking.match_doctor(extracted.doctor_name, body.doctors)
    if not doctor:
        missing.append("doctor")
    type_ = booking.match_type(extracted.type, body.types)
    if not type_:
        missing.append("type")
    when = booking.resolve_datetime(extracted.date_phrase, extracted.time_phrase, now)
    if when is None:
        missing.append("date and time")
    elif when <= now:
        when = None
        missing.append("a future date and time")
    return ParsedBooking(doctor_name=doctor, type=type_, date_time=when, missing=missing)
