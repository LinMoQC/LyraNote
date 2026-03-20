from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.models import ScheduledTask, ScheduledTaskRun
from app.schemas.response import ApiResponse, success
from app.utils.cron import next_run_from_cron
from .schemas import ManualRunOut, TaskCreate, TaskOut, TaskRunOut, TaskUpdate

router = APIRouter(tags=["tasks"])


async def _get_owned_task(db, task_id: UUID, user_id) -> ScheduledTask:
    result = await db.execute(
        select(ScheduledTask).where(ScheduledTask.id == task_id, ScheduledTask.user_id == user_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise NotFoundError("任务不存在")
    return task


@router.post("/tasks", response_model=ApiResponse[TaskOut], status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskCreate, current_user: CurrentUser, db: DbDep):
    from datetime import datetime, timezone
    from app.utils.cron import parse_schedule, next_run_from_cron

    cron_expr = parse_schedule(body.schedule)

    delivery_config: dict = {"method": body.delivery}
    if body.email:
        delivery_config["email"] = body.email
    if body.notebook_id:
        delivery_config["notebook_id"] = body.notebook_id

    parameters: dict = {
        "topic": body.topic,
        "article_style": body.article_style,
        "language": body.language,
    }
    if body.feed_urls:
        parameters["feed_urls"] = [u.strip() for u in body.feed_urls if u.strip()]

    task = ScheduledTask(
        user_id=current_user.id,
        name=body.name,
        description=body.topic,
        task_type="news_digest",
        schedule_cron=cron_expr,
        parameters=parameters,
        delivery_config=delivery_config,
        next_run_at=next_run_from_cron(cron_expr, datetime.now(timezone.utc)),
        enabled=True,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return success(task)


@router.get("/tasks", response_model=ApiResponse[list[TaskOut]])
async def list_tasks(current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(ScheduledTask)
        .where(ScheduledTask.user_id == current_user.id)
        .order_by(ScheduledTask.created_at.desc())
    )
    return success(result.scalars().all())


@router.get("/tasks/{task_id}", response_model=ApiResponse[TaskOut])
async def get_task(task_id: UUID, current_user: CurrentUser, db: DbDep):
    return success(await _get_owned_task(db, task_id, current_user.id))


@router.patch("/tasks/{task_id}", response_model=ApiResponse[TaskOut])
async def update_task(
    task_id: UUID, body: TaskUpdate, current_user: CurrentUser, db: DbDep
):
    task = await _get_owned_task(db, task_id, current_user.id)
    updates = body.model_dump(exclude_none=True)

    if "schedule_cron" in updates:
        from datetime import datetime, timezone
        task.next_run_at = next_run_from_cron(updates["schedule_cron"], datetime.now(timezone.utc))

    for field, value in updates.items():
        setattr(task, field, value)

    if "enabled" in updates and updates["enabled"]:
        task.consecutive_failures = 0

    await db.flush()
    await db.refresh(task)
    return success(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: UUID, current_user: CurrentUser, db: DbDep):
    task = await _get_owned_task(db, task_id, current_user.id)
    await db.delete(task)


@router.post("/tasks/{task_id}/run", response_model=ApiResponse[ManualRunOut])
async def manual_run(task_id: UUID, current_user: CurrentUser, db: DbDep):
    task = await _get_owned_task(db, task_id, current_user.id)
    from app.workers.tasks import execute_scheduled_task
    try:
        execute_scheduled_task.delay(str(task.id))
    except Exception:
        return success(ManualRunOut(status="error", message="任务队列不可用，请稍后重试"))
    return success(ManualRunOut(status="dispatched", message="任务已加入执行队列"))


@router.get("/tasks/{task_id}/runs", response_model=ApiResponse[list[TaskRunOut]])
async def list_task_runs(task_id: UUID, current_user: CurrentUser, db: DbDep):
    await _get_owned_task(db, task_id, current_user.id)
    result = await db.execute(
        select(ScheduledTaskRun)
        .where(ScheduledTaskRun.task_id == task_id)
        .order_by(ScheduledTaskRun.started_at.desc())
        .limit(50)
    )
    return success(result.scalars().all())
