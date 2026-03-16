"""
Embedding provider abstraction.
Default implementation uses the OpenAI embeddings API.
"""

from openai import AsyncOpenAI

from app.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return a list of embedding vectors, one per input text."""
    client = _get_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    return [item.embedding for item in response.data]


async def embed_query(text: str) -> list[float]:
    vectors = await embed_texts([text])
    return vectors[0]
