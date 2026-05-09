#!/usr/bin/env bash
# ============================================================
# autonomous-improve.sh — Headless autonomous improvement cycle
# ============================================================
# Supports up to MAX_SESSIONS parallel instances via git worktrees.
# Each session gets its own worktree, runs independently, and
# merges results back to main on success.
#
# crontab: 7,37 * * * * .../autonomous-improve.sh >> /tmp/graph-island-improve.log 2>&1
# ============================================================
set -uo pipefail

# ── Heartbeat (2026-05-09 R11-A kaizen) ──
# Touch the log file at startup so cron-health.sh (R9-C) can detect that
# the cron actually fired, even if subsequent guards (kill-switch /
# dirty-skip / exit) bail before any normal output is produced.
LOG_FILE="${AUTONOMOUS_IMPROVE_LOG_FILE:-/tmp/graph-island-improve.log}"
{ printf '[heartbeat] %s autonomous-improve started\n' "$(date -Iseconds)"; } >> "$LOG_FILE" 2>/dev/null || true

# ── Kill-switch (2026-05-08 kaizen) ──
# Operator can disable the entire autonomous pipeline by creating
# $PROJECT_DIR/.pipeline-disabled (touch the file). All cron scripts
# bail at exit 0 so cron sees no error. Re-enable by removing the file.
PIPELINE_DISABLE_FILE="${PIPELINE_DISABLE_FILE:-/home/ubuntu/obsidian-plugins/obsidian-graph-island/.pipeline-disabled}"
if [[ -f "$PIPELINE_DISABLE_FILE" ]]; then
  echo "PIPELINE-DISABLED: $PIPELINE_DISABLE_FILE exists — skipping cycle" >&2
  exit 0
fi

# ── Environment ──
export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
LOG_FILE="/tmp/graph-island-improve.log"
RESULT_DIR="/tmp/graph-island-improve-results"
MAX_LOG_SIZE=$((10 * 1024 * 1024))
MAX_SESSIONS=1  # 2026-05-02 Phase R4: was 2 — disabling parallel cycles entirely
                 # belt-and-suspenders alongside csv_atomic_*. With cron at
                 # `0 */1` (R3), there is no throughput cost to dropping to 1.
MAX_ITERATIONS=3
MAX_TURNS=30

# ── Token-saving knobs (kaizen 2026-04-24) ──
# These were added to prevent rate-limit burning from */5 cron + 4-way parallel.
DEBUG_RETRY_COUNT=1          # 2026-05-03 (Phase R6): was 0 (Phase R3).
                              # R3 with 0 produced 75% ABORT in 12h (decompose
                              # quality + no recovery path). With R6 decompose
                              # gate (≥80-char desc, src/ path required), 1
                              # retry given a gate-specific recovery hint
                              # is cheap and recovers the typical typecheck/
                              # format/godobj failures without manual intervention.
SIMPLIFY_ENABLED=false       # was implicit true — simplify step after review findings
KAIZEN_PENDING_THRESHOLD=0   # was 5 — only run kaizen when pending==0

# ── Queue caps (kaizen 2026-04-25) ──
# Manual triage at 38 active tasks revealed quality decay (duplicates,
# placeholders, undecomposable items). Cap active tasks so the queue stays
# scannable. Active = pending|in-progress|decomposed.
MAX_TOTAL_TASKS=${MAX_TOTAL_TASKS:-50}
export MAX_TOTAL_TASKS

# shellcheck source=/dev/null
. "$PROJECT_DIR/scripts/pipeline/csv-helpers.sh"

cd "$PROJECT_DIR" || exit 1

# ── Log rotation ──
if [[ -f "$LOG_FILE" ]] && [[ $(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
fi
mkdir -p "$RESULT_DIR"

# ── Session ID ──
SESSION_ID="auto-$(date +%Y%m%d-%H%M%S)-$$"
SESSION_LOG="$RESULT_DIR/$SESSION_ID.log"

log() { echo "[$(date -Iseconds)] [$SESSION_ID] $*" | tee -a "$SESSION_LOG"; }

# ── Pre-flight self-test (2026-05-09 kaizen) ──
# Run pipeline unit tests before entering the autonomous loop. If they
# fail the loop would build on broken foundations (csv_lib, verify-issue-done,
# csv-helpers — all critical to correctness). Past incident: commit
# 5924e352 traced a critical csv_lib cmd_archive bug to "tests rotted"
# while autonomous loop kept running. Now we fail-fast.
PREFLIGHT_LOG="${PREFLIGHT_LOG:-/tmp/graph-island-preflight.log}"
if [[ -x "$PROJECT_DIR/tests/pipeline/run-all.sh" ]]; then
  if ! bash "$PROJECT_DIR/tests/pipeline/run-all.sh" -q > "$PREFLIGHT_LOG" 2>&1; then
    log "PRE-FLIGHT FAILED — pipeline tests broken; aborting autonomous cycle"
    log "  see $PREFLIGHT_LOG for failed test names"
    SUMMARY="autonomous-improve aborted: pipeline self-tests failing"
    BODY=$(cat <<EOF_BODY
## Detected
\`tests/pipeline/run-all.sh -q\` failed. Autonomous loop refuses to run on
broken pipeline foundations.

## Failed tests (last 30 lines of preflight log)
\`\`\`
$(tail -30 "$PREFLIGHT_LOG")
\`\`\`

## Recovery
1. Inspect: \`bash tests/pipeline/run-all.sh -v\`
2. Fix the failing tests on main
3. Counter clears automatically on the next non-fail cycle
EOF_BODY
    )
    if RESULT=$(csv_file_alert "pipeline-tests-broken" critical "$SUMMARY" "$BODY" 2>&1); then
      log "ALERT FILED: critical issue #${RESULT}"
    else
      log "ALERT SUPPRESSED: pending pipeline-tests-broken alert already exists"
    fi
    exit 1
  fi
fi

# ── Rate-limit-aware claude wrapper (kaizen 2026-04-24) ──
# Captures claude -p output, detects rate-limit/quota messages, and exits the
# whole cycle with exit 0 (not error) when detected — no point spending more
# API calls once we're throttled. Returns claude's exit code otherwise.
_claude_guard() {
  local tmp
  tmp=$(mktemp)
  claude "$@" >"$tmp" 2>&1
  local rc=$?
  if grep -qiE "you've hit your limit|rate limit|quota exceeded|resets[[:space:]]+[0-9]+(am|pm)" "$tmp"; then
    log "RATE LIMIT detected — aborting cycle early (no more claude -p calls)"
    tail -3 "$tmp" | while IFS= read -r l; do log "  $l"; done
    rm -f "$tmp"
    # Mark cycle outcome, release worktree via trap, exit cleanly
    exit 0
  fi
  tail -5 "$tmp" | while IFS= read -r l; do log "  $l"; done
  rm -f "$tmp"
  return $rc
}

log "================================================================"
log "AUTONOMOUS IMPROVE CYCLE START"
log "================================================================"

# ── Cleanup zombie/orphan processes from previous sessions ──
# Skip if e2e-patrol is running (don't kill its processes)
E2E_PATROL_RUNNING=false
if [[ -f /tmp/graph-island-e2e-patrol.lock ]]; then
  E2E_PID=$(cat /tmp/graph-island-e2e-patrol.lock 2>/dev/null || echo "0")
  kill -0 "$E2E_PID" 2>/dev/null && E2E_PATROL_RUNNING=true
fi

if [[ "$E2E_PATROL_RUNNING" == true ]]; then
  log "e2e-patrol running (PID $E2E_PID) — skipping zombie cleanup"
else
  # visual-report.ts orphans (pre-fix sessions that never called browser.close)
  ZOMBIE_VR=$(pgrep -f "tsx scripts/pipeline/visual-report" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_VR -gt 0 ]]; then
    pkill -9 -f "tsx scripts/pipeline/visual-report" 2>/dev/null
    log "Killed $ZOMBIE_VR zombie visual-report processes"
  fi
  # playwright orphans (not from active e2e-patrol)
  ZOMBIE_PW=$(pgrep -f "playwright.*cdp-smoke" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_PW -gt 0 ]]; then
    pkill -9 -f "playwright.*cdp-smoke" 2>/dev/null
    log "Killed $ZOMBIE_PW zombie playwright processes"
  fi
  # esbuild daemon orphans (keep 2 for active sessions)
  ZOMBIE_ES=$(pgrep -f "esbuild --service" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_ES -gt 2 ]]; then
    pkill -9 -f "esbuild --service" 2>/dev/null
    log "Killed $ZOMBIE_ES zombie esbuild processes"
  fi
  # vitest worker orphans (keep 4 for active sessions)
  ZOMBIE_VT=$(pgrep -f "vitest.mjs" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_VT -gt 4 ]]; then
    pkill -9 -f "vitest.mjs" 2>/dev/null
    log "Killed $ZOMBIE_VT zombie vitest processes"
  fi
  # claude CLI orphans (rate-limited / hung from decompose-issue, implement-with-gates, etc.)
  ZOMBIE_CL=$(pgrep -f "^claude -p" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_CL -gt 0 ]]; then
    pkill -9 -f "^claude -p" 2>/dev/null
    log "Killed $ZOMBIE_CL zombie claude processes"
  fi
  # tsx orphans (general; visual-report-specific cleanup is above)
  ZOMBIE_TSX=$(pgrep -f "^tsx " 2>/dev/null | wc -l)
  if [[ $ZOMBIE_TSX -gt 0 ]]; then
    pkill -9 -f "^tsx " 2>/dev/null
    log "Killed $ZOMBIE_TSX zombie tsx processes"
  fi
  # Xvfb / isolated obsidian orphans (only when e2e-patrol lock absent — already gated by outer if)
  ZOMBIE_XV=$(pgrep -f "Xvfb :99" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_XV -gt 0 ]]; then
    pkill -9 -f "Xvfb :99" 2>/dev/null
    log "Killed $ZOMBIE_XV zombie Xvfb processes"
  fi
  ZOMBIE_OB=$(pgrep -f "obsidian.*--user-data-dir.*obsidian-e2e" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_OB -gt 0 ]]; then
    pkill -9 -f "obsidian.*--user-data-dir.*obsidian-e2e" 2>/dev/null
    log "Killed $ZOMBIE_OB zombie isolated obsidian processes"
  fi
fi

# ── Pre-flight checks ──
if ! command -v claude &>/dev/null; then
  log "ERROR: claude CLI not found"
  exit 1
fi

if ! node -e "process.exit(0)" 2>/dev/null; then
  log "ERROR: node not working"
  exit 1
fi

# ── Count active sessions via lock directory (not pgrep) ──
LOCK_DIR="/tmp/graph-island-sessions"
mkdir -p "$LOCK_DIR"
# Clean stale locks (PID dead OR session older than 2 hours)
MAX_SESSION_AGE=7200  # 2 hours
for lockfile in "$LOCK_DIR"/*.pid; do
  [[ -f "$lockfile" ]] || continue
  LOCK_PID=$(cat "$lockfile" 2>/dev/null || echo "0")
  LOCK_AGE=$(( $(date +%s) - $(stat -c%Y "$lockfile" 2>/dev/null || echo "$(date +%s)") ))
  if ! kill -0 "$LOCK_PID" 2>/dev/null || [[ $LOCK_AGE -gt $MAX_SESSION_AGE ]]; then
    kill -9 "$LOCK_PID" 2>/dev/null  # force kill if still alive but too old
    rm -f "$lockfile"
    log "CLEANED: stale lock $(basename $lockfile) (PID=$LOCK_PID, age=${LOCK_AGE}s)"
  fi
done
# session-create lock — atomic check-and-claim (prevents TOCTOU race when
# two cron ticks fire simultaneously and both observe ACTIVE_COUNT < MAX)
SESSION_CREATE_LOCK="/tmp/graph-island-session-create.lock"
exec 200>"$SESSION_CREATE_LOCK"
flock -n 200 || { log "SKIP: another session-create in progress (flock contention)"; exit 0; }

ACTIVE_COUNT=$(find "$LOCK_DIR" -maxdepth 1 -name '*.pid' 2>/dev/null | wc -l)
if [[ $ACTIVE_COUNT -ge $MAX_SESSIONS ]]; then
  flock -u 200
  log "SKIP: $ACTIVE_COUNT sessions running (max $MAX_SESSIONS)"
  exit 0
fi
echo $$ > "$LOCK_DIR/$SESSION_ID.pid"
flock -u 200

# Orphan worktree/branch cleanup. The cleanup() trap at L519 handles
# graceful exits, but SIGKILL/OOM/host-reboot skip trap → both worktree
# dir AND local branch leak. Walk .autonomous-worktrees/, extract trailing
# PID from the dir name (auto-YYYYMMDD-HHMMSS-PID), drop the worktree if
# the PID is dead. Idempotent; live sessions' worktrees are preserved.
for wt in "$PROJECT_DIR"/.autonomous-worktrees/auto-*; do
  [[ -d "$wt" ]] || continue
  WT_ID=$(basename "$wt")
  WT_PID="${WT_ID##*-}"
  if [[ "$WT_PID" =~ ^[0-9]+$ ]] && ! kill -0 "$WT_PID" 2>/dev/null; then
    log "ORPHAN: removing worktree $WT_ID (PID $WT_PID dead)"
    git worktree remove "$wt" --force 2>/dev/null || rm -rf "$wt"
    git branch -D "auto-improve-$WT_ID" 2>/dev/null || true
  fi
done
git worktree prune 2>/dev/null || true

# Session already registered atomically above under flock(200).
log "Active sessions: $ACTIVE_COUNT/$MAX_SESSIONS — proceeding"

# ── Handle orphaned in-progress items (issues + tasks) ──
# FIX A (2026-04-25): timed-out tasks are no longer re-SUBDIVIDEd. Re-decompose
# was the root cause of chain explosion: task 1172-... was SUBDIVIDEd 22 times,
# generating 765 descendants under a single ROOT issue. Timed-out tasks now
# go straight to `blocked` and the cycle moves on.
#
# FIX B (2026-04-25): Issues track `decompose_attempts:` in frontmatter and are
# blocked after MAX_ISSUE_ATTEMPTS=2 failed rounds (was 3, lowered for token reduction). Previously issue
# `144-coverage-drop` was picked 86 times in 24h — each time tasks/ drained,
# the issue got re-decomposed, always failed, and re-entered the queue.
# CSV state lives in scripts/pipeline/{issues,tasks}.csv + descriptions/.
MAX_ISSUE_ATTEMPTS=2  # 2026-04-30 token-reduction (Phase R3): was 3

NOW=$(date +%s)
# CSV-mode timed-out scan: walk both kinds via CSV instead of glob+stat.
# Uses updated_at as the age proxy (file mtime equivalent). Active rows
# with status=in-progress and age > IN_PROGRESS_TIMEOUT are timed out.
#
# Threshold MUST exceed the longest legitimate session duration. Sessions
# can run up to MAX_SESSION_AGE=7200s (2h) per the lock-cleanup policy at
# L140, so anything shorter (e.g. the previous 600s) caused live tasks to
# be falsely timed out by the next-hour cron tick. Use MAX_SESSION_AGE
# directly so the two thresholds stay coupled.
IN_PROGRESS_TIMEOUT=$MAX_SESSION_AGE
for kind in tasks issues; do
  for ID in $(csv_select_by_status "$kind" in-progress 2>/dev/null); do
    UPDATED=$(csv_get_field "$kind" "$ID" updated_at 2>/dev/null)
    [[ -n "$UPDATED" ]] || continue
    # Fallback to 0 (Unix epoch) on parse failure → FILE_AGE is huge → row
    # is treated as expired and timed out. The previous fallback of $NOW
    # produced FILE_AGE=0 → never timed out → unparseable timestamps left
    # rows stuck in-progress forever. The peer fallback at L291 already
    # uses 0 for the same reason; harmonize here.
    UPDATED_EPOCH=$(date -d "$UPDATED" +%s 2>/dev/null || echo 0)
    FILE_AGE=$(( NOW - UPDATED_EPOCH ))
    [[ $FILE_AGE -gt $IN_PROGRESS_TIMEOUT ]] || continue

    if [[ "$kind" == "tasks" ]]; then
      # FIX A: Timed-out task → straight to blocked. No re-SUBDIVIDE.
      log "BLOCKED: $ID timed out after ${FILE_AGE}s (no re-SUBDIVIDE)"
      csv_atomic_set_status tasks "$ID" blocked \
        "chore: block timed-out task $ID" 2>/dev/null || true
    else
      # Issue timed out → bump decompose_attempts, or block if exhausted.
      # Note: empty-lock-dir branch is dead at this point (this session's own
      # lock was created at L157), but kept as defensive belt-and-suspenders.
      ORPHANED=false
      if [[ -z "$(find "$LOCK_DIR" -maxdepth 1 -name '*.pid' 2>/dev/null | head -1)" ]]; then
        ORPHANED=true
      elif [[ $FILE_AGE -gt $IN_PROGRESS_TIMEOUT ]]; then
        ORPHANED=true
      fi
      if [[ "$ORPHANED" == true ]]; then
        DECOMPOSE_ATTEMPTS=$(csv_get_field issues "$ID" decompose_attempts 2>/dev/null)
        DECOMPOSE_ATTEMPTS=${DECOMPOSE_ATTEMPTS:-0}
        if [[ "$DECOMPOSE_ATTEMPTS" -ge "$MAX_ISSUE_ATTEMPTS" ]]; then
          log "BLOCKED: $ID — $DECOMPOSE_ATTEMPTS attempts exhausted (max $MAX_ISSUE_ATTEMPTS)"
          csv_atomic_set_status issues "$ID" blocked \
            "chore: block exhausted issue $ID ($DECOMPOSE_ATTEMPTS attempts)" 2>/dev/null || true
          continue
        fi
        NEXT_ATTEMPT=$((DECOMPOSE_ATTEMPTS + 1))
        # set_field + append_attempt + set_status: bundle them under one
        # commit instead of three separate windows.
        csv_set_field issues "$ID" decompose_attempts "$NEXT_ATTEMPT" 2>/dev/null || true
        csv_append_attempt issues "$ID" \
          "Continue from where the last session left off. Do not repeat already-attempted approaches." \
          "timed out after 1h" >/dev/null 2>&1 || true
        csv_atomic_set_status issues "$ID" pending \
          "chore: carryover stale issue $ID (attempt $NEXT_ATTEMPT)" 2>/dev/null || true
        log "CARRYOVER: $ID → pending (attempt $NEXT_ATTEMPT/$MAX_ISSUE_ATTEMPTS, age: ${FILE_AGE}s)"
      fi
    fi
  done
done

# ── FIX C5 (2026-04-25): revive stuck `decomposed` issues ──
# When a child task fails, status goes to `blocked`, but the parent issue
# stays `decomposed` forever. If ALL children of an issue are blocked/done
# (= no live child to drive progress) AND decompose_attempts < MAX, revert
# the issue to `pending` so a later cycle can re-decompose it into a new
# task set with different scoping. If attempts are already exhausted, mark
# the issue `blocked` so it stops wasting queue scans.
for ID in $(csv_select_by_status issues decomposed 2>/dev/null); do
  # Count live child tasks via CSV (parent FK match by id-prefix or parent col)
  ALIVE=0
  for CHILD_ID in $(csv_select_by_parent tasks "$ID" 2>/dev/null); do
    CST=$(csv_get_status tasks "$CHILD_ID" 2>/dev/null)
    if [[ "$CST" == "pending" || "$CST" == "in-progress" ]]; then
      ALIVE=$((ALIVE + 1))
    fi
  done
  [[ "$ALIVE" -gt 0 ]] && continue
  ATTEMPTS=$(csv_get_field issues "$ID" decompose_attempts 2>/dev/null)
  ATTEMPTS=${ATTEMPTS:-0}
  if [[ "$ATTEMPTS" -ge "$MAX_ISSUE_ATTEMPTS" ]]; then
    log "BLOCKED: $ID — no live children & $ATTEMPTS attempts exhausted"
    csv_atomic_set_status issues "$ID" blocked \
      "chore: block exhausted issue $ID ($ATTEMPTS attempts)" 2>/dev/null || true
  else
    log "REVIVE: $ID — no live children, decomposed→pending (attempts=$ATTEMPTS/$MAX_ISSUE_ATTEMPTS)"
    csv_atomic_set_status issues "$ID" pending \
      "chore: revive stuck issue $ID (all children blocked, attempts=$ATTEMPTS)" 2>/dev/null || true
  fi
done

# ── Phase R6 (2026-05-03): auto-unblock stale BLOCKED tasks/issues ──
# Phase R7 (2026-05-03): track unblock attempts via the description file
# so a task that fails again after being auto-unblocked twice is permanently
# cancelled. Without this cap, a structurally-broken task would cycle
# blocked → pending → blocked → pending forever, burning tokens each time.
NOW_TS=$(date +%s)
UNBLOCK_AGE=86400  # 24h
UNBLOCK_CAP=2      # after this many auto-unblocks, mark as cancelled
for kind in tasks issues; do
  for ID in $(csv_select_by_status "$kind" blocked 2>/dev/null); do
    UPDATED=$(csv_get_field "$kind" "$ID" updated_at 2>/dev/null)
    [[ -z "$UPDATED" ]] && continue
    UPDATED_TS=$(date -d "$UPDATED" +%s 2>/dev/null || echo 0)
    AGE=$((NOW_TS - UPDATED_TS))
    if [[ $AGE -le $UNBLOCK_AGE ]]; then continue; fi

    # Count prior auto-unblock markers in the description file
    DESC_REL=$(csv_get_field "$kind" "$ID" description_path 2>/dev/null)
    DESC_PATH=""
    if [[ -n "$DESC_REL" ]]; then
      DESC_PATH="$PROJECT_DIR/scripts/pipeline/$DESC_REL"
    fi
    PRIOR_UNBLOCKS=0
    if [[ -n "$DESC_PATH" && -f "$DESC_PATH" ]]; then
      PRIOR_UNBLOCKS=$(grep -c '^- AUTO-UNBLOCK ' "$DESC_PATH" 2>/dev/null || echo 0)
      PRIOR_UNBLOCKS=${PRIOR_UNBLOCKS//[^0-9]/}
      PRIOR_UNBLOCKS=${PRIOR_UNBLOCKS:-0}
    fi

    if [[ $PRIOR_UNBLOCKS -ge $UNBLOCK_CAP ]]; then
      log "CANCEL: $kind $ID — auto-unblocked $PRIOR_UNBLOCKS times already, structurally stuck"
      if [[ -n "$DESC_PATH" && -f "$DESC_PATH" ]]; then
        echo "" >> "$DESC_PATH"
        echo "## Auto-cancelled" >> "$DESC_PATH"
        echo "$(date -I): cancelled after $PRIOR_UNBLOCKS auto-unblock attempts (each followed by another ABORT/BLOCK)." >> "$DESC_PATH"
      fi
      csv_atomic_set_status "$kind" "$ID" cancelled \
        "chore: cancel $kind $ID — $PRIOR_UNBLOCKS auto-unblock attempts exhausted" 2>/dev/null || true
      continue
    fi

    log "AUTO-UNBLOCK: $kind $ID — blocked for ${AGE}s (>24h), unblock #$((PRIOR_UNBLOCKS + 1))/$UNBLOCK_CAP"
    if [[ -n "$DESC_PATH" && -f "$DESC_PATH" ]]; then
      echo "" >> "$DESC_PATH"
      echo "- AUTO-UNBLOCK $(date -I): blocked for ${AGE}s, attempt $((PRIOR_UNBLOCKS + 1))/$UNBLOCK_CAP" >> "$DESC_PATH"
    fi
    if [[ "$kind" == "tasks" ]]; then
      csv_set_field tasks "$ID" attempt_count 0 2>/dev/null || true
    else
      csv_set_field issues "$ID" decompose_attempts 0 2>/dev/null || true
    fi
    csv_atomic_set_status "$kind" "$ID" pending \
      "chore: auto-unblock $kind $ID (24h+ stale, attempt $((PRIOR_UNBLOCKS + 1))/$UNBLOCK_CAP)" 2>/dev/null || true
  done
done

# ── Ensure main is clean for worktree creation ──
cd "$PROJECT_DIR" || exit 1
if [[ -n "$(git status --porcelain)" ]]; then
  log "SKIP: Main working directory dirty"
  log "  HEAD: $(git log --oneline -1 2>/dev/null || echo unknown)"
  git status --short | head -5 | while IFS= read -r line; do log "  $line"; done

  # ── Phase R2 (2026-04-27): consecutive-dirty-SKIP watchdog ──
  # On 2026-04-27 the autonomous gate SKIP-ed for 22 hours straight because
  # the operator left an uncommitted chmod / ratchet update on main and
  # nothing alerted them. Track consecutive SKIPs in a state file; after
  # the threshold, file a *critical* issue so the next status report (or a
  # human glance at issues.csv) surfaces the stall immediately.
  DIRTY_THRESHOLD=3   # 3 cycles ≈ 1 hour at */20
  cur=$(dirty_skip_bump)
  log "DIRTY-SKIP COUNT: $cur (threshold=$DIRTY_THRESHOLD)"
  if [[ $cur -eq $DIRTY_THRESHOLD ]]; then
    DIRTY_FILES=$(git status --porcelain | head -5 | tr '\n' '|' | sed 's/|$//')
    BODY=$(cat <<EOF_BODY
## Detected
autonomous-improve.sh has skipped $cur cycles in a row because
main has uncommitted changes. The pipeline is effectively halted.

## Working-tree contents (first 5)
\`\`\`
$(git status --short | head -5)
\`\`\`

## Recovery
1. Inspect changes: \`git -C $PROJECT_DIR diff\`
2. Either commit or stash so working tree is clean
3. Counter clears automatically on the next non-SKIP cycle
EOF_BODY
    )
    SUMMARY="autonomous-improve has SKIP-ed ${DIRTY_THRESHOLD}+ consecutive cycles (dirty: ${DIRTY_FILES})"
    if RESULT=$(csv_file_alert "autonomous-stalled-dirty-skip" critical "$SUMMARY" "$BODY"); then
      log "ALERT FILED: critical issue #${RESULT}"
    else
      log "ALERT SUPPRESSED: pending dirty-skip alert already exists"
    fi
  fi

  exit 0
fi
# Clear the dirty-skip counter on any non-SKIP cycle.
dirty_skip_clear

# ── Bifurcation guard ──
# autonomous-improve operates on local main, but PR merges land on origin/main.
# If local main has not been pulled for a while it can drift far behind origin
# (observed 2026-05-06: 7 substantive PRs merged on origin while local stayed
# at the older tip, causing extract tasks to reference helper files that did
# not exist locally → guaranteed false-done). Abort + alert when the gap is
# wide so the operator pulls before the next cycle.
BIFURCATION_THRESHOLD=5
git fetch origin main --quiet 2>/dev/null || true
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [[ "$behind" -ge "$BIFURCATION_THRESHOLD" ]]; then
  # ── Auto-recovery (2026-05-08 kaizen) ──
  # If working tree is clean we can try a fast-forward pull. Only abort
  # when the FF fails (divergence, not just lag). This eliminates the
  # 2026-05-06 false-done cascade root cause: local main 7 commits
  # behind origin → extract tasks reference helpers that did not exist
  # locally → guaranteed false-done until human pulled.
  if [[ -z "$(git status --porcelain)" ]]; then
    log "AUTO-RECOVERY: local main is $behind commits behind, attempting fast-forward pull..."
    if git pull --ff-only origin main --quiet 2>/dev/null; then
      new_behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
      log "AUTO-RECOVERY: pulled successfully (now $new_behind behind)"
      behind="$new_behind"
    else
      log "AUTO-RECOVERY: FF-only pull failed (non-FF divergence) — falling through to abort"
    fi
  fi
fi

# Re-check after recovery attempt
if [[ "$behind" -ge "$BIFURCATION_THRESHOLD" ]]; then
  log "ABORT: local main is $behind commits behind origin/main (threshold=$BIFURCATION_THRESHOLD)"
  BODY=$(cat <<EOF_BODY
## Detected
local main is $behind commits behind origin/main. autonomous-improve runs
against local, so any extract task referencing files merged into origin
(but not yet pulled) is impossible to satisfy and produces false-done
or false-blocked outcomes.

## Recovery
1. Inspect: \`git -C $PROJECT_DIR log HEAD..origin/main --oneline\`
2. Pull: \`git -C $PROJECT_DIR pull --rebase origin main\`
3. Resolve any conflicts (typically state-flip CSV rows)
4. The next cycle will detect zero gap and proceed normally
EOF_BODY
  )
  SUMMARY="local main is $behind commits behind origin/main — autonomous halted"
  if RESULT=$(csv_file_alert "autonomous-stalled-bifurcation" critical "$SUMMARY" "$BODY"); then
    log "ALERT FILED: critical issue #${RESULT}"
  else
    log "ALERT SUPPRESSED: pending bifurcation alert already exists"
  fi
  exit 0
fi

# ── Backlog throttle (kaizen 2026-05-07) ──
# autonomous emits ~1 PR/cycle but merge rate has collapsed to ~0%, so the
# OPEN auto-improve-* backlog grew 30 → 50 → 100 → 190 over a few days.
# auto-stale-pr-close runs only every 6h and cannot keep up. Cap the open
# backlog: when it exceeds MAX_OPEN_AUTO_PRS, skip the cycle entirely (no
# new worktree, no new PR) so the closer / human review can drain the queue.
# Default 20 = 1 day of cron output at the current cadence — well under any
# pathological state but high enough to absorb a normal slow merge day.
# Use critical alert because growth past the threshold while the closer runs
# implies the closer is itself jammed (worth a human eye, not a chore).
# Exit 0 (not error) so cron logs stay quiet — same convention as the
# bifurcation / dirty-skip guards above.
MAX_OPEN_AUTO_PRS="${MAX_OPEN_AUTO_PRS:-20}"
open_auto_prs=""
if open_auto_prs=$(gh pr list --state open --json headRefName --limit 300 2>/dev/null); then
  open_count=$(printf '%s' "$open_auto_prs" | grep -o "auto-improve-" | wc -l)
  if [[ "$open_count" -gt "$MAX_OPEN_AUTO_PRS" ]]; then
    log "BACKLOG: $open_count open auto-improve-* PRs exceeds MAX_OPEN_AUTO_PRS=$MAX_OPEN_AUTO_PRS — skipping cycle"
    BODY=$(cat <<EOF_BODY
## Detected
$open_count OPEN auto-improve-* PRs on origin (threshold MAX_OPEN_AUTO_PRS=$MAX_OPEN_AUTO_PRS).
autonomous-improve generates ~1 PR/cycle but the merge rate has collapsed,
so the backlog grew unboundedly. New cycles are now skipped until the
queue drains below the threshold.

## Recovery
1. Inspect: \`gh pr list --state open --search "head:auto-improve-" --limit 50\`
2. Manually merge or close stale PRs, or wait for \`auto-stale-pr-close.sh\`
3. The next cycle automatically resumes once OPEN count ≤ $MAX_OPEN_AUTO_PRS
4. If the closer itself is jammed, inspect /tmp/graph-island-stale-pr-close.log
EOF_BODY
    )
    SUMMARY="autonomous backlog: $open_count open auto-improve-* PRs (cap $MAX_OPEN_AUTO_PRS)"
    if RESULT=$(csv_file_alert "autonomous-backlog-throttled" critical "$SUMMARY" "$BODY"); then
      log "ALERT FILED: critical issue #${RESULT}"
    else
      log "ALERT SUPPRESSED: pending backlog-throttle alert already exists"
    fi
    exit 0
  fi
  log "Backlog OK: $open_count open auto-improve-* PRs (cap $MAX_OPEN_AUTO_PRS)"
else
  log "WARN: gh pr list failed — skipping backlog-throttle check, continuing cycle"
fi

# ── Create isolated worktree ──
WORKTREE_DIR="$PROJECT_DIR/.autonomous-worktrees/$SESSION_ID"
WORKTREE_BRANCH="auto-improve-$SESSION_ID"
mkdir -p "$PROJECT_DIR/.autonomous-worktrees"

git branch "$WORKTREE_BRANCH" HEAD 2>/dev/null
git worktree add "$WORKTREE_DIR" "$WORKTREE_BRANCH" 2>&1 | while IFS= read -r line; do log "  $line"; done

if [[ ! -d "$WORKTREE_DIR" ]]; then
  log "ERROR: Failed to create worktree"
  git branch -D "$WORKTREE_BRANCH" 2>/dev/null
  exit 1
fi

log "Worktree created: $WORKTREE_DIR"

# Base branch for the cycle's PR. Hard-coded to `main` so that auto-merge
# (Phase P) can land changes on main directly. Previously this read whatever
# branch was checked out when cron fired, which produced PRs targeting old
# feature branches (e.g. fix/g2-queue-cleanup) that had themselves already
# been merged — the resulting "merge" never reached main.
BASE_BRANCH="main"

# ── Cleanup trap: preserve WIP + push branch + open PR, then remove local worktree ──
# This replaces the prior "git merge to main" flow. Every exit path (normal
# completion, _claude_guard rate-limit exit, ABORT after gates fail, bash
# error) routes through here, so the user can review anything the session
# produced — gate-passing commits AND gate-failing "wip" drafts — via PR.
# Note: no additional claude -p calls, so token budget impact is zero.
cleanup() {
  rm -f "$LOCK_DIR/$SESSION_ID.pid" 2>/dev/null
  pkill -P $$ 2>/dev/null
  wait 2>/dev/null

  # Preserve uncommitted work-in-progress in the worktree before teardown.
  local wip_committed=0
  if [[ -d "$WORKTREE_DIR" ]] && cd "$WORKTREE_DIR" 2>/dev/null; then
    # Log git state so we can diagnose why WIP preservation did/did not fire.
    local _status_summary
    _status_summary=$(git status --porcelain 2>/dev/null | wc -l)
    local _log_summary
    _log_summary=$(git log --oneline "$BASE_BRANCH..HEAD" 2>/dev/null | wc -l)
    log "Worktree state at cleanup: $_status_summary uncommitted file(s), $_log_summary branch commits above base"
    if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
      git add -A 2>/dev/null || true
      if git commit --no-verify -m "wip(auto): partial work — cycle aborted ($SESSION_ID)

Task: ${ISSUE_NAME:-auto-focus}
Focus: ${FOCUS:-unknown}
Reason: cycle exited with uncommitted changes (rate-limit, gate fail, or
early abort). This commit preserves the claude -p attempt for human review.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>/dev/null; then
        wip_committed=1
        log "WIP committed for review"
      fi
    fi
  fi

  # If the branch has any commits beyond BASE_BRANCH, push + open a PR so a
  # reviewer can evaluate. Skip silently on auth/network failure so that the
  # local worktree still gets cleaned up.
  cd "$PROJECT_DIR" 2>/dev/null || true
  local ahead=0
  if git rev-parse --verify "$WORKTREE_BRANCH" >/dev/null 2>&1; then
    ahead=$(git rev-list --count "$BASE_BRANCH".."$WORKTREE_BRANCH" 2>/dev/null || echo 0)
  fi
  if [[ "$ahead" -gt 0 ]]; then
    # Sync origin/$BASE_BRANCH with local so the PR diff contains ONLY what
    # this cycle added. Without this, the PR shows every local commit that
    # happened since the last time origin/$BASE_BRANCH was pushed (e.g.
    # unrelated perf fixes, chores), inflating the review surface.
    # A fast-forward push succeeds silently; if origin has diverged we just
    # log the failure and proceed — the PR will still open, just with extra
    # history visible to the reviewer.
    log "Syncing origin/$BASE_BRANCH with local (fast-forward, so PR diff stays clean)..."
    git push origin "$BASE_BRANCH" --no-verify 2>&1 | tail -3 | while IFS= read -r l; do log "  base-sync: $l"; done || log "  base-sync failed (non-fast-forward?); PR diff may include unrelated history"
    log "Pushing $WORKTREE_BRANCH ($ahead commits ahead of $BASE_BRANCH)..."
    if git push -u origin "$WORKTREE_BRANCH" --no-verify 2>&1 | tail -3 | while IFS= read -r l; do log "  push: $l"; done; then
      # Skip PR creation when the cycle produced 0 implementation commits
      # (only WIP / status-flip / kaizen-discovered noise above base).
      # Such PRs accumulate as review noise without reviewable value;
      # the WIP commit stays on origin/$WORKTREE_BRANCH for forensics.
      # PR is opened only when a real implementation commit exists, i.e.
      # TOTAL_COMMITS > 0. The branch on origin can be reaped later by
      # any cleanup pass without touching a PR thread.
      if [[ "$TOTAL_COMMITS" -le 0 ]]; then
        log "ABORT/no-impl cycle — skipping PR creation (branch retained on origin for forensics)"
      else
        local draft_flag=""
        [[ "$wip_committed" -eq 1 ]] && draft_flag="--draft"
        local pr_title="auto: ${FOCUS:-session} ${ISSUE_NAME:-$SESSION_ID}"
        local pr_body="Session: $SESSION_ID
Focus: ${FOCUS:-unknown}
Task: ${ISSUE_NAME:-(auto-focus)}
Commits: $ahead on $WORKTREE_BRANCH vs $BASE_BRANCH (impl commits: $TOTAL_COMMITS)
WIP: ${wip_committed}

Generated by autonomous-improve.sh. Review before merging."
        gh pr create \
          --base "$BASE_BRANCH" \
          --head "$WORKTREE_BRANCH" \
          --title "$pr_title" \
          $draft_flag \
          --body "$pr_body" 2>&1 | tail -3 | while IFS= read -r l; do log "  pr: $l"; done || log "  gh pr create failed (non-fatal)"
      fi
    else
      log "  push failed — branch left locally; $WORKTREE_BRANCH not on origin"
    fi
  else
    log "No commits on worktree branch — skipping push/PR"
  fi

  log "Cleaning up worktree..."
  cd "$PROJECT_DIR" || true
  git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || rm -rf "$WORKTREE_DIR"
  # Local branch can be deleted (remote retains it after push)
  git branch -D "$WORKTREE_BRANCH" 2>/dev/null || true
  git worktree prune 2>/dev/null
  log "Cleanup complete"
}
trap cleanup EXIT

# ── Work in worktree ──
cd "$WORKTREE_DIR" || exit 1

# ── DISCOVER: static scan + kaizen analysis ──
log "Running static issue discovery..."
bash "$PROJECT_DIR/scripts/pipeline/discover-issues.sh" 2>&1 | tail -5 | while IFS= read -r line; do log "  $line"; done

# Kaizen-driven deep analysis (every 4th session to save API calls)
HOUR=${HOUR:-$(date +%-H)}
if [[ $((HOUR % 4)) -eq 0 ]]; then
  # Count only TRUE pending issues — blocked/decomposed shouldn't lock the discovery loop
  PENDING_COUNT=$(csv_select_pending issues 2>/dev/null | wc -l | tr -cd '0-9')
  PENDING_COUNT=${PENDING_COUNT:-0}
  if [[ $PENDING_COUNT -le $KAIZEN_PENDING_THRESHOLD ]]; then
    log "Running /kaizen issue discovery (hour=$HOUR, pending=$PENDING_COUNT)..."
    KAIZEN_PROMPT="あなたはKaizen(継続的改善)のスペシャリストです。

Graph Island Obsidian プラグインのソースコード(src/)を分析し、
既存コードの品質課題を発見してください。

## ルール
- 機能追加のアイデアは禁止。既存コードの問題だけ報告すること
- 課題 = バグ、品質劣化、規約違反、一貫性の欠如、リスクのある実装
- アイデア ≠ 課題。「こうしたら良い」ではなく「ここが壊れている/危険」を報告
- CLAUDE.md のルールに照らして違反を探す
- 具体的なファイル名と行番号を含めること

## 誇大表現の禁止 (report-honesty rules)
- 曖昧な時間表現を使わない: 「ここ数日」「しばらく」「最近」「以前から」等は禁止。
  必要なら \`git log --since=\"YYYY-MM-DD\"\` で確認した具体的日付を書くこと。
- 曖昧な数量表現を使わない: 「多数の」「多くの」「かなりの」「著しく」等は禁止。
  実際の件数 (例: 「3 箇所」「N=12」) または「調査未完」と書くこと。
- 未実測の効果予測は書かない: 「〜ms 削減できる」「X倍速化」は修正後に実測するまで
  issue に書かない。仮説は \"Hypothesis:\" プレフィクスで明示。
- パイプライン成果と手動作業を混ぜない: 発見が自律分析によるものであることを明記し、
  他コミット群を根拠として列挙しないこと。

## 分析対象 (優先順位順)
1. ランタイムバグの可能性 (null参照、境界値、競合状態)
2. リソースリーク (イベントリスナー未解除、タイマー未クリア)
3. CLAUDE.md規約違反 (ハードコード値、God Object肥大化兆候)
4. エラーハンドリングの欠陥
5. 型安全性の穴 (any型、unsafe cast)
6. テストされていない危険なコードパス

## 出力形式
発見した課題ごとに以下を scripts/pipeline/issues/ にファイルとして書き出すこと:

ファイル名: scripts/pipeline/issues/NNN-slug.md (NNNは既存最大番号+1)

内容:
---
priority: high または medium
reported: $(date +%Y-%m-%d)
status: pending
source: kaizen
summary: 1行要約
---
## Description
詳細説明(ファイル名:行番号を含む)
## Acceptance criteria
- [ ] 具体的な修正基準

最大3件まで。既に scripts/pipeline/issues/ にある課題と重複しないこと。
既存のissueを確認してから書くこと。"

    _claude_guard -p "$KAIZEN_PROMPT" \
      --allowedTools "Bash,Read,Glob,Grep,Write" \
      --max-turns 20

    # Auto-commit any newly created issues to keep main clean.
    # CSV migration: kaizen discovery writes to issues.csv + descriptions/<id>.md
    # via csv_lib, NOT to the legacy scripts/pipeline/issues/ directory (which
    # was removed in Phase 3). Watch the CSV path so the dirty-state guard at
    # L249 doesn't trip on un-staged csv writes and SKIP every subsequent cycle.
    if [[ -n "$(cd "$PROJECT_DIR" && git status --porcelain scripts/pipeline/issues.csv scripts/pipeline/descriptions/)" ]]; then
      (cd "$PROJECT_DIR" && git add scripts/pipeline/issues.csv scripts/pipeline/descriptions/ && git commit -m "chore: kaizen-discovered issues

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" --no-verify 2>/dev/null) || true
      log "Kaizen issues committed to main"
    fi
  fi
fi

# ── PRIORITIZE: moved into loop (per-iteration context reset) ──
# Issue queue check + focus selection now happens at the start of each iteration
# to ensure clean context and pick up newly filed issues mid-session.

# ── Focus exhaustion check ──
# Returns 0 (true) if the last 3 sessions with this focus all had 0 commits.
_focus_exhausted() {
  local f="$1"
  local recent_commits
  recent_commits=$(grep -l "\"focus\": \"$f\"" "$RESULT_DIR"/*.json 2>/dev/null \
    | xargs ls -t 2>/dev/null | head -3 \
    | xargs grep -h '"commits":' 2>/dev/null \
    | grep -oP '"commits":\s*\K[0-9]+' \
    | awk '{s+=$1} END{print s+0}')
  [[ "$recent_commits" -eq 0 ]]
}

# ── E2E/CDP: handled by e2e-patrol.sh (separate cron, background) ──

# ============================================================
# IMPROVEMENT LOOP
# ============================================================
TOTAL_COMMITS=0
# ITER_COMMITS tracks commits within the current iteration only. Used as the
# verify-issue-done gate (L1010) so iter N's verify is not falsely triggered
# by iter N-1's commits — the bleed that could mark a Task B as done based
# on Task A's iter commits if the two tasks happened to share file paths.
ITER_COMMITS=0

for iter in $(seq 1 "$MAX_ITERATIONS"); do

  # ── CONTEXT RESET (コンテキスト汚染防止) ──
  # 各イテレーションをクリーンな状態から開始。
  # リセットするもの: 前イテレーションの判断結果・中間変数
  GATE_JSON=""
  GODOBJ_JSON=""
  GATE_STATUS=""
  GODOBJ_STATUS=""
  REVIEW_FINDINGS=""
  PROMPT=""
  SKILL_CONTEXT=""
  ISSUE_FILE=""
  ISSUE_CONTENT=""
  ISSUE_NAME=""
  ITER_COMMITS=0

  # ── Work selection: tasks first → issues → focus rotation ──

  # Step 1: Check tasks.csv for pending work (already decomposed, ready to implement)
  ISSUE_ID=""
  for prio in critical high medium low; do
    ISSUE_ID=$(csv_select_pending tasks "$prio" 2>/dev/null | head -1)
    [[ -n "$ISSUE_ID" ]] && break
  done

  if [[ -n "$ISSUE_ID" ]]; then
    ATTEMPT_COUNT=$(csv_get_field tasks "$ISSUE_ID" attempt_count 2>/dev/null)
    ATTEMPT_COUNT=${ATTEMPT_COUNT:-0}
    if [[ "$ATTEMPT_COUNT" -ge 2 ]]; then
      log "BLOCKED: $ISSUE_ID exhausted ($ATTEMPT_COUNT attempts, 0 commits) — marking blocked"
      csv_atomic_set_status tasks "$ISSUE_ID" blocked \
        "chore: block exhausted task $ISSUE_ID" 2>/dev/null || true
      exit 0
    fi
    FOCUS="task"
    ISSUE_NAME="$ISSUE_ID"
    ISSUE_CONTENT=$(csv_to_prompt_text tasks "$ISSUE_ID")
    log "TASK: $ISSUE_NAME (attempt $((ATTEMPT_COUNT + 1)))"
    csv_atomic_set_status tasks "$ISSUE_ID" in-progress \
      "chore: start task $ISSUE_NAME" 2>/dev/null || true
  else
    # Step 2: Check issues for pending → decompose into tasks
    # FIX B: skip issues that have already been decomposed MAX_ISSUE_ATTEMPTS
    # times without producing a merge-candidate PR.
    ISSUE_ID=""
    for prio in critical high medium low; do
      for cand in $(csv_select_pending issues "$prio" 2>/dev/null); do
        a=$(csv_get_field issues "$cand" decompose_attempts 2>/dev/null)
        a=${a:-0}
        [[ "$a" -ge "$MAX_ISSUE_ATTEMPTS" ]] && continue
        ISSUE_ID="$cand"
        break
      done
      [[ -n "$ISSUE_ID" ]] && break
    done

    if [[ -n "$ISSUE_ID" ]]; then
      ISSUE_NAME="$ISSUE_ID"
      CUR_ATTEMPTS=$(csv_get_field issues "$ISSUE_ID" decompose_attempts 2>/dev/null)
      CUR_ATTEMPTS=${CUR_ATTEMPTS:-0}
      NEW_ATTEMPTS=$(csv_increment_attempts issues "$ISSUE_ID" 2>/dev/null)
      log "ISSUE: $ISSUE_NAME — decomposing (attempt $NEW_ATTEMPTS/$MAX_ISSUE_ATTEMPTS)"
      DECOMPOSE_LOG=$(mktemp)
      bash "$PROJECT_DIR/scripts/pipeline/decompose-issue.sh" "$ISSUE_NAME" >"$DECOMPOSE_LOG" 2>&1
      DECOMPOSE_EXIT=$?
      while IFS= read -r line; do log "  decompose: $line"; done < "$DECOMPOSE_LOG"
      rm -f "$DECOMPOSE_LOG"
      if [[ $DECOMPOSE_EXIT -eq 2 ]]; then
        log "ABORT: decomposition hit rate-limit — skipping rest of cycle to conserve tokens"
        exit 0
      fi
      if [[ $DECOMPOSE_EXIT -eq 5 ]]; then
        # Short response — claude judged the issue undecomposable (no src/
        # paths in description, single-line task, etc.). Mark and move on
        # rather than aborting the cycle on a phantom rate-limit signal.
        log "WARN: decompose returned short response — marking $ISSUE_NAME undecomposable, continuing cycle"
        csv_atomic_set_status issues "$ISSUE_NAME" undecomposable \
          "chore: mark $ISSUE_NAME undecomposable (short LLM response)" 2>/dev/null || true
        ISSUE_NAME=""
        ISSUE_FILE=""
        continue
      fi
      if [[ $DECOMPOSE_EXIT -eq 4 ]]; then
        log "ABORT: task queue at cap (MAX_TOTAL_TASKS=$MAX_TOTAL_TASKS) — skipping decomposition this cycle"
        # Roll back the attempts increment so the issue isn't penalized.
        # Atomic so we don't leave the bumped attempt as a dirty file.
        csv_atomic_set_field issues "$ISSUE_NAME" decompose_attempts "$CUR_ATTEMPTS" \
          "chore: rollback decompose attempt for $ISSUE_NAME (queue at cap)" 2>/dev/null || true
        exit 0
      fi

      # Pick first task from newly created tasks
      ISSUE_ID=$(csv_select_pending tasks 2>/dev/null | head -1)

      if [[ -n "$ISSUE_ID" ]]; then
        FOCUS="task"
        ISSUE_NAME="$ISSUE_ID"
        ISSUE_CONTENT=$(csv_to_prompt_text tasks "$ISSUE_ID")
        log "FIRST TASK: $ISSUE_NAME"
        csv_atomic_set_status tasks "$ISSUE_ID" in-progress \
          "chore: start task $ISSUE_NAME" 2>/dev/null || true
      else
        log "WARN: decomposition produced no tasks, falling back to auto-focus"
        HOUR=$(date +%-H)
        FOCUS_AREAS=("coverage" "eslint" "refactor")
        FOCUS_INDEX=$(( (HOUR / 2) % 3 ))
        FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
      fi
    else
      # Step 3: No issues or tasks → focus rotation
    HOUR=$(date +%-H)
    FOCUS_AREAS=("coverage" "eslint" "refactor")
    FOCUS_INDEX=$(( (HOUR / 2) % 3 ))
    FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"

    # ── Skip exhausted focus areas ──
    TRIED=0
    while _focus_exhausted "$FOCUS" && [[ $TRIED -lt 3 ]]; do
      log "SKIP focus=$FOCUS (last 3 sessions: 0 commits) — trying next"
      FOCUS_INDEX=$(( (FOCUS_INDEX + 1) % 3 ))
      FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
      TRIED=$((TRIED + 1))
    done
    if [[ $TRIED -ge 3 ]]; then
      log "ALL focus areas exhausted (0 commits each). Skipping session."
      exit 0
    fi
    fi  # end: if [[ -n "$ISSUE_FILE" ]] (Step 2)
  fi  # end: if [[ -n "$ISSUE_FILE" ]] (Step 1)

  log "── Iteration $iter/$MAX_ITERATIONS (focus: $FOCUS, context: clean) ──"

  # ── ASSESS (fresh data, no carry-over) ──
  # Failure here cannot be silently masked: the prompt below feeds GATE_STATUS
  # back to claude as ground truth, and a fallback like {"passed":0} produces
  # an empty `gates` map → empty GATE_STATUS → "ゲート: " in the prompt, which
  # claude reads as "all good" by absence. Skip the iter on failure instead.
  if ! GATE_JSON=$(bash scripts/pipeline/enforce-gates.sh --json 2>&1); then
    log "ASSESS-FAIL iter $iter: enforce-gates.sh --json exited non-zero"
    log "  output: $(echo "$GATE_JSON" | head -3 | tr '\n' '|')"
    continue
  fi
  if ! GODOBJ_JSON=$(bash scripts/pipeline/god-object-audit.sh --json 2>&1); then
    log "ASSESS-FAIL iter $iter: god-object-audit.sh --json exited non-zero"
    log "  output: $(echo "$GODOBJ_JSON" | head -3 | tr '\n' '|')"
    continue
  fi

  # ── IMPLEMENT ──
  log "Claude implementing ($FOCUS)..."

  GATE_STATUS=$(echo "$GATE_JSON" | python3 -c "import sys,json; g=json.load(sys.stdin).get('gates',{}); print(' '.join(f'{k}:{v}' for k,v in g.items()))" 2>/dev/null || echo "?")
  GODOBJ_STATUS=$(echo "$GODOBJ_JSON" | python3 -c "import sys,json; [print(f\"{k.split('/')[-1]}:{v['current']}/{v['limit']}\",end=' ') for k,v in json.load(sys.stdin).get('files',{}).items() if v.get('status')=='fail']" 2>/dev/null || echo "all pass")

  if [[ "$FOCUS" == "task" || "$FOCUS" == "auto-issue" ]]; then
    # Task or auto-discovered issue — small, focused implementation
    PROMPT="以下のタスクを実装してください。

## タスク
$ISSUE_CONTENT

## 現在の状態
- ゲート: $GATE_STATUS
- God Objects: $GODOBJ_STATUS

## 手順
1. /research: タスク文に明示されたファイルだけを読む（探索拡大は厳禁）
2. 実装: 最小限の変更で acceptance criteria を満たす
3. 実装後は何もせず終了（検証はシェルが行う）

## ルール (token-reduction、2026-04-30 Phase R3)
- **タスク文に明示されたファイル以外は読まない・編集しない**
- **\`Glob\` での全域検索を避ける**（明示パスを直接 Read）
- 不要な \`grep -r\`/\`find\` を打たない（範囲を絞る）
- CLAUDE.md厳守
- God Object肥大化禁止
- テストを壊さない
- 1つのタスクだけ実装する（他のタスクに手を出さない）
- ESLint設定やカバレッジ閾値を変更しない"
  else
    # Each focus uses its appropriate skill
    SKILL_CONTEXT=""
    case "$FOCUS" in
      coverage)
        SKILL_CONTEXT="あなたは /test スペシャリストです。
## /test の原則
- カバレッジレポートを読んで最も効果的なテスト対象を選ぶ
- 純粋関数を優先 (DOM/Canvas依存は後回し)
- 境界値テスト: 空入力、極端な値、型境界
- 既存テストと重複しない
- テストの意味がある (形式だけのテストは不要)"
        ;;
      eslint)
        SKILL_CONTEXT="あなたは /simplify スペシャリストです。
## /simplify の原則
- 複雑な関数を小さなヘルパーに分割
- 早期returnで分岐を減らす
- 重複コードを共通関数に抽出
- 動作は変えない (純粋なリファクタ)
- ESLint complexity 閾値は 25"
        ;;
      refactor)
        SKILL_CONTEXT="あなたは /research + /simplify スペシャリストです。
## /research の原則
- まずコードを読んで構造を理解する
- 依存関係を把握してから抽出する
## /simplify の原則
- God Object からロジックを新ファイルに抽出
- importを正しく更新
- 行数削減を確認"
        ;;
    esac

    PROMPT="自律改善サイクル iteration $iter/$MAX_ITERATIONS。focus: $FOCUS

$SKILL_CONTEXT

状態:
- ゲート: $GATE_STATUS
- God Objects: $GODOBJ_STATUS

focus=$FOCUS の改善を1つ実装せよ:
- coverage: 低カバレッジファイルにテスト追加 (純粋関数優先)
- eslint: complexity警告のリファクタ (閾値25、GVC内は行数を減らす方向で)
- refactor: God Object からのロジック抽出

禁止事項:
- ESLint設定ファイル (eslint.config.js) を変更しない
- カバレッジ閾値 (vitest.config.ts) を下げない
- 新しいESLint warningを出さない
- God Object ファイルの行数を増やさない

実装後は何もせず終了（検証はシェルが行う）。CLAUDE.md厳守。"
  fi

  # Agent tool removed (kaizen 2026-04-24) to prevent subagent fan-out
  _claude_guard -p "$PROMPT" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --max-turns "$MAX_TURNS"

  # ── Phase Q (2026-04-26): auto-format implementation output ──
  # CI was failing every PR because Claude's edits were not Prettier-clean
  # and `enforce-gates.sh` had no format gate. Run `pnpm format` once here
  # so the autonomous PR ships formatted code; CI's `format:check` then
  # passes downstream.
  #
  # ── Approach A (2026-05-07): moved to commit block ──
  # Running `pnpm format` here (post-implement, pre-verify) created a
  # window where format-only edits could land as a separate commit if
  # the iter's actual work was reverted (verify revert, simplify revert)
  # while the format diff persisted. That inflated ITER_COMMITS and let
  # verify-issue-done's MODIFY-only check falsely pass. The format call
  # now runs immediately before `git status --porcelain` in the COMMIT
  # block (~L1091), so any format auto-fix is bundled into the same
  # commit as the iter's semantic work — no standalone format commit
  # can ever be produced.
  # pnpm format >/dev/null 2>&1 || true

  # ── VERIFY: gates (mechanical) ──
  # (kaizen 2026-04-24) DEBUG_RETRY_COUNT=1 was 3 — 1回で直らないなら3回目も無駄
  log "Verifying gates..."
  VERIFY_OK=false
  TOTAL_GATE_TRIES=$((DEBUG_RETRY_COUNT + 1))
  for fix_attempt in $(seq 1 "$TOTAL_GATE_TRIES"); do
    if bash scripts/pipeline/enforce-gates.sh >/dev/null 2>&1; then
      VERIFY_OK=true
      break
    fi
    if [[ $fix_attempt -lt $TOTAL_GATE_TRIES ]]; then
      log "Gate failed, fix attempt $fix_attempt/$TOTAL_GATE_TRIES — /systematic-debugging..."
      ERRORS=$(bash scripts/pipeline/enforce-gates.sh 2>&1 | grep "^FAIL" || echo "unknown")

      # Phase R6 (2026-05-03): gate-specific recovery hints. Each fail
      # mode in production has a stereotyped fix; embedding the hint in
      # the retry prompt avoids the implementer reinventing diagnosis.
      HINTS=""
      [[ "$ERRORS" == *"[typecheck]"* ]] && HINTS+="
- typecheck: 削除したexportが他ファイルから import されていないか
  \`grep -rn 'import.*<symbol>' src/\` で確認、残った参照を全部消す。
- 'is declared but never read' は使われていない import / 変数の証跡 → 削除する。"
      [[ "$ERRORS" == *"[format]"* ]] && HINTS+="
- format: \`pnpm format\` を実行してから git diff を確認。"
      [[ "$ERRORS" == *"[godobj]"* ]] && HINTS+="
- godobj: god object 4ファイル (GVC/PanelBuilder/EdgeRenderer/RenderPipeline)
  が limit 超過。format reflow で増えた場合は別ファイルに extract、
  または不要な空行・コメントを削減して元の行数に戻す。CLAUDE.md の Max
  Allowed 表が真値。"
      [[ "$ERRORS" == *"[test]"* ]] && HINTS+="
- test: 失敗 test の該当ファイルを読む → mock 不足 / API 変更 / setTimeout
  → ManagedTimer などの move を test 側にも反映する。新しい mock が必要なら
  tests/__mocks__/ に追加。"
      [[ "$ERRORS" == *"[coverage]"* ]] && HINTS+="
- coverage: 新規追加コードに対応する単体 test を tests/ に追加 (ratchet を
  下げるのは禁止)。境界値テストを優先、純粋関数を優先。"
      [[ "$ERRORS" == *"[lint]"* ]] && HINTS+="
- lint: \`npx eslint src/ --quiet\` でエラーのみ確認、warning は無視。"
      [[ "$ERRORS" == *"[build]"* ]] && HINTS+="
- build: \`node esbuild.config.mjs production 2>&1\` で error stack を読む。
  循環依存 / 存在しない import が典型。"
      [[ "$ERRORS" == *"[bundle]"* ]] && HINTS+="
- bundle: 800KB 超過。新規追加コードを縮める or 別の非ホット path に export
  しない。esbuild の externals 設定を確認。"

      _claude_guard -p "あなたは systematic-debugging のスペシャリストです。

ゲートが失敗しました: $ERRORS
${HINTS}

## 手順
1. エラーを正確に読む
2. 仮説を立てる前に事実を集める (ファイルを読む、テストを実行する)
3. 根本原因を特定してから修正する (band-aid fix 禁止)
4. 修正後にゲートが通ることを確認

R3 scope 規律: タスクに直接関係しないファイルを読まない・編集しない。
\`Glob\` での全域検索を避ける。明示パスを直接 Read。
CLAUDE.md 厳守。" \
        --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
        --max-turns 15
    fi
  done

  if [[ "$VERIFY_OK" != true ]]; then
    log "ABORT: Gates failed after $TOTAL_GATE_TRIES fix attempts"
    break
  fi

  # ── REVIEW: /review — code review the changes ──
  # (kaizen 2026-04-24) simplify follow-up step removed — too expensive per-cycle
  # and often broke gates requiring revert. Review stays read-only (diagnostic).
  log "Running /review on changes..."
  DIFF_STAT=$(git diff HEAD~1 --stat 2>/dev/null | tail -3 || echo "no diff")
  REVIEW_TMP=$(mktemp)
  claude -p "あなたはコードレビューのスペシャリストです。

直近の変更をレビューしてください。

diff stat: $DIFF_STAT
全diffを確認するには git diff HEAD~1 を実行してください。

## レビュー観点 (/review)
1. 正確性: ロジックエラー、境界値の見落とし
2. セキュリティ: インジェクション、XSS、unsafe patterns
3. CLAUDE.md規約: God Object肥大化、ハードコード値、console文
4. パフォーマンス: 不要な再計算、O(n²)ループ

## findings 記述の規約 (report-honesty rules)
- 各 finding は 1. severity, 2. file:line, 3. 観察された事実 (測定値があれば含む) の
  3 点に絞って書くこと。
- 「改善される」「速くなる」等の効果見込みは実測前には書かない。
  必要なら \"Hypothesis:\" プレフィクス付きで別セクションに書くこと。
- 曖昧な時間/数量表現 (「ここ数日」「多数の」「かなり」「著しく」) は禁止。
  未確認なら「未測定」「調査が必要」と明記すること。

findingsがあれば番号付きリストで出力。なければ 'NO FINDINGS' と出力。" \
    --allowedTools "Bash,Read,Glob,Grep" \
    --max-turns 10 \
    >"$REVIEW_TMP" 2>&1
  REVIEW_RC=$?
  # Inline rate-limit guard (mirrors _claude_guard at L67-82). Must run BEFORE
  # any "NO FINDINGS" fallback, otherwise the echo overwrites rate-limit
  # markers and the cycle continues to verify/commit blocks misjudging the
  # state as "review found nothing".
  if grep -qiE "you've hit your limit|rate limit|quota exceeded|resets[[:space:]]+[0-9]+(am|pm)" "$REVIEW_TMP"; then
    log "RATE LIMIT during review — aborting cycle early (no more claude -p calls)"
    tail -3 "$REVIEW_TMP" | while IFS= read -r l; do log "  $l"; done
    rm -f "$REVIEW_TMP"
    exit 0
  fi
  # Non-zero rc without rate-limit signature: claude failed for an unrelated
  # reason (network, auth, max-turns). Treat as "no findings" to keep the
  # cycle progressing — same behaviour as the previous `|| echo` shortcut.
  if [[ $REVIEW_RC -ne 0 ]]; then
    log "Review claude rc=$REVIEW_RC (non-rate-limit) — treating as NO FINDINGS"
    echo "NO FINDINGS" >"$REVIEW_TMP"
  fi
  REVIEW_FINDINGS=$(cat "$REVIEW_TMP")
  rm -f "$REVIEW_TMP"

  if echo "$REVIEW_FINDINGS" | grep -qi "NO FINDINGS"; then
    log "Review: clean"
  elif [[ "$SIMPLIFY_ENABLED" == "true" ]]; then
    log "Review: findings detected — /simplify enabled, running follow-up..."
    _claude_guard -p "以下のレビューfindingsを修正し、コードを簡素化してください。

## Findings
$REVIEW_FINDINGS

CLAUDE.md厳守。God Object行数を増やさない。" \
      --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
      --max-turns 10
    if ! bash scripts/pipeline/enforce-gates.sh >/dev/null 2>&1; then
      log "WARN: Simplification broke gates — reverting"
      git checkout -- . 2>/dev/null
    fi
  else
    log "Review: findings detected (simplify step disabled — will be picked up as future issue)"
  fi


  # ── COMMIT in worktree ──
  # Approach A (2026-05-07): format auto-fix immediately before commit so
  # Prettier reflow lands in the same commit as the iter's actual work.
  # Prevents a standalone format-only commit from inflating ITER_COMMITS
  # and triggering verify-issue-done's MODIFY-only false-pass. The
  # whitespace-only filter below (Approach C, cycle 4) remains as a
  # second line of defence for the no-semantic-edit case.
  pnpm format >/dev/null 2>&1 || true

  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    # ── Root fix (cycle 7 PR-pileup diagnosis): unstage pipeline code itself ──
    # discover-issues.sh / csv-helpers.sh are sourced inside the worktree and
    # may leave incidental edits (whitespace, csv-schema.md churn). If those
    # land in a `chore(auto)` commit, auto-merge-pr.sh's PROTECTED_GLOBS=*.sh
    # blocks the PR — every PR piles up.
    # Rationale: chose "add -A then unstage protected" over an allow-list
    # because new src/scripts paths appear over time and a hand-maintained
    # allow-list silently drops them. Deny-list is narrower and self-documenting.
    git reset HEAD -- \
      'scripts/pipeline/*.sh' \
      'scripts/pipeline/*.py' \
      'scripts/pipeline/*.ts' \
      'scripts/pipeline/*.mjs' \
      scripts/pipeline/csv-schema.md \
      >/dev/null 2>&1 || log "WARN: protected-path unstage failed (continuing)"
    # Skip whitespace-only changes (e.g. lone Prettier auto-fix from L892
    # with no semantic work this iter). Such commits would inflate
    # ITER_COMMITS and let verify-issue-done's MODIFY-only check falsely
    # pass for tasks that produced zero real edits — the file is "touched"
    # by `git log --name-only` but only by whitespace.
    if git diff --cached --quiet --ignore-all-space 2>/dev/null; then
      log "Skipping whitespace-only changes (format auto-fix, no semantic content)"
      git reset >/dev/null 2>&1 || true
    else
      COMMIT_PREFIX="chore(auto)"
      COMMIT_DETAIL="$FOCUS improvement"
      if [[ "$FOCUS" == "user-issue" && -n "$ISSUE_NAME" ]]; then
        COMMIT_PREFIX="fix(auto)"
        COMMIT_DETAIL="resolve $ISSUE_NAME"
      fi
      git commit -m "$(cat <<COMMITMSG
$COMMIT_PREFIX: $COMMIT_DETAIL (session $SESSION_ID, iter $iter)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
COMMITMSG
)" 2>&1 | tail -1
      TOTAL_COMMITS=$((TOTAL_COMMITS + 1))
      ITER_COMMITS=$((ITER_COMMITS + 1))
      log "Committed (iter $iter)"
    fi
  else
    log "No changes (iter $iter)"
  fi

  # ── Mark task/issue as done (if applicable) ──
  # Gate: TOTAL_COMMITS > 0 alone is too lax — the iter's worktree commits may
  # never reach local main (PR not merged yet), but the done-flip below writes
  # straight to local main. verify-issue-done.sh additionally checks that
  # backtick-quoted paths in the issue's "## Acceptance criteria" exist in the
  # local git index. Failures flip to `blocked` so the next cycle retries
  # instead of silently piling up false "done" history.
  if [[ ("$FOCUS" == "task" || "$FOCUS" == "auto-issue") && $ITER_COMMITS -gt 0 && -n "$ISSUE_NAME" ]]; then
    KIND="issues"
    if [[ -n "$(csv_get_field tasks "$ISSUE_NAME" id 2>/dev/null)" ]]; then
      KIND="tasks"
    fi
    VERIFY_OUT=""
    if VERIFY_OUT=$(cd "$PROJECT_DIR" && bash scripts/pipeline/verify-issue-done.sh "$ISSUE_NAME" 2>&1); then
      # Surface archive failures (CSV concurrent write, atomic-write error)
      # instead of silently swallowing — without visibility, a row can stay
      # in-progress on disk while the task is marked done in flow control.
      if ! ARCHIVE_ERR=$(csv_archive "$KIND" "$ISSUE_NAME" 2>&1); then
        log "WARN: csv_archive $KIND/$ISSUE_NAME failed: $ARCHIVE_ERR"
      fi
      log "$KIND $ISSUE_NAME → done"
      if [[ "$KIND" == "tasks" ]]; then
        PARENT=$(csv_get_field tasks "$ISSUE_NAME" parent 2>/dev/null)
        if [[ -n "$PARENT" && "$PARENT" != "none" ]]; then
          REMAINING=0
          for SIB in $(csv_select_by_parent tasks "$PARENT" 2>/dev/null); do
            SST=$(csv_get_status tasks "$SIB" 2>/dev/null)
            if [[ "$SST" == "pending" || "$SST" == "in-progress" ]]; then
              REMAINING=$((REMAINING + 1))
            fi
          done
          if [[ $REMAINING -eq 0 ]]; then
            if ! ARCHIVE_ERR=$(csv_archive issues "$PARENT" 2>&1); then
              log "WARN: csv_archive issues/$PARENT failed: $ARCHIVE_ERR"
            fi
            log "Parent issue $PARENT → done (all tasks complete)"
          else
            log "Task done. Parent $PARENT: $REMAINING tasks remaining"
          fi
        fi
      fi
      # 2026-05-09 R13-A: narrow git add to autonomous-scope files only.
      # Previous `git add scripts/pipeline/` swept up operator-edited *.sh /
      # README.md / migrations/, attributing them to autonomous task commits
      # (observed Round 12 cfb87d06). Whitelist explicitly: csv state files
      # + descriptions/ (autonomous-generated) + reports/ (autonomous output).
      (cd "$PROJECT_DIR" && git add scripts/pipeline/issues.csv scripts/pipeline/tasks.csv scripts/pipeline/attempts.csv scripts/pipeline/descriptions/ scripts/pipeline/reports/ 2>/dev/null && \
        git commit -m "chore: done $ISSUE_NAME" --no-verify 2>/dev/null) || true
    else
      log "$KIND $ISSUE_NAME — verify-issue-done FAILED, flipping to blocked"
      while IFS= read -r vline; do log "  verify: $vline"; done <<< "$VERIFY_OUT" | head -3
      csv_set_status "$KIND" "$ISSUE_NAME" blocked 2>/dev/null || true
      # R13-A: same whitelist as the done-commit path above.
      (cd "$PROJECT_DIR" && git add scripts/pipeline/issues.csv scripts/pipeline/tasks.csv scripts/pipeline/attempts.csv scripts/pipeline/descriptions/ scripts/pipeline/reports/ 2>/dev/null && \
        git commit -m "chore: blocked $ISSUE_NAME (verify-issue-done failed: required paths missing on main)" --no-verify 2>/dev/null) || true
    fi
    ISSUE_NAME=""
    ISSUE_FILE=""
  fi

  # ── RATCHET if applicable ──
  if [[ "$FOCUS" == "coverage" && -f coverage/coverage-summary.json ]]; then
    bash scripts/coverage-ratchet.sh 2>&1 | tail -1
    if [[ -n "$(git status --porcelain vitest.config.ts)" ]]; then
      git add vitest.config.ts
      git commit -m "chore(auto): ratchet coverage

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>&1 | tail -1
      TOTAL_COMMITS=$((TOTAL_COMMITS + 1))
    fi
  fi
done

# ============================================================
# FINALIZE — the cleanup EXIT trap (set in the worktree-creation block)
# handles push + PR opening for both successful and aborted cycles. We do
# NOT merge directly to the base branch anymore; reviewer approval via PR
# is the integration gate.
# ============================================================
log "Iteration loop complete ($TOTAL_COMMITS commits). Push + PR handled by cleanup trap on exit."

# ── Update progress report ──
log "Updating progress report..."
bash "$PROJECT_DIR/scripts/pipeline/progress-report.sh" >>"$SESSION_LOG" 2>&1 \
  || log "progress-report failed (see $SESSION_LOG)"

# ── Result file ──
cat > "$RESULT_DIR/$SESSION_ID.json" << ENDJSON
{
  "session": "$SESSION_ID",
  "focus": "$FOCUS",
  "commits": $TOTAL_COMMITS,
  "timestamp": "$(date -Iseconds)"
}
ENDJSON

log "AUTONOMOUS IMPROVE CYCLE COMPLETE ($TOTAL_COMMITS commits)"
