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
from app.providers.reasoning import litellm_reasoning_kwargs

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
            drop_params=True,  # silently drop unsupported params (e.g. temperature on O-series)
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
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        kwargs = self._call_kwargs(model, temperature, max_tokens)
        kwargs["stream"] = True
        kwargs.update(litellm_reasoning_kwargs(model or self._default_model, thinking_enabled))
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
        # Normalize tools to OpenAI v2 wrapped format:
        #   {"type": "function", "function": {"name": ..., ...}}
        # Two input shapes are accepted:
        #   (a) Already-wrapped: {"type": "function", "function": {...}}  — e.g. _ROUTE_TOOLS
        #   (b) Flat:            {"name": ..., "description": ..., ...}   — e.g. skill schemas
        # Tools missing a 'name' are dropped to prevent LiteLLM's Gemini adapter
        # from raising KeyError: 'name' (ChatCompletionToolParamFunctionChunk is total=False).
        tool_list: list[dict] = []
        for t in tools:
            if "function" in t:
                # Already wrapped — validate inner name
                if t["function"].get("name"):
                    tool_list.append(t)
                else:
                    logger.warning("Dropped already-wrapped tool with missing inner 'name': %s", t)
            elif t.get("name"):
                # Flat format — wrap it
                tool_list.append({"type": "function", "function": t})
            else:
                logger.warning("Dropped tool with missing 'name': %s", t)
        if tool_list:
            kwargs["tools"] = tool_list
            kwargs["tool_choice"] = "auto"
        try:
            response = await litellm.acompletion(messages=messages, **kwargs)
        except (KeyError, TypeError) as exc:
            # Gemini tool-format conversion can raise KeyError / TypeError for
            # malformed schemas that slip past the guard above.  Fall back to a
            # plain completion so the user still gets an answer.
            logger.warning(
                "Tool-call LLM request failed (%s: %s); retrying without tools",
                type(exc).__name__, exc,
            )
            kwargs.pop("tools", None)
            kwargs.pop("tool_choice", None)
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
