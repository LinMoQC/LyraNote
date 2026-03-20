"""
Cron expression utilities for scheduled tasks.
"""

from datetime import datetime, timezone

from croniter import croniter

SCHEDULE_MAP = {
    "daily": "0 8 * * *",
    "weekly": "0 9 * * 1",
    "biweekly": "0 9 1,15 * *",
    "monthly": "0 9 1 * *",
    "every_3_days": "0 8 */3 * *",
}

SCHEDULE_LABELS = {
    "daily": "每天",
    "weekly": "每周一",
    "biweekly": "每两周",
    "monthly": "每月",
    "every_3_days": "每3天",
}


def parse_schedule(schedule: str) -> str:
    """Convert a preset schedule name to a cron expression. Also accepts raw cron."""
    if schedule in SCHEDULE_MAP:
        return SCHEDULE_MAP[schedule]
    try:
        croniter(schedule)
        return schedule
    except (ValueError, KeyError):
        raise ValueError(f"Invalid schedule: {schedule}")


def schedule_label(schedule: str) -> str:
    """Return a human-readable Chinese label for a schedule."""
    return SCHEDULE_LABELS.get(schedule, schedule)


def next_run_from_cron(cron_expr: str, from_time: datetime | None = None) -> datetime:
    """Calculate the next run time from a cron expression."""
    base = from_time or datetime.now(timezone.utc)
    cron = croniter(cron_expr, base)
    return cron.get_next(datetime).replace(tzinfo=timezone.utc)
