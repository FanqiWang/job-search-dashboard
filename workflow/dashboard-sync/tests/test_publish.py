"""Publishing scout results: validation, deduplication and carry-over."""

import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from helpers import make_project, read, run, write

TODAY = date.today()


def role(ident, age=5, **extra):
    return {
        "opportunity_id": ident,
        "employer": "Example Co",
        "title": "ML Engineer",
        "url": f"https://example.org/jobs/{ident}",
        "posted_at": (TODAY - timedelta(days=age)).isoformat(),
        "score_total": 80,
        "scores": {"interest": 20, "capability": 20, "attainability": 20, "role_quality": 20},
        **extra,
    }


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = make_project(Path(self.temp.name))
        self.results = self.root / "results.json"

    def tearDown(self):
        self.temp.cleanup()

    def publish(self, jobs, *extra, **results_fields):
        write(self.results, {"generated_by": "scout-a", "run_id": "run-1", "jobs": jobs, **results_fields})
        result = run("publish.py", self.root, "--results", str(self.results), *extra)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_validation_rules(self):
        jobs = [
            role("ok"),
            role("evergreen", age=90, ongoing_hiring_evidence="Careers page says always hiring"),
            role("old", age=45),
            role("future", age=-2),
            role("low", score_total=60, scores={"interest": 15, "capability": 15, "attainability": 15, "role_quality": 15}),
            role("bad-sum", score_total=95),
            role("too-big", score_total=80, scores={"interest": 30, "capability": 20, "attainability": 20, "role_quality": 10}),
            role("http", url="http://example.org/x"),
            role("ineligible", eligible=False),
            role("undated", posted_at=None),
            {"employer": "No id"},
        ]
        summary = self.publish(jobs, "--write")
        inbox = read(self.root / "data/scout/inbox.json")
        self.assertEqual({j["opportunity_id"] for j in inbox["jobs"]}, {"ok", "evergreen", "undated"})
        self.assertEqual(len(summary["skipped"]), 8)
        self.assertEqual(inbox["generated_by"], "scout-a")
        self.assertTrue(all(j["engine"] == "scout-a" for j in inbox["jobs"]))

    def test_skips_known_and_decided_jobs_and_is_idempotent(self):
        write(self.root / "data/state/dashboard-state.json", {"jobs": [
            {"id": "scout-in-state", "scout": {"opportunity_id": "in-state"}},
            {"id": "manual-1", "url": "https://example.org/jobs/same-url/"},
        ]})
        (self.root / "data/scout/ledger.jsonl").write_text(json.dumps({"opportunity_id": "passed", "status": "User pass"}) + "\n", encoding="utf-8")
        jobs = [role("fresh"), role("in-state"), role("same-url"), role("passed")]
        preview = self.publish(jobs)
        self.assertEqual(preview["new"], 1)
        self.assertFalse((self.root / "data/scout/inbox.json").exists(), "a preview writes nothing")
        self.publish(jobs, "--write")
        self.assertEqual([j["opportunity_id"] for j in read(self.root / "data/scout/inbox.json")["jobs"]], ["fresh"])
        self.assertTrue(self.publish(jobs, "--write")["unchanged"])

    def test_engine_inboxes_are_separate(self):
        write(self.root / "data/scout/inbox.json", {"jobs": [{"opportunity_id": "someone-else"}]})
        self.publish([role("mine")], "--engine", "local.llm_2", "--write")
        self.assertEqual(read(self.root / "data/scout/inbox-local.llm_2.json")["generated_by"], "local.llm_2")
        self.assertEqual(read(self.root / "data/scout/inbox.json")["jobs"], [{"opportunity_id": "someone-else"}])
        bad = run("publish.py", self.root, "--results", str(self.results), "--engine", "a/b")
        self.assertNotEqual(bad.returncode, 0)

    def test_carries_over_unimported_jobs_and_merges_revisions(self):
        stale = role("stale", age=40)
        write(self.root / "data/scout/inbox.json", {
            "jobs": [role("waiting", score_total=75, scores={"interest": 20, "capability": 20, "attainability": 20, "role_quality": 15}), stale],
            "revisions": [{"opportunity_id": "x", "disposition": "below", "review_reason": "old"}],
        })
        summary = self.publish([role("new")], "--write", revisions=[{"opportunity_id": "x", "disposition": "triaged_out"}])
        self.assertEqual(summary["carried_over"], 1)
        self.assertEqual([d["opportunity_id"] for d in summary["dropped_from_previous_inbox"]], ["stale"])
        inbox = read(self.root / "data/scout/inbox.json")
        self.assertEqual([j["opportunity_id"] for j in inbox["jobs"]], ["new", "waiting"], "sorted by score")
        self.assertEqual(inbox["revisions"], [{"opportunity_id": "x", "disposition": "triaged_out"}])

    def test_example_inbox_passes(self):
        example = Path(__file__).resolve().parents[3] / "data/scout/inbox.example.json"
        payload = json.loads(example.read_text(encoding="utf-8"))
        for job in payload["jobs"]:
            job["posted_at"] = TODAY.isoformat()
        write(self.results, payload)
        result = run("publish.py", self.root, "--results", str(self.results))
        self.assertEqual(json.loads(result.stdout)["skipped"], [])

    def test_rejects_a_malformed_results_file(self):
        self.results.write_text('{"no": "jobs"}', encoding="utf-8")
        self.assertNotEqual(run("publish.py", self.root, "--results", str(self.results)).returncode, 0)


if __name__ == "__main__":
    unittest.main()
