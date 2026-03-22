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

from .schemas import ConfigOut, ConfigPatchRequest, TestEmailResult, TestEmbeddingResult, TestLlmResult, TestRerankerResult

router = APIRouter(tags=["config"])

# Keys that can be read/written via this endpoint (mirrors setup RUNTIME_CONFIG_KEYS)
EDITABLE_KEYS = {
    # AI — LLM
    "llm_provider",
    "openai_api_key",
    "openai_base_url",
    "llm_model",
    # AI — Embedding
    "embedding_model",
    "embedding_api_key",
    "embedding_base_url",
    # AI — Reranker (optional, Cross-Encoder)
    "reranker_api_key",
    "reranker_model",
    "reranker_base_url",
    # AI — Search
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
    "embedding_api_key",
    "reranker_api_key",
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

    # Reset embedding client when embedding-related keys change
    embedding_keys = {"openai_api_key", "openai_base_url", "embedding_api_key", "embedding_base_url", "embedding_model"}
    if embedding_keys & set(body.data.keys()):
        try:
            from app.providers import embedding
            embedding._client = None
        except Exception:
            pass

    # Reset reranker client when reranker-related keys change
    reranker_keys = {"reranker_api_key", "reranker_model", "reranker_base_url"}
    if reranker_keys & set(body.data.keys()):
        try:
            from app.providers import reranker
            reranker._client = None  # type: ignore[attr-defined]
        except Exception:
            pass


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
    result = await db.execute(select(AppConfig).where(AppConfig.key.in_({"llm_provider", "openai_api_key", "openai_base_url", "llm_model"})))
    rows = {r.key: r.value for r in result.scalars().all()}

    provider = rows.get("llm_provider") or app_settings.llm_provider or "openai"
    api_key = rows.get("openai_api_key") or app_settings.openai_api_key
    base_url = rows.get("openai_base_url") or app_settings.openai_base_url or None
    model = rows.get("llm_model") or app_settings.llm_model

    if not api_key:
        return success(TestLlmResult(ok=False, model=model, message="未设置 API Key"))

    try:
        if provider == "litellm":
            import litellm
            call_kw: dict = dict(
                model=model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
                api_key=api_key,
            )
            if model.startswith("gemini/"):
                call_kw["custom_llm_provider"] = "gemini"
            if base_url:
                call_kw["api_base"] = base_url
            resp = await litellm.acompletion(**call_kw)
            reply = (resp.choices[0].message.content or "").strip()
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=15.0)
            resp = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
            )
            reply = (resp.choices[0].message.content or "").strip()
        return success(TestLlmResult(ok=True, model=model, message=reply or "OK"))
    except Exception as exc:
        return success(TestLlmResult(ok=False, model=model, message=str(exc)[:200]))


@router.post("/config/test-embedding", response_model=ApiResponse[TestEmbeddingResult])
async def test_embedding_connection(_current_user: CurrentUser, db: DbDep):
    """Test the configured Embedding API by creating a short vector."""
    from openai import AsyncOpenAI

    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(
            {"openai_api_key", "openai_base_url", "embedding_model", "embedding_api_key", "embedding_base_url"}
        ))
    )
    rows = {r.key: r.value for r in result.scalars().all()}

    api_key = rows.get("embedding_api_key") or rows.get("openai_api_key") or app_settings.embedding_api_key or app_settings.openai_api_key
    base_url = rows.get("embedding_base_url") or rows.get("openai_base_url") or app_settings.embedding_base_url or app_settings.openai_base_url or None
    model = rows.get("embedding_model") or app_settings.embedding_model

    if not api_key:
        return success(TestEmbeddingResult(ok=False, model=model, dimensions=0, message="未设置 API Key"))

    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=15.0)
    try:
        resp = await client.embeddings.create(model=model, input=["test"])
        dims = len(resp.data[0].embedding)
        return success(TestEmbeddingResult(ok=True, model=model, dimensions=dims, message=f"维度 {dims}"))
    except Exception as exc:
        return success(TestEmbeddingResult(ok=False, model=model, dimensions=0, message=str(exc)[:200]))


@router.post("/config/test-reranker", response_model=ApiResponse[TestRerankerResult])
async def test_reranker_connection(_current_user: CurrentUser, db: DbDep):
    """Test the configured Reranker API with a minimal request."""
    import httpx

    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(
            {"openai_api_key", "openai_base_url", "reranker_api_key", "reranker_base_url", "reranker_model"}
        ))
    )
    rows = {r.key: r.value for r in result.scalars().all()}

    api_key = rows.get("reranker_api_key") or rows.get("openai_api_key") or app_settings.reranker_api_key or app_settings.openai_api_key
    base_url = (rows.get("reranker_base_url") or rows.get("openai_base_url") or app_settings.reranker_base_url or app_settings.openai_base_url or "").rstrip("/")
    model = rows.get("reranker_model") or app_settings.reranker_model

    if not api_key:
        return success(TestRerankerResult(ok=False, model=model, message="未设置 API Key"))
    if not base_url:
        return success(TestRerankerResult(ok=False, model=model, message="未设置 Base URL"))

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{base_url}/rerank",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "query": "test", "documents": ["hello world"], "top_n": 1, "return_documents": False},
            )
            resp.raise_for_status()
            data = resp.json()
        results = data.get("results", [])
        if results:
            score = round(results[0].get("relevance_score", 0), 4)
            return success(TestRerankerResult(ok=True, model=model, message=f"Score {score}"))
        return success(TestRerankerResult(ok=True, model=model, message="OK"))
    except Exception as exc:
        return success(TestRerankerResult(ok=False, model=model, message=str(exc)[:200]))