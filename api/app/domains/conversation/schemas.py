from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationOut(BaseModel):
    id: UUID
    notebook_id: UUID
    title: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AttachmentMeta(BaseModel):
    name: str
    type: str
    file_id: str


class MessageCreate(BaseModel):
    content: str
    global_search: bool = False  # True when sent from the global chat (searches all notebooks)
    tool_hint: str | None = None  # summarize | insights | outline | deep_read | compare
    attachment_ids: list[str] = []  # temp upload IDs to inject as context
    attachments_meta: list[AttachmentMeta] = []  # metadata for frontend display persistence


class MessageSave(BaseModel):
    """Persist a pre-generated message without triggering AI."""
    role: str  # "user" | "assistant"
    content: str
    reasoning: str | None = None
    citations: list | None = None


class CitationOut(BaseModel):
    source_id: str
    chunk_id: str
    excerpt: str
    source_title: str | None = None


class MessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    reasoning: str | None = None
    citations: list | None
    agent_steps: list | None = None
    attachments: list | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
