#!/usr/bin/env bash
# ============================================================
# auto-merge-pr.sh — Auto-merge autonomous-improve PRs to main
# ============================================================
# Closes the ⑤ merge bottleneck of the autonomous pipeline. Only
# touches PRs whose head ref starts with "auto-improve-" so it never
# disturbs human PRs or stacked Phase PRs.
#
# Adoption criteria (ALL must be met):
#   1. branch matches `auto-improve-*`
#   2. state=OPEN, isDraft=false
#   3. mergeable=MERGEABLE, mergeStateStatus in {CLEAN, UNSTABLE}
#      (UNSTABLE = no required check, gates run client-side)
#   4. age >= MIN_AGE_HOURS (default 1h, env override)
#   5. ALL changed files under src/ or tests/
#   6. NO change to protected paths:
#        CLAUDE.md, vitest.config.ts,
#        scripts/pipeline/**, .github/workflows/**,
#        package.json, pnpm-lock.yaml
#
# Usage:
#   ./auto-merge-pr.sh --dry-run    # list candidates, no action
#   ./auto-merge-pr.sh --apply      # actually merge via gh --admin
#
# Suggested cron (USER decides when to enable):
#   */30 * * * * /home/ubuntu/.../auto-merge-pr.sh --apply >> /tmp/graph-island-auto-merge.log 2>&1
# ============================================================
set -uo pipefail

# ── Heartbeat (2026-05-09 R11-A kaizen) ──
# Touch the log file at startup so cron-health.sh (R9-C) can detect that
# the cron actually fired, even if subsequent guards (kill-switch /
# dirty-skip / exit) bail before any normal output is produced.
LOG_FILE="${AUTO_MERGE_PR_LOG_FILE:-/tmp/graph-island-auto-merge.log}"
{ printf '[heartbeat] %s auto-merge-pr started\n' "$(date -Iseconds)"; } >> "$LOG_FILE" 2>/dev/null || true

# ── Kill-switch (2026-05-08 kaizen) ──
# Operator can disable the entire autonomous pipeline by creating
# $PROJECT_DIR/.pipeline-disabled (touch the file). All cron scripts
# bail at exit 0 so cron sees no error. Re-enable by removing the file.
PIPELINE_DISABLE_FILE="${PIPELINE_DISABLE_FILE:-/home/ubuntu/obsidian-plugins/obsidian-graph-island/.pipeline-disabled}"
if [[ -f "$PIPELINE_DISABLE_FILE" ]]; then
  echo "PIPELINE-DISABLED: $PIPELINE_DISABLE_FILE exists — skipping cycle" >&2
  exit 0
fi

case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  --apply)   DRY_RUN=0 ;;
  *)
    echo "Usage: $0 --dry-run | --apply" >&2
    exit 2
    ;;
esac

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
MIN_AGE_HOURS="${MIN_AGE_HOURS:-1}"

# Protected paths — any change touching these is rejected.
# Pipeline self-modification, ratchet/coverage governance, CI config,
# and dependency files all need human review.
declare -a PROTECTED_PATHS=(
  "CLAUDE.md"
  "vitest.config.ts"
  "package.json"
  "pnpm-lock.yaml"
  "scripts/pipeline/csv-schema.md"
)
# Glob patterns matching protected pipeline CODE files. Bash `*` does not
# match `/`, so e.g. `scripts/pipeline/*.sh` does not cover descriptions/.
# Previously the catch-all prefix `scripts/pipeline/` blocked auto-merge for
# every PR that touched any pipeline state file (issues.csv, descriptions/),
# which the autonomous loop produces as side effects on every cycle —
# observed 2026-05-07: 12 PRs stuck "rejected-protected" for 25h+ that way.
declare -a PROTECTED_GLOBS=(
  "scripts/pipeline/*.sh"
  "scripts/pipeline/*.py"
  "scripts/pipeline/*.ts"
  "scripts/pipeline/*.mjs"
  ".github/workflows/*"
)

# Allowed prefixes — every changed file must match either an allowed prefix
# or an allowed exact path.
declare -a ALLOWED_PREFIXES=(
  "src/"
  "tests/"
  "scripts/pipeline/descriptions/"
  "scripts/pipeline/attempts/"
  "scripts/pipeline/reports/"
  "scripts/pipeline/tasks/"
)
declare -a ALLOWED_PATHS=(
  "scripts/pipeline/issues.csv"
  "scripts/pipeline/tasks.csv"
  "scripts/pipeline/attempts.csv"
  "scripts/pipeline/visual-report.json"
)

cd "$PROJECT_DIR" || exit 1

# ── Log rotation (run at EXIT, after the cycle's output is written) ──
# Cron parents this script with `>> $LOG_FILE`, establishing an append fd
# before this script starts. Rotating mid-cycle with `mv` would still write
# to the renamed file via the inherited fd. `: > "$LOG_FILE"` truncates
# in place, preserving the fd — the next cycle starts in a fresh file.
LOG_FILE="/tmp/graph-island-auto-merge.log"
MAX_LOG_SIZE=$((10 * 1024 * 1024))  # 10MB — mirror autonomous-improve.sh:20
rotate_log() {
  if [[ -f "$LOG_FILE" ]] && [[ $(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]]; then
    cp "$LOG_FILE" "${LOG_FILE}.old" 2>/dev/null || true
    : > "$LOG_FILE"
  fi
}
trap 'rotate_log' EXIT

NOW_EPOCH=$(date +%s)
AGE_THRESHOLD=$(( NOW_EPOCH - MIN_AGE_HOURS * 3600 ))

echo "=== auto-merge-pr ($(date -Iseconds)) ==="
echo "MIN_AGE_HOURS: $MIN_AGE_HOURS"
echo "Mode:          $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo apply)"
echo ""

# gh JSON to a tmp file (heredoc and pipe-stdin can't coexist as a python
# input source — heredoc wins, so pipe data would be lost). Includes
# baseRefName so we can reject PRs targeting non-main bases below.
gh pr list --state open --limit 100 \
  --json number,headRefName,baseRefName,title,createdAt,isDraft,mergeable,mergeStateStatus \
  > /tmp/auto-merge-prs.json 2>/dev/null

mapfile -t candidates < <(python3 - "$AGE_THRESHOLD" /tmp/auto-merge-prs.json <<'PY'
import json, sys
from datetime import datetime, timezone

age_threshold = int(sys.argv[1])
json_path = sys.argv[2]

with open(json_path) as f:
    prs = json.load(f)

ok_merge_status = {"CLEAN", "UNSTABLE"}

for p in prs:
    head = p.get("headRefName", "")
    if not head.startswith("auto-improve-"):
        continue
    # Only merge PRs targeting main directly. Anything else points at a
    # ghost feature branch and the merge never reaches main.
    if p.get("baseRefName") != "main":
        continue
    if p.get("isDraft"):
        continue
    if p.get("mergeable") != "MERGEABLE":
        continue
    if p.get("mergeStateStatus") not in ok_merge_status:
        continue
    ca = datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00"))
    if int(ca.timestamp()) > age_threshold:
        continue
    print(f"{p['number']}|{head}|{p['title'][:60]}|{int(ca.timestamp())}")
PY
)

merged_count=0
rejected_protected=0
rejected_outside=0
rejected_test_less=0

# Threshold: src/ additions below this many lines are exempted from the
# tests-required gate (typo / comment / 1-line bugfix territory). Set via
# env if you want a stricter or looser bar.
TESTLESS_MIN_ADDITIONS="${TESTLESS_MIN_ADDITIONS:-20}"

for line in "${candidates[@]}"; do
  [[ -z "$line" ]] && continue
  IFS='|' read -r num branch title created <<< "$line"
  age_h=$(( (NOW_EPOCH - created) / 3600 ))

  # Get the file list for this PR (server-side query)
  files=$(gh pr diff "$num" --name-only 2>/dev/null)
  if [[ -z "$files" ]]; then
    echo "  SKIP  #${num} (could not enumerate files)  ${title}"
    continue
  fi

  # Check every file:
  #   - must NOT be a protected path or match a protected glob
  #   - must match an allowed exact path or be under an allowed prefix
  ok=1
  reason=""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    # Protected exact match?
    for p in "${PROTECTED_PATHS[@]}"; do
      if [[ "$f" == "$p" ]]; then
        ok=0; reason="protected file: $f"; break 2
      fi
    done
    # Protected glob (bash pathname matching — * does not span /)
    for g in "${PROTECTED_GLOBS[@]}"; do
      # shellcheck disable=SC2053  # intentional glob (no quotes around $g)
      if [[ "$f" == $g ]]; then
        ok=0; reason="protected glob: $f"; break 2
      fi
    done
    # Must match an allowed exact path or an allowed prefix
    allowed=0
    for p in "${ALLOWED_PATHS[@]}"; do
      [[ "$f" == "$p" ]] && { allowed=1; break; }
    done
    if [[ $allowed -eq 0 ]]; then
      for pre in "${ALLOWED_PREFIXES[@]}"; do
        [[ "$f" == "$pre"* ]] && { allowed=1; break; }
      done
    fi
    if [[ $allowed -eq 0 ]]; then
      ok=0; reason="outside allowed paths: $f"; break
    fi
  done <<< "$files"

  if [[ $ok -eq 0 ]]; then
    echo "  SKIP  #${num} (${age_h}h)  ${reason}"
    if [[ "$reason" == protected* ]]; then
      rejected_protected=$((rejected_protected + 1))
    else
      rejected_outside=$((rejected_outside + 1))
    fi
    continue
  fi

  # ── Test-less gate ──
  # Reject PRs that add a non-trivial NEW src/ file but ship zero tests/
  # changes. Audit on 2026-05-07 found 37% of recent autonomous PRs merged
  # with no test coverage at all — this catches that class.
  #
  # Exempted (gate passes):
  #   - src/types.ts                       (type-only declarations)
  #   - any *.d.ts                         (declaration files)
  #   - src/**/index.ts with additions ≤ 5 (pure re-export barrels)
  #   - src/ files with additions < TESTLESS_MIN_ADDITIONS (default 20)
  pr_files_tmp="/tmp/auto-merge-pr-${num}-files.json"
  gh pr view "$num" --json files --jq '.files' > "$pr_files_tmp" 2>/dev/null
  if [[ -s "$pr_files_tmp" ]]; then
    testless_reason=$(python3 - "$TESTLESS_MIN_ADDITIONS" "$pr_files_tmp" <<'PY'
import json, sys
threshold = int(sys.argv[1])
path_in   = sys.argv[2]
try:
    with open(path_in) as f:
        files = json.load(f)
except Exception:
    sys.exit(0)
if not isinstance(files, list):
    sys.exit(0)

has_test_change = any(f.get("path", "").startswith("tests/") for f in files)

new_src_offenders = []
for f in files:
    path = f.get("path", "")
    add  = int(f.get("additions", 0) or 0)
    dele = int(f.get("deletions", 0) or 0)
    if not path.startswith("src/"):
        continue
    # New file = additions only, no deletions on same path.
    if dele != 0:
        continue
    # Tiny edits don't require new tests.
    if add < threshold:
        continue
    # Type-only / declaration exemptions.
    if path == "src/types.ts":
        continue
    if path.endswith(".d.ts"):
        continue
    # Pure re-export barrel (index.ts with ≤ 5 additions).
    if path.endswith("/index.ts") and add <= 5:
        continue
    new_src_offenders.append((path, add))

if new_src_offenders and not has_test_change:
    p, a = new_src_offenders[0]
    print(f"no tests for new src files: {p} (+{a})")
PY
)
    rm -f "$pr_files_tmp"
    if [[ -n "$testless_reason" ]]; then
      echo "  SKIP  #${num} (${age_h}h)  ${testless_reason}"
      rejected_test_less=$((rejected_test_less + 1))
      continue
    fi
  else
    rm -f "$pr_files_tmp"
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  [dry-run] MERGE #${num} (${age_h}h)  ${title}"
  else
    if gh pr merge "$num" --merge --admin --delete-branch 2>&1 | tail -1; then
      echo "  MERGED #${num} (${age_h}h)  ${title}"
      merged_count=$((merged_count + 1))
    else
      echo "  FAIL   #${num} (gh pr merge failed)"
    fi
  fi
done

echo ""
echo "Done. (merged=$merged_count, rejected-protected=$rejected_protected, rejected-outside=$rejected_outside, rejected-test-less=$rejected_test_less)"
rm -f /tmp/auto-merge-prs.json
