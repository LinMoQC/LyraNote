"""
Config service — runtime config persistence, reload, and connectivity checks.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import ForbiddenError
from app.models import AppConfig, User

logger = logging.getLogger(__name__)

MASKED_VALUE = "••••••••"

EDITABLE_KEYS = {
    "llm_provider",
    "openai_api_key",
    "openai_base_url",
    "llm_model",
    "llm_utility_model",
    "llm_utility_api_key",
    "llm_utility_base_url",
    "embedding_model",
    "embedding_api_key",
    "embedding_base_url",
    "reranker_api_key",
    "reranker_model",
    "reranker_base_url",
    "tavily_api_key",
    "perplexity_api_key",
    "image_gen_api_key",
    "image_gen_base_url",
    "image_gen_model",
    "storage_backend",
    "storage_region",
    "storage_s3_endpoint_url",
    "storage_s3_public_url",
    "storage_s3_bucket",
    "storage_s3_access_key",
    "storage_s3_secret_key",
    "ai_name",
    "user_occupation",
    "user_preferences",
    "notify_email",
    "smtp_host",
    "smtp_port",
    "smtp_username",
    "smtp_password",
    "smtp_from",
    "notebook_appearance_defaults",
}

SENSITIVE_KEYS = {
    "openai_api_key",
    "llm_utility_api_key",
    "embedding_api_key",
    "reranker_api_key",
    "storage_s3_access_key",
    "storage_s3_secret_key",
    "tavily_api_key",
    "perplexity_api_key",
    "image_gen_api_key",
    "smtp_password",
}

LEGACY_RUNTIME_CONFIG_KEY_ALIASES = {
    "storage_region": "storage_s3_region",
}

RUNTIME_CONFIG_KEYS = {
    "llm_provider",
    "openai_api_key",
    "openai_base_url",
    "llm_model",
    "llm_utility_model",
    "llm_utility_api_key",
    "llm_utility_base_url",
    "embedding_model",
    "embedding_api_key",
    "embedding_base_url",
    "reranker_api_key",
    "reranker_base_url",
    "reranker_model",
    "tavily_api_key",
    "perplexity_api_key",
    "image_gen_api_key",
    "image_gen_base_url",
    "image_gen_model",
    "storage_backend",
    "storage_s3_region",
    "storage_s3_endpoint_url",
    "storage_s3_public_url",
    "storage_s3_bucket",
    "storage_s3_access_key",
    "storage_s3_secret_key",
    "ai_name",
    "user_occupation",
    "user_preferences",
}

RUNTIME_CONFIG_QUERY_KEYS = [
    *sorted(RUNTIME_CONFIG_KEYS),
    *sorted(LEGACY_RUNTIME_CONFIG_KEY_ALIASES.keys()),
]

PROVIDER_RUNTIME_KEYS = {
    "llm_provider",
    "openai_api_key",
    "openai_base_url",
    "llm_model",
    "llm_utility_model",
    "llm_utility_api_key",
    "llm_utility_base_url",
}

EMBEDDING_RUNTIME_KEYS = {
    "openai_api_key",
    "openai_base_url",
    "embedding_api_key",
    "embedding_base_url",
    "embedding_model",
}

RERANKER_RUNTIME_KEYS = {
    "reranker_api_key",
    "reranker_base_url",
    "reranker_model",
}

STORAGE_RUNTIME_KEYS = {
    "storage_backend",
    "storage_s3_region",
    "storage_s3_endpoint_url",
    "storage_s3_public_url",
    "storage_s3_bucket",
    "storage_s3_access_key",
    "storage_s3_secret_key",
}


def normalize_runtime_config_key(key: str) -> str:
    return LEGACY_RUNTIME_CONFIG_KEY_ALIASES.get(key, key)


def apply_runtime_settings(config_map: Mapping[str, str | None]) -> set[str]:
    """Apply persisted runtime config to in-memory settings and reset stale clients."""
    touched_keys: set[str] = set()
    for key, value in config_map.items():
        normalized_key = normalize_runtime_config_key(key)
        if normalized_key not in RUNTIME_CONFIG_KEYS or value is None:
            continue
        try:
            setattr(settings, normalized_key, value)
            touched_keys.add(normalized_key)
        except Exception as exc:
            logger.warning(
                "Config key %r from DB could not be applied: %s",
                normalized_key,
                exc,
            )

    if touched_keys & PROVIDER_RUNTIME_KEYS:
        try:
            from app.providers.provider_factory import reset_provider

            reset_provider()
        except Exception:
            logger.exception("Failed to reset LLM provider after runtime config sync")

    if touched_keys & EMBEDDING_RUNTIME_KEYS:
        try:
            from app.providers import embedding

            embedding._client = None  # type: ignore[attr-defined]
        except Exception:
            logger.exception("Failed to reset embedding client after runtime config sync")

    if touched_keys & RERANKER_RUNTIME_KEYS:
        try:
            from app.providers import reranker

            reranker._client = None  # type: ignore[attr-defined]
        except Exception:
            logger.exception("Failed to reset reranker client after runtime config sync")

    if touched_keys & STORAGE_RUNTIME_KEYS:
        try:
            from app.providers.storage import reset_storage_instance

            reset_storage_instance()
        except Exception:
            logger.exception("Failed to reset storage provider after runtime config sync")

    return touched_keys


async def load_settings_from_db(db: AsyncSession) -> None:
    """Apply persisted app_config values to in-memory settings."""
    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(RUNTIME_CONFIG_QUERY_KEYS))
    )
    rows = result.scalars().all()
    config_map: dict[str, str | None] = {}
    for row in rows:
        normalized_key = normalize_runtime_config_key(row.key)
        is_legacy_key = normalized_key != row.key
        if is_legacy_key and normalized_key in config_map:
            continue
        config_map[normalized_key] = row.value
    apply_runtime_settings(config_map)


async def _run_chat_connection_test(
    *,
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str,
    prompt: str = "Hi",
    allow_model_provider_hint: bool = False,
) -> str:
    use_litellm = provider == "litellm" or (allow_model_provider_hint and "/" in model)
    if use_litellm:
        import litellm

        call_kw: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 100,
            "api_key": api_key,
            "drop_params": True,
        }
        if model.startswith("gemini/"):
            call_kw["custom_llm_provider"] = "gemini"
        if base_url:
            call_kw["api_base"] = base_url
        resp = await litellm.acompletion(**call_kw)
        return (resp.choices[0].message.content or "").strip()

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=15.0)
    resp = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=100,
    )
    return (resp.choices[0].message.content or "").strip()


async def _run_embedding_connection_test(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
) -> int:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=15.0)
    resp = await client.embeddings.create(model=model, input=["test"])
    return len(resp.data[0].embedding)


async def _run_reranker_connection_test(
    *,
    api_key: str,
    base_url: str,
    model: str,
) -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{base_url.rstrip('/')}/rerank",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "query": "test",
                "documents": ["hello world"],
                "top_n": 1,
                "return_documents": False,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    results = data.get("results", [])
    if results:
        score = round(results[0].get("relevance_score", 0), 4)
        return f"Score {score}"
    return "OK"


class ConfigService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_config_value(self, key: str) -> str | None:
        result = await self.db.execute(select(AppConfig).where(AppConfig.key == key))
        row = result.scalar_one_or_none()
        return row.value if row else None

    async def set_config_value(self, key: str, value: str) -> None:
        result = await self.db.execute(select(AppConfig).where(AppConfig.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            self.db.add(AppConfig(key=key, value=value))

    async def get_runtime_config(self) -> dict[str, str | None]:
        queryable_keys = (EDITABLE_KEYS - {"storage_region"}) | {"storage_s3_region"}
        result = await self.db.execute(
            select(AppConfig).where(AppConfig.key.in_(queryable_keys))
        )
        rows = result.scalars().all()
        stored_values: dict[str, str | None] = {}
        for row in rows:
            if row.key in SENSITIVE_KEYS and row.value:
                stored_values[row.key] = MASKED_VALUE
            else:
                stored_values[row.key] = row.value

        config: dict[str, str | None] = {key: None for key in EDITABLE_KEYS}
        for key in EDITABLE_KEYS:
            normalized_key = normalize_runtime_config_key(key)
            config[key] = stored_values.get(normalized_key)
            if config[key] is None and normalized_key != key:
                config[key] = stored_values.get(key)
        return config

    async def update_runtime_config(self, patch: Mapping[str, Any]) -> None:
        query_keys = {
            candidate
            for key in patch
            for candidate in {key, normalize_runtime_config_key(key)}
        }
        result = await self.db.execute(
            select(AppConfig).where(AppConfig.key.in_(query_keys))
        )
        existing_rows = {row.key: row for row in result.scalars().all()}

        runtime_updates: dict[str, str] = {}
        for key, value in patch.items():
            str_value = str(value) if value is not None else ""
            if str_value == MASKED_VALUE:
                continue

            normalized_key = normalize_runtime_config_key(key)
            row = existing_rows.get(normalized_key)
            if row:
                row.value = str_value
            else:
                row = AppConfig(key=normalized_key, value=str_value)
                self.db.add(row)
                existing_rows[normalized_key] = row

            if normalized_key != key:
                legacy_row = existing_rows.get(key)
                if legacy_row is not None:
                    await self.db.delete(legacy_row)
                    existing_rows.pop(key, None)

            runtime_updates[normalized_key] = str_value

        await self.db.commit()
        apply_runtime_settings(runtime_updates)

    async def get_setup_status(self) -> bool:
        value = await self.get_config_value("is_configured")
        return value == "true"

    async def setup_init(self, body: Any) -> str:
        if await self.get_setup_status():
            raise ForbiddenError("系统已初始化")

        from app.auth import create_access_token, hash_password

        user = User(
            username=body.username,
            password_hash=hash_password(body.password),
            name=body.display_name or body.username,
            avatar_url=body.avatar_url or None,
            email=body.email or None,
        )
        self.db.add(user)
        await self.db.flush()

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
            "storage_s3_region": body.storage_region,
            "storage_s3_endpoint_url": body.storage_s3_endpoint_url,
            "storage_s3_bucket": body.storage_s3_bucket,
            "storage_s3_access_key": body.storage_s3_access_key,
            "storage_s3_secret_key": body.storage_s3_secret_key,
            "ai_name": body.ai_name,
            "user_occupation": body.user_occupation,
            "user_preferences": body.user_preferences,
            "is_configured": "true",
        }
        for key, value in config_map.items():
            await self.set_config_value(key, value)

        from app.services.memory_service import MemoryService

        await MemoryService(self.db, user.id).bootstrap_setup_memories(
            user_occupation=body.user_occupation,
            user_preferences=body.user_preferences,
        )

        await self.db.commit()
        apply_runtime_settings(
            {key: value for key, value in config_map.items() if key != "is_configured"}
        )

        token = create_access_token(user.id, expire_days=settings.jwt_expire_days)

        try:
            from app.workers.tasks import initialize_user_preferences

            initialize_user_preferences.delay(
                str(user.id),
                body.ai_name,
                body.user_occupation,
                body.user_preferences,
            )
        except Exception as exc:
            logger.debug("Setup init background task skipped: %s", exc)

        return token

    async def test_email(self) -> dict[str, Any]:
        from app.providers.email import send_email

        result = await self.db.execute(
            select(AppConfig).where(
                AppConfig.key.in_(
                    {
                        "notify_email",
                        "smtp_host",
                        "smtp_port",
                        "smtp_username",
                        "smtp_password",
                        "smtp_from",
                    }
                )
            )
        )
        cfg = {row.key: row.value for row in result.scalars().all()}

        to = cfg.get("notify_email", "")
        if not to:
            return {"ok": False, "message": "未设置通知邮箱地址"}

        if not cfg.get("smtp_host") or not cfg.get("smtp_username"):
            return {"ok": False, "message": "SMTP 未配置完整"}

        html = """<div style="font-family:-apple-system,sans-serif;padding:24px;max-width:480px;margin:0 auto;">
      <h2 style="color:#6366f1;">LyraNote 测试邮件</h2>
      <p style="color:#374151;line-height:1.6;">如果你收到了这封邮件，说明 SMTP 配置正确，邮件功能已可正常使用。</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">— LyraNote</p>
    </div>"""

        result = await send_email(
            to=to,
            subject="LyraNote 测试邮件",
            html_body=html,
            text_body="如果你收到了这封邮件，说明 SMTP 配置正确。",
            smtp_config=cfg,
        )

        if result.ok:
            return {"ok": True, "message": f"测试邮件已发送至 {to}"}
        if result.error:
            return {"ok": False, "message": f"发送失败：{result.error}"}
        return {"ok": False, "message": "发送失败，请检查 SMTP 配置"}

    async def test_saved_llm_connection(self) -> dict[str, Any]:
        rows = await self._get_config_rows(
            {"llm_provider", "openai_api_key", "openai_base_url", "llm_model"}
        )
        provider = rows.get("llm_provider") or settings.llm_provider or "openai"
        api_key = rows.get("openai_api_key") or settings.openai_api_key
        base_url = rows.get("openai_base_url") or settings.openai_base_url or None
        model = rows.get("llm_model") or settings.llm_model

        if not api_key:
            return {"ok": False, "model": model, "message": "未设置 API Key"}

        try:
            reply = await _run_chat_connection_test(
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            return {"ok": True, "model": model, "message": reply or "OK"}
        except Exception as exc:
            return {"ok": False, "model": model, "message": str(exc)[:200]}

    async def test_saved_utility_llm_connection(self) -> dict[str, Any]:
        rows = await self._get_config_rows(
            {
                "llm_provider",
                "openai_api_key",
                "openai_base_url",
                "llm_utility_model",
                "llm_utility_api_key",
                "llm_utility_base_url",
            }
        )
        utility_model = rows.get("llm_utility_model") or settings.llm_utility_model
        if not utility_model:
            return {"ok": False, "model": "", "message": "未配置小模型"}

        api_key = (
            rows.get("llm_utility_api_key")
            or settings.llm_utility_api_key
            or rows.get("openai_api_key")
            or settings.openai_api_key
        )
        base_url = (
            rows.get("llm_utility_base_url")
            or settings.llm_utility_base_url
            or rows.get("openai_base_url")
            or settings.openai_base_url
            or None
        )
        provider = rows.get("llm_provider") or settings.llm_provider or "openai"

        if not api_key:
            return {"ok": False, "model": utility_model, "message": "未设置 API Key"}

        try:
            reply = await _run_chat_connection_test(
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                model=utility_model,
                allow_model_provider_hint=True,
            )
            return {"ok": True, "model": utility_model, "message": reply or "OK"}
        except Exception as exc:
            return {"ok": False, "model": utility_model, "message": str(exc)[:200]}

    async def test_saved_embedding_connection(self) -> dict[str, Any]:
        rows = await self._get_config_rows(
            {
                "openai_api_key",
                "openai_base_url",
                "embedding_model",
                "embedding_api_key",
                "embedding_base_url",
            }
        )
        api_key = (
            rows.get("embedding_api_key")
            or rows.get("openai_api_key")
            or settings.embedding_api_key
            or settings.openai_api_key
        )
        base_url = (
            rows.get("embedding_base_url")
            or rows.get("openai_base_url")
            or settings.embedding_base_url
            or settings.openai_base_url
            or None
        )
        model = rows.get("embedding_model") or settings.embedding_model

        if not api_key:
            return {
                "ok": False,
                "model": model,
                "dimensions": 0,
                "message": "未设置 API Key",
            }

        try:
            dimensions = await _run_embedding_connection_test(
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            return {
                "ok": True,
                "model": model,
                "dimensions": dimensions,
                "message": f"维度 {dimensions}",
            }
        except Exception as exc:
            return {
                "ok": False,
                "model": model,
                "dimensions": 0,
                "message": str(exc)[:200],
            }

    async def test_saved_reranker_connection(self) -> dict[str, Any]:
        rows = await self._get_config_rows(
            {
                "openai_api_key",
                "openai_base_url",
                "reranker_api_key",
                "reranker_base_url",
                "reranker_model",
            }
        )
        api_key = (
            rows.get("reranker_api_key")
            or rows.get("openai_api_key")
            or settings.reranker_api_key
            or settings.openai_api_key
        )
        base_url = (
            rows.get("reranker_base_url")
            or rows.get("openai_base_url")
            or settings.reranker_base_url
            or settings.openai_base_url
            or ""
        ).rstrip("/")
        model = rows.get("reranker_model") or settings.reranker_model

        if not api_key:
            return {"ok": False, "model": model, "message": "未设置 API Key"}
        if not base_url:
            return {"ok": False, "model": model, "message": "未设置 Base URL"}

        try:
            message = await _run_reranker_connection_test(
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            return {"ok": True, "model": model, "message": message}
        except Exception as exc:
            return {"ok": False, "model": model, "message": str(exc)[:200]}

    async def _get_config_rows(self, keys: set[str]) -> dict[str, str | None]:
        result = await self.db.execute(select(AppConfig).where(AppConfig.key.in_(keys)))
        return {row.key: row.value for row in result.scalars().all()}

    @staticmethod
    async def test_llm_connection(
        *,
        api_key: str,
        base_url: str,
        model: str,
        llm_provider: str,
    ) -> dict[str, Any]:
        if not api_key:
            return {"ok": False, "message": "未提供 API Key"}
        try:
            reply = await _run_chat_connection_test(
                provider=llm_provider,
                api_key=api_key,
                base_url=base_url or None,
                model=model,
            )
            return {"ok": True, "message": reply or "OK"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)[:200]}

    @staticmethod
    async def test_embedding_connection(
        *,
        api_key: str,
        base_url: str,
        model: str,
    ) -> dict[str, Any]:
        api_key = api_key.strip()
        if not api_key:
            return {"ok": False, "dimensions": 0, "message": "未提供 API Key"}
        try:
            dimensions = await _run_embedding_connection_test(
                api_key=api_key,
                base_url=base_url.strip() or None,
                model=model,
            )
            return {
                "ok": True,
                "dimensions": dimensions,
                "message": f"维度 {dimensions}",
            }
        except Exception as exc:
            return {"ok": False, "dimensions": 0, "message": str(exc)[:200]}

    @staticmethod
    async def test_reranker_connection(
        *,
        api_key: str,
        base_url: str,
        model: str,
    ) -> dict[str, Any]:
        api_key = api_key.strip()
        if not api_key:
            return {"ok": False, "message": "未提供 API Key"}

        reranker_base_url = base_url.rstrip("/") if base_url else "https://api.siliconflow.cn/v1"
        try:
            message = await _run_reranker_connection_test(
                api_key=api_key,
                base_url=reranker_base_url,
                model=model,
            )
            return {"ok": True, "message": message}
        except Exception as exc:
            return {"ok": False, "message": str(exc)[:200]}
