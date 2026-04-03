"""
Regression tests for logging configuration.
"""

from __future__ import annotations

import logging
from datetime import datetime

from app.logging_config import JsonFormatter
from app.trace import bind_trace_context
from app.logging_config import setup_logging


def test_setup_logging_writes_task_info_to_dedicated_file(tmp_path):
    root = logging.getLogger()
    original_handlers = list(root.handlers)
    original_level = root.level

    try:
        setup_logging(debug=True, logs_dir=tmp_path)

        logging.getLogger("app.workers.tasks.scheduler").info("scheduled task dispatched")
        logging.getLogger("app.main").info("api info should stay out")
        logging.getLogger("app.main").warning("api warning should stay in default log")

        today = datetime.now().strftime("%Y-%m-%d")
        default_log = tmp_path / f"{today}.log"
        task_log = tmp_path / f"scheduled-tasks-{today}.log"

        assert task_log.exists()
        assert default_log.exists()

        task_content = task_log.read_text(encoding="utf-8")
        default_content = default_log.read_text(encoding="utf-8")

        assert "scheduled task dispatched" in task_content
        assert "api info should stay out" not in task_content
        assert "api warning should stay in default log" in default_content
        assert "scheduled task dispatched" not in default_content
    finally:
        for handler in list(root.handlers):
            handler.close()
        root.handlers.clear()
        for handler in original_handlers:
            root.addHandler(handler)
        root.setLevel(original_level)


def test_json_formatter_includes_trace_fields() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="app.monitoring",
        level=logging.WARNING,
        pathname=__file__,
        lineno=42,
        msg="worker heartbeat stale",
        args=(),
        exc_info=None,
    )
    record.event = "worker.heartbeat"
    record.duration_ms = 17

    with bind_trace_context("trace-xyz"):
        payload = formatter.format(record)

    assert '"trace_id": "trace-xyz"' in payload
    assert '"event": "worker.heartbeat"' in payload
    assert '"duration_ms": 17' in payload
