#!/usr/bin/env python3
"""
Interactive mpicheck dashboard server.

Serves the static dashboard AND exposes API endpoints so the browser
can browse files, read source code, and run mpicheck analysis.

Usage:
    python dashboard/server.py          # from project root
    python server.py                    # from dashboard/
"""

import http.server
import json
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
DASHBOARD_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DASHBOARD_DIR.parent

# Directories the browser is allowed to explore
BROWSABLE_DIRS = [
    PROJECT_ROOT / "tests" / "bugs",
    PROJECT_ROOT / "tests" / "clean",
    PROJECT_ROOT / "eval" / "synthetic_npb_corpus",
]

ALLOWED_EXTENSIONS = {".f90", ".f", ".f03", ".f08", ".py", ".md", ".toml"}

# Find a working Python interpreter
PYTHON = sys.executable


def _is_safe_path(requested: Path) -> bool:
    """Ensure the resolved path is inside the project root."""
    try:
        requested.resolve().relative_to(PROJECT_ROOT.resolve())
        return True
    except ValueError:
        return False


def _build_file_tree() -> list:
    """Return a JSON-serialisable file tree for the browsable directories."""
    tree = []
    for base in BROWSABLE_DIRS:
        if not base.exists():
            continue
        rel = base.relative_to(PROJECT_ROOT)
        folder = {
            "name": str(rel).replace("\\", "/"),
            "type": "directory",
            "children": [],
        }
        for child in sorted(base.iterdir()):
            if child.is_file() and child.suffix in ALLOWED_EXTENSIONS:
                folder["children"].append({
                    "name": child.name,
                    "path": str(child.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                    "type": "file",
                    "size": child.stat().st_size,
                })
        tree.append(folder)
    return tree


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------
class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    """Extends SimpleHTTPRequestHandler with API routes."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD_DIR), **kwargs)

    # -- routing ------------------------------------------------------------

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/files":
            self._handle_files()
        elif parsed.path == "/api/file":
            qs = urllib.parse.parse_qs(parsed.query)
            self._handle_file(qs.get("path", [None])[0])
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len else b""

        if parsed.path == "/api/run":
            self._handle_run(body)
        elif parsed.path == "/api/run-tests":
            self._handle_run_tests()
        else:
            self._json_response(404, {"error": "Not found"})

    # -- API handlers -------------------------------------------------------

    def _handle_files(self):
        self._json_response(200, _build_file_tree())

    def _handle_file(self, rel_path):
        if not rel_path:
            self._json_response(400, {"error": "Missing ?path= parameter"})
            return
        target = (PROJECT_ROOT / rel_path).resolve()
        if not _is_safe_path(target) or not target.is_file():
            self._json_response(403, {"error": "Access denied"})
            return
        try:
            content = target.read_text(encoding="utf-8", errors="replace")
            self._json_response(200, {
                "path": rel_path,
                "name": target.name,
                "content": content,
            })
        except Exception as exc:
            self._json_response(500, {"error": str(exc)})

    def _handle_run(self, body):
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json_response(400, {"error": "Invalid JSON"})
            return

        rel_path = payload.get("path")
        if not rel_path:
            self._json_response(400, {"error": "Missing 'path' in body"})
            return

        target = (PROJECT_ROOT / rel_path).resolve()
        if not _is_safe_path(target) or not target.is_file():
            self._json_response(403, {"error": "Access denied"})
            return

        try:
            result = subprocess.run(
                [PYTHON, "-m", "mpicheck.cli", str(target)],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=30,
            )
            self._json_response(200, {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exitCode": result.returncode,
                "file": rel_path,
            })
        except subprocess.TimeoutExpired:
            self._json_response(504, {"error": "Analysis timed out (30s)"})
        except Exception as exc:
            self._json_response(500, {"error": str(exc)})

    def _handle_run_tests(self):
        try:
            result = subprocess.run(
                [PYTHON, "tests/run_tests.py"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=60,
            )
            self._json_response(200, {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exitCode": result.returncode,
            })
        except subprocess.TimeoutExpired:
            self._json_response(504, {"error": "Test run timed out (60s)"})
        except Exception as exc:
            self._json_response(500, {"error": str(exc)})

    # -- helpers ------------------------------------------------------------

    def _json_response(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Keep console tidy — only log errors
        if args and isinstance(args[0], str) and args[0].startswith("4"):
            super().log_message(fmt, *args)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.HTTPServer(("", port), DashboardHandler)
    print(f"  mpicheck dashboard -> http://localhost:{port}")
    print(f"  Project root: {PROJECT_ROOT}")
    print(f"  Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
