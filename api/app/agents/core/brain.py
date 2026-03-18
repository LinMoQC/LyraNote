"""
AgentBrain — pure decision logic, zero side effects.

Given the current phase and state, returns the next Instruction for the
Engine to execute.  This class has NO async methods and NO IO — it can be
tested with plain pytest assertions.

Inspired by LobeHub's GeneralChatAgent which separates decision ("what
instruction to issue") from execution ("how to run it").
"""

from __future__ import annotations

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

TOOLS_REQUIRING_APPROVAL: set[str] = set()

CONTEXT_TOKEN_THRESHOLD = 8000



_CONVERSATIONAL_PATTERNS = [
    "你好", "您好", "hi", "hello", "嗨",
    "谢谢", "感谢", "thanks", "thank you",
    "好的", "好", "行", "ok", "okay", "嗯", "明白",
    "再见", "拜拜", "bye",
    "继续", "下一个", "还有呢",
    "你是谁", "你叫什么", "你能做什么",
]


def _is_knowledge_query(query: str) -> bool:
    q = query.strip()
    if len(q) < 4:
        return False
    q_lower = q.lower()
    for pat in _CONVERSATIONAL_PATTERNS:
        if q_lower == pat or (len(q) <= 8 and q_lower.startswith(pat)):
            return False
    return True


class AgentBrain:
    """Stateless decision maker for the ReAct agent loop."""

    def __init__(self, *, has_tools: bool = True, max_steps: int = 5) -> None:
        self._has_tools = has_tools
        self._max_steps = max_steps

    def decide(self, state: AgentState) -> Instruction:
        phase = state.phase

        if phase == "init":
            return CallLLMInstruction()

        if phase == "llm_result":
            if state.pending_tool_calls:
                if TOOLS_REQUIRING_APPROVAL:
                    needs_approval = [
                        tc for tc in state.pending_tool_calls
                        if tc.get("name") in TOOLS_REQUIRING_APPROVAL
                    ]
                    if needs_approval:
                        return RequestHumanApprovalInstruction(
                            tool_calls=state.pending_tool_calls
                        )
                return CallToolsInstruction(tool_calls=state.pending_tool_calls)
            # LLM finished without tools — decide whether to RAG or stream answer
            if not state.tool_results and _is_knowledge_query(state.query):
                return CallRAGInstruction(query=state.query)
            return StreamAnswerInstruction()

        if phase == "tool_result":
            if state.step_count >= self._max_steps:
                state.force_finish = True
                return StreamAnswerInstruction()
            if (
                not state.context_compressed
                and state.estimate_tokens() > CONTEXT_TOKEN_THRESHOLD
            ):
                return CompressContextInstruction()
            return CallLLMInstruction()

        if phase == "rag_done":
            return StreamAnswerInstruction()

        if phase == "max_steps_fallback":
            return StreamAnswerInstruction()

        return FinishInstruction(reason="error")
