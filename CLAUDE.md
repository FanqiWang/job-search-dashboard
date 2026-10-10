# Project guide for AI agents

Notes for any AI coding agent working in this repository. For what the project is and how people use it, read `README.md` first.

## What this is

A local-first job search dashboard: a static web page (`app/`) that keeps its data in the browser's `localStorage` and can sync with a local folder through the File System Access API. An AI agent scouts for jobs and writes them to `data/scout/inbox*.json`; the user reviews them in the dashboard; Python scripts record the decisions in a ledger. The file formats are in `docs/data-formats.md`, and the code layout is in `docs/architecture.md`.

## Ground rules

- **Privacy first.** Never add real personal information: no real names, emails, phone numbers, schools, employers someone applied to, or job IDs. Demo data, tests and docs stay fictional; links use `example.com`, `example.org` or `example.net`.
- **Local-first.** No backend, accounts, analytics, CDNs, web fonts or any other network request from the app.
- **No framework, no build step, no runtime dependencies.** The app is plain HTML, CSS and JavaScript; the scripts are Python 3.9+ with only the standard library. Playwright (in `package.json`) is a dev-only tool for screenshots.
- **Double-clicking `app/index.html` must keep working.** That is why the app uses classic `<script>` tags that share top-level names, not ES modules (browsers block modules on `file://`). New files are added to `app/index.html` in dependency order.
- **Never commit user data.** `workflow/profile.md` and everything under `data/` (except `data/scout/inbox.example.json`) are git-ignored; keep it that way.

## Where things live

| Path | Contents |
|---|---|
| `app/js/model.js` | Vocabulary (stages, statuses, priorities, modes), date helpers, state validation, roll-over. Pure. |
| `app/js/matching.js`, `app/js/inbox.js` | Search and task–job linking; inbox, revision and research import. Pure. |
| `app/seed.js` | Fictional demo data, dates relative to today. |
| `app/js/ui.js`, `app/js/views/*.js`, `app/js/editor.js` | HTML helpers, one file per page, the edit dialog. |
| `app/js/folder.js`, `app/js/main.js` | Folder sync; app state, saving, events, startup. |
| `workflow/` | Agent skills (`job-scout`, `dashboard-sync`), the example profile, and the sync scripts. |
| `tests/js/`, `workflow/dashboard-sync/tests/` | Node and Python tests. |
| `tools/screenshots.js` | Regenerates `docs/images/` from the demo data. |

## Conventions

- **Pure files stay pure.** `model.js`, `matching.js`, `inbox.js` and `seed.js` must not touch the DOM, so the tests can load them in a Node `vm` context (`tests/js/load.js`). Put new logic there when you can, and test it.
- **Escape everything.** Views build HTML strings; every value from data goes through `esc()` (or `hl()` for search highlighting).
- **Events are delegated.** Handlers in `main.js` find their target through `data-*` attributes or a button `id` in `CLICK_ACTIONS`. After changing `state`, call `save()` and then `render()`.
- **Vocabulary is shared.** If you rename a stage or status in `model.js`, update `STATUS_MAP` in `workflow/dashboard-sync/scripts/sync_decisions.py`, the tests, and `docs/data-formats.md` in the same change.
- **Data formats are a contract.** Changes to the inbox, state or ledger shape must stay backward compatible or be documented in `docs/data-formats.md`.
- **Both modes.** Full mode has everything; simple mode hides `SIMPLE_HIDDEN_VIEWS`. Check that a UI change works in both.
- **Readable over compact.** Short functions, clear names, comments that explain why. UI text is plain English, with US-English dates.

## Before you push

```sh
node --test "tests/js/*.test.js"
python -m unittest discover -s workflow/dashboard-sync/tests
```

Both must pass; CI (`.github/workflows/tests.yml`) runs them on Linux and Windows. If you change how a page looks, open `app/index.html` in a browser to check it, and regenerate the screenshots with `npm run screenshots` when the README images would be out of date. Work on a branch and open a pull request.
