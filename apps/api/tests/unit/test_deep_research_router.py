from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.agents.memory import build_prompt_context_bundle
from app.domains.ai.routers.research import create_deep_research, save_deep_research_sources
from app.domains.ai.schemas import DeepResearchRequest, SaveDeepResearchSourcesRequest
from app.models import Conversation, Message, ResearchTask
from app.services.source_service import WebImportResult


@pytest.mark.asyncio
async def test_create_deep_research_without_notebook_uses_none_notebook_id() -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if hasattr(obj, "id") and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        commit=AsyncMock(return_value=None),
    )

    current_user = SimpleNamespace(id=uuid.uuid4())
    request = DeepResearchRequest(query="请帮我研究 agent runtime", mode="quick")

    def _close_background_task(coro):
        coro.close()
        return None

    with patch(
        "app.agents.memory.load_prompt_context",
        new=AsyncMock(return_value=build_prompt_context_bundle(scene="research")),
    ), patch(
        "app.domains.ai.routers.research.run_research_task",
        new=AsyncMock(return_value=None),
    ), patch(
        "app.domains.ai.routers.research.asyncio.create_task",
        side_effect=_close_background_task,
    ):
        response = await create_deep_research(request, current_user, db)

    assert response.data is not None
    assert response.data["task_id"]
    assert response.data["conversation_id"]

    conversation = next(obj for obj in added if isinstance(obj, Conversation))
    user_message = next(obj for obj in added if isinstance(obj, Message))
    research_task = next(obj for obj in added if isinstance(obj, ResearchTask))

    assert conversation.notebook_id is None
    assert user_message.role == "user"
    assert user_message.content == "请帮我研究 agent runtime"
    assert user_message.conversation_id == conversation.id
    assert research_task.notebook_id is None
    assert research_task.conversation_id == conversation.id
    assert research_task.query == "请帮我研究 agent runtime"


@pytest.mark.asyncio
async def test_save_deep_research_sources_uses_task_notebook_by_default(monkeypatch) -> None:
    task_id = uuid.uuid4()
    notebook_id = uuid.uuid4()
    current_user = SimpleNamespace(id=uuid.uuid4())
    research_task = SimpleNamespace(
        id=task_id,
        user_id=current_user.id,
        notebook_id=str(notebook_id),
        web_sources_json=[{"title": "A", "url": "https://example.com/a"}],
    )

    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: research_task)),
        commit=AsyncMock(return_value=None),
    )

    captured: dict[str, object] = {}

    async def _fake_import(self, sources, *, notebook_id=None):
        captured["sources"] = sources
        captured["notebook_id"] = notebook_id
        return WebImportResult(
            notebook_id=notebook_id,
            created_count=1,
            skipped_count=0,
            source_ids=[uuid.uuid4()],
        )

    monkeypatch.setattr("app.services.source_service.SourceService.import_web_sources", _fake_import)

    response = await save_deep_research_sources(
        str(task_id),
        SaveDeepResearchSourcesRequest(),
        current_user,
        db,
    )

    assert response.data == {
        "created_count": 1,
        "skipped_count": 0,
        "target_notebook_id": str(notebook_id),
    }
    assert captured["sources"] == research_task.web_sources_json
    assert captured["notebook_id"] == notebook_id
    assert db.commit.await_count == 1
