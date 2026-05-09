#!/usr/bin/env bash
# pipeline-status.sh — One-line pipeline health summary.
#
# Goal: operator can decide in <1 second whether the autonomous pipeline
# needs intervention. progress-report.sh is too verbose for that — this
# script collapses the same kaizen-metric signals to a single line.
#
# Exit codes:
#   0 = OK         (everything within bounds)
#   1 = WARN       (degraded but not urgent — review soon)
#   2 = CRITICAL   (pipeline stalled / disabled / broken — act now)
#
# Output: exactly ONE line on stdout, prefixed with OK / WARN: / CRITICAL:.
# Same data sources as progress-report.sh "Kaizen Metrics" (R4-C).
#
# Usage: bash scripts/pipeline/pipeline-status.sh
set -uo pipefail

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
cd "$PROJECT_DIR" || exit 2

# CRITICAL 判定 (高優先度から):
# 1. Kill-switch active → CRITICAL: pipeline manually disabled
KILL_SWITCH_FILE="${PIPELINE_DISABLE_FILE:-$PROJECT_DIR/.pipeline-disabled}"
if [[ -f "$KILL_SWITCH_FILE" ]]; then
  echo "CRITICAL: kill-switch active ($KILL_SWITCH_FILE)"
  exit 2
fi

# 2. Dirty-skip counter ≥ threshold → CRITICAL: stalled
DIRTY_COUNTER_FILE="${DIRTY_COUNTER_FILE:-/tmp/graph-island-dirty-skip-count}"
DIRTY_COUNTER=0
[[ -f "$DIRTY_COUNTER_FILE" ]] && DIRTY_COUNTER=$(cat "$DIRTY_COUNTER_FILE" 2>/dev/null || echo 0)
if [[ "$DIRTY_COUNTER" -ge 3 ]]; then
  echo "CRITICAL: autonomous-improve stalled (dirty-skip $DIRTY_COUNTER cycles)"
  exit 2
fi

# 3. Pipeline tests fail → CRITICAL
if ! bash "$PROJECT_DIR/tests/pipeline/run-all.sh" -q >/dev/null 2>&1; then
  echo "CRITICAL: pipeline tests broken (run: bash tests/pipeline/run-all.sh)"
  exit 2
fi

# WARN 判定:
# 4. Decompose throttle ACTIVE
THROTTLE_DEPTH=$(python3 -c "
import csv
with open('$PROJECT_DIR/scripts/pipeline/tasks.csv') as f:
    print(sum(1 for r in csv.DictReader(f) if r.get('status') in ('pending', 'decomposed', 'in_progress', 'in-progress')))
" 2>/dev/null || echo "?")
THROTTLE_CAP="${DECOMPOSE_THROTTLE_CAP:-200}"
if [[ "$THROTTLE_DEPTH" =~ ^[0-9]+$ && "$THROTTLE_DEPTH" -ge "$THROTTLE_CAP" ]]; then
  echo "WARN: decompose throttle active ($THROTTLE_DEPTH/$THROTTLE_CAP)"
  exit 1
fi

# 5. Bifurcation behind ≥ threshold
git fetch origin main --quiet 2>/dev/null || true
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [[ "$BEHIND" -ge 5 ]]; then
  echo "WARN: local main is $BEHIND commits behind origin/main"
  exit 1
fi

# 6. Open auto-improve PRs over cap
OPEN_AUTO_PRS=$(gh pr list --limit 60 --state open --json headRefName \
  --jq 'map(select(.headRefName | startswith("auto-improve-"))) | length' \
  2>/dev/null || echo "?")
if [[ "$OPEN_AUTO_PRS" =~ ^[0-9]+$ && "$OPEN_AUTO_PRS" -gt 20 ]]; then
  echo "WARN: $OPEN_AUTO_PRS open auto-improve-* PRs (cap 20)"
  exit 1
fi

# OK
echo "OK: pipeline healthy (depth=$THROTTLE_DEPTH/$THROTTLE_CAP, behind=$BEHIND, prs=$OPEN_AUTO_PRS)"
exit 0
