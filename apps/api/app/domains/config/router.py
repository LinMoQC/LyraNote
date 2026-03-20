"""
Config domain: read and update runtime AppConfig (requires auth).
Allows the settings UI to read/write AI, storage, and personality config
without going through the setup wizard.
"""
from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select

from app.config import settings as app_settings
from app.dependencies import CurrentUser, DbDep
from app.exceptions import BadRequestError
from app.models import AppConfig
from app.schemas.response import ApiResponse, success

from .schemas import ConfigOut, ConfigPatchRequest, TestEmailResult, TestLlmResult

router = APIRouter(tags=["config"])

# Keys that can be read/written via this endpoint (mirrors setup RUNTIME_CONFIG_KEYS)
EDITABLE_KEYS = {
    # AI
    "llm_provider",
    "openai_api_key",
    "openai_base_url",
    "llm_model",
    "embedding_model",
    "tavily_api_key",
    "perplexity_api_key",
    # Storage
    "storage_backend",
    "storage_region",
    "storage_s3_endpoint_url",
    "storage_s3_public_url",
    "storage_s3_bucket",
    "storage_s3_access_key",
    "storage_s3_secret_key",
    # Personality
    "ai_name",
    "user_occupation",
    "user_preferences",
    "custom_system_prompt",
    # Notify / SMTP
    "notify_email",
    "smtp_host",
    "smtp_port",
    "smtp_username",
    "smtp_password",
    "smtp_from",
}

# Keys whose values should be masked when reading (shown as placeholder)
_SENSITIVE_KEYS = {
    "openai_api_key",
    "storage_s3_access_key",
    "storage_s3_secret_key",
    "tavily_api_key",
    "perplexity_api_key",
    "smtp_password",
}


@router.get("/config", response_model=ApiResponse[ConfigOut])
async def get_config(_current_user: CurrentUser, db: DbDep):
    """Return all editable runtime config values. Sensitive keys are masked."""
    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(EDITABLE_KEYS))
    )
    rows = result.scalars().all()
    config: dict[str, str | None] = {key: None for key in EDITABLE_KEYS}
    for row in rows:
        if row.key in _SENSITIVE_KEYS and row.value:
            config[row.key] = "••••••••"
        else:
            config[row.key] = row.value
    return success(ConfigOut(data=config))


@router.patch("/config", status_code=status.HTTP_204_NO_CONTENT)
async def update_config(body: ConfigPatchRequest, _current_user: CurrentUser, db: DbDep):
    """Batch-update runtime config. Only keys in EDITABLE_KEYS are accepted."""
    from app.config import settings

    unknown = set(body.data.keys()) - EDITABLE_KEYS
    if unknown:
        raise BadRequestError(f"未知的配置键：{', '.join(sorted(unknown))}")

    for key, value in body.data.items():
        str_value = str(value) if value is not None else ""
        # Skip masked placeholder — don't overwrite with the mask string
        if str_value == "••••••••":
            continue

        result = await db.execute(select(AppConfig).where(AppConfig.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = str_value
        else:
            db.add(AppConfig(key=key, value=str_value))

        # Sync to in-memory settings immediately (non-critical)
        if str_value:
            try:
                setattr(settings, key, str_value)
            except Exception:
                pass

    await db.commit()

    # Reset LLM provider singleton when provider-related keys change
    provider_keys = {"openai_api_key", "openai_base_url", "llm_model", "llm_provider"}
    if provider_keys & set(body.data.keys()):
        from app.providers.provider_factory import reset_provider
        reset_provider()


@router.post("/config/test-email", response_model=ApiResponse[TestEmailResult])
async def test_email(_current_user: CurrentUser, db: DbDep):
    """Send a real test email using the current SMTP configuration."""
    from app.providers.email import send_email

    result = await db.execute(
        select(AppConfig).where(
            AppConfig.key.in_({"notify_email", "smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from"})
        )
    )
    cfg = {r.key: r.value for r in result.scalars().all()}

    to = cfg.get("notify_email", "")
    if not to:
        return success(TestEmailResult(ok=False, message="未设置通知邮箱地址"))

    if not cfg.get("smtp_host") or not cfg.get("smtp_username"):
        return success(TestEmailResult(ok=False, message="SMTP 未配置完整"))

    html = """<div style="font-family:-apple-system,sans-serif;padding:24px;max-width:480px;margin:0 auto;">
      <h2 style="color:#6366f1;">LyraNote 测试邮件</h2>
      <p style="color:#374151;line-height:1.6;">如果你收到了这封邮件，说明 SMTP 配置正确，邮件功能已可正常使用。</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">— LyraNote</p>
    </div>"""

    sent = await send_email(
        to=to,
        subject="LyraNote 测试邮件",
        html_body=html,
        text_body="如果你收到了这封邮件，说明 SMTP 配置正确。",
        smtp_config=cfg,
    )

    if sent:
        return success(TestEmailResult(ok=True, message=f"测试邮件已发送至 {to}"))
    return success(TestEmailResult(ok=False, message="发送失败，请检查 SMTP 配置"))


@router.post("/config/test-llm", response_model=ApiResponse[TestLlmResult])
async def test_llm_connection(_current_user: CurrentUser, db: DbDep):
    """Send a minimal request to the configured LLM to verify connectivity."""
    from openai import AsyncOpenAI

    result = await db.execute(select(AppConfig).where(AppConfig.key.in_({"openai_api_key", "openai_base_url", "llm_model"})))
    rows = {r.key: r.value for r in result.scalars().all()}

    api_key = rows.get("openai_api_key") or app_settings.openai_api_key
    base_url = rows.get("openai_base_url") or app_settings.openai_base_url or None
    model = rows.get("llm_model") or app_settings.llm_model

    if not api_key:
        return success(TestLlmResult(ok=False, model=model, message="未设置 API Key"))

    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=15.0)
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=5,
        )
        reply = (resp.choices[0].message.content or "").strip()
        return success(TestLlmResult(ok=True, model=model, message=reply or "OK"))
    except Exception as exc:
        return success(TestLlmResult(ok=False, model=model, message=str(exc)[:200]))
