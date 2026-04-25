from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import (
    Base,
    Conversation,
    MessageGeneration,
    Notebook,
    ObservabilityLLMCall,
    ObservabilityRun,
    ObservabilitySpan,
    ObservabilityToolCall,
    Source,
    WorkerHeartbeat,
)
from app.services.monitoring_service import (
    classify_worker_status,
    create_observability_run,
    touch_worker_heartbeat,
)


@pytest.mark.asyncio
async def test_trace_middleware_sets_header_without_persisting_http_run(client, db_session) -> None:
    response = await client.get("/api/v1/setup/status")

    assert response.status_code == 200
    assert response.headers["X-Trace-Id"]

    result = await db_session.execute(
        select(ObservabilityRun)
        .where(ObservabilityRun.trace_id == response.headers["X-Trace-Id"])
    )
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_monitoring_api_requires_authentication(client) -> None:
    response = await client.get("/api/v1/monitoring/overview")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_monitoring_endpoints_return_overview_trace_detail_and_workers(
    client,
    db_session,
    auth_headers,
    test_user,
) -> None:
    user, _ = test_user
    trace_id = "trace-monitoring"
    conversation_id = uuid.uuid4()
    generation_id = uuid.uuid4()
    now = datetime.now(UTC) - timedelta(seconds=3)

    conversation = Conversation(
        id=conversation_id,
        user_id=user.id,
        title="Monitoring trace test",
        source="chat",
    )
    db_session.add(conversation)
    await db_session.commit()

    generation = MessageGeneration(
        id=generation_id,
        conversation_id=conversation_id,
        user_message_id=uuid.uuid4(),
        assistant_message_id=uuid.uuid4(),
        user_id=user.id,
        status="completed",
        model="gpt-4o-mini",
    )
    db_session.add(generation)
    await db_session.commit()

    run = await create_observability_run(
        db_session,
        trace_id=trace_id,
        run_type="chat_generation",
        name="chat.generation",
        status="done",
        user_id=user.id,
        conversation_id=conversation_id,
        generation_id=generation_id,
        started_at=now,
        metadata={"scene": "chat", "model": "gpt-4o-mini"},
    )
    run.finished_at = now + timedelta(seconds=2)
    run.duration_ms = 2000
    db_session.add(
        ObservabilitySpan(
            run_id=run.id,
            trace_id=trace_id,
            span_name="chat.llm.stream",
            status="success",
            component="worker",
            span_kind="phase",
            started_at=now,
            finished_at=now + timedelta(seconds=1),
            duration_ms=1000,
            metadata_json={"tokens": 128},
        )
    )
    db_session.add(
        ObservabilityLLMCall(
            run_id=run.id,
            trace_id=trace_id,
            call_type="stream_answer",
            provider="openai",
            model="gpt-4o-mini",
            status="success",
            input_tokens=120,
            output_tokens=48,
            prompt_snapshot={"raw_preview": "prompt", "char_count": 6, "sha256": "abc", "redaction_applied": False, "truncated": False},
            response_snapshot={"raw_preview": "answer", "char_count": 6, "sha256": "def", "redaction_applied": False, "truncated": False},
            started_at=now,
            finished_at=now + timedelta(seconds=2),
            duration_ms=2000,
        )
    )
    db_session.add(
        ObservabilityToolCall(
            run_id=run.id,
            trace_id=trace_id,
            tool_name="search_notebook_knowledge",
            status="success",
            cache_hit=False,
            result_count=3,
            input_snapshot={"raw_preview": "{\"query\":\"test\"}", "char_count": 16, "sha256": "ghi", "redaction_applied": False, "truncated": False},
            output_snapshot={"raw_preview": "3 hits", "char_count": 6, "sha256": "jkl", "redaction_applied": False, "truncated": False},
            started_at=now,
            finished_at=now + timedelta(seconds=1),
            duration_ms=1000,
        )
    )
    db_session.add(
        WorkerHeartbeat(
            component="worker",
            instance_id="worker:test:1",
            hostname="test-host",
            pid=1234,
            status="healthy",
            metadata_json={"queue": "default"},
            last_seen_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    overview_response = await client.get("/api/v1/monitoring/overview", headers=auth_headers)
    assert overview_response.status_code == 200
    overview = overview_response.json()["data"]
    assert overview["chat"]["total"] >= 1

    traces_response = await client.get("/api/v1/monitoring/traces", headers=auth_headers)
    traces_payload = traces_response.json()["data"]
    traces = traces_payload["items"]
    assert any(item["trace_id"] == trace_id for item in traces)
    assert traces_payload["total"] >= 1

    detail_response = await client.get(f"/api/v1/monitoring/traces/{trace_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["trace_id"] == trace_id
    assert detail["runs"][0]["generation_id"] == str(generation_id)
    assert detail["spans"][0]["span_name"] == "chat.llm.stream"
    assert detail["spans"][0]["component"] == "worker"
    assert detail["spans"][0]["span_kind"] == "phase"
    assert detail["llm_calls"][0]["call_type"] == "stream_answer"
    assert detail["tool_calls"][0]["tool_name"] == "search_notebook_knowledge"
    assert detail["summary"]["total_llm_calls"] == 1
    assert detail["summary"]["total_output_tokens"] == 48
    assert detail["summary"]["final_status"] == "succeeded"

    workers_response = await client.get("/api/v1/monitoring/workers", headers=auth_headers)
    workers = workers_response.json()["data"]
    assert workers[0]["component"] == "worker"
    assert workers[0]["status"] == "healthy"


@pytest.mark.asyncio
async def test_monitoring_traces_failures_and_workloads_support_new_trace_fields(
    client,
    db_session,
    auth_headers,
    test_user,
) -> None:
    user, _ = test_user
    conversation = Conversation(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Trace workload conversation",
        source="chat",
    )
    db_session.add(conversation)
    await db_session.flush()

    generation_one = MessageGeneration(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        user_message_id=uuid.uuid4(),
        assistant_message_id=uuid.uuid4(),
        user_id=user.id,
        status="completed",
        model="gpt-4o-mini",
    )
    generation_two = MessageGeneration(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        user_message_id=uuid.uuid4(),
        assistant_message_id=uuid.uuid4(),
        user_id=user.id,
        status="completed",
        model="gpt-4o-mini",
    )
    db_session.add_all([generation_one, generation_two])
    await db_session.flush()

    notebook = Notebook(
        user_id=user.id,
        title="Trace Notebook",
        status="active",
        is_global=False,
        is_system=False,
        is_public=False,
    )
    db_session.add(notebook)
    await db_session.flush()

    source = Source(
        notebook_id=notebook.id,
        title="source.pdf",
        type="pdf",
        status="failed",
        summary="source ingest failed",
        storage_key="notebooks/source.pdf",
    )
    db_session.add(source)
    await db_session.flush()

    shared_started_at = datetime.now(UTC) - timedelta(minutes=5)
    chat_run_one = await create_observability_run(
        db_session,
        trace_id="trace-chat-1",
        run_type="chat_generation",
        name="chat.first",
        status="completed",
        user_id=user.id,
        generation_id=generation_one.id,
        started_at=shared_started_at,
    )
    chat_run_one.finished_at = shared_started_at + timedelta(seconds=3)
    chat_run_one.duration_ms = 3000

    chat_run_two = await create_observability_run(
        db_session,
        trace_id="trace-chat-2",
        run_type="chat_generation",
        name="chat.second",
        status="error",
        user_id=user.id,
        generation_id=generation_two.id,
        started_at=shared_started_at,
    )
    chat_run_two.finished_at = shared_started_at + timedelta(seconds=4)
    chat_run_two.duration_ms = 4000

    ingest_run = await create_observability_run(
        db_session,
        trace_id="trace-source-1",
        run_type="source_ingest",
        name="source.ingest",
        status="failed",
        user_id=user.id,
        task_id=source.id,
        notebook_id=notebook.id,
        started_at=shared_started_at - timedelta(seconds=5),
        metadata={"origin": "upload"},
    )
    ingest_run.finished_at = shared_started_at - timedelta(seconds=1)
    ingest_run.duration_ms = 4000
    db_session.add(
        ObservabilitySpan(
            run_id=ingest_run.id,
            trace_id="trace-source-1",
            span_name="source_ingest.parse",
            status="error",
            component="ingest",
            span_kind="phase",
            started_at=shared_started_at - timedelta(seconds=5),
            finished_at=shared_started_at - timedelta(seconds=3),
            duration_ms=2000,
            error_message="parse failed",
        )
    )
    await db_session.commit()

    first_page = await client.get(
        "/api/v1/monitoring/traces",
        params={"type": "chat_generation", "limit": 1},
        headers=auth_headers,
    )
    assert first_page.status_code == 200
    first_payload = first_page.json()["data"]
    assert first_payload["items"][0]["status"] in {"succeeded", "failed"}
    assert first_payload["next_cursor"]

    second_page = await client.get(
        "/api/v1/monitoring/traces",
        params={"type": "chat_generation", "limit": 1, "cursor": first_payload["next_cursor"]},
        headers=auth_headers,
    )
    assert second_page.status_code == 200
    second_payload = second_page.json()["data"]
    assert second_payload["items"][0]["id"] != first_payload["items"][0]["id"]

    failures_response = await client.get(
        "/api/v1/monitoring/failures",
        params={"kind": "source_ingest", "notebook_id": str(notebook.id)},
        headers=auth_headers,
    )
    failures = failures_response.json()["data"]["items"]
    assert failures[0]["trace_id"] == "trace-source-1"
    assert failures[0]["trace_available"] is True
    assert failures[0]["trace_missing_reason"] is None

    workloads_response = await client.get(
        "/api/v1/monitoring/workloads",
        params={"kind": "source_ingest", "notebook_id": str(notebook.id)},
        headers=auth_headers,
    )
    workloads = workloads_response.json()["data"]
    assert workloads["summary"][0]["kind"] == "source_ingest"
    assert workloads["items"][0]["trace_id"] == "trace-source-1"
    assert workloads["items"][0]["trace_available"] is True
    assert workloads["items"][0]["status"] == "failed"


def test_classify_worker_status_marks_stale_and_down() -> None:
    now = datetime.now(UTC)

    assert classify_worker_status(now - timedelta(seconds=15), stale_after_seconds=30) == "healthy"
    assert classify_worker_status(now - timedelta(seconds=45), stale_after_seconds=30) == "stale"
    assert classify_worker_status(now - timedelta(seconds=75), stale_after_seconds=30) == "down"


@pytest.mark.asyncio
async def test_touch_worker_heartbeat_uses_background_session_for_own_db(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "heartbeat.sqlite3"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    engine = create_async_engine(database_url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr("app.services.monitoring_service.settings.database_url", database_url)

    try:
        heartbeat = await touch_worker_heartbeat(
            "beat",
            metadata={"source": "unit-test"},
            instance_id="beat:test:1",
        )

        assert heartbeat.component == "beat"
        assert heartbeat.instance_id == "beat:test:1"
        assert heartbeat.metadata_json == {"source": "unit-test"}

        async with session_factory() as session:
            result = await session.execute(
                select(WorkerHeartbeat).where(WorkerHeartbeat.instance_id == "beat:test:1")
            )
            stored = result.scalar_one()

        assert stored.component == "beat"
        assert stored.status == "healthy"
        assert stored.metadata_json == {"source": "unit-test"}
    finally:
        await engine.dispose()
