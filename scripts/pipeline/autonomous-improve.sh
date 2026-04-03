#!/usr/bin/env bash
# ============================================================
# autonomous-improve.sh — Headless autonomous improvement cycle
# ============================================================
# crontab entry:
#   23 */3 * * * /home/ubuntu/obsidian-plugins/obsidian-graph-island/scripts/pipeline/autonomous-improve.sh >> /tmp/graph-island-improve.log 2>&1
#
# Architecture:
#   - This script is the WORKFLOW LAYER for /improve
#   - It mechanically enforces: assess → implement → verify → commit
#   - Claude handles judgment (what to fix, how to fix)
#   - The shell handles control flow (loop, gate check, commit)
# ============================================================
set -uo pipefail

# ── Environment (cron inherits minimal PATH) ──
export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
LOCK_FILE="/tmp/graph-island-improve.lock"
LOG_FILE="/tmp/graph-island-improve.log"
RESULT_FILE="/tmp/graph-island-improve-result.json"
MAX_LOG_SIZE=$((10 * 1024 * 1024))
MAX_ITERATIONS=5
MAX_TURNS=40

cd "$PROJECT_DIR" || exit 1

# ── Lock: prevent concurrent runs ──
if [[ -f "$LOCK_FILE" ]]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "0")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[$(date -Iseconds)] SKIP: Previous run active (PID $LOCK_PID)"
    exit 0
  fi
  echo "[$(date -Iseconds)] STALE: Removing stale lock (PID $LOCK_PID)"
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── Log rotation ──
if [[ -f "$LOG_FILE" ]] && [[ $(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
fi

echo ""
echo "================================================================"
echo "[$(date -Iseconds)] AUTONOMOUS IMPROVE CYCLE START"
echo "================================================================"

# ── Pre-flight checks ──

# 1. Claude CLI available?
if ! command -v claude &>/dev/null; then
  echo "[$(date -Iseconds)] ERROR: claude CLI not found"
  exit 1
fi

# 2. Another Claude session active?
CLAUDE_PIDS=$(pgrep -f "claude.*-p" 2>/dev/null | grep -v $$ || true)
if [[ -n "$CLAUDE_PIDS" ]]; then
  echo "[$(date -Iseconds)] SKIP: Another Claude session active (PIDs: $CLAUDE_PIDS)"
  exit 0
fi

# 3. Working directory clean?
if [[ -n "$(git status --porcelain)" ]]; then
  echo "[$(date -Iseconds)] SKIP: Working directory dirty"
  git status --short | head -5
  exit 0
fi

# 4. Node/npm working?
if ! node -e "process.exit(0)" 2>/dev/null; then
  echo "[$(date -Iseconds)] ERROR: node not working"
  exit 1
fi

echo "[$(date -Iseconds)] Pre-flight OK"

# ── CDP / E2E availability ──
CDP_AVAILABLE=false
if curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
  CDP_AVAILABLE=true
  echo "[$(date -Iseconds)] CDP available — E2E visual quality enabled"
else
  echo "[$(date -Iseconds)] CDP unavailable — E2E visual quality skipped"
fi

# ── Record "before" state ──
BEFORE_COMMIT=$(git rev-parse --short HEAD)
BEFORE_TESTS=$(npx vitest run 2>&1 | grep -oP '\d+ passed' | head -1 || echo "?")
BEFORE_COVERAGE=$(python3 -c "
import json
d=json.load(open('coverage/coverage-summary.json'))['total']
print(f\"S{d['statements']['pct']:.1f}/B{d['branches']['pct']:.1f}/F{d['functions']['pct']:.1f}/L{d['lines']['pct']:.1f}\")
" 2>/dev/null || echo "?")
BEFORE_VISUAL="n/a"
if [[ "$CDP_AVAILABLE" == true ]]; then
  npx tsx scripts/pipeline/visual-report.ts 2>/dev/null
  BEFORE_VISUAL=$(python3 -c "
import json
r=json.load(open('scripts/pipeline/visual-report.json'))
print(f\"{r['overallScore']}/100\")
" 2>/dev/null || echo "?")
  echo "[$(date -Iseconds)] Before visual: $BEFORE_VISUAL"
fi
echo "[$(date -Iseconds)] Before: commit=$BEFORE_COMMIT tests=$BEFORE_TESTS coverage=$BEFORE_COVERAGE visual=$BEFORE_VISUAL"

# ============================================================
# IMPROVEMENT LOOP (WORKFLOW LAYER — shell controls iteration)
# ============================================================
TOTAL_COMMITS=0

for iter in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "── Iteration $iter/$MAX_ITERATIONS ──"

  # ── Step 1: ASSESS (shell — mechanical) ──
  echo "[$(date +%H:%M:%S)] Assessing..."
  GATE_JSON=$(bash scripts/pipeline/enforce-gates.sh --json --skip-e2e 2>/dev/null || echo '{"passed":0}')
  GATE_PASSED=$(echo "$GATE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('passed',0))" 2>/dev/null || echo "0")

  GODOBJ_JSON=$(bash scripts/pipeline/god-object-audit.sh --json 2>&1 || echo '{"passed":0}')
  GODOBJ_PASSED=$(echo "$GODOBJ_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('passed',0))" 2>/dev/null || echo "0")

  # Visual quality (if CDP available)
  VISUAL_INFO="CDP unavailable"
  if [[ "$CDP_AVAILABLE" == true ]]; then
    npx tsx scripts/pipeline/visual-report.ts 2>/dev/null
    VISUAL_INFO=$(python3 -c "
import json
r=json.load(open('scripts/pipeline/visual-report.json'))
scores = ' '.join(f\"{s['name']}:{s['score']}\" for s in r['scores'])
issues = '; '.join(r['topIssues'][:3]) if r['topIssues'] else 'none'
print(f\"overall:{r['overallScore']}/100 [{scores}] issues: {issues}\")
" 2>/dev/null || echo "report failed")
    echo "[$(date +%H:%M:%S)] Visual: $VISUAL_INFO"
  fi

  # ── Step 2: PRIORITIZE + IMPLEMENT (agent — judgment) ──
  echo "[$(date +%H:%M:%S)] Claude implementing improvement..."

  PROMPT="自律改善サイクル iteration $iter/$MAX_ITERATIONS。

現在の状態:
- ゲート: $(echo "$GATE_JSON" | python3 -c "import sys,json; g=json.load(sys.stdin).get('gates',{}); print(' '.join(f'{k}:{v}' for k,v in g.items()))" 2>/dev/null || echo "unknown")
- God Objects: $(echo "$GODOBJ_JSON" | python3 -c "
import sys,json
f=json.load(sys.stdin).get('files',{})
for k,v in f.items():
  if v.get('status')=='fail': print(f\"{k.split('/')[-1]}: {v['current']}/{v['limit']}\", end=' ')
" 2>/dev/null || echo "all pass")
- 視覚品質: $VISUAL_INFO

優先順位: gate failure > god object > visual quality(score<50) > coverage > lint > visual(50-80)
1つだけ選んで修正。実装後は何もせず終了すること（検証はシェルが行う）。
視覚品質の問題がある場合は scripts/pipeline/visual-report.json を読んで詳細を確認すること。"

  claude -p "$PROMPT" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Agent" \
    --max-turns "$MAX_TURNS" \
    2>&1 | tail -10

  # ── Step 3: VERIFY (shell — mechanical, Claude cannot skip) ──
  echo "[$(date +%H:%M:%S)] Verifying gates..."
  VERIFY_OK=false

  for fix_attempt in $(seq 1 3); do
    if bash scripts/pipeline/enforce-gates.sh --skip-e2e >/dev/null 2>&1; then
      VERIFY_OK=true
      break
    fi

    if [[ $fix_attempt -lt 3 ]]; then
      echo "[$(date +%H:%M:%S)] Gate failed, fix attempt $fix_attempt/3..."
      ERRORS=$(bash scripts/pipeline/enforce-gates.sh --skip-e2e 2>&1 | grep "^FAIL" || echo "unknown")
      claude -p "ゲートが失敗しました: $ERRORS — 修正してください。" \
        --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
        --max-turns 15 \
        2>&1 | tail -3
    fi
  done

  if [[ "$VERIFY_OK" != true ]]; then
    echo "[$(date +%H:%M:%S)] ABORT: Gates failed after 3 fix attempts"
    break
  fi

  # ── Step 3b: VISUAL VERIFY (shell — if CDP available) ──
  if [[ "$CDP_AVAILABLE" == true ]]; then
    echo "[$(date +%H:%M:%S)] Deploying + visual verify..."
    cp main.js "/home/ubuntu/obsidian-plugins/開発/.obsidian/plugins/graph-island/main.js" 2>/dev/null || true
    cp main.js "/home/ubuntu/obsidian-plugins/.obsidian/plugins/graph-island/main.js" 2>/dev/null || true
    sleep 2
    npx tsx scripts/pipeline/visual-report.ts 2>/dev/null
    ITER_VISUAL=$(python3 -c "import json; r=json.load(open('scripts/pipeline/visual-report.json')); print(f\"{r['overallScore']}/100\")" 2>/dev/null || echo "?")
    echo "[$(date +%H:%M:%S)] Visual after iteration $iter: $ITER_VISUAL"
  fi

  # ── Step 4: COMMIT (shell — mechanical) ──
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[$(date +%H:%M:%S)] Committing..."
    git add -A
    git commit -m "chore: autonomous improvement cycle iteration $iter

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>&1 | tail -1
    TOTAL_COMMITS=$((TOTAL_COMMITS + 1))
  else
    echo "[$(date +%H:%M:%S)] No changes to commit"
  fi

  # ── Step 5: Ratchet coverage if applicable ──
  if [[ -f coverage/coverage-summary.json ]]; then
    bash scripts/coverage-ratchet.sh 2>&1 | tail -1
    if [[ -n "$(git status --porcelain vitest.config.ts)" ]]; then
      git add vitest.config.ts
      git commit -m "chore: ratchet coverage thresholds (auto)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>&1 | tail -1
      TOTAL_COMMITS=$((TOTAL_COMMITS + 1))
    fi
  fi

done

# ============================================================
# SUMMARY
# ============================================================
AFTER_COMMIT=$(git rev-parse --short HEAD)
AFTER_TESTS=$(npx vitest run 2>&1 | grep -oP '\d+ passed' | head -1 || echo "?")
AFTER_VISUAL="n/a"
if [[ "$CDP_AVAILABLE" == true ]]; then
  AFTER_VISUAL=$(python3 -c "import json; r=json.load(open('scripts/pipeline/visual-report.json')); print(f\"{r['overallScore']}/100\")" 2>/dev/null || echo "?")
fi

echo ""
echo "================================================================"
echo "[$(date -Iseconds)] AUTONOMOUS IMPROVE CYCLE COMPLETE"
echo "================================================================"
echo "Iterations: $MAX_ITERATIONS attempted"
echo "Commits: $TOTAL_COMMITS"
echo "Before: $BEFORE_COMMIT ($BEFORE_TESTS, $BEFORE_COVERAGE, visual=$BEFORE_VISUAL)"
echo "After:  $AFTER_COMMIT ($AFTER_TESTS, visual=$AFTER_VISUAL)"
echo ""

# Write structured result for external tools
cat > "$RESULT_FILE" << ENDJSON
{
  "timestamp": "$(date -Iseconds)",
  "iterations": $MAX_ITERATIONS,
  "commits": $TOTAL_COMMITS,
  "before": {"commit": "$BEFORE_COMMIT", "tests": "$BEFORE_TESTS", "coverage": "$BEFORE_COVERAGE"},
  "after": {"commit": "$AFTER_COMMIT", "tests": "$AFTER_TESTS", "visual": "$AFTER_VISUAL"}
}
ENDJSON
