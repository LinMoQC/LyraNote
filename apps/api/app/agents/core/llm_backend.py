"""
LLM backend abstraction — inspired by Claude Code's dependency injection pattern.

AgentEngine depends on this interface rather than importing app.providers.llm
directly, making it fully testable without monkeypatching import paths.

Usage:
    # Production (default)
    engine = AgentEngine(..., llm_backend=None)  # uses DefaultLLMBackend

    # Tests
    engine = AgentEngine(..., llm_backend=FakeLLMBackend([...canned events...]))
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Protocol, runtime_checkable


@runtime_checkable
class LLMBackend(Protocol):
    """Protocol satisfied by any object that can drive the agent's LLM calls.

    Three call types mirror app.providers.llm:
      - chat_stream_with_tools: unified streaming call; yields token/tool_calls events
      - chat_stream:            text-only streaming; yields token/reasoning events
      - chat:                   blocking single completion; returns the full text
    """

    def chat_stream_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        temperature: float = 0.2,
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        ...

    def chat_stream(
        self,
        messages: list[dict],
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        ...

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> str:
        ...


class DefaultLLMBackend:
    """Production backend — thin pass-through to app.providers.llm.

    Imported lazily so this module remains importable without a configured
    LLM provider (important for unit tests that supply a FakeLLMBackend).
    """

    async def chat_stream_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        temperature: float = 0.2,
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        from app.providers.llm import chat_stream_with_tools

        async for chunk in chat_stream_with_tools(
            messages,
            tools,
            temperature=temperature,
            thinking_enabled=thinking_enabled,
        ):
            yield chunk

    async def chat_stream(
        self,
        messages: list[dict],
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        from app.providers.llm import chat_stream

        async for chunk in chat_stream(messages, thinking_enabled=thinking_enabled):
            yield chunk

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> str:
        from app.providers.llm import chat

        return await chat(messages, model, temperature, max_tokens)
