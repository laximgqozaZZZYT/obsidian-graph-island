#!/usr/bin/env bash
# ============================================================
# e2e-patrol.sh — Independent E2E patrol (background, no timeout)
# ============================================================
# Runs separately from autonomous-improve sessions.
# Rotates through E2E checks, captures screenshots,
# and files issues when problems are found.
#
# crontab: 17 * * * * .../e2e-patrol.sh >> /tmp/graph-island-e2e.log 2>&1
# ============================================================
set -uo pipefail

export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
LOCK_FILE="/tmp/graph-island-e2e-patrol.lock"
ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
STATE_FILE="/tmp/graph-island-e2e-state.json"

cd "$PROJECT_DIR" || exit 1

# ── Lock ──
if [[ -f "$LOCK_FILE" ]]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "0")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[$(date -Iseconds)] SKIP: patrol running (PID $LOCK_PID)"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

log() { echo "[$(date -Iseconds)] [e2e-patrol] $*"; }

# ── Ensure CDP ──
if ! curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
  log "CDP unavailable — restarting Obsidian..."
  killall obsidian 2>/dev/null; sleep 3
  nohup /opt/Obsidian/obsidian --remote-debugging-port=9222 > /dev/null 2>&1 &
  for i in $(seq 1 15); do sleep 2
    curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1 && break
  done
  if ! curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
    log "ERROR: CDP failed"; exit 1
  fi
  log "CDP connected"
fi

# ── Rotation ──
ROTATION=0
[[ -f "$STATE_FILE" ]] && ROTATION=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('rotation',0))" 2>/dev/null || echo "0")
ROTATION=${ROTATION//[^0-9]/}; ROTATION=${ROTATION:-0}

SUITES=("smoke" "visual-report" "screenshot-quality")
SUITE="${SUITES[$((ROTATION % ${#SUITES[@]}))]}"
log "=== E2E Patrol: $SUITE (rotation $ROTATION) ==="

file_issue() {
  local slug="$1" prio="$2" summary="$3" desc="$4" criteria="$5"
  [[ -n "$(ls "$ISSUE_DIR"/*"$slug"* 2>/dev/null)" ]] && return 0
  local last_num=$(ls "$ISSUE_DIR"/*.md "$ISSUE_DIR"/done/*.md 2>/dev/null | xargs -I{} basename {} | grep -oP '^\d+' | sort -n | tail -1)
  last_num=$(echo "${last_num:-0}" | sed 's/^0*//'); last_num=${last_num:-0}
  local num=$(printf "%03d" $((last_num + 1)))
  cat > "$ISSUE_DIR/${num}-${slug}.md" << EOF
---
priority: $prio
reported: $(date +%Y-%m-%d)
status: pending
source: e2e-patrol
summary: $summary
---
## Description
$desc
## Acceptance criteria
$criteria
EOF
  log "FILED: ${num}-${slug}.md"
  (cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ && git commit -m "chore(e2e-patrol): filed ${num}-${slug}" --no-verify 2>/dev/null) || true
}

case "$SUITE" in
  smoke)
    log "Running smoke tests..."
    E2E_OUT=$(npx playwright test --config e2e/cdp-smoke.config.ts --reporter=line 2>&1)
    E2E_EXIT=$?
    PASSED=$(echo "$E2E_OUT" | grep -oP '\d+ passed' | head -1 || echo "?")
    FAILED=$(echo "$E2E_OUT" | grep -oP '\d+ failed' | head -1 || echo "0")
    log "Smoke: $PASSED, failed=$FAILED (exit $E2E_EXIT)"
    if [[ $E2E_EXIT -ne 0 ]]; then
      DETAILS=$(echo "$E2E_OUT" | grep -A2 "failed" | head -10)
      file_issue "e2e-smoke-fail" "high" "E2E smoke test failure — $FAILED" "$DETAILS" "- [ ] E2E smoke tests pass"
    fi
    ;;
  visual-report)
    log "Running visual report..."
    npx tsx scripts/pipeline/visual-report.ts 2>&1 | tail -5
    if [[ -f scripts/pipeline/visual-report.json ]]; then
      OVERALL=$(python3 -c "import json; print(json.load(open('scripts/pipeline/visual-report.json'))['overallScore'])" 2>/dev/null || echo "0")
      log "Visual score: $OVERALL/100"
      if [[ $OVERALL -lt 50 ]]; then
        ISSUES=$(python3 -c "import json; r=json.load(open('scripts/pipeline/visual-report.json')); print('; '.join(r.get('topIssues',[])[:3]))" 2>/dev/null || echo "?")
        file_issue "visual-quality-low" "high" "Visual quality $OVERALL/100" "Score $OVERALL < 50. Issues: $ISSUES" "- [ ] Visual score >= 50"
      fi
    fi
    ;;
  screenshot-quality)
    log "Screenshot quality check..."
    npx tsx scripts/pipeline/visual-report.ts 2>/dev/null
    if [[ -f scripts/pipeline/visual-report.json ]]; then
      READ=$(python3 -c "import json; r=json.load(open('scripts/pipeline/visual-report.json')); s=next((x for x in r['scores'] if x['name']=='screenshotReadability'),None); print(s['score'] if s else 0)" 2>/dev/null || echo "0")
      SS=$(python3 -c "import json; print(json.load(open('scripts/pipeline/visual-report.json')).get('screenshot','none'))" 2>/dev/null || echo "none")
      log "Readability: $READ/100, Screenshot: $SS"
      if [[ $READ -lt 30 ]]; then
        file_issue "screenshot-unreadable" "high" "Screenshot readability $READ/100" "Readability score $READ < 30. Screenshot: $SS" "- [ ] Readability >= 30"
      fi
    fi
    ;;
esac

echo "{\"rotation\": $((ROTATION + 1)), \"last_suite\": \"$SUITE\", \"timestamp\": \"$(date -Iseconds)\"}" > "$STATE_FILE"
log "=== E2E Patrol complete ==="
