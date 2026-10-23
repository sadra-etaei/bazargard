"""Thin client for any OpenAI-compatible chat endpoint. Every call is optional and fails soft (returns None)."""
import json
import logging
import re

from django.conf import settings

log = logging.getLogger(__name__)
_client = None


def enabled() -> bool:
    return bool(settings.LLM_BASE_URL and settings.LLM_MODEL)


def misconfigured() -> str | None:
    """Credentials present but unusable: tells the user which setting is missing instead of silently using templates."""
    if settings.LLM_BASE_URL and not settings.LLM_MODEL:
        return "LLM_MODEL تنظیم نشده است؛ نام مدل را در فایل .env بگذارید."
    return None


def _get():
    global _client
    if _client is None:
        from openai import OpenAI

        _client = OpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.LLM_API_KEY or "none",
                         timeout=settings.LLM_TIMEOUT, max_retries=0)
    return _client


def _create(kwargs: dict, json_mode: bool):
    """Newer OpenAI-style models reject max_tokens / temperature; retry with the parameters they accept."""
    limit = kwargs["max_tokens"]
    core = {k: v for k, v in kwargs.items() if k not in ("max_tokens", "temperature")}
    json_fmt = {"response_format": {"type": "json_object"}} if json_mode else {}
    attempts = [
        {**core, "max_completion_tokens": limit, "temperature": kwargs["temperature"], **json_fmt},
        {**core, "max_completion_tokens": limit, **json_fmt},  # models that only allow the default temperature
        {**core, "max_completion_tokens": limit},  # no JSON mode
        {**core, "max_tokens": limit, "temperature": kwargs["temperature"]},  # older endpoints
    ]
    last = None
    for params in attempts:
        try:
            return _get().chat.completions.create(**params)
        except Exception as exc:  # unsupported parameter on this endpoint/model: try the next shape
            last = exc
            if "400" not in str(exc):
                break
    raise last


def chat(system: str, user: str, *, json_mode: bool = False, max_tokens: int = 400, temperature: float = 0.2,
         history: list[dict] | None = None) -> str | None:
    if not enabled():
        return None
    # reasoning models spend part of the budget thinking, so leave headroom
    kwargs = {"model": settings.LLM_MODEL, "max_tokens": max_tokens * 4, "temperature": temperature,
              "messages": [{"role": "system", "content": system}, *(history or []), {"role": "user", "content": user}]}
    try:
        resp = _create(kwargs, json_mode)
        return (resp.choices[0].message.content or "").strip() or None
    except Exception as exc:
        log.warning("LLM call failed: %s", exc)
        return None


def chat_json(system: str, user: str, **kw) -> dict | None:
    text = chat(system, user, json_mode=True, **kw)
    if not text:
        return None
    m = re.search(r"\{.*\}", text, re.S)
    try:
        return json.loads(m.group(0) if m else text)
    except (ValueError, AttributeError):
        return None
