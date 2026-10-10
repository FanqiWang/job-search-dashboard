"""Record the decisions you made in the dashboard, and prune handled jobs from the inbox.

Reads data/state/dashboard-state.json (written by the dashboard's folder sync),
appends one line per changed decision to data/scout/ledger.jsonl, and removes
jobs the dashboard has already imported from the inbox file. Safe to run again:
it only appends decisions that changed since the last run.

Without --write it only prints what it would do.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from common import LEDGER_FILE, STATE_FILE, inbox_path, read_json, read_ledger, valid_engine, write_json_atomic

# Dashboard stage -> ledger status.
STATUS_MAP = {
    "To review": "Shown",
    "Evaluating": "In review",
    "Preparing": "In review",
    "Later": "Later",
    "Passed": "User pass",
    "Applied": "Applied",
    "In contact": "Applied",
    "Interviewing": "Applied",
    "Offer": "Applied",
    "Hired": "Applied",
    "Closed": "Closed (user)",
}
# Stages worth copying into a separate application tracker, if you keep one.
APPLICATION_STAGES = {"Preparing", "Applied", "In contact", "Interviewing", "Offer", "Hired", "Closed"}
# How a withdrawn recommendation that is still "To review" is recorded.
WITHDRAWN_STATUS = {"below": "Below threshold", "triaged_out": "Triaged out"}


def ledger_status(job: dict, revisions: dict[str, dict]) -> str | None:
    stage = job.get("status")
    scout = job.get("scout") or {}
    ident = str(scout.get("opportunity_id"))
    if stage == "To review":
        outcome = scout.get("review_outcome") if scout.get("review_disposition") == "withdrawn" else None
        outcome = outcome or (revisions.get(ident) or {}).get("disposition")
        if outcome in WITHDRAWN_STATUS:
            return WITHDRAWN_STATUS[outcome]
    return STATUS_MAP.get(stage)


def plan(root: Path, engine: str | None, now: datetime) -> dict:
    """Work out the changes without writing anything."""
    state = read_json(root / STATE_FILE)
    if state is None:
        raise SystemExit("error: data/state/dashboard-state.json is missing; connect the folder in the dashboard first")
    if state.get("demo"):
        raise SystemExit("error: the dashboard still holds demo data; clear it on the Data page first")
    latest = read_ledger(root / LEDGER_FILE)
    inbox_file = inbox_path(root, engine)
    inbox = read_json(inbox_file)
    revisions = {str(r.get("opportunity_id")): r for r in (inbox or {}).get("revisions", []) if r.get("opportunity_id")}

    seen: dict[str, dict] = {}
    for job in state.get("jobs") or []:
        ident = (job.get("scout") or {}).get("opportunity_id")
        if ident:
            seen[str(ident)] = job

    changes, applications = [], []
    for ident, job in seen.items():
        status = ledger_status(job, revisions)
        if not status:
            raise SystemExit(f"error: unknown dashboard stage for {ident}: {job.get('status')!r}")
        if job.get("status") in APPLICATION_STAGES:
            applications.append(
                {"opportunity_id": ident, "employer": job.get("title"), "role": job.get("detail"), "stage": job.get("status"), "url": job.get("url")}
            )
        if (latest.get(ident) or {}).get("status") == status:
            continue
        scout = job.get("scout") or {}
        changes.append(
            {
                "opportunity_id": ident,
                "status": status,
                "stage": job.get("status"),
                "decided_at": job.get("decidedAt"),
                "source": "dashboard",
                "engine": engine or scout.get("engine") or None,
                "synced_at": now.isoformat(timespec="seconds"),
                "url": job.get("url") or "",
                "employer": job.get("title") or "",
                "title": job.get("detail") or "",
                "review_reason": scout.get("review_reason") or (revisions.get(ident) or {}).get("review_reason") or None,
            }
        )

    old_jobs = (inbox or {}).get("jobs") or []
    kept_jobs = [j for j in old_jobs if str(j.get("opportunity_id")) not in seen]
    return {
        "changes": changes,
        "applications": applications,
        "inbox": inbox,
        "inbox_file": inbox_file,
        "kept_jobs": kept_jobs,
        "removed": len(old_jobs) - len(kept_jobs),
        "state_jobs": len(seen),
    }


def write_sync_note(root: Path, engine: str | None, now: datetime, changes: list[dict], removed: int) -> Path:
    note = root / "data/scout/sync-log" / f"{now.date().isoformat()}.md"
    note.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"## {now:%Y-%m-%d %H:%M}" + (f" · {engine}" if engine else ""),
        "",
        f"{len(changes)} decisions recorded in the ledger; {removed} jobs removed from the inbox.",
        "",
        "| Job | Dashboard stage | Ledger status | Decided on |",
        "|---|---|---|---|",
    ]
    for c in changes:
        lines.append(f"| {c['employer']} · {c['title']} | {c['stage']} | {c['status']} | {c.get('decided_at') or 'not recorded'} |")
    lines += ["", ""]
    new_file = not note.exists()
    with note.open("a", encoding="utf-8", newline="\n") as handle:
        if new_file:
            handle.write("# Dashboard sync log\n\n")
        handle.write("\n".join(lines))
    return note


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, default=Path("."), help="project folder (default: current folder)")
    parser.add_argument("--engine", help="prune data/scout/inbox-<engine>.json instead of inbox.json")
    parser.add_argument("--write", action="store_true", help="append to the ledger and rewrite the inbox")
    args = parser.parse_args()
    if not valid_engine(args.engine):
        parser.error("--engine may only contain letters, digits, '.', '_' and '-' (max 40)")
    root = args.root.resolve()
    now = datetime.now().astimezone()
    p = plan(root, args.engine, now)

    summary = {
        "state_jobs": p["state_jobs"],
        "ledger_lines_to_append": len(p["changes"]),
        "inbox_entries_to_remove": p["removed"],
        "decisions": [{"opportunity_id": c["opportunity_id"], "stage": c["stage"], "status": c["status"]} for c in p["changes"]],
        "applications": p["applications"],
        "write": args.write,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.write or (not p["changes"] and not p["removed"]):
        return 0

    ledger = root / LEDGER_FILE
    ledger.parent.mkdir(parents=True, exist_ok=True)
    if p["changes"]:
        # Re-read just before appending, in case another run wrote in the meantime.
        latest = read_ledger(ledger)
        fresh = [c for c in p["changes"] if (latest.get(c["opportunity_id"]) or {}).get("status") != c["status"]]
        with ledger.open("a", encoding="utf-8", newline="\n") as handle:
            for event in fresh:
                handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    if p["removed"] and p["inbox"] is not None:
        write_json_atomic(p["inbox_file"], dict(p["inbox"], jobs=p["kept_jobs"]))
    write_sync_note(root, args.engine, now, p["changes"], p["removed"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
