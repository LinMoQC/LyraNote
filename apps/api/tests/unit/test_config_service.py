from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import AppConfig
from app.services.config_service import ConfigService, MASKED_VALUE


@pytest.mark.asyncio
async def test_get_runtime_config_ignores_removed_custom_system_prompt_key(
    db_session,
) -> None:
    db_session.add_all(
        [
            AppConfig(key="ai_name", value="Kami"),
            AppConfig(key="custom_system_prompt", value="stale prompt"),
        ]
    )
    await db_session.commit()

    config = await ConfigService(db_session).get_runtime_config()

    assert config["ai_name"] == "Kami"
    assert "custom_system_prompt" not in config


@pytest.mark.asyncio
async def test_update_runtime_config_uses_canonical_storage_key_and_skips_mask(
    db_session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "storage_s3_region", "us-east-1")

    db_session.add(AppConfig(key="storage_region", value="legacy-region"))
    await db_session.commit()

    service = ConfigService(db_session)
    await service.update_runtime_config(
        {
            "storage_region": "ap-southeast-1",
            "smtp_password": MASKED_VALUE,
            "notebook_appearance_defaults": '{"themeId":"paper-serif"}',
        }
    )

    rows = (
        await db_session.execute(
            select(AppConfig).where(
                AppConfig.key.in_(
                    {
                        "storage_region",
                        "storage_s3_region",
                        "smtp_password",
                        "notebook_appearance_defaults",
                    }
                )
            )
        )
    ).scalars().all()
    row_map = {row.key: row.value for row in rows}

    assert row_map["storage_s3_region"] == "ap-southeast-1"
    assert row_map["notebook_appearance_defaults"] == '{"themeId":"paper-serif"}'
    assert "storage_region" not in row_map
    assert "smtp_password" not in row_map
    assert settings.storage_s3_region == "ap-southeast-1"


@pytest.mark.asyncio
async def test_saved_llm_connection_uses_shared_helper_and_db_values(
    db_session,
    monkeypatch,
) -> None:
    db_session.add_all(
        [
            AppConfig(key="llm_provider", value="litellm"),
            AppConfig(key="openai_api_key", value="sk-live"),
            AppConfig(key="openai_base_url", value="https://example.test/v1"),
            AppConfig(key="llm_model", value="gemini/flash"),
        ]
    )
    await db_session.commit()

    helper = AsyncMock(return_value="pong")
    monkeypatch.setattr(
        "app.services.config_service._run_chat_connection_test",
        helper,
    )

    result = await ConfigService(db_session).test_saved_llm_connection()

    assert result == {"ok": True, "model": "gemini/flash", "message": "pong"}
    helper.assert_awaited_once_with(
        provider="litellm",
        api_key="sk-live",
        base_url="https://example.test/v1",
        model="gemini/flash",
    )
