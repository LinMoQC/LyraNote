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
import operator
from dataclasses import dataclass, field
from typing import Annotated, TypedDict
from uuid import UUID

import httpx
from langchain_core.callbacks.manager import adispatch_custom_event
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession


# ── Config ────────────────────────────────────────────────────────────────────

RAG_THRESHOLD = 0.50
MAX_QUERIES_PER_DIM = 2     # cap queries per dimension to avoid runaway cost
LEARNING_MAX_CHARS = 200

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

    # ── plan_node output ───────────────────────────────────────────────────────
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

async def _plan(query: str, client: AsyncOpenAI, model: str) -> dict:
    """
    Generate a structured research plan with a 4-dimension search matrix.
    Returns: {research_goal, evaluation_criteria, search_matrix}
    """
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是一位专业的研究规划师。将研究主题分解为结构化研究计划。\n"
                    "只返回一个JSON对象，不含任何其他文字。格式：\n"
                    '{"research_goal": "一句话描述研究目标",'
                    '"evaluation_criteria": ["评价标准1", "评价标准2", "评价标准3"],'
                    '"search_matrix": {'
                    '"concept": ["概念定义类查询（1条）"],'
                    '"latest": ["最新动态类查询（含年份，1条）"],'
                    '"evidence": ["实证数据类查询（1条）"],'
                    '"controversy": ["争议与反例类查询（1条）"]'
                    "}}"
                ),
            },
            {"role": "user", "content": f"研究主题：{query}"},
        ],
        temperature=0.3,
        max_tokens=500,
    )
    raw = _strip_fences((resp.choices[0].message.content or "").strip())
    try:
        result = json.loads(raw)
        matrix = result.get("search_matrix", {})
        for dim in ("concept", "latest", "evidence", "controversy"):
            if dim not in matrix or not matrix[dim]:
                matrix[dim] = [query]
        # cap per dimension
        result["search_matrix"] = {k: v[:MAX_QUERIES_PER_DIM] for k, v in matrix.items()}
        return result
    except Exception:
        return {
            "research_goal": f"研究：{query}",
            "evaluation_criteria": ["数据时效性", "来源权威性", "跨来源一致性"],
            "search_matrix": {
                "concept": [query],
                "latest": [f"{query} 最新进展 2024"],
                "evidence": [f"{query} 数据统计"],
                "controversy": [f"{query} 批评与争议"],
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
) -> Learning:
    """Research a single (query, dimension) pair with RAG + optional web search."""
    from app.agents.retrieval import retrieve_chunks

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
            web_results = await web_search_sync(query, tavily_api_key)
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
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"查询：{query}\n\n资料：\n{raw_context[:3500]}"},
        ],
        temperature=0.3,
        max_tokens=400,
    )
    raw = _strip_fences((resp.choices[0].message.content or "").strip())
    try:
        parsed = json.loads(raw)
        content = str(parsed.get("finding", raw[:LEARNING_MAX_CHARS]))
        counterpoint = str(parsed.get("counterpoint", ""))
    except Exception:
        content = raw[:LEARNING_MAX_CHARS]
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
        "报告必须严格遵循以下结构（使用 ## 二级标题）：\n"
        "## 背景\n"
        "## 关键发现\n（每条发现后标注证据等级，格式：[证据：强/中/弱]）\n"
        "## 争议与反例\n（汇总所有反例和风险点；如无则写'暂无明显争议'）\n"
        "## 结论与建议\n"
        "## 可行动清单\n（3-5条具体可执行行动项，使用有序列表）\n\n"
        "字数700-1000字，使用 Markdown 格式，不要引用来源编号。"
    )
    if user_memories:
        mem_lines = "\n".join(f"  - {m['key']}: {m['value']}" for m in user_memories)
        system_content += f"\n\n用户背景信息（据此调整报告深度和侧重）：\n{mem_lines}"

    stream = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": f"研究问题：{original_query}\n\n研究发现：\n{learnings_text}"},
        ],
        stream=True,
        temperature=0.5,
        max_tokens=2000,
    )
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


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
                "content": f"研究问题：{query}\n\n研究报告：\n{full_report[:3000]}",
            },
        ],
        temperature=0.3,
        max_tokens=700,
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
        await adispatch_custom_event("plan", {"status": "planning"})
        plan_result = await _plan(state["query"], client, state["model"])
        all_queries = [q for qs in plan_result["search_matrix"].values() for q in qs]
        await adispatch_custom_event("plan", {
            "research_goal": plan_result["research_goal"],
            "sub_questions": all_queries,
            "search_matrix": plan_result["search_matrix"],
            "evaluation_criteria": plan_result["evaluation_criteria"],
        })
        return {
            "research_goal": plan_result["research_goal"],
            "evaluation_criteria": plan_result["evaluation_criteria"],
            "search_matrix": plan_result["search_matrix"],
        }

    async def search_node(state: dict) -> dict:
        """Handles a single (dimension, query) pair. Receives a Send payload (not ResearchState)."""
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
        await adispatch_custom_event("writing", {})
        full_report = ""
        async for token in _synthesize_report(
            state["query"],
            state["learnings"],
            client,
            state["model"],
            evaluation_criteria=state.get("evaluation_criteria"),
            user_memories=state.get("user_memories"),
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
        evidence_strength = compute_evidence_strength(state["learnings"])
        await adispatch_custom_event("deliverable", {
            "title": d.get("title", ""),
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
