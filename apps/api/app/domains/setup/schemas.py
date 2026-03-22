"""
Setup domain Pydantic schemas.
"""

from typing import Literal

from pydantic import BaseModel, field_validator


class SetupStatusOut(BaseModel):
    configured: bool


class SetupInitRequest(BaseModel):
    # ── Account ──────────────────────────────────────────────────────────────
    username: str
    password: str
    display_name: str = ""
    email: str = ""
    avatar_url: str = ""

    # ── AI ───────────────────────────────────────────────────────────────────
    llm_provider: Literal["openai", "anthropic", "litellm"] = "openai"
    openai_api_key: str
    openai_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    # Embedding overrides (falls back to openai_api_key / openai_base_url when empty)
    embedding_model: str = "text-embedding-3-small"
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    # Reranker (optional, falls back to openai_api_key / openai_base_url when empty)
    reranker_api_key: str = ""
    reranker_base_url: str = ""
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    tavily_api_key: str = ""

    # ── Storage ───────────────────────────────────────────────────────────────
    storage_backend: Literal["local", "minio", "s3", "oss", "cos"] = "local"
    storage_region: str = ""            # AWS S3 / Tencent COS
    storage_s3_endpoint_url: str = ""   # MinIO / Aliyun OSS custom endpoint
    storage_s3_bucket: str = "lyranote"
    storage_s3_access_key: str = ""
    storage_s3_secret_key: str = ""

    # ── Personality ──────────────────────────────────────────────────────────
    ai_name: str = "Lyra"
    user_occupation: str = ""
    user_preferences: str = ""
    custom_system_prompt: str = ""

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("用户名不能为空")
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("密码至少 6 位")
        return v

    @field_validator("storage_backend", mode="before")
    @classmethod
    def storage_backend_valid(cls, v: str) -> str:
        if v not in ("local", "minio", "s3", "oss", "cos"):
            return "local"
        return v


class SetupInitResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SetupTestLlmRequest(BaseModel):
    api_key: str
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    llm_provider: Literal["openai", "anthropic", "litellm"] = "openai"


class SetupTestLlmResponse(BaseModel):
    ok: bool
    message: str


class SetupTestEmbeddingRequest(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model: str = "text-embedding-3-small"


class SetupTestEmbeddingResponse(BaseModel):
    ok: bool
    dimensions: int = 0
    message: str


class SetupTestRerankerRequest(BaseModel):
    api_key: str = ""
    base_url: str = "https://api.siliconflow.cn/v1"
    model: str = "BAAI/bge-reranker-v2-m3"


class SetupTestRerankerResponse(BaseModel):
    ok: bool
    message: str
