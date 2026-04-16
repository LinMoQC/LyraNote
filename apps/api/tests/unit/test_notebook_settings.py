from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models import AppConfig, Notebook


@pytest.mark.asyncio
async def test_notebook_settings_round_trip(client, auth_headers, db_session, test_user) -> None:
    user, _ = test_user
    notebook = Notebook(
        user_id=user.id,
        title="Writing Lab",
        status="active",
        appearance_settings={
            "font_family": "serif",
            "theme_id": "paper-serif",
            "font_size": "lg",
        },
    )
    db_session.add(notebook)
    await db_session.commit()
    await db_session.refresh(notebook)

    detail_response = await client.get(
        f"/api/v1/notebooks/{notebook.id}",
        headers=auth_headers,
    )

    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["appearance_settings"] == {
        "font_family": "serif",
        "theme_id": "paper-serif",
        "font_size": "lg",
        "content_width": None,
        "line_height": None,
        "paragraph_spacing": None,
        "heading_scale": None,
        "emphasize_title": None,
        "auto_save": None,
        "focus_mode_default": None,
        "default_right_panel": None,
    }

    update_response = await client.patch(
        f"/api/v1/notebooks/{notebook.id}",
        headers=auth_headers,
        json={
            "appearance_settings": {
                "font_family": "mono",
                "theme_id": "mono-draft",
                "auto_save": False,
            }
        },
    )

    assert update_response.status_code == 200
    assert update_response.json()["data"]["appearance_settings"]["font_family"] == "mono"
    assert update_response.json()["data"]["appearance_settings"]["auto_save"] is False

    await db_session.refresh(notebook)
    refreshed = (
        await db_session.execute(select(Notebook).where(Notebook.id == notebook.id))
    ).scalar_one()
    assert refreshed.appearance_settings == {
        "font_family": "mono",
        "theme_id": "mono-draft",
        "auto_save": False,
    }


@pytest.mark.asyncio
async def test_config_supports_notebook_appearance_defaults(client, auth_headers, db_session) -> None:
    payload = json.dumps(
        {
            "fontFamily": "serif",
            "themeId": "paper-serif",
            "autoSave": False,
        }
    )

    patch_response = await client.patch(
        "/api/v1/config",
        headers=auth_headers,
        json={"data": {"notebook_appearance_defaults": payload}},
    )

    assert patch_response.status_code == 204

    stored = (
        await db_session.execute(
            select(AppConfig).where(AppConfig.key == "notebook_appearance_defaults")
        )
    ).scalar_one()
    assert stored.value == payload

    get_response = await client.get("/api/v1/config", headers=auth_headers)

    assert get_response.status_code == 200
    assert get_response.json()["data"]["data"]["notebook_appearance_defaults"] == payload
