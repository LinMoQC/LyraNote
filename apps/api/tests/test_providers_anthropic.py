"""
Tests for app/providers/anthropic_provider.py

Tests cover:
  - _convert_messages(): message format conversion
  - AnthropicProvider.chat() / chat_stream() / chat_with_tools() with mocked SDK
"""

from __future__ import annotations

import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Import _convert_messages without requiring anthropic SDK ───────────────────
# AnthropicProvider.__init__ uses a lazy `from anthropic import AsyncAnthropic`
# inside the constructor, so the module itself can be imported freely.
from app.providers.anthropic_provider import _compute_thinking_budget_tokens, _convert_messages


# ── _convert_messages ──────────────────────────────────────────────────────────

class TestConvertMessages:
    def test_system_message_extracted(self):
        messages = [{"role": "system", "content": "You are helpful."}]
        system, msgs = _convert_messages(messages)
        assert system == "You are helpful."
        assert msgs == []

    def test_multiple_system_messages_concatenated(self):
        messages = [
            {"role": "system", "content": "Part 1."},
            {"role": "system", "content": "Part 2."},
        ]
        system, msgs = _convert_messages(messages)
        assert "Part 1." in system
        assert "Part 2." in system

    def test_user_message_passed_through(self):
        messages = [{"role": "user", "content": "Hello"}]
        system, msgs = _convert_messages(messages)
        assert system == ""
        assert msgs == [{"role": "user", "content": "Hello"}]

    def test_assistant_message_passed_through(self):
        messages = [{"role": "assistant", "content": "Hi there"}]
        system, msgs = _convert_messages(messages)
        assert system == ""
        assert msgs == [{"role": "assistant", "content": "Hi there"}]

    def test_tool_message_converted_to_user_tool_result(self):
        messages = [
            {
                "role": "tool",
                "tool_call_id": "call_abc123",
                "content": "Search result here",
            }
        ]
        system, msgs = _convert_messages(messages)
        assert system == ""
        assert len(msgs) == 1
        msg = msgs[0]
        assert msg["role"] == "user"
        assert isinstance(msg["content"], list)
        block = msg["content"][0]
        assert block["type"] == "tool_result"
        assert block["tool_use_id"] == "call_abc123"
        assert block["content"] == "Search result here"

    def test_tool_message_without_tool_call_id(self):
        messages = [{"role": "tool", "content": "result"}]
        system, msgs = _convert_messages(messages)
        block = msgs[0]["content"][0]
        assert block["tool_use_id"] == ""

    def test_mixed_messages_correct_order(self):
        messages = [
            {"role": "system", "content": "Be concise."},
            {"role": "user", "content": "What is AI?"},
            {"role": "assistant", "content": "AI is..."},
        ]
        system, msgs = _convert_messages(messages)
        assert system == "Be concise."
        assert len(msgs) == 2
        assert msgs[0]["role"] == "user"
        assert msgs[1]["role"] == "assistant"

    def test_empty_messages_list(self):
        system, msgs = _convert_messages([])
        assert system == ""
        assert msgs == []

    def test_system_content_stripped(self):
        messages = [{"role": "system", "content": "  System prompt.  "}]
        system, msgs = _convert_messages(messages)
        # system is stripped at the end (system.strip())
        assert system == "System prompt."

    def test_missing_content_defaults_to_empty_string(self):
        messages = [{"role": "user"}]
        system, msgs = _convert_messages(messages)
        assert msgs == [{"role": "user", "content": ""}]

    def test_system_newline_between_concatenated_parts(self):
        messages = [
            {"role": "system", "content": "Line A"},
            {"role": "system", "content": "Line B"},
        ]
        system, msgs = _convert_messages(messages)
        # Each part has "\n" appended before strip
        assert "Line A" in system
        assert "Line B" in system


# ── AnthropicProvider with mocked SDK ─────────────────────────────────────────

def _make_anthropic_provider(model: str = "claude-test"):
    """Create AnthropicProvider with a mocked AsyncAnthropic client."""
    mock_async_anthropic = MagicMock()
    fake_anthropic_mod = types.ModuleType("anthropic")
    fake_anthropic_mod.AsyncAnthropic = MagicMock(return_value=mock_async_anthropic)

    with patch.dict(sys.modules, {"anthropic": fake_anthropic_mod}):
        if "app.providers.anthropic_provider" in sys.modules:
            del sys.modules["app.providers.anthropic_provider"]
        from app.providers.anthropic_provider import AnthropicProvider
        provider = AnthropicProvider(api_key="sk-test", default_model=model)
        provider._client = mock_async_anthropic

    return provider, mock_async_anthropic


class _FakeStreamContext:
    def __init__(self, chunks: list[str]) -> None:
        self.text_stream = self._iter(chunks)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def _iter(self, chunks: list[str]):
        for chunk in chunks:
            yield chunk


class TestAnthropicProviderChat:
    @pytest.mark.asyncio
    async def test_chat_returns_string(self):
        provider, mock_client = _make_anthropic_provider()

        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Hello from Claude")]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        result = await provider.chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello from Claude"

    @pytest.mark.asyncio
    async def test_chat_empty_content_returns_empty_string(self):
        provider, mock_client = _make_anthropic_provider()

        mock_response = MagicMock()
        mock_response.content = []
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        result = await provider.chat([{"role": "user", "content": "Hi"}])
        assert result == ""

    @pytest.mark.asyncio
    async def test_chat_uses_default_model(self):
        provider, mock_client = _make_anthropic_provider(model="claude-opus")

        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Response")]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        await provider.chat([{"role": "user", "content": "test"}])
        call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs.kwargs["model"] == "claude-opus"

    @pytest.mark.asyncio
    async def test_chat_uses_custom_model(self):
        provider, mock_client = _make_anthropic_provider(model="claude-opus")

        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Response")]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        await provider.chat([{"role": "user", "content": "test"}], model="claude-haiku")
        call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs.kwargs["model"] == "claude-haiku"

    @pytest.mark.asyncio
    async def test_chat_default_max_tokens(self):
        provider, mock_client = _make_anthropic_provider()

        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Response")]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        await provider.chat([{"role": "user", "content": "test"}])
        call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs.kwargs["max_tokens"] == 4096

    @pytest.mark.asyncio
    async def test_chat_custom_max_tokens(self):
        provider, mock_client = _make_anthropic_provider()

        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Response")]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        await provider.chat([{"role": "user", "content": "test"}], max_tokens=100)
        call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs.kwargs["max_tokens"] == 100

    @pytest.mark.asyncio
    async def test_chat_no_system_uses_default_system_prompt(self):
        provider, mock_client = _make_anthropic_provider()

        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Response")]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        await provider.chat([{"role": "user", "content": "test"}])
        call_kwargs = mock_client.messages.create.call_args
        # No system message → falls back to default
        assert call_kwargs.kwargs["system"] == "You are a helpful assistant."

    @pytest.mark.asyncio
    async def test_chat_stream_thinking_removes_temperature_and_sets_top_p(self):
        provider, mock_client = _make_anthropic_provider()
        mock_client.messages.stream = MagicMock(return_value=_FakeStreamContext(["A", "B"]))

        chunks = []
        async for event in provider.chat_stream(
            [{"role": "user", "content": "test"}],
            max_tokens=3000,
            thinking_enabled=True,
        ):
            chunks.append(event["content"])

        assert chunks == ["A", "B"]
        kwargs = mock_client.messages.stream.call_args.kwargs
        assert "temperature" not in kwargs
        assert kwargs["top_p"] == 1.0
        assert kwargs["thinking"] == {"type": "enabled", "budget_tokens": 2048}

    @pytest.mark.asyncio
    async def test_chat_stream_thinking_budget_is_capped_below_max_tokens(self):
        provider, mock_client = _make_anthropic_provider()
        mock_client.messages.stream = MagicMock(return_value=_FakeStreamContext(["ok"]))

        async for _event in provider.chat_stream(
            [{"role": "user", "content": "test"}],
            max_tokens=1200,
            thinking_enabled=True,
        ):
            pass

        kwargs = mock_client.messages.stream.call_args.kwargs
        assert kwargs["thinking"] == {"type": "enabled", "budget_tokens": 1199}

    def test_compute_thinking_budget_tokens_rejects_too_small_max_tokens(self):
        with pytest.raises(ValueError, match="Anthropic thinking requires max_tokens > 1024"):
            _compute_thinking_budget_tokens(1024)


class TestAnthropicProviderChatWithTools:
    @pytest.mark.asyncio
    async def test_tool_calls_response(self):
        provider, mock_client = _make_anthropic_provider()

        mock_block = MagicMock()
        mock_block.type = "tool_use"
        mock_block.id = "toolu_01"
        mock_block.name = "search"
        mock_block.input = {"query": "test"}

        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        tools = [{"name": "search", "description": "Search the web", "parameters": {"type": "object"}}]
        result = await provider.chat_with_tools(
            [{"role": "user", "content": "Find info"}],
            tools=tools,
        )
        assert result["finish_reason"] == "tool_calls"
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["name"] == "search"
        assert result["tool_calls"][0]["id"] == "toolu_01"
        assert result["tool_calls"][0]["arguments"] == {"query": "test"}

    @pytest.mark.asyncio
    async def test_stop_response(self):
        provider, mock_client = _make_anthropic_provider()

        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = "Here is my answer."

        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        result = await provider.chat_with_tools(
            [{"role": "user", "content": "Answer?"}],
            tools=[],
        )
        assert result["finish_reason"] == "stop"
        assert result["content"] == "Here is my answer."
        assert result["raw_message"] is mock_response

    @pytest.mark.asyncio
    async def test_tool_schema_converted_correctly(self):
        provider, mock_client = _make_anthropic_provider()

        mock_response = MagicMock()
        mock_response.content = []
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        tools = [
            {
                "name": "my_tool",
                "description": "A tool",
                "parameters": {"type": "object", "properties": {"x": {"type": "string"}}},
            }
        ]
        await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=tools
        )
        call_kwargs = mock_client.messages.create.call_args.kwargs
        anthropic_tools = call_kwargs["tools"]
        assert anthropic_tools[0]["name"] == "my_tool"
        assert anthropic_tools[0]["description"] == "A tool"
        assert anthropic_tools[0]["input_schema"] == tools[0]["parameters"]

    @pytest.mark.asyncio
    async def test_no_tools_passes_none(self):
        provider, mock_client = _make_anthropic_provider()

        mock_response = MagicMock()
        mock_response.content = []
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        await provider.chat_with_tools([{"role": "user", "content": "test"}], tools=[])
        call_kwargs = mock_client.messages.create.call_args.kwargs
        # Empty tools list → anthropic_tools = [] → tools=None
        assert call_kwargs["tools"] is None

    @pytest.mark.asyncio
    async def test_tool_input_not_dict_defaults_to_empty(self):
        """If block.input is not a dict, arguments defaults to {}."""
        provider, mock_client = _make_anthropic_provider()

        mock_block = MagicMock()
        mock_block.type = "tool_use"
        mock_block.id = "toolu_02"
        mock_block.name = "tool"
        mock_block.input = "not a dict"  # Not a dict

        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        tools = [{"name": "tool", "description": "t", "parameters": {}}]
        result = await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=tools
        )
        assert result["tool_calls"][0]["arguments"] == {}

    @pytest.mark.asyncio
    async def test_mixed_text_and_tool_blocks_tool_takes_priority(self):
        provider, mock_client = _make_anthropic_provider()

        text_block = MagicMock()
        text_block.type = "text"
        text_block.text = "Thinking..."

        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.id = "toolu_03"
        tool_block.name = "search"
        tool_block.input = {}

        mock_response = MagicMock()
        mock_response.content = [text_block, tool_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        tools = [{"name": "search", "description": "Search", "parameters": {}}]
        result = await provider.chat_with_tools(
            [{"role": "user", "content": "test"}], tools=tools
        )
        # tool_calls present → finish_reason = "tool_calls"
        assert result["finish_reason"] == "tool_calls"


class TestAnthropicProviderImportError:
    def test_raises_import_error_when_anthropic_not_installed(self):
        # Remove anthropic from sys.modules to simulate it not being installed
        saved = sys.modules.pop("anthropic", None)
        try:
            if "app.providers.anthropic_provider" in sys.modules:
                del sys.modules["app.providers.anthropic_provider"]
            from app.providers.anthropic_provider import AnthropicProvider
            with pytest.raises(ImportError, match="pip install anthropic"):
                AnthropicProvider(api_key="test")
        finally:
            if saved is not None:
                sys.modules["anthropic"] = saved
