from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import Note, Notebook, Source


@pytest.mark.asyncio
async def test_get_notebook_returns_counts_from_single_query_path(
    client,
    auth_headers,
    db_session,
    test_user,
) -> None:
    user, _ = test_user
    notebook = Notebook(
        user_id=user.id,
        title="Systems Lab",
        status="active",
    )
    db_session.add(notebook)
    await db_session.flush()

    db_session.add_all(
        [
            Source(
                notebook_id=notebook.id,
                title="Architecture",
                type="web",
                status="indexed",
            ),
            Note(
                notebook_id=notebook.id,
                user_id=user.id,
                title="Notes",
                content_text="Hello world",
                word_count=11,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/notebooks/{notebook.id}",
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["source_count"] == 1
    assert payload["note_count"] == 1
    assert payload["word_count"] == 11


@pytest.mark.asyncio
async def test_create_notebook_marks_response_as_new(
    client,
    auth_headers,
    db_session,
) -> None:
    response = await client.post(
        "/api/v1/notebooks",
        headers=auth_headers,
        json={"title": "Research Board"},
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["is_new"] is True
    assert payload["source_count"] == 0
    assert payload["note_count"] == 0
    assert payload["word_count"] == 0

    notebook = (
        await db_session.execute(select(Notebook).where(Notebook.title == "Research Board"))
    ).scalar_one()
    assert notebook.title == "Research Board"
