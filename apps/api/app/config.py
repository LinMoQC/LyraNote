from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://lyranote:lyranote@localhost:5432/lyranote"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # LLM Provider
    # Supported: openai (default, works with any OpenAI-compatible endpoint),
    #            anthropic (native Anthropic SDK),
    #            litellm (universal adapter — Gemini, Mistral, Cohere, etc.)
    #            For litellm, prefix model names with provider: gemini/gemini-2.0-flash
    llm_provider: Literal["openai", "anthropic", "litellm"] = "openai"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    # Embedding-specific overrides (falls back to openai_api_key / openai_base_url when empty)
    embedding_api_key: str = ""
    embedding_base_url: str = ""

    # Auth (local JWT)
    # Set a fixed secret in .env for production; empty = random per-process (dev only)
    jwt_secret: str = ""
    jwt_expire_days: int = 30

    # Storage
    # Supported backends: local | s3 | minio | oss | r2
    #   local  — local filesystem (default, no extra deps)
    #   s3     — AWS S3
    #   minio  — self-hosted MinIO (S3-compatible)
    #   oss    — Aliyun OSS (S3-compatible)
    #   r2     — Cloudflare R2 (S3-compatible)
    storage_backend: Literal["local", "s3", "minio", "oss", "r2"] = "local"
    storage_local_path: str = "./storage"

    # S3-compatible config (used by s3 / minio / oss / r2 backends)
    storage_s3_bucket: str = "lyranote"
    storage_s3_access_key: str = ""
    storage_s3_secret_key: str = ""
    storage_s3_region: str = "us-east-1"
    # Custom endpoint for MinIO / OSS / R2; leave empty for AWS S3
    storage_s3_endpoint_url: str = ""
    # Public-facing URL for presigned links (browser-accessible).
    # For Docker/self-hosted MinIO: set to http://localhost:9000 (or your server's public address).
    # Leave empty to fall back to storage_s3_endpoint_url.
    storage_s3_public_url: str = ""

    # Cross-Encoder Reranker (optional — leave empty to skip reranking)
    # Recommended: SiliconFlow free tier (https://siliconflow.cn)
    reranker_api_key: str = ""
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    reranker_base_url: str = "https://api.siliconflow.cn/v1"
    reranker_timeout: float = 8.0

    # Embedding query cache (Redis TTL in seconds; 0 = disabled)
    embedding_cache_ttl: int = 3600

    # Tavily AI Search
    tavily_api_key: str = ""

    # Perplexity Sonar Search (preferred over Tavily when configured)
    perplexity_api_key: str = ""

    # Jina AI Search & Reader (no key required; set for higher rate limits)
    jina_api_key: str = ""

    # AI Personality (set via setup wizard, persisted in app_config)
    # Empty by default — real value comes from app_config table (setup wizard)
    ai_name: str = ""
    user_occupation: str = ""
    user_preferences: str = ""
    custom_system_prompt: str = ""

    # Memory file storage (file-based, desktop-app friendly)
    # Default: ~/.lyranote/memory/  — override via MEMORY_DIR env var
    memory_dir: str = ""

    # Memory layer mode
    # "server": DB-only injection, file memory is written to disk but not injected
    # "desktop": file changes (MEMORY.md/diary) are synced back to DB after each flush
    memory_mode: str = "server"
    # Confidence threshold: file-source records only overwrite conversation-source
    # records when the existing confidence is BELOW this value
    memory_conflict_confidence_threshold: float = 0.7
    # Fraction of conversations to run the evaluation agent on (0.0 = disabled)
    memory_evaluation_sample_rate: float = 0.1

    # OAuth (Google & GitHub)
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    app_base_url: str = "http://localhost:8000"
    api_prefix: str = "/api/v1"  # used for OAuth redirect_uri (routes are mounted under this)
    frontend_url: str = "http://localhost:3000"

    @property
    def oauth_base_url(self) -> str:
        """Base URL for OAuth redirect_uri (no trailing slash). Must match exactly what you register in Google/GitHub."""
        base = self.app_base_url.rstrip("/")
        prefix = self.api_prefix if self.api_prefix.startswith("/") else "/" + self.api_prefix
        return f"{base}{prefix.rstrip('/')}"

    # App
    debug: bool = True
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
