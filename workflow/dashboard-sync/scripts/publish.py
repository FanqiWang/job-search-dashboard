"""Validate a scout's results and publish them to the dashboard inbox.

The results file uses the inbox format (see docs/data-formats.md). Each job is
checked before it is published; jobs the dashboard already has, or that you
already decided on (per data/scout/ledger.jsonl), are skipped. Jobs from the
previous inbox that the dashboard has not imported yet are kept if they still
pass the checks.

Without --write it only prints what it would do.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

from common import (
    DECIDED_STATUSES,
    LEDGER_FILE,
    STATE_FILE,
    canonical_url,
    dashboard_job_id,
    inbox_path,
    read_json,
    read_ledger,
    valid_engine,
    write_json_atomic,
)

SCORE_PARTS = ("interest", "capability", "attainability", "role_quality")


def rejection_reason(job: dict, today: date, min_score: float, max_age_days: int) -> str | None:
    """Why a job may not be published, or None if it passes."""
    if not job.get("opportunity_id") or not job.get("employer") or not job.get("title"):
        return "missing opportunity_id, employer or title"
    if not canonical_url(job.get("url")):
        return "missing an https link to the posting"
    if job.get("eligible") is False:
        return "marked as not eligible"
    scores = job.get("scores") or {}
    try:
        parts = [float(scores[k]) for k in SCORE_PARTS]
        total = float(job["score_total"])
    except (KeyError, TypeError, ValueError):
        return "incomplete scores"
    if any(p < 0 or p > 25 for p in parts):
        return "each score part must be between 0 and 25"
    if abs(sum(parts) - total) > 0.5:
        return "score_total is not the sum of the four parts"
    if total < min_score:
        return f"score below {min_score:g}"
    posted = job.get("posted_at")
    if posted:
        try:
            age = (today - date.fromisoformat(str(posted)[:10])).days
        except ValueError:
            return "posted_at is not a YYYY-MM-DD date"
        if age < 0:
            return "posted_at is in the future"
        if age > max_age_days and not job.get("ongoing_hiring_evidence"):
            return f"posted more than {max_age_days} days ago, with no sign it is still open"
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, default=Path("."), help="project folder (default: current folder)")
    parser.add_argument("--results", type=Path, required=True, help="the scout's results, in inbox format")
    parser.add_argument("--engine", help="publish to data/scout/inbox-<engine>.json instead of inbox.json")
    parser.add_argument("--min-score", type=float, default=70, help="lowest total score to publish (default: 70)")
    parser.add_argument("--max-age-days", type=int, default=30, help="oldest posting to publish (default: 30)")
    parser.add_argument("--write", action="store_true", help="replace the inbox file")
    args = parser.parse_args()
    if not valid_engine(args.engine):
        parser.error("--engine may only contain letters, digits, '.', '_' and '-' (max 40)")

    root = args.root.resolve()
    results = read_json(args.results.resolve())
    if not isinstance(results, dict) or not isinstance(results.get("jobs"), list):
        parser.error("the results file must be a JSON object with a 'jobs' list")
    engine_name = args.engine or results.get("generated_by") or ""
    now = datetime.now().astimezone()
    today = now.date()

    state = read_json(root / STATE_FILE, {})
    state_jobs = state.get("jobs") or []
    known_ids = {str((j.get("scout") or {}).get("opportunity_id")) for j in state_jobs if (j.get("scout") or {}).get("opportunity_id")}
    known_urls = {canonical_url(j.get("url")) for j in state_jobs} - {""}
    known_dashboard_ids = {str(j.get("id")) for j in state_jobs}
    decided = {ident for ident, event in read_ledger(root / LEDGER_FILE).items() if event.get("status") in DECIDED_STATUSES}

    def already_known(job: dict) -> bool:
        ident = str(job.get("opportunity_id"))
        return ident in known_ids or dashboard_job_id(ident) in known_dashboard_ids or canonical_url(job.get("url")) in known_urls

    def check(job: dict) -> str | None:
        return rejection_reason(job, today, args.min_score, args.max_age_days)

    accepted: dict[str, dict] = {}
    skipped: list[dict] = []
    for job in results["jobs"]:
        ident = str(job.get("opportunity_id") or "")
        reason = check(job)
        if not reason and ident in decided:
            reason = "you already decided on this job (see the ledger)"
        if not reason and already_known(job):
            reason = "already on the dashboard"
        if reason:
            skipped.append({"opportunity_id": ident or None, "reason": reason})
            continue
        accepted[ident] = {**job, "engine": job.get("engine") or engine_name}

    inbox_file = inbox_path(root, args.engine)
    old = read_json(inbox_file, {}) or {}
    carried, dropped = 0, []
    for job in old.get("jobs") or []:
        ident = str(job.get("opportunity_id") or "")
        if not ident or ident in accepted or ident in decided or already_known(job):
            continue
        reason = check(job)
        if reason:
            dropped.append({"opportunity_id": ident, "reason": reason})
        else:
            accepted[ident] = job
            carried += 1

    jobs = sorted(accepted.values(), key=lambda j: (-float(j["score_total"]), str(j["opportunity_id"])))
    # Revisions from this run replace older ones for the same job.
    revisions = {str(r.get("opportunity_id")): r for r in (old.get("revisions") or []) + (results.get("revisions") or []) if r.get("opportunity_id")}
    revisions_list = list(revisions.values())
    unchanged = old.get("jobs") == jobs and (old.get("revisions") or []) == revisions_list

    summary = {
        "run_id": results.get("run_id"),
        "new": len(jobs) - carried,
        "carried_over": carried,
        "skipped": skipped,
        "dropped_from_previous_inbox": dropped,
        "destination": str(inbox_file),
        "write": args.write,
        "unchanged": unchanged,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.write and not unchanged:
        payload = {
            "version": 1,
            "generated_at": now.isoformat(timespec="seconds"),
            "generated_by": engine_name,
            "run_id": results.get("run_id") or "",
            "jobs": jobs,
            "revisions": revisions_list,
        }
        write_json_atomic(inbox_file, payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
