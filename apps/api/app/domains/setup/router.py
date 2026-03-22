"""
Setup domain: first-run initialization wizard endpoints.
All routes here are PUBLIC (no auth required).
"""

from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.dependencies import DbDep
from app.domains.setup.schemas import (
    SetupInitRequest,
    SetupInitResponse,
    SetupStatusOut,
    SetupTestEmbeddingRequest,
    SetupTestEmbeddingResponse,
    SetupTestLlmRequest,
    SetupTestLlmResponse,
    SetupTestRerankerRequest,
    SetupTestRerankerResponse,
)
from app.exceptions import ForbiddenError
from app.models import AppConfig, User
from app.schemas.response import ApiResponse, not_configured, success

router = APIRouter(tags=["setup"])

_COOKIE_NAME = "lyranote_session"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

# Keys that are synced from app_config → in-memory settings at startup
RUNTIME_CONFIG_KEYS = [
    "llm_provider",
    "openai_api_key",
    "openai_base_url",
    "llm_model",
    "embedding_model",
    "embedding_api_key",
    "embedding_base_url",
    "reranker_api_key",
    "reranker_base_url",
    "reranker_model",
    "tavily_api_key",
    "perplexity_api_key",
    "storage_backend",
    "storage_region",
    "storage_s3_endpoint_url",
    "storage_s3_bucket",
    "storage_s3_access_key",
    "storage_s3_secret_key",
    # Personality
    "ai_name",
    "user_occupation",
    "user_preferences",
    "custom_system_prompt",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_config(db, key: str) -> str | None:
    result = await db.execute(select(AppConfig).where(AppConfig.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def _set_config(db, key: str, value: str) -> None:
    result = await db.execute(select(AppConfig).where(AppConfig.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(AppConfig(key=key, value=value))


async def load_settings_from_db(db) -> None:
    """Called at startup: apply persisted app_config values to in-memory settings."""
    from app.config import settings
    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(RUNTIME_CONFIG_KEYS))
    )
    rows = result.scalars().all()
    for row in rows:
        if row.value:
            try:
                setattr(settings, row.key, row.value)
            except Exception:
                pass


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/setup/status", response_model=ApiResponse[SetupStatusOut])
async def setup_status(db: DbDep):
    value = await _get_config(db, "is_configured")
    if value == "true":
        return success(SetupStatusOut(configured=True))
    return not_configured()


@router.post("/setup/init", response_model=ApiResponse[SetupInitResponse], status_code=status.HTTP_201_CREATED)
async def setup_init(body: SetupInitRequest, response: Response, db: DbDep):
    # Guard: only allowed when not yet configured
    value = await _get_config(db, "is_configured")
    if value == "true":
        raise ForbiddenError("系统已初始化")

    from app.auth import hash_password, create_access_token
    from app.config import settings

    # Create the sole admin user
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        name=body.display_name or body.username,
        avatar_url=body.avatar_url or None,
        email=body.email or None,
    )
    db.add(user)
    await db.flush()

    # Persist all config to app_config
    config_map: dict[str, str] = {
        "llm_provider": body.llm_provider,
        "openai_api_key": body.openai_api_key,
        "openai_base_url": body.openai_base_url,
        "llm_model": body.llm_model,
        "embedding_model": body.embedding_model,
        "embedding_api_key": body.embedding_api_key,
        "embedding_base_url": body.embedding_base_url,
        "reranker_api_key": body.reranker_api_key,
        "reranker_base_url": body.reranker_base_url,
        "reranker_model": body.reranker_model,
        "tavily_api_key": body.tavily_api_key,
        "storage_backend": body.storage_backend,
        "storage_region": body.storage_region,
        "storage_s3_endpoint_url": body.storage_s3_endpoint_url,
        "storage_s3_bucket": body.storage_s3_bucket,
        "storage_s3_access_key": body.storage_s3_access_key,
        "storage_s3_secret_key": body.storage_s3_secret_key,
        # Personality
        "ai_name": body.ai_name,
        "user_occupation": body.user_occupation,
        "user_preferences": body.user_preferences,
        "custom_system_prompt": body.custom_system_prompt,
        "is_configured": "true",
    }
    for key, val in config_map.items():
        await _set_config(db, key, val)

    # Apply to in-memory settings immediately
    for key, val in config_map.items():
        if key != "is_configured" and val:
            try:
                setattr(settings, key, val)
            except Exception:
                pass

    await db.commit()

    token = create_access_token(user.id, expire_days=settings.jwt_expire_days)

    # Trigger async initialization task (create default notebook + welcome note)
    try:
        from app.workers.tasks import initialize_user_preferences
        initialize_user_preferences.delay(
            str(user.id),
            body.ai_name,
            body.user_occupation,
            body.user_preferences,
        )
    except Exception:
        pass  # Non-critical: task broker may not be available immediately

    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )

    return success(SetupInitResponse(access_token=token))


# ── Public LLM connectivity test (no auth, for setup wizard) ──────────────


@router.post("/setup/test-llm", response_model=ApiResponse[SetupTestLlmResponse])
async def setup_test_llm(body: SetupTestLlmRequest):
    """Quick connectivity check — sends a tiny request to verify key + endpoint."""
    if not body.api_key:
        return success(SetupTestLlmResponse(ok=False, message="未提供 API Key"))

    try:
        if body.llm_provider == "litellm":
            import litellm
            call_kw: dict = dict(
                model=body.model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
                api_key=body.api_key,
            )
            if body.model.startswith("gemini/"):
                call_kw["custom_llm_provider"] = "gemini"
            if body.base_url:
                call_kw["api_base"] = body.base_url
            resp = await litellm.acompletion(**call_kw)
            reply = (resp.choices[0].message.content or "").strip()
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                api_key=body.api_key,
                base_url=body.base_url or None,
                timeout=15.0,
            )
            resp = await client.chat.completions.create(
                model=body.model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
            )
            reply = (resp.choices[0].message.content or "").strip()
        return success(SetupTestLlmResponse(ok=True, message=reply or "OK"))
    except Exception as exc:
        return success(SetupTestLlmResponse(ok=False, message=str(exc)[:200]))


@router.post("/setup/test-embedding", response_model=ApiResponse[SetupTestEmbeddingResponse])
async def setup_test_embedding(body: SetupTestEmbeddingRequest):
    """Test Embedding API connectivity with provided (or default) credentials."""
    from openai import AsyncOpenAI

    api_key = body.api_key.strip()
    if not api_key:
        return success(SetupTestEmbeddingResponse(ok=False, dimensions=0, message="未提供 API Key"))

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=body.base_url.strip() or None,
        timeout=15.0,
    )
    try:
        resp = await client.embeddings.create(model=body.model, input=["test"])
        dims = len(resp.data[0].embedding)
        return success(SetupTestEmbeddingResponse(ok=True, dimensions=dims, message=f"维度 {dims}"))
    except Exception as exc:
        return success(SetupTestEmbeddingResponse(ok=False, dimensions=0, message=str(exc)[:200]))


@router.post("/setup/test-reranker", response_model=ApiResponse[SetupTestRerankerResponse])
async def setup_test_reranker(body: SetupTestRerankerRequest):
    """Test Reranker API connectivity with provided credentials."""
    import httpx

    api_key = body.api_key.strip()
    if not api_key:
        return success(SetupTestRerankerResponse(ok=False, message="未提供 API Key"))

    base_url = body.base_url.rstrip("/") if body.base_url else "https://api.siliconflow.cn/v1"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{base_url}/rerank",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": body.model, "query": "test", "documents": ["hello world"], "top_n": 1, "return_documents": False},
            )
            resp.raise_for_status()
            data = resp.json()
        results = data.get("results", [])
        if results:
            score = round(results[0].get("relevance_score", 0), 4)
            return success(SetupTestRerankerResponse(ok=True, message=f"Score {score}"))
        return success(SetupTestRerankerResponse(ok=True, message="OK"))
    except Exception as exc:
        return success(SetupTestRerankerResponse(ok=False, message=str(exc)[:200]))
