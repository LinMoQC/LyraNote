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
from app.agents.core.hooks import PostToolHook, default_post_tool_hooks
from app.agents.core.llm_backend import DefaultLLMBackend, LLMBackend
from app.agents.core.retry import (
    classify_llm_error,
    max_retries_for,
    sleep_before_retry,
)
from app.agents.core.instructions import (
    CallLLMInstruction,
    CallRAGInstruction,
    CallToolsInstruction,
    ClarifyInstruction,
    CompressContextInstruction,
    FinishInstruction,
    Instruction,
    RequestHumanApprovalInstruction,
    StreamAnswerInstruction,
    VerifyResultInstruction,
)
from app.agents.core.state import AgentState
from app.agents.core.tools import ToolContext, execute_tool, is_read_only_tool
from app.services.monitoring_service import (
    build_text_snapshot,
    estimate_message_tokens,
    estimate_tokens,
    record_completed_llm_call,
    record_completed_span,
    record_completed_tool_call,
    traced_span,
    utcnow,
)

logger = logging.getLogger(__name__)


_MCP_HTML_START = "__MCP_HTML_RESOURCE__"
_MCP_HTML_END = "__/MCP_HTML_RESOURCE__"


def _verification_reason_for_tool(tool_name: str, result: str) -> str | None:
    """Return a lightweight verification reminder for tool-heavy answer paths."""
    if "__" in tool_name:
        return "本轮使用了 MCP 工具，请在回答前确认工具结果与后续结论一致。"
    if tool_name in {"summarize_sources", "compare_sources", "deep_read_sources"}:
        return "本轮生成了结构化研究结果，请在回答前核对结论是否与工具输出一致。"
    if tool_name == "search_notebook_knowledge" and "[片段" in result:
        return "本轮依赖检索结果，请在回答前核对引用编号、来源与结论是否一致。"
    if tool_name == "web_search" and "[结果" in result:
        return "本轮依赖网络搜索结果，请在回答前核对引用来源与结论是否一致。"
    return None


def _extract_followup_tool_hint(result: str) -> str | None:
    import re

    patterns = [
        r"Now use [`']?([a-zA-Z0-9_]+)[`']?",
        r"请使用[`']?([a-zA-Z0-9_]+)[`']?",
        r"Use [`']?([a-zA-Z0-9_]+)[`']? next",
    ]
    for pattern in patterns:
        match = re.search(pattern, result)
        if match:
            return match.group(1)
    return None


def _split_mcp_html(result: str) -> tuple[str, str | None]:
    """Split a tool result string that may embed HTML via the sentinel markers.

    Returns (text_part, html_content_or_None).
    """
    start = result.find(_MCP_HTML_START)
    if start == -1:
        return result, None
    end = result.find(_MCP_HTML_END, start)
    if end == -1:
        return result[:start].rstrip(), result[start + len(_MCP_HTML_START) :]
    html = result[start + len(_MCP_HTML_START) : end]
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


def _llm_response_snapshot(response: dict) -> dict[str, Any]:
    if response.get("finish_reason") == "tool_calls":
        return {
            "finish_reason": "tool_calls",
            "tool_calls": response.get("tool_calls", []),
        }
    return {
        "finish_reason": response.get("finish_reason"),
        "content": response.get("content", ""),
    }


class AgentEngine:
    """Execute agent instructions, yielding SSE-compatible event dicts."""

    def __init__(
        self,
        brain: AgentBrain,
        tool_ctx: ToolContext,
        tool_schemas: list[dict],
        thought_labels: dict[str, str],
        thinking_enabled: bool | None = None,
        llm_backend: LLMBackend | None = None,
        post_tool_hooks: list[PostToolHook] | None = None,
    ) -> None:
        self.brain = brain
        self.tool_ctx = tool_ctx
        self.tool_schemas = tool_schemas
        self.thought_labels = thought_labels
        self.thinking_enabled = thinking_enabled
        self._llm: LLMBackend = llm_backend or DefaultLLMBackend()
        # Post-tool hooks run in order after each tool execution.
        # None → use the default registered hooks. Pass an explicit list to override
        # (useful for testing or extending with custom post-processing).
        self._post_tool_hooks: list[PostToolHook] = (
            post_tool_hooks
            if post_tool_hooks is not None
            else default_post_tool_hooks()
        )

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
        elif isinstance(instruction, ClarifyInstruction):
            async for evt in self._exec_clarify(instruction, state):
                yield evt
        elif isinstance(instruction, RequestHumanApprovalInstruction):
            async for evt in self._exec_request_approval(instruction, state):
                yield evt
        elif isinstance(instruction, VerifyResultInstruction):
            async for evt in self._exec_verify_result(instruction, state):
                yield evt
        elif isinstance(instruction, StreamAnswerInstruction):
            async for evt in self._exec_stream_answer(state):
                yield evt
        elif isinstance(instruction, FinishInstruction):
            state.phase = "done"

    # ── Executors ─────────────────────────────────────────────────────────

    async def _exec_call_llm(self, state: AgentState) -> AsyncGenerator[dict, None]:
        """Unified streaming LLM call — single round-trip that either streams
        the answer directly to the user OR detects tool calls and sets up the
        next execution step, matching Claude Code's single-call architecture."""

        cached_no_arg_tools: set[str] = {
            key.split("::")[0]
            for key in state.tool_result_cache
            if key.endswith("::{}")
        }
        tool_schemas = (
            [
                s
                for s in self.tool_schemas
                if s.get("function", {}).get("name") not in cached_no_arg_tools
            ]
            if cached_no_arg_tools
            else self.tool_schemas
        )

        if state.step_count >= state.max_steps - 2 and state.step_count > 0:
            state.messages.append(
                {
                    "role": "user",
                    "content": (
                        f"[系统提示] 你已使用 {state.step_count}/{state.max_steps} 步。"
                        "请尽快整合已有信息回答用户，避免不必要的额外工具调用。"
                    ),
                }
            )

        t0 = time.monotonic()
        llm_started_at = utcnow()
        token_count = 0
        ttft: float | None = None
        output_parts: list[str] = []
        reasoning_parts: list[str] = []
        got_tool_calls = False
        api_output_tokens: int | None = None

        # Industrial retry loop (P7): classified backoff for 529/429/network errors.
        # Only retries when no tokens have been streamed yet — mid-stream failures
        # cannot be retried because partial output has already been sent to the client.
        _llm_attempt = 0
        while True:
            try:
                async with traced_span(
                    self.tool_ctx.db,
                    "chat.llm.stream",
                    metadata={"step_count": state.step_count, "attempt": _llm_attempt},
                ):
                    async for chunk in self._llm.chat_stream_with_tools(
                        state.messages,
                        tool_schemas,
                        temperature=0.2,
                        thinking_enabled=self.thinking_enabled,
                    ):
                        if chunk["type"] == "token":
                            token_count += 1
                            output_parts.append(chunk["content"])
                            if ttft is None:
                                ttft = time.monotonic() - t0
                            yield chunk
                        elif chunk["type"] == "reasoning":
                            reasoning_parts.append(chunk["content"])
                            yield chunk
                        elif chunk["type"] == "usage":
                            api_output_tokens = chunk.get("output_tokens")
                        elif chunk["type"] == "tool_calls":
                            got_tool_calls = True
                            if output_parts:
                                yield {
                                    "type": "thought",
                                    "content": "".join(output_parts),
                                }
                            state.messages.append(chunk["raw_assistant"])
                            state.pending_tool_calls = chunk["calls"]
                break  # success — exit retry loop
            except Exception as exc:
                error_class = classify_llm_error(exc)
                can_retry = (
                    error_class != "auth"
                    and _llm_attempt < max_retries_for(error_class)
                    and not output_parts  # never retry mid-stream
                )
                if can_retry:
                    yield {
                        "type": "agent_trace",
                        "event": "llm_retry",
                        "reason": error_class,
                        "detail": f"attempt={_llm_attempt + 1} error={type(exc).__name__}",
                    }
                    await sleep_before_retry(error_class, _llm_attempt, str(exc)[:120])
                    _llm_attempt += 1
                    # Reset per-call counters so the retry is measured cleanly.
                    t0 = time.monotonic()
                    llm_started_at = utcnow()
                    continue
                # Unrecoverable or retries exhausted — record and surface error.
                elapsed = time.monotonic() - t0
                await record_completed_llm_call(
                    self.tool_ctx.db,
                    call_type="stream",
                    prompt=state.messages,
                    response={"error": str(exc)},
                    status="error",
                    error_message=str(exc),
                    metadata={
                        "message_count": len(state.messages),
                        "step_count": state.step_count,
                        "error_class": error_class,
                        "attempts": _llm_attempt + 1,
                    },
                    input_tokens=estimate_message_tokens(state.messages),
                    output_tokens=0,
                    started_at=llm_started_at,
                    finished_at=utcnow(),
                    duration_ms=int(elapsed * 1000),
                )
                logger.error(
                    "LLM call failed (class=%s, attempts=%d): %s",
                    error_class,
                    _llm_attempt + 1,
                    exc,
                )
                state.phase = "error"
                yield {
                    "type": "error",
                    "content": f"AI 服务暂时不可用，请稍后重试。({type(exc).__name__})",
                }
                yield {"type": "done"}
                return

        elapsed = time.monotonic() - t0
        final_output = "".join(output_parts)
        final_reasoning = "".join(reasoning_parts)
        await record_completed_llm_call(
            self.tool_ctx.db,
            call_type="stream",
            prompt=state.messages,
            response={"content": final_output, "reasoning": final_reasoning},
            finish_reason="tool_calls" if got_tool_calls else "stop",
            metadata={
                "message_count": len(state.messages),
                "step_count": state.step_count,
            },
            input_tokens=estimate_message_tokens(state.messages),
            output_tokens=estimate_tokens(final_output),
            reasoning_tokens=estimate_tokens(final_reasoning),
            ttft_ms=round((ttft or 0) * 1000),
            started_at=llm_started_at,
            finished_at=utcnow(),
            duration_ms=int(elapsed * 1000),
        )
        state.step_count += 1

        # Diminishing-returns detection (P6): track consecutive low-output turns
        # so the Brain can abort the loop before burning all remaining steps.
        _LOW_OUTPUT_TOKEN_THRESHOLD = 50
        if not got_tool_calls and token_count < _LOW_OUTPUT_TOKEN_THRESHOLD:
            state.consecutive_low_output_turns += 1
        else:
            state.consecutive_low_output_turns = 0

        if got_tool_calls:
            state.phase = "llm_result"
        else:
            # Model answered directly — tokens already streamed, emit closing events.
            # Prefer actual token count from API usage; fall back to text-length estimate.
            output_tokens = (
                api_output_tokens
                if api_output_tokens is not None
                else estimate_tokens(final_output)
            )
            tps = output_tokens / elapsed if elapsed > 0 else 0
            yield {
                "type": "speed",
                "ttft_ms": round((ttft or 0) * 1000),
                "tps": round(tps, 1),
                "tokens": output_tokens,
            }
            yield {"type": "citations", "citations": self.tool_ctx.collected_citations}
            yield {"type": "done"}
            state.phase = "done"

    async def _exec_call_tools(
        self, instruction: CallToolsInstruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:

        tool_calls = instruction.tool_calls

        for tc in tool_calls:
            # Don't show a "calling tool" UI event for cache hits — the result is
            # already in the message history from a previous step.
            is_cached = state.is_tool_cached(tc["name"], tc.get("arguments", {}))
            if not is_cached:
                yield {
                    "type": "tool_call",
                    "tool": tc["name"],
                    "input": tc["arguments"],
                }
            else:
                state.add_policy_trace(
                    "tool_cache_hit", "duplicate_tool_call_blocked", tc["name"]
                )
                yield {
                    "type": "agent_trace",
                    "event": "tool_cache_hit",
                    "reason": "duplicate_tool_call_blocked",
                    "detail": tc["name"],
                }

        # Resolve each tool call: use cached result if the same tool+args was
        # already executed in this session, otherwise execute normally.
        async def _resolve(tc: dict) -> dict[str, Any]:
            args = tc.get("arguments", {})
            started_at = utcnow()
            started = time.monotonic()
            cache_key = state.tool_cache_key(tc["name"], args)
            if cache_key in state.tool_result_cache:
                logger.debug(
                    "Tool '%s' already called with same args — returning cached result",
                    tc["name"],
                )
                finished_at = utcnow()
                return {
                    "result": state.tool_result_cache[cache_key],
                    "status": "success",
                    "error_message": None,
                    "cache_hit": True,
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "duration_ms": int((time.monotonic() - started) * 1000),
                }
            if state.tool_failure_counts.get(tc["name"], 0) >= 2:
                skip_result = f"[系统已阻止重复调用工具 {tc['name']}：此前已连续失败 2 次，请改用其他工具或直接回答]"
                state.tool_result_cache[cache_key] = skip_result
                state.add_policy_trace(
                    "tool_blocked", "tool_failure_attempt_limit", tc["name"]
                )
                finished_at = utcnow()
                return {
                    "result": skip_result,
                    "status": "blocked",
                    "error_message": "tool_failure_attempt_limit",
                    "cache_hit": False,
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "duration_ms": int((time.monotonic() - started) * 1000),
                }
            try:
                state.tool_call_counts[tc["name"]] = (
                    state.tool_call_counts.get(tc["name"], 0) + 1
                )
                result = await execute_tool(tc, self.tool_ctx)
            except BaseException as exc:
                if isinstance(exc, asyncio.CancelledError):
                    raise
                from app.mcp.client import _exc_msg

                msg = _exc_msg(exc)
                logger.error(
                    "Tool '%s' raised error: %s", tc["name"], msg, exc_info=True
                )
                result = f"[工具 {tc['name']} 调用失败: {msg}]"
                state.tool_failure_counts[tc["name"]] = (
                    state.tool_failure_counts.get(tc["name"], 0) + 1
                )
                status = "error"
                error_message = msg
            else:
                if result.strip().startswith("[工具") and "调用失败" in result:
                    state.tool_failure_counts[tc["name"]] = (
                        state.tool_failure_counts.get(tc["name"], 0) + 1
                    )
                    status = "error"
                    error_message = result[:2000]
                else:
                    state.tool_failure_counts[tc["name"]] = 0
                    status = "success"
                    error_message = None
            state.tool_result_cache[cache_key] = result
            finished_at = utcnow()
            return {
                "result": result,
                "status": status,
                "error_message": error_message,
                "cache_hit": False,
                "started_at": started_at,
                "finished_at": finished_at,
                "duration_ms": int((time.monotonic() - started) * 1000),
            }

        # Record which calls are cache hits BEFORE _resolve runs (after _resolve
        # all keys exist in the cache, making it impossible to distinguish).
        pre_cached: set[str] = {
            tc["name"]
            for tc in tool_calls
            if state.is_tool_cached(tc["name"], tc.get("arguments", {}))
        }

        # Partition into read-only (concurrent) and write (serial) batches,
        # matching Claude Code's isConcurrencySafe() partitioning pattern.
        read_calls = [tc for tc in tool_calls if is_read_only_tool(tc["name"])]
        write_calls = [tc for tc in tool_calls if not is_read_only_tool(tc["name"])]

        read_results = (
            await asyncio.gather(*[_resolve(tc) for tc in read_calls])
            if read_calls
            else []
        )
        write_results: list[dict] = []
        for tc in write_calls:
            write_results.append(await _resolve(tc))

        # Reassemble in original call order for consistent message-history insertion
        _exec_map = {id(tc): r for tc, r in zip(read_calls, read_results)}
        _exec_map.update({id(tc): r for tc, r in zip(write_calls, write_results)})
        results = [_exec_map[id(tc)] for tc in tool_calls]

        for tc, tool_exec in zip(tool_calls, results):
            result = tool_exec["result"]

            # Run post-tool hooks in registration order (P9: hook middleware).
            # Each hook may transform the result and emit SSE events.
            # CitationSummaryHook and DefaultToolResultHook together ensure exactly
            # one tool_result event is emitted per tool call: CitationSummaryHook
            # handles RAG/web_search, DefaultToolResultHook handles everything else.
            # The hooks also handle mind_map, diagram, note_created, mcp_result, and
            # ui_elements — replacing the former if-elif chain.
            _citation_or_default_emitted = False
            for hook in self._post_tool_hooks:
                modified_result, events = hook(tc, result, state, self.tool_ctx)
                if modified_result is not None:
                    result = modified_result
                for event in events:
                    # Prevent double-emitting tool_result when CitationSummaryHook
                    # already produced one — DefaultToolResultHook fires after it.
                    if event.get("type") == "tool_result":
                        if _citation_or_default_emitted:
                            continue
                        _citation_or_default_emitted = True
                    yield event

            state.tool_results.append(result)
            # Layer 1 (microCompact): cap individual tool results in the message-history
            # copy to avoid runaway context growth.  The full result stays in
            # state.tool_results for _build_context in _exec_stream_answer.
            # Limit is per-tool (SkillMeta.max_result_chars); falls back to 3000.
            _DEFAULT_MICRO_COMPACT_LIMIT = 3000
            try:
                from app.skills.registry import skill_registry as _sr

                _skill = _sr.resolve(tc["name"])
                _limit = (
                    _skill.meta.max_result_chars
                    if _skill is not None
                    else _DEFAULT_MICRO_COMPACT_LIMIT
                )
            except Exception:
                _limit = _DEFAULT_MICRO_COMPACT_LIMIT
            # max_result_chars=0 means "never truncate" (e.g. read_skill_guide body)
            if _limit > 0 and len(result) > _limit:
                msg_result = result[:_limit] + "\n…[内容已截断，完整结果已存入上下文]"
            else:
                msg_result = result
            state.messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": msg_result,
                }
            )
            followup_tool = _extract_followup_tool_hint(result)
            result_count = None
            if tc["name"] in {"search_notebook_knowledge", "web_search"}:
                result_count = len(self.tool_ctx.collected_citations or [])
            await record_completed_tool_call(
                self.tool_ctx.db,
                tool_name=tc["name"],
                tool_args=tc.get("arguments", {}),
                tool_result=result,
                status=tool_exec["status"],
                cache_hit=tool_exec["cache_hit"],
                result_count=result_count,
                followup_tool_hint=followup_tool,
                error_message=tool_exec["error_message"],
                metadata={
                    "phase": "tool.execution",  # P8: OTel span hierarchy — distinguishes from tool.blocked_on_user
                    "terminal_tool_called": state.terminal_tool_called,
                    "recommended_next_tool": followup_tool,
                },
                started_at=tool_exec["started_at"],
                finished_at=tool_exec["finished_at"],
                duration_ms=tool_exec["duration_ms"],
            )
            if followup_tool:
                state.recommended_next_tool = followup_tool
                state.add_policy_trace(
                    "mcp_followup", "tool_result_requested_followup", followup_tool
                )
                state.messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"[系统提示] 上一步工具结果明确要求下一步优先使用 `{followup_tool}`。"
                            "不要重复调用刚才的工具。"
                        ),
                    }
                )
                yield {
                    "type": "agent_trace",
                    "event": "mcp_followup",
                    "reason": "tool_result_requested_followup",
                    "detail": followup_tool,
                }
            if not state.needs_verification:
                verify_reason = _verification_reason_for_tool(tc["name"], result)
                if verify_reason:
                    state.needs_verification = True
                    state.verification_reason = verify_reason

        state.pending_tool_calls = []
        state.phase = "tool_result"

        # If any tool in this batch was a cache hit (re-call), inject a reminder
        # into the message history so the next LLM call knows not to repeat it.
        # This is the most reliable way to prevent re-call loops with models that
        # ignore in-result instructions (e.g. "Do NOT call me again").
        if pre_cached:
            names = ", ".join(f"`{n}`" for n in sorted(pre_cached))
            state.messages.append(
                {
                    "role": "user",
                    "content": (
                        f"[系统提示] 工具 {names} 已经调用过，其结果已在上方对话中。"
                        f"请不要再次调用这些工具。根据已有结果，直接调用下一步工具或回答用户。"
                    ),
                }
            )
            yield {
                "type": "agent_trace",
                "event": "tool_cache_guard",
                "reason": "duplicate_tool_calls_removed",
                "detail": ", ".join(sorted(pre_cached)),
            }

    async def _exec_compress_context(
        self, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        """Multi-layer context compression.

        Dispatches to one of two compression layers based on instruction.mode:

        Layer 2 — snipCompact (mode="snip"):
            Fast, no LLM call.  Drops the oldest _SNIP_DROP_COUNT messages from the
            middle section (between system prompt and current turn).  Fires up to
            _MAX_SNIP_PASSES times before escalating to Layer 3.

        Layer 3 — reactiveCompact (mode="summarize"):
            LLM-based summarisation of all middle messages.  One-shot: marks
            state.context_compressed=True so it never fires again in this loop.

        Both layers always preserve:
          - The system message (index 0)
          - The current turn (from the last user message to end of messages)
        """
        # Retrieve the mode from the last instruction that triggered this executor.
        # We cannot pass it as a parameter to _exec_compress_context directly, so we
        # re-derive it from state: if snip_count < _MAX_SNIP_PASSES and tokens are in
        # the snip band, this is a snip pass; otherwise it is a summarize pass.
        # In practice the Brain already decided the mode — we just need to honour it.
        _SNIP_DROP_COUNT = 4  # messages to drop per snip pass
        _SNIP_THRESHOLD = 4000  # must match brain.SNIP_TOKEN_THRESHOLD

        msgs = state.messages
        if len(msgs) <= 6:
            # Not enough history to compress — skip and proceed.
            state.snip_count = max(state.snip_count, 2)  # prevent infinite snip loop
            state.context_compressed = True
            state.phase = "tool_result"
            return
            yield  # pragma: no cover

        system_msg = msgs[0] if msgs[0].get("role") == "system" else None

        # Find the start of the current turn (last user message).
        current_turn_start = 1
        for i in range(len(msgs) - 1, 0, -1):
            if msgs[i].get("role") == "user":
                current_turn_start = i
                break

        tail = msgs[current_turn_start:]
        middle = msgs[1:current_turn_start] if system_msg else msgs[:current_turn_start]

        if not middle:
            state.snip_count = max(state.snip_count, 2)
            state.context_compressed = True
            state.phase = "tool_result"
            return
            yield  # pragma: no cover

        # Determine which layer to run based on current compression state.
        use_snip = (
            state.snip_count < 2
            and state.estimate_tokens()
            <= 8000  # haven't breached LLM compress threshold
        )

        # ── Layer 2: snipCompact ────────────────────────────────────────────
        if use_snip:
            drop_count = min(_SNIP_DROP_COUNT, len(middle))
            kept_middle = middle[drop_count:]
            state.messages = [
                *(([system_msg] if system_msg else [])),
                *kept_middle,
                *tail,
            ]
            state.snip_count += 1
            yield {
                "type": "agent_trace",
                "event": "context_snip",
                "reason": "snip_token_threshold_exceeded",
                "detail": f"dropped={drop_count} snip_pass={state.snip_count} tokens={state.estimate_tokens()}",
            }
            state.phase = "tool_result"
            return
            yield  # pragma: no cover

        # ── Layer 3: reactiveCompact (LLM summarize) ────────────────────────
        from app.providers.llm import get_utility_model as _get_utility_model

        yield {"type": "thought", "content": "context_compress", "is_system": True}
        yield {
            "type": "agent_trace",
            "event": "context_compression",
            "reason": "token_threshold_exceeded",
            "detail": str(state.estimate_tokens()),
        }

        middle_text = "\n".join(
            f"[{m.get('role', '?')}] {str(m.get('content', ''))[:500]}" for m in middle
        )
        compress_prompt = [
            {
                "role": "user",
                "content": (
                    "请将以下对话历史压缩为一段简洁的摘要（200字以内），"
                    "保留关键信息和结论：\n\n" + middle_text[:6000]
                ),
            }
        ]
        llm_started_at = utcnow()
        llm_started = time.monotonic()
        try:
            summary = await self._llm.chat(
                compress_prompt, _get_utility_model(), 0, 300
            )
        except Exception:
            logger.warning("Context compression failed, continuing without compression")
            await record_completed_llm_call(
                self.tool_ctx.db,
                call_type="compress",
                prompt=compress_prompt,
                response={"error": "context_compression_failed"},
                model=_get_utility_model(),
                status="error",
                error_message="context_compression_failed",
                metadata={"message_count": len(middle)},
                input_tokens=estimate_message_tokens(compress_prompt),
                output_tokens=0,
                started_at=llm_started_at,
                finished_at=utcnow(),
                duration_ms=int((time.monotonic() - llm_started) * 1000),
            )
            state.context_compressed = True
            state.phase = "tool_result"
            return
            yield  # pragma: no cover
        await record_completed_llm_call(
            self.tool_ctx.db,
            call_type="compress",
            prompt=compress_prompt,
            response=summary,
            model=_get_utility_model(),
            metadata={"message_count": len(middle)},
            input_tokens=estimate_message_tokens(compress_prompt),
            output_tokens=estimate_tokens(summary),
            started_at=llm_started_at,
            finished_at=utcnow(),
            duration_ms=int((time.monotonic() - llm_started) * 1000),
        )

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

        # Record how long the agent was blocked waiting for human input (P8 OTel span).
        # This is the "tool.blocked_on_user" phase from Claude Code's span hierarchy.
        _approval_started_at = utcnow()
        _approval_t0 = time.monotonic()
        approved = False
        try:
            async with traced_span(
                self.tool_ctx.db,
                "tool.blocked_on_user",
                metadata={
                    "approval_id": approval_id,
                    "tool_names": [tc.get("name", "") for tc in instruction.tool_calls],
                },
            ):
                event = approval_store._events.get(approval_id)
                if event is not None:
                    await asyncio.wait_for(event.wait(), timeout=120.0)
                approved = approval_store.get_result(approval_id)
        except asyncio.TimeoutError:
            approved = False
        finally:
            approval_store.cleanup(approval_id)

        _approval_wait_ms = int((time.monotonic() - _approval_t0) * 1000)
        await record_completed_span(
            self.tool_ctx.db,
            "tool.approval_result",
            status="success" if approved else "rejected",
            metadata={
                "approval_id": approval_id,
                "approved": approved,
                "wait_ms": _approval_wait_ms,
            },
            started_at=_approval_started_at,
            finished_at=utcnow(),
            duration_ms=_approval_wait_ms,
        )

        if approved:
            # Mark each tool call as approved so Brain won't request approval again
            # on the next iteration when it sees the same pending_tool_calls.
            for tc in instruction.tool_calls:
                state.approved_tool_call_ids.add(tc.get("id") or tc.get("name", ""))
            state.pending_tool_calls = instruction.tool_calls
            state.phase = "llm_result"
        else:
            yield {
                "type": "token",
                "content": "\n\n> 工具调用已被拒绝，AI 将直接回答。",
            }
            state.pending_tool_calls = []
            state.phase = (
                "llm_result"  # empty pending → Brain returns StreamAnswerInstruction
            )

    async def _exec_call_rag(
        self, instruction: CallRAGInstruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        from app.agents.rag.graph_retrieval import graph_augmented_context
        from app.agents.rag.retrieval import retrieve_chunks

        async def _time_call(awaitable):
            started_at = utcnow()
            started = time.monotonic()
            try:
                result = await awaitable
            except Exception as exc:
                return (
                    exc,
                    started_at,
                    utcnow(),
                    int((time.monotonic() - started) * 1000),
                )
            return (
                result,
                started_at,
                utcnow(),
                int((time.monotonic() - started) * 1000),
            )

        rag_task = _time_call(
            retrieve_chunks(
                instruction.query,
                self.tool_ctx.notebook_id,
                self.tool_ctx.db,
                global_search=self.tool_ctx.global_search,
                user_id=self.tool_ctx.user_id,
            )
        )
        graph_task = _time_call(
            graph_augmented_context(
                instruction.query,
                self.tool_ctx.notebook_id,
                self.tool_ctx.db,
            )
        )

        (chunks, rag_started_at, rag_finished_at, rag_duration_ms), (
            graph_ctx,
            graph_started_at,
            graph_finished_at,
            graph_duration_ms,
        ) = await asyncio.gather(rag_task, graph_task)

        await record_completed_span(
            self.tool_ctx.db,
            "chat.rag.retrieve",
            status="error" if isinstance(chunks, Exception) else "success",
            metadata={
                "global_search": self.tool_ctx.global_search,
                "query_snapshot": build_text_snapshot(instruction.query),
                "hit_count": 0 if isinstance(chunks, Exception) else len(chunks),
                "source_count": (
                    0
                    if isinstance(chunks, Exception)
                    else len({c.get("source_id") for c in chunks if c.get("source_id")})
                ),
            },
            error_message=str(chunks) if isinstance(chunks, Exception) else None,
            started_at=rag_started_at,
            finished_at=rag_finished_at,
            duration_ms=rag_duration_ms,
        )
        await record_completed_span(
            self.tool_ctx.db,
            "chat.graph.retrieve",
            status="error" if isinstance(graph_ctx, Exception) else "success",
            metadata={
                "global_search": self.tool_ctx.global_search,
                "query_snapshot": build_text_snapshot(instruction.query),
                "output_snapshot": build_text_snapshot(
                    "" if isinstance(graph_ctx, Exception) else graph_ctx
                ),
            },
            error_message=str(graph_ctx) if isinstance(graph_ctx, Exception) else None,
            started_at=graph_started_at,
            finished_at=graph_finished_at,
            duration_ms=graph_duration_ms,
        )

        # Treat unexpected exceptions as empty results
        if isinstance(chunks, Exception):
            logger.warning("retrieve_chunks raised: %s", chunks)
            chunks = []
        if isinstance(graph_ctx, Exception):
            logger.warning("graph_augmented_context raised: %s", graph_ctx)
            graph_ctx = ""

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
            tool_results = [c["content"] for c in chunks]
            self.tool_ctx.collected_citations = state.citations
            state.needs_verification = True
            state.verification_reason = (
                "本轮依赖检索资料，请在回答前核对引用编号、资料内容与最终结论是否一致。"
            )
        else:
            tool_results = []

        # Prepend graph context so the LLM sees structural knowledge first.
        if graph_ctx:
            tool_results.insert(0, graph_ctx)

        state.tool_results = tool_results
        state.phase = "rag_done"
        return
        yield  # pragma: no cover

    async def _exec_verify_result(
        self, instruction: VerifyResultInstruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        """Insert a lightweight verification reminder into the conversation."""
        checklist = [
            f"[系统提示] 请在回答前快速自检，然后直接回答用户的原始问题「{state.query}」：",
            "- 若引用了资料，检查每个关键结论是否都有对应来源支撑；",
            "- 若工具已经生成了结构化结果，不要忽略工具输出后另起一套结论；",
            "- 若依据不足，要明确说明信息缺口，不要假装已经验证完成。",
            "注意：这是系统自检指令，不是用户消息。请勿对此进行回复或确认，直接回答用户问题。",
        ]
        if instruction.reason:
            checklist.insert(1, f"- 额外提醒：{instruction.reason}")

        yield {"type": "thought", "content": "verify", "is_system": True}
        yield {
            "type": "agent_trace",
            "event": "verification",
            "reason": "verification_gate_triggered",
            "detail": instruction.reason,
        }
        await record_completed_span(
            self.tool_ctx.db,
            "chat.verify",
            metadata={"reason": instruction.reason},
        )
        state.messages.append({"role": "user", "content": "\n".join(checklist)})
        state.verification_done = True
        state.needs_verification = False
        state.phase = "tool_result"
        return
        yield  # pragma: no cover

    async def _exec_clarify(
        self, instruction: ClarifyInstruction, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        from app.agents.core.policy import build_clarification_prompt

        prompt = build_clarification_prompt(state.query, state.active_scene)
        state.add_policy_trace(
            "clarify", "query_is_too_ambiguous", instruction.reason or prompt
        )
        yield {
            "type": "agent_trace",
            "event": "clarify",
            "reason": "query_is_too_ambiguous",
            "detail": instruction.reason or prompt,
        }
        yield {"type": "token", "content": prompt}
        yield {"type": "citations", "citations": []}
        yield {"type": "done"}
        state.phase = "done"

    async def _exec_stream_answer(
        self, state: AgentState
    ) -> AsyncGenerator[dict, None]:
        """Text-only streaming answer — used only for the has_tools=False RAG path
        and after terminal tools.  Normal tool-use responses are handled directly
        by _exec_call_llm."""

        clean: list[dict] = [
            m
            for m in state.messages
            if isinstance(m, dict)
            and m.get("role") not in ("tool",)
            and not (m.get("role") == "assistant" and m.get("tool_calls"))
        ]

        if state.tool_results:
            combined = _build_context(
                state.tool_results,
                max_total_chars=state.context_budget_chars,
            )
            last_user = next(
                (
                    i
                    for i in range(len(clean) - 1, -1, -1)
                    if clean[i].get("role") == "user"
                ),
                -1,
            )
            if last_user >= 0:
                clean.insert(
                    last_user,
                    {
                        "role": "user",
                        "content": f"以下是检索到的参考资料：\n\n{combined}",
                    },
                )
                clean.insert(
                    last_user + 1,
                    {
                        "role": "assistant",
                        "content": "好的，我已阅读参考资料，请继续。",
                    },
                )

        # After compression + filtering, the original query may have been lost.
        # Ensure it is always the last user message so the AI knows what to answer.
        if state.query:
            last_msg = clean[-1] if clean else None
            if (
                not last_msg
                or last_msg.get("role") != "user"
                or last_msg.get("content") != state.query
            ):
                clean.append({"role": "user", "content": state.query})

        t0 = time.monotonic()
        token_count = 0
        ttft: float | None = None
        llm_started_at = utcnow()
        output_parts: list[str] = []
        reasoning_parts: list[str] = []

        try:
            async with traced_span(
                self.tool_ctx.db,
                "chat.llm.stream",
                metadata={"thinking_enabled": self.thinking_enabled},
            ):
                async for chunk in self._llm.chat_stream(
                    clean, thinking_enabled=self.thinking_enabled
                ):
                    if chunk.get("type") == "token":
                        token_count += 1
                        output_parts.append(str(chunk.get("content") or ""))
                        if ttft is None:
                            ttft = time.monotonic() - t0
                    elif chunk.get("type") == "reasoning":
                        reasoning_parts.append(str(chunk.get("content") or ""))
                    yield chunk
        except Exception as exc:
            llm_finished_at = utcnow()
            await record_completed_llm_call(
                self.tool_ctx.db,
                call_type="stream_answer",
                prompt=clean,
                response={"error": str(exc)},
                status="error",
                error_message=str(exc),
                metadata={
                    "scene": state.active_scene,
                    "tool_result_count": len(state.tool_results),
                },
                input_tokens=estimate_message_tokens(clean),
                output_tokens=estimate_tokens("".join(output_parts)),
                reasoning_tokens=estimate_tokens("".join(reasoning_parts)),
                ttft_ms=round((ttft or 0) * 1000) if ttft is not None else None,
                started_at=llm_started_at,
                finished_at=llm_finished_at,
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
            logger.error("Stream answer failed: %s", exc)
            yield {
                "type": "error",
                "content": f"AI 服务暂时不可用，请稍后重试。({type(exc).__name__})",
            }
            yield {"type": "done"}
            state.phase = "error"
            return

        elapsed = time.monotonic() - t0
        llm_finished_at = utcnow()
        final_output = "".join(output_parts)
        final_reasoning = "".join(reasoning_parts)
        await record_completed_llm_call(
            self.tool_ctx.db,
            call_type="stream_answer",
            prompt=clean,
            response={"content": final_output, "reasoning": final_reasoning},
            finish_reason="stop",
            metadata={
                "scene": state.active_scene,
                "tool_result_count": len(state.tool_results),
            },
            input_tokens=estimate_message_tokens(clean),
            output_tokens=estimate_tokens(final_output),
            reasoning_tokens=estimate_tokens(final_reasoning),
            ttft_ms=round((ttft or 0) * 1000),
            started_at=llm_started_at,
            finished_at=llm_finished_at,
            duration_ms=int(elapsed * 1000),
        )
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
