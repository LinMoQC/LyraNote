from __future__ import annotations


def _normalize_model(model: str | None) -> str:
    return (model or "").strip().lower()


def openai_reasoning_kwargs(
    model: str | None,
    thinking_enabled: bool | None,
) -> dict[str, str]:
    if not thinking_enabled:
        return {}

    normalized = _normalize_model(model)
    if normalized.startswith(("o1", "o3", "o4", "gpt-5")):
        return {"reasoning_effort": "medium"}

    return {}


def litellm_reasoning_kwargs(
    model: str | None,
    thinking_enabled: bool | None,
) -> dict[str, str]:
    if not thinking_enabled:
        return {}

    normalized = _normalize_model(model)
    if normalized.startswith(("o1", "o3", "o4", "gpt-5", "deepseek-reasoner", "qwq", "gemini-2.5")):
        return {"reasoning_effort": "medium"}
    if "reasoner" in normalized:
        return {"reasoning_effort": "medium"}

    return {}
