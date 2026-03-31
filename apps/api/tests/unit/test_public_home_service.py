from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models import Notebook, PublicHomeState, UserPortrait
from app.services.public_home_service import (
    approve_public_home_draft,
    backfill_public_home_portrait_snapshot,
    discard_public_home_draft,
    generate_public_home_draft,
)


@pytest.mark.asyncio
async def test_generate_public_home_draft_uses_only_public_notebooks(db_session, test_user):
    user, _ = test_user
    public_nb = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Public AI Notes",
        description="Public summary",
        is_public=True,
        source_count=3,
    )
    private_nb = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Private Research Draft",
        description="Should never leak",
        is_public=False,
        source_count=1,
    )
    db_session.add_all([public_nb, private_nb])
    await db_session.commit()

    captured_prompt: dict[str, str] = {}

    async def fake_chat(*, messages, model, temperature, max_tokens):
        captured_prompt["content"] = messages[0]["content"]
        return (
            "{"
            f"\"hero_summary\":\"Public AI Notes are now public\","
            "\"profession_guess\":\"AI researcher\","
            "\"interest_tags\":[\"AI\",\"RAG\"],"
            "\"current_research\":[\"Public AI Notes\"],"
            "\"timeline_items\":[{"
            f"\"title\":\"Current focus\",\"summary\":\"Studying public AI notes\",\"time_label\":\"最近\",\"source_notebook_ids\":[\"{public_nb.id}\"]"
            "}],"
            "\"topic_clusters\":[\"AI\",\"RAG\"],"
            f"\"featured_notebook_ids\":[\"{public_nb.id}\"]"
            "}"
        )

    with patch("app.services.public_home_service.chat", side_effect=fake_chat):
        state = await generate_public_home_draft(db_session, user.id)

    assert state["draft_profile"] is not None
    assert "Public AI Notes" in captured_prompt["content"]
    assert "Private Research Draft" not in captured_prompt["content"]


@pytest.mark.asyncio
async def test_approve_and_discard_public_home_draft(db_session, test_user):
    user, _ = test_user
    notebook = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Open Notebook",
        description="Public",
        is_public=True,
        source_count=2,
    )
    db_session.add(notebook)
    await db_session.commit()

    async def fake_chat(*_, **__):
        return (
            "{"
            "\"hero_summary\":\"A public knowledge home\","
            "\"profession_guess\":\"Researcher\","
            "\"interest_tags\":[\"Knowledge\"],"
            "\"current_research\":[\"Open Notebook\"],"
            "\"timeline_items\":[{"
            f"\"title\":\"Open Notebook\",\"summary\":\"Public milestone\",\"time_label\":\"最近\",\"source_notebook_ids\":[\"{notebook.id}\"]"
            "}],"
            "\"topic_clusters\":[\"Knowledge\"],"
            f"\"featured_notebook_ids\":[\"{notebook.id}\"]"
            "}"
        )

    with patch("app.services.public_home_service.chat", side_effect=fake_chat):
        generated = await generate_public_home_draft(db_session, user.id)

    assert generated["draft_profile"] is not None
    approved = await approve_public_home_draft(db_session, user.id)
    assert approved["approved_profile"] is not None

    discarded = await discard_public_home_draft(db_session, user.id)
    assert discarded["draft_profile"] is None
    assert discarded["approved_profile"] is not None


@pytest.mark.asyncio
async def test_generate_public_home_draft_includes_public_portrait_snapshot(db_session, test_user):
    user, _ = test_user
    notebook = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Portrait Notebook",
        description="Public",
        is_public=True,
        source_count=2,
    )
    portrait = UserPortrait(
        user_id=user.id,
        portrait_json={
            "identity_summary": "A systems-minded researcher with strong front-end taste.",
            "identity": {
                "primary_role": "AI researcher",
                "expertise_level": "expert",
                "personality_type": "structured thinker",
                "confidence": 0.95,
            },
            "knowledge_map": {
                "expert_domains": ["RAG", "React"],
                "learning_domains": ["Agents"],
                "emerging_interest": ["Symbolic AI"],
                "weak_domains": [],
            },
            "research_trajectory": {
                "current_focus": "Agentic workflows",
                "recently_completed": ["Notebook publishing"],
                "next_likely_topics": ["Evaluation loops"],
                "long_term_direction": "Personal AI systems",
            },
            "interaction_style": {
                "preferred_depth": "technical",
                "answer_format": "structured",
                "preferred_language": "中文",
                "engagement_style": "editorial",
            },
            "growth_signals": {
                "knowledge_velocity": "high",
                "this_period_learned": ["RAG"],
                "recurring_questions": ["How to structure a public archive"],
                "knowledge_gaps_detected": [],
            },
            "work_patterns": {
                "prefers_deep_focus": True,
                "writing_to_reading_ratio": 0.35,
                "session_style": "deep work",
            },
        },
    )
    db_session.add_all([notebook, portrait])
    await db_session.commit()

    async def fake_chat(*_, **__):
        return (
            "{"
            "\"hero_summary\":\"A public portrait home\","
            "\"profession_guess\":\"Researcher\","
            "\"interest_tags\":[\"AI\"],"
            "\"current_research\":[\"Agentic workflows\"],"
            "\"timeline_items\":[{"
            f"\"title\":\"Portrait Notebook\",\"summary\":\"Public milestone\",\"time_label\":\"最近\",\"source_notebook_ids\":[\"{notebook.id}\"]"
            "}],"
            "\"topic_clusters\":[\"AI\"],"
            f"\"featured_notebook_ids\":[\"{notebook.id}\"]"
            "}"
        )

    with patch("app.services.public_home_service.chat", side_effect=fake_chat):
        generated = await generate_public_home_draft(db_session, user.id)

    snapshot = generated["draft_profile"]["portrait_snapshot"]
    assert snapshot is not None
    assert snapshot["identity"]["primary_role"] == "AI researcher"
    assert snapshot["research_trajectory"]["current_focus"] == "Agentic workflows"


@pytest.mark.asyncio
async def test_backfill_public_home_portrait_snapshot_updates_approved_profile(db_session, test_user):
    user, _ = test_user
    notebook = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Approved Notebook",
        description="Public",
        is_public=True,
        source_count=1,
    )
    portrait = UserPortrait(
        user_id=user.id,
        portrait_json={
            "identity_summary": "A public portrait summary",
            "identity": {"primary_role": "Research lead", "confidence": 0.88},
            "knowledge_map": {"expert_domains": ["RAG"], "learning_domains": [], "weak_domains": [], "emerging_interest": []},
            "research_trajectory": {"current_focus": "Knowledge archives", "recently_completed": [], "next_likely_topics": [], "long_term_direction": "Long-term systems"},
            "interaction_style": {"preferred_depth": "technical", "answer_format": "structured", "preferred_language": "中文", "engagement_style": "editorial"},
            "growth_signals": {"knowledge_velocity": "high", "this_period_learned": [], "recurring_questions": [], "knowledge_gaps_detected": []},
            "work_patterns": {"prefers_deep_focus": True, "writing_to_reading_ratio": 0.4, "session_style": "deep work"},
        },
    )
    db_session.add_all([notebook, portrait])
    await db_session.commit()

    async def fake_chat(*_, **__):
        return (
            "{"
            "\"hero_summary\":\"Approved public profile\","
            "\"profession_guess\":\"Researcher\","
            "\"interest_tags\":[\"Knowledge\"],"
            "\"current_research\":[\"Archives\"],"
            "\"timeline_items\":[{"
            f"\"title\":\"Approved Notebook\",\"summary\":\"Public milestone\",\"time_label\":\"最近\",\"source_notebook_ids\":[\"{notebook.id}\"]"
            "}],"
            "\"topic_clusters\":[\"Knowledge\"],"
            f"\"featured_notebook_ids\":[\"{notebook.id}\"]"
            "}"
        )

    with patch("app.services.public_home_service.chat", side_effect=fake_chat):
        await generate_public_home_draft(db_session, user.id)
    await approve_public_home_draft(db_session, user.id)

    # Simulate an older approved profile without portrait snapshot.
    state = await discard_public_home_draft(db_session, user.id)
    assert state["approved_profile"]["portrait_snapshot"] is not None

    raw_state = (await db_session.execute(select(PublicHomeState).where(PublicHomeState.user_id == user.id))).scalar_one()
    raw_state.approved_profile_json.pop("portrait_snapshot", None)
    await db_session.flush()

    backfilled = await backfill_public_home_portrait_snapshot(db_session, user.id)
    assert backfilled["approved_profile"]["portrait_snapshot"]["identity"]["primary_role"] == "Research lead"
