"""
Unified logging configuration for LyraNote API.

Provides clean, colorized log output with:
  - Compact timestamp (HH:MM:SS)
  - Color-coded log levels
  - Suppressed noisy loggers (sqlalchemy echo, httpx, etc.)
  - Daily rotating file logs written to apps/api/logs/YYYY-MM-DD.log

When debug=False (production), file output uses structured JSON format
so logs can be ingested by Loki / Datadog / any log aggregator.
"""

import json as _json
import logging
import sys
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path


class ColorFormatter(logging.Formatter):
    """Formatter that adds ANSI colors based on log level."""

    COLORS = {
        logging.DEBUG:    "\033[2m",       # dim
        logging.INFO:     "\033[36m",      # cyan
        logging.WARNING:  "\033[33m",      # yellow
        logging.ERROR:    "\033[31m",      # red
        logging.CRITICAL: "\033[1;31m",    # bold red
    }
    RESET = "\033[0m"
    DIM = "\033[2m"

    LEVEL_SYMBOLS = {
        logging.DEBUG:    "·",
        logging.INFO:     "›",
        logging.WARNING:  "⚠",
        logging.ERROR:    "✘",
        logging.CRITICAL: "✘",
    }

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelno, "")
        symbol = self.LEVEL_SYMBOLS.get(record.levelno, "›")
        ts = self.formatTime(record, "%H:%M:%S")

        name = record.name
        if name.startswith("app."):
            name = name[4:]

        msg = record.getMessage()

        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        exc = f"\n{record.exc_text}" if record.exc_text else ""

        return (
            f"{self.DIM}{ts}{self.RESET} "
            f"{color}{symbol}{self.RESET} "
            f"{color}{msg}{self.RESET}"
            f"{self.DIM}  ({name}){self.RESET}"
            f"{exc}"
        )


class PlainFormatter(logging.Formatter):
    """Plain text formatter for file output (no ANSI colors)."""

    _ANSI_RE = __import__("re").compile(r"\x1b\[[0-9;]*m")

    LEVEL_SYMBOLS = {
        logging.DEBUG:    "·",
        logging.INFO:     "›",
        logging.WARNING:  "⚠",
        logging.ERROR:    "✘",
        logging.CRITICAL: "✘",
    }

    def format(self, record: logging.LogRecord) -> str:
        symbol = self.LEVEL_SYMBOLS.get(record.levelno, "›")
        ts = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        level = record.levelname.ljust(8)

        name = record.name
        if name.startswith("app."):
            name = name[4:]

        msg = self._ANSI_RE.sub("", record.getMessage())

        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        exc = f"\n{record.exc_text}" if record.exc_text else ""

        return f"{ts} {symbol} {level} {msg}  ({name}){exc}"


class JsonFormatter(logging.Formatter):
    """Structured JSON formatter for production file output.

    Each log line is a single JSON object — compatible with Loki, Datadog,
    and any log aggregation pipeline.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            payload["exc"] = record.exc_text
        return _json.dumps(payload, ensure_ascii=False)


class AccessLogFormatter(logging.Formatter):
    """Compact formatter for uvicorn access logs."""

    DIM = "\033[2m"
    RESET = "\033[0m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"

    def format(self, record: logging.LogRecord) -> str:
        ts = self.formatTime(record, "%H:%M:%S")
        msg = record.getMessage()

        # Color based on status code
        color = self.DIM
        if " 2" in msg:
            color = self.GREEN
        elif " 4" in msg:
            color = self.YELLOW
        elif " 5" in msg:
            color = self.RED

        return f"{self.DIM}{ts}{self.RESET} {color}{msg}{self.RESET}"


def _make_file_handler(logs_dir: Path, use_json: bool = False) -> TimedRotatingFileHandler:
    """Create a daily file handler: each day gets its own YYYY-MM-DD.log file."""
    import os
    import time

    logs_dir.mkdir(parents=True, exist_ok=True)

    class _DailyHandler(TimedRotatingFileHandler):
        """Variant of TimedRotatingFileHandler that names files YYYY-MM-DD.log
        from the start of each day (instead of writing to api.log and renaming at midnight)."""

        def __init__(self, directory: Path):
            self._logs_dir = directory
            today = datetime.now().strftime("%Y-%m-%d")
            super().__init__(
                filename=str(directory / f"{today}.log"),
                when="midnight",
                backupCount=30,
                encoding="utf-8",
                utc=False,
            )

        def doRollover(self) -> None:
            """At midnight: close current file and open a new one named after today."""
            if self.stream:
                self.stream.close()
                self.stream = None  # type: ignore[assignment]
            today = datetime.now().strftime("%Y-%m-%d")
            self.baseFilename = os.path.abspath(str(self._logs_dir / f"{today}.log"))
            self.stream = self._open()
            self.rolloverAt = self.computeRollover(int(time.time()))

    handler = _DailyHandler(logs_dir)
    handler.setFormatter(JsonFormatter() if use_json else PlainFormatter())
    return handler


def setup_logging(debug: bool = False) -> None:
    """Configure logging for the entire application."""
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if debug else logging.INFO)

    # Remove existing handlers
    root.handlers.clear()

    # Main handler with color formatter (stderr / terminal)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(ColorFormatter())
    root.addHandler(handler)

    # Daily rotating file handler — apps/api/logs/YYYY-MM-DD.log (WARNING+ only)
    # Production: JSON structured format; development: plain text
    logs_dir = Path(__file__).resolve().parent.parent / "logs"
    file_handler = _make_file_handler(logs_dir, use_json=not debug)
    file_handler.setLevel(logging.WARNING)
    root.addHandler(file_handler)

    # Suppress noisy loggers
    for name in [
        "sqlalchemy.engine",
        "sqlalchemy.pool",
        "httpcore",
        "httpx",
        "openai._base_client",
        "hpack",
        "watchfiles",
        "multipart",
        "multipart.multipart",
        "celery.redirected",  # Celery stdout mirror — already has ANSI codes, no useful info
    ]:
        logging.getLogger(name).setLevel(logging.WARNING)

    # Uvicorn access log — use compact format
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_handler = logging.StreamHandler(sys.stderr)
    access_handler.setFormatter(AccessLogFormatter())
    access_logger.addHandler(access_handler)
    access_logger.propagate = False

    # Uvicorn error logger — use our format
    uv_error = logging.getLogger("uvicorn.error")
    uv_error.handlers.clear()
    uv_error.propagate = True

    # Celery logger — reduce noise
    logging.getLogger("celery").setLevel(logging.INFO)
    logging.getLogger("celery.worker.strategy").setLevel(logging.WARNING)
    logging.getLogger("celery.events.state").setLevel(logging.ERROR)
