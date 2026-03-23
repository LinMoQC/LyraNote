"""
Deep Research Agent — LangGraph StateGraph implementation.

Architecture:
  plan_node → Send(search_node × N, parallel) → synthesis_node → deliverable_node

Each search_node handles one (dimension, query) pair concurrently.
Learnings are auto-merged via Annotated[list, operator.add] state reducer.
SSE events are dispatched via adispatch_custom_event and consumed by the
FastAPI router through graph.astream_events(version="v2").
"""

from __future__ import annotations

import json
import logging
import operator
import re
from dataclasses import dataclass, field
from typing import Annotated, TypedDict
from uuid import UUID

import httpx
from langchain_core.callbacks.manager import adispatch_custom_event
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.core.genui_protocol import GENUI_PROTOCOL_REPORT as _GENUI_PROTOCOL_REPORT


# ── Config ────────────────────────────────────────────────────────────────────

RAG_THRESHOLD = 0.50
MAX_QUERIES_PER_DIM = 2     # cap queries per dimension to avoid runaway cost
LEARNING_MAX_CHARS = 200


@dataclass(frozen=True)
class ModeConfig:
    queries_per_dim: int
    web_results: int
    learning_max_chars: int
    report_words: str
    report_max_tokens: int


MODES: dict[str, ModeConfig] = {
    "quick": ModeConfig(queries_per_dim=2, web_results=4, learning_max_chars=200,
                        report_words="2000-4000", report_max_tokens=8192),
    "deep":  ModeConfig(queries_per_dim=4, web_results=8, learning_max_chars=400,
                        report_words="4000-8000", report_max_tokens=16384),
}

DIMENSION_LABELS: dict[str, str] = {
    "concept": "概念定义",
    "latest": "最新动态",
    "evidence": "实证数据",
    "controversy": "争议反例",
}

# controversy and latest dimensions always also do a web search regardless of RAG quality
WEB_FIRST_DIMS = {"latest", "controversy"}


# ── State ─────────────────────────────────────────────────────────────────────

class ResearchState(TypedDict):
    # ── input ──────────────────────────────────────────────────────────────────
    query: str
    notebook_id: str | None
    user_id: str
    model: str
    tavily_api_key: str | None
    user_memories: list[dict]
    mode: str               # "quick" | "deep"
    clarification_context: list[dict] | None  # [{question, answer}, ...]

    # ── plan_node output ───────────────────────────────────────────────────────
    report_title: str
    research_goal: str
    evaluation_criteria: list[str]
    search_matrix: dict[str, list[str]]

    # ── search_node output (parallel, auto-merged via operator.add) ────────────
    learnings: Annotated[list[dict], operator.add]

    # ── synthesis_node output ─────────────────────────────────────────────────
    full_report: str

    # ── deliverable_node output ───────────────────────────────────────────────
    deliverable: dict | None


# ── Internal data type ────────────────────────────────────────────────────────

@dataclass
class Learning:
    sub_question: str
    content: str
    citations: list[dict] = field(default_factory=list)
    evidence_grade: str = "weak"       # "strong" | "medium" | "weak"
    dimension: str = "concept"         # one of DIMENSION_LABELS keys
    counterpoint: str = ""             # filled by "controversy" dimension

    def to_dict(self) -> dict:
        return {
            "sub_question": self.sub_question,
            "content": self.content,
            "citations": self.citations,
            "evidence_grade": self.evidence_grade,
            "dimension": self.dimension,
            "counterpoint": self.counterpoint,
        }


# ── Utility helpers ───────────────────────────────────────────────────────────

def _strip_fences(raw: str) -> str:
    """Remove markdown code fences from LLM JSON output."""
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()


_JSON_OBJ_RE = re.compile(r'\{[^{}]*\}', re.DOTALL)
_FINDING_RE = re.compile(r'"finding"\s*:\s*"((?:[^"\\]|\\.)*)"', re.DOTALL)
_COUNTERPOINT_RE = re.compile(r'"counterpoint"\s*:\s*"((?:[^"\\]|\\.)*)"', re.DOTALL)
_GREEDY_BOTH_RE = re.compile(
    r'"finding"\s*:\s*"(.+)"\s*,\s*"counterpoint"\s*:\s*"(.*?)"', re.DOTALL
)
_GREEDY_FINDING_ONLY_RE = re.compile(
    r'"finding"\s*:\s*"(.+)"', re.DOTALL
)


_extract_log = logging.getLogger(__name__ + ".extract")


def _try_json_dict(text: str) -> dict | None:
    """Parse *text* as JSON; if the result is a list, unwrap the first element."""
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if isinstance(parsed, list) and parsed:
        parsed = parsed[0]
    return parsed if isinstance(parsed, dict) else None


def _extract_finding(raw: str, max_chars: int = LEARNING_MAX_CHARS) -> tuple[str, str]:
    """Robustly extract finding & counterpoint from LLM output.

    Tries in order:
      1. json.loads on the whole string (handles both object and array)
      2. json.loads on the first {...} found via regex
      3. Strict regex (handles properly escaped quotes)
      4. Greedy regex (handles unescaped internal quotes by backtracking)
      5. Fallback to raw text
    """
    if not raw or not raw.strip():
        return "", ""

    # 1. Full-string JSON parse
    d = _try_json_dict(raw)
    if d:
        finding = str(d.get("finding", "")).strip()
        counterpoint = str(d.get("counterpoint", "")).strip()
        if finding:
            return finding, counterpoint
        # JSON parsed but no "finding" key — fall back to raw
        if counterpoint:
            return raw.strip()[:max_chars], counterpoint
        return raw.strip()[:max_chars], ""

    # 2. Regex-extracted {...} block
    m = _JSON_OBJ_RE.search(raw)
    if m:
        d2 = _try_json_dict(m.group(0))
        if d2:
            finding = str(d2.get("finding", "")).strip()
            counterpoint = str(d2.get("counterpoint", "")).strip()
            if finding:
                return finding, counterpoint
            if counterpoint:
                return raw.strip()[:max_chars], counterpoint
            return raw.strip()[:max_chars], ""

    # 3. Strict regex (handles properly escaped quotes)
    fm = _FINDING_RE.search(raw)
    if fm and len(fm.group(1)) >= 20:
        cp = _COUNTERPOINT_RE.search(raw)
        return fm.group(1)[:max_chars], (cp.group(1) if cp else "")

    # 4. Greedy regex (handles unescaped internal quotes)
    gm = _GREEDY_BOTH_RE.search(raw)
    if gm and len(gm.group(1).strip()) >= 10:
        return gm.group(1).strip()[:max_chars], gm.group(2).strip()
    gm2 = _GREEDY_FINDING_ONLY_RE.search(raw)
    if gm2:
        val = gm2.group(1).strip().rstrip("} \t\n")
        if len(val) >= 10:
            return val[:max_chars], ""

    # 5. Fallback — strip JSON scaffolding and return remaining text
    cleaned = raw.strip().lstrip("{[").removeprefix('"finding"').lstrip('": \t\n')
    cleaned = cleaned.rstrip('}]" \t\n')
    fallback = (cleaned if len(cleaned) >= 5 else raw.strip())[:max_chars]
    if fallback:
        return fallback, ""

    _extract_log.warning("All extraction methods failed, raw=%r", raw[:300])
    return "", ""


def grade_evidence(citations: list[dict]) -> str:
    """Pure-rule evidence grading — no LLM call."""
    n = len(citations)
    has_web = any(c.get("type") == "web" for c in citations)
    has_internal = any(c.get("type") == "internal" for c in citations)
    if n >= 3 and has_web and has_internal:
        return "strong"
    if n >= 2 or (n >= 1 and has_internal):
        return "medium"
    return "weak"


def compute_evidence_strength(learnings: list[dict]) -> str:
    """Aggregate evidence strength across all learnings."""
    total = sum(len(l.get("citations", [])) for l in learnings)
    has_web = any(c.get("type") == "web" for l in learnings for c in l.get("citations", []))
    has_internal = any(c.get("type") == "internal" for l in learnings for c in l.get("citations", []))
    if total >= 6 and has_web and has_internal:
        return "high"
    if total >= 3:
        return "medium"
    return "low"


# ── Web search ────────────────────────────────────────────────────────────────

async def web_search_sync(query: str, tavily_api_key: str, max_results: int = 4) -> list[dict]:
    """Call Tavily synchronously. Does NOT persist sources to DB."""
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(
            "https://api.tavily.com/search",
            json={
                "api_key": tavily_api_key,
                "query": query,
                "max_results": max_results,
                "include_raw_content": False,
                "search_depth": "basic",
            },
        )
        resp.raise_for_status()
        return [
            {
                "title": r.get("title", ""),
                "content": r.get("content", ""),
                "url": r.get("url", ""),
            }
            for r in resp.json().get("results", [])
        ]


# ── Research primitives ───────────────────────────────────────────────────────

async def generate_clarifying_questions(query: str, client: AsyncOpenAI, model: str) -> list[dict]:
    """Generate 4 query-specific clarifying questions with 3 options each."""
    system_prompt = (
        "你是一位研究助手，需要通过几个简短选择题了解用户的研究偏好，以便生成更精准的深度研究报告。\n\n"
        "根据用户的研究主题，生成4个选择题，每题3个选项。问题须涵盖：\n"
        "1. 研究侧重（选项必须与该主题强相关，不可用通用词汇）\n"
        "2. 目标读者（专业研究者 / 行业从业者 / 普通读者）\n"
        "3. 时间维度（最新进展为主 / 历史演进 / 不限）\n"
        "4. 报告风格（综合综述 / 技术深度分析 / 案例驱动）\n\n"
        "要求：\n"
        "- 第1题的选项必须高度贴合研究主题，体现该领域的核心分支或方向\n"
        "- 选项 value 使用简洁英文关键词，label 使用中文\n"
        "- 只返回JSON，不含其他文字\n\n"
        '输出格式：{"questions": [{"question": "...", "options": [{"label": "...", "value": "..."}, ...]}, ...]}'
    )
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"研究主题：{query}"},
            ],
            temperature=0.3,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        raw = _strip_fences((resp.choices[0].message.content or "").strip())
        result = json.loads(raw)
        questions = result.get("questions", [])
        if questions and len(questions) >= 2:
            return questions
    except Exception:
        pass

    return [
        {
            "question": "研究侧重是什么？",
            "options": [
                {"label": "理论原理", "value": "theory"},
                {"label": "实践应用", "value": "practice"},
                {"label": "两者兼顾", "value": "both"},
            ],
        },
        {
            "question": "您的目标读者是？",
            "options": [
                {"label": "专业研究者", "value": "researcher"},
                {"label": "行业从业者", "value": "practitioner"},
                {"label": "普通读者", "value": "general"},
            ],
        },
        {
            "question": "时间维度侧重？",
            "options": [
                {"label": "最新进展（近1年）", "value": "recent"},
                {"label": "历史演进与现状", "value": "history"},
                {"label": "不限时间", "value": "all"},
            ],
        },
        {
            "question": "报告输出风格？",
            "options": [
                {"label": "综合综述", "value": "overview"},
                {"label": "技术深度分析", "value": "technical"},
                {"label": "案例驱动", "value": "case_study"},
            ],
        },
    ]


async def _plan(query: str, client: AsyncOpenAI, model: str, queries_per_dim: int = 2, clarification_context: list[dict] | None = None) -> dict:
    """
    Generate a structured research plan with a 4-dimension search matrix.
    Returns: {research_goal, evaluation_criteria, search_matrix, title}
    """
    n = queries_per_dim
    if n <= 2:
        dim_desc = (
            "- concept（2条）：一条关于核心定义与原理，一条关于分类体系或与相关概念的区别\n"
            "- latest（2条）：一条关于最近一年的重大进展（含具体年份），一条关于技术/产业趋势\n"
            "- evidence（2条）：一条关于权威性能评测/数据对比，一条关于实际应用案例与效果\n"
            "- controversy（2条）：一条关于主要批评与已知局限，一条关于替代方案或竞争技术对比\n\n"
        )
        example_arr = '["查询1", "查询2"]'
    else:
        dim_desc = (
            f"- concept（{n}条）：覆盖核心定义、基本原理、分类体系、与相关概念的深度对比\n"
            f"- latest（{n}条）：覆盖近一年重大进展、技术趋势、产业应用动态、未来展望\n"
            f"- evidence（{n}条）：覆盖权威评测、性能数据、实际案例、效果统计\n"
            f"- controversy（{n}条）：覆盖主要批评、已知局限、替代方案、潜在风险\n\n"
        )
        example_arr = json.dumps([f"查询{i+1}" for i in range(n)], ensure_ascii=False)

    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是一位资深研究规划师，擅长将模糊问题拆解为精准、深度的研究子问题。\n\n"
                    "## 核心要求\n"
                    "1. **深度拆解**：不要简单重复用户的问题，要从不同角度深入挖掘\n"
                    "2. **具体化**：每个查询必须是精确的、可搜索的、包含明确方向的问题\n"
                    "3. **多层次**：涵盖基础原理→应用实践→前沿进展→对比评价等不同深度\n\n"
                    "## 每个维度的查询要求\n"
                    + dim_desc
                    + "## 输出格式\n"
                    "只返回一个JSON对象，不含任何其他文字：\n"
                    '{"title": "研究报告标题（学术风格，10-25字，不要直接复述用户问题，而是提炼出研究主题的本质，例如用户问\'什么是ReAct\'应生成\'ReAct框架：推理与行动的协同机制\'）",'
                    '"research_goal": "一句话描述研究目标（需包含具体研究范围和预期产出）",'
                    '"evaluation_criteria": ["标准1", "标准2", "标准3"],'
                    '"search_matrix": {'
                    f'"concept": {example_arr},'
                    f'"latest": {example_arr},'
                    f'"evidence": {example_arr},'
                    f'"controversy": {example_arr}'
                    "}}"
                ),
            },
            {"role": "user", "content": f"研究主题：{query}" + (
                "\n\n用户研究偏好（请根据以下偏好调整研究侧重、深度和报告风格）：\n"
                + "\n".join(f"- {item['question']}：{item['answer']}" for item in clarification_context if item.get("answer"))
                if clarification_context else ""
            )},
        ],
        temperature=0.4,
        max_tokens=800 if n <= 2 else 1200,
        response_format={"type": "json_object"},
    )
    raw = _strip_fences((resp.choices[0].message.content or "").strip())
    try:
        result = json.loads(raw)
        matrix = result.get("search_matrix", {})
        for dim in ("concept", "latest", "evidence", "controversy"):
            if dim not in matrix or not matrix[dim]:
                matrix[dim] = [query]
        result["search_matrix"] = {k: v[:n] for k, v in matrix.items()}
        return result
    except Exception:
        topic = query
        for prefix in ("请帮我", "帮我", "请", "深入研究一下", "研究一下", "深入研究", "研究",
                        "详细介绍一下", "介绍一下", "介绍", "什么是", "了解一下", "了解",
                        "分析一下", "分析"):
            if topic.startswith(prefix) and len(topic) > len(prefix):
                topic = topic[len(prefix):].strip()
                break
        return {
            "title": topic[:25],
            "research_goal": f"研究：{topic}",
            "evaluation_criteria": ["数据时效性", "来源权威性", "跨来源一致性"],
            "search_matrix": {
                "concept": [f"{topic} 核心定义与原理", f"{topic} 与相关概念的区别"],
                "latest": [f"{topic} 2025年最新进展", f"{topic} 技术趋势与发展方向"],
                "evidence": [f"{topic} 性能评测数据对比", f"{topic} 实际应用案例"],
                "controversy": [f"{topic} 主要批评与局限性", f"{topic} 替代方案对比"],
            },
        }


# Dimension-specific extraction prompts
_DIMENSION_PROMPTS: dict[str, str] = {
    "concept": (
        "从提供的资料中提取该概念的核心定义、原理和机制。"
        '只返回JSON：{"finding": "核心发现（≤150字）", "counterpoint": ""}'
    ),
    "latest": (
        "从提供的资料中提取最新进展，必须注明数据年份。"
        '只返回JSON：{"finding": "最新发现（含年份，≤150字）", "counterpoint": ""}'
    ),
    "evidence": (
        "从资料中提取具体数据、统计数字和实证结论。"
        '只返回JSON：{"finding": "实证发现（含具体数据，≤150字）", "counterpoint": ""}'
    ),
    "controversy": (
        "从资料中提取批评、质疑、风险点和替代观点。这是专门寻找反例的步骤。"
        '只返回JSON：{"finding": "争议概述（≤150字）", "counterpoint": "核心反驳或风险点（≤100字）"}'
    ),
}


async def _research_one(
    query: str,
    dimension: str,
    notebook_id: str | None,
    user_id: str,
    db: AsyncSession,
    client: AsyncOpenAI,
    tavily_api_key: str | None,
    model: str,
    max_web_results: int = 4,
    learning_max_chars: int = LEARNING_MAX_CHARS,
) -> Learning:
    """Research a single (query, dimension) pair with RAG + optional web search."""
    from app.agents.rag.retrieval import retrieve_chunks

    citations: list[dict] = []
    raw_context = ""

    # 1. Internal RAG
    try:
        if notebook_id:
            chunks = await retrieve_chunks(query, notebook_id, db, top_k=5)
        else:
            chunks = await retrieve_chunks(
                query, None, db, top_k=5, global_search=True, user_id=UUID(user_id)
            )
    except Exception:
        chunks = []

    if chunks:
        best_score = max(c.get("score", 0.0) for c in chunks)
        if best_score >= RAG_THRESHOLD:
            raw_context = "\n\n".join(
                f"[来源{i+1}] {c['content']}" for i, c in enumerate(chunks)
            )
            citations = [
                {
                    "source_id": c.get("source_id"),
                    "title": c.get("source_title", ""),
                    "excerpt": c["content"][:120],
                    "type": "internal",
                }
                for c in chunks[:3]
            ]

    # 2. Web search — always for latest/controversy; fallback for others
    if (not raw_context or dimension in WEB_FIRST_DIMS) and tavily_api_key:
        try:
            web_results = await web_search_sync(query, tavily_api_key, max_results=max_web_results)
            if web_results:
                extra = "\n\n".join(
                    f"[网络来源{i+1}] {r['title']}\n{r['content']}"
                    for i, r in enumerate(web_results)
                )
                raw_context = (raw_context + "\n\n" + extra) if raw_context else extra
                citations = citations + [
                    {
                        "url": r["url"],
                        "title": r["title"],
                        "excerpt": r["content"][:120],
                        "type": "web",
                    }
                    for r in web_results[:3]
                ]
        except Exception:
            pass

    if not raw_context:
        return Learning(sub_question=query, content="未找到相关信息", dimension=dimension)

    # 3. Extract learning with dimension-specific prompt
    system_prompt = _DIMENSION_PROMPTS.get(dimension, _DIMENSION_PROMPTS["concept"])
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"查询：{query}\n\n资料：\n{raw_context[:3500]}"},
            ],
            temperature=0.3,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        raw = _strip_fences((resp.choices[0].message.content or "").strip())
        _extract_log.debug("_research_one raw LLM output for %r: %r", query, raw[:300])
        content, counterpoint = _extract_finding(raw, max_chars=learning_max_chars)
    except Exception as exc:
        _extract_log.warning("LLM extraction call failed for %r: %s", query, exc)
        content = raw_context[:learning_max_chars]
        counterpoint = ""

    return Learning(
        sub_question=query,
        content=content,
        citations=citations,
        evidence_grade=grade_evidence(citations),
        dimension=dimension,
        counterpoint=counterpoint,
    )


async def _synthesize_report(
    original_query: str,
    learnings: list[dict],
    client: AsyncOpenAI,
    model: str,
    evaluation_criteria: list[str] | None = None,
    user_memories: list[dict] | None = None,
    report_words: str = "2000-4000",
    report_max_tokens: int = 8192,
):
    """Stream the structured research report token by token."""
    criteria_str = "、".join(evaluation_criteria) if evaluation_criteria else "数据时效性、来源权威性"

    learnings_text = "\n\n".join(
        f"[{DIMENSION_LABELS.get(l.get('dimension', 'concept'), '研究')}] "
        f"查询：{l['sub_question']}\n"
        f"发现 [{l.get('evidence_grade', 'weak')}]：{l['content']}"
        + (f"\n反例/风险：{l['counterpoint']}" if l.get("counterpoint") else "")
        for l in learnings
        if l.get("content") and l.get("content") != "未找到相关信息"
    )

    system_content = (
        "你是一位专业研究报告撰写专家。根据研究发现，撰写结构清晰的中文研究报告。\n\n"
        f"评价标准：{criteria_str}\n\n"
        "## 格式要求\n"
        "- 使用带序号的 ## 二级标题来组织内容（如 ## 1. 标题），共4-6个章节\n"
        "- 章节标题应根据研究主题自然命名，避免生硬套用模板\n"
        "- 报告应包含：背景引入 → 核心发现 → 争议或局限 → 结论与建议，但具体章节名称和数量由你根据内容决定\n"
        "- 关键发现处标注证据等级，格式：[证据：强/中/弱]\n"
        "- 最后一个章节应包含3-5条具体可执行的行动建议（有序列表）\n\n"
        f"字数{report_words}字，使用 Markdown 格式，不要引用来源编号。\n\n"
        "## 严格禁止\n"
        "- 禁止任何问候语、开场白或自我介绍（如\"尊敬的...\"、\"见字如面\"、\"我是...秘书\"等）\n"
        "- 直接从报告正文内容开始，第一行必须是 ## 章节标题或报告主体文字\n\n"
        f"{_GENUI_PROTOCOL_REPORT}"
    )
    # Only inject factual background memories (occupation, research preferences),
    # exclude identity/persona memories (preferred_ai_name, user_role, communication_tone)
    # which cause the report to adopt a letter/greeting format.
    _PERSONA_KEYS = {"preferred_ai_name", "user_role", "communication_tone", "ai_name"}
    if user_memories:
        factual_memories = [
            m for m in user_memories
            if str(m.get("key", "")).strip() not in _PERSONA_KEYS
        ]
        if factual_memories:
            mem_lines = "\n".join(f"  - {m['key']}: {m['value']}" for m in factual_memories)
            system_content += f"\n\n用户背景信息（据此调整报告深度和侧重）：\n{mem_lines}"

    MAX_CONTINUATIONS = 3
    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": f"研究问题：{original_query}\n\n研究发现：\n{learnings_text}"},
    ]

    for _round in range(1 + MAX_CONTINUATIONS):
        accumulated = ""
        finish_reason = None

        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            temperature=0.5,
            max_tokens=report_max_tokens,
        )
        async for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta.content:
                    accumulated += delta.content
                    yield delta.content
                if chunk.choices[0].finish_reason:
                    finish_reason = chunk.choices[0].finish_reason

        if finish_reason != "length":
            break

        messages.append({"role": "assistant", "content": accumulated})
        messages.append({"role": "user", "content": "报告被截断了，请从截断处继续写完，不要重复已写内容。"})


async def _generate_deliverable(
    query: str,
    full_report: str,
    learnings: list[dict],
    client: AsyncOpenAI,
    model: str,
) -> dict:
    """
    Generate the delivery card data in one LLM call:
    title, 200-char summary, citation table (3-5 rows), 3 follow-up questions.
    """
    all_citations_count = sum(len(l.get("citations", [])) for l in learnings)

    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "根据研究报告，生成结构化交付数据。只返回JSON，格式：\n"
                    '{"title": "报告标题（10-20字）",'
                    '"summary": "执行摘要（150-200字，概括核心结论，面向决策者）",'
                    '"next_questions": ["追问1（≤15字）", "追问2", "追问3"],'
                    '"citation_table": ['
                    '{"conclusion": "核心结论（≤30字）", "grade": "strong|medium|weak", "source": "来源名称"}'
                    "]}"
                ),
            },
            {
                "role": "user",
                "content": f"研究问题：{query}\n\n研究报告：\n{full_report[:6000]}",
            },
        ],
        temperature=0.3,
        max_tokens=700,
        response_format={"type": "json_object"},
    )
    raw = _strip_fences((resp.choices[0].message.content or "").strip())
    try:
        result = json.loads(raw)
        result["citation_count"] = all_citations_count
        result["citation_table"] = [
            {
                "conclusion": str(item.get("conclusion", "")),
                "grade": str(item.get("grade", "medium")),
                "source": str(item.get("source", "")),
            }
            for item in result.get("citation_table", [])[:5]
        ]
        result.setdefault("next_questions", [])
        return result
    except Exception:
        return {
            "title": f"{query[:20]} 研究报告",
            "summary": full_report[:200],
            "next_questions": [],
            "citation_table": [],
            "citation_count": all_citations_count,
        }


# ── LangGraph graph factory ───────────────────────────────────────────────────

def create_research_graph(
    db: AsyncSession,
    client: AsyncOpenAI,
    tavily_api_key: str | None,
):
    """
    Build and compile the research StateGraph with injected dependencies.
    Call once per request (db session is request-scoped).
    """

    # ── Nodes ──────────────────────────────────────────────────────────────────

    async def plan_node(state: ResearchState) -> dict:
        cfg = MODES.get(state.get("mode", "quick"), MODES["quick"])
        await adispatch_custom_event("plan", {"status": "planning"})
        plan_result = await _plan(
            state["query"], client, state["model"],
            queries_per_dim=cfg.queries_per_dim,
            clarification_context=state.get("clarification_context"),
        )
        all_queries = [q for qs in plan_result["search_matrix"].values() for q in qs]
        report_title = plan_result.get("title") or state["query"][:25]
        await adispatch_custom_event("plan", {
            "research_goal": plan_result["research_goal"],
            "sub_questions": all_queries,
            "search_matrix": plan_result["search_matrix"],
            "evaluation_criteria": plan_result["evaluation_criteria"],
            "report_title": report_title,
        })
        return {
            "report_title": report_title,
            "research_goal": plan_result["research_goal"],
            "evaluation_criteria": plan_result["evaluation_criteria"],
            "search_matrix": plan_result["search_matrix"],
        }

    async def search_node(state: dict) -> dict:
        """Handles a single (dimension, query) pair. Receives a Send payload (not ResearchState)."""
        cfg = MODES.get(state.get("mode", "quick"), MODES["quick"])
        query: str = state["query"]
        dimension: str = state["dimension"]
        await adispatch_custom_event("searching", {"query": query, "dimension": dimension})
        learning = await _research_one(
            query=query,
            dimension=dimension,
            notebook_id=state["notebook_id"],
            user_id=state["user_id"],
            db=db,
            client=client,
            tavily_api_key=tavily_api_key,
            model=state["model"],
            max_web_results=cfg.web_results,
            learning_max_chars=cfg.learning_max_chars,
        )
        await adispatch_custom_event("learning", {
            "question": query,
            "content": learning.content,
            "citations": learning.citations,
            "evidence_grade": learning.evidence_grade,
            "dimension": learning.dimension,
            "counterpoint": learning.counterpoint,
        })
        return {"learnings": [learning.to_dict()]}

    async def synthesis_node(state: ResearchState) -> dict:
        cfg = MODES.get(state.get("mode", "quick"), MODES["quick"])
        await adispatch_custom_event("writing", {})
        full_report = ""
        async for token in _synthesize_report(
            state["query"],
            state["learnings"],
            client,
            state["model"],
            evaluation_criteria=state.get("evaluation_criteria"),
            user_memories=state.get("user_memories"),
            report_words=cfg.report_words,
            report_max_tokens=cfg.report_max_tokens,
        ):
            await adispatch_custom_event("token", {"token": token})
            full_report += token
        return {"full_report": full_report}

    async def deliverable_node(state: ResearchState) -> dict:
        all_citations = [c for l in state["learnings"] for c in l.get("citations", [])]
        await adispatch_custom_event("done", {"citations": all_citations[:10]})

        d = await _generate_deliverable(
            state["query"],
            state["full_report"],
            state["learnings"],
            client,
            state["model"],
        )
        # Use plan-generated title as primary; deliverable title as fallback
        report_title = state.get("report_title") or d.get("title") or state["query"][:25]
        d["title"] = report_title
        evidence_strength = compute_evidence_strength(state["learnings"])
        await adispatch_custom_event("deliverable", {
            "title": report_title,
            "summary": d.get("summary", ""),
            "citation_count": d.get("citation_count", len(all_citations)),
            "next_questions": d.get("next_questions", []),
            "evidence_strength": evidence_strength,
            "citation_table": d.get("citation_table", []),
        })
        return {"deliverable": d}

    # ── Routing ────────────────────────────────────────────────────────────────

    def route_to_searches(state: ResearchState) -> list[Send]:
        """Fan out: one search_node per (dimension, query) pair, all run in parallel."""
        return [
            Send("search_node", {
                "query": query,
                "dimension": dimension,
                "notebook_id": state["notebook_id"],
                "user_id": state["user_id"],
                "model": state["model"],
                "mode": state.get("mode", "quick"),
            })
            for dimension, queries in state["search_matrix"].items()
            for query in queries
        ]

    # ── Graph assembly ─────────────────────────────────────────────────────────

    builder: StateGraph = StateGraph(ResearchState)
    builder.add_node("plan_node", plan_node)
    builder.add_node("search_node", search_node)
    builder.add_node("synthesis_node", synthesis_node)
    builder.add_node("deliverable_node", deliverable_node)

    builder.add_edge(START, "plan_node")
    builder.add_conditional_edges("plan_node", route_to_searches, ["search_node"])
    builder.add_edge("search_node", "synthesis_node")
    builder.add_edge("synthesis_node", "deliverable_node")
    builder.add_edge("deliverable_node", END)

    return builder.compile()
