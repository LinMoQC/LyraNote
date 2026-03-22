"""
Provider factory — resolves the configured LLM provider at runtime.

Inspired by LobeHub's ``providerRuntimeMap`` + ``initializeWithProvider``
pattern which maps a provider name to its implementation class.
"""

from __future__ import annotations

from app.providers.base import BaseLLMProvider

_provider: BaseLLMProvider | None = None


def get_provider() -> BaseLLMProvider:
    """Return a lazily-initialised LLM provider based on settings."""
    global _provider
    if _provider is not None:
        return _provider

    from app.config import settings

    provider_type = getattr(settings, "llm_provider", "openai")

    if provider_type == "anthropic":
        from app.providers.anthropic_provider import AnthropicProvider

        _provider = AnthropicProvider(
            api_key=settings.openai_api_key,
            default_model=settings.llm_model,
        )
    elif provider_type == "litellm":
        from app.providers.litellm_provider import LiteLLMProvider

        _provider = LiteLLMProvider(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url or None,
            default_model=settings.llm_model,
        )
    else:
        from app.providers.openai_provider import OpenAIProvider

        _provider = OpenAIProvider(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            default_model=settings.llm_model,
        )

    return _provider


def reset_provider() -> None:
    """Force re-creation of the provider (e.g. after settings change)."""
    global _provider
    _provider = None
