# Data formats

The dashboard and your AI agent talk to each other through plain JSON files in `data/`. Everything under `data/` is git-ignored except `data/scout/inbox.example.json`.

| File | Written by | Read by |
|---|---|---|
| `data/scout/inbox.json`, `data/scout/inbox-<engine>.json` | your scout (directly, or through `publish.py`) | the dashboard; `sync_decisions.py` prunes it |
| `data/scout/research.json` (optional) | your agent | the dashboard |
| `data/state/dashboard-state.json` | the dashboard (folder sync) | `sync_decisions.py`, `publish.py`, your agent |
| `data/scout/ledger.jsonl` | `sync_decisions.py` | `publish.py`, your scout |
| `data/scout/sync-log/<date>.md` | `sync_decisions.py` | you |

Dates are `YYYY-MM-DD` strings in local time. Weeks start on Monday.

---

## Inbox

New jobs from a scout. The dashboard imports `data/scout/inbox.json` and every `data/scout/inbox-<engine>.json` it finds, so several agents can each keep their own file. `<engine>` is any name made of letters, digits, `.`, `_` and `-`.

```json
{
  "version": 1,
  "generated_at": "2026-10-03T09:00:00-07:00",
  "generated_by": "example-agent",
  "run_id": "example-run-001",
  "jobs": [ { "opportunity_id": "example-acme-ml-123", "employer": "Acme Robotics", "...": "..." } ],
  "revisions": []
}
```

See [`data/scout/inbox.example.json`](../data/scout/inbox.example.json) for a complete job.

### Job fields

Only the first three are required. Unknown fields are ignored.

| Field | Type | Meaning |
|---|---|---|
| `opportunity_id` | string | **Required.** A stable ID you choose, e.g. `acme-ml-platform-2026`. Importing the same ID again updates the job instead of duplicating it. |
| `employer` | string | **Required.** Company name. |
| `title` | string | **Required.** Role title. |
| `url` | string | Link to the official posting (`publish.py` requires `https`). |
| `market` | string | Optional free-text region, e.g. `US`, `Remote`, `EU`. Used by the region filter. |
| `category` | string | Job type. `bridge`, `contract`, `fellowship`, `residency`, `temp` → **Bridge**; `intern…` → **Internship**; anything else → **Full-time**. |
| `location` | string | Where the job is, e.g. `Seattle, WA (hybrid)`. |
| `posted_at` | date | When the posting went up. |
| `stale_risk` | boolean | `true` if the posting might be stale; shown as a warning. |
| `deadline` | date | Application deadline, if known. |
| `deadline_basis` | string | Where the deadline came from: `Posted`, `Estimated`, `Rolling`, or `Not checked`. |
| `score_total` | number | 0–100: the sum of the four parts below. Jobs scoring 80 or more start with high priority. |
| `scores` | object | `interest`, `capability`, `attainability`, `role_quality`, each 0–25. |
| `salary_text` | string | Salary as posted, e.g. `$150k–$190k`. |
| `eligibility` | string | Work authorization or other hard requirements. |
| `eligible` | boolean | `false` makes `publish.py` reject the job. |
| `gap_flags` | string[] | Skills you would need to close, e.g. `["model evaluation"]`. |
| `interview_coding` | string | `light`, `practical`, `heavy` or `unknown`. |
| `interview_coding_basis` | string | Why you think so. |
| `employer_type` | string | Short label shown as a badge, e.g. `Robotics startup`. |
| `employer_category` | string | Badge color: `startup`, `growth`, `enterprise`, `research`, `public`, `nonprofit` or anything else (gray). |
| `employer_about` | string | One sentence about the employer. |
| `highlight` | string | Why the job fits. |
| `risk` | string | What to watch out for. |
| `ongoing_hiring_evidence` | string | Lets `publish.py` accept a posting older than `--max-age-days`, e.g. "careers page says always hiring". |
| `engine` | string | Which agent found the job. Defaults to `generated_by`. |
| `run_id` | string | Which scout run found it. |

### What an import changes

- **New `opportunity_id`:** the job is added with stage **To review** and dashboard ID `scout-<opportunity_id>` (characters other than letters, digits, `_` and `-` become `-`).
- **Known `opportunity_id`:** only the scout data is refreshed. Your stage, notes, dates and stars are never touched. A deadline is filled in only if you have not set one.
- **Several engines** can suggest the same job: the dashboard keeps each engine's scores side by side and shows a badge for each.

### Revisions

A scout can withdraw an earlier recommendation after re-checking it:

```json
{ "opportunity_id": "example-acme-ml-123", "disposition": "below", "score_total": 61,
  "previous_score": 82, "review_reason": "Now requires a PhD" }
```

`disposition` is `below` (the score dropped under the threshold) or `triaged_out` (closed, ineligible, duplicate…). If the job is still in **To review**, it moves to a collapsed **Withdrawn** panel; your notes are kept.

---

## Research notes (optional)

If you ask your agent to research jobs (for example everything you marked **Evaluating**), it can write `data/scout/research.json`. The notes appear in the job's editor.

```json
{
  "items": {
    "example-acme-ml-123": {
      "checked_at": "2026-10-09",
      "funding": "Series B, 2025",
      "team": "Platform team of six",
      "apply_strategy": "Lead with the pipeline project",
      "answers": "Answers to the questions you wrote on the job",
      "notes": "Anything else",
      "sources": ["https://example.com/blog/post"]
    }
  }
}
```

---

## Dashboard state

`data/state/dashboard-state.json` is written by the dashboard after every change once you connect a folder (Data page). It is the same JSON as an exported backup, plus `savedAt` and `source`. Agents and scripts should treat it as **read-only**.

```json
{
  "version": 1,
  "reviews": { "2026-10-05": "What moved forward…" },
  "tasks": [],
  "jobs": [],
  "contacts": [],
  "savedAt": "2026-10-10T16:30:00.000Z",
  "source": "dashboard-autosave"
}
```

While demo data is loaded the state also has `"demo": true`, and folder sync is paused; `sync_decisions.py` refuses to run on demo data.

Every record has an `id` (letters, digits, `_`, `-`) and a `title`. Tasks, jobs and contacts share a few field names, so for jobs **`title` is the employer and `detail` is the role**.

### Jobs

| Field | Meaning |
|---|---|
| `title`, `detail` | Employer and role. |
| `status` | The stage (see below). |
| `kind` | `Full-time`, `Bridge`, `Internship` or `Other`. |
| `market` | Optional region. |
| `priority` | `High`, `Medium` or `Low`. |
| `url` | Posting link. |
| `deadline`, `deadlineBasis` | Application deadline and where it came from. |
| `due` | Your own next follow-up date. |
| `appliedAt` | Set to today when the stage first becomes Applied or later. |
| `decidedAt` | The day the stage last changed. |
| `starred`, `starredAt` | Starred jobs. |
| `comment` | Questions you want researched. |
| `note` | Free-form notes. |
| `archived` | Hidden everywhere unless you tick "Show archived". |
| `importedAt` | When the job came from an inbox. |
| `scout` | Everything the scout said: `opportunity_id`, `total` and the four score parts, `salary`, `eligibility`, `gap_flags`, `employer_*`, `highlight`, `risk`, `engine`, `source_engines`, `engine_scores`, `review_disposition` (`recommended` or `withdrawn`), `research`, … |

### Job stages

| Stage | Meaning | Ledger status |
|---|---|---|
| To review | New from the scout, not looked at yet | `Shown` (or `Below threshold` / `Triaged out` if withdrawn) |
| Evaluating | You clicked **Process**: worth a closer look | `In review` |
| Preparing | Getting your application ready | `In review` |
| Applied | Application sent | `Applied` |
| In contact | Someone replied | `Applied` |
| Interviewing | Interviews scheduled or under way | `Applied` |
| Offer | Offer received | `Applied` |
| Hired | You accepted | `Applied` |
| Later | Parked for now | `Later` |
| Passed | You decided not to pursue it (**Ignore**) | `User pass` |
| Closed | The job ended (filled, withdrawn, rejected) | `Closed (user)` |

### Tasks

| Field | Meaning |
|---|---|
| `group` | Which weekly list: `Job search` or `Skill building`. |
| `line` | Optional workstream: `Materials`, `Discovery`, `Pipeline`, `Interview prep`. |
| `status` | `To do`, `In progress`, `Blocked`, `Done`. |
| `priority` | `High`, `Medium`, `Low`. |
| `week` | The Monday of the week the task belongs to. |
| `rolledWeeks` | Earlier weeks an unfinished task was carried over from. |
| `today`, `todayAt`, `todayFrom` | On today's list; since when. |
| `due`, `doneAt` | Due date; the day you ticked it off. |
| `nextAction`, `focus`, `note` | Free text. |
| `jobIds` | Linked job IDs (comma-separated), `none`, or empty for automatic matching by company name. |

### Contacts

`title` (name), `detail` (organization / relationship), `kind` (`Referral`, `Recruiter`, `Alumni`, `Mentor`, `Other`), `status` (`To contact`, `Contacted`, `Awaiting reply`, `Follow up`, `Done`), `market`, `due` (next follow-up), `note`.

### Weekly reviews

`reviews` maps the Monday of a week to your free-text review of it.

---

## Ledger

`data/scout/ledger.jsonl` is the scout's long-term memory: one JSON object per line, appended by `sync_decisions.py` whenever a decision changes. The latest line for an `opportunity_id` wins. `publish.py` and your scout use it to avoid suggesting jobs you already decided on (`In review`, `Later`, `User pass`, `Applied`, `Closed (user)`).

```json
{"opportunity_id": "example-acme-ml-123", "status": "In review", "stage": "Evaluating", "decided_at": "2026-10-09", "source": "dashboard", "engine": "example-agent", "synced_at": "2026-10-10T09:15:02-07:00", "url": "https://example.com/careers/123", "employer": "Acme Robotics", "title": "Machine Learning Engineer, Data Platform", "review_reason": null}
```

| Field | Meaning |
|---|---|
| `opportunity_id` | The scout's ID. |
| `status` | Ledger status (see the stage table). |
| `stage` | The dashboard stage it came from. |
| `decided_at` | When you changed the stage, if recorded. |
| `source` | Always `dashboard` for lines written by the sync script. |
| `engine` | `--engine` of the sync run, or the engine that suggested the job. |
| `synced_at` | When the line was written. |
| `url`, `employer`, `title` | Copied from the dashboard for readability. |
| `review_reason` | Why a recommendation was withdrawn, if it was. |
