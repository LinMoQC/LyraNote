"""
LLM provider abstraction.

All functions delegate to the configured provider via ``provider_factory``.
Supports OpenAI-compatible endpoints (OpenAI, DeepSeek, Ollama),
Anthropic natively, and any model supported by LiteLLM (Gemini, Mistral, …).
Switching providers requires only changing the ``llm_provider`` setting.
"""

from collections.abc import AsyncGenerator
from typing import Any

from openai import AsyncOpenAI

from app.providers.provider_factory import get_provider


# ── LiteLLM escape-hatch wrapper ─────────────────────────────────────────────

class _LiteLLMCompletions:
    """Mimics ``AsyncOpenAI.chat.completions`` using litellm.acompletion."""

    def __init__(self, api_key: str, base_url: str | None) -> None:
        self._api_key = api_key
        self._base_url = base_url or None

    async def create(self, model: str, messages: list, **kw: Any):
        import litellm
        call_kw: dict = dict(
            model=model,
            messages=messages,
            api_key=self._api_key,
            **kw,
        )
        # Same fix: force Google AI Studio for gemini/ models, not Vertex AI
        if model.startswith("gemini/"):
            call_kw["custom_llm_provider"] = "gemini"
        if self._base_url:
            call_kw["api_base"] = self._base_url
        return await litellm.acompletion(**call_kw)


class _LiteLLMChat:
    def __init__(self, completions: _LiteLLMCompletions) -> None:
        self.completions = completions


class LiteLLMClientWrapper:
    """Drop-in replacement for ``AsyncOpenAI`` when using the litellm provider.

    Exposes only ``client.chat.completions.create()``, which is the only
    interface used by the escape-hatch callers (deep_research, writing, etc.).
    """

    def __init__(self, api_key: str, base_url: str | None) -> None:
        self.chat = _LiteLLMChat(_LiteLLMCompletions(api_key, base_url))


# ── Public helpers ────────────────────────────────────────────────────────────

def get_client() -> AsyncOpenAI | LiteLLMClientWrapper:
    """Return the underlying client from the active provider.

    For OpenAI / Anthropic providers returns a raw ``AsyncOpenAI`` instance.
    For the LiteLLM provider returns a ``LiteLLMClientWrapper`` that proxies
    calls through ``litellm.acompletion``.

    Escape hatch for scenarios that need the raw client (e.g. LangGraph,
    streaming with custom parameters).  Prefer ``chat`` / ``chat_stream``
    for normal usage.
    """
    from app.config import settings

    if settings.llm_provider == "litellm":
        return LiteLLMClientWrapper(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url or None,
        )

    return AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
    )


def get_model() -> str:
    """Return the configured default model name."""
    from app.config import settings
    return settings.llm_model


async def chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> str:
    return await get_provider().chat(messages, model, temperature, max_tokens)


async def chat_stream(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> AsyncGenerator[dict, None]:
    """Yield dicts with ``type`` ('token' | 'reasoning') and ``content``."""
    async for chunk in get_provider().chat_stream(messages, model, temperature, max_tokens):
        yield chunk


async def chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
) -> dict:
    return await get_provider().chat_with_tools(messages, tools, model, temperature)
