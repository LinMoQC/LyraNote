from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.models import Message, MessageGeneration
from app.services.conversation_service import ConversationService


@pytest.mark.asyncio
async def test_start_message_generation_creates_placeholder_and_dispatches_task(monkeypatch) -> None:
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

    svc = ConversationService(db, uuid.uuid4())
    conversation_id = uuid.uuid4()
    monkeypatch.setattr(
        ConversationService,
        "_get_owned",
        AsyncMock(return_value=SimpleNamespace(id=conversation_id)),
    )

    dispatched = Mock()
    monkeypatch.setattr("app.agents.chat.start_message_generation_task", dispatched)

    result = await svc.start_message_generation(
        conversation_id,
        "你好",
        global_search=True,
        tool_hint="summarize",
        attachment_ids=["file-1"],
        attachments_meta=[{"name": "a.pdf", "type": "application/pdf", "file_id": "file-1"}],
        thinking_enabled=True,
    )

    user_message = next(obj for obj in added if isinstance(obj, Message) and obj.role == "user")
    assistant_message = next(obj for obj in added if isinstance(obj, Message) and obj.role == "assistant")
    generation = next(obj for obj in added if isinstance(obj, MessageGeneration))

    assert result["conversation_id"] == conversation_id
    assert result["assistant_message_id"] == assistant_message.id
    assert user_message.status == "completed"
    assert assistant_message.status == "streaming"
    assert assistant_message.generation_id == generation.id
    assert generation.user_message_id == user_message.id
    assert generation.assistant_message_id == assistant_message.id
    assert db.commit.await_count == 1
    dispatched.assert_called_once_with(
        str(generation.id),
        content="你好",
        global_search=True,
        tool_hint="summarize",
        attachment_ids=["file-1"],
        thinking_enabled=True,
        trace_id=None,
    )


@pytest.mark.asyncio
async def test_subscribe_message_generation_replays_persisted_events(monkeypatch) -> None:
    generation_id = uuid.uuid4()
    assistant_message_id = uuid.uuid4()
    generation = SimpleNamespace(
        id=generation_id,
        status="done",
        conversation_id=uuid.uuid4(),
        user_message_id=uuid.uuid4(),
        assistant_message_id=assistant_message_id,
        model="test-model",
        error_message=None,
        last_event_index=1,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    assistant_message = SimpleNamespace(
        id=assistant_message_id,
        conversation_id=generation.conversation_id,
        generation_id=generation_id,
        role="assistant",
        status="completed",
        content="你好",
        reasoning=None,
        citations=None,
        agent_steps=None,
        attachments=None,
        speed=None,
        mind_map=None,
        diagram=None,
        mcp_result=None,
        ui_elements=None,
        created_at=datetime.now(timezone.utc),
    )
    db = SimpleNamespace(get=AsyncMock(return_value=assistant_message))
    svc = ConversationService(db, uuid.uuid4())
    monkeypatch.setattr(
        ConversationService,
        "_get_owned_generation",
        AsyncMock(return_value=generation),
    )

    monkeypatch.setattr(
        "app.agents.chat.load_generation_events",
        AsyncMock(return_value=[
            {"type": "token", "content": "你", "event_index": 0},
            {"type": "done", "message_id": str(assistant_message_id), "event_index": 1},
        ]),
    )
    monkeypatch.setattr("app.agents.chat.get_generation_buffer", Mock(return_value=None))

    lines = [line async for line in svc.subscribe_message_generation(generation_id, from_index=0)]

    assert len(lines) == 3
    assert json.loads(lines[0].removeprefix("data: ").strip())["type"] == "token"
    assert json.loads(lines[1].removeprefix("data: ").strip())["type"] == "done"
    assert lines[2] == "data: [DONE]\n\n"
