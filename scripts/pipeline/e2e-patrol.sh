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
DESCRIPTIONS_DIR="$PROJECT_DIR/scripts/pipeline/descriptions"
# STATE_FILE removed — all 3 suites run every tick, no rotation needed

# CSV migration feature flag (Phase 2-A). When true, file_issue() inserts
# a row into issues.csv + writes descriptions/<id>.md instead of creating
# a per-file md.
USE_CSV=${USE_CSV:-false}
if [[ "$USE_CSV" == "true" ]]; then
  # shellcheck source=/dev/null
  . "$PROJECT_DIR/scripts/pipeline/csv-helpers.sh"
  mkdir -p "$DESCRIPTIONS_DIR"
fi

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
# Strip ANSI CSI sequences (cursor-up, erase-line, colors) so captured
# Playwright output is safe to embed in markdown issue bodies.
strip_ansi() { sed -E $'s/\x1b\\[[0-9;?]*[a-zA-Z]//g'; }

# ── Ensure CDP (headless Obsidian on Xvfb, isolated from main session) ──
LOG_PREFIX="e2e-patrol" bash "$PROJECT_DIR/scripts/pipeline/ensure-cdp.sh" || {
  log "ERROR: ensure-cdp.sh failed — see /tmp/obsidian-e2e-launch.log"
  exit 1
}

log "=== E2E Patrol START ==="

file_issue() {
  local slug="$1" prio="$2" summary="$3" desc="$4" criteria="$5"
  if [[ "$USE_CSV" == "true" ]]; then
    _file_issue_csv "$slug" "$prio" "$summary" "$desc" "$criteria"
  else
    _file_issue_md  "$slug" "$prio" "$summary" "$desc" "$criteria"
  fi
}

# Legacy md path — same minimal dedup (any file containing the slug)
# the patrol always used. Kept as fallback while USE_CSV is off.
_file_issue_md() {
  local slug="$1" prio="$2" summary="$3" desc="$4" criteria="$5"
  [[ -n "$(find "$ISSUE_DIR" -maxdepth 1 -name "*${slug}*" 2>/dev/null | head -1)" ]] && return 0
  local last_num=$(find "$ISSUE_DIR" "$ISSUE_DIR/done" -maxdepth 1 -name '*.md' 2>/dev/null | xargs -I{} basename {} | grep -oP '^\d+' | sort -n | tail -1)
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

# CSV path — uses the same active-slug skip and Jaccard rules as
# discover-issues.sh so e2e-patrol can't recreate near-duplicate rows.
_file_issue_csv() {
  local slug="$1" prio="$2" summary="$3" desc="$4" criteria="$5"

  # Skip if any active row already covers this slug
  if csv_select_active_by_slug issues "$slug" 2>/dev/null | grep -q .; then
    return 0
  fi

  # Skip if a near-duplicate summary is already active (different slug)
  local sim_out sim_int
  sim_out=$(csv_max_summary_jaccard issues "$summary" 2>/dev/null || echo "0|")
  sim_int="${sim_out%%|*}"
  sim_int=${sim_int//[^0-9]/}
  sim_int=${sim_int:-0}
  if [[ $sim_int -ge 70 ]]; then
    return 0
  fi

  local next_num new_id desc_rel desc_path
  next_num=$(csv_next_id_num)
  new_id=$(printf "%03d-%s" "$next_num" "$slug")
  desc_rel="scripts/pipeline/descriptions/${new_id}.md"
  desc_path="$PROJECT_DIR/$desc_rel"
  cat > "$desc_path" << DESC_EOF
## Description
$desc

## Acceptance criteria
$criteria
DESC_EOF

  csv_insert issues "$new_id" \
    "priority=$prio" \
    "source=e2e-patrol" \
    "parent=none" \
    "depends=none" \
    "summary=$summary" \
    "status=pending" \
    "description_path=$desc_rel"

  log "FILED: ${new_id} [csv]"
  (cd "$PROJECT_DIR" && git add scripts/pipeline/issues.csv "$desc_rel" \
    && git commit -m "chore(e2e-patrol): filed ${new_id}" --no-verify 2>/dev/null) || true
}

# ── 1. Smoke tests ──
log "Running smoke tests..."
E2E_OUT=$(NO_COLOR=1 FORCE_COLOR=0 npx playwright test --config e2e/cdp-smoke.config.ts --reporter=line 2>&1 | strip_ansi)
E2E_EXIT=$?
PASSED=$(echo "$E2E_OUT" | grep -oP '\d+ passed' | head -1 || echo "?")
FAILED=$(echo "$E2E_OUT" | grep -oP '\d+ failed' | head -1 || echo "0")
log "Smoke: $PASSED, failed=$FAILED (exit $E2E_EXIT)"
if [[ $E2E_EXIT -ne 0 ]]; then
  HEAD_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  EXCERPT=$(echo "$E2E_OUT" | grep -A2 "failed" | head -10)
  DETAILS="exit=$E2E_EXIT, head=$HEAD_SHA"$'\n\n'"$EXCERPT"
  file_issue "e2e-smoke-fail" "high" "E2E smoke test failure — $FAILED" "$DETAILS" "- [ ] E2E smoke tests pass"
fi

# ── 2. Visual report ──
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

# ── 3. Screenshot quality ──
log "Screenshot quality check..."
if [[ -f scripts/pipeline/visual-report.json ]]; then
  READ=$(python3 -c "import json; r=json.load(open('scripts/pipeline/visual-report.json')); s=next((x for x in r['scores'] if x['name']=='screenshotReadability'),None); print(s['score'] if s else 0)" 2>/dev/null || echo "0")
  SS=$(python3 -c "import json; print(json.load(open('scripts/pipeline/visual-report.json')).get('screenshot','none'))" 2>/dev/null || echo "none")
  log "Readability: $READ/100, Screenshot: $SS"
  if [[ $READ -lt 30 ]]; then
    file_issue "screenshot-unreadable" "high" "Screenshot readability $READ/100" "Readability score $READ < 30. Screenshot: $SS" "- [ ] Readability >= 30"
  fi
fi

log "=== E2E Patrol complete ==="
