# Pipeline Migrations

One-shot data migration scripts. Run **once**, kept here for history.

## Policy
1. Each migration is named `YYYY-MM-DD-<topic>.py` (or `.sh`).
2. Migrations are NOT auto-run by cron. Operator runs manually after review.
3. Keep migration scripts in this directory after execution — they document
   what changed and when. Do NOT delete after running.
4. Backup files (`*.bak`) created by migrations should be deleted after
   verification (typically within 1 week).

## Executed
- `2026-05-08-migrate-subtask-summaries.py` — replaced 569 historical
  `summary='subtask'` boilerplate rows in `tasks.csv` with parent-derived
  labels (e.g., "subtask of 976 subtask issue frontmatter"). Ran once on
  2026-05-08; backup at `tasks.csv.bak` (delete after operator verification).
