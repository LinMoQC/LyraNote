from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.schemas.response import ApiResponse, success
from app.services.monitoring_service import MonitoringService

from .schemas import (
    FailureListOut,
    MonitoringOverviewOut,
    TraceDetailOut,
    TraceListOut,
    WorkerHeartbeatOut,
    WorkloadListOut,
)

router = APIRouter(tags=["monitoring"])


@router.get("/monitoring/overview", response_model=ApiResponse[MonitoringOverviewOut])
async def get_monitoring_overview(
    current_user: CurrentUser,
    db: DbDep,
    window: str = Query("24h"),
):
    _ = current_user
    service = MonitoringService(db)
    return success(await service.overview(window=window))


@router.get("/monitoring/traces", response_model=ApiResponse[TraceListOut])
async def list_monitoring_traces(
    current_user: CurrentUser,
    db: DbDep,
    window: str = Query("24h"),
    type: str | None = Query(None),
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    user_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    generation_id: UUID | None = Query(None),
    task_id: UUID | None = Query(None),
    task_run_id: UUID | None = Query(None),
    notebook_id: UUID | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    _ = current_user
    service = MonitoringService(db)
    return success(await service.list_traces(
        window=window,
        run_type=type,
        status=status,
        cursor=cursor,
        user_id=user_id,
        conversation_id=conversation_id,
        generation_id=generation_id,
        task_id=task_id,
        task_run_id=task_run_id,
        notebook_id=notebook_id,
        limit=limit,
    ))


@router.get("/monitoring/traces/{trace_id}", response_model=ApiResponse[TraceDetailOut])
async def get_monitoring_trace_detail(
    trace_id: str,
    current_user: CurrentUser,
    db: DbDep,
):
    _ = current_user
    service = MonitoringService(db)
    detail = await service.get_trace_detail(trace_id)
    if not detail["runs"]:
        raise NotFoundError("Trace 不存在")
    return success(detail)


@router.get("/monitoring/failures", response_model=ApiResponse[FailureListOut])
async def list_monitoring_failures(
    current_user: CurrentUser,
    db: DbDep,
    window: str = Query("24h"),
    kind: str | None = Query(None),
    user_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    generation_id: UUID | None = Query(None),
    task_id: UUID | None = Query(None),
    task_run_id: UUID | None = Query(None),
    notebook_id: UUID | None = Query(None),
):
    _ = current_user
    service = MonitoringService(db)
    return success(await service.list_failures(
        window=window,
        kind=kind,
        user_id=user_id,
        conversation_id=conversation_id,
        generation_id=generation_id,
        task_id=task_id,
        task_run_id=task_run_id,
        notebook_id=notebook_id,
    ))


@router.get("/monitoring/workers", response_model=ApiResponse[list[WorkerHeartbeatOut]])
async def list_monitoring_workers(
    current_user: CurrentUser,
    db: DbDep,
):
    _ = current_user
    service = MonitoringService(db)
    return success(await service.list_workers())


@router.get("/monitoring/workloads", response_model=ApiResponse[WorkloadListOut])
async def list_monitoring_workloads(
    current_user: CurrentUser,
    db: DbDep,
    kind: str | None = Query(None),
    status: str | None = Query(None),
    user_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    generation_id: UUID | None = Query(None),
    task_id: UUID | None = Query(None),
    task_run_id: UUID | None = Query(None),
    notebook_id: UUID | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    _ = current_user
    service = MonitoringService(db)
    return success(await service.list_workloads(
        kind=kind,
        status=status,
        user_id=user_id,
        conversation_id=conversation_id,
        generation_id=generation_id,
        task_id=task_id,
        task_run_id=task_run_id,
        notebook_id=notebook_id,
        offset=offset,
        limit=limit,
    ))
