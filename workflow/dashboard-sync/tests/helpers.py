"""Shared fixtures: a throwaway project folder and a way to run the scripts."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def make_project(root: Path, state: dict | None = None) -> Path:
    (root / "data/scout").mkdir(parents=True)
    (root / "data/state").mkdir(parents=True)
    if state is not None:
        write(root / "data/state/dashboard-state.json", state)
    return root


def write(path: Path, payload) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ledger_lines(root: Path) -> list[dict]:
    path = root / "data/scout/ledger.jsonl"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []


def run(script: str, root: Path, *extra: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    cmd = [sys.executable, str(SCRIPTS / script), "--root", str(root), *extra]
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", env=env)
