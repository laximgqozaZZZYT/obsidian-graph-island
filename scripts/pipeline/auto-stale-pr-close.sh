#!/usr/bin/env bash
# ============================================================
# auto-stale-pr-close.sh — Auto-stale aging auto-improve-* PRs
# ============================================================
# Phase H1 confirmed autonomous-improve.sh recovers ~92% commit-rate.
# Each successful cycle creates a PR — extrapolating to ~70 PRs/24h.
# Without intervention these accumulate as un-reviewed noise.
#
# Policy (in priority order — first match wins per PR)
#   1. CONFLICTING + ${CONFLICT_HOURS}h (default 6h) → CLOSE.
#      A merge-state DIRTY autonomous PR has no recovery path: rebase
#      would re-resolve against a base that has since moved past it,
#      and a newer cycle has almost certainly produced a fresh PR
#      that includes the same fix. Holding the slot adds no value.
#   2. Duplicate-series → CLOSE all but the newest in the series.
#      Series key:
#        - "auto: task <id> ..."  → "task-<id>"   (per-task retries)
#        - "auto: refactor ..."   → "refactor"    (cycle-kind drift)
#        - "auto: eslint   ..."   → "eslint"
#        - "auto: coverage ..."   → "coverage"
#      The newest PR in each series is the one that ran against the
#      freshest base; older siblings are by definition out of date.
#   3. CI=FAILURE + ${CI_FAIL_HOURS}h (default 48h) + non-draft → CLOSE.
#      A non-draft auto-improve-* PR with at least one FAILURE check
#      conclusion that has not flipped green within 48h is unrecoverable
#      noise: the autonomous loop already moved on, so either the test
#      is flaky (needs separate intervention) or the change is wrong.
#      Either way, occupying an open slot adds backlog drag.
#   4. Older than ${CLOSE_DAYS}d (default 30d) → CLOSE + delete branch.
#      Original age-based hard-close.
#   5. Older than ${STALE_HOURS}h (default 24h) and still ready
#      (not draft) → mark DRAFT. Original soft-stale signal.
#
# Only PRs whose head ref starts with "auto-improve-" are touched —
# human PRs and stacked Phase PRs are never affected.
#
# Safety valve: ${MAX_CLOSE_PER_RUN} (default 30) caps the number of
# CLOSEs per invocation. DRAFTs are not capped (cheap, reversible).
# A single bad-batch (e.g. base branch wedged so every PR is DIRTY)
# could otherwise wipe the whole queue in one shot.
#
# Usage
#   ./auto-stale-pr-close.sh --dry-run   # list candidates, no action
#   ./auto-stale-pr-close.sh --apply     # actually mark draft / close
#
# Suggested cron (USER decides when to enable):
#   0 */6 * * * /home/ubuntu/obsidian-plugins/obsidian-graph-island/scripts/pipeline/auto-stale-pr-close.sh --apply >> /tmp/graph-island-stale-pr.log 2>&1
# ============================================================
set -uo pipefail

# ── Heartbeat (2026-05-09 R11-A kaizen) ──
# Touch the log file at startup so cron-health.sh (R9-C) can detect that
# the cron actually fired, even if subsequent guards (kill-switch /
# dirty-skip / exit) bail before any normal output is produced.
LOG_FILE="${AUTO_STALE_PR_LOG_FILE:-/tmp/graph-island-stale-pr.log}"
{ printf '[heartbeat] %s auto-stale-pr-close started\n' "$(date -Iseconds)"; } >> "$LOG_FILE" 2>/dev/null || true

# ── Kill-switch (2026-05-08 kaizen) ──
# Operator can disable the entire autonomous pipeline by creating
# $PROJECT_DIR/.pipeline-disabled (touch the file). All cron scripts
# bail at exit 0 so cron sees no error. Re-enable by removing the file.
PIPELINE_DISABLE_FILE="${PIPELINE_DISABLE_FILE:-/home/ubuntu/obsidian-plugins/obsidian-graph-island/.pipeline-disabled}"
if [[ -f "$PIPELINE_DISABLE_FILE" ]]; then
  echo "PIPELINE-DISABLED: $PIPELINE_DISABLE_FILE exists — skipping cycle" >&2
  exit 0
fi

# --json-input=PATH (or env JSON_INPUT_PATH) lets operators/tests redirect
# the gh-pr-list fixture path so concurrent cron runs (every 6h) don't race
# on the default /tmp/auto-stale-prs.json. When the flag (or env override)
# is supplied, the SUT skips the `gh pr list` fetch entirely and reads the
# fixture directly — required for race-free behavioural tests (Round 7+).
JSON_INPUT_PATH="${JSON_INPUT_PATH:-/tmp/auto-stale-prs.json}"
SKIP_GH_FETCH=0
# Env-driven override implies skip-fetch as well.
if [[ -n "${JSON_INPUT_PATH_OVERRIDE:-}" ]]; then
  JSON_INPUT_PATH="$JSON_INPUT_PATH_OVERRIDE"
  SKIP_GH_FETCH=1
fi

case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  --apply)   DRY_RUN=0 ;;
  *)
    echo "Usage: $0 --dry-run | --apply [--json-input=PATH]" >&2
    exit 2
    ;;
esac

# Parse trailing optional flags (after primary mode flag).
for arg in "$@"; do
  case "$arg" in
    --json-input=*)
      JSON_INPUT_PATH="${arg#*=}"
      SKIP_GH_FETCH=1
      ;;
  esac
done

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
STALE_HOURS="${STALE_HOURS:-24}"
CLOSE_DAYS="${CLOSE_DAYS:-30}"
# Draft-specific close threshold: drafts older than this are closed even
# if they haven't hit CLOSE_DAYS. Drafts represent PRs already deemed
# stale once; keeping them around for the full 30d adds backlog noise.
DRAFT_CLOSE_DAYS="${DRAFT_CLOSE_DAYS:-7}"
CONFLICT_HOURS="${CONFLICT_HOURS:-6}"
# CI-failure close threshold: non-draft PRs with at least one FAILURE
# check conclusion older than this are closed. Distinct from CONFLICT
# (DIRTY merge state) — a CI-failing PR may still merge cleanly but
# represents a broken change that the autonomous loop never recovered.
CI_FAIL_HOURS="${CI_FAIL_HOURS:-48}"
MAX_CLOSE_PER_RUN="${MAX_CLOSE_PER_RUN:-30}"

cd "$PROJECT_DIR" || exit 1

NOW_EPOCH=$(date +%s)
STALE_EPOCH=$(( NOW_EPOCH - STALE_HOURS * 3600 ))
CLOSE_EPOCH=$(( NOW_EPOCH - CLOSE_DAYS * 86400 ))
DRAFT_CLOSE_EPOCH=$(( NOW_EPOCH - DRAFT_CLOSE_DAYS * 86400 ))
CONFLICT_EPOCH=$(( NOW_EPOCH - CONFLICT_HOURS * 3600 ))
CI_FAIL_EPOCH=$(( NOW_EPOCH - CI_FAIL_HOURS * 3600 ))

echo "=== auto-stale-pr-close ($(date -Iseconds)) ==="
echo "STALE threshold:    ${STALE_HOURS}h   (mark draft)"
echo "CLOSE threshold:    ${CLOSE_DAYS}d   (close + delete branch)"
echo "CONFLICT threshold: ${CONFLICT_HOURS}h    (close DIRTY merge state)"
echo "CI_FAIL threshold:  ${CI_FAIL_HOURS}h   (close non-draft PRs with FAILURE checks)"
echo "MAX_CLOSE_PER_RUN:  ${MAX_CLOSE_PER_RUN}    (close-action cap; drafts uncapped)"
echo "Mode: $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo apply)"
echo ""

# `gh pr list --json` returns an isDraft field; we only need to flip
# OPEN non-draft PRs to draft. Fetch up to 300 to cover the 190+ PR
# backlog observed 2026-05-07.
# When --json-input=PATH (or JSON_INPUT_PATH_OVERRIDE) is set, skip the
# fetch and trust the caller-supplied fixture instead — used by tests to
# avoid the /tmp/auto-stale-prs.json race with the 6h cron.
if [[ $SKIP_GH_FETCH -eq 0 ]]; then
  gh pr list --state open --limit 300 \
    --json number,headRefName,title,createdAt,isDraft,mergeStateStatus,statusCheckRollup \
    > "$JSON_INPUT_PATH" 2>/dev/null
fi

stale_count=0
close_count=0
close_age=0
close_conflict=0
close_dup=0
close_draft_age=0
close_ci_fail=0
close_skipped_cap=0

# Pre-collect candidates via mapfile to avoid the bash pipe-subshell
# stdout-trap (same kind of bug Phase H1 fixed for ratchet-drift-monitor).
mapfile -t candidates < <(python3 - "$STALE_EPOCH" "$CLOSE_EPOCH" "$CONFLICT_EPOCH" "$DRAFT_CLOSE_EPOCH" "$CI_FAIL_EPOCH" "$JSON_INPUT_PATH" <<'PY'
import json, re, sys
from datetime import datetime, timezone

stale_epoch       = int(sys.argv[1])
close_epoch       = int(sys.argv[2])
conflict_epoch    = int(sys.argv[3])
draft_close_epoch = int(sys.argv[4])
ci_fail_epoch     = int(sys.argv[5])
json_path         = sys.argv[6]

with open(json_path) as f:
    prs = json.load(f)

now = int(datetime.now(timezone.utc).timestamp())

def series_key(title):
    """Return a series key when the title matches a known autonomous
    cycle pattern, else None. Per-task PRs key on the task ID so the
    retry-merges-after-fail case collapses; cycle-kind PRs key on the
    kind so the daily redundant-pass case collapses."""
    m = re.match(r'^auto:\s+task\s+(\d+)', title, re.IGNORECASE)
    if m:
        return f"task-{m.group(1)}"
    m = re.match(r'^auto:\s+(eslint|coverage|refactor)\b', title, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    return None

# Filter to autonomous PRs
auto = []
for p in prs:
    head = p.get("headRefName", "")
    if not head.startswith("auto-improve-"):
        continue
    ca_epoch = int(datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00")).timestamp())
    p["_ca_epoch"] = ca_epoch
    p["_age_h"] = (now - ca_epoch) // 3600
    auto.append(p)

# Resolve duplicate-series: keep newest per series, the rest are dup-close candidates.
series_groups = {}
for p in auto:
    k = series_key(p.get("title", ""))
    if k is not None:
        series_groups.setdefault(k, []).append(p)

dup_close_nums = set()
for k, lst in series_groups.items():
    if len(lst) <= 1:
        continue
    # newest first; drop index 0 (keep), close the rest
    lst.sort(key=lambda p: p["_ca_epoch"], reverse=True)
    for p in lst[1:]:
        dup_close_nums.add(p["number"])

# Emit one record per PR; first matching rule wins (priority order).
for p in auto:
    num   = p["number"]
    head  = p.get("headRefName", "")
    title = (p.get("title") or "")[:60]
    age_h = p["_age_h"]
    ca    = p["_ca_epoch"]
    mss   = p.get("mergeStateStatus") or ""

    # Rule 1: CONFLICTING (DIRTY) + > CONFLICT_HOURS
    if mss == "DIRTY" and ca < conflict_epoch:
        print(f"CLOSE_CONFLICT|{num}|{head}|{title}|{age_h}")
        continue
    # Rule 2: duplicate-series (older siblings)
    if num in dup_close_nums:
        print(f"CLOSE_DUP|{num}|{head}|{title}|{age_h}")
        continue
    # Rule 3: CI=FAILURE + > CI_FAIL_HOURS + non-draft.
    # statusCheckRollup is an array of check-run / status objects whose
    # `conclusion` field is one of FAILURE / SUCCESS / SKIPPED / NEUTRAL
    # / CANCELLED / TIMED_OUT (or "" while pending). At least one
    # FAILURE conclusion is required so a PR with only flaky individual
    # failures-but-overall-pass is NOT closed (the rollup-level decision
    # belongs to GitHub; we only act on hard FAILUREs).
    if not p.get("isDraft", False) and ca < ci_fail_epoch:
        rollup = p.get("statusCheckRollup") or []
        has_failure = any(
            (c.get("conclusion") or "").upper() == "FAILURE"
            for c in rollup
            if isinstance(c, dict)
        )
        if has_failure:
            print(f"CLOSE_CI_FAIL|{num}|{head}|{title}|{age_h}")
            continue
    # Rule 4: age-based hard close
    if ca < close_epoch:
        print(f"CLOSE_AGE|{num}|{head}|{title}|{age_h}")
        continue
    # Rule 3b: already-draft hard close after DRAFT_CLOSE_DAYS (default 7d).
    # Drafts that have been parked > 7d have demonstrably failed to attract
    # human review; the autonomous loop produces fresher equivalents so the
    # work is not lost. Without this, drafts pile up until CLOSE_DAYS=30
    # fires — observed 2026-05-07: 49 drafts at median age 156h waiting.
    if p.get("isDraft", False) and ca < draft_close_epoch:
        print(f"CLOSE_DRAFT_AGE|{num}|{head}|{title}|{age_h}")
        continue
    # Rule 4: stale → draft
    if ca < stale_epoch and not p.get("isDraft", False):
        print(f"DRAFT|{num}|{head}|{title}|{age_h}")
PY
)

for line in "${candidates[@]}"; do
  [[ -z "$line" ]] && continue
  IFS='|' read -r action num branch title age_h <<< "$line"

  # Apply MAX_CLOSE_PER_RUN cap to all CLOSE_* actions (drafts uncapped).
  if [[ "$action" == CLOSE_* ]] && (( close_count >= MAX_CLOSE_PER_RUN )); then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "  [dry-run] SKIP-CAP  #${num} (${age_h}h)  ${title}  (would: ${action})"
    fi
    close_skipped_cap=$((close_skipped_cap + 1))
    continue
  fi

  case "$action" in
    DRAFT)
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] DRAFT  #${num} (${age_h}h old)  ${title}"
      else
        gh pr ready --undo "$num" 2>&1 | tail -1
        echo "  DRAFT  #${num} (${age_h}h)  ${title}"
      fi
      stale_count=$((stale_count + 1))
      ;;
    CLOSE_CONFLICT)
      reason="auto-stale (CONFLICTING + ${CONFLICT_HOURS}h): merge state DIRTY, ${age_h}h old — newer autonomous cycles likely supersede"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] CLOSE-CONFLICT  #${num} (${age_h}h)  ${title}"
      else
        gh pr close "$num" --delete-branch --comment "$reason" 2>&1 | tail -1
        echo "  CLOSE-CONFLICT  #${num} (${age_h}h)  ${title}"
      fi
      close_count=$((close_count + 1))
      close_conflict=$((close_conflict + 1))
      ;;
    CLOSE_DUP)
      reason="auto-stale (duplicate-series): a newer PR in the same autonomous series supersedes this one"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] CLOSE-DUP       #${num} (${age_h}h)  ${title}"
      else
        gh pr close "$num" --delete-branch --comment "$reason" 2>&1 | tail -1
        echo "  CLOSE-DUP  #${num} (${age_h}h)  ${title}"
      fi
      close_count=$((close_count + 1))
      close_dup=$((close_dup + 1))
      ;;
    CLOSE_AGE)
      reason="auto-stale: ${age_h}h old without merge — closing per pipeline policy (CLOSE_DAYS=${CLOSE_DAYS})"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] CLOSE-AGE       #${num} (${age_h}h)  ${title}"
      else
        gh pr close "$num" --delete-branch --comment "$reason" 2>&1 | tail -1
        echo "  CLOSE-AGE  #${num} (${age_h}h)  ${title}"
      fi
      close_count=$((close_count + 1))
      close_age=$((close_age + 1))
      ;;
    CLOSE_CI_FAIL)
      reason="chore: auto-close ${num} — CI failed for ${CI_FAIL_HOURS}h+, no recovery path"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] CLOSE-CI-FAIL   #${num} (${age_h}h)  ${title}"
      else
        gh pr close "$num" --delete-branch --comment "$reason" 2>&1 | tail -1
        echo "  CLOSE-CI-FAIL  #${num} (${age_h}h)  ${title}"
      fi
      close_count=$((close_count + 1))
      close_ci_fail=$((close_ci_fail + 1))
      ;;
    CLOSE_DRAFT_AGE)
      reason="auto-stale: draft for ${age_h}h without review — closing per DRAFT_CLOSE_DAYS=${DRAFT_CLOSE_DAYS} policy"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] CLOSE-DRAFT-AGE #${num} (${age_h}h)  ${title}"
      else
        gh pr close "$num" --delete-branch --comment "$reason" 2>&1 | tail -1
        echo "  CLOSE-DRAFT-AGE  #${num} (${age_h}h)  ${title}"
      fi
      close_count=$((close_count + 1))
      close_draft_age=$((close_draft_age + 1))
      ;;
  esac
done

echo ""
echo "Done. drafts=${stale_count}  closes=${close_count}  (conflict=${close_conflict}  dup=${close_dup}  ci_fail=${close_ci_fail}  age=${close_age}  draft_age=${close_draft_age})  skipped-by-cap=${close_skipped_cap}"
# Only clean up the fixture we wrote ourselves — never delete a caller-
# supplied --json-input fixture (tests rely on stable cleanup via trap).
if [[ $SKIP_GH_FETCH -eq 0 ]]; then
  rm -f "$JSON_INPUT_PATH"
fi
