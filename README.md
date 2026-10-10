# Job Search Dashboard

**A local-first dashboard for a job search, built to work with any AI agent.**

*Designed by [Fanqi Wang](https://github.com/FanqiWang), built with [Claude Code](https://claude.com/claude-code). See [About](#about).*

Your agent scouts for roles that fit you and scores them. You review them in one click, track applications, deadlines and contacts, plan your week, and write a weekly review. Your decisions flow back to the agent so it never suggests the same job twice.

Everything stays on your machine: it is a static web page with no backend, no account, no analytics and no dependencies.

![Overview: today's tasks, weekly progress, starred jobs, deadlines and follow-ups](docs/images/overview.png)

<table>
  <tr>
    <td width="50%"><img src="docs/images/review-queue.png" alt="The review queue: new jobs grouped by company and sorted by score"><br><b>Review queue.</b> New jobs from your scout, grouped by company and sorted by score. Process, prepare to apply, park or ignore each one in a click.</td>
    <td width="50%"><img src="docs/images/jobs-by-stage.png" alt="Jobs grouped by stage"><br><b>Pipeline.</b> Every job you have looked at, by stage, with scores, deadlines and follow-ups.</td>
  </tr>
  <tr>
    <td><img src="docs/images/weekly-lists.png" alt="Weekly task lists"><br><b>Weekly lists.</b> Two lists a week. Unfinished tasks carry over instead of disappearing, and tasks link to the jobs they mention.</td>
    <td><img src="docs/images/calendar.png" alt="Calendar of deadlines and follow-ups"><br><b>Calendar.</b> Application deadlines and your own follow-up dates, by urgency and on a month grid.</td>
  </tr>
  <tr>
    <td><img src="docs/images/job-details.png" alt="Job details with scores and research notes"><br><b>Job details.</b> The scout's scores and reasoning, your questions, and your agent's research notes.</td>
    <td><img src="docs/images/weekly-review.png" alt="Weekly review"><br><b>Weekly review.</b> What moved, what is weak, what the market told you, and what to unblock next.</td>
  </tr>
</table>

All data in the screenshots is fictional.

## Full or simple

Not interested in planning your week inside the dashboard? Switch to **simple mode** (button at the bottom of the sidebar, or the Data page). It keeps only job tracking: the review queue, your pipeline, deadlines, follow-ups and contacts. The weekly task lists, workstreams and weekly review are hidden. Both modes use the same data, so you can switch back at any time without losing anything. You can also open the page as `app/index.html?mode=simple`.

![Simple mode: only job tracking](docs/images/simple-mode.png)

## Quick start

**Just look around:** download or clone this repository and double-click `app/index.html`. It opens with fictional demo data; clear it from the banner at the top when you are ready to start.

```sh
git clone https://github.com/FanqiWang/job-search-dashboard.git
```

**Use it with an AI agent (folder sync):** start the tiny local server and open the page in Chrome or Edge.

```sh
cd job-search-dashboard
python serve.py          # or: python3 serve.py
```

This opens <http://localhost:8765/app/>. Go to **Data → Connect folder** and pick the `job-search-dashboard` folder. From then on the dashboard saves its state to `data/state/dashboard-state.json` and picks up new jobs from `data/scout/`.

`serve.py` uses only Python's standard library, listens on `127.0.0.1` only, and works on Windows, macOS and Linux. Any static server will do if you prefer, as long as it serves the repository root on `localhost` (for example `python -m http.server 8765 --bind 127.0.0.1`, then open `/app/`).

> **Why a server for folder sync?** Browsers only allow the [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API) on secure origins such as `http://localhost`, not on pages opened from disk. Everything else works when you double-click the file.

## How it works

```
 1. Scout           2. Review              3. Track               4. Sync
 your agent    →    the dashboard     →    the dashboard     →    your agent
 finds & scores     To review queue        stages, deadlines,      records your decisions,
 jobs, writes       one-click decisions    contacts, weekly        prunes the inbox
 data/scout/                               lists and reviews       (data/scout/ledger.jsonl)
 inbox.json                                (autosaved to data/state/dashboard-state.json)
```

1. **Scout.** Your agent reads your profile (`workflow/profile.md`), searches for open roles, scores each one 0–100 (interest, capability, attainability and role quality, 0–25 each), and writes the good ones to `data/scout/inbox.json`. The instructions are in [`workflow/job-scout/SKILL.md`](workflow/job-scout/SKILL.md).
2. **Review.** The dashboard imports the inbox into the **To review** queue, grouped by company and sorted by score. For each job you choose:
   - **Process**: worth a closer look (stage *Evaluating*; ask your agent to research it),
   - **Prepare to apply**: skip straight to *Preparing*,
   - **Later**: park it with low priority,
   - **Ignore**: not for you (*Passed*).
3. **Track.** Move jobs through *Applied → In contact → Interviewing → Offer*, star the ones you care most about, add deadlines and follow-up dates, keep track of contacts, plan two task lists a week, and write a weekly review.
4. **Sync.** `sync_decisions.py` reads the dashboard's state, appends your decisions to a ledger, and removes handled jobs from the inbox. The next scout run reads the ledger and skips anything you have already decided on.

## Plug in any AI agent

The dashboard does not care which agent you use (Claude, ChatGPT, a local model, or a script you wrote) because the contract is just files:

| The agent… | File | Format |
|---|---|---|
| reads your profile | `workflow/profile.md` | free text ([example](workflow/profile.example.md)) |
| writes new jobs | `data/scout/inbox.json` or `data/scout/inbox-<engine>.json` | [inbox](docs/data-formats.md#inbox) |
| optionally writes research | `data/scout/research.json` | [research notes](docs/data-formats.md#research-notes-optional) |
| reads your decisions | `data/state/dashboard-state.json`, `data/scout/ledger.jsonl` | [state](docs/data-formats.md#dashboard-state), [ledger](docs/data-formats.md#ledger) |

To set it up:

1. Copy `workflow/profile.example.md` to `workflow/profile.md` and describe yourself: experience, target roles, locations, deal-breakers.
2. Give your agent the two skills: [`workflow/job-scout/SKILL.md`](workflow/job-scout/SKILL.md) and [`workflow/dashboard-sync/SKILL.md`](workflow/dashboard-sync/SKILL.md). Agents that support skill folders (such as Claude Code) can use them as they are; for others, paste the steps into your prompt. They are short on purpose, so edit them to suit your search.
3. Ask the agent to "run a scout". It validates and publishes its results with:

   ```sh
   python workflow/dashboard-sync/scripts/publish.py --results results.json --engine my-agent --write
   ```

4. Review the new jobs in the dashboard, then ask the agent to sync:

   ```sh
   python workflow/dashboard-sync/scripts/sync_decisions.py --engine my-agent --write
   ```

Both scripts print what they would do and change nothing unless you pass `--write`. Use a different `--engine` name for each agent: each gets its own `inbox-<engine>.json`, and the dashboard shows which agent suggested which job (and both scores when they agree on one).

## Privacy

- **Your data never leaves your machine.** The page makes no network requests of its own: no analytics, fonts, CDNs or accounts. The only requests are the job links you click.
- **The browser is the primary store.** Data lives in your browser's `localStorage` for this page. Use **Export backup** regularly, and keep backups somewhere safe; clearing site data deletes it.
- **Folder sync is opt-in** and limited to the folder you pick. The browser asks for permission on each visit.
- **Personal files are git-ignored.** `workflow/profile.md` and everything under `data/` (except `data/scout/inbox.example.json`) are in `.gitignore`, so you can fork this repository and commit your own changes without publishing your job search.
- **Your agent sees what you give it.** If you use a cloud AI agent, your profile and the job data it reads are sent to that provider under its own terms.

## FAQ

**Can I use it just to track applications?**
Yes: switch to simple mode (see [Full or simple](#full-or-simple)). Your choice is remembered in this browser.

**Do I need an AI agent?**
No. You can add jobs, contacts and tasks by hand with the **+ New** button. The agent just fills the review queue for you.

**Which browsers work?**
The dashboard works in any modern browser. Folder sync needs Chrome or Edge (Firefox and Safari do not support writing to local folders), and the page must be served from `localhost`.

**Where is my data, and how do I move it?**
In your browser, for this page's address: `file://…/app/index.html` and `http://localhost:8765/app/` count as different places. Export a backup from one and import it in the other. With folder sync on, `data/state/dashboard-state.json` is always a current copy.

**How do I get rid of the demo data?**
Click **Clear demo data and start fresh** in the banner, or use the **Data** page. You can load the demo again from the same page, and your current data is downloaded as a backup first.

**Can I change the stages, lists or scoring?**
The vocabulary lives at the top of [`app/js/model.js`](app/js/model.js). If you rename stages, update `STATUS_MAP` in [`sync_decisions.py`](workflow/dashboard-sync/scripts/sync_decisions.py) to match. Scoring is up to your scout; `publish.py` only checks that the four parts add up to the total (`--min-score` and `--max-age-days` adjust its filters).

**What is a "Bridge" job?**
A contract, fellowship, residency or other short-term role that gets you closer to where you want to be. Bridge and internship roles get their own column in the review queue.

**Is there a build step?**
No. Edit a file and reload. The app is plain HTML, CSS and JavaScript; the scripts are plain Python 3.9+.

## Development

```sh
node --test "tests/js/*.test.js"                              # dashboard logic, no packages needed
python -m unittest discover -s workflow/dashboard-sync/tests  # sync scripts, standard library only
npm install && npx playwright install chromium && npm run screenshots   # regenerate docs/images/
```

See [`docs/architecture.md`](docs/architecture.md) for how the code is organized, and [`docs/data-formats.md`](docs/data-formats.md) for every file format.

## About

This project was designed by [Fanqi Wang](https://github.com/FanqiWang): the idea, the scout → review → sync workflow, the features, and every product decision. It grew out of a dashboard Fanqi built for a personal job search. The code, tests, documentation and screenshots were written by [Claude Code](https://claude.com/claude-code), Anthropic's AI coding agent, working from Fanqi's design and review.

## License

[MIT](LICENSE)
