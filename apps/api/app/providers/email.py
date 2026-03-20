"""
Email sending provider using SMTP configuration from app_config.
"""

import logging
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppConfig

logger = logging.getLogger(__name__)


async def _get_smtp_config(db: AsyncSession) -> dict:
    keys = ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from"]
    result = await db.execute(
        select(AppConfig.key, AppConfig.value).where(AppConfig.key.in_(keys))
    )
    return {row[0]: row[1] for row in result.all()}


async def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str = "",
    db: AsyncSession | None = None,
    smtp_config: dict | None = None,
) -> bool:
    config = smtp_config or (await _get_smtp_config(db) if db else {})

    host = config.get("smtp_host", "")
    port = int(config.get("smtp_port", 587))
    username = config.get("smtp_username", "")
    password = config.get("smtp_password", "")
    from_addr = config.get("smtp_from", username)

    if not host or not username:
        logger.error("SMTP not configured: missing host or username")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    use_ssl = port == 465
    tls_ctx = ssl.create_default_context()
    try:
        if use_ssl:
            smtp = aiosmtplib.SMTP(
                hostname=host, port=port,
                use_tls=True, tls_context=tls_ctx,
                timeout=30,
            )
        else:
            smtp = aiosmtplib.SMTP(
                hostname=host, port=port,
                start_tls=True, tls_context=tls_ctx,
                timeout=30,
            )
        await smtp.connect()
        await smtp.login(username, password)
        await smtp.send_message(msg)
        await smtp.quit()
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False
