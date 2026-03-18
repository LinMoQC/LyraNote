"""
AgentEngine — the execution layer of the Brain/Engine architecture.

Receives Instructions from AgentBrain and executes them (LLM calls, tool
dispatch, RAG retrieval, streaming).  All side-effects live here.

Inspired by LobeHub's AgentRuntime which maps each Instruction type to an
executor function, keeping the Brain completely pure.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any

from app.agents.core.brain import AgentBrain
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
from app.agents.core.tools import ToolContext, execute_tool

logger = logging.getLogger(__name__)


class AgentEngine:
    """Execute agent instructions, yielding SSE-compatible event dicts."""

    def __init__(
        self,
        brain: AgentBrain,
        tool_ctx: ToolContext,
        tool_schemas: list[dict],
        thought_labels: dict[str, str],
    ) -> None:
        self.brain = brain
        self.tool_ctx = tool_ctx
        self.tool_schemas = tool_schemas
        self.thought_labels = thought_labels

    async def run(self, state: AgentState) -> AsyncGenerator[dict, None]:
        while state.phase not in ("done", "error"):
            instruction = self.brain.decide(state)
            async for event in self._execute(instruction, state):
                yield event

    # ── Instruction dispatch ──────────────────────────────────────────────

    async def _execute(
        self, instruction: Instruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        if isinstance(instruction, CallLLMInstruction):
            async for evt in self._exec_call_llm(state):
                yield evt
        elif isinstance(instruction, CallToolsInstruction):
            async for evt in self._exec_call_tools(instruction, state):
                yield evt
        elif isinstance(instruction, CallRAGInstruction):
            async for evt in self._exec_call_rag(instruction, state):
                yield evt
        elif isinstance(instruction, CompressContextInstruction):
            async for evt in self._exec_compress_context(state):
                yield evt
        elif isinstance(instruction, RequestHumanApprovalInstruction):
            async for evt in self._exec_request_approval(instruction, state):
                yield evt
        elif isinstance(instruction, StreamAnswerInstruction):
            async for evt in self._exec_stream_answer(state):
                yield evt
        elif isinstance(instruction, FinishInstruction):
            state.phase = "done"

    # ── Executors ─────────────────────────────────────────────────────────

    async def _exec_call_llm(self, state: AgentState) -> AsyncGenerator[dict, None]:
        from app.providers.llm import chat_with_tools

        response = await chat_with_tools(state.messages, self.tool_schemas)
        state.step_count += 1

        if response["finish_reason"] == "tool_calls":
            raw = response["raw_message"]
            assistant_dict: dict = {"role": "assistant", "content": raw.content or ""}
            if raw.tool_calls:
                assistant_dict["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in raw.tool_calls
                ]
            state.messages.append(assistant_dict)
            state.pending_tool_calls = response["tool_calls"]
            state.phase = "llm_result"
        else:
            state.pending_tool_calls = []
            state.phase = "llm_result"

        # No SSE events from this executor — events come from tool/stream executors
        return
        yield  # pragma: no cover — makes this an async generator

    async def _exec_call_tools(
        self, instruction: CallToolsInstruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        tool_calls = instruction.tool_calls

        for tc in tool_calls:
            label = self.thought_labels.get(tc["name"], f"⚙️ 调用 {tc['name']}")
            yield {"type": "thought", "content": label}
            yield {"type": "tool_call", "tool": tc["name"], "input": tc["arguments"]}

        results = await asyncio.gather(
            *[execute_tool(tc, self.tool_ctx) for tc in tool_calls]
        )

        for tc, result in zip(tool_calls, results):
            if self.tool_ctx.mind_map_data is not None:
                yield {"type": "mind_map", "data": self.tool_ctx.mind_map_data}
                self.tool_ctx.mind_map_data = None

            if self.tool_ctx.created_note_id is not None:
                yield {
                    "type": "note_created",
                    "note_id": self.tool_ctx.created_note_id,
                    "note_title": self.tool_ctx.created_note_title,
                    "notebook_id": self.tool_ctx.notebook_id,
                }
                if result.startswith("NOTE_CREATED:"):
                    result = result.split(":", 2)[-1]
                self.tool_ctx.created_note_id = None
                self.tool_ctx.created_note_title = None

            if tc["name"] == "search_notebook_knowledge" and self.tool_ctx.collected_citations:
                summary_lines = [
                    f"[片段{i}] 来源：《{c['source_title']}》（相关度 {c.get('score', 0):.0%}）"
                    for i, c in enumerate(self.tool_ctx.collected_citations, 1)
                ]
                yield {
                    "type": "tool_result",
                    "content": f"✓ 找到 {len(summary_lines)} 个相关片段\n" + "\n".join(summary_lines),
                }
            elif tc["name"] == "web_search" and self.tool_ctx.collected_citations:
                web_citations = [
                    c
                    for c in self.tool_ctx.collected_citations
                    if str(c.get("source_id", "")).startswith("web-search")
                ]
                summary_lines = [
                    f"[网络{i}] 《{c['source_title']}》（相关度 {c.get('score', 0):.0%}）"
                    for i, c in enumerate(web_citations, 1)
                ]
                yield {
                    "type": "tool_result",
                    "content": f"✓ 搜索到 {len(summary_lines)} 条网络结果\n" + "\n".join(summary_lines),
                }
            else:
                yield {"type": "tool_result", "content": result[:300]}

            state.tool_results.append(result)
            state.messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

        state.pending_tool_calls = []
        state.phase = "tool_result"

    async def _exec_compress_context(
        self, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        """Compress old messages into a summary to free context window space.

        Keeps system prompt + last 4 messages intact, compresses everything
        in between into a single summary message.
        """
        from app.providers.llm import chat

        msgs = state.messages
        if len(msgs) <= 6:
            state.context_compressed = True
            state.phase = "tool_result"
            return
            yield  # pragma: no cover

        system_msg = msgs[0] if msgs[0].get("role") == "system" else None
        tail = msgs[-4:]
        middle = msgs[1:-4] if system_msg else msgs[:-4]

        if not middle:
            state.context_compressed = True
            state.phase = "tool_result"
            return
            yield  # pragma: no cover

        yield {"type": "thought", "content": "📝 压缩上下文以节省 token…"}

        middle_text = "\n".join(
            f"[{m.get('role', '?')}] {str(m.get('content', ''))[:500]}"
            for m in middle
        )
        try:
            summary = await chat(
                [
                    {
                        "role": "user",
                        "content": (
                            "请将以下对话历史压缩为一段简洁的摘要（200字以内），"
                            "保留关键信息和结论：\n\n" + middle_text[:6000]
                        ),
                    }
                ],
                temperature=0,
                max_tokens=300,
            )
        except Exception:
            logger.warning("Context compression failed, continuing without compression")
            state.context_compressed = True
            state.phase = "tool_result"
            return
            yield  # pragma: no cover

        compressed = [
            *(([system_msg] if system_msg else [])),
            {"role": "user", "content": f"[上下文摘要]\n{summary.strip()}"},
            {"role": "assistant", "content": "好的，我已了解之前的对话内容。"},
            *tail,
        ]
        state.messages = compressed
        state.context_compressed = True
        state.phase = "tool_result"

    async def _exec_request_approval(
        self, instruction: RequestHumanApprovalInstruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        """Emit an approval-required event and proceed with tool execution.

        In the current implementation this is a notification-only step:
        the tools still execute automatically.  A full HIL implementation
        would pause the loop here and wait for a WebSocket/SSE confirmation
        from the frontend before continuing.
        """
        tool_names = [tc.get("name", "") for tc in instruction.tool_calls]
        yield {
            "type": "human_approve_required",
            "tool_names": tool_names,
            "tool_calls": instruction.tool_calls,
        }

        # For now, auto-approve and continue with tool execution
        state.pending_tool_calls = instruction.tool_calls
        state.phase = "llm_result"

    async def _exec_call_rag(
        self, instruction: CallRAGInstruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        from app.agents.rag.retrieval import retrieve_chunks

        chunks = await retrieve_chunks(
            instruction.query,
            self.tool_ctx.notebook_id,
            self.tool_ctx.db,
            global_search=self.tool_ctx.global_search,
            user_id=self.tool_ctx.user_id,
        )
        if chunks:
            state.citations = [
                {
                    "source_id": c["source_id"],
                    "chunk_id": c["chunk_id"],
                    "excerpt": c["excerpt"],
                    "source_title": c["source_title"],
                    "score": c.get("score"),
                }
                for c in chunks
            ]
            state.tool_results = [c["content"] for c in chunks]
            self.tool_ctx.collected_citations = state.citations

        state.phase = "rag_done"
        return
        yield  # pragma: no cover

    async def _exec_stream_answer(self, state: AgentState) -> AsyncGenerator[dict, None]:
        from app.providers.llm import chat_stream

        clean: list[dict] = [
            m
            for m in state.messages
            if isinstance(m, dict)
            and m.get("role") not in ("tool",)
            and not (m.get("role") == "assistant" and m.get("tool_calls"))
        ]

        if state.tool_results:
            combined = "\n\n---\n\n".join(state.tool_results[:6])
            last_user = next(
                (i for i in range(len(clean) - 1, -1, -1) if clean[i].get("role") == "user"),
                -1,
            )
            if last_user >= 0:
                clean.insert(last_user, {
                    "role": "user",
                    "content": f"以下是检索到的参考资料：\n\n{combined}",
                })
                clean.insert(last_user + 1, {
                    "role": "assistant",
                    "content": "好的，我已阅读参考资料，请继续。",
                })

        t0 = time.monotonic()
        token_count = 0
        ttft: float | None = None

        async for chunk in chat_stream(clean):
            if chunk.get("type") == "token":
                token_count += 1
                if ttft is None:
                    ttft = time.monotonic() - t0
            yield chunk

        elapsed = time.monotonic() - t0
        tps = token_count / elapsed if elapsed > 0 else 0
        yield {
            "type": "speed",
            "ttft_ms": round((ttft or 0) * 1000),
            "tps": round(tps, 1),
            "tokens": token_count,
        }

        yield {"type": "citations", "citations": self.tool_ctx.collected_citations}
        yield {"type": "done"}
        state.phase = "done"
