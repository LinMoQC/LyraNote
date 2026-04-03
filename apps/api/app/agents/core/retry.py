"""
LLM call retry strategy — inspired by Claude Code's classified error handling.

Error classes and their retry policies:
  overload    → HTTP 529 (Anthropic) / "overloaded" message
                up to 3 retries, exponential backoff starting at 2s
  rate_limit  → HTTP 429
                up to 3 retries, longer base delay (5s) with exponential backoff
  network     → ConnectionResetError / ECONNRESET / ClientConnectionError
                up to 2 quick retries (0.5s base)
  auth        → HTTP 401 / 403
                no retry — fail immediately (credentials won't change mid-request)
  unknown     → any other exception
                1 retry after 1s, then propagate

All delays are capped at 30s regardless of computed backoff.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_MAX_BACKOFF_SECONDS = 30.0


@dataclass(frozen=True)
class _RetryConfig:
    max_retries: int
    base_delay: float      # seconds before first retry
    backoff_multiplier: float = 2.0


_RETRY_CONFIGS: dict[str, _RetryConfig] = {
    "overload":   _RetryConfig(max_retries=3, base_delay=2.0, backoff_multiplier=2.0),
    "rate_limit": _RetryConfig(max_retries=3, base_delay=5.0, backoff_multiplier=2.0),
    "network":    _RetryConfig(max_retries=2, base_delay=0.5, backoff_multiplier=2.0),
    "auth":       _RetryConfig(max_retries=0, base_delay=0.0),
    "unknown":    _RetryConfig(max_retries=1, base_delay=1.0),
}


def classify_llm_error(exc: BaseException) -> str:
    """Return an error class string for the given exception.

    Resolution order:
      1. HTTP status code (most reliable signal)
      2. Exception type hierarchy (network errors)
      3. Message text heuristics (fallback for wrapped exceptions)
    """
    # ── Inspect HTTP status code ───────────────────────────────────────────────
    status_code: int | None = None
    # openai.APIStatusError and similar all carry .status_code
    if hasattr(exc, "status_code"):
        status_code = int(exc.status_code)
    # Some wrappers expose .response.status_code
    elif hasattr(exc, "response") and hasattr(exc.response, "status_code"):
        status_code = int(exc.response.status_code)

    if status_code is not None:
        if status_code == 529:
            return "overload"
        if status_code == 429:
            return "rate_limit"
        if status_code in (401, 403):
            return "auth"

    # ── Network / connection errors ────────────────────────────────────────────
    exc_type = type(exc).__name__
    if isinstance(exc, (ConnectionResetError, ConnectionError, BrokenPipeError, TimeoutError)):
        return "network"
    if exc_type in {"ClientConnectionError", "ClientConnectorError", "ServerDisconnectedError"}:
        return "network"

    # ── Message text heuristics ────────────────────────────────────────────────
    msg = str(exc).lower()
    if "overloaded" in msg or "529" in msg:
        return "overload"
    if "rate limit" in msg or "rate_limit" in msg or "429" in msg:
        return "rate_limit"
    if "unauthorized" in msg or "invalid api key" in msg or "401" in msg:
        return "auth"
    if "econnreset" in msg or "connection reset" in msg or "network" in msg:
        return "network"

    return "unknown"


def retry_delay(error_class: str, attempt: int) -> float:
    """Return the delay in seconds before the *attempt*-th retry (0-indexed)."""
    config = _RETRY_CONFIGS.get(error_class, _RETRY_CONFIGS["unknown"])
    delay = config.base_delay * (config.backoff_multiplier ** attempt)
    return min(delay, _MAX_BACKOFF_SECONDS)


def max_retries_for(error_class: str) -> int:
    """Return how many retries are allowed for this error class."""
    return _RETRY_CONFIGS.get(error_class, _RETRY_CONFIGS["unknown"]).max_retries


async def sleep_before_retry(error_class: str, attempt: int, label: str = "") -> None:
    """Sleep the appropriate backoff duration and log the retry."""
    delay = retry_delay(error_class, attempt)
    logger.warning(
        "LLM %s error (%s), retrying in %.1fs (attempt %d)%s",
        error_class,
        label,
        delay,
        attempt + 1,
        "",
    )
    await asyncio.sleep(delay)
