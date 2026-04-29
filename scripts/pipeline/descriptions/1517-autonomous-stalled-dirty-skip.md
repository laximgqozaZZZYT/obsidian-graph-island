---
priority: critical
reported: 2026-04-29
status: pending
source: auto-discovered
summary: autonomous-improve has SKIP-ed 3+ consecutive cycles (working tree dirty)
---

## Detected
autonomous-improve.sh has skipped 3 cycles in a row because
main has uncommitted changes. The pipeline is effectively halted.

## Working-tree contents (first 5)
```
 M scripts/pipeline/issues.csv
?? scripts/pipeline/descriptions/1517-autonomous-stalled-dirty-skip.md
```

## Recovery
1. Inspect changes: `git -C /home/ubuntu/obsidian-plugins/obsidian-graph-island diff`
2. Either commit or stash so working tree is clean
3. Counter clears automatically on the next non-SKIP cycle

---

## Root-cause investigation (2026-04-30, subtask of 1517)

This append-only section documents the Phase-1 investigation requested by the
parent decomposition task. Status / frontmatter intentionally unchanged.

### 1. Who writes to `scripts/pipeline/issues.csv`

All writes flow through `csv_lib.py` (atomic-rename + flock). The mutating
entry points are:

| Caller | File:line | Mutation |
|---|---|---|
| Decompose-time attempts increment | `autonomous-improve.sh:605` | `csv_increment_attempts issues <id>` (cwd = PROJECT_DIR) |
| Alert filing (the dirty-skip watchdog itself) | `autonomous-improve.sh:296` | `csv_lib.py insert issues …` |
| Kaizen mid-cycle discovery | `autonomous-improve.sh:510-513` | `git add … && git commit` (defensive) |
| Issue → tasks decomposition | `decompose-issue.sh:319,322` | `csv_set_status issues <id> decomposed` + `git add+commit` |
| Decomposition gives up | `decompose-issue.sh:304-308` | `csv_set_status issues <id> undecomposable` + `git add+commit` |
| Kaizen quality scan | `discover-issues.sh:543-546` | `git add+commit` after `file_issue` calls |
| Feature proposer | `feature-proposer.sh:264-265` | `git add+commit` |
| Proposal scorer | `proposal-scorer.sh:230-231` | `git add+commit` |
| E2E patrol issue filing | `e2e-patrol.sh:93` | `git add+commit` |
| Bash facade for all of the above | `csv-helpers.sh:87,90,95,100,109` | wraps `csv_lib.py` write commands |

Every writer has its own `git add … && git commit` guard. **The writes are not
accidental** — they are intentional state mutations that the system is
supposed to commit.

### 2. The actual leak path

The cycle is self-perpetuating, not random:

1. The dirty-skip watchdog at `autonomous-improve.sh:253-307` files a
   `critical / pending / source=auto-discovered` row whenever 3 consecutive
   SKIPs occur. The system has accumulated **28 such rows (1500-1527)** since
   2026-04-28, all of them still `pending`.
2. At cycle start the work-selector loop at `autonomous-improve.sh:589-599`
   picks the highest-priority pending issue. Because 1500-1527 are all
   `priority=critical`, **one of them is selected every single cycle**.
3. `csv_increment_attempts issues "$ISSUE_ID"` at `autonomous-improve.sh:605`
   writes the bumped `decompose_attempts` value (and an updated `updated_at`)
   to `scripts/pipeline/issues.csv` **on PROJECT_DIR**, before the worktree
   is entered. The write is real and on-disk; nothing has staged or committed
   it yet.
4. `decompose-issue.sh` is invoked at `autonomous-improve.sh:608`. It commits
   on its two “normal” exits (success → L322, undecomposable → L305) but has
   **three early-exit paths that leave the increment uncommitted**:
   - exit 2 (claude rate-limit) → handled by `autonomous-improve.sh:612-615`
     with `exit 0`. **No commit.**
   - exit 3 (`CREATED_COUNT==0` and not the placeholder branch) at
     `decompose-issue.sh:312`. **No commit.** Returns to `autonomous-improve.sh`
     which falls through to L634 “WARN: decomposition produced no tasks” and
     never re-stages issues.csv.
   - exit 4 (queue cap) → `autonomous-improve.sh:616-621` rolls
     `decompose_attempts` back via `csv_set_field`, but that *itself* writes
     issues.csv again (and bumps `updated_at`), so the file is still dirty
     vs HEAD. **No commit.**
5. Cycle exits with `scripts/pipeline/issues.csv` modified.
6. Next cron firing → `autonomous-improve.sh:249` sees `M issues.csv` →
   logs `SKIP: Main working directory dirty` → counter at
   `/tmp/graph-island-dirty-skip-count` increments.
7. After 3 SKIPs the alert at L266 fires, calls
   `csv_lib.py insert issues …` and `git add scripts/pipeline/issues.csv "$DESC"
   && git commit -m "chore(alert): autonomous stalled — N consecutive dirty
   SKIPs"`. The `git add` sweeps in **both** the leftover dirty row and the
   new alert row, so this commit cleans the tree — but it also adds *another*
   `critical / pending` row to the queue, ensuring step 2 picks a stalled-skip
   issue again next cycle.

This is confirmed by the per-commit diffs of `chore(alert): …`: the only
content change is `decompose_attempts` of one of the 1500-series rows being
incremented by 1, plus the new `1527-…` row appended at the bottom. See e.g.
`d6850347` (1513.attempts 0→1), `03ce05aa` (1513.attempts 1→2),
`67356bdf` (1513.attempts 2→3), `6d398274` (1514.attempts 0→1).

### 3. Classification of the leftover write

`decompose_attempts` and `updated_at` are **state that should be committed**,
not gitignored or `.local`-d:
- `.gitignore` is wrong: the value gates retry budget. If lost on each pull
  the system would re-decompose forever.
- A `.local` sidecar (cf. `data-snapshots.json` in
  `project_snapshots_sidecar.md`) is wrong here for the same reason: the
  retry counter must be visible to humans triaging the queue and to the
  parallel autonomous worktrees.
- Committing it is correct. The bug is **not what is written**, it is **the
  three early-exit paths that fail to commit it**.

### 4. Single-option fix proposal

Add a `trap … EXIT` near the top of `autonomous-improve.sh` (after L41
`cd "$PROJECT_DIR"`) that, on any exit, auto-commits any leftover dirty
state in the CSV bookkeeping paths only:

```bash
_csv_safety_commit() {
  cd "$PROJECT_DIR" 2>/dev/null || return 0
  if [[ -n "$(git status --porcelain scripts/pipeline/issues.csv \
                                     scripts/pipeline/tasks.csv \
                                     scripts/pipeline/attempts.csv \
                                     scripts/pipeline/descriptions/ 2>/dev/null)" ]]; then
    git add scripts/pipeline/issues.csv scripts/pipeline/tasks.csv \
            scripts/pipeline/attempts.csv scripts/pipeline/descriptions/ 2>/dev/null
    git commit -m "chore(auto): rescue uncommitted CSV bookkeeping ($SESSION_ID)" \
      --no-verify 2>/dev/null || true
  fi
}
trap _csv_safety_commit EXIT
```

Rationale:
- Self-healing: catches all current and future early-exit paths without
  having to audit every `exit 0/2/3/4` in the call tree.
- Minimal blast radius: the trap only stages the four pipeline bookkeeping
  paths, never `src/`, never tests, never `main.js`. It cannot accidentally
  ship code.
- Composes with existing per-script commits: `git commit` on a clean tree
  is a no-op, so the trap is idempotent vs the writer-side commits already
  in place at decompose-issue.sh:305/322 and friends.
- Side-benefit: the watchdog at L249 still triggers if a *non-CSV* file is
  dirty (e.g. someone left a half-applied ratchet on main), so the original
  stall-detection invariant is preserved.

Out of scope for this investigation subtask — implementation will be a
separate sibling subtask under 1517.


