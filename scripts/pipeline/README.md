# scripts/pipeline — Operator Reference

## Overview

This directory drives the **autonomous code-quality improvement pipeline** for
Graph Island. A set of cron-driven scripts continuously discover quality issues,
decompose them into atomic tasks, implement fixes in isolated git worktrees, and
merge passing PRs back to `main` — without human intervention.

Design principles:
- All operations are **file-isolated** (each session uses its own worktree).
- All scripts are **idempotent** — safe to re-run after a crash.
- A single **kill-switch file** stops all cron jobs immediately.
- State lives in three CSV files + markdown description files (no external DB).

---

## Quick Reference

### Cron-driven scripts (7 active jobs)

| Script | Responsibility | Cron schedule |
|---|---|---|
| `autonomous-improve.sh` | Main driver: discover → decompose → implement → verify → PR | `0 * * * *` (hourly :00) |
| `e2e-patrol.sh` | E2E test patrol + screenshot capture + file issues on failure | `17 * * * *` (hourly :17) |
| `progress-report.sh` | Generate `/tmp/graph-island-progress.md` health snapshot | `*/30 * * * *` (every 30 min) |
| `auto-stale-pr-close.sh` | Close aging / conflicting `auto-improve-*` PRs | `0 */6 * * *` (every 6 h) |
| `auto-merge-pr.sh` | Auto-merge `auto-improve-*` PRs that pass all gates | `*/30 * * * *` (every 30 min) |
| `feature-proposer.sh` | Propose new features / UX improvements as pipeline issues | `0 9 * * 1` (Monday 09:00) |
| `proposal-scorer.sh` | Score + accept/reject pending `source=feature-proposal` issues | `0 */6 * * *` (every 6 h) |

### Worker scripts (called by `autonomous-improve.sh`)

| Script | Responsibility |
|---|---|
| `discover-issues.sh` | Scan for real quality regressions; write to `issues.csv` |
| `decompose-issue.sh` | Break a complex issue into atomic subtasks in `tasks.csv` |
| `implement-with-gates.sh` | Implement → run quality gates → retry loop (shell-enforced) |
| `review-with-triage.sh` | Review → triage findings → fix loop (shell-enforced, max rounds) |
| `enforce-gates.sh` | Run all quality gates (`pnpm lint`, `pnpm test`, god-object, etc.) |
| `verify-issue-done.sh` | Confirm acceptance-criteria file paths exist in `git ls-files` |
| `reconcile-false-done.sh` | Move falsely-completed issues back to `pending` |

### Utility / support scripts

| Script | Responsibility |
|---|---|
| `csv-helpers.sh` | Bash facade over `csv_lib.py`; source this in any pipeline script |
| `csv_lib.py` | Python core: RFC4180 parse, atomic write, FK validation for CSVs |
| `god-object-audit.sh` | Check god-object line counts against CLAUDE.md ratchet |
| `ratchet-drift-monitor.sh` | Detect ratchet relaxations (god-object size / coverage thresholds) |
| `audit-pr-backlog.sh` | Read-only PR categorisation — never modifies anything |
| `ensure-cdp.sh` | Spawn/maintain headless Obsidian on Xvfb for E2E (port 9222) |
| `read-verify-report.sh` | Aggregate subtask verify report into a one-line gate summary |
| `progress-report.sh` | (also utility) Outputs Kaizen metrics block to `/tmp/graph-island-progress.md` |

### Operator tools (R8–R10)

| Script | Responsibility |
|---|---|
| `pipeline-status.sh` | 30 ms one-line OK / WARN / CRITICAL verdict (R8-B) |
| `pipeline-debug.sh` | Step-by-step recovery guidance for each status code (R9-B) |
| `pr-drainage.sh` | Generates safe `gh` commands for PR backlog drainage (R9-A) |
| `cron-health.sh` | 7-cron watchdog via `/tmp/graph-island-*.log` mtime (R9-C) |
| `acknowledge-alert.sh` | Operator helper to ack `csv_file_alert` critical issues. R10-C. |

### Node / TypeScript scripts

| Script | Responsibility |
|---|---|
| `visual-report.ts` | CDP-based visual quality report generator (JSON output) |
| `emit-git-status-short.mjs` | Emit structured JSON from `classify-git-status.sh` result |
| `format-git-status-short.mjs` | Reformat git-status classification for downstream pipeline steps |
| `verify-frontmatter-baseline.mjs` | Verify frontmatter of a target file against a saved baseline |

### Python scripts

| Script | Responsibility |
|---|---|
| `csv_lib.py` | (see above — primary CSV engine) |
| `sweep_decomposed_done.py` | Recursive parent rollup: promote `decomposed` tasks to `done` |
| `extract_attempts_history.py` | One-shot: recovered attempt history from legacy md tree (already run) |

---

## Cron Schedule Map

Actual entries from `crontab -l` (as of 2026-05-08):

```
0  *    * * *   autonomous-improve.sh    >> /tmp/graph-island-improve.log
17 *    * * *   e2e-patrol.sh            >> /tmp/graph-island-e2e.log
*/30 *  * * *   progress-report.sh       >> /tmp/graph-island-progress-cron.log
0  */6  * * *   auto-stale-pr-close.sh --apply  >> /tmp/graph-island-stale-pr.log
*/30 *  * * *   auto-merge-pr.sh --apply >> /tmp/graph-island-auto-merge.log
0  9    * * 1   feature-proposer.sh --apply     >> /tmp/graph-island-feature-proposer.log
0  */6  * * *   proposal-scorer.sh --apply      >> /tmp/graph-island-proposal-scorer.log
```

Kill-switch is present in all 7 cron scripts. Verify with:

```bash
grep -l "Kill-switch\|pipeline-disabled" scripts/pipeline/*.sh
```

### Heartbeat (R10-A + R11-A, 2026-05-09)

Every cron script writes a heartbeat line to its log at startup, **before**
the kill-switch / dirty-skip guards. This ensures `cron-health.sh` (R9-C)
always knows the cron actually fired, not just that it was scheduled.

Heartbeat format: `[heartbeat] <ISO-date> <script-name> started`

Override the log path via `<SCRIPT_NAME>_LOG_FILE` env vars (used in tests).

```bash
# Verify all 7 cron have heartbeat:
grep -l 'heartbeat' scripts/pipeline/*.sh | wc -l   # should be 7
```

---

## Data Layer

| File / Dir | Contents | Current size |
|---|---|---|
| `tasks.csv` | Atomic subtasks. `status`: pending \| decomposed \| in_progress \| done \| blocked \| cancelled | 1599 data rows |
| `issues.csv` | Higher-level work items (bugs, features, tech-debt). | 316 data rows |
| `attempts.csv` | Decomposition retry log. | 30 data rows |
| `descriptions/` | Issue / task body markdown, one file per row. | 482 files |
| `migrations/` | One-shot data-migration scripts. **Do not re-run blindly.** | 2 files |
| `reports/` | Output of `visual-report.ts` runs. | runtime output |

Full column schema: see `csv-schema.md` in this directory.

---

## Kill-switch (Emergency Stop)

Stop all 7 cron scripts immediately:

```bash
touch /home/ubuntu/obsidian-plugins/obsidian-graph-island/.pipeline-disabled
```

Resume:

```bash
rm /home/ubuntu/obsidian-plugins/obsidian-graph-island/.pipeline-disabled
```

Each cron script checks for this file at startup and exits 0 if it exists.
Introduced in kaizen Round 4 (2026-05-08) and applied to all 7 cron jobs.

---

## Health Check

```bash
# One-shot snapshot:
bash scripts/pipeline/progress-report.sh
cat /tmp/graph-island-progress.md
```

The `Kaizen Metrics` section shows:
- Kill-switch active/inactive
- Decompose throttle status (pending count vs. cap)
- Bifurcation behind (commit delta from `origin/main`)
- Open PR backlog count

For a read-only PR audit:

```bash
bash scripts/pipeline/audit-pr-backlog.sh
```

For monitoring tools / quick visual scan:

```bash
ls /tmp/graph-island-alerts/        # parallel file sink (R11-B)
cat /tmp/graph-island-alerts/*.txt  # human-readable alerts
```

Each alert is also written to `issues.csv` (`priority=critical` / `source=alert`).
Two channels stay in sync — `acknowledge-alert.sh --ack` deletes both.

---

## Testing

Pipeline unit tests live in `tests/pipeline/`:

```bash
# Run all pipeline tests:
bash tests/pipeline/run-all.sh -q   # concise
bash tests/pipeline/run-all.sh -v   # verbose per-assertion
```

Current state (2026-05-08): **7 test files / 75 assertions** (5 active, 2 skip-only).

| Test file | Assertions |
|---|---|
| `csv-helpers.test.sh` | 14 |
| `gate-git-status-short-wc.test.sh` | 14 |
| `handoff-git-status-short.test.sh` | 18 |
| `verify-body-match.test.sh` | 17 |
| `verify-issue-done.test.sh` | 12 |

`autonomous-improve.sh` runs a pre-flight self-test before each cycle starts
(introduced kaizen Round 5, 2026-05-09).

---

## Common Operations

```bash
# Issue discovery (manual trigger):
bash scripts/pipeline/discover-issues.sh

# Manually decompose a specific issue:
bash scripts/pipeline/decompose-issue.sh <path-to-issue-description.md>

# PR backlog audit (read-only):
bash scripts/pipeline/audit-pr-backlog.sh

# Auto-close stale PRs (dry-run first):
bash scripts/pipeline/auto-stale-pr-close.sh --dry-run
bash scripts/pipeline/auto-stale-pr-close.sh --apply

# Auto-merge ready PRs (dry-run first):
bash scripts/pipeline/auto-merge-pr.sh --dry-run
bash scripts/pipeline/auto-merge-pr.sh --apply

# Move false-done issues back to pending:
bash scripts/pipeline/reconcile-false-done.sh --dry-run
bash scripts/pipeline/reconcile-false-done.sh

# Check god-object ratchet:
bash scripts/pipeline/god-object-audit.sh

# All quality gates (same as CI):
bash scripts/pipeline/enforce-gates.sh
bash scripts/pipeline/enforce-gates.sh --json

# Acknowledge resolved alerts (R10-C)
bash scripts/pipeline/acknowledge-alert.sh --list           # show open alerts
bash scripts/pipeline/acknowledge-alert.sh --ack <id>       # ack one
bash scripts/pipeline/acknowledge-alert.sh --ack-all --yes  # bulk ack
```

---

## Kaizen History (summary)

Rounds 1–5 ran 2026-05-08 to 2026-05-09, each targeting a different failure
mode observed in the autonomous pipeline:

| Round | Focus |
|---|---|
| R1 | Core defect fixes: verify loop, throttle, recovery, false-done close |
| R2 | Kill-switch (7 cron jobs), graceful shutdown, CSV data integrity |
| R3 | Self-protection gates + observability (test runner, 7 tests / 75 assertions) |
| R4 | Consistency + worktree isolation + Kaizen Metrics in progress-report |
| R5 | Pre-flight self-test in autonomous-improve + PR audit tool + this README |
| R6–R9 | Operator tools: pipeline-status, pipeline-debug, pr-drainage, cron-health |
| R10 | heartbeat (feature-proposer) + smoke tests for 4 operator tools + acknowledge-alert.sh |
| R11 | heartbeat to all 7 cron + csv_file_alert parallel file sink (`/tmp/graph-island-alerts/`) + acknowledge-alert / pipeline-debug tests (35 new assertions) |

Full commit history: `git log --grep="kaizen" --oneline`.
