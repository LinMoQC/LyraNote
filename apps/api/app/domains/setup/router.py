"""
Setup domain: first-run initialization wizard endpoints.
All routes here are PUBLIC (no auth required).
"""

from __future__ import annotations

from fastapi import APIRouter, Response, status

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
from app.schemas.response import ApiResponse, not_configured, success
from app.services.config_service import (
    ConfigService,
    apply_runtime_settings,
    load_settings_from_db,
    normalize_runtime_config_key,
)

router = APIRouter(tags=["setup"])

__all__ = [
    "apply_runtime_settings",
    "load_settings_from_db",
    "normalize_runtime_config_key",
    "router",
]

_COOKIE_NAME = "lyranote_session"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30


@router.get("/setup/status", response_model=ApiResponse[SetupStatusOut])
async def setup_status(db: DbDep):
    if await ConfigService(db).get_setup_status():
        return success(SetupStatusOut(configured=True))
    return not_configured()


@router.post(
    "/setup/init",
    response_model=ApiResponse[SetupInitResponse],
    status_code=status.HTTP_201_CREATED,
)
async def setup_init(body: SetupInitRequest, response: Response, db: DbDep):
    token = await ConfigService(db).setup_init(body)

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


@router.post("/setup/test-llm", response_model=ApiResponse[SetupTestLlmResponse])
async def setup_test_llm(body: SetupTestLlmRequest):
    """Quick connectivity check — sends a tiny request to verify key + endpoint."""
    result = await ConfigService.test_llm_connection(
        api_key=body.api_key,
        base_url=body.base_url,
        model=body.model,
        llm_provider=body.llm_provider,
    )
    return success(SetupTestLlmResponse(**result))


@router.post("/setup/test-embedding", response_model=ApiResponse[SetupTestEmbeddingResponse])
async def setup_test_embedding(body: SetupTestEmbeddingRequest):
    """Test Embedding API connectivity with provided (or default) credentials."""
    result = await ConfigService.test_embedding_connection(
        api_key=body.api_key,
        base_url=body.base_url,
        model=body.model,
    )
    return success(SetupTestEmbeddingResponse(**result))


@router.post("/setup/test-reranker", response_model=ApiResponse[SetupTestRerankerResponse])
async def setup_test_reranker(body: SetupTestRerankerRequest):
    """Test Reranker API connectivity with provided credentials."""
    result = await ConfigService.test_reranker_connection(
        api_key=body.api_key,
        base_url=body.base_url,
        model=body.model,
    )
    return success(SetupTestRerankerResponse(**result))
