from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.exceptions import AppError

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.logging_config import setup_logging
    setup_logging(debug=settings.debug)

    from app.database import engine, AsyncSessionLocal
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    # Load persisted config from app_config table into in-memory settings
    from app.domains.setup.router import load_settings_from_db
    async with AsyncSessionLocal() as db:
        await load_settings_from_db(db)

    # Bootstrap built-in skills (and optionally load workspace/user skills)
    from app.skills.registry import bootstrap_builtin_skills
    bootstrap_builtin_skills()

    # Initialize file-based memory storage (create dirs + default MEMORY.md)
    from app.agents.memory.file_storage import init_memory_storage
    init_memory_storage()

    # Start Lyra Soul — persistent background thinking loop
    from app.agents.soul.soul import soul
    await soul.start()

    yield

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
from app.domains.portrait.router import router as portrait_router

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
app.include_router(portrait_router, prefix="/api/v1")


@app.get("/health")
async def health():
    from app.schemas.response import success
    return success({"status": "ok", "version": "0.1.0"})
