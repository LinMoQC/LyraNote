from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from sqlalchemy import select

from app.config import settings
from app.domains.config.router import get_config, update_config
from app.domains.config.schemas import ConfigPatchRequest
from app.domains.setup.router import load_settings_from_db
from app.models import AppConfig
from app.providers import storage as storage_provider


@pytest.mark.asyncio
async def test_load_settings_from_db_resets_storage_singleton_and_prefers_canonical_region(
    db_session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_s3_region", "us-east-1")

    storage_provider.reset_storage_instance()
    original_storage = storage_provider.storage()
    sentinel_storage = object()
    monkeypatch.setattr(storage_provider, "get_storage_provider", lambda: sentinel_storage)

    db_session.add_all(
        [
            AppConfig(key="storage_backend", value="minio"),
            AppConfig(key="storage_region", value="legacy-region"),
            AppConfig(key="storage_s3_region", value="canonical-region"),
        ]
    )
    await db_session.commit()

    await load_settings_from_db(db_session)

    assert settings.storage_backend == "minio"
    assert settings.storage_s3_region == "canonical-region"
    assert storage_provider.storage() is sentinel_storage
    assert storage_provider.storage() is not original_storage

    storage_provider.reset_storage_instance()


@pytest.mark.asyncio
async def test_update_config_maps_legacy_storage_region_to_canonical_key(
    db_session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_s3_region", "us-east-1")

    storage_provider.reset_storage_instance()
    original_storage = storage_provider.storage()
    sentinel_storage = object()
    monkeypatch.setattr(storage_provider, "get_storage_provider", lambda: sentinel_storage)

    await update_config(
        ConfigPatchRequest(
            data={
                "storage_backend": "minio",
                "storage_region": "ap-southeast-1",
            }
        ),
        MagicMock(),
        db_session,
    )

    rows = (
        await db_session.execute(
            select(AppConfig).where(
                AppConfig.key.in_(("storage_backend", "storage_region", "storage_s3_region"))
            )
        )
    ).scalars().all()
    row_map = {row.key: row.value for row in rows}

    assert row_map["storage_backend"] == "minio"
    assert row_map["storage_s3_region"] == "ap-southeast-1"
    assert "storage_region" not in row_map
    assert settings.storage_backend == "minio"
    assert settings.storage_s3_region == "ap-southeast-1"
    assert storage_provider.storage() is sentinel_storage
    assert storage_provider.storage() is not original_storage

    resp = await get_config(MagicMock(), db_session)

    assert resp.data is not None
    assert resp.data.data["storage_region"] == "ap-southeast-1"

    storage_provider.reset_storage_instance()
