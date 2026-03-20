"""
All SQLAlchemy ORM models in one module.
Imported by Alembic and each domain service.
"""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.config import settings


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def now_col() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    username: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    github_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    # Comma-separated list of providers user has unbound; login will not re-attach by email (e.g. "github" or "google,github")
    oauth_unbound: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = now_col()

    notebooks: Mapped[list["Notebook"]] = relationship(back_populates="user")
    memories: Mapped[list["UserMemory"]] = relationship(back_populates="user", passive_deletes=True)
    reflections: Mapped[list["AgentReflection"]] = relationship(back_populates="user", passive_deletes=True)
    evaluations: Mapped[list["AgentEvaluation"]] = relationship(back_populates="user", passive_deletes=True)
    message_feedbacks: Mapped[list["MessageFeedback"]] = relationship(back_populates="user", passive_deletes=True)
    scheduled_tasks: Mapped[list["ScheduledTask"]] = relationship(back_populates="user", passive_deletes=True)


class AppConfig(Base):
    """Runtime key-value configuration written by the setup wizard."""
    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Notebook
# ---------------------------------------------------------------------------

class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="active")  # active | archived
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    system_type: Mapped[str | None] = mapped_column(String(50))  # e.g. "memory_diary"
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cover_emoji: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cover_gradient: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="notebooks")
    sources: Mapped[list["Source"]] = relationship(back_populates="notebook", passive_deletes=True)
    notes: Mapped[list["Note"]] = relationship(back_populates="notebook", passive_deletes=True)
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="notebook", passive_deletes=True)
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="notebook", passive_deletes=True)
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="notebook", passive_deletes=True)
    summary: Mapped["NotebookSummary | None"] = relationship(back_populates="notebook", passive_deletes=True, uselist=False)


# ---------------------------------------------------------------------------
# Source
# ---------------------------------------------------------------------------

class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(500))
    type: Mapped[str] = mapped_column(String(50))   # pdf | web | md | note
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending | processing | indexed | failed
    file_path: Mapped[str | None] = mapped_column(Text)     # legacy: absolute local path (kept for backward compat)
    url: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    # Storage abstraction fields (new uploads use these instead of file_path)
    storage_key: Mapped[str | None] = mapped_column(String(500))      # e.g. "notebooks/<nb_id>/<uuid>.pdf"
    storage_backend: Mapped[str | None] = mapped_column(String(20))   # "local" | "s3" | "minio" | "oss" | "r2"
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notebook: Mapped["Notebook"] = relationship(back_populates="sources")
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="source", passive_deletes=True)


# ---------------------------------------------------------------------------
# Chunk (Vector store)
# ---------------------------------------------------------------------------

class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), nullable=True
    )
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dimensions))
    token_count: Mapped[int | None] = mapped_column(Integer)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = now_col()
    # "source" (default, from imported sources) | "note" (from user notes)
    source_type: Mapped[str] = mapped_column(String(20), default="source", nullable=False)
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), nullable=True
    )

    source: Mapped["Source | None"] = relationship(back_populates="chunks")
    notebook: Mapped["Notebook"] = relationship(back_populates="chunks")


# ---------------------------------------------------------------------------
# Note
# ---------------------------------------------------------------------------

class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(500))
    content_json: Mapped[dict | None] = mapped_column(JSONB)   # Tiptap JSON
    content_text: Mapped[str | None] = mapped_column(Text)     # plain text for embedding
    word_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # MD5 of content_text at last indexing; skip re-index if unchanged
    last_indexed_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)

    notebook: Mapped["Notebook"] = relationship(back_populates="notes")


# ---------------------------------------------------------------------------
# Conversation
# ---------------------------------------------------------------------------

class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = now_col()

    notebook: Mapped["Notebook"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", order_by="Message.created_at", passive_deletes=True)


# ---------------------------------------------------------------------------
# Message
# ---------------------------------------------------------------------------

class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(50))   # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # reasoning trace emitted by thinking models
    reasoning: Mapped[str | None] = mapped_column(Text)
    # [{source_id, chunk_id, excerpt, source_title}]
    citations: Mapped[list | None] = mapped_column(JSONB)
    # [{type, content, tool, input}] — thought / tool_call / tool_result steps
    agent_steps: Mapped[list | None] = mapped_column(JSONB)
    # [{name, type, file_id}] — user message attachments (images, docs)
    attachments: Mapped[list | None] = mapped_column(JSONB)
    # Conversation branching: points to the message this branch forked from
    parent_message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, default=None,
    )
    created_at: Mapped[datetime] = now_col()

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    feedbacks: Mapped[list["MessageFeedback"]] = relationship(back_populates="message", passive_deletes=True)


# ---------------------------------------------------------------------------
# Artifact
# ---------------------------------------------------------------------------

class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(100))  # summary | faq | study_guide | briefing
    title: Mapped[str | None] = mapped_column(String(500))
    content_md: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending | generating | ready | failed
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notebook: Mapped["Notebook"] = relationship(back_populates="artifacts")


# ---------------------------------------------------------------------------
# User Memory (long-term personalization)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Notebook Summary (per-notebook semantic context)
# ---------------------------------------------------------------------------

class NotebookSummary(Base):
    __tablename__ = "notebook_summaries"

    notebook_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), primary_key=True
    )
    summary_md: Mapped[str | None] = mapped_column(Text)
    key_themes: Mapped[list | None] = mapped_column(JSONB)  # ["主题A", "主题B"]
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notebook: Mapped["Notebook"] = relationship(back_populates="summary")


# ---------------------------------------------------------------------------
# Agent Run (task tracking)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Agent Reflection (L5 self-reflection & evolution)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Conversation Summary (rolling compression of long conversations)
# ---------------------------------------------------------------------------

class ConversationSummary(Base):
    """
    Stores a rolling LLM-compressed summary of older messages in a conversation.

    When a conversation exceeds COMPRESS_TRIGGER messages, all messages up to
    the compression boundary are summarized into summary_text and replaced in
    _load_history() with a single synthetic context message.

    This prevents the context window from being overwhelmed by old turns while
    preserving semantic continuity across long sessions.
    """
    __tablename__ = "conversation_summaries"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    # How many messages are covered by this summary
    compressed_message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # The created_at of the last message included in the summary (boundary marker)
    compressed_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ---------------------------------------------------------------------------
# Skills Plugin System
# ---------------------------------------------------------------------------

class SkillInstall(Base):
    """
    Global registry of installed skills.
    Bundled skills are seeded here on first startup; external skills are
    inserted when installed via the skill management API.
    """
    __tablename__ = "skill_installs"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    # knowledge | web | writing | memory | productivity
    category: Mapped[str | None] = mapped_column(String(50))
    version: Mapped[str] = mapped_column(String(20), default="1.0.0", nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # If True, this skill is always loaded regardless of is_enabled
    always: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # JSON list of required env var names, e.g. ["TAVILY_API_KEY"]
    requires_env: Mapped[list | None] = mapped_column(JSONB)
    # JSON Schema for configurable parameters
    config_schema: Mapped[dict | None] = mapped_column(JSONB)
    # Current config values (merged with user-level overrides at runtime)
    config: Mapped[dict | None] = mapped_column(JSONB)
    installed_at: Mapped[datetime] = now_col()


class UserSkillConfig(Base):
    """
    Per-user skill enable/disable and configuration overrides.
    A row here takes priority over skill_installs values for that user.
    """
    __tablename__ = "user_skill_configs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    skill_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    # None means "inherit from global" — only set when user has explicitly changed it
    is_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # User-level config overrides (merged on top of global config at runtime)
    config: Mapped[dict | None] = mapped_column(JSONB)


# ---------------------------------------------------------------------------
# Agent Evaluation (conversation-level quality scoring)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Message Feedback (user rating on assistant replies)
# ---------------------------------------------------------------------------

class MessageFeedback(Base):
    __tablename__ = "message_feedbacks"

    id: Mapped[uuid.UUID] = uuid_pk()
    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # "like" | "dislike"
    rating: Mapped[str] = mapped_column(String(20), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="message_feedbacks")
    message: Mapped["Message"] = relationship(back_populates="feedbacks")


# ---------------------------------------------------------------------------
# Scheduled Task
# ---------------------------------------------------------------------------

class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # news_digest | research_update | knowledge_summary | custom_prompt
    task_type: Mapped[str] = mapped_column(String(50), default="news_digest", nullable=False)

    schedule_cron: Mapped[str] = mapped_column(String(100), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Shanghai")

    parameters: Mapped[dict] = mapped_column(JSONB, default=dict)
    delivery_config: Mapped[dict] = mapped_column(JSONB, default=dict)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    last_result: Mapped[str | None] = mapped_column(Text)
    last_error: Mapped[str | None] = mapped_column(Text)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="scheduled_tasks")
    runs: Mapped[list["ScheduledTaskRun"]] = relationship(
        back_populates="task", passive_deletes=True, order_by="ScheduledTaskRun.started_at.desc()"
    )


class ScheduledTaskRun(Base):
    __tablename__ = "scheduled_task_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scheduled_tasks.id", ondelete="CASCADE"))
    # running | success | failed | skipped
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    result_summary: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    generated_content: Mapped[str | None] = mapped_column(Text)
    sources_count: Mapped[int] = mapped_column(Integer, default=0)
    delivery_status: Mapped[dict | None] = mapped_column(JSONB)

    task: Mapped["ScheduledTask"] = relationship(back_populates="runs")


# ---------------------------------------------------------------------------
# Knowledge Graph
# ---------------------------------------------------------------------------

class KnowledgeEntity(Base):
    __tablename__ = "knowledge_entities"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # concept | person | technology | event | organization | other
    description: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    mention_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notebook: Mapped["Notebook"] = relationship()
    source: Mapped["Source | None"] = relationship()
    outgoing_relations: Mapped[list["KnowledgeRelation"]] = relationship(
        foreign_keys="KnowledgeRelation.source_entity_id", back_populates="source_entity", passive_deletes=True
    )
    incoming_relations: Mapped[list["KnowledgeRelation"]] = relationship(
        foreign_keys="KnowledgeRelation.target_entity_id", back_populates="target_entity", passive_deletes=True
    )


class KnowledgeRelation(Base):
    __tablename__ = "knowledge_relations"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    source_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge_entities.id", ondelete="CASCADE")
    )
    target_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge_entities.id", ondelete="CASCADE")
    )
    relation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = now_col()

    notebook: Mapped["Notebook"] = relationship()
    source_entity: Mapped["KnowledgeEntity"] = relationship(
        foreign_keys=[source_entity_id], back_populates="outgoing_relations"
    )
    target_entity: Mapped["KnowledgeEntity"] = relationship(
        foreign_keys=[target_entity_id], back_populates="incoming_relations"
    )
    source: Mapped["Source | None"] = relationship()


# ---------------------------------------------------------------------------
# Research Task (background deep-research with refresh recovery)
# ---------------------------------------------------------------------------

class ResearchTask(Base):
    __tablename__ = "research_tasks"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notebook_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="quick")
    # running | done | error
    status: Mapped[str] = mapped_column(String(20), default="running")
    report: Mapped[str | None] = mapped_column(Text, nullable=True)
    deliverable_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    timeline_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = now_col()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Proactive Insight (for AI-driven insight push)
# ---------------------------------------------------------------------------

class ProactiveInsight(Base):
    __tablename__ = "proactive_insights"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notebook_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=True
    )
    # source_indexed | task_completed | knowledge_update
    insight_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now_col()
