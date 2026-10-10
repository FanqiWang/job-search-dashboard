"""Verify decision sync is safe to rerun and does not touch the other engine."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "sync_decisions.py"


class DecisionSyncTests(unittest.TestCase):
    def test_idempotence_and_tracker_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shared = root / "data/scout"
            shared.mkdir(parents=True)
            state_dir = root / "data/state"
            state_dir.mkdir(parents=True)
            state = {"jobs": [
                {"title": "Example A", "detail": "Researcher", "status": "待评估", "url": "https://example.org/a", "scout": {"opportunity_id": "a"}},
                {"title": "Example B", "detail": "Engineer", "status": "已投递", "decidedAt": "2026-09-24", "url": "https://example.org/b", "scout": {"opportunity_id": "b"}},
            ]}
            state_file = state_dir / "dashboard-state.json"
            state_file.write_text(json.dumps(state), encoding="utf-8")
            ledger = shared / "exploring-ledger.jsonl"
            ledger.write_text(json.dumps({"opportunity_id": "a", "status": "In review", "engine": "claude"}) + "\n", encoding="utf-8")
            own = shared / "inbox-codex.json"
            own.write_text(json.dumps({"version": 1, "jobs": [{"opportunity_id": "a"}, {"opportunity_id": "b"}]}), encoding="utf-8")
            other = shared / "inbox-claude.json"
            other.write_text(json.dumps({"jobs": [{"opportunity_id": "b"}]}), encoding="utf-8")
            env = dict(os.environ, PYTHONIOENCODING="utf-8")
            cmd = [sys.executable, str(SCRIPT), "--root", str(root)]

            def invoke(*extra):
                return subprocess.run(cmd + list(extra), capture_output=True, text=True, encoding="utf-8", env=env)

            preview = invoke()
            self.assertEqual(preview.returncode, 0, preview.stderr)
            self.assertEqual(json.loads(preview.stdout)["ledger_lines_to_append"], 1)
            self.assertEqual(json.loads(preview.stdout)["inbox_entries_to_remove"], 2)
            self.assertEqual(invoke("--write").returncode, 2)
            self.assertEqual(len(ledger.read_text(encoding="utf-8").splitlines()), 1)
            written = invoke("--write", "--tracker-synced")
            self.assertEqual(written.returncode, 0, written.stderr)
            self.assertEqual(len(ledger.read_text(encoding="utf-8").splitlines()), 2)
            self.assertEqual(json.loads(own.read_text(encoding="utf-8"))["jobs"], [])
            self.assertEqual(json.loads(other.read_text(encoding="utf-8"))["jobs"], [{"opportunity_id": "b"}])
            self.assertEqual(state, json.loads(state_file.read_text(encoding="utf-8")))
            repeat = invoke()
            self.assertEqual(json.loads(repeat.stdout)["ledger_lines_to_append"], 0)
            self.assertEqual(json.loads(repeat.stdout)["inbox_entries_to_remove"], 0)


if __name__ == "__main__":
    unittest.main()
