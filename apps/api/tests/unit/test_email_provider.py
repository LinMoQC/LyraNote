"""
Unit tests for app.providers.email: send_email and _get_smtp_config.

Mocks aiosmtplib — no real SMTP. _get_smtp_config uses a fake async session
(avoid SQLite + JSONB DDL in local pytest).
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

from app.providers.email import _format_email_exception, _get_smtp_config, send_email


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
            result = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_username": "u@h.com",
                    "smtp_password": "p",
                    "smtp_from": "",
                },
            )
        assert result.ok is False
        assert result.error == "SMTP not configured: missing host or username"
        smtp_cls.assert_not_called()

    async def test_returns_false_when_username_missing(self):
        with patch("app.providers.email.aiosmtplib.SMTP") as smtp_cls:
            result = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_password": "p",
                },
            )
        assert result.ok is False
        assert result.error == "SMTP not configured: missing host or username"
        smtp_cls.assert_not_called()

    async def test_returns_false_when_smtp_username_empty_string(self):
        """Early exit: missing username before from_addr is evaluated."""
        with patch("app.providers.email.aiosmtplib.SMTP") as smtp_cls:
            result = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_username": "",
                    "smtp_password": "p",
                },
            )
        assert result.ok is False
        assert result.error == "SMTP not configured: missing host or username"
        smtp_cls.assert_not_called()

    async def test_returns_false_when_from_addr_empty_after_strip(self):
        """Hits `if not from_addr`: smtp_from is whitespace-only (truthy before .strip())."""
        with patch("app.providers.email.aiosmtplib.SMTP") as smtp_cls:
            result = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_username": "user@example.com",
                    "smtp_password": "p",
                    "smtp_from": "   ",
                },
            )
        assert result.ok is False
        assert result.error == "SMTP not configured: empty smtp_from and username; set From address or SMTP user"
        smtp_cls.assert_not_called()

    async def test_returns_false_when_whitespace_only_username_no_from(self):
        """from_addr = ('' or '   ' or '').strip() -> empty."""
        with patch("app.providers.email.aiosmtplib.SMTP") as smtp_cls:
            result = await send_email(
                to="a@b.com",
                subject="s",
                html_body="<p>x</p>",
                smtp_config={
                    "smtp_host": "smtp.example.com",
                    "smtp_username": "   ",
                    "smtp_password": "p",
                },
            )
        assert result.ok is False
        assert result.error == "SMTP not configured: empty smtp_from and username; set From address or SMTP user"
        smtp_cls.assert_not_called()

    async def test_smtp_from_empty_string_falls_back_to_username(self):
        inst = _smtp_instance_mock()
        with patch("app.providers.email.aiosmtplib.SMTP", return_value=inst) as smtp_cls:
            result = await send_email(
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
        assert result.ok is True
        assert result.error is None
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
            result = await send_email(
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
        assert result.ok is True
        msg = inst.send_message.await_args[0][0]
        assert msg["From"] == "Custom <custom@example.com>"

    async def test_port_465_uses_tls_not_start_tls(self):
        inst = _smtp_instance_mock()
        with patch("app.providers.email.aiosmtplib.SMTP", return_value=inst) as smtp_cls:
            result = await send_email(
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
        assert result.ok is True
        _, kwargs = smtp_cls.call_args
        assert kwargs["port"] == 465
        assert kwargs["use_tls"] is True
        assert "start_tls" not in kwargs or kwargs.get("start_tls") is not True

    async def test_returns_false_on_smtp_error(self):
        inst = _smtp_instance_mock()
        inst.login = AsyncMock(side_effect=RuntimeError("auth failed"))
        with patch("app.providers.email.aiosmtplib.SMTP", return_value=inst):
            result = await send_email(
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
        assert result.ok is False
        assert result.error == "auth failed"


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


def test_format_email_exception_falls_back_to_exception_type():
    assert _format_email_exception(RuntimeError("")) == "RuntimeError"
    assert _format_email_exception(RuntimeError("auth failed")) == "auth failed"
