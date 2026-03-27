"""
Unit tests for config domain: POST /config/test-email handler.

Uses fake DB sessions (no engine); patches app.providers.email.send_email.
"""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", "/tmp/lyranote-test-storage")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("DEBUG", "false")

# Alias: importing as `test_email` is picked up by pytest as a test function.
from app.domains.config.router import test_email as config_test_email_handler
from app.providers.email import EmailSendResult


class _CfgRow:
    __slots__ = ("key", "value")

    def __init__(self, key: str, value: str | None):
        self.key = key
        self.value = value


class _Scalars:
    def __init__(self, rows: list[_CfgRow]):
        self._rows = rows

    def all(self):
        return self._rows


class _ConfigExecuteResult:
    def __init__(self, rows: list[_CfgRow]):
        self._rows = rows

    def scalars(self):
        return _Scalars(self._rows)


class _ConfigFakeSession:
    def __init__(self, rows: list[_CfgRow]):
        self._rows = rows

    async def execute(self, _statement):
        return _ConfigExecuteResult(list(self._rows))


@pytest.mark.asyncio
class TestConfigTestEmailRoute:
    async def test_ok_when_config_complete_and_send_succeeds(self):
        rows = [
            _CfgRow("notify_email", "to@test.com"),
            _CfgRow("smtp_host", "smtp.example.com"),
            _CfgRow("smtp_port", "587"),
            _CfgRow("smtp_username", "u@example.com"),
            _CfgRow("smtp_password", "pw"),
            _CfgRow("smtp_from", ""),
        ]
        db = _ConfigFakeSession(rows)
        user = MagicMock()
        with patch(
            "app.providers.email.send_email",
            AsyncMock(return_value=EmailSendResult(ok=True)),
        ) as send:
            resp = await config_test_email_handler(user, db)  # type: ignore[arg-type]
        assert resp.code == 0
        assert resp.data is not None
        assert resp.data.ok is True
        send.assert_awaited_once()
        call_kw = send.await_args.kwargs
        assert call_kw["smtp_config"]["smtp_from"] == ""

    async def test_skip_send_when_notify_email_missing(self):
        rows = [
            _CfgRow("smtp_host", "smtp.example.com"),
            _CfgRow("smtp_username", "u@example.com"),
        ]
        with patch("app.providers.email.send_email", AsyncMock()) as send:
            resp = await config_test_email_handler(MagicMock(), _ConfigFakeSession(rows))  # type: ignore[arg-type]
        assert resp.code == 0
        assert resp.data is not None
        assert resp.data.ok is False
        assert "通知" in resp.data.message
        send.assert_not_called()

    async def test_skip_send_when_smtp_incomplete(self):
        rows = [
            _CfgRow("notify_email", "to@test.com"),
            _CfgRow("smtp_host", ""),
            _CfgRow("smtp_username", "u@example.com"),
        ]
        with patch("app.providers.email.send_email", AsyncMock()) as send:
            resp = await config_test_email_handler(MagicMock(), _ConfigFakeSession(rows))  # type: ignore[arg-type]
        assert resp.data is not None
        assert resp.data.ok is False
        send.assert_not_called()

    async def test_fail_response_when_send_returns_false(self):
        rows = [
            _CfgRow("notify_email", "to@test.com"),
            _CfgRow("smtp_host", "smtp.example.com"),
            _CfgRow("smtp_username", "u@example.com"),
            _CfgRow("smtp_password", "pw"),
        ]
        with patch(
            "app.providers.email.send_email",
            AsyncMock(return_value=EmailSendResult(ok=False, error="auth failed")),
        ):
            resp = await config_test_email_handler(MagicMock(), _ConfigFakeSession(rows))  # type: ignore[arg-type]
        assert resp.data is not None
        assert resp.data.ok is False
        assert "auth failed" in resp.data.message
