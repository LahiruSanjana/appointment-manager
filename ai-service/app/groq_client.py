"""Thin Groq client: JSON mode, temperature 0, 15s timeout, one retry."""
import json
import os

import httpx

URL = "https://api.groq.com/openai/v1/chat/completions"


class AIError(Exception):
    pass


async def chat_json(system: str, user: str) -> dict:
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise AIError("GROQ_API_KEY is not set")
    payload = {
        "model": os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    last = None
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(2):
            try:
                r = await client.post(URL, json=payload, headers={"Authorization": f"Bearer {key}"})
                r.raise_for_status()
                return json.loads(r.json()["choices"][0]["message"]["content"])
            except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
                last = e
    raise AIError("Groq request failed") from last
