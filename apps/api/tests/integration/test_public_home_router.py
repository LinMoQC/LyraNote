from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models import Notebook, PublicHomeState, UserPortrait


def _fake_public_home_json(notebook_id: uuid.UUID) -> str:
    return (
        "{"
        "\"hero_summary\":\"A public knowledge home\","
        "\"profession_guess\":\"Independent researcher\","
        "\"interest_tags\":[\"AI\",\"Knowledge management\"],"
        "\"current_research\":[\"Open Notebook\"],"
        "\"timeline_items\":[{"
        f"\"title\":\"Open Notebook\",\"summary\":\"Public milestone\",\"time_label\":\"最近\",\"source_notebook_ids\":[\"{notebook_id}\"]"
        "}],"
        "\"topic_clusters\":[\"AI\",\"Knowledge management\"],"
        f"\"featured_notebook_ids\":[\"{notebook_id}\"]"
        "}"
    )


@pytest.mark.asyncio
async def test_public_site_hides_draft_until_approved(client, auth_headers, db_session, test_user):
    user, _ = test_user
    notebook = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Open Notebook",
        description="A published notebook",
        is_public=True,
        source_count=4,
    )
    portrait = UserPortrait(
        user_id=user.id,
        portrait_json={
            "identity_summary": "Public portrait summary",
            "identity": {"primary_role": "Researcher", "confidence": 0.9},
            "knowledge_map": {"expert_domains": ["AI"], "learning_domains": [], "weak_domains": [], "emerging_interest": []},
            "research_trajectory": {"current_focus": "Open Notebook", "recently_completed": [], "next_likely_topics": [], "long_term_direction": "Long-term research"},
            "interaction_style": {"preferred_depth": "technical", "answer_format": "structured", "preferred_language": "中文", "engagement_style": "editorial"},
            "growth_signals": {"knowledge_velocity": "high", "this_period_learned": [], "recurring_questions": [], "knowledge_gaps_detected": []},
            "work_patterns": {"prefers_deep_focus": True, "writing_to_reading_ratio": 0.3, "session_style": "deep work"},
        },
    )
    db_session.add_all([notebook, portrait])
    await db_session.commit()

    with patch("app.services.public_home_service.chat", return_value=_fake_public_home_json(notebook.id)):
        draft_res = await client.post("/api/v1/public-home/generate", headers=auth_headers)

    assert draft_res.status_code == 200
    assert draft_res.json()["data"]["draft_profile"] is not None
    assert draft_res.json()["data"]["approved_profile"] is None

    site_before = await client.get("/api/v1/public/site")
    assert site_before.status_code == 200
    assert site_before.json()["data"]["profile"] is None
    assert len(site_before.json()["data"]["notebooks"]) == 1

    approve_res = await client.post("/api/v1/public-home/approve", headers=auth_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["data"]["approved_profile"] is not None

    site_after = await client.get("/api/v1/public/site")
    assert site_after.status_code == 200
    assert site_after.json()["data"]["profile"]["hero_summary"] == "A public knowledge home"
    assert site_after.json()["data"]["profile"]["portrait_snapshot"]["identity"]["primary_role"] == "Researcher"
    assert len(site_after.json()["data"]["featured_notebooks"]) == 1


@pytest.mark.asyncio
async def test_publish_notebook_refreshes_public_home_draft(client, auth_headers, db_session, test_user):
    user, _ = test_user
    notebook = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Draft Notebook",
        description="Will be published",
        is_public=False,
        source_count=2,
    )
    db_session.add(notebook)
    await db_session.commit()

    with patch("app.services.public_home_service.chat", return_value=_fake_public_home_json(notebook.id)):
        response = await client.patch(f"/api/v1/notebooks/{notebook.id}/publish", headers=auth_headers)

    assert response.status_code == 200

    state = await client.get("/api/v1/public-home", headers=auth_headers)
    assert state.status_code == 200
    assert state.json()["data"]["draft_profile"] is not None
    assert state.json()["data"]["approved_profile"] is None


@pytest.mark.asyncio
async def test_backfill_portrait_endpoint_updates_approved_profile(client, auth_headers, db_session, test_user):
    user, _ = test_user
    notebook = Notebook(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Approved Notebook",
        description="A published notebook",
        is_public=True,
        source_count=2,
    )
    portrait = UserPortrait(
        user_id=user.id,
        portrait_json={
            "identity_summary": "Public portrait summary",
            "identity": {"primary_role": "Researcher", "confidence": 0.9},
            "knowledge_map": {"expert_domains": ["AI"], "learning_domains": [], "weak_domains": [], "emerging_interest": []},
            "research_trajectory": {"current_focus": "Approved Notebook", "recently_completed": [], "next_likely_topics": [], "long_term_direction": "Long-term research"},
            "interaction_style": {"preferred_depth": "technical", "answer_format": "structured", "preferred_language": "中文", "engagement_style": "editorial"},
            "growth_signals": {"knowledge_velocity": "high", "this_period_learned": [], "recurring_questions": [], "knowledge_gaps_detected": []},
            "work_patterns": {"prefers_deep_focus": True, "writing_to_reading_ratio": 0.3, "session_style": "deep work"},
        },
    )
    db_session.add_all([notebook, portrait])
    await db_session.commit()

    with patch("app.services.public_home_service.chat", return_value=_fake_public_home_json(notebook.id)):
        await client.post("/api/v1/public-home/generate", headers=auth_headers)
        await client.post("/api/v1/public-home/approve", headers=auth_headers)

    state_before = await client.get("/api/v1/public-home", headers=auth_headers)
    assert state_before.status_code == 200

    raw_state = (
        await db_session.execute(select(PublicHomeState).where(PublicHomeState.user_id == user.id))
    ).scalar_one()
    raw_state.approved_profile_json.pop("portrait_snapshot", None)
    await db_session.commit()

    response = await client.post("/api/v1/public-home/backfill-portrait", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["data"]["approved_profile"]["portrait_snapshot"]["identity"]["primary_role"] == "Researcher"
