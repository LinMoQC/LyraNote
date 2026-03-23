"""
Instruction types — the vocabulary of commands that Brain can issue to Engine.

Each dataclass represents a single atomic instruction. The Engine knows
how to execute each one.  Brain only *returns* them — it never performs IO.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Union


@dataclass
class CallLLMInstruction:
    """Ask the LLM to generate a response (possibly with tool schemas attached)."""

    type: str = "call_llm"


@dataclass
class CallToolsInstruction:
    """Execute one or more tool calls returned by the LLM."""

    tool_calls: list[dict] = field(default_factory=list)
    type: str = "call_tools"


@dataclass
class CallRAGInstruction:
    """Fall back to passive RAG retrieval (no tool was triggered)."""

    query: str = ""
    type: str = "call_rag"


@dataclass
class StreamAnswerInstruction:
    """Stream the final answer to the user using accumulated context."""

    type: str = "stream_answer"


@dataclass
class CompressContextInstruction:
    """Compress old messages into a summary to save context window space."""

    type: str = "compress_context"


@dataclass
class RequestHumanApprovalInstruction:
    """Pause the loop and request human approval for high-risk tool calls."""

    tool_calls: list[dict] = field(default_factory=list)
    approval_id: str = ""
    type: str = "request_human_approve"


@dataclass
class FinishInstruction:
    """Terminate the agent loop."""

    reason: str = "completed"
    type: str = "finish"


Instruction = Union[
    CallLLMInstruction,
    CallToolsInstruction,
    CallRAGInstruction,
    StreamAnswerInstruction,
    CompressContextInstruction,
    RequestHumanApprovalInstruction,
    FinishInstruction,
]
