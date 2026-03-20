"""
Anthropic LLM provider.

Uses the Anthropic Python SDK to support Claude models natively
(instead of routing through an OpenAI-compatible proxy).
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

from app.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)


def _convert_messages(messages: list[dict]) -> tuple[str, list[dict]]:
    """Split an OpenAI-style message list into Anthropic's (system, messages) format."""
    system = ""
    anthropic_msgs: list[dict] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            system += content + "\n"
        elif role in ("user", "assistant"):
            anthropic_msgs.append({"role": role, "content": content})
        elif role == "tool":
            anthropic_msgs.append({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": m.get("tool_call_id", ""),
                        "content": content,
                    }
                ],
            })
    return system.strip(), anthropic_msgs


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, api_key: str, default_model: str = "claude-sonnet-4-20250514") -> None:
        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:
            raise ImportError("pip install anthropic") from exc
        self._client = AsyncAnthropic(api_key=api_key)
        self._default_model = default_model

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        system, msgs = _convert_messages(messages)
        response = await self._client.messages.create(
            model=model or self._default_model,
            system=system or "You are a helpful assistant.",
            messages=msgs,
            temperature=temperature,
            max_tokens=max_tokens or 4096,
        )
        return response.content[0].text if response.content else ""

    async def chat_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        system, msgs = _convert_messages(messages)
        async with self._client.messages.stream(
            model=model or self._default_model,
            system=system or "You are a helpful assistant.",
            messages=msgs,
            temperature=temperature,
            max_tokens=max_tokens or 4096,
        ) as stream:
            async for text in stream.text_stream:
                yield {"type": "token", "content": text}

    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
    ) -> dict:
        system, msgs = _convert_messages(messages)

        anthropic_tools = []
        for t in tools:
            anthropic_tools.append({
                "name": t["name"],
                "description": t.get("description", ""),
                "input_schema": t.get("parameters", {"type": "object", "properties": {}}),
            })

        response = await self._client.messages.create(
            model=model or self._default_model,
            system=system or "You are a helpful assistant.",
            messages=msgs,
            tools=anthropic_tools or None,
            temperature=temperature,
            max_tokens=4096,
        )

        tool_calls = []
        text_content = ""
        for block in response.content:
            if block.type == "tool_use":
                tool_calls.append({
                    "id": block.id,
                    "name": block.name,
                    "arguments": block.input if isinstance(block.input, dict) else {},
                })
            elif block.type == "text":
                text_content += block.text

        if tool_calls:
            return {
                "finish_reason": "tool_calls",
                "tool_calls": tool_calls,
                "raw_message": response,
            }

        return {
            "finish_reason": "stop",
            "content": text_content,
            "raw_message": response,
        }
