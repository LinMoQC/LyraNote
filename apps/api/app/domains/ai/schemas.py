"""Pydantic schemas for AI domain endpoints."""

from typing import Literal

from pydantic import BaseModel


# ── Suggestions ──────────────────────────────────────────────────────────────

class SuggestionsOut(BaseModel):
    suggestions: list[str]


class GreetingSuggestion(BaseModel):
    label: str
    prompt: str | None = None
    action: str | None = None


class ContextGreetingOut(BaseModel):
    greeting: str
    suggestions: list[GreetingSuggestion]


class SourceSuggestionsOut(BaseModel):
    summary: str | None
    questions: list[str]


# ── Research ────────────────────────────────────────────────────────────────

class ClarifyOption(BaseModel):
    label: str
    value: str


class ClarifyQuestion(BaseModel):
    question: str
    options: list[ClarifyOption]


class ClarifyRequest(BaseModel):
    query: str


class ClarifyResponse(BaseModel):
    questions: list[ClarifyQuestion]


class DeepResearchRequest(BaseModel):
    query: str
    notebook_id: str | None = None
    mode: Literal["quick", "deep"] = "quick"
    clarification_context: list[dict] | None = None


class SaveDeepResearchSourcesRequest(BaseModel):
    target_notebook_id: str | None = None


# ── Writing ─────────────────────────────────────────────────────────────────

class PolishRequest(BaseModel):
    text: str
    instruction: str = "优化语言表达，使文字更清晰流畅、逻辑更严密，保持原有语气和核心含义"


class WritingContextRequest(BaseModel):
    notebook_id: str
    text_around_cursor: str


class WritingContextChunk(BaseModel):
    source_title: str
    excerpt: str
    score: float
    chunk_id: str


class WritingContextOut(BaseModel):
    chunks: list[WritingContextChunk]


# ── Knowledge ───────────────────────────────────────────────────────────────

class CrossNotebookChunk(BaseModel):
    notebook_title: str
    source_title: str
    excerpt: str
    score: float
    chunk_id: str
    notebook_id: str


class CrossNotebookOut(BaseModel):
    chunks: list[CrossNotebookChunk]


# ── Insights ────────────────────────────────────────────────────────────────

class InsightOut(BaseModel):
    id: str
    insight_type: str
    title: str
    content: str | None
    notebook_id: str | None
    is_read: bool
    created_at: str


class InsightsListOut(BaseModel):
    insights: list[InsightOut]
    unread_count: int
