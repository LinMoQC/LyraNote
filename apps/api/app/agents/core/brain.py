"""
AgentBrain — pure decision logic, zero side effects.

Given the current phase and state, returns the next Instruction for the
Engine to execute.  This class has NO async methods and NO IO — it can be
tested with plain pytest assertions.

Design principle (Agentic):
  The LLM is the sole decision-maker on whether to call tools.
  All registered tools (including search_notebook_knowledge) are passed
  to the LLM as callable options.  If the LLM chooses not to call any tool
  after seeing the full tool list, that decision is trusted and the answer
  is streamed directly.

  The only exception is the fast-path when has_tools=False: with no tools
  available there is no point running a tool-planning LLM call, so we go
  straight to RAG to give the answer context.
"""

from __future__ import annotations

import uuid

from app.agents.core.instructions import (
    CallLLMInstruction,
    CallRAGInstruction,
    CallToolsInstruction,
    CompressContextInstruction,
    FinishInstruction,
    Instruction,
    RequestHumanApprovalInstruction,
    StreamAnswerInstruction,
)
from app.agents.core.state import AgentState

# Built-in tools that always need approval (exact names).
# MCP tools are covered automatically: any tool whose name contains "__"
# (the server__method naming convention) requires approval by design.
TOOLS_REQUIRING_APPROVAL: set[str] = set()


def _requires_approval(tool_name: str) -> bool:
    return "__" in tool_name or tool_name in TOOLS_REQUIRING_APPROVAL

CONTEXT_TOKEN_THRESHOLD = 8000


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
            # LLM chose not to call any tool — trust that decision and answer directly.
            # search_notebook_knowledge is in the tool list; if the LLM didn't call it,
            # it judged that no retrieval was needed for this query.
            return StreamAnswerInstruction()

        if phase == "tool_result":
            if state.step_count >= self._max_steps:
                state.force_finish = True
                return StreamAnswerInstruction()
            if state.terminal_tool_called:
                return StreamAnswerInstruction()
            # Never compress when MCP tools have been called: MCP responses (e.g.
            # read_me) are often large but are critical context for the next step
            # (e.g. create_view).  Compressing them would strip the instructions
            # that tell the LLM what to do next, causing the loop to stall.
            mcp_was_called = any("__" in key for key in state.tool_result_cache)
            if (
                not mcp_was_called
                and not state.context_compressed
                and state.estimate_tokens() > CONTEXT_TOKEN_THRESHOLD
            ):
                return CompressContextInstruction()
            return CallLLMInstruction()

        if phase == "rag_done":
            return StreamAnswerInstruction()

        if phase == "max_steps_fallback":
            return StreamAnswerInstruction()

        return FinishInstruction(reason="error")
