"""
Config domain: read and update runtime AppConfig (requires auth).
Allows the settings UI to read/write AI, storage, and personality config
without going through the setup wizard.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.dependencies import CurrentUser, DbDep
from app.exceptions import BadRequestError
from app.schemas.response import ApiResponse, success
from app.services.config_service import ConfigService, EDITABLE_KEYS

from .schemas import (
    ConfigOut,
    ConfigPatchRequest,
    TestEmailResult,
    TestEmbeddingResult,
    TestLlmResult,
    TestRerankerResult,
)

router = APIRouter(tags=["config"])


@router.get("/config", response_model=ApiResponse[ConfigOut])
async def get_config(_current_user: CurrentUser, db: DbDep):
    """Return all editable runtime config values. Sensitive keys are masked."""
    config = await ConfigService(db).get_runtime_config()
    return success(ConfigOut(data=config))


@router.patch("/config", status_code=status.HTTP_204_NO_CONTENT)
async def update_config(body: ConfigPatchRequest, _current_user: CurrentUser, db: DbDep):
    """Batch-update runtime config. Only keys in EDITABLE_KEYS are accepted."""
    unknown = set(body.data.keys()) - EDITABLE_KEYS
    if unknown:
        raise BadRequestError(f"未知的配置键：{', '.join(sorted(unknown))}")

    await ConfigService(db).update_runtime_config(body.data)


@router.post("/config/test-email", response_model=ApiResponse[TestEmailResult])
async def test_email(_current_user: CurrentUser, db: DbDep):
    """Send a real test email using the current SMTP configuration."""
    result = await ConfigService(db).test_email()
    return success(TestEmailResult(**result))


@router.post("/config/test-llm", response_model=ApiResponse[TestLlmResult])
async def test_llm_connection(_current_user: CurrentUser, db: DbDep):
    """Send a minimal request to the configured LLM to verify connectivity."""
    result = await ConfigService(db).test_saved_llm_connection()
    return success(TestLlmResult(**result))


@router.post("/config/test-utility-llm", response_model=ApiResponse[TestLlmResult])
async def test_utility_llm_connection(_current_user: CurrentUser, db: DbDep):
    """Test the utility (small) model using its own config, falling back to main model config."""
    result = await ConfigService(db).test_saved_utility_llm_connection()
    return success(TestLlmResult(**result))


@router.post("/config/test-embedding", response_model=ApiResponse[TestEmbeddingResult])
async def test_embedding_connection(_current_user: CurrentUser, db: DbDep):
    """Test the configured Embedding API by creating a short vector."""
    result = await ConfigService(db).test_saved_embedding_connection()
    return success(TestEmbeddingResult(**result))


@router.post("/config/test-reranker", response_model=ApiResponse[TestRerankerResult])
async def test_reranker_connection(_current_user: CurrentUser, db: DbDep):
    """Test the configured Reranker API with a minimal request."""
    result = await ConfigService(db).test_saved_reranker_connection()
    return success(TestRerankerResult(**result))
