"""
Unit tests for app.providers.email: send_email and _get_smtp_config.

Mocks aiosmtplib — no real SMTP. DB tests use the shared db_session fixture.
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

from app.providers.email import _get_smtp_config, send_email


def _smtp_instance_mock() -> MagicMock:
    inst = MagicMock()
    inst.connect = AsyncMock()
    inst.login = AsyncMock()
    inst.send_message = AsyncMock()
    inst.quit = AsyncMock()
    return inst


@pytest.mark.asyncio
class TestSendEmail:
    async def test_returns_false_when_host_missing(self):
        with patch("app.providers.email.aiosmtplib.SMTP") as smtp_cls:
            ok = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_username": "u@h.com",
                    "smtp_password": "p",
                    "smtp_from": "",
                },
            )
        assert ok is False
        smtp_cls.assert_not_called()

    async def test_returns_false_when_username_missing(self):
        with patch("app.providers.email.aiosmtplib.SMTP") as smtp_cls:
            ok = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_password": "p",
                },
            )
        assert ok is False
        smtp_cls.assert_not_called()

    async def test_returns_false_when_from_and_username_empty(self):
        with patch("app.providers.email.aiosmtplib.SMTP") as smtp_cls:
            ok = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_username": "",
                    "smtp_password": "p",
                },
            )
        assert ok is False
        smtp_cls.assert_not_called()

    async def test_smtp_from_empty_string_falls_back_to_username(self):
        inst = _smtp_instance_mock()
        with patch("app.providers.email.aiosmtplib.SMTP", return_value=inst) as smtp_cls:
            ok = await send_email(
                to="to@example.com",
                subject="Subj",
                html_body="<p>h</p>",
                text_body="t",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_port": "587",
                    "smtp_username": "user@example.com",
                    "smtp_password": "secret",
                    "smtp_from": "",
                },
            )
        assert ok is True
        smtp_cls.assert_called_once()
        _, kwargs = smtp_cls.call_args
        assert kwargs["hostname"] == "smtp.example.com"
        assert kwargs["port"] == 587
        assert kwargs["start_tls"] is True
        assert kwargs.get("use_tls") is not True
        inst.connect.assert_awaited_once()
        inst.login.assert_awaited_once_with("user@example.com", "secret")
        inst.send_message.assert_awaited_once()
        msg = inst.send_message.await_args[0][0]
        assert msg["From"] == "user@example.com"
        assert msg["To"] == "to@example.com"
        inst.quit.assert_awaited_once()

    async def test_smtp_from_set_uses_config_value(self):
        inst = _smtp_instance_mock()
        with patch("app.providers.email.aiosmtplib.SMTP", return_value=inst):
            ok = await send_email(
                to="to@example.com",
                subject="S",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 587,
                    "smtp_username": "user@example.com",
                    "smtp_password": "secret",
                    "smtp_from": "Custom <custom@example.com>",
                },
            )
        assert ok is True
        msg = inst.send_message.await_args[0][0]
        assert msg["From"] == "Custom <custom@example.com>"

    async def test_port_465_uses_tls_not_start_tls(self):
        inst = _smtp_instance_mock()
        with patch("app.providers.email.aiosmtplib.SMTP", return_value=inst) as smtp_cls:
            ok = await send_email(
                to="t@e.com",
                subject="S",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.qq.com",
                    "smtp_port": 465,
                    "smtp_username": "u@qq.com",
                    "smtp_password": "pw",
                    "smtp_from": "",
                },
            )
        assert ok is True
        _, kwargs = smtp_cls.call_args
        assert kwargs["port"] == 465
        assert kwargs["use_tls"] is True
        assert "start_tls" not in kwargs or kwargs.get("start_tls") is not True

    async def test_returns_false_on_smtp_error(self):
        inst = _smtp_instance_mock()
        inst.login = AsyncMock(side_effect=RuntimeError("auth failed"))
        with patch("app.providers.email.aiosmtplib.SMTP", return_value=inst):
            ok = await send_email(
                to="t@e.com",
                subject="S",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_username": "u@e.com",
                    "smtp_password": "p",
                    "smtp_from": "u@e.com",
                },
            )
        assert ok is False


class _KeyValueResult:
    """Mimics SQLAlchemy result.all() for select(key, value)."""

    def __init__(self, pairs: list[tuple[str, str | None]]):
        self._pairs = pairs

    def all(self):
        return self._pairs


class _FakeAsyncSession:
    def __init__(self, pairs: list[tuple[str, str | None]]):
        self._pairs = pairs

    async def execute(self, _statement):
        return _KeyValueResult(list(self._pairs))


@pytest.mark.asyncio
class TestGetSmtpConfig:
    async def test_reads_keys_from_app_config(self):
        sess = _FakeAsyncSession(
            [
                ("smtp_host", "h.mail.com"),
                ("smtp_port", "587"),
                ("smtp_username", "u@x.com"),
                ("smtp_password", "pw"),
                ("smtp_from", "from@x.com"),
            ]
        )
        cfg = await _get_smtp_config(sess)  # type: ignore[arg-type]
        assert cfg == {
            "smtp_host": "h.mail.com",
            "smtp_port": "587",
            "smtp_username": "u@x.com",
            "smtp_password": "pw",
            "smtp_from": "from@x.com",
        }

    async def test_missing_keys_omitted_from_dict(self):
        sess = _FakeAsyncSession([("smtp_host", "only-host")])
        cfg = await _get_smtp_config(sess)  # type: ignore[arg-type]
        assert cfg == {"smtp_host": "only-host"}


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
        from app.domains.config.router import test_email

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
        with patch("app.providers.email.send_email", AsyncMock(return_value=True)) as send:
            resp = await test_email(user, db)  # type: ignore[arg-type]
        assert resp.code == 0
        assert resp.data is not None
        assert resp.data.ok is True
        send.assert_awaited_once()
        call_kw = send.await_args[1]
        assert call_kw["smtp_config"]["smtp_from"] == ""

    async def test_skip_send_when_notify_email_missing(self):
        from app.domains.config.router import test_email

        rows = [
            _CfgRow("smtp_host", "smtp.example.com"),
            _CfgRow("smtp_username", "u@example.com"),
        ]
        with patch("app.providers.email.send_email", AsyncMock()) as send:
            resp = await test_email(MagicMock(), _ConfigFakeSession(rows))  # type: ignore[arg-type]
        assert resp.code == 0
        assert resp.data is not None
        assert resp.data.ok is False
        assert "通知" in resp.data.message
        send.assert_not_called()

    async def test_skip_send_when_smtp_incomplete(self):
        from app.domains.config.router import test_email

        rows = [
            _CfgRow("notify_email", "to@test.com"),
            _CfgRow("smtp_host", ""),
            _CfgRow("smtp_username", "u@example.com"),
        ]
        with patch("app.providers.email.send_email", AsyncMock()) as send:
            resp = await test_email(MagicMock(), _ConfigFakeSession(rows))  # type: ignore[arg-type]
        assert resp.data is not None
        assert resp.data.ok is False
        send.assert_not_called()

    async def test_fail_response_when_send_returns_false(self):
        from app.domains.config.router import test_email

        rows = [
            _CfgRow("notify_email", "to@test.com"),
            _CfgRow("smtp_host", "smtp.example.com"),
            _CfgRow("smtp_username", "u@example.com"),
            _CfgRow("smtp_password", "pw"),
        ]
        with patch("app.providers.email.send_email", AsyncMock(return_value=False)):
            resp = await test_email(MagicMock(), _ConfigFakeSession(rows))  # type: ignore[arg-type]
        assert resp.data is not None
        assert resp.data.ok is False
