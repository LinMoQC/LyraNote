"""
Tavily AI Search Provider.

Thin async wrapper around the Tavily REST API using httpx.
Avoids the synchronous tavily-python SDK to stay compatible
with the FastAPI async event loop.

Key improvements:
  - include_answer=True by default: Tavily AI answer prepended as first result.
  - days parameter: maps to search_recency_filter for time-bounded queries.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

TAVILY_API_URL = "https://api.tavily.com/search"

_DAYS_TO_RECENCY: list[tuple[int, str]] = [
    (1, "day"),
    (7, "week"),
    (30, "month"),
]


def _days_to_recency_filter(days: int | None) -> str | None:
    if days is None:
        return None
    for threshold, label in _DAYS_TO_RECENCY:
        if days <= threshold:
            return label
    return "year"


async def search(
    query: str,
    *,
    max_results: int = 5,
    search_depth: str = "basic",
    include_answer: bool = True,
    days: int | None = None,
) -> list[dict]:
    """
    Call Tavily Search API and return structured results.

    Args:
        query: Search query.
        max_results: Number of organic results to return.
        search_depth: "basic" (fast) or "advanced" (deeper, slower).
        include_answer: Prepend Tavily's AI-synthesized answer as the first result.
        days: Return only results from the last N days (None = no filter).

    Returns a list of dicts:
    [
        {
            "title": str,
            "url": str,
            "content": str,   # cleaned text snippet
            "score": float,
            "raw_content": str | None,
        },
        ...
    ]

    Returns an empty list (graceful degradation) when:
    - TAVILY_API_KEY is not configured
    - The API request fails
    """
    if not settings.tavily_api_key:
        logger.warning("TAVILY_API_KEY not configured; web search is disabled")
        return []

    payload: dict = {
        "api_key": settings.tavily_api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": search_depth,
        "include_answer": include_answer,
        "include_raw_content": search_depth == "advanced",
    }

    recency = _days_to_recency_filter(days)
    if recency:
        payload["search_recency_filter"] = recency

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(TAVILY_API_URL, json=payload)
            resp.raise_for_status()
        data = resp.json()

        results: list[dict] = list(data.get("results", []))

        # Prepend Tavily's synthesized AI answer as the highest-quality first result
        if include_answer and (answer := data.get("answer")):
            results.insert(0, {
                "title": "Tavily AI Answer",
                "url": "",
                "content": answer,
                "score": 1.0,
            })

        return results

    except httpx.HTTPStatusError as exc:
        logger.error("Tavily API HTTP error %s: %s", exc.response.status_code, exc.response.text[:200])
        return []
    except Exception as exc:
        logger.error("Tavily search failed: %s", exc)
        return []
