"""Validate Scout V5 discovery results and publish Codex's Dashboard inbox."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo


def read_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def user_decisions(path: Path) -> set[str]:
    if not path.exists():
        return set()
    decisions = {}
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            if not line.strip():
                continue
            event = json.loads(line)
            ident = event.get("opportunity_id")
            status = event.get("status")
            if ident and status in {"In review", "Later", "User pass", "Applied", "Closed (user)"}:
                decisions[str(ident)] = status
    return set(decisions)


def canonical_url(value: str) -> str:
    p = urlsplit(value or "")
    if p.scheme != "https" or not p.netloc:
        return ""
    return urlunsplit((p.scheme, p.netloc.lower(), p.path.rstrip("/"), "", ""))


def normalized_id(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "-", str(value or ""))


def recent_check(value: str | None, now: datetime) -> bool:
    if not value:
        return False
    try:
        checked = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return False
    return checked.tzinfo is not None and timedelta(0) <= now - checked <= timedelta(hours=48)


def reason_for(role: dict, checked_date: date) -> str | None:
    if not role.get("opportunity_id") or not role.get("employer") or not role.get("title"):
        return "缺少稳定 ID/公司/职位"
    if role.get("category") not in {"long_term", "bridge"}:
        return "缺少长期/过渡类别"
    if not canonical_url(role.get("canonical_url") or role.get("url") or ""):
        return "缺少 HTTPS 官方岗位链接"
    if role.get("posting_status") != "Officially verified":
        return "官网/官方 ATS 开放状态未核实"
    if role.get("eligibility_status") == "Blocked":
        return "硬性资格不符"
    scores = role.get("scores") or {}
    try:
        parts = [float(scores[key]) for key in ("interest", "capability", "attainability", "role_quality")]
        total = float(scores["total"])
    except (KeyError, TypeError, ValueError):
        return "评分字段不完整"
    if any(part < 0 or part > 5 for part in parts) or abs(sum(parts) * 5 - total) > 0.001:
        return "总分与四项等权评分不一致"
    if total < 70:
        return "低于 70 分"
    posted = role.get("posted_at")
    if posted:
        try:
            age = (checked_date - date.fromisoformat(posted)).days
        except (TypeError, ValueError):
            return "发布日期格式错误"
        if age < 0:
            return "发布日期晚于本次检查日"
        if age <= 30 and role.get("posting_date_evidence"):
            return None
        if age <= 30:
            return "缺少发布日期证据"
    if role.get("freshness_status") == "ongoing_exception" and role.get("ongoing_hiring_evidence"):
        return None
    return "超过 30 天或日期未知，且无官网持续招聘证据"


def to_inbox_job(role: dict, run: dict) -> dict:
    salary = role.get("salary") or {}
    status = role.get("eligibility_status") or "Unknown"
    eligibility = status + ("：" + str(role["eligibility_evidence"]) if role.get("eligibility_evidence") else "")
    return {
        "opportunity_id": role["opportunity_id"],
        "employer": role["employer"],
        "title": role["title"],
        "category": role["category"],
        "market": "美国",
        "location": role.get("location") or "",
        "url": role.get("canonical_url") or role.get("url"),
        "score_total": role["scores"]["total"],
        "scores": {key: role["scores"][key] for key in ("interest", "capability", "attainability", "role_quality")},
        "salary_text": salary.get("range") or "未披露",
        "eligibility": eligibility,
        "gap_flags": role.get("gap_flags") or [],
        "engine": run.get("engine") or "codex",
        "posted_at": role.get("posted_at"),
        "posting_date_evidence": role.get("posting_date_evidence"),
        "freshness_status": role.get("freshness_status"),
        "ongoing_hiring_evidence": role.get("ongoing_hiring_evidence"),
        "posting_status": role.get("posting_status"),
        "checked_at": role.get("checked_at"),
        "stale_risk": bool(role.get("stale_risk")),
        "highlight": role.get("highlight") or "",
        "risk": role.get("risk_or_question") or role.get("risk") or "",
        "run_id": run.get("run_id") or "",
        "score_contract": run.get("schema_version") or "",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--write", action="store_true", help="atomically replace Codex's inbox after validation")
    args = parser.parse_args()
    root = args.root.resolve()
    results = args.results.resolve()
    run = read_json(results, None)
    if not isinstance(run, dict):
        parser.error("results.json is missing or invalid")
    if run.get("run_kind", "discovery") != "discovery":
        parser.error("Only completed discovery runs can be published; calibration/smoke runs stay historical")
    if run.get("scope") != "US" or run.get("schema_version") != "5.2.3":
        parser.error("Expected U.S. Scout V5.2.3 results")
    contract = run.get("score_contract") or {}
    if contract.get("salary_in_total") is not False or contract.get("display_threshold") != 70:
        parser.error("Unexpected scoring contract")
    weights = contract.get("weights") or {}
    if any(weights.get(k) != 0.25 for k in ("interest", "capability", "attainability", "role_quality")):
        parser.error("Expected four equally weighted score components")
    state_path = root / "data/state/dashboard-state.json"
    state = read_json(state_path, {})
    state_jobs = state.get("jobs") or []
    state_ids = {str(j.get("scout", {}).get("opportunity_id")) for j in state_jobs if j.get("scout", {}).get("opportunity_id")}
    state_urls = {canonical_url(j.get("url") or "") for j in state_jobs}
    state_urls.discard("")
    state_display_ids = {str(j.get("id")) for j in state_jobs}
    decided_ids = user_decisions(root / "data/scout/exploring-ledger.jsonl")
    inbox_path = root / "data/scout/inbox-codex.json"
    old_inbox = read_json(inbox_path, {"jobs": []})
    now = datetime.now(ZoneInfo("America/New_York"))
    if not recent_check(run.get("checked_at"), now):
        parser.error("The discovery run must have a timezone-aware check within 48 hours; re-verify older results")
    accepted: dict[str, dict] = {}
    skipped: list[dict] = []
    for role in list(run.get("long_term") or []) + list(run.get("bridge") or []):
        reason = None if recent_check(role.get("checked_at"), now) else "该岗位未在最近 48 小时重新核实"
        reason = reason or reason_for(role, now.date())
        if reason:
            skipped.append({"id": role.get("opportunity_id"), "reason": reason})
            continue
        job = to_inbox_job(role, run)
        ident = str(job["opportunity_id"])
        if ident in decided_ids:
            skipped.append({"id": ident, "reason": "探索台账已有用户决定，需单独复核"})
            continue
        if ident in state_ids or canonical_url(job["url"]) in state_urls or "scout-" + normalized_id(ident) in state_display_ids:
            skipped.append({"id": ident, "reason": "Dashboard 已有此岗位"})
            continue
        accepted[ident] = job
    carried = 0
    pending_recheck = []
    for job in old_inbox.get("jobs") or []:
        ident = str(job.get("opportunity_id") or "")
        if not ident or ident in accepted or ident in state_ids or ident in decided_ids or canonical_url(job.get("url") or "") in state_urls:
            continue
        old_role = dict(job, canonical_url=job.get("url"), posting_status=job.get("posting_status"), eligibility_status=(job.get("eligibility") or "").split("：")[0])
        old_role["scores"] = dict(job.get("scores") or {}, total=job.get("score_total"))
        if recent_check(old_role.get("checked_at"), now) and reason_for(old_role, now.date()) is None:
            accepted[ident] = job
            carried += 1
        else:
            pending_recheck.append(ident)
    if pending_recheck and args.write:
        parser.error("Unimported Codex inbox roles need re-verification before replacement: " + ", ".join(pending_recheck))
    jobs = sorted(accepted.values(), key=lambda x: (x["category"] != "long_term", -float(x["score_total"]), x["opportunity_id"]))
    unchanged = old_inbox.get("jobs") == jobs
    summary = {"run_id": run.get("run_id"), "new_or_current": len(jobs) - carried, "carried_pending": carried, "skipped": skipped, "pending_recheck": pending_recheck, "destination": str(inbox_path), "write": args.write, "unchanged": unchanged}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.write and not unchanged:
        payload = {"version": 1, "generated_at": now.isoformat(), "generated_by": "codex", "jobs": jobs}
        inbox_path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix="inbox-codex-", suffix=".json", dir=inbox_path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temp_name, inbox_path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
