"""
Cross-Encoder Reranker provider.

Uses SiliconFlow's /v1/rerank endpoint (bge-reranker-v2-m3 by default).
Falls back to the original order when:
  - RERANKER_API_KEY is not configured
  - The API call fails or times out

SiliconFlow free tier: https://siliconflow.cn (no credit card required)
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def rerank(query: str, documents: list[str]) -> list[int]:
    """
    Rerank `documents` by relevance to `query` using a Cross-Encoder model.

    Returns a list of document indices sorted by relevance (most relevant first).
    Falls back to [0, 1, 2, ...] (original order) when reranking is unavailable.

    Args:
        query: The user's search query (primary rewritten variant).
        documents: List of chunk content strings to rerank.

    Returns:
        List of indices into `documents`, sorted by descending relevance.
    """
    # Fall back to the main LLM key/url if no dedicated reranker credentials are set
    effective_key = settings.reranker_api_key or settings.openai_api_key
    effective_url = (settings.reranker_base_url or settings.openai_base_url or "").rstrip("/")

    if not effective_key or not documents:
        return list(range(len(documents)))

    url = effective_url + "/rerank"
    payload = {
        "model": settings.reranker_model,
        "query": query[:512],  # guard against very long queries
        "documents": [doc[:2048] for doc in documents],  # API limit per document
        "top_n": len(documents),
        "return_documents": False,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.reranker_timeout) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {effective_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        # SiliconFlow response format:
        # {"results": [{"index": int, "relevance_score": float}, ...]}
        results = data.get("results", [])
        if not results:
            return list(range(len(documents)))

        # Already sorted by relevance_score desc by the API
        return [r["index"] for r in results]

    except httpx.TimeoutException:
        logger.warning("Reranker timed out after %.1fs, using original order", settings.reranker_timeout)
        return list(range(len(documents)))
    except Exception as exc:
        logger.debug("Reranker failed (%s), using original order", exc)
        return list(range(len(documents)))
