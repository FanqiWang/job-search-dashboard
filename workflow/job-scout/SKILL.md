---
name: job-scout
description: Find open roles that fit the candidate profile, score them, and write them to the dashboard inbox. Use when asked to "run a scout" or "find new jobs".
---

# Job scout (minimal example)

1. Read `workflow/profile.md` (fall back to `workflow/profile.example.md`).
2. Search public job boards and company career pages for roles posted in the last 30 days that match the profile.
3. Open each role's official page and confirm it is still open. Skip anything you cannot verify.
4. Score each role 0–100 as the sum of four parts, 0–25 each: interest, capability, attainability, role quality. Keep roles scoring 70 or more.
5. Append the kept roles to `data/scout/inbox.json` using the format in `data/scout/inbox.example.json`. Never remove entries you did not add, and never apply to a job on the user's behalf.
