from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.agents.chat.task_manager import _snapshot_list
from app.models import Conversation, Message, User


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
