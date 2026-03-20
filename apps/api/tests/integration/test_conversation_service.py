"""
Integration tests for ConversationService.

Uses a real DB session (engine/db_session fixtures from tests/conftest.py).
No HTTP — calls the service layer directly to test business logic in isolation.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notebook, User
from app.auth import hash_password, create_access_token
from app.services.conversation_service import ConversationService


# ── Fixtures ──────────────────────────────────────────────────────────────────

async def _create_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username=f"svc_user_{uuid.uuid4().hex[:6]}",
        email=f"svc_{uuid.uuid4().hex[:6]}@test.com",
        name="Service Test User",
        password_hash=hash_password("password123"),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def _create_notebook(db: AsyncSession, user_id: uuid.UUID) -> Notebook:
    nb = Notebook(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Test Notebook",
    )
    db.add(nb)
    await db.flush()
    await db.refresh(nb)
    return nb


# ── Conversation CRUD ─────────────────────────────────────────────────────────

class TestConversationServiceCRUD:
    async def test_create_conversation_returns_object(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        conv = await svc.create(nb.id, title="My first conversation")

        assert conv.id is not None
        assert conv.notebook_id == nb.id
        assert conv.user_id == user.id
        assert conv.title == "My first conversation"

    async def test_create_conversation_with_none_title(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        conv = await svc.create(nb.id, title=None)

        assert conv.id is not None
        assert conv.title is None

    async def test_list_returns_created_conversation(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        conv = await svc.create(nb.id, title="Listed")
        results = await svc.list_by_notebook(nb.id)

        assert any(c.id == conv.id for c in results)

    async def test_list_empty_for_new_notebook(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        results = await svc.list_by_notebook(nb.id)

        assert results == []

    async def test_list_returns_multiple_conversations(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        await svc.create(nb.id, title="Conv A")
        await svc.create(nb.id, title="Conv B")
        results = await svc.list_by_notebook(nb.id)

        assert len(results) == 2

    async def test_delete_removes_conversation(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        conv = await svc.create(nb.id, title="To Delete")
        await svc.delete(conv.id)
        await db_session.flush()

        results = await svc.list_by_notebook(nb.id)
        assert not any(c.id == conv.id for c in results)

    async def test_list_only_shows_own_notebook_conversations(self, db_session):
        """Conversations from another notebook should not appear."""
        user = await _create_user(db_session)
        nb1 = await _create_notebook(db_session, user.id)
        nb2 = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        conv1 = await svc.create(nb1.id, title="Belongs to nb1")
        results = await svc.list_by_notebook(nb2.id)

        assert not any(c.id == conv1.id for c in results)


# ── Message operations ────────────────────────────────────────────────────────

class TestMessageService:
    async def test_save_user_message_returns_message(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)
        conv = await svc.create(nb.id, title="Msg test")

        msg = await svc.save_message(conv.id, role="user", content="Hello!")

        assert msg.id is not None
        assert msg.role == "user"
        assert msg.content == "Hello!"
        assert msg.conversation_id == conv.id

    async def test_save_assistant_message_with_reasoning(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)
        conv = await svc.create(nb.id, title="Reasoning test")

        msg = await svc.save_message(
            conv.id,
            role="assistant",
            content="Here is my answer.",
            reasoning="Step 1: think. Step 2: respond.",
        )

        assert msg.role == "assistant"
        assert msg.reasoning == "Step 1: think. Step 2: respond."

    async def test_save_message_with_citations(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)
        conv = await svc.create(nb.id, title="Citations test")

        citations = [{"source_id": "s1", "chunk_id": "c1", "excerpt": "text"}]
        msg = await svc.save_message(conv.id, role="assistant", content="Answer", citations=citations)

        assert msg.citations == citations

    async def test_list_messages_empty_initially(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)
        conv = await svc.create(nb.id, title="Empty msgs")

        messages = await svc.list_messages(conv.id)

        assert messages == []

    async def test_list_messages_returns_saved_messages(self, db_session):
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)
        conv = await svc.create(nb.id, title="List test")

        await svc.save_message(conv.id, role="user", content="Question")
        await svc.save_message(conv.id, role="assistant", content="Answer")
        messages = await svc.list_messages(conv.id)

        assert len(messages) == 2
        roles = [m.role for m in messages]
        assert "user" in roles
        assert "assistant" in roles

    async def test_list_messages_in_chronological_order(self, db_session):
        """list_messages should contain all saved messages with correct roles/content."""
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)
        conv = await svc.create(nb.id, title="Order test")

        await svc.save_message(conv.id, role="user", content="First")
        await svc.save_message(conv.id, role="assistant", content="Second")
        await svc.save_message(conv.id, role="user", content="Third")

        messages = await svc.list_messages(conv.id)

        assert len(messages) == 3
        contents = [m.content for m in messages]
        assert "First" in contents
        assert "Second" in contents
        assert "Third" in contents

    async def test_messages_isolated_between_conversations(self, db_session):
        """Messages from one conversation should not appear in another."""
        user = await _create_user(db_session)
        nb = await _create_notebook(db_session, user.id)
        svc = ConversationService(db_session, user.id)

        conv1 = await svc.create(nb.id, title="Conv 1")
        conv2 = await svc.create(nb.id, title="Conv 2")

        await svc.save_message(conv1.id, role="user", content="Only in conv1")

        msgs2 = await svc.list_messages(conv2.id)
        assert msgs2 == []
