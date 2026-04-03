from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ConversationCreate(BaseModel):
    title: str | None = None
    source: str = "chat"  # "chat" | "copilot"


class ConversationOut(BaseModel):
    id: UUID
    notebook_id: UUID | None
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
    thinking_enabled: bool | None = None  # enable provider reasoning/thinking when supported


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
    generation_id: UUID | None = None
    role: str
    status: str
    content: str
    reasoning: str | None = None
    citations: list | None
    agent_steps: list | None = None
    attachments: list | None = None
    speed: dict | None = None
    mind_map: dict | None = None
    diagram: dict | None = None
    mcp_result: dict | None = None
    ui_elements: list | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageGenerationCreateOut(BaseModel):
    generation_id: UUID
    conversation_id: UUID
    user_message_id: UUID
    assistant_message_id: UUID


class MessageGenerationStatusOut(BaseModel):
    generation_id: UUID
    conversation_id: UUID
    user_message_id: UUID
    assistant_message_id: UUID
    status: str
    model: str | None = None
    error_message: str | None = None
    last_event_index: int
    assistant_message: MessageOut | None = None
    created_at: datetime
    completed_at: datetime | None = None
