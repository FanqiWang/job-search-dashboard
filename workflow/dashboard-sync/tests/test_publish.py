"""End-to-end invariants for the shared Dashboard hand-off."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "publish.py"


class PublishTests(unittest.TestCase):
    def test_freshness_decisions_and_engine_isolation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shared = root / "data/scout"
            shared.mkdir(parents=True)
            state_dir = root / "data/state"
            state_dir.mkdir(parents=True)
            today = datetime.now(ZoneInfo("America/New_York")).date()
            checked_at = datetime.now(ZoneInfo("America/New_York")).isoformat()

            def role(ident, age, *, exception=False, evidence=True):
                return {
                    "opportunity_id": ident,
                    "employer": "Example",
                    "title": "Research Scientist",
                    "category": "long_term",
                    "canonical_url": f"https://example.org/jobs/{ident}",
                    "posting_status": "Officially verified",
                    "checked_at": checked_at,
                    "posted_at": (today - timedelta(days=age)).isoformat(),
                    "posting_date_evidence": "official dated page" if evidence else None,
                    "freshness_status": "ongoing_exception" if exception else "new_14d",
                    "ongoing_hiring_evidence": "official evergreen statement" if exception else None,
                    "eligibility_status": "Unknown",
                    "scores": {"interest": 4, "capability": 4, "attainability": 3, "role_quality": 4, "total": 75},
                }

            run = {
                "schema_version": "5.2.3",
                "run_kind": "discovery",
                "run_id": "test-discovery",
                "engine": "codex",
                "checked_at": checked_at,
                "scope": "US",
                "score_contract": {
                    "weights": {k: 0.25 for k in ("interest", "capability", "attainability", "role_quality")},
                    "salary_in_total": False,
                    "display_threshold": 70,
                },
                "long_term": [role("fresh", 5), role("undated-evidence", 8, evidence=False), role("old", 45), role("evergreen", 45, exception=True), role("already", 5), role("user-pass", 5)],
                "bridge": [],
            }
            source = root / "results.json"
            source.write_text(json.dumps(run), encoding="utf-8")
            (state_dir / "dashboard-state.json").write_text(json.dumps({"jobs": [{"id": "scout-already", "url": "https://example.org/jobs/already", "scout": {"opportunity_id": "already"}}]}), encoding="utf-8")
            claude_path = shared / "inbox-claude.json"
            claude_path.write_text('{"jobs":[{"opportunity_id":"claude-only"}]}', encoding="utf-8")
            (shared / "exploring-ledger.jsonl").write_text(json.dumps({"opportunity_id": "user-pass", "status": "User pass", "source": "dashboard"}) + "\n", encoding="utf-8")
            cmd = [sys.executable, str(SCRIPT), "--root", str(root), "--results", str(source)]
            env = dict(os.environ, PYTHONIOENCODING="utf-8")
            preview = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", env=env, check=True)
            self.assertFalse((shared / "inbox-codex.json").exists())
            self.assertEqual(json.loads(preview.stdout)["new_or_current"], 2)
            subprocess.run(cmd + ["--write"], capture_output=True, text=True, encoding="utf-8", env=env, check=True)
            payload = json.loads((shared / "inbox-codex.json").read_text(encoding="utf-8"))
            self.assertEqual({j["opportunity_id"] for j in payload["jobs"]}, {"fresh", "evergreen"})
            self.assertEqual(payload["generated_by"], "codex")
            self.assertEqual(json.loads(claude_path.read_text(encoding="utf-8"))["jobs"][0]["opportunity_id"], "claude-only")
            self.assertEqual(len(json.loads((state_dir / "dashboard-state.json").read_text(encoding="utf-8"))["jobs"]), 1)
            second = subprocess.run(cmd + ["--write"], capture_output=True, text=True, encoding="utf-8", env=env, check=True)
            self.assertTrue(json.loads(second.stdout)["unchanged"])


if __name__ == "__main__":
    unittest.main()
