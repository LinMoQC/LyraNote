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


_MCP_HTML_START = "__MCP_HTML_RESOURCE__"
_MCP_HTML_END = "__/MCP_HTML_RESOURCE__"


def _split_mcp_html(result: str) -> tuple[str, str | None]:
    """Split a tool result string that may embed HTML via the sentinel markers.

    Returns (text_part, html_content_or_None).
    """
    start = result.find(_MCP_HTML_START)
    if start == -1:
        return result, None
    end = result.find(_MCP_HTML_END, start)
    if end == -1:
        return result[:start].rstrip(), result[start + len(_MCP_HTML_START):]
    html = result[start + len(_MCP_HTML_START):end]
    text = result[:start].rstrip()
    return text, html


def _try_parse_mcp_json(tool_name: str, result: str) -> dict | None:
    """If *tool_name* is an MCP-namespaced tool (contains '__'), return a generic
    mcp_result payload for the frontend to render.  Supports two modes:

    1. **EmbeddedResource (HTML)** — result contains ``__MCP_HTML_RESOURCE__``
       sentinels; ``html_content`` is populated so the frontend renders an iframe.
    2. **JSON text** — result is valid JSON; ``data`` is populated so the frontend
       can display a structured card or a tool-specific renderer (e.g. Excalidraw).

    Returns None for built-in skills or results that match neither case.
    """
    if "__" not in tool_name:
        return None

    # --- Mode 1: HTML resource -------------------------------------------------
    text_part, html = _split_mcp_html(result)
    if html is not None:
        import json as _json
        payload: dict = {"tool": tool_name, "html_content": html.strip()}
        # Optionally attach any JSON from the text part
        stripped_text = text_part.strip()
        if stripped_text.startswith(("{", "[")):
            try:
                payload["data"] = _json.loads(stripped_text)
            except (ValueError, _json.JSONDecodeError):
                pass
        return payload

    # --- Mode 2: plain JSON ----------------------------------------------------
    stripped = result.strip()
    if not stripped.startswith(("{", "[")):
        return None
    try:
        import json
        data = json.loads(stripped)
    except (json.JSONDecodeError, ValueError):
        return None
    return {"tool": tool_name, "data": data}


def _build_context(tool_results: list[str], max_total_chars: int = 6000) -> str:
    """
    Build the RAG context string from tool results with source deduplication.

    - Splits each result into individual "[片段N]" sections
    - Keeps at most 2 chunks per unique source title
    - Caps total length at max_total_chars to protect the context window
    """
    import re

    sections: list[str] = []
    seen_sources: dict[str, int] = {}  # source_title → count of included chunks

    for result_block in tool_results[:8]:
        # Split on "[片段N]" markers
        raw_sections = re.split(r"(?=\[片段\d+\])", result_block)
        for section in raw_sections:
            section = section.strip()
            if not section:
                continue
            # Extract source title from "来源：《xxx》" pattern
            title_match = re.search(r"来源：《(.+?)》", section)
            source_title = title_match.group(1) if title_match else "_unknown"
            count = seen_sources.get(source_title, 0)
            if count >= 2:
                continue  # already have 2 chunks from this source
            seen_sources[source_title] = count + 1
            sections.append(section)

    combined = "\n\n---\n\n".join(sections)
    # Hard-cap to avoid overflowing context window
    if len(combined) > max_total_chars:
        combined = combined[:max_total_chars] + "\n\n[…内容已截断]"
    return combined


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

        # Exclude no-arg MCP tools (e.g. read_me) that have already been called
        # and are cached.  Presenting them to the LLM again causes re-call loops
        # because the model ignores in-result "do not call again" instructions.
        cached_no_arg_tools: set[str] = {
            key.split("::")[0]
            for key in state.tool_result_cache
            if key.endswith("::{}")
        }
        tool_schemas = (
            [s for s in self.tool_schemas
             if s.get("function", {}).get("name") not in cached_no_arg_tools]
            if cached_no_arg_tools
            else self.tool_schemas
        )

        if state.step_count >= state.max_steps - 2 and state.step_count > 0:
            state.messages.append({
                "role": "system",
                "content": (
                    f"[系统提示] 你已使用 {state.step_count}/{state.max_steps} 步。"
                    "请尽快整合已有信息回答用户，避免不必要的额外工具调用。"
                ),
            })

        try:
            response = await chat_with_tools(state.messages, tool_schemas, temperature=0.2)
        except Exception as exc:
            logger.error("LLM call failed: %s", exc)
            state.phase = "error"
            yield {"type": "error", "content": f"AI 服务暂时不可用，请稍后重试。({type(exc).__name__})"}
            yield {"type": "done"}
            return
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
            # Don't show a "calling tool" UI event for cache hits — the result is
            # already in the message history from a previous step.
            is_cached = state.is_tool_cached(tc["name"], tc.get("arguments", {}))
            if not is_cached:
                label = self.thought_labels.get(tc["name"], f"⚙️ 调用 {tc['name']}")
                yield {"type": "thought", "content": label}
                yield {"type": "tool_call", "tool": tc["name"], "input": tc["arguments"]}

        # Resolve each tool call: use cached result if the same tool+args was
        # already executed in this session, otherwise execute normally.
        async def _resolve(tc: dict) -> str:
            args = tc.get("arguments", {})
            cache_key = state.tool_cache_key(tc["name"], args)
            if cache_key in state.tool_result_cache:
                logger.debug("Tool '%s' already called with same args — returning cached result", tc["name"])
                return state.tool_result_cache[cache_key]
            try:
                result = await execute_tool(tc, self.tool_ctx)
            except BaseException as exc:
                from app.mcp.client import _exc_msg
                msg = _exc_msg(exc)
                logger.error("Tool '%s' raised error: %s", tc["name"], msg, exc_info=True)
                result = f"[工具 {tc['name']} 调用失败: {msg}]"
            state.tool_result_cache[cache_key] = result
            return result

        # Record which calls are cache hits BEFORE _resolve runs (after _resolve
        # all keys exist in the cache, making it impossible to distinguish).
        pre_cached: set[str] = {
            tc["name"]
            for tc in tool_calls
            if state.is_tool_cached(tc["name"], tc.get("arguments", {}))
        }

        results = await asyncio.gather(*[_resolve(tc) for tc in tool_calls])

        for tc, result in zip(tool_calls, results):
            if self.tool_ctx.mind_map_data is not None:
                yield {"type": "mind_map", "data": self.tool_ctx.mind_map_data}
                self.tool_ctx.mind_map_data = None

            if self.tool_ctx.diagram_data is not None:
                yield {"type": "diagram", "data": self.tool_ctx.diagram_data}
                self.tool_ctx.diagram_data = None
                state.terminal_tool_called = True

            # For MCP-namespaced tools (name contains '__'), if the result is
            # valid JSON forward it as a generic mcp_result event so the frontend
            # can render it without any backend knowledge of the specific tool.
            _mcp_payload = _try_parse_mcp_json(tc["name"], result)
            if _mcp_payload is not None:
                yield {"type": "mcp_result", "data": _mcp_payload}
                state.terminal_tool_called = True
                result = f"[工具 {tc['name']} 已执行，返回结构化数据]"

            # MCP action tools (create_view, export, etc.) that return plain-text
            # confirmations (not JSON) are also terminal — they produce a self-contained
            # side-effect (e.g. rendering a diagram) and the loop should stop.
            # Read/list/save tools are NOT terminal; only skip tools that mutate or display.
            _NON_TERMINAL_PREFIXES = ("read", "list", "get", "fetch", "save", "load")
            if "__" in tc["name"] and not _mcp_payload and not state.terminal_tool_called:
                _tool_suffix = tc["name"].rsplit("__", 1)[-1]
                if not any(_tool_suffix.startswith(p) for p in _NON_TERMINAL_PREFIXES):
                    state.terminal_tool_called = True

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

            for elem in self.tool_ctx.ui_elements:
                yield {"type": "ui_element", **elem}
            self.tool_ctx.ui_elements.clear()

            state.tool_results.append(result)
            state.messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

        state.pending_tool_calls = []
        state.phase = "tool_result"

        # If any tool in this batch was a cache hit (re-call), inject a reminder
        # into the message history so the next LLM call knows not to repeat it.
        # This is the most reliable way to prevent re-call loops with models that
        # ignore in-result instructions (e.g. "Do NOT call me again").
        if pre_cached:
            names = ", ".join(f"`{n}`" for n in sorted(pre_cached))
            state.messages.append({
                "role": "user",
                "content": (
                    f"[系统提示] 工具 {names} 已经调用过，其结果已在上方对话中。"
                    f"请不要再次调用这些工具。根据已有结果，直接调用下一步工具或回答用户。"
                ),
            })
            state.messages.append({
                "role": "assistant",
                "content": f"明白，我不会再重复调用 {names}，将根据已有结果继续下一步。",
            })

    async def _exec_compress_context(
        self, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        """Compress old messages into a summary to free context window space.

        Always keeps the current turn intact (from the last user message to the
        end of messages, including all tool calls and results).  Only history
        messages from previous turns are summarised.
        """
        from app.providers.llm import chat

        msgs = state.messages
        if len(msgs) <= 6:
            state.context_compressed = True
            state.phase = "tool_result"
            return
            yield  # pragma: no cover

        system_msg = msgs[0] if msgs[0].get("role") == "system" else None

        # Find the start of the current turn: the last "user" role message.
        # Everything from there to the end must be kept intact so the LLM
        # always sees the current query + all tool call / result pairs.
        current_turn_start = 1  # fallback: right after system
        for i in range(len(msgs) - 1, 0, -1):
            if msgs[i].get("role") == "user":
                current_turn_start = i
                break

        tail = msgs[current_turn_start:]
        middle = msgs[1:current_turn_start] if system_msg else msgs[:current_turn_start]

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
        """Pause the agent loop and wait for explicit user approval.

        Flow:
          1. Register an asyncio.Event in the approval store keyed by approval_id.
          2. Emit ``human_approve_required`` so the frontend can show the approval card.
          3. Await the event (120 s timeout — auto-reject on timeout).
          4a. Approved → set state so Brain emits CallToolsInstruction next iteration.
          4b. Rejected / timeout → emit a notice token and mark phase "done".
        """
        from app.agents.core import approval_store

        approval_id = instruction.approval_id or str(__import__("uuid").uuid4())
        approval_store.create(approval_id)

        yield {
            "type": "human_approve_required",
            "approval_id": approval_id,
            "tool_calls": instruction.tool_calls,
        }

        try:
            event = approval_store._events.get(approval_id)
            if event is not None:
                await asyncio.wait_for(event.wait(), timeout=120.0)
            approved = approval_store.get_result(approval_id)
        except asyncio.TimeoutError:
            approved = False
        finally:
            approval_store.cleanup(approval_id)

        if approved:
            # Mark each tool call as approved so Brain won't request approval again
            # on the next iteration when it sees the same pending_tool_calls.
            for tc in instruction.tool_calls:
                state.approved_tool_call_ids.add(tc.get("id") or tc.get("name", ""))
            state.pending_tool_calls = instruction.tool_calls
            state.phase = "llm_result"
        else:
            yield {"type": "token", "content": "\n\n> 工具调用已被拒绝，AI 将直接回答。"}
            state.pending_tool_calls = []
            state.phase = "llm_result"  # empty pending → Brain returns StreamAnswerInstruction

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
            combined = _build_context(state.tool_results)
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

        # After compression + filtering, the original query may have been lost.
        # Ensure it is always the last user message so the AI knows what to answer.
        if state.query:
            last_msg = clean[-1] if clean else None
            if not last_msg or last_msg.get("role") != "user" or last_msg.get("content") != state.query:
                clean.append({"role": "user", "content": state.query})

        t0 = time.monotonic()
        token_count = 0
        ttft: float | None = None

        try:
            async for chunk in chat_stream(clean):
                if chunk.get("type") == "token":
                    token_count += 1
                    if ttft is None:
                        ttft = time.monotonic() - t0
                yield chunk
        except Exception as exc:
            logger.error("Stream answer failed: %s", exc)
            yield {"type": "error", "content": f"AI 服务暂时不可用，请稍后重试。({type(exc).__name__})"}
            yield {"type": "done"}
            state.phase = "error"
            return

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
