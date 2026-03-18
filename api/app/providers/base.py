"""
BaseLLMProvider — abstract interface for LLM providers.

Inspired by LobeHub's LobeRuntimeAI interface which normalizes 40+
providers behind a single surface.  We start with two concrete
implementations (OpenAI-compatible and Anthropic) and make it easy
to add more.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class BaseLLMProvider(ABC):
    """All LLM providers implement these three methods."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str: ...

    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Yield dicts with ``type`` ('token' | 'reasoning') and ``content``."""
        ...

    @abstractmethod
    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
    ) -> dict: ...
