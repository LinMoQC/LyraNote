"""
OpenAI-compatible LLM provider.

Works with OpenAI, DeepSeek, Ollama, and any other OpenAI-compatible endpoint.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app.providers.base import BaseLLMProvider


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, api_key: str, base_url: str, default_model: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._default_model = default_model

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        kwargs: dict = dict(
            model=model or self._default_model,
            messages=messages,
            temperature=temperature,
        )
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        response = await self._client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    async def chat_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        kwargs: dict = dict(
            model=model or self._default_model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        stream = await self._client.chat.completions.create(**kwargs)
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                yield {"type": "reasoning", "content": reasoning}
            content = delta.content
            if content:
                yield {"type": "token", "content": content}

    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
    ) -> dict:
        tool_list = [{"type": "function", "function": t} for t in tools]
        kwargs: dict = dict(
            model=model or self._default_model,
            messages=messages,
            temperature=temperature,
        )
        if tool_list:
            kwargs["tools"] = tool_list
            kwargs["tool_choice"] = "auto"
        response = await self._client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
            return {
                "finish_reason": "tool_calls",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "name": tc.function.name,
                        "arguments": json.loads(tc.function.arguments or "{}"),
                    }
                    for tc in choice.message.tool_calls
                ],
                "raw_message": choice.message,
            }

        return {
            "finish_reason": "stop",
            "content": choice.message.content or "",
            "raw_message": choice.message,
        }
