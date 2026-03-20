"""
Unified logging configuration for LyraNote API.

Provides clean, colorized log output with:
  - Compact timestamp (HH:MM:SS)
  - Color-coded log levels
  - Suppressed noisy loggers (sqlalchemy echo, httpx, etc.)
"""

import logging
import sys


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


def setup_logging(debug: bool = False) -> None:
    """Configure logging for the entire application."""
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if debug else logging.INFO)

    # Remove existing handlers
    root.handlers.clear()

    # Main handler with color formatter
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(ColorFormatter())
    root.addHandler(handler)

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
