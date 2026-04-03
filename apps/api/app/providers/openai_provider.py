"""
OpenAI-compatible LLM provider.

Works with OpenAI, DeepSeek, Ollama, and any other OpenAI-compatible endpoint.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI
from httpx import Timeout

from app.providers.base import BaseLLMProvider
from app.providers.reasoning import openai_reasoning_kwargs

_HTTP_TIMEOUT = Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, api_key: str, base_url: str, default_model: str) -> None:
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=_HTTP_TIMEOUT,
            max_retries=2,
        )
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
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        actual_model = model or self._default_model
        kwargs: dict = dict(
            model=actual_model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        kwargs.update(openai_reasoning_kwargs(actual_model, thinking_enabled))
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

    async def chat_stream_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        thinking_enabled: bool | None = None,
    ):
        actual_model = model or self._default_model
        tool_list = [{"type": "function", "function": t} for t in tools]
        kwargs: dict = dict(
            model=actual_model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        if tool_list:
            kwargs["tools"] = tool_list
            kwargs["tool_choice"] = "auto"
        kwargs.update(openai_reasoning_kwargs(actual_model, thinking_enabled))

        # Request usage data in the final chunk (supported by OpenAI and most compatible providers).
        kwargs["stream_options"] = {"include_usage": True}

        # Accumulate tool call deltas by index across chunks
        accumulated: dict[int, dict] = {}  # index → {id, name, arguments}
        content_parts: list[str] = []
        api_usage: dict | None = None

        stream = await self._client.chat.completions.create(**kwargs)
        async for chunk in stream:
            # Usage-only chunk (empty choices) emitted at end when include_usage=True
            if not chunk.choices:
                if getattr(chunk, "usage", None) is not None:
                    api_usage = {
                        "input_tokens": chunk.usage.prompt_tokens or 0,
                        "output_tokens": chunk.usage.completion_tokens or 0,
                    }
                continue
            delta = chunk.choices[0].delta

            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                yield {"type": "reasoning", "content": reasoning}

            if delta.content:
                content_parts.append(delta.content)
                yield {"type": "token", "content": delta.content}

            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in accumulated:
                        accumulated[idx] = {"id": "", "name": "", "arguments": ""}
                    if tc_delta.id:
                        accumulated[idx]["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            accumulated[idx]["name"] += tc_delta.function.name
                        if tc_delta.function.arguments:
                            accumulated[idx]["arguments"] += tc_delta.function.arguments

        if api_usage is not None:
            yield {"type": "usage", **api_usage}

        if accumulated:
            calls = []
            message_tool_calls = []
            for idx in sorted(accumulated):
                tc = accumulated[idx]
                calls.append({
                    "id": tc["id"],
                    "name": tc["name"],
                    "arguments": json.loads(tc["arguments"] or "{}"),
                })
                message_tool_calls.append({
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                })
            yield {
                "type": "tool_calls",
                "calls": calls,
                "raw_assistant": {
                    "role": "assistant",
                    "content": "".join(content_parts) or None,
                    "tool_calls": message_tool_calls,
                },
            }

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
