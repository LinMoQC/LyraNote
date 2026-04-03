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

_DEFAULT_MAX_TOKENS = 4096
_THINKING_MIN_BUDGET_TOKENS = 1024
_THINKING_DEFAULT_BUDGET_TOKENS = 2048
_THINKING_TOP_P = 1.0


_STATIC_DYNAMIC_BOUNDARY = "\n\n<!-- lyranote:dynamic -->\n\n"


def _convert_messages(messages: list[dict]) -> tuple[str | list[dict], list[dict]]:
    """Split an OpenAI-style message list into Anthropic's (system, messages) format.

    Handles three assistant message shapes:
      1. Plain text: {"role": "assistant", "content": "..."}
      2. OpenAI tool-call format: {"role": "assistant", "tool_calls": [...]}
      3. Native Anthropic list content (legacy): {"role": "assistant", "content": [...]}
    """
    system: str | list[dict] = ""
    anthropic_msgs: list[dict] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            text = content if isinstance(content, str) else ""
            # Split on the static/dynamic boundary to apply prompt caching.
            # Anthropic caches the static block (behavior rules) across requests,
            # matching Claude Code's SYSTEM_PROMPT_DYNAMIC_BOUNDARY pattern.
            if _STATIC_DYNAMIC_BOUNDARY in text:
                static_part, dynamic_part = text.split(_STATIC_DYNAMIC_BOUNDARY, 1)
                system = [
                    {
                        "type": "text",
                        "text": static_part.strip(),
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": dynamic_part.strip(),
                    },
                ]
            else:
                system = (system if isinstance(system, str) else "") + text + "\n"
        elif role == "assistant":
            tool_calls = m.get("tool_calls")
            if tool_calls:
                # Convert OpenAI tool_calls format to Anthropic content blocks
                blocks: list[dict] = []
                if content and isinstance(content, str) and content.strip():
                    blocks.append({"type": "text", "text": content})
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    args = fn.get("arguments", "{}")
                    blocks.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": fn["name"],
                        "input": json.loads(args) if isinstance(args, str) else (args or {}),
                    })
                anthropic_msgs.append({"role": "assistant", "content": blocks})
            elif isinstance(content, list):
                # Native Anthropic format already (legacy path)
                anthropic_msgs.append({"role": "assistant", "content": content})
            else:
                anthropic_msgs.append({"role": "assistant", "content": content or ""})
        elif role == "user":
            anthropic_msgs.append({"role": "user", "content": content})
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
    # When system is a list (block format), return as-is; otherwise strip whitespace.
    return (system.strip() if isinstance(system, str) else system), anthropic_msgs


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
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        system, msgs = _convert_messages(messages)
        effective_max_tokens = max_tokens or _DEFAULT_MAX_TOKENS
        kwargs: dict = dict(
            model=model or self._default_model,
            system=system or "You are a helpful assistant.",
            messages=msgs,
            max_tokens=effective_max_tokens,
        )
        if thinking_enabled:
            kwargs["top_p"] = _THINKING_TOP_P
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": _compute_thinking_budget_tokens(effective_max_tokens),
            }
        else:
            kwargs["temperature"] = temperature
        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield {"type": "token", "content": text}

    async def chat_stream_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        thinking_enabled: bool | None = None,
    ):
        system, msgs = _convert_messages(messages)
        anthropic_tools = [
            {
                "name": t["name"],
                "description": t.get("description", ""),
                "input_schema": t.get("parameters", {"type": "object", "properties": {}}),
            }
            for t in tools
        ]
        effective_max_tokens = _DEFAULT_MAX_TOKENS
        kwargs: dict = dict(
            model=model or self._default_model,
            system=system or "You are a helpful assistant.",
            messages=msgs,
            tools=anthropic_tools or None,
            max_tokens=effective_max_tokens,
        )
        if thinking_enabled:
            kwargs["top_p"] = _THINKING_TOP_P
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": _compute_thinking_budget_tokens(effective_max_tokens),
            }
        else:
            kwargs["temperature"] = temperature

        tool_calls: list[dict] = []
        current_tool: dict | None = None
        current_args = ""
        content_parts: list[str] = []

        async with self._client.messages.stream(**kwargs) as stream:
            async for event in stream:
                etype = getattr(event, "type", None)

                if etype == "content_block_start":
                    block = getattr(event, "content_block", None)
                    if block and getattr(block, "type", None) == "tool_use":
                        current_tool = {"id": block.id, "name": block.name}
                        current_args = ""
                    elif block and getattr(block, "type", None) == "thinking":
                        pass  # thinking block start — content comes in deltas

                elif etype == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta is None:
                        continue
                    dtype = getattr(delta, "type", None)
                    if dtype == "text_delta":
                        text = getattr(delta, "text", "")
                        if text:
                            content_parts.append(text)
                            yield {"type": "token", "content": text}
                    elif dtype == "thinking_delta":
                        thinking = getattr(delta, "thinking", "")
                        if thinking:
                            yield {"type": "reasoning", "content": thinking}
                    elif dtype == "input_json_delta" and current_tool is not None:
                        current_args += getattr(delta, "partial_json", "")

                elif etype == "content_block_stop":
                    if current_tool is not None:
                        tool_calls.append({
                            "id": current_tool["id"],
                            "name": current_tool["name"],
                            "arguments": json.loads(current_args or "{}"),
                        })
                        current_tool = None
                        current_args = ""

            # Emit actual token usage from the completed message
            try:
                final_msg = await stream.get_final_message()
                if final_msg.usage:
                    yield {
                        "type": "usage",
                        "input_tokens": final_msg.usage.input_tokens,
                        "output_tokens": final_msg.usage.output_tokens,
                    }
            except Exception:
                pass

        if tool_calls:
            # Build OpenAI-format raw_assistant for state.messages
            blocks: list[dict] = []
            if content_parts:
                blocks.append({"type": "text", "text": "".join(content_parts)})
            for tc in tool_calls:
                blocks.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["arguments"],
                })
            message_tool_calls = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"], ensure_ascii=False),
                    },
                }
                for tc in tool_calls
            ]
            yield {
                "type": "tool_calls",
                "calls": tool_calls,
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


def _compute_thinking_budget_tokens(max_tokens: int) -> int:
    budget_tokens = min(_THINKING_DEFAULT_BUDGET_TOKENS, max_tokens - 1)
    if budget_tokens < _THINKING_MIN_BUDGET_TOKENS:
        raise ValueError(
            "Anthropic thinking requires max_tokens > 1024 so budget_tokens can be at least 1024 and strictly less than max_tokens."
        )
    return budget_tokens
