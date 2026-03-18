"""
LLM provider abstraction.

All functions delegate to the configured provider via ``provider_factory``.
Supports OpenAI-compatible endpoints (OpenAI, DeepSeek, Ollama) and
Anthropic natively.  Switching providers requires only changing the
``llm_provider`` setting.
"""

from collections.abc import AsyncGenerator

from app.providers.provider_factory import get_provider


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
