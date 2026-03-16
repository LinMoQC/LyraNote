"""
Perplexity Sonar Search Provider.

Async wrapper around the Perplexity Sonar API using httpx.
Returns results in the same format as the Tavily provider
so the two are interchangeable in the scheduled-task pipeline.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

PERPLEXITY_API_URL = "https://api.perplexity.ai/v1/sonar"


async def search(
    query: str,
    *,
    max_results: int = 5,
) -> list[dict]:
    """
    Call Perplexity Sonar API and return structured search results.

    Returns a list of dicts matching the Tavily provider format:
    [
        {
            "title": str,
            "url": str,
            "content": str,
        },
        ...
    ]

    Returns an empty list (graceful degradation) when:
    - PERPLEXITY_API_KEY is not configured
    - The API request fails
    """
    if not settings.perplexity_api_key:
        logger.warning("PERPLEXITY_API_KEY not configured; Perplexity search is disabled")
        return []

    headers = {
        "Authorization": f"Bearer {settings.perplexity_api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "sonar",
        "messages": [
            {"role": "user", "content": query},
        ],
        "search_recency_filter": "week",
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(PERPLEXITY_API_URL, json=payload, headers=headers)
            resp.raise_for_status()

        data = resp.json()
        raw_results = data.get("search_results") or []

        results = []
        for r in raw_results[:max_results]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("snippet", ""),
            })

        if not results:
            citations = data.get("citations") or []
            answer = ""
            if data.get("choices"):
                answer = data["choices"][0].get("message", {}).get("content", "")
            for i, url in enumerate(citations[:max_results]):
                results.append({
                    "title": f"Source {i + 1}",
                    "url": url,
                    "content": answer[:500] if i == 0 else "",
                })

        return results

    except httpx.HTTPStatusError as exc:
        logger.error("Perplexity API HTTP error %s: %s", exc.response.status_code, exc.response.text)
        return []
    except Exception as exc:
        logger.error("Perplexity search failed: %s", exc)
        return []
