"""Preview or apply Codex's idempotent Dashboard decision ledger/inbox sync."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


STATUS_MAP = {
    "待浏览": "Shown",
    "待评估": "In review",
    "准备申请": "In review",
    "稍后": "Later",
    "暂不继续": "User pass",
    "已投递": "Applied",
    "已联系": "Applied",
    "面试中": "Applied",
    "Offer": "Applied",
    "已入职": "Applied",
    "已结束": "Closed (user)",
}
TRACKER_CHECK = {"准备申请", "已投递", "已联系", "面试中", "Offer", "已入职", "已结束", "暂不继续"}


def read_json(path: Path):
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def read_ledger(path: Path) -> dict[str, dict]:
    latest = {}
    if path.exists():
        with path.open("r", encoding="utf-8-sig") as handle:
            for line in handle:
                if line.strip():
                    event = json.loads(line)
                    ident = event.get("opportunity_id")
                    if ident:
                        latest[str(ident)] = event
    return latest


def atomic_json(path: Path, payload: dict) -> None:
    fd, name = tempfile.mkstemp(prefix=path.stem + "-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--tracker-synced", action="store_true", help="confirm workbook reconciliation was verified first")
    parser.add_argument("--tracker-added", type=int, default=0)
    parser.add_argument("--tracker-updated", type=int, default=0)
    args = parser.parse_args()
    if args.tracker_added < 0 or args.tracker_updated < 0:
        parser.error("Tracker counts cannot be negative")
    if (args.tracker_added or args.tracker_updated) and not args.tracker_synced:
        parser.error("Tracker counts require --tracker-synced")
    root = args.root.resolve()
    state_path = root / "data/state/dashboard-state.json"
    if not state_path.exists():
        parser.error("Dashboard state file is missing; connect the shared folder in the browser first")
    state = read_json(state_path)
    now = datetime.now(ZoneInfo("America/New_York"))
    ledger_path = root / "data/scout/exploring-ledger.jsonl"
    latest = read_ledger(ledger_path)
    inbox_path = root / "data/scout/inbox-codex.json"
    inbox = read_json(inbox_path) if inbox_path.exists() else None
    revisions = {str(r.get("opportunity_id")): r for r in (inbox or {}).get("revisions", []) if r.get("opportunity_id")}
    seen: dict[str, dict] = {}
    for job in state.get("jobs") or []:
        ident = (job.get("scout") or {}).get("opportunity_id")
        if ident:
            seen[str(ident)] = job
    changes = []
    tracker_candidates = []
    for ident, job in seen.items():
        stage = job.get("status")
        mapped = STATUS_MAP.get(stage)
        scout = job.get("scout") or {}
        review = revisions.get(ident) or {}
        outcome = scout.get("review_outcome") if scout.get("review_disposition") == "withdrawn" else review.get("disposition")
        if stage == "待浏览" and outcome in {"below", "triaged_out"}:
            mapped = "Triaged out" if outcome == "triaged_out" else "Below threshold"
        if not mapped:
            parser.error(f"Unknown Dashboard status for {ident}: {stage}")
        if stage in TRACKER_CHECK:
            tracker_candidates.append({"opportunity_id": ident, "employer": job.get("title"), "role": job.get("detail"), "status": stage, "url": job.get("url")})
        if (latest.get(ident) or {}).get("status") == mapped:
            continue
        changes.append({
            "opportunity_id": ident,
            "status": mapped,
            "stage": stage,
            "decidedAt": job.get("decidedAt"),
            "source": "dashboard",
            "engine": "codex",
            "synced_at": now.isoformat(),
            "canonical_url": job.get("url") or "",
            "employer": job.get("title") or "",
            "title": job.get("detail") or "",
            "review_reason": scout.get("review_reason") or review.get("review_reason"),
        })
    old_jobs = (inbox or {}).get("jobs") or []
    new_jobs = [job for job in old_jobs if str(job.get("opportunity_id")) not in seen]
    removed = len(old_jobs) - len(new_jobs)
    summary = {
        "state_jobs": len(seen),
        "ledger_lines_to_append": len(changes),
        "inbox_entries_to_remove": removed,
        "tracker_candidates_to_check": tracker_candidates,
        "decisions": [{"opportunity_id": c["opportunity_id"], "status": c["stage"], "mapped": c["status"]} for c in changes],
        "tracker_rows_added": args.tracker_added,
        "tracker_rows_updated": args.tracker_updated,
        "write": args.write,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.write:
        return 0
    if tracker_candidates and not args.tracker_synced:
        parser.error("Tracker candidates exist; reconcile and verify workbook first, then pass --tracker-synced")
    if not changes and not removed and not args.tracker_added and not args.tracker_updated:
        return 0
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    if changes:
        # Re-check after any workbook work and immediately before the append.
        latest = read_ledger(ledger_path)
        changes = [c for c in changes if (latest.get(c["opportunity_id"]) or {}).get("status") != c["status"]]
        with ledger_path.open("a", encoding="utf-8", newline="\n") as handle:
            for event in changes:
                handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    if removed and inbox is not None:
        atomic_json(inbox_path, dict(inbox, jobs=new_jobs))
    note_path = root / "data/scout/SYNC" / f"{now.date().isoformat()}_codex_sync.md"
    note_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"## {now:%Y-%m-%d %H:%M} ET · Codex",
        "",
        f"台账新增 {len(changes)} 条；Tracker 新增 {args.tracker_added} 行、更新 {args.tracker_updated} 行；Codex 收件箱移除 {removed} 条。",
        "",
        "| 岗位 | Dashboard 决定 | 台账状态 | 决定日期 |",
        "|---|---|---|---|",
    ]
    for event in changes:
        lines.append(f"| {event['employer']} · {event['title']} | {event['stage']} | {event['status']} | {event.get('decidedAt') or '未记录'} |")
    lines += ["", "搜索和同步不等于已投递。", ""]
    with note_path.open("a", encoding="utf-8", newline="\n") as handle:
        if note_path.stat().st_size == 0:
            handle.write("# Dashboard 决定同步 · Codex\n\n")
        handle.write("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
