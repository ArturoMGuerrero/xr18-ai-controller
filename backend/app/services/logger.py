"""Structured logging configuration"""

import logging
import logging.handlers
import json
from pathlib import Path
from typing import Any, Dict
from datetime import datetime


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON"""
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields if present
        if hasattr(record, "context"):
            log_data["context"] = record.context

        return json.dumps(log_data)


def setup_logging(
    log_level: str = "INFO",
    log_dir: str = "backend/logs",
    max_bytes: int = 10 * 1024 * 1024,  # 10 MB
    backup_count: int = 5
) -> logging.Logger:
    """
    Setup structured logging with file rotation

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: Directory for log files
        max_bytes: Maximum size of log file before rotation
        backup_count: Number of backup files to keep

    Returns:
        Configured logger instance
    """
    # Create logs directory
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    # Create logger
    logger = logging.getLogger("xr18_ai_controller")
    logger.setLevel(getattr(logging, log_level.upper()))

    # Remove existing handlers to avoid duplicates
    logger.handlers.clear()

    # Console handler (human-readable)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    # File handler with rotation (JSON structured)
    file_handler = logging.handlers.RotatingFileHandler(
        log_path / "app.log",
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(JSONFormatter())
    logger.addHandler(file_handler)

    # Error file handler (errors only)
    error_handler = logging.handlers.RotatingFileHandler(
        log_path / "errors.log",
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(JSONFormatter())
    logger.addHandler(error_handler)

    # Don't propagate to root logger
    logger.propagate = False

    return logger


def log_with_context(logger: logging.Logger, level: str, message: str, **context):
    """
    Log message with structured context

    Args:
        logger: Logger instance
        level: Log level (debug, info, warning, error, critical)
        message: Log message
        **context: Additional context fields
    """
    log_func = getattr(logger, level.lower())

    # Create LogRecord with context
    extra = {"context": context} if context else {}
    log_func(message, extra=extra)


# Global logger instance
logger: logging.Logger = None


def get_logger() -> logging.Logger:
    """Get or create global logger instance"""
    global logger
    if logger is None:
        logger = setup_logging()
    return logger


def log_osc_message(logger: logging.Logger, direction: str, address: str, *args):
    """
    Log OSC message with structured format

    Args:
        logger: Logger instance
        direction: 'send' or 'receive'
        address: OSC address path
        *args: OSC message arguments
    """
    log_with_context(
        logger,
        "debug",
        f"OSC {direction}: {address}",
        direction=direction,
        osc_address=address,
        osc_args=args
    )


def log_mixer_event(logger: logging.Logger, event_type: str, **details):
    """
    Log mixer-related event

    Args:
        logger: Logger instance
        event_type: Type of event (connection, disconnection, error, etc.)
        **details: Event details
    """
    log_with_context(
        logger,
        "info",
        f"Mixer event: {event_type}",
        event_type=event_type,
        **details
    )


def log_ai_decision(logger: logging.Logger, channel: int, action: str, **details):
    """
    Log AI decision

    Args:
        logger: Logger instance
        channel: Channel number
        action: Action taken (reduce, increase, maintain)
        **details: Decision details (reason, confidence, etc.)
    """
    log_with_context(
        logger,
        "info",
        f"AI decision: Channel {channel} - {action}",
        channel=channel,
        action=action,
        **details
    )
