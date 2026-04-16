from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.agents.research import deep_research
from app.agents.research.task_manager import collect_web_sources, run_research_task
from app.models import ObservabilityRun, ResearchTask, User


def test_collect_web_sources_dedupes_web_citations() -> None:
    result = collect_web_sources([
        {
            "sub_question": "问题一",
            "citations": [
                {"type": "web", "title": "A", "url": "https://example.com/a", "excerpt": "alpha"},
                {"type": "internal", "title": "B", "url": "internal://b"},
            ],
        },
        {
            "sub_question": "问题二",
            "citations": [
                {"type": "web", "title": "A2", "url": "https://example.com/a", "excerpt": "duplicate"},
                {"type": "web", "title": "C", "url": "https://example.com/c", "excerpt": "charlie"},
            ],
        },
    ])

    assert result == [
        {
            "title": "A",
            "url": "https://example.com/a",
            "excerpt": "alpha",
            "query": "问题一",
        },
        {
            "title": "C",
            "url": "https://example.com/c",
            "excerpt": "charlie",
            "query": "问题二",
        },
    ]


@pytest.mark.asyncio
async def test_run_research_task_marks_task_and_run_error_when_graph_raises(engine, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    user = User(
        id=uuid.uuid4(),
        username="research-error-user",
        email="research-error@example.com",
    )
    task = ResearchTask(
        id=uuid.uuid4(),
        user_id=user.id,
        query="为什么会失败？",
        mode="quick",
        status="running",
    )
    db_session.add_all([user, task])
    await db_session.commit()

    class FailingGraph:
        async def astream_events(self, _input_state, version: str = "v2"):
            if version != "v2":
                raise AssertionError("unexpected stream version")
            raise RuntimeError("graph exploded")
            yield  # pragma: no cover

    monkeypatch.setattr("app.agents.research.task_manager.AsyncSessionLocal", session_factory)
    monkeypatch.setattr("app.providers.llm.get_client", lambda: object())
    monkeypatch.setattr("app.agents.research.deep_research.create_research_graph", lambda **kwargs: FailingGraph())

    await run_research_task(
        task_id=str(task.id),
        query=task.query,
        notebook_id=None,
        conversation_id=None,
        user_id=str(user.id),
        mode="quick",
        model="gpt-test",
        tavily_api_key=None,
        user_memories=[],
    )

    async with session_factory() as check_session:
        persisted_task = await check_session.get(ResearchTask, task.id)
        assert persisted_task is not None
        assert persisted_task.status == "error"
        assert persisted_task.error_message is not None
        assert "graph exploded" in persisted_task.error_message

        persisted_run = await check_session.scalar(
            select(ObservabilityRun)
            .where(ObservabilityRun.task_id == task.id)
            .order_by(ObservabilityRun.started_at.desc())
        )
        assert persisted_run is not None
        assert persisted_run.status == "error"
        assert persisted_run.error_message is not None
        assert "graph exploded" in persisted_run.error_message


@pytest.mark.asyncio
async def test_create_research_graph_parallel_search_nodes_use_isolated_sessions(engine, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    seen_session_ids: list[int] = []
    active_calls = 0
    max_parallelism = 0
    lock = asyncio.Lock()

    async def fake_plan(*args, **kwargs) -> dict:
        return {
            "title": "并行研究",
            "research_goal": "验证 search node 会话隔离",
            "evaluation_criteria": [],
            "search_matrix": {
                "concept": ["问题一", "问题二"],
                "latest": [],
                "evidence": [],
                "controversy": [],
            },
        }

    async def fake_research_one(*, query: str, dimension: str, db, **kwargs):
        nonlocal active_calls, max_parallelism
        async with lock:
            active_calls += 1
            max_parallelism = max(max_parallelism, active_calls)
        seen_session_ids.append(id(db.sync_session))
        await asyncio.sleep(0.01)
        async with lock:
            active_calls -= 1
        return deep_research.Learning(
            sub_question=query,
            content=f"{dimension}:{query}",
            dimension=dimension,
        )

    async def fake_synthesize_report(*args, **kwargs):
        yield "报告正文"

    async def fake_generate_deliverable(*args, **kwargs) -> dict:
        return {
            "title": "交付物",
            "summary": "摘要",
            "next_questions": [],
            "citation_table": [],
            "citation_count": 0,
        }

    monkeypatch.setattr(deep_research, "_plan", fake_plan)
    monkeypatch.setattr(deep_research, "_research_one", fake_research_one)
    monkeypatch.setattr(deep_research, "_synthesize_report", fake_synthesize_report)
    monkeypatch.setattr(deep_research, "_generate_deliverable", fake_generate_deliverable)

    graph = deep_research.create_research_graph(
        db=db_session,
        client=object(),  # type: ignore[arg-type]
        tavily_api_key=None,
        db_session_factory=session_factory,
    )

    input_state = {
        "query": "测试并行 search node",
        "notebook_id": None,
        "user_id": str(uuid.uuid4()),
        "model": "gpt-test",
        "tavily_api_key": None,
        "user_memories": [],
        "mode": "quick",
        "clarification_context": None,
        "report_title": "",
        "research_goal": "",
        "evaluation_criteria": [],
        "search_matrix": {},
        "learnings": [],
        "full_report": "",
        "deliverable": None,
    }

    events = [event async for event in graph.astream_events(input_state, version="v2")]

    assert any(event["event"] == "on_custom_event" and event["name"] == "learning" for event in events)
    assert max_parallelism >= 2
    assert len(seen_session_ids) == 2
    assert len(set(seen_session_ids)) == 2
    assert id(db_session.sync_session) not in seen_session_ids
