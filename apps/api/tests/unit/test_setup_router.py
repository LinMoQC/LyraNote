from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.domains.setup.router import setup_test_llm
from app.domains.setup.schemas import SetupTestLlmRequest


@pytest.mark.asyncio
async def test_setup_test_llm_delegates_to_config_service(monkeypatch) -> None:
    service_call = AsyncMock(return_value={"ok": True, "message": "pong"})
    monkeypatch.setattr(
        "app.domains.setup.router.ConfigService.test_llm_connection",
        service_call,
    )

    response = await setup_test_llm(
        SetupTestLlmRequest(
            api_key="sk-live",
            base_url="https://example.test/v1",
            model="gpt-4o-mini",
            llm_provider="openai",
        )
    )

    assert response.code == 0
    assert response.data is not None
    assert response.data.ok is True
    assert response.data.message == "pong"
    service_call.assert_awaited_once_with(
        api_key="sk-live",
        base_url="https://example.test/v1",
        model="gpt-4o-mini",
        llm_provider="openai",
    )
