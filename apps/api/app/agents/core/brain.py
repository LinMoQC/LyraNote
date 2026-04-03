"""
AgentBrain — pure decision logic, zero side effects.

Given the current phase and state, returns the next Instruction for the
Engine to execute.  This class has NO async methods and NO IO — it can be
tested with plain pytest assertions.

Design principle (Agentic):
  The LLM is the sole decision-maker on whether to call tools.
  All registered tools (including search_notebook_knowledge) are passed
  to the LLM as callable options.  If the LLM chooses not to call any tool
  after seeing the full tool list, that decision is usually trusted and the
  answer is streamed directly.

  Exceptions:
    - has_tools=False fast-path: with no tools available there is no point
      running a tool-planning LLM call, so we go straight to RAG.
    - knowledge-seeking queries with no tool results: fall back to passive
      RAG so the answer is still grounded in notebook context.
"""

from __future__ import annotations

import uuid

from app.agents.core.instructions import (
    CallLLMInstruction,
    ClarifyInstruction,
    CallRAGInstruction,
    CallToolsInstruction,
    CompressContextInstruction,
    FinishInstruction,
    Instruction,
    RequestHumanApprovalInstruction,
    StreamAnswerInstruction,
    VerifyResultInstruction,
)
from app.agents.core.state import AgentState

# Built-in tools that always need approval (exact names).
# MCP tools are covered automatically: any tool whose name contains "__"
# (the server__method naming convention) requires approval by design.
TOOLS_REQUIRING_APPROVAL: set[str] = set()


def _requires_approval(tool_name: str) -> bool:
    return "__" in tool_name or tool_name in TOOLS_REQUIRING_APPROVAL

# Layer 2 (snipCompact): drop oldest messages, no LLM call. Fires up to _MAX_SNIP_PASSES times.
SNIP_TOKEN_THRESHOLD = 4000
_MAX_SNIP_PASSES = 2

# Layer 3 (reactiveCompact): LLM-based summarization. Fires after snip passes exhausted.
CONTEXT_TOKEN_THRESHOLD = 8000

# Diminishing-returns detection (P6): abort the loop if the model generates
# fewer than _LOW_OUTPUT_TOKEN_THRESHOLD tokens for this many turns in a row.
_DIMINISHING_RETURNS_MAX_TURNS = 3
_KNOWLEDGE_QUERY_MIN_CHARS = 8


def _is_knowledge_query(query: str) -> bool:
    """Treat substantive prompts as knowledge-seeking and worth a RAG fallback."""
    return len(query.strip()) >= _KNOWLEDGE_QUERY_MIN_CHARS


class AgentBrain:
    """Stateless decision maker for the ReAct agent loop."""

    def __init__(self, *, has_tools: bool = True, max_steps: int = 5) -> None:
        self._has_tools = has_tools
        self._max_steps = max_steps

    def decide(self, state: AgentState) -> Instruction:
        phase = state.phase

        if phase == "init":
            if not self._has_tools:
                # Fast path: no tools configured — skip tool-planning LLM call
                # and go straight to RAG for context, saving ~500ms–2s.
                return CallRAGInstruction(query=state.query)
            return CallLLMInstruction()

        if phase == "llm_result":
            if state.pending_tool_calls:
                needs_approval = [
                    tc for tc in state.pending_tool_calls
                    if _requires_approval(tc.get("name", ""))
                    # Skip if this exact call ID was already approved this session
                    and tc.get("id", tc.get("name", "")) not in state.approved_tool_call_ids
                    # Skip if the tool+args combo is already cached — approval was
                    # implicitly granted in an earlier step with identical arguments.
                    and not state.is_tool_cached(tc.get("name", ""), tc.get("arguments", {}))
                ]
                if needs_approval:
                    return RequestHumanApprovalInstruction(
                        tool_calls=state.pending_tool_calls,
                        approval_id=str(uuid.uuid4()),
                    )

                # Filter out tool calls that are already cached (same tool + same args).
                fresh_calls = [
                    tc for tc in state.pending_tool_calls
                    if not state.is_tool_cached(tc.get("name", ""), tc.get("arguments", {}))
                ]
                if not fresh_calls:
                    # All pending calls are already cached — results are already in
                    # the message history from the first execution.  Re-executing
                    # would append duplicate tool messages and confuse the LLM.
                    # The engine now filters cached no-arg tools from the tool list,
                    # so the next LLM call will naturally proceed to the next step.
                    if state.step_count >= self._max_steps - 2:
                        return StreamAnswerInstruction()
                    return CallLLMInstruction()

                state.pending_tool_calls = fresh_calls
                return CallToolsInstruction(tool_calls=fresh_calls)
            if state.execution_path == "clarify":
                return ClarifyInstruction(reason=state.route_reason)
            if state.tool_results:
                return StreamAnswerInstruction()
            if _is_knowledge_query(state.query):
                return CallRAGInstruction(query=state.query)
            return StreamAnswerInstruction()

        if phase == "tool_result":
            if state.step_count >= self._max_steps:
                state.force_finish = True
                return StreamAnswerInstruction()
            if state.terminal_tool_called:
                return StreamAnswerInstruction()
            if state.needs_verification and not state.verification_done:
                return VerifyResultInstruction(reason=state.verification_reason)
            # Never compress when MCP tools have been called: MCP responses (e.g.
            # read_me) are often large but are critical context for the next step
            # (e.g. create_view).  Compressing them would strip the instructions
            # that tell the LLM what to do next, causing the loop to stall.
            mcp_was_called = any("__" in key for key in state.tool_result_cache)
            if not mcp_was_called and not state.context_compressed:
                token_est = state.estimate_tokens()
                # Layer 2 (snipCompact): cheap, no LLM call — fires first.
                if (
                    token_est > SNIP_TOKEN_THRESHOLD
                    and state.snip_count < _MAX_SNIP_PASSES
                ):
                    return CompressContextInstruction(mode="snip")
                # Layer 3 (reactiveCompact): LLM summarize — fires after snip exhausted.
                if (
                    not state.context_compressed
                    and token_est > CONTEXT_TOKEN_THRESHOLD
                ):
                    return CompressContextInstruction(mode="summarize")
            # Diminishing-returns guard: abort re-loop if model keeps generating
            # almost nothing, indicating it is stuck without useful new information.
            if state.consecutive_low_output_turns >= _DIMINISHING_RETURNS_MAX_TURNS:
                state.add_policy_trace(
                    "diminishing_returns",
                    "consecutive_low_output_turns_exceeded",
                    str(state.consecutive_low_output_turns),
                )
                return StreamAnswerInstruction()
            return CallLLMInstruction()

        if phase == "rag_done":
            return StreamAnswerInstruction()

        if phase == "max_steps_fallback":
            return StreamAnswerInstruction()

        return FinishInstruction(reason="error")
