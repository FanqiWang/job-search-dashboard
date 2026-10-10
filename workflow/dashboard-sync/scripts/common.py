"""Helpers shared by publish.py and sync_decisions.py. Standard library only."""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

STATE_FILE = Path("data/state/dashboard-state.json")
LEDGER_FILE = Path("data/scout/ledger.jsonl")
SCOUT_DIR = Path("data/scout")

# Engine names become part of a file name (inbox-<engine>.json).
ENGINE_RE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")

# Ledger statuses that mean you already made a decision about a job, so a
# scout should not suggest it again.
DECIDED_STATUSES = {"In review", "Later", "User pass", "Applied", "Closed (user)"}


def valid_engine(name: str | None) -> bool:
    return name is None or bool(ENGINE_RE.match(name))


def inbox_path(root: Path, engine: str | None) -> Path:
    """data/scout/inbox.json, or data/scout/inbox-<engine>.json when an engine is named."""
    return root / SCOUT_DIR / (f"inbox-{engine}.json" if engine else "inbox.json")


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def write_json_atomic(path: Path, payload: dict) -> None:
    """Write to a temporary file first, so a crash never leaves half a file behind."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.stem + "-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def read_ledger(path: Path) -> dict[str, dict]:
    """The latest ledger event for each opportunity_id."""
    latest: dict[str, dict] = {}
    if path.exists():
        with path.open("r", encoding="utf-8-sig") as handle:
            for line in handle:
                if line.strip():
                    event = json.loads(line)
                    ident = event.get("opportunity_id")
                    if ident:
                        latest[str(ident)] = event
    return latest


def canonical_url(value: str | None) -> str:
    """https URL without query, fragment or trailing slash; empty if not https."""
    parts = urlsplit(value or "")
    if parts.scheme != "https" or not parts.netloc:
        return ""
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def dashboard_job_id(opportunity_id: str) -> str:
    """The id the dashboard gives an imported job (see scoutJobId in app/js/inbox.js)."""
    return "scout-" + re.sub(r"[^a-zA-Z0-9_-]", "-", str(opportunity_id or ""))
