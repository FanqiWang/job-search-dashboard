---
name: dashboard-sync
description: Record the user's dashboard decisions in the scout ledger and prune handled jobs from the inbox. Use after the user has reviewed jobs, or before a new scout run.
---

# Dashboard sync

1. Preview: `python workflow/dashboard-sync/scripts/sync_decisions.py --engine <your-name>`. It reads `data/state/dashboard-state.json` and prints the decisions it would record.
2. If the preview looks right, run it again with `--write`. It appends changed decisions to `data/scout/ledger.jsonl`, removes imported jobs from your inbox file, and adds a note to `data/scout/sync-log/`.
3. Tell the user what was recorded. Jobs listed under `applications` are the ones they are applying to; offer to update their own tracker if they keep one. Never change the dashboard state file.
