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
)
declare -a PROTECTED_PREFIXES=(
  "scripts/pipeline/"
  ".github/workflows/"
)

# Allowed prefixes — every changed file must match at least one of these.
declare -a ALLOWED_PREFIXES=(
  "src/"
  "tests/"
)

cd "$PROJECT_DIR" || exit 1

NOW_EPOCH=$(date +%s)
AGE_THRESHOLD=$(( NOW_EPOCH - MIN_AGE_HOURS * 3600 ))

echo "=== auto-merge-pr ($(date -Iseconds)) ==="
echo "MIN_AGE_HOURS: $MIN_AGE_HOURS"
echo "Mode:          $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo apply)"
echo ""

# Pre-collect candidates via mapfile to avoid pipe-subshell stdout-trap.
mapfile -t candidates < <(gh pr list --state open --limit 100 \
  --json number,headRefName,title,createdAt,isDraft,mergeable,mergeStateStatus \
  2>/dev/null \
  | python3 - "$AGE_THRESHOLD" <<'PY'
import json, sys
from datetime import datetime, timezone

age_threshold = int(sys.argv[1])
prs = json.load(sys.stdin)

ok_merge_status = {"CLEAN", "UNSTABLE"}

for p in prs:
    head = p.get("headRefName", "")
    if not head.startswith("auto-improve-"):
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
  #   - must be under an ALLOWED prefix
  #   - must NOT be a protected path or under a protected prefix
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
    # Protected prefix?
    for pre in "${PROTECTED_PREFIXES[@]}"; do
      if [[ "$f" == "$pre"* ]]; then
        ok=0; reason="protected prefix: $f"; break 2
      fi
    done
    # Must be under an allowed prefix
    allowed=0
    for pre in "${ALLOWED_PREFIXES[@]}"; do
      [[ "$f" == "$pre"* ]] && { allowed=1; break; }
    done
    if [[ $allowed -eq 0 ]]; then
      ok=0; reason="outside src/ or tests/: $f"; break
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
echo "Done. (merged=$merged_count, rejected-protected=$rejected_protected, rejected-outside=$rejected_outside)"
