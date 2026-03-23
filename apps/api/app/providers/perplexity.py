"""
Perplexity Sonar Search Provider.

Async wrapper around the Perplexity Sonar API using httpx.

Key improvement over previous version:
  - The synthesized answer from `choices[0].message.content` is now the
    PRIMARY result (most valuable — can be 2000+ words).
  - Citation URLs are appended as subsequent results.
  - Falls back to `search_results[].snippet` if the API returns no choices.

Returns results in the same format as tavily.py for interchangeability:
    {"title": str, "url": str, "content": str, "score": float}
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"

_RECENCY_MAP = {
    "hour": "hour",
    "day": "day",
    "week": "week",
    "month": "month",
    "year": "year",
}


async def search(
    query: str,
    *,
    max_results: int = 5,
    recency_filter: str = "month",
    model: str = "sonar",
) -> list[dict]:
    """
    Call Perplexity Sonar API and return structured search results.

    The Sonar synthesized answer is returned as the first result so the LLM
    gets the highest-value content upfront. Citation URLs follow.

    Args:
        query: Search query.
        max_results: Maximum number of citation URLs to include.
        recency_filter: Recency of results — "hour", "day", "week", "month", "year".
        model: Perplexity model to use (e.g. "sonar", "sonar-pro").

    Returns an empty list (graceful degradation) when:
    - PERPLEXITY_API_KEY is not configured
    - The API request fails
    """
    if not settings.perplexity_api_key:
        logger.warning("PERPLEXITY_API_KEY not configured; Perplexity search is disabled")
        return []

    effective_recency = _RECENCY_MAP.get(recency_filter, "month")

    headers = {
        "Authorization": f"Bearer {settings.perplexity_api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": query},
        ],
        "search_recency_filter": effective_recency,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(PERPLEXITY_API_URL, json=payload, headers=headers)
            resp.raise_for_status()

        data = resp.json()

        results: list[dict] = []

        # Primary: Sonar synthesized answer (highest quality content)
        answer = ""
        if data.get("choices"):
            answer = data["choices"][0].get("message", {}).get("content", "")

        if answer:
            results.append({
                "title": "Perplexity Sonar 综合分析",
                "url": "",
                "content": answer,
                "score": 1.0,
            })

        # Secondary: citation URLs as source references
        citations: list[str] = data.get("citations") or []
        for i, url in enumerate(citations[:max_results]):
            results.append({
                "title": f"来源 {i + 1}",
                "url": url,
                "content": "",
                "score": 0.8 - i * 0.05,
            })

        # Fallback: search_results snippets (legacy field)
        if not results:
            raw_results = data.get("search_results") or []
            for r in raw_results[:max_results]:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("snippet", ""),
                    "score": 0.5,
                })

        return results

    except httpx.HTTPStatusError as exc:
        logger.error("Perplexity API HTTP error %s: %s", exc.response.status_code, exc.response.text[:200])
        return []
    except Exception as exc:
        logger.error("Perplexity search failed: %s", exc)
        return []
