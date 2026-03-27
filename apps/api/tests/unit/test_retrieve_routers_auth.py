"""HTTP coverage for retrieve-related routers (auth + missing notebook)."""

from __future__ import annotations

import os
import uuid

import pytest
from httpx import AsyncClient

requires_postgres = os.environ.get("DATABASE_URL", "sqlite").startswith("sqlite") is False
pytestmark = pytest.mark.skipif(
    not requires_postgres,
    reason="SQLite test DB cannot compile JSONB schema; set DATABASE_URL to PostgreSQL",
)


@pytest.mark.asyncio
async def test_writing_context_unknown_notebook_404(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/v1/ai/writing-context",
        json={
            "notebook_id": str(uuid.uuid4()),
            "text_around_cursor": "x" * 30,
        },
        headers=auth_headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_related_knowledge_unknown_notebook_404(client: AsyncClient, auth_headers: dict):
    r = await client.get(
        f"/api/v1/notebooks/{uuid.uuid4()}/related-knowledge",
        headers=auth_headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_writing_context_short_text_skips_retrieval_no_404(
    client: AsyncClient, auth_headers: dict, db_session, test_user
):
    """Fewer than 20 non-whitespace chars returns empty chunks without notebook lookup."""
    from app.models import Notebook

    user, _ = test_user
    nb = Notebook(id=uuid.uuid4(), user_id=user.id, title="NB")
    db_session.add(nb)
    await db_session.commit()

    r = await client.post(
        "/api/v1/ai/writing-context",
        json={"notebook_id": str(nb.id), "text_around_cursor": "short"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("data", {}).get("chunks") == []
