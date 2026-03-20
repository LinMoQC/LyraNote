"""
Tavily AI Search Provider.

Thin async wrapper around the Tavily REST API using httpx.
Avoids the synchronous tavily-python SDK to stay compatible
with the FastAPI async event loop.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

TAVILY_API_URL = "https://api.tavily.com/search"


async def search(
    query: str,
    *,
    max_results: int = 5,
    search_depth: str = "basic",
) -> list[dict]:
    """
    Call Tavily Search API and return structured results.

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

    payload = {
        "api_key": settings.tavily_api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": search_depth,
        "include_answer": False,
        "include_raw_content": search_depth == "advanced",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(TAVILY_API_URL, json=payload)
            resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])
    except httpx.HTTPStatusError as exc:
        logger.error("Tavily API HTTP error %s: %s", exc.response.status_code, exc.response.text)
        return []
    except Exception as exc:
        logger.error("Tavily search failed: %s", exc)
        return []
