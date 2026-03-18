"""
Tests for app/providers/provider_factory.py

Tests the lazy singleton pattern for get_provider() and reset_provider().
All external LLM clients are mocked to avoid real network calls.
"""

from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock, patch

import pytest

import app.providers.provider_factory as factory_module
from app.providers.provider_factory import get_provider, reset_provider


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_singleton():
    """Always reset the provider singleton before and after each test."""
    reset_provider()
    yield
    reset_provider()


# ── reset_provider ─────────────────────────────────────────────────────────────

class TestResetProvider:
    def test_reset_sets_provider_to_none(self):
        factory_module._provider = MagicMock()
        reset_provider()
        assert factory_module._provider is None

    def test_reset_idempotent_when_already_none(self):
        factory_module._provider = None
        reset_provider()  # should not raise
        assert factory_module._provider is None


# ── get_provider — OpenAI path ─────────────────────────────────────────────────

class TestGetProviderOpenAI:
    def test_returns_openai_provider_by_default(self):
        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "openai"
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_base_url = "https://api.openai.com/v1"
            mock_settings.llm_model = "gpt-4o-mini"
            with patch("app.providers.openai_provider.AsyncOpenAI") as mock_client:
                mock_client.return_value = MagicMock()
                provider = get_provider()
                from app.providers.openai_provider import OpenAIProvider
                assert isinstance(provider, OpenAIProvider)

    def test_openai_provider_uses_correct_settings(self):
        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "openai"
            mock_settings.openai_api_key = "sk-key-123"
            mock_settings.openai_base_url = "https://custom.endpoint/v1"
            mock_settings.llm_model = "gpt-4o"
            with patch("app.providers.openai_provider.AsyncOpenAI") as mock_client:
                mock_client.return_value = MagicMock()
                provider = get_provider()
                assert provider._default_model == "gpt-4o"

    def test_get_provider_is_singleton(self):
        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "openai"
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_base_url = "https://api.openai.com/v1"
            mock_settings.llm_model = "gpt-4o-mini"
            with patch("app.providers.openai_provider.AsyncOpenAI") as mock_client:
                mock_client.return_value = MagicMock()
                provider1 = get_provider()
                provider2 = get_provider()
                assert provider1 is provider2

    def test_singleton_not_recreated_on_second_call(self):
        """Settings mock is only consulted once; second call returns cached instance."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "openai"
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_base_url = "https://api.openai.com/v1"
            mock_settings.llm_model = "gpt-4o-mini"
            with patch("app.providers.openai_provider.AsyncOpenAI") as mock_client:
                mock_client.return_value = MagicMock()
                get_provider()
                call_count_after_first = mock_client.call_count
                get_provider()
                # AsyncOpenAI constructor should only be called once
                assert mock_client.call_count == call_count_after_first


# ── get_provider — Anthropic path ──────────────────────────────────────────────

class TestGetProviderAnthropic:
    def test_returns_anthropic_provider_when_configured(self):
        # Stub anthropic SDK
        fake_anthropic_mod = types.ModuleType("anthropic")
        fake_anthropic_mod.AsyncAnthropic = MagicMock()
        with patch.dict(sys.modules, {"anthropic": fake_anthropic_mod}):
            with patch("app.config.settings") as mock_settings:
                mock_settings.llm_provider = "anthropic"
                mock_settings.openai_api_key = "sk-ant-test"
                mock_settings.llm_model = "claude-3-5-sonnet"
                # Force re-import of anthropic_provider with stubbed anthropic
                if "app.providers.anthropic_provider" in sys.modules:
                    del sys.modules["app.providers.anthropic_provider"]
                provider = get_provider()
                from app.providers.anthropic_provider import AnthropicProvider
                assert isinstance(provider, AnthropicProvider)

    def test_anthropic_provider_uses_correct_model(self):
        fake_anthropic_mod = types.ModuleType("anthropic")
        fake_anthropic_mod.AsyncAnthropic = MagicMock()
        with patch.dict(sys.modules, {"anthropic": fake_anthropic_mod}):
            with patch("app.config.settings") as mock_settings:
                mock_settings.llm_provider = "anthropic"
                mock_settings.openai_api_key = "sk-ant-test"
                mock_settings.llm_model = "claude-3-opus"
                if "app.providers.anthropic_provider" in sys.modules:
                    del sys.modules["app.providers.anthropic_provider"]
                provider = get_provider()
                assert provider._default_model == "claude-3-opus"


# ── get_provider — reset and re-create ────────────────────────────────────────

class TestGetProviderAfterReset:
    def test_after_reset_new_instance_created(self):
        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "openai"
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_base_url = "https://api.openai.com/v1"
            mock_settings.llm_model = "gpt-4o-mini"
            with patch("app.providers.openai_provider.AsyncOpenAI") as mock_client:
                mock_client.return_value = MagicMock()
                provider1 = get_provider()
                reset_provider()
                mock_client.return_value = MagicMock()
                provider2 = get_provider()
                assert provider1 is not provider2

    def test_reset_then_get_creates_fresh_provider(self):
        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "openai"
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_base_url = "https://api.openai.com/v1"
            mock_settings.llm_model = "gpt-4o-mini"
            with patch("app.providers.openai_provider.AsyncOpenAI") as mock_client:
                mock_client.return_value = MagicMock()
                get_provider()
                reset_provider()
                assert factory_module._provider is None
                get_provider()
                assert factory_module._provider is not None

    def test_unknown_provider_type_falls_back_to_openai(self):
        """Any non-'anthropic' value should fall through to OpenAI provider."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "some_unknown_provider"
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_base_url = "https://api.openai.com/v1"
            mock_settings.llm_model = "gpt-4o-mini"
            with patch("app.providers.openai_provider.AsyncOpenAI") as mock_client:
                mock_client.return_value = MagicMock()
                provider = get_provider()
                from app.providers.openai_provider import OpenAIProvider
                assert isinstance(provider, OpenAIProvider)