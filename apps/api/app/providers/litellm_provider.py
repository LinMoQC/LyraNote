"""
LiteLLM provider — universal adapter for 100+ LLM APIs.

Supports Gemini, Mistral, Cohere, Anthropic, Ollama, etc.
Model names must include the provider prefix, e.g.:
  gemini/gemini-2.0-flash
  mistral/mistral-large-latest
  ollama/llama3
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

import litellm

from app.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)

# Suppress litellm's verbose startup banners and per-request debug logs.
# Without this, every LLM call dumps the full request/response payload to
# stderr which (a) floods the terminal, and (b) causes the lyra CLI process
# to OOM when processing large MCP responses like excalidraw read_me.
litellm.suppress_debug_info = True
# LiteLLM has two log systems:
# 1. Standard Python logging (controlled by getLogger)
# 2. Its own internal verbose logger that prints "· POST Request Sent..." to stdout
#    — must be silenced via set_verbose=False
litellm.set_verbose = False
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
logging.getLogger("litellm").setLevel(logging.WARNING)


class LiteLLMProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str | None,
        default_model: str,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url or None
        self._default_model = default_model

    def _call_kwargs(self, model: str | None, temperature: float, max_tokens: int | None) -> dict:
        actual_model = model or self._default_model
        kwargs: dict = dict(
            model=actual_model,
            temperature=temperature,
            api_key=self._api_key,
        )
        # Force Google AI Studio REST API for gemini/ models.
        # Without this, LiteLLM detects google-cloud-aiplatform and falls through
        # to Vertex AI which requires Application Default Credentials (ADC).
        if actual_model.startswith("gemini/"):
            kwargs["custom_llm_provider"] = "gemini"
        if self._base_url:
            kwargs["api_base"] = self._base_url
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        return kwargs

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        kwargs = self._call_kwargs(model, temperature, max_tokens)
        response = await litellm.acompletion(messages=messages, **kwargs)
        return response.choices[0].message.content or ""

    async def chat_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        kwargs = self._call_kwargs(model, temperature, max_tokens)
        kwargs["stream"] = True
        stream = await litellm.acompletion(messages=messages, **kwargs)
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                yield {"type": "reasoning", "content": reasoning}
            content = getattr(delta, "content", None)
            if content:
                yield {"type": "token", "content": content}

    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
    ) -> dict:
        kwargs = self._call_kwargs(model, temperature, None)
        tool_list = [{"type": "function", "function": t} for t in tools]
        if tool_list:
            kwargs["tools"] = tool_list
            kwargs["tool_choice"] = "auto"
        response = await litellm.acompletion(messages=messages, **kwargs)
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
