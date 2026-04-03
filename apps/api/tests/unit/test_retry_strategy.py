"""
P7: Industrial retry strategy — unit tests.

Tests cover error classification and retry config, not the full engine loop.
"""
from __future__ import annotations

import pytest

from app.agents.core.retry import (
    _RETRY_CONFIGS,
    classify_llm_error,
    max_retries_for,
    retry_delay,
)


# ---------------------------------------------------------------------------
# Fake exception helpers
# ---------------------------------------------------------------------------

class _HttpError(Exception):
    def __init__(self, status_code: int, message: str = "") -> None:
        super().__init__(message or f"HTTP {status_code}")
        self.status_code = status_code


class _WrappedHttpError(Exception):
    """Simulates nested SDK errors that expose response.status_code."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"wrapped {status_code}")

        class _FakeResponse:
            pass

        self.response = _FakeResponse()
        self.response.status_code = status_code


# ---------------------------------------------------------------------------
# classify_llm_error
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("status_code,expected", [
    (529, "overload"),
    (429, "rate_limit"),
    (401, "auth"),
    (403, "auth"),
])
def test_classify_by_status_code(status_code: int, expected: str) -> None:
    exc = _HttpError(status_code)
    assert classify_llm_error(exc) == expected


def test_classify_by_wrapped_response_status_code() -> None:
    exc = _WrappedHttpError(429)
    assert classify_llm_error(exc) == "rate_limit"


def test_classify_connection_reset_as_network() -> None:
    assert classify_llm_error(ConnectionResetError("reset by peer")) == "network"


def test_classify_generic_connection_error_as_network() -> None:
    assert classify_llm_error(ConnectionError("no route")) == "network"


def test_classify_overloaded_message_heuristic() -> None:
    exc = Exception("upstream is overloaded, please retry")
    assert classify_llm_error(exc) == "overload"


def test_classify_rate_limit_message_heuristic() -> None:
    exc = Exception("you exceeded your rate_limit quota")
    assert classify_llm_error(exc) == "rate_limit"


def test_classify_auth_message_heuristic() -> None:
    exc = Exception("Unauthorized: invalid api key")
    assert classify_llm_error(exc) == "auth"


def test_classify_unknown_for_generic_error() -> None:
    exc = ValueError("some unexpected thing happened")
    assert classify_llm_error(exc) == "unknown"


# ---------------------------------------------------------------------------
# max_retries_for / retry_delay
# ---------------------------------------------------------------------------

def test_auth_errors_get_zero_retries() -> None:
    assert max_retries_for("auth") == 0


def test_overload_gets_three_retries() -> None:
    assert max_retries_for("overload") == 3


def test_network_gets_two_retries() -> None:
    assert max_retries_for("network") == 2


def test_retry_delay_increases_with_attempt() -> None:
    d0 = retry_delay("overload", 0)
    d1 = retry_delay("overload", 1)
    d2 = retry_delay("overload", 2)
    assert d0 < d1 < d2


def test_retry_delay_capped_at_max_backoff() -> None:
    from app.agents.core.retry import _MAX_BACKOFF_SECONDS
    # Very high attempt should not exceed the cap
    assert retry_delay("overload", 100) <= _MAX_BACKOFF_SECONDS


def test_unknown_error_class_returns_unknown_config() -> None:
    # Unregistered error class falls back to "unknown"
    assert max_retries_for("completely_made_up") == _RETRY_CONFIGS["unknown"].max_retries
