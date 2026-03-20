"""
Tests for app/providers/openai_provider.py

OpenAIProvider methods are tested by mocking the AsyncOpenAI client.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from app.providers.openai_provider import OpenAIProvider


# ── Helpers ────────────────────────────────────────────────────────────────────

def make_provider(model: str = "gpt-4o-mini") -> tuple[OpenAIProvider, MagicMock]:
    """Create an OpenAIProvider with a mocked AsyncOpenAI client."""
    with patch("app.providers.openai_provider.AsyncOpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        provider = OpenAIProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            default_model=model,
        )
        provider._client = mock_client
    return provider, mock_client


def _make_completion_response(content: str, finish_reason: str = "stop") -> MagicMock:
    msg = MagicMock()
    msg.content = content
    msg.tool_calls = None
    choice = MagicMock()
    choice.message = msg
    choice.finish_reason = finish_reason
    resp = MagicMock()
    resp.choices = [choice]
    return resp


# ── OpenAIProvider.chat ────────────────────────────────────────────────────────

class TestOpenAIProviderChat:
    @pytest.mark.asyncio
    async def test_chat_returns_string(self):
        provider, mock_client = make_provider()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("Hello!")
        )

        result = await provider.chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello!"

    @pytest.mark.asyncio
    async def test_chat_empty_content_returns_empty_string(self):
        provider, mock_client = make_provider()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response(None)
        )

        result = await provider.chat([{"role": "user", "content": "Hi"}])
        assert result == ""

    @pytest.mark.asyncio
    async def test_chat_uses_default_model(self):
        provider, mock_client = make_provider(model="gpt-4o")
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("reply")
        )

        await provider.chat([{"role": "user", "content": "test"}])
        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "gpt-4o"

    @pytest.mark.asyncio
    async def test_chat_uses_override_model(self):
        provider, mock_client = make_provider(model="gpt-4o")
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("reply")
        )

        await provider.chat([{"role": "user", "content": "test"}], model="gpt-3.5-turbo")
        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "gpt-3.5-turbo"

    @pytest.mark.asyncio
    async def test_chat_includes_temperature(self):
        provider, mock_client = make_provider()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("reply")
        )

        await provider.chat([{"role": "user", "content": "test"}], temperature=0.2)
        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["temperature"] == 0.2

    @pytest.mark.asyncio
    async def test_chat_no_max_tokens_by_default(self):
        provider, mock_client = make_provider()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("reply")
        )

        await provider.chat([{"role": "user", "content": "test"}])
        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert "max_tokens" not in call_kwargs

    @pytest.mark.asyncio
    async def test_chat_with_max_tokens(self):
        provider, mock_client = make_provider()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("reply")
        )

        await provider.chat([{"role": "user", "content": "test"}], max_tokens=200)
        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["max_tokens"] == 200


# ── OpenAIProvider.chat_stream ─────────────────────────────────────────────────

class TestOpenAIProviderChatStream:
    def _make_chunk(self, content=None, reasoning=None):
        """Create a mock streaming chunk."""
        delta = MagicMock()
        delta.content = content
        delta.reasoning_content = reasoning  # Only some models set this
        if not hasattr(delta, "reasoning_content"):
            type(delta).reasoning_content = PropertyMock(return_value=None)

        choice = MagicMock()
        choice.delta = delta

        chunk = MagicMock()
        chunk.choices = [choice]
        return chunk

    @pytest.mark.asyncio
    async def test_stream_yields_token_events(self):
        provider, mock_client = make_provider()

        chunks = [
            self._make_chunk(content="Hello"),
            self._make_chunk(content=" world"),
        ]

        async def mock_stream():
            for c in chunks:
                yield c

        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())

        results = []
        async for event in provider.chat_stream([{"role": "user", "content": "hi"}]):
            results.append(event)

        token_events = [e for e in results if e["type"] == "token"]
        assert len(token_events) == 2
        assert token_events[0]["content"] == "Hello"
        assert token_events[1]["content"] == " world"

    @pytest.mark.asyncio
    async def test_stream_skips_empty_chunks(self):
        provider, mock_client = make_provider()

        chunks = [
            self._make_chunk(content=None),
            self._make_chunk(content="data"),
            self._make_chunk(content=None),
        ]

        async def mock_stream():
            for c in chunks:
                yield c

        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())

        results = []
        async for event in provider.chat_stream([{"role": "user", "content": "hi"}]):
            results.append(event)

        assert len(results) == 1
        assert results[0]["content"] == "data"

    @pytest.mark.asyncio
    async def test_stream_skips_chunks_without_choices(self):
        provider, mock_client = make_provider()

        chunk_no_choices = MagicMock()
        chunk_no_choices.choices = []
        chunk_with_content = self._make_chunk(content="text")

        async def mock_stream():
            yield chunk_no_choices
            yield chunk_with_content

        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())

        results = []
        async for event in provider.chat_stream([{"role": "user", "content": "hi"}]):
            results.append(event)

        assert len(results) == 1
        assert results[0]["content"] == "text"

    @pytest.mark.asyncio
    async def test_stream_yields_reasoning_events(self):
        """reasoning_content in delta produces 'reasoning' type events."""
        provider, mock_client = make_provider()

        delta = MagicMock()
        delta.content = None
        delta.reasoning_content = "internal thought"

        choice = MagicMock()
        choice.delta = delta

        chunk = MagicMock()
        chunk.choices = [choice]

        async def mock_stream():
            yield chunk

        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())

        results = []
        async for event in provider.chat_stream([{"role": "user", "content": "hi"}]):
            results.append(event)

        reasoning_events = [e for e in results if e["type"] == "reasoning"]
        assert len(reasoning_events) == 1
        assert reasoning_events[0]["content"] == "internal thought"

    @pytest.mark.asyncio
    async def test_stream_uses_default_model(self):
        provider, mock_client = make_provider(model="gpt-4o")

        async def mock_stream():
            return
            yield  # pragma: no cover

        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())

        async for _ in provider.chat_stream([{"role": "user", "content": "test"}]):
            pass

        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "gpt-4o"
        assert call_kwargs["stream"] is True

    @pytest.mark.asyncio
    async def test_stream_with_max_tokens(self):
        provider, mock_client = make_provider()

        async def mock_stream():
            return
            yield  # pragma: no cover

        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())

        async for _ in provider.chat_stream(
            [{"role": "user", "content": "test"}], max_tokens=500
        ):
            pass

        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["max_tokens"] == 500

    @pytest.mark.asyncio
    async def test_stream_without_max_tokens_not_included(self):
        provider, mock_client = make_provider()

        async def mock_stream():
            return
            yield  # pragma: no cover

        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())

        async for _ in provider.chat_stream([{"role": "user", "content": "test"}]):
            pass

        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert "max_tokens" not in call_kwargs


# ── OpenAIProvider.chat_with_tools ─────────────────────────────────────────────

class TestOpenAIProviderChatWithTools:
    def _make_tool_call(self, id: str, name: str, arguments: str) -> MagicMock:
        func = MagicMock()
        func.name = name
        func.arguments = arguments
        tc = MagicMock()
        tc.id = id
        tc.function = func
        return tc

    @pytest.mark.asyncio
    async def test_tool_calls_response(self):
        provider, mock_client = make_provider()

        tc = self._make_tool_call("tc1", "search", '{"query": "test"}')
        msg = MagicMock()
        msg.content = None
        msg.tool_calls = [tc]

        choice = MagicMock()
        choice.finish_reason = "tool_calls"
        choice.message = msg

        resp = MagicMock()
        resp.choices = [choice]
        mock_client.chat.completions.create = AsyncMock(return_value=resp)

        tools = [{"name": "search", "description": "Search"}]
        result = await provider.chat_with_tools(
            [{"role": "user", "content": "Find info"}], tools=tools
        )

        assert result["finish_reason"] == "tool_calls"
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["id"] == "tc1"
        assert result["tool_calls"][0]["name"] == "search"
        assert result["tool_calls"][0]["arguments"] == {"query": "test"}

    @pytest.mark.asyncio
    async def test_stop_response(self):
        provider, mock_client = make_provider()

        msg = MagicMock()
        msg.content = "The answer is 42."
        msg.tool_calls = None

        choice = MagicMock()
        choice.finish_reason = "stop"
        choice.message = msg

        resp = MagicMock()
        resp.choices = [choice]
        mock_client.chat.completions.create = AsyncMock(return_value=resp)

        result = await provider.chat_with_tools(
            [{"role": "user", "content": "What is the answer?"}], tools=[]
        )

        assert result["finish_reason"] == "stop"
        assert result["content"] == "The answer is 42."

    @pytest.mark.asyncio
    async def test_tools_formatted_as_function_list(self):
        provider, mock_client = make_provider()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("reply")
        )

        tools = [{"name": "my_tool", "description": "Does something"}]
        await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=tools
        )

        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["tools"] == [{"type": "function", "function": tools[0]}]
        assert call_kwargs["tool_choice"] == "auto"

    @pytest.mark.asyncio
    async def test_empty_tools_no_tool_fields_in_request(self):
        provider, mock_client = make_provider()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_completion_response("reply")
        )

        await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=[]
        )

        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert "tools" not in call_kwargs
        assert "tool_choice" not in call_kwargs

    @pytest.mark.asyncio
    async def test_multiple_tool_calls_parsed(self):
        provider, mock_client = make_provider()

        tc1 = self._make_tool_call("tc1", "search", '{"q": "a"}')
        tc2 = self._make_tool_call("tc2", "summarize", '{}')

        msg = MagicMock()
        msg.content = None
        msg.tool_calls = [tc1, tc2]

        choice = MagicMock()
        choice.finish_reason = "tool_calls"
        choice.message = msg

        resp = MagicMock()
        resp.choices = [choice]
        mock_client.chat.completions.create = AsyncMock(return_value=resp)

        tools = [
            {"name": "search", "description": "Search"},
            {"name": "summarize", "description": "Summarize"},
        ]
        result = await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=tools
        )

        assert len(result["tool_calls"]) == 2
        assert result["tool_calls"][0]["name"] == "search"
        assert result["tool_calls"][1]["name"] == "summarize"

    @pytest.mark.asyncio
    async def test_empty_tool_arguments_defaults_to_empty_dict(self):
        provider, mock_client = make_provider()

        tc = self._make_tool_call("tc1", "tool", "")

        msg = MagicMock()
        msg.content = None
        msg.tool_calls = [tc]

        choice = MagicMock()
        choice.finish_reason = "tool_calls"
        choice.message = msg

        resp = MagicMock()
        resp.choices = [choice]
        mock_client.chat.completions.create = AsyncMock(return_value=resp)

        tools = [{"name": "tool", "description": "t"}]
        result = await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=tools
        )

        assert result["tool_calls"][0]["arguments"] == {}

    @pytest.mark.asyncio
    async def test_raw_message_included_in_response(self):
        provider, mock_client = make_provider()
        response = _make_completion_response("reply")
        mock_client.chat.completions.create = AsyncMock(return_value=response)

        result = await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=[]
        )
        # raw_message = choice.message
        assert result["raw_message"] is response.choices[0].message


# ── BaseLLMProvider abstract interface ────────────────────────────────────────

class TestBaseLLMProvider:
    def test_openai_provider_is_instance_of_base(self):
        from app.providers.base import BaseLLMProvider
        with patch("app.providers.openai_provider.AsyncOpenAI"):
            provider = OpenAIProvider(
                api_key="sk-test",
                base_url="https://api.openai.com/v1",
                default_model="gpt-4o-mini",
            )
        assert isinstance(provider, BaseLLMProvider)

    def test_base_provider_cannot_be_instantiated(self):
        from app.providers.base import BaseLLMProvider
        with pytest.raises(TypeError):
            BaseLLMProvider()  # abstract class