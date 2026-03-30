from app.providers.reasoning import litellm_reasoning_kwargs, openai_reasoning_kwargs


def test_openai_reasoning_kwargs_enabled_for_o_series() -> None:
    assert openai_reasoning_kwargs("o3", True) == {"reasoning_effort": "medium"}


def test_openai_reasoning_kwargs_disabled_returns_empty() -> None:
    assert openai_reasoning_kwargs("o3", False) == {}


def test_openai_reasoning_kwargs_non_reasoning_model_returns_empty() -> None:
    assert openai_reasoning_kwargs("gpt-4o-mini", True) == {}


def test_litellm_reasoning_kwargs_enabled_for_reasoner_models() -> None:
    assert litellm_reasoning_kwargs("deepseek-reasoner", True) == {"reasoning_effort": "medium"}


def test_litellm_reasoning_kwargs_disabled_returns_empty() -> None:
    assert litellm_reasoning_kwargs("deepseek-reasoner", False) == {}
