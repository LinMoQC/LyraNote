from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.agents.chat.task_manager import cancel_message_generation_task, start_message_generation_task, _snapshot_list
from app.models import Conversation, Message, MessageGeneration, User


@pytest.mark.asyncio
async def test_snapshot_list_reassignment_persists_all_agent_steps_and_ui_elements(db_session) -> None:
    user = User(
        id=uuid.uuid4(),
        username="agent-steps-user",
        email="agent-steps@example.com",
    )
    db_session.add(user)
    await db_session.commit()

    conversation = Conversation(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Agent Steps Persistence",
        source="chat",
    )
    message = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        role="assistant",
        content="streaming",
        status="streaming",
    )
    db_session.add_all([conversation, message])
    await db_session.commit()

    agent_steps = [
        {"type": "thought", "content": "先联网搜索"},
    ]
    ui_elements = [
        {"element_type": "web-card", "data": {"title": "Result A"}},
    ]

    message.agent_steps = _snapshot_list(agent_steps)
    message.ui_elements = _snapshot_list(ui_elements)
    await db_session.commit()

    agent_steps.append({"type": "tool_call", "tool": "web_search", "input": {"query": "AI Agent 2026"}})
    agent_steps.append({"type": "tool_result", "content": "✓ 搜索到 6 条网络结果"})
    ui_elements.append({"element_type": "web-card", "data": {"title": "Result B"}})

    message.agent_steps = _snapshot_list(agent_steps)
    message.ui_elements = _snapshot_list(ui_elements)
    await db_session.commit()

    persisted = await db_session.scalar(select(Message).where(Message.id == message.id))

    assert persisted is not None
    assert persisted.agent_steps == agent_steps
    assert persisted.ui_elements == ui_elements
    assert len(persisted.agent_steps or []) == 3
    assert len(persisted.ui_elements or []) == 2


@pytest.mark.asyncio
async def test_run_message_generation_persists_cancelled_partial_output(engine, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    user = User(
        id=uuid.uuid4(),
        username="cancel-generation-user",
        email="cancel-generation@example.com",
    )
    db_session.add(user)
    await db_session.flush()

    conversation = Conversation(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Cancelable Generation",
        source="chat",
    )
    user_message = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        role="user",
        content="画一张架构图",
        status="completed",
    )
    assistant_message = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        role="assistant",
        content="",
        status="streaming",
    )
    generation = MessageGeneration(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        user_message_id=user_message.id,
        assistant_message_id=assistant_message.id,
        user_id=user.id,
        status="running",
        model="gpt-test",
    )
    assistant_message.generation_id = generation.id
    db_session.add_all([conversation, user_message, assistant_message, generation])
    await db_session.commit()

    blocker = asyncio.Event()

    async def fake_run_agent(**_kwargs):
        yield {"type": "token", "content": "部分输出"}
        await blocker.wait()
        yield {"type": "done"}

    async def fake_prompt_context(*_args, **_kwargs):
        return SimpleNamespace(all_memories=[])

    monkeypatch.setattr("app.agents.chat.task_manager.AsyncSessionLocal", session_factory)
    monkeypatch.setattr(
        "app.agents.core.react_agent.classify_agent_execution_route",
        lambda **_kwargs: SimpleNamespace(mode="single"),
    )
    monkeypatch.setattr("app.agents.core.react_agent.run_agent", fake_run_agent)
    monkeypatch.setattr(
        "app.services.conversation_service.ConversationService._load_history",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        "app.services.conversation_service._load_prompt_context_safely",
        fake_prompt_context,
    )

    task = start_message_generation_task(
        str(generation.id),
        content=user_message.content,
        global_search=True,
        tool_hint=None,
        attachment_ids=None,
        thinking_enabled=None,
        trace_id=None,
    )

    await asyncio.sleep(0.05)
    cancel_message_generation_task(str(generation.id))
    await task

    async with session_factory() as check_session:
        persisted_generation = await check_session.get(MessageGeneration, generation.id)
        persisted_message = await check_session.get(Message, assistant_message.id)
        assert persisted_generation is not None
        assert persisted_generation.status == "cancelled"
        assert persisted_generation.completed_at is not None

        assert persisted_message is not None
        assert persisted_message.status == "completed"
        assert persisted_message.content == "部分输出"
