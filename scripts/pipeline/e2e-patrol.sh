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
DESCRIPTIONS_DIR="$PROJECT_DIR/scripts/pipeline/descriptions"
# STATE_FILE removed — all 3 suites run every tick, no rotation needed

# shellcheck source=/dev/null
. "$PROJECT_DIR/scripts/pipeline/csv-helpers.sh"
mkdir -p "$DESCRIPTIONS_DIR"

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
# Stale-detection: capture pre-run mtime so we can tell whether visual-report.ts
# actually wrote a fresh JSON. Without this guard, a silent crash (e.g. dependency
# resolution failure as in 2026-05-07) lets the patrol read 27-day-old data and
# falsely report "healthy" — the exact failure mode that hid label-readability=6
# from the queue for weeks.
log "Running visual report..."
PRE_MTIME=$(stat -c %Y scripts/pipeline/visual-report.json 2>/dev/null || echo 0)
VR_OUT=$(npx tsx scripts/pipeline/visual-report.ts 2>&1 | tail -5)
VR_EXIT=$?
echo "$VR_OUT"
POST_MTIME=$(stat -c %Y scripts/pipeline/visual-report.json 2>/dev/null || echo 0)
if [[ $VR_EXIT -ne 0 || "$POST_MTIME" == "$PRE_MTIME" ]]; then
  log "ERROR: visual-report.ts failed (exit=$VR_EXIT, mtime_changed=$([[ $POST_MTIME != $PRE_MTIME ]] && echo y || echo n))"
  file_issue "visual-report-broken" "critical" \
    "visual-report.ts crashed or produced no output (exit=$VR_EXIT)" \
    "Patrol cannot assess visual quality. Last 5 lines of output:"$'\n\n'"$VR_OUT" \
    "- [ ] visual-report.ts runs to completion and writes fresh visual-report.json"
fi
if [[ -f scripts/pipeline/visual-report.json ]]; then
  OVERALL=$(python3 -c "import json; print(json.load(open('scripts/pipeline/visual-report.json'))['overallScore'])" 2>/dev/null || echo "0")
  log "Visual score: $OVERALL/100"
  if [[ $OVERALL -lt 50 ]]; then
    ISSUES=$(python3 -c "import json; r=json.load(open('scripts/pipeline/visual-report.json')); print('; '.join(r.get('topIssues',[])[:3]))" 2>/dev/null || echo "?")
    file_issue "visual-quality-low" "high" "Visual quality $OVERALL/100" "Score $OVERALL < 50. Issues: $ISSUES" "- [ ] Visual score >= 50"
  fi
  # Sub-score floor: averaging into overallScore can hide a single catastrophic
  # sub-score (observed 2026-05-07: labelReadability=3 hidden by overall=78).
  # File a separate issue for any sub-score < SUBSCORE_FLOOR even when overall
  # passes — discover-issues.sh:202 already does this with floor=40, mirror it.
  COLLAPSED=$(python3 -c "
import json
r = json.load(open('scripts/pipeline/visual-report.json'))
floor = 30
hits = [f\"{s['name']}={s['score']}\" for s in r.get('scores', []) if s.get('score', 100) < floor]
print('|'.join(hits) if hits else '')
" 2>/dev/null || echo "")
  if [[ -n "$COLLAPSED" ]]; then
    file_issue "subscore-collapse" "high" \
      "Visual sub-score collapse: $COLLAPSED" \
      "One or more sub-scores < 30 even though overall=$OVERALL passes. Hidden by averaging:\n$COLLAPSED" \
      "- [ ] All visual-report sub-scores >= 30"
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
