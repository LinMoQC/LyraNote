"""
LLM provider abstraction.
Default implementation uses the OpenAI chat completions API.
Supports any OpenAI-compatible endpoint (e.g. Ollama, DeepSeek).
"""

from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
    return _client


async def chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> str:
    client = _get_client()
    kwargs: dict = dict(
        model=model or settings.llm_model,
        messages=messages,
        temperature=temperature,
    )
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    response = await client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


async def chat_stream(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> AsyncGenerator[str, None]:
    client = _get_client()
    kwargs: dict = dict(
        model=model or settings.llm_model,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    stream = await client.chat.completions.create(**kwargs)
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
) -> dict:
    """
    Single (non-streaming) call with OpenAI function/tool calling.
    Returns a dict with:
      finish_reason: "tool_calls" | "stop"
      tool_calls: list of {"id", "name", "arguments" (dict)} — when finish_reason=="tool_calls"
      content: str — when finish_reason=="stop"
    """
    client = _get_client()
    tool_list = [{"type": "function", "function": t} for t in tools]
    kwargs: dict = dict(
        model=model or settings.llm_model,
        messages=messages,
        temperature=temperature,
    )
    if tool_list:
        kwargs["tools"] = tool_list
        kwargs["tool_choice"] = "auto"
    response = await client.chat.completions.create(**kwargs)
    choice = response.choices[0]
    finish_reason = choice.finish_reason

    if finish_reason == "tool_calls" and choice.message.tool_calls:
        return {
            "finish_reason": "tool_calls",
            "tool_calls": [
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": __import__("json").loads(tc.function.arguments or "{}"),
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
