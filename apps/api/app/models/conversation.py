import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._base import uuid_pk, now_col
from app.models._json import json_type


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(500))
    # "chat" (full-screen chat page) | "copilot" (sidebar copilot panel)
    source: Mapped[str] = mapped_column(String(20), server_default="chat", nullable=False)
    created_at: Mapped[datetime] = now_col()

    notebook: Mapped["Notebook | None"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", order_by="Message.created_at", passive_deletes=True)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    generation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("message_generations.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )
    role: Mapped[str] = mapped_column(String(50))   # user | assistant
    status: Mapped[str] = mapped_column(String(20), server_default="completed", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # reasoning trace emitted by thinking models
    reasoning: Mapped[str | None] = mapped_column(Text)
    # [{source_id, chunk_id, excerpt, source_title}]
    citations: Mapped[list | None] = mapped_column(json_type)
    # [{type, content, tool, input}] — thought / tool_call / tool_result steps
    agent_steps: Mapped[list | None] = mapped_column(json_type)
    # [{name, type, file_id}] — user message attachments (images, docs)
    attachments: Mapped[list | None] = mapped_column(json_type)
    # {ttft_ms, tps, tokens} — streaming speed metrics for assistant messages
    speed: Mapped[dict | None] = mapped_column(json_type)
    # rich media generated during the stream — persisted so they survive page refresh
    # {nodes, edges, ...} — mind-map data from the mind_map skill
    mind_map: Mapped[dict | None] = mapped_column(json_type)
    # {type, data, ...} — diagram data (e.g. Excalidraw elements)
    diagram: Mapped[dict | None] = mapped_column(json_type)
    # {tool, html_content, data, ...} — MCP tool result rich payload
    mcp_result: Mapped[dict | None] = mapped_column(json_type)
    # [{element_type, data}] — generic GenUI elements (source-card, web-card, …)
    ui_elements: Mapped[list | None] = mapped_column(json_type)
    # Conversation branching: points to the message this branch forked from
    parent_message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, default=None,
    )
    created_at: Mapped[datetime] = now_col()

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    feedbacks: Mapped[list["MessageFeedback"]] = relationship(back_populates="message", passive_deletes=True)


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
