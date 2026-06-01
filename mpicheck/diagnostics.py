"""Diagnostic emission with gcc-style formatting and optional color."""
from __future__ import annotations
import json
import os
from typing import List
from .types import Diagnostic


def _supports_color() -> bool:
    """Check if the terminal supports ANSI color codes."""
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    try:
        return os.isatty(1)
    except Exception:
        return False


class DiagnosticCollector:
    def __init__(self, file: str):
        self.file = file
        self.items: List[Diagnostic] = []

    def emit(self, line: int, severity: str, rule: str, message: str) -> None:
        self.items.append(Diagnostic(self.file, line, severity, rule, message))

    def error(self, line: int, rule: str, message: str) -> None:
        self.emit(line, "error", rule, message)

    def warning(self, line: int, rule: str, message: str) -> None:
        self.emit(line, "warning", rule, message)

    def note(self, line: int, rule: str, message: str) -> None:
        self.emit(line, "note", rule, message)

    def has_errors(self) -> bool:
        return any(d.severity == "error" for d in self.items)

    def sorted(self) -> List[Diagnostic]:
        return sorted(self.items, key=lambda d: (d.line, d.severity, d.rule))

    def format_all(self, color: bool = False) -> str:
        if color:
            return "\n".join(_colorize(d) for d in self.sorted())
        return "\n".join(d.format() for d in self.sorted())

    def to_json(self) -> List[dict]:
        return [
            {
                "file": d.file,
                "line": d.line,
                "severity": d.severity,
                "rule": d.rule,
                "message": d.message,
            }
            for d in self.sorted()
        ]


# ── Color helpers ──────────────────────────────────────────────

_RED = "\033[1;31m"
_YELLOW = "\033[1;33m"
_CYAN = "\033[1;36m"
_WHITE = "\033[1;37m"
_DIM = "\033[2m"
_RST = "\033[0m"

_SEV_COLOR = {
    "error": _RED,
    "warning": _YELLOW,
    "note": _CYAN,
}


def _colorize(d: Diagnostic) -> str:
    sc = _SEV_COLOR.get(d.severity, "")
    return (
        f"{_WHITE}{d.file}:{d.line}:{_RST} "
        f"{sc}{d.severity}:{_RST} "
        f"{_DIM}[{d.rule}]{_RST} "
        f"{d.message}"
    )
