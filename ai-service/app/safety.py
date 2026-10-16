"""Code-level safety checks. We never rely on the prompt alone."""
import re

_BLOCKED = [re.compile(p, re.I) for p in [
    r"\b(stop|discontinue|quit|cease)\s+(taking|using)\b",
    r"\b(start|begin|try)\s+(taking|using)\b",
    r"\b(increase|decrease|reduce|double|halve|skip|adjust|change)\b[^.]{0,30}\b(dose|dosage)\b",
    r"\byou (probably|likely|may|might) have\b",
    r"\byou are suffering from\b",
    r"\b(safe|fine|okay|ok) to (take|combine|mix|use)\b",
    r"\bno need to (see|worry)\b",
]]

RED_FLAG_TERMS = [
    "chest pain", "shortness of breath", "difficulty breathing", "trouble breathing", "can't breathe",
    "cannot breathe", "stroke", "unconscious", "fainting", "severe bleeding", "suicid", "seizure",
    "coughing blood", "vomiting blood", "face drooping", "slurred speech",
]


class UnsafeOutput(Exception):
    pass


def _strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _strings(v)


def assert_safe(data) -> None:
    for s in _strings(data):
        for pattern in _BLOCKED:
            if pattern.search(s):
                raise UnsafeOutput(pattern.pattern)


def detect_red_flags(text: str) -> list[str]:
    t = (text or "").lower()
    return [term for term in RED_FLAG_TERMS if term in t]
