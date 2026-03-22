"""
Embedding provider abstraction.
Default implementation uses the OpenAI embeddings API.

Query-level Redis cache (TTL configurable via EMBEDDING_CACHE_TTL):
- Cache key: embed:{sha256(text)}
- Cache miss → API call → store result
- TTL=0 disables caching entirely
"""

from __future__ import annotations

import hashlib
import json

from openai import AsyncOpenAI

from app.config import settings

_client: AsyncOpenAI | None = None
_redis: object | None = None  # redis.asyncio.Redis, lazily initialized

# Fail fast: if the embedding API doesn't respond within this window,
# callers should catch the exception and fall back to a degraded path.
_EMBED_TIMEOUT = 5.0


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        # Use embedding-specific key/url if set, otherwise fall back to the main LLM config
        api_key = settings.embedding_api_key or settings.openai_api_key
        base_url = settings.embedding_base_url or settings.openai_base_url or None
        _client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=_EMBED_TIMEOUT,
            max_retries=0,  # retries multiply the timeout; fail fast instead
        )
    return _client


async def _get_redis():
    global _redis
    if _redis is None:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(settings.redis_url, decode_responses=False)
    return _redis


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return a list of embedding vectors, one per input text."""
    client = _get_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    return [item.embedding for item in response.data]


async def embed_query(text: str) -> list[float]:
    """Embed a single query string. Uses Redis cache when EMBEDDING_CACHE_TTL > 0."""
    if settings.embedding_cache_ttl <= 0:
        vectors = await embed_texts([text])
        return vectors[0]

    cache_key = f"embed:{hashlib.sha256(text.encode()).hexdigest()}"
    try:
        redis = await _get_redis()
        cached = await redis.get(cache_key)
        if cached is not None:
            return json.loads(cached)
    except Exception:
        pass  # Redis unavailable — fall through to API

    vec = (await embed_texts([text]))[0]

    try:
        redis = await _get_redis()
        await redis.setex(cache_key, settings.embedding_cache_ttl, json.dumps(vec))
    except Exception:
        pass  # Cache write failure is non-fatal

    return vec
