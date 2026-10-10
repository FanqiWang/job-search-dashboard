# Architecture

The project has two halves that only share files:

```
            ┌──────────────── your AI agent ────────────────┐
            │  job-scout skill        dashboard-sync skill   │
            └──────┬───────────────────────────▲─────────────┘
     publish.py    │                           │ sync_decisions.py
                   ▼                           │
      data/scout/inbox*.json      data/state/dashboard-state.json
                   │                           ▲
                   └──────► dashboard ─────────┘
                         (browser, localStorage)
```

- **The dashboard** (`app/`) is a static web page. It keeps its data in the browser's `localStorage` and, if you connect a folder, mirrors it to `data/state/dashboard-state.json` and imports inbox files.
- **The workflow** (`workflow/`) is a set of plain instructions for an AI agent plus two Python scripts (standard library only) that validate inboxes and record your decisions.

Nothing runs in the background and nothing talks to a server. The only network requests the page makes are links you click.

## The dashboard

No framework and no build step: the page loads a handful of classic `<script>` files in order, which share top-level functions and constants. Classic scripts (not ES modules) are what make double-clicking `index.html` work, because browsers refuse to load modules from `file://`.

| File | Contents |
|---|---|
| `app/js/model.js` | Vocabulary (stages, statuses, priorities), date helpers, state validation, task roll-over, calendar items. Pure. |
| `app/js/matching.js` | Search, and linking tasks to jobs by company name. Pure. |
| `app/js/inbox.js` | Importing inbox, revision and research files into the state. Pure. |
| `app/seed.js` | The fictional demo dataset, with dates relative to today. |
| `app/js/ui.js` | Small HTML helpers: escaping, badges, buttons. |
| `app/js/folder.js` | Folder sync through the File System Access API. |
| `app/js/views/*.js` | One file per page: overview, tasks, jobs, calendar, contacts, review, data. Each returns an HTML string. |
| `app/js/editor.js` | The edit dialog for tasks, jobs and contacts. |
| `app/js/main.js` | App state, saving, the header and filters, event handling, startup. |

"Pure" files never touch the DOM, so the tests in `tests/js/` load them into a Node `vm` context exactly as the browser would and call them directly.

### Rendering

`render()` in `main.js` rebuilds the current page from `state` as an HTML string. Every value from data goes through `esc()` first. Clicks, changes and inputs are handled by a few delegated listeners on `document`, which find their target through `data-*` attributes (`data-view`, `data-edit="jobs:<id>"`, `data-act`, …). After changing `state`, a handler calls `save()` and then `render()`.

### Saving

- `save()` writes the whole state to `localStorage` under `job-search-dashboard/state`.
- If the saved data cannot be read or fails validation, the dashboard shows an empty state and refuses to save, so a bug can never overwrite your data. Importing a valid backup clears the error.
- Importing a backup or loading the demo first downloads a backup of the current data.
- When a folder is connected, `save()` also schedules a write of `data/state/dashboard-state.json` (debounced by 0.8 s).

### Folder sync

The File System Access API only works on secure origins, which includes `http://localhost` but not `file://`. That is why `serve.py` exists. The chosen folder handle is stored in IndexedDB, and the browser asks for permission again on each visit. On connect (and on "Import inbox now"), the dashboard reads `data/scout/inbox.json`, every `data/scout/inbox-<engine>.json` and `data/scout/research.json`, merges them, then writes the state file. Sync is paused while demo data is loaded, so demo jobs never reach your ledger.

### Weekly roll-over

Unfinished tasks never disappear. When a new week starts, tasks from earlier weeks move to the current week and remember where they came from (`rolledWeeks`); unfinished tasks on today's list carry over to the next day (`todayFrom`). This runs on load, when the tab becomes visible, and every ten minutes.

## The workflow scripts

`workflow/dashboard-sync/scripts/`:

- **`publish.py`** validates a scout's results (complete fields, `https` link, four scores of 0–25 that add up to the total, minimum score, posting age) and writes them atomically to the inbox. It skips jobs already on the dashboard or decided in the ledger, and keeps jobs from the previous inbox that the dashboard has not imported yet.
- **`sync_decisions.py`** reads the dashboard state, appends changed decisions to the ledger, removes imported jobs from the inbox, and writes a short Markdown note. Both are idempotent: running them twice changes nothing the second time.
- **`common.py`** holds the shared file helpers.

Both scripts only print a summary unless you pass `--write`, so an agent can show you the plan first.

## Tests

```
node --test "tests/js/*.test.js"                              # dashboard logic
python -m unittest discover -s workflow/dashboard-sync/tests  # sync scripts
```

Neither needs any packages. `.github/workflows/tests.yml` runs both on Linux and Windows. `tools/screenshots.js` regenerates `docs/images/` with Playwright (the only dev dependency, in `package.json`).
