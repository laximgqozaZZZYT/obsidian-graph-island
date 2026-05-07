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
rm -f /tmp/auto-merge-prs.json
