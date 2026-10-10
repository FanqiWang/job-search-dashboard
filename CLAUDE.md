# Project brief: open-source job search dashboard

## What this is

A local-first job search dashboard extracted from a private, personal setup. It is a static web app (vanilla HTML/CSS/JS, no build step, no backend) that keeps everything in the browser's localStorage and can optionally read and write a local folder through the File System Access API (Chrome/Edge).

The workflow it supports:

1. An AI agent runs a **scout** (see `workflow/job-scout/SKILL.md`): it finds roles that fit a candidate profile, scores them, and writes them to `data/scout/inbox.json`.
2. The dashboard imports the inbox into a **"to review"** queue, grouped by company and sorted by score.
3. The user decides in one click: process, prepare to apply, later, or ignore. They track applications, deadlines, contacts, weekly tasks and weekly reviews.
4. The dashboard autosaves its state to `data/state/dashboard-state.json`.
5. **Sync** scripts (`workflow/dashboard-sync/`) read that state, record decisions in a ledger, and prune entries the user has already handled from the inbox.

The goal is a polished public GitHub repo that people want to use and share.

## Current state of the code

- `app/` is the original dashboard with personal data removed. **Its UI text is in Chinese** and the code is dense and minified-looking. `app/seed.js` is an empty dataset.
- Personal leftovers were stripped: seed-update history (`mergeHandover` now uses an empty `previous`), task-to-job presets (`TASK_JOB_LINKS` is empty), employer profiles, and per-application summary pages. Code that referenced them may now be dead.
- `workflow/dashboard-sync/` contains working Python scripts with passing tests (`python -m unittest discover -s workflow/dashboard-sync/tests`). They were written for a stricter private scoring contract and use two engine names, `claude` and `codex`.
- `workflow/profile.example.md` and `workflow/job-scout/SKILL.md` are intentionally minimal examples. Keep them short.
- `data/scout/inbox.example.json` shows the inbox format the dashboard reads (see `importInbox` in `app/app.js`).

## Tasks

1. **Translate the entire UI to English**: labels, statuses, buttons, empty states, help text, dates (`toLocaleDateString` with `en-US`), and code comments. Translate status values too (e.g. 待浏览 → "To review", 准备申请 → "Preparing", 已投递 → "Applied") and update the sync scripts' `STATUS_MAP` and tests to match. Remove China/U.S. market-specific wording; keep a generic, optional "market" or "region" field.
2. **Simplify and clean up**: remove dead code left by the stripped features (seed-update merge chain, handover conflicts, channel-coverage panel, chat-decisions import, hard-coded aliases), and generalize engine names (any string, not just claude/codex). Keep the code dependency-free. Readability matters more than compactness: reformat `app.js` into readable code, split it into a few files if that helps.
3. **Fictional demo data**: fill `app/seed.js` with a believable but clearly fictional dataset (about 12 jobs across all stages, 6 contacts, a week of tasks, one weekly review), based on the example profile. Use made-up companies or obvious placeholders; never use real people. Provide a way to clear demo data and start fresh.
4. **Make it easy to run**: double-clicking `app/index.html` should work for the basic dashboard. Add a tiny cross-platform way to serve it locally (e.g. `python -m http.server`) for the folder-sync features, and document both.
5. **Documentation**: a strong `README.md` (what it is, screenshots, quick start, the scout → review → sync workflow, how to plug in any AI agent, privacy model, FAQ), plus `docs/` pages for the data formats (inbox, state, ledger) and architecture. Explain that `workflow/profile.md` and everything under `data/` stay local and are git-ignored.
6. **Screenshots**: run the app with the demo data in a headless browser (e.g. Playwright) and save screenshots of the main views to `docs/images/`, including one of the review queue. Use them in the README. Commit the script that generates them.
7. **Quality**: keep the sync tests passing, add tests for any new logic, and add a minimal GitHub Actions workflow that runs them.

## Rules

- **Privacy first.** Never add real personal information: no real names, emails, phone numbers, schools, employers someone applied to, or job IDs. Everything in demo data and docs must be fictional.
- Keep the app local-first: no backend, no accounts, no analytics, no external network calls from the app.
- Do not add a framework or build step.
- Work on a branch and open a pull request describing what changed and anything left undone.
