"""
Jina AI Search & Reader Provider.

Two capabilities:
  - search():   s.jina.ai — returns cleaned Markdown search results, no API key required.
  - read_url(): r.jina.ai — converts any URL to clean Markdown full-text, no API key required.

Set JINA_API_KEY in the environment to raise rate limits.

Result format from search() is compatible with tavily.py:
    {"title": str, "url": str, "content": str, "score": float}
"""

from __future__ import annotations

import logging
import urllib.parse

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

JINA_SEARCH_URL = "https://s.jina.ai/"
JINA_READER_URL = "https://r.jina.ai/"
_DEFAULT_TIMEOUT = 30


def _auth_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/json", "X-Respond-With": "markdown"}
    if settings.jina_api_key:
        headers["Authorization"] = f"Bearer {settings.jina_api_key}"
    return headers


async def search(query: str, *, max_results: int = 5) -> list[dict]:
    """
    Jina Search: return cleaned Markdown search results.

    Returns a list of dicts compatible with the Tavily provider format:
    [
        {
            "title": str,
            "url": str,
            "content": str,   # Markdown snippet
            "score": float,
        },
        ...
    ]

    Returns an empty list on any error (graceful degradation).
    """
    encoded_query = urllib.parse.quote(query, safe="")
    url = f"{JINA_SEARCH_URL}{encoded_query}"

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.get(url, headers=_auth_headers())
            resp.raise_for_status()

        data = resp.json()
        raw = data.get("data") or []

        results: list[dict] = []
        for item in raw[:max_results]:
            results.append({
                "title": item.get("title") or "",
                "url": item.get("url") or "",
                "content": item.get("content") or item.get("description") or "",
                "score": float(item.get("score") or 0.0),
            })

        return results

    except httpx.HTTPStatusError as exc:
        logger.error("Jina Search HTTP error %s: %s", exc.response.status_code, exc.response.text[:200])
        return []
    except Exception as exc:
        logger.error("Jina search failed: %s", exc)
        return []


async def read_url(url: str) -> str:
    """
    Jina Reader: convert any URL to clean Markdown full-text.

    Used for deep content extraction of top search results.
    Returns an empty string on any error (graceful degradation).
    """
    reader_url = f"{JINA_READER_URL}{url}"

    headers = {"Accept": "text/markdown"}
    if settings.jina_api_key:
        headers["Authorization"] = f"Bearer {settings.jina_api_key}"

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.get(reader_url, headers=headers, follow_redirects=True)
            resp.raise_for_status()
        return resp.text

    except httpx.HTTPStatusError as exc:
        logger.warning("Jina Reader HTTP error %s for %s", exc.response.status_code, url)
        return ""
    except Exception as exc:
        logger.warning("Jina Reader failed for %s: %s", url, exc)
        return ""
