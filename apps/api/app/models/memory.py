import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.config import settings
from app.models._base import uuid_pk, now_col


class UserMemory(Base):
    __tablename__ = "user_memories"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    # preference（偏好）| fact（事实）| skill（技能画像）
    memory_type: Mapped[str] = mapped_column(String(20), default="preference", nullable=False)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # UUID string of the AgentReflection that last reinforced this memory
    reinforced_by: Mapped[str | None] = mapped_column(String(36))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Pre-computed embedding vector for ANN retrieval (avoids per-query embed_texts)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dimensions))
    # Source of this memory record: "conversation" | "file" | "manual"
    source: Mapped[str] = mapped_column(String(20), default="conversation", nullable=False)
    # Audit trail: comma-separated message IDs or file path that produced this memory
    evidence: Mapped[str | None] = mapped_column(Text)
    # True when a file-source record conflicts with a high-confidence conversation record
    conflict_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship(back_populates="memories")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    type: Mapped[str] = mapped_column(String(100))   # ingest | compose | write
    status: Mapped[str] = mapped_column(String(50), default="queued")  # queued | running | success | failed
    input_data: Mapped[dict | None] = mapped_column(JSONB)
    output_data: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_col()


class AgentReflection(Base):
    __tablename__ = "agent_reflections"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    # research | writing | learning | review
    scene: Mapped[str | None] = mapped_column(String(20))
    # 0.0-1.0: LLM self-evaluation of answer quality
    quality_score: Mapped[float | None] = mapped_column(Float)
    what_worked: Mapped[str | None] = mapped_column(Text)
    what_failed: Mapped[str | None] = mapped_column(Text)
    # list of memory keys that were reinforced (up-rating)
    memory_reinforced: Mapped[list | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = now_col()

    user: Mapped["User"] = relationship(back_populates="reflections")


class AgentEvaluation(Base):
    """
    Lightweight async quality evaluation of completed conversations.
    Sampled at a configurable rate (memory_evaluation_sample_rate) and written
    after SSE completes. Does NOT affect real-time responses (v1 monitoring only).

    Distinct from AgentReflection:
      - AgentReflection: evaluates Agent execution quality (system perspective)
      - AgentEvaluation: evaluates conversation outcome quality (user perspective)
    """
    __tablename__ = "agent_evaluations"

    id: Mapped[uuid.UUID] = uuid_pk()
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Composite score (0.0–1.0)
    overall_score: Mapped[float | None] = mapped_column(Float)
    # How well the AI addressed the user's actual intent
    relevance_score: Mapped[float | None] = mapped_column(Float)
    # Whether the AI cited concrete evidence or knowledge sources
    evidence_score: Mapped[float | None] = mapped_column(Float)
    # Whether the AI provided specific, actionable conclusions or suggestions
    actionability_score: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now_col()

    user: Mapped["User"] = relationship(back_populates="evaluations")


class AgentThought(Base):
    """
    记录 Lyra Soul 思维循环产生的每一条思想。

    surface=True  → 已推送给用户（Redis Pub/Sub → SSE）
    surface=False → 内化保存，仅用于上下文积累
    """
    __tablename__ = "agent_thoughts"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # internal | surfaced | dismissed
    visibility: Mapped[str] = mapped_column(String(20), default="internal", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 触发本次思考的用户活动上下文（JSON 快照）
    activity_context: Mapped[dict | None] = mapped_column(JSONB)
    # 本次思考关联的笔记本（可选）
    notebook_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = now_col()

    user: Mapped["User"] = relationship(back_populates="agent_thoughts")


class UserPortrait(Base):
    """
    基于长期交互数据合成的用户立体画像（六维结构）。
    每个用户只有一条记录，由 Celery Beat 每周合成更新。
    """
    __tablename__ = "user_portraits"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # 六维画像 JSON，结构见 docs/lyra-soul-system.md
    portrait_json: Mapped[dict | None] = mapped_column(JSONB)
    # 合成摘要（供 Lyra 直接引用的自然语言描述）
    synthesis_summary: Mapped[str | None] = mapped_column(Text)
    # 画像版本号（每次合成 +1）
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    synthesized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="portrait")
