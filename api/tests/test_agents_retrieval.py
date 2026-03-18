"""
Tests for app/agents/retrieval.py — specifically the _rewrite_query() function
added in this PR.

retrieval.py has a module-level dependency on app.models which requires pgvector.
We stub the necessary modules before importing the function under test.
"""

from __future__ import annotations

import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Stub out heavy/unavailable dependencies ────────────────────────────────────

def _stub_pgvector():
    """Stub pgvector so app.models can be imported."""
    if "pgvector" not in sys.modules:
        pgv = types.ModuleType("pgvector")
        pgv_sql = types.ModuleType("pgvector.sqlalchemy")
        pgv_sql.Vector = MagicMock()  # type: ignore
        sys.modules["pgvector"] = pgv
        sys.modules["pgvector.sqlalchemy"] = pgv_sql


_stub_pgvector()

# Stub out sqlalchemy models so we don't need a real DB for this import
if "app.models" not in sys.modules:
    _models_mod = types.ModuleType("app.models")
    _models_mod.Chunk = MagicMock()  # type: ignore
    _models_mod.Notebook = MagicMock()  # type: ignore
    _models_mod.Source = MagicMock()  # type: ignore
    sys.modules["app.models"] = _models_mod

# Force retrieval module reload with stubs
if "app.agents.retrieval" in sys.modules:
    del sys.modules["app.agents.retrieval"]

from app.agents.retrieval import _rewrite_query  # noqa: E402


# ── _rewrite_query ─────────────────────────────────────────────────────────────

class TestRewriteQuery:
    @pytest.mark.asyncio
    async def test_returns_rewritten_query(self):
        """When LLM returns a non-empty string, use it as the rewritten query."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="machine learning neural networks")
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("What are the basics of ML?")
            assert result == "machine learning neural networks"

    @pytest.mark.asyncio
    async def test_returns_original_query_if_rewritten_is_empty(self):
        """If LLM returns empty string, fall back to original query."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="   ")  # whitespace-only
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("original query text")
            assert result == "original query text"

    @pytest.mark.asyncio
    async def test_returns_original_query_on_exception(self):
        """If the LLM call raises, return the original query unchanged."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("fallback query")
            assert result == "fallback query"

    @pytest.mark.asyncio
    async def test_returns_original_query_on_network_error(self):
        """Network/connection errors also fall back to original query."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(side_effect=ConnectionError("timeout"))
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("my original query")
            assert result == "my original query"

    @pytest.mark.asyncio
    async def test_rewritten_query_stripped_of_whitespace(self):
        """The result.strip() call removes surrounding whitespace."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="  keywords here  ")
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("question")
            assert result == "keywords here"

    @pytest.mark.asyncio
    async def test_calls_llm_with_correct_temperature(self):
        """_rewrite_query must call chat() with temperature=0."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="result")
            mock_get_provider.return_value = mock_provider

            await _rewrite_query("test query")

            # llm.chat() calls: get_provider().chat(messages, model, temperature, max_tokens)
            # as positional args — temperature is at index 2
            call_args = mock_provider.chat.call_args
            assert call_args.args[2] == 0

    @pytest.mark.asyncio
    async def test_calls_llm_with_max_tokens_100(self):
        """_rewrite_query must call chat() with max_tokens=100."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="result")
            mock_get_provider.return_value = mock_provider

            await _rewrite_query("test query")

            # max_tokens is at positional index 3
            call_args = mock_provider.chat.call_args
            assert call_args.args[3] == 100

    @pytest.mark.asyncio
    async def test_query_embedded_in_prompt(self):
        """The original query text is embedded in the prompt sent to LLM."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="result")
            mock_get_provider.return_value = mock_provider

            my_query = "How does gradient descent work in neural networks?"
            await _rewrite_query(my_query)

            call_args = mock_provider.chat.call_args
            messages = call_args.args[0] if call_args.args else call_args.kwargs["messages"]
            prompt_content = messages[0]["content"]
            assert my_query in prompt_content

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty_on_empty_llm_response(self):
        """Edge case: empty input query with empty LLM response."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="")
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("")
            # rewritten.strip() is "" which is falsy, so returns original query ""
            assert result == ""

    @pytest.mark.asyncio
    async def test_already_short_query_passed_through(self):
        """A concise query is returned as rewritten (LLM should echo it)."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="machine learning")
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("machine learning")
            assert result == "machine learning"

    @pytest.mark.asyncio
    async def test_chinese_query_rewritten(self):
        """Chinese queries are also rewritten."""
        with patch("app.providers.llm.get_provider") as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.chat = AsyncMock(return_value="深度学习 卷积神经网络")
            mock_get_provider.return_value = mock_provider

            result = await _rewrite_query("深度学习是怎么工作的？")
            assert result == "深度学习 卷积神经网络"