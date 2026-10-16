"""Deterministic helpers: the LLM only extracts phrases; code does matching and date maths."""
import difflib
import os
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import dateparser

TZ = ZoneInfo(os.getenv("CLINIC_TZ", "Asia/Colombo"))


def _norm_doctor(s: str) -> str:
    s = re.sub(r"\b(dr|doctor)\b\.?", "", s.lower())
    return re.sub(r"[^a-z0-9]", "", s)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def match_doctor(name, doctors):
    if not name:
        return None
    n = _norm_doctor(name)
    table = {k: d for d in doctors if (k := _norm_doctor(d))}
    if not n or not table:
        return None
    if n in table:
        return table[n]
    hits = [d for k, d in table.items() if n in k or k in n]
    if len(hits) == 1:
        return hits[0]
    close = difflib.get_close_matches(n, list(table), n=1, cutoff=0.75)
    return table[close[0]] if close else None


def match_type(value, types):
    if not value:
        return None
    n = _norm(value)
    table = {_norm(t): t for t in types}
    if n in table:
        return table[n]
    close = difflib.get_close_matches(n, list(table), n=1, cutoff=0.8)
    return table[close[0]] if close else None


_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_NEXT_WEEKDAY = re.compile(r"\bnext\s+(" + "|".join(_WEEKDAYS) + r")\b", re.I)


def _expand_next_weekday(text: str, today) -> str:
    """dateparser can't read "next Tuesday". Treat it as that weekday in the NEXT calendar week."""
    def repl(m):
        monday_next = today + timedelta(days=7 - today.weekday())
        return (monday_next + timedelta(days=_WEEKDAYS.index(m.group(1).lower()))).isoformat()
    return _NEXT_WEEKDAY.sub(repl, text)


def resolve_datetime(date_phrase, time_phrase, now: datetime):
    """Both a date phrase and a time phrase are required, so we never guess a time."""
    if not (date_phrase and time_phrase):
        return None
    base = now.astimezone(TZ).replace(tzinfo=None)
    text = _expand_next_weekday(f"{date_phrase} {time_phrase}", base.date())
    return dateparser.parse(
        text,
        settings={
            "RELATIVE_BASE": base,
            "PREFER_DATES_FROM": "future",
            "TIMEZONE": TZ.key,
            "RETURN_AS_TIMEZONE_AWARE": True,
        },
    )
