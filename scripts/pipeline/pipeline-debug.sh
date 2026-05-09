#!/usr/bin/env bash
# pipeline-debug.sh — Print step-by-step recovery instructions based on
# pipeline-status.sh output. Read-only helper: no side effects.
#
# When pipeline-status.sh reports CRITICAL or WARN, the operator usually
# knows *something* is wrong but not what to do next. This script parses
# the one-line status and prints the matching recovery guide in markdown.
#
# Usage: bash scripts/pipeline/pipeline-debug.sh
#
# Exit code: always 0 (this is a guide, not a check).
set -uo pipefail

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
STATUS_LINE=$(bash "$PROJECT_DIR/scripts/pipeline/pipeline-status.sh" 2>&1 || true)

echo "Status: $STATUS_LINE"
echo ""

case "$STATUS_LINE" in
  "CRITICAL: kill-switch active"*)
    cat <<'GUIDE'
## CRITICAL: Pipeline manually disabled

The kill-switch file `.pipeline-disabled` exists. All 7 cron scripts are
bypassing their cycles and will not run until this file is removed.

### Recovery
```bash
# 1. Verify why kill-switch was set (operator note?)
ls -la /home/ubuntu/obsidian-plugins/obsidian-graph-island/.pipeline-disabled

# 2. Remove kill-switch to resume
rm /home/ubuntu/obsidian-plugins/obsidian-graph-island/.pipeline-disabled

# 3. Verify next cron tick
tail -f /tmp/graph-island-improve.log
```

### When to use the kill-switch
- Active kaizen session (uncommitted pipeline changes)
- Emergency stop during outage
- Manual intervention required (do NOT remove without checking)
GUIDE
    ;;
  "CRITICAL: autonomous-improve stalled"*)
    cat <<'GUIDE'
## CRITICAL: autonomous-improve stalled

The main working tree has uncommitted changes. autonomous-improve.sh
has skipped N consecutive cycles. The dirty-skip alert was filed at
threshold (3 cycles); the counter clears on the next non-SKIP cycle.

### Recovery
```bash
# 1. Inspect dirty changes
cd /home/ubuntu/obsidian-plugins/obsidian-graph-island
git status --short
git diff --stat

# 2a. Commit if work is ready
git add <files>
git commit -m "..."

# 2b. OR stash if mid-work
git stash --include-untracked

# 3. Verify next cycle proceeds
tail -f /tmp/graph-island-improve.log
```
GUIDE
    ;;
  "CRITICAL: pipeline tests broken"*)
    cat <<'GUIDE'
## CRITICAL: Pipeline self-tests failing

`tests/pipeline/run-all.sh` failed. autonomous-improve.sh refuses to
run on broken pipeline foundations (R5-B pre-flight gate).

### Recovery
```bash
# 1. See which tests failed
bash tests/pipeline/run-all.sh -v 2>&1 | tail -40

# 2. Fix the tests on main (not on auto-improve-* branch — pre-edit-guard
#    blocks autonomous edits to scripts/pipeline/*.sh)

# 3. Verify
bash tests/pipeline/run-all.sh -q
```
GUIDE
    ;;
  "WARN: decompose throttle"*)
    cat <<'GUIDE'
## WARN: Decompose throttle active

There are X pending tasks vs cap Y. The decomposer (`decompose-issue.sh`)
is skipping new decompositions until the queue drains. Implementation
loop will catch up over time.

### To inspect
```bash
bash scripts/pipeline/audit-pr-backlog.sh
cat /tmp/graph-island-progress.md
```

### To raise the cap (if you really need to push more in)
```bash
DECOMPOSE_THROTTLE_CAP=300 bash scripts/pipeline/decompose-issue.sh <issue-id>
```
GUIDE
    ;;
  "WARN: local main"*)
    cat <<'GUIDE'
## WARN: Local main behind origin

R1 P1-B auto-recovery handles this if working tree is clean. If it
keeps reporting WARN, check for non-FF divergence.

### Recovery
```bash
# 1. Confirm working tree is clean
git status --short

# 2. Try fast-forward
git pull --ff-only origin main

# 3. If FF fails (divergence), inspect
git log HEAD..origin/main --oneline
```
GUIDE
    ;;
  "WARN: "*"open auto-improve"*)
    cat <<'GUIDE'
## WARN: PR backlog over cap

There are N auto-improve-* PRs open vs cap 20. auto-stale-pr-close
(every 6h) and auto-merge-pr (every 30m) drain naturally. Use
pr-drainage.sh for manual acceleration.

### Recovery
```bash
# 1. Audit current backlog
bash scripts/pipeline/audit-pr-backlog.sh --auto-improve-only

# 2. Generate drainage script (review before running)
bash scripts/pipeline/pr-drainage.sh > /tmp/drainage.sh
less /tmp/drainage.sh
bash /tmp/drainage.sh
```
GUIDE
    ;;
  "OK:"*)
    cat <<'GUIDE'
## OK: Pipeline healthy

No action required. Next checks (operator routine):
- `bash scripts/pipeline/audit-pr-backlog.sh` — backlog detail
- `cat /tmp/graph-island-progress.md` — full kaizen metrics
- `git log --oneline -20` — recent autonomous activity
GUIDE
    ;;
  *)
    echo "## Unknown status: cannot match recovery guide"
    echo ""
    echo "Status line: $STATUS_LINE"
    echo ""
    echo "Please report this to maintainers — pipeline-debug.sh case patterns"
    echo "may be out of sync with pipeline-status.sh output formats."
    ;;
esac
