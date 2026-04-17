from __future__ import annotations

import logging
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.exceptions import AppError
from app.services.monitoring_service import heartbeat_loop
from app.trace import bind_trace_context, generate_trace_id

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.logging_config import setup_logging
    setup_logging(debug=settings.debug)

    if not settings.jwt_secret:
        logger.warning(
            "jwt_secret is empty — a random secret will be used and all tokens "
            "will be invalidated on every process restart. Set JWT_SECRET in .env for production."
        )

    from app.database import engine, AsyncSessionLocal
    from sqlalchemy import text

    if settings.database_url.startswith("postgresql"):
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    # Load persisted config from app_config table into in-memory settings
    from app.domains.setup.router import load_settings_from_db
    async with AsyncSessionLocal() as db:
        await load_settings_from_db(db)

    # Bootstrap built-in skills (and optionally load workspace/user skills)
    from app.skills.registry import bootstrap_builtin_skills, skill_registry
    bootstrap_builtin_skills()

    # Sync in-memory skill registry → skill_installs table (upsert metadata, preserve is_enabled/config)
    try:
        from sqlalchemy import select as _select
        from app.models import SkillInstall
        import uuid as _uuid
        async with AsyncSessionLocal() as _db:
            for _skill in skill_registry.all_skills():
                _m = _skill.meta
                _existing = (
                    await _db.execute(
                        _select(SkillInstall).where(SkillInstall.name == _m.name)
                    )
                ).scalar_one_or_none()
                if _existing is None:
                    _db.add(SkillInstall(
                        id=_uuid.uuid4(),
                        name=_m.name,
                        display_name=_m.display_name,
                        description=_m.description,
                        category=_m.category,
                        version=_m.version,
                        is_builtin=True,
                        is_enabled=True,
                        always=_m.always,
                        requires_env=_m.requires_env or None,
                        config_schema=_m.config_schema,
                    ))
                else:
                    # Update metadata only; preserve is_enabled / config set by admin/user
                    _existing.display_name = _m.display_name
                    _existing.description = _m.description
                    _existing.category = _m.category
                    _existing.version = _m.version
                    _existing.always = _m.always
                    _existing.requires_env = _m.requires_env or None
                    _existing.config_schema = _m.config_schema
            await _db.commit()
            logger.info("skill_installs synced: %d skills", len(skill_registry.all_skills()))
    except Exception:
        logger.exception("startup: failed to sync skill_installs (non-fatal)")

    # On startup, immediately expire any sources left stuck in 'processing' / 'pending'
    # from a previous process crash or restart (belt-and-suspenders alongside the beat task).
    try:
        from app.workers.tasks.ingestion import _expire_stuck_sources_impl

        async with AsyncSessionLocal() as _db:
            _expired = await _expire_stuck_sources_impl(_db)
            if _expired:
                logger.warning("startup: expired %d stuck source(s)", _expired)
    except Exception:
        logger.exception("startup: failed to expire stuck sources (non-fatal)")

    # Initialize file-based memory storage (create dirs + default MEMORY.md)
    from app.agents.memory.file_storage import init_memory_storage
    init_memory_storage()

    # Start Lyra Soul — persistent background thinking loop
    from app.agents.soul.soul import soul
    await soul.start()

    heartbeat_task = None
    heartbeat_stop = None
    if settings.monitoring_enabled:
        import asyncio

        heartbeat_stop = asyncio.Event()
        heartbeat_task = asyncio.create_task(heartbeat_loop("api", heartbeat_stop))
        app.state.api_heartbeat_stop = heartbeat_stop
        app.state.api_heartbeat_task = heartbeat_task

    if settings.is_desktop_runtime and settings.desktop_stdout_events:
        print(
            json.dumps(
                {
                    "type": "runtime.ready",
                    "payload": {
                        "profile": settings.runtime_profile,
                        "database_url": settings.database_url,
                        "memory_mode": settings.memory_mode,
                        "version": app.version,
                    },
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    yield

    if heartbeat_stop is not None:
        heartbeat_stop.set()
    if heartbeat_task is not None:
        await heartbeat_task

    # Shutdown Lyra Soul
    await soul.stop()


app = FastAPI(
    title="LyraNote API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id") or generate_trace_id()
    request.state.trace_id = trace_id
    response = None
    raised_error: Exception | None = None

    try:
        with bind_trace_context(trace_id):
            response = await call_next(request)
    except Exception as exc:
        raised_error = exc
        raise
    finally:
        if response is not None:
            response.headers["X-Trace-Id"] = trace_id

    return response


# ---------------------------------------------------------------------------
# Global exception handlers — all errors are serialised as ApiResponse envelope
# ---------------------------------------------------------------------------

@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message, "data": None},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": message, "data": None},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    if errors:
        first = errors[0]
        loc = " → ".join(str(p) for p in first.get("loc", []) if p != "body")
        message = f"参数校验失败：{loc} — {first.get('msg', '')}" if loc else first.get("msg", "参数校验失败")
    else:
        message = "参数校验失败"
    return JSONResponse(
        status_code=422,
        content={"code": 422, "message": message, "data": None},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": "服务器内部错误，请稍后重试", "data": None},
    )

# Register domain routers
from app.domains.auth.router import router as auth_router
from app.domains.setup.router import router as setup_router
from app.domains.config.router import router as config_router
from app.domains.notebook.router import router as notebook_router
from app.domains.source.router import router as source_router
from app.domains.note.router import router as note_router
from app.domains.conversation.router import router as conversation_router
from app.domains.artifact.router import router as artifact_router
from app.domains.knowledge.router import router as knowledge_router
from app.domains.ai.router import router as ai_router
from app.domains.memory.router import router as memory_router
from app.domains.skill.router import router as skill_router
from app.domains.feedback.router import router as feedback_router
from app.domains.upload.router import router as upload_router
from app.domains.task.router import router as task_router
from app.domains.public.router import router as public_router
from app.domains.knowledge_graph.router import router as knowledge_graph_router
from app.domains.mcp.router import router as mcp_router
from app.domains.activity.router import router as activity_router
from app.domains.events.router import router as events_router
from app.domains.monitoring.router import router as monitoring_router
from app.domains.portrait.router import router as portrait_router
from app.domains.public_home.router import router as public_home_router
from app.domains.desktop.router import router as desktop_router

app.include_router(auth_router, prefix="/api/v1")
app.include_router(setup_router, prefix="/api/v1")
app.include_router(config_router, prefix="/api/v1")
app.include_router(notebook_router, prefix="/api/v1")
app.include_router(source_router, prefix="/api/v1")
app.include_router(note_router, prefix="/api/v1")
app.include_router(conversation_router, prefix="/api/v1")
app.include_router(artifact_router, prefix="/api/v1")
app.include_router(knowledge_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(memory_router, prefix="/api/v1")
app.include_router(skill_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(upload_router, prefix="/api/v1")
app.include_router(task_router, prefix="/api/v1")
app.include_router(public_router, prefix="/api/v1")
app.include_router(knowledge_graph_router, prefix="/api/v1")
app.include_router(mcp_router, prefix="/api/v1")
app.include_router(activity_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(monitoring_router, prefix="/api/v1")
app.include_router(portrait_router, prefix="/api/v1")
app.include_router(public_home_router, prefix="/api/v1")
app.include_router(desktop_router, prefix="/api/v1")


@app.get("/health")
async def health():
    from app.schemas.response import success
    from fastapi.responses import JSONResponse

    checks: dict[str, str] = {}

    # DB ping
    try:
        from app.database import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        logger.warning("Health check DB failed: %s", e)
        checks["db"] = "error"

    # Redis ping
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception as e:
        logger.warning("Health check Redis failed: %s", e)
        checks["redis"] = "error"

    all_ok = all(v == "ok" for v in checks.values())
    payload = {"status": "ok" if all_ok else "degraded", "version": "0.1.0", **checks}

    if not all_ok:
        return JSONResponse(status_code=503, content={"code": 503, "message": "service degraded", "data": payload})
    return success(payload)
