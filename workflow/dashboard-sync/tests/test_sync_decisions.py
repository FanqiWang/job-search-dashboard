"""Decision sync: safe to rerun, and only touches the inbox it is pointed at."""

import json
import tempfile
import unittest
from pathlib import Path

from helpers import ledger_lines, make_project, read, run, write


def job(ident, stage, **extra):
    return {"title": f"Example {ident}", "detail": "Engineer", "status": stage, "url": f"https://example.org/{ident}", "scout": {"opportunity_id": ident}, **extra}


class DecisionSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_idempotent_and_engine_isolated(self):
        state = {"jobs": [job("a", "Evaluating"), job("b", "Applied", decidedAt="2026-09-24"), {"title": "Manual", "status": "Applied"}]}
        make_project(self.root, state)
        (self.root / "data/scout/ledger.jsonl").write_text('{"opportunity_id": "a", "status": "In review"}\n', encoding="utf-8")
        own = self.root / "data/scout/inbox-my-agent.json"
        write(own, {"version": 1, "jobs": [{"opportunity_id": "a"}, {"opportunity_id": "b"}, {"opportunity_id": "new"}]})
        other = self.root / "data/scout/inbox.json"
        write(other, {"jobs": [{"opportunity_id": "b"}]})

        preview = run("sync_decisions.py", self.root, "--engine", "my-agent")
        self.assertEqual(preview.returncode, 0, preview.stderr)
        summary = read_stdout(preview)
        self.assertEqual(summary["ledger_lines_to_append"], 1)
        self.assertEqual(summary["inbox_entries_to_remove"], 2)
        self.assertEqual([a["opportunity_id"] for a in summary["applications"]], ["b"])
        self.assertEqual(len(ledger_lines(self.root)), 1, "a preview writes nothing")

        written = run("sync_decisions.py", self.root, "--engine", "my-agent", "--write")
        self.assertEqual(written.returncode, 0, written.stderr)
        lines = ledger_lines(self.root)
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[1]["status"], "Applied")
        self.assertEqual(lines[1]["engine"], "my-agent")
        self.assertEqual(lines[1]["decided_at"], "2026-09-24")
        self.assertEqual(read(own)["jobs"], [{"opportunity_id": "new"}])
        self.assertEqual(read(other)["jobs"], [{"opportunity_id": "b"}], "other inboxes are untouched")
        self.assertEqual(read(self.root / "data/state/dashboard-state.json"), state, "the dashboard state is read-only")
        self.assertTrue(list((self.root / "data/scout/sync-log").glob("*.md")))

        repeat = read_stdout(run("sync_decisions.py", self.root, "--engine", "my-agent"))
        self.assertEqual(repeat["ledger_lines_to_append"], 0)
        self.assertEqual(repeat["inbox_entries_to_remove"], 0)

    def test_default_inbox_and_every_stage(self):
        stages = ["To review", "Evaluating", "Preparing", "Later", "Passed", "Applied", "In contact", "Interviewing", "Offer", "Hired", "Closed"]
        make_project(self.root, {"jobs": [job(str(i), s) for i, s in enumerate(stages)]})
        write(self.root / "data/scout/inbox.json", {"jobs": [{"opportunity_id": "0"}, {"opportunity_id": "keep"}]})
        result = run("sync_decisions.py", self.root, "--write")
        self.assertEqual(result.returncode, 0, result.stderr)
        statuses = [line["status"] for line in ledger_lines(self.root)]
        self.assertEqual(statuses, ["Shown", "In review", "In review", "Later", "User pass", "Applied", "Applied", "Applied", "Applied", "Applied", "Closed (user)"])
        self.assertEqual(read(self.root / "data/scout/inbox.json")["jobs"], [{"opportunity_id": "keep"}])

    def test_withdrawn_recommendations(self):
        withdrawn = job("w", "To review")
        withdrawn["scout"].update(review_disposition="withdrawn", review_outcome="triaged_out", review_reason="Role closed")
        make_project(self.root, {"jobs": [withdrawn, job("r", "To review")]})
        write(self.root / "data/scout/inbox.json", {"jobs": [], "revisions": [{"opportunity_id": "r", "disposition": "below"}]})
        run("sync_decisions.py", self.root, "--write")
        lines = {line["opportunity_id"]: line for line in ledger_lines(self.root)}
        self.assertEqual(lines["w"]["status"], "Triaged out")
        self.assertEqual(lines["w"]["review_reason"], "Role closed")
        self.assertEqual(lines["r"]["status"], "Below threshold")

    def test_refuses_unknown_stage_demo_data_and_bad_engine_names(self):
        make_project(self.root, {"jobs": [job("x", "Somewhere else")]})
        self.assertNotEqual(run("sync_decisions.py", self.root).returncode, 0)
        write(self.root / "data/state/dashboard-state.json", {"demo": True, "jobs": [job("x", "Applied")]})
        demo = run("sync_decisions.py", self.root, "--write")
        self.assertNotEqual(demo.returncode, 0)
        self.assertIn("demo", demo.stderr)
        self.assertEqual(ledger_lines(self.root), [])
        self.assertNotEqual(run("sync_decisions.py", self.root, "--engine", "../escape").returncode, 0)

    def test_missing_state_file(self):
        make_project(self.root)
        result = run("sync_decisions.py", self.root)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("dashboard-state.json", result.stderr)


def read_stdout(result):
    return json.loads(result.stdout)


if __name__ == "__main__":
    unittest.main()
