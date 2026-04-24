# Pipeline CSV Schema (Phase 0)

Authoritative schema for the autonomous pipeline state, stored in CSV.
Phase 0 establishes the format; data migration happens in Phase 1.

## Files

| Path | Purpose | Volatility |
|---|---|---|
| `scripts/pipeline/issues.csv` | All issues (active + done), one row per issue | High |
| `scripts/pipeline/tasks.csv` | All tasks (active + done), one row per task | Very high |
| `scripts/pipeline/attempts.csv` | `### Attempt N` history, one row per attempt | Append-only |
| `scripts/pipeline/descriptions/<id>.md` | Per-row description (multi-line markdown) | Stable |

Notes:
- `active` and `done` items live in the same CSV; they differ only by the `status` column. There is no separate `*_done.csv`.
- `descriptions/` is flat (no `done/` subfolder). Status changes never move a description file.
- One source of truth for schema is THIS file. The Python helper module reads it via constants kept in sync.

## issues.csv columns

| # | Column | Type | Required | Notes |
|--:|---|---|---|---|
| 1 | `id` | string | yes (PK) | `<num>-<slug>`, e.g. `133-type-assertions`. Unique forever; never re-used. |
| 2 | `priority` | enum | yes | one of `critical|high|medium|low|skip` |
| 3 | `reported` | date | yes | `YYYY-MM-DD` (ISO date) |
| 4 | `status` | enum | yes | one of `pending|in-progress|decomposed|blocked|undecomposable|done` |
| 5 | `source` | enum | yes | one of `auto-discovered|kaizen|e2e-patrol|user|decomposed` |
| 6 | `parent` | string \| `none` | yes | FK to `issues.id` or `none`. Issues are usually `none`. |
| 7 | `depends` | string \| `none` | yes | Free-form dependency hint (e.g. `subtask-1`) or `none` |
| 8 | `summary` | string | yes | Single line, no `\n`, RFC4180-quoted if needed |
| 9 | `decompose_attempts` | int | yes (default `0`) | Times the issue has been picked for decomposition |
| 10 | `description_path` | string | yes | Relative path from repo root, e.g. `scripts/pipeline/descriptions/133-type-assertions.md` |
| 11 | `created_at` | ISO-8601 datetime | yes | First-seen time, `YYYY-MM-DDTHH:MM:SS+09:00` |
| 12 | `updated_at` | ISO-8601 datetime | yes | Last-modified time |

## tasks.csv columns

| # | Column | Type | Required | Notes |
|--:|---|---|---|---|
| 1 | `id` | string | yes (PK) | `<num>-<parent_num>-<slug>`, e.g. `1138-135-showorphans-false-smoke-test` |
| 2 | `priority` | enum | yes | same as issues |
| 3 | `reported` | date | yes |  |
| 4 | `status` | enum | yes | one of `pending|in-progress|blocked|done` (tasks have no `decomposed`/`undecomposable`) |
| 5 | `source` | enum | yes | one of `decomposed|user` |
| 6 | `parent` | string | yes | FK to `issues.id`, NOT NULL |
| 7 | `depends` | string \| `none` | yes |  |
| 8 | `summary` | string | yes |  |
| 9 | `attempt_count` | int | yes (default `0`) | Number of `### Attempt` records (mirrored to attempts.csv) |
| 10 | `description_path` | string | yes |  |
| 11 | `created_at` | ISO-8601 | yes |  |
| 12 | `updated_at` | ISO-8601 | yes |  |

## attempts.csv columns

| # | Column | Type | Required | Notes |
|--:|---|---|---|---|
| 1 | `issue_id` | string \| `` | one-of (XOR with `task_id`) | FK |
| 2 | `task_id` | string \| `` | one-of | FK |
| 3 | `attempt_no` | int | yes (1-indexed) | Sequential per parent row |
| 4 | `timestamp` | ISO-8601 | yes | When this attempt started |
| 5 | `status_before` | string | yes | Status snapshot prior to this attempt |
| 6 | `session_summary` | string | no | Single-line note (e.g. `gates failed`) |
| 7 | `note` | string | no | Multi-line free text (RFC4180-quoted). Long notes >2KB go to `descriptions/attempts/<parent_id>-<attempt_no>.md`. |

## Encoding & dialect

- UTF-8, no BOM
- Line endings: LF (Linux only)
- RFC4180 strict: delimiter `,`, quote `"`, internal `"` escaped as `""`
- Header line: present (line 1)
- Python `csv` module default dialect (`excel`) round-trips cleanly

## ID conventions

| Item | Pattern | Example |
|---|---|---|
| Issue id | `<3-digit-num>-<slug>` | `147-god-object-violation` |
| Task id | `<num>-<parent_num>-<slug>` | `1256-147-graphviewcontainer-ts-1-8424` |

`<num>` is monotonically increasing across **both** issues and tasks (so issue 147 and task 147 cannot coexist; the next id after issue 148 will be task 149 if a task is filed before another issue).

## Concurrency

- Read paths are lock-free (POSIX guarantees rename-after-write atomicity for whole-file replacement).
- Write paths (insert / update / archive) acquire a per-kind flock:
  - `/tmp/graph-island-csv-issues.lock`
  - `/tmp/graph-island-csv-tasks.lock`
  - `/tmp/graph-island-csv-attempts.lock`
- All writes use `tmpfile + rename` for atomicity.
- Lock timeout: 30s (treat longer as a stuck cycle worth investigating).
- Retry: 3 attempts, 2s sleep between.

## Foreign-key validity

- `tasks.parent` MUST reference an existing `issues.id`.
- `attempts.issue_id` XOR `attempts.task_id` (exactly one populated).
- The helper provides `csv_validate <kind>` to enforce these in CI.

## Description files

- One `.md` file per issue/task at `scripts/pipeline/descriptions/<id>.md`.
- Stores everything that used to live below the frontmatter in the original md files (Description, Acceptance criteria, etc.).
- LLM prompt assembly: `csv_to_prompt_text <kind> <id>` reads the row → renders frontmatter-style header → concatenates the description file. Output is byte-for-byte equivalent to the legacy md file (verified by `verify-csv-equiv.sh` in Phase 1).

## Round-trip guarantee (Phase 1 check)

Every legacy md file must satisfy:
```
md → CSV row + descriptions/<id>.md → md (via csv_export_md) == md
```
modulo a single trailing newline. Failing this check aborts the migration.

## Rollback

`csv_export_md <kind> <id>` reconstructs a legacy md file from the CSV row + description. The reverse migration (`scripts/pipeline/rollback-csv-to-md.sh`, Phase 1) loops over all rows to restore the old layout.
