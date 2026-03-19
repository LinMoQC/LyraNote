"""
LLM provider abstraction.

All functions delegate to the configured provider via ``provider_factory``.
Supports OpenAI-compatible endpoints (OpenAI, DeepSeek, Ollama) and
Anthropic natively.  Switching providers requires only changing the
``llm_provider`` setting.
"""

from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app.providers.provider_factory import get_provider


def get_client() -> AsyncOpenAI:
    """Return the underlying AsyncOpenAI client from the active provider.

    Escape hatch for scenarios that need the raw client (e.g. LangGraph,
    streaming with custom parameters).  Prefer ``chat`` / ``chat_stream``
    for normal usage.
    """
    from app.config import settings

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
