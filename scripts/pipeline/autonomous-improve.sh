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

# ── Environment ──
export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
LOG_FILE="/tmp/graph-island-improve.log"
RESULT_DIR="/tmp/graph-island-improve-results"
MAX_LOG_SIZE=$((10 * 1024 * 1024))
MAX_SESSIONS=3
MAX_ITERATIONS=3
MAX_TURNS=30

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

log "================================================================"
log "AUTONOMOUS IMPROVE CYCLE START"
log "================================================================"

# ── Pre-flight checks ──
if ! command -v claude &>/dev/null; then
  log "ERROR: claude CLI not found"
  exit 1
fi

if ! node -e "process.exit(0)" 2>/dev/null; then
  log "ERROR: node not working"
  exit 1
fi

# ── Count active sessions (exclude self + parent shell wrappers) ──
ACTIVE_COUNT=$(pgrep -xf "bash .*/autonomous-improve.sh" 2>/dev/null | grep -v $$ | wc -l || echo "0")
if [[ $ACTIVE_COUNT -ge $MAX_SESSIONS ]]; then
  log "SKIP: $ACTIVE_COUNT sessions already running (max $MAX_SESSIONS)"
  exit 0
fi
log "Active sessions: $ACTIVE_COUNT/$MAX_SESSIONS — proceeding as session $((ACTIVE_COUNT + 1))"

# ── Ensure main is clean for worktree creation ──
cd "$PROJECT_DIR" || exit 1
if [[ -n "$(git status --porcelain)" ]]; then
  log "SKIP: Main working directory dirty"
  git status --short | head -5 | while IFS= read -r line; do log "  $line"; done
  exit 0
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

# ── Cleanup trap ──
cleanup() {
  log "Cleaning up worktree..."
  cd "$PROJECT_DIR" || true
  git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || rm -rf "$WORKTREE_DIR"
  git branch -D "$WORKTREE_BRANCH" 2>/dev/null || true
  git worktree prune 2>/dev/null
  log "Cleanup complete"
}
trap cleanup EXIT

# ── Work in worktree ──
cd "$WORKTREE_DIR" || exit 1

# ── Choose focus area based on session number to avoid conflicts ──
FOCUS_AREAS=("coverage" "eslint" "refactor")
FOCUS_INDEX=$((ACTIVE_COUNT % ${#FOCUS_AREAS[@]}))
FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
log "Focus area: $FOCUS (session slot $((ACTIVE_COUNT + 1)))"

# ── CDP check ──
CDP_AVAILABLE=false
curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1 && CDP_AVAILABLE=true

# ============================================================
# IMPROVEMENT LOOP
# ============================================================
TOTAL_COMMITS=0

for iter in $(seq 1 "$MAX_ITERATIONS"); do
  log "── Iteration $iter/$MAX_ITERATIONS (focus: $FOCUS) ──"

  # ── ASSESS ──
  GATE_JSON=$(bash scripts/pipeline/enforce-gates.sh --json --skip-e2e 2>/dev/null || echo '{"passed":0}')
  GODOBJ_JSON=$(bash scripts/pipeline/god-object-audit.sh --json 2>&1 || echo '{"passed":0}')

  VISUAL_INFO="CDP unavailable"
  if [[ "$CDP_AVAILABLE" == true ]]; then
    npx tsx scripts/pipeline/visual-report.ts 2>/dev/null
    VISUAL_INFO=$(python3 -c "
import json; r=json.load(open('scripts/pipeline/visual-report.json'))
print(f\"overall:{r['overallScore']}/100\")
" 2>/dev/null || echo "?")
  fi

  # ── IMPLEMENT ──
  log "Claude implementing ($FOCUS)..."

  PROMPT="自律改善サイクル iteration $iter/$MAX_ITERATIONS。focus: $FOCUS

状態:
- ゲート: $(echo "$GATE_JSON" | python3 -c "import sys,json; g=json.load(sys.stdin).get('gates',{}); print(' '.join(f'{k}:{v}' for k,v in g.items()))" 2>/dev/null || echo "?")
- God Objects: $(echo "$GODOBJ_JSON" | python3 -c "import sys,json; [print(f\"{k.split('/')[-1]}:{v['current']}/{v['limit']}\",end=' ') for k,v in json.load(sys.stdin).get('files',{}).items() if v.get('status')=='fail']" 2>/dev/null || echo "all pass")
- 視覚品質: $VISUAL_INFO

focus=$FOCUS の改善を1つ実装せよ:
- coverage: 低カバレッジファイルにテスト追加
- eslint: complexity警告のリファクタ (GVC内は行数を減らす方向で)
- refactor: God Object からのロジック抽出

実装後は何もせず終了（検証はシェルが行う）。CLAUDE.md厳守。"

  claude -p "$PROMPT" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Agent" \
    --max-turns "$MAX_TURNS" \
    2>&1 | tail -5

  # ── VERIFY ──
  log "Verifying gates..."
  VERIFY_OK=false
  for fix_attempt in $(seq 1 3); do
    if bash scripts/pipeline/enforce-gates.sh --skip-e2e >/dev/null 2>&1; then
      VERIFY_OK=true
      break
    fi
    if [[ $fix_attempt -lt 3 ]]; then
      log "Gate failed, fix attempt $fix_attempt/3..."
      ERRORS=$(bash scripts/pipeline/enforce-gates.sh --skip-e2e 2>&1 | grep "^FAIL" || echo "unknown")
      claude -p "ゲートが失敗: $ERRORS — 修正せよ。" \
        --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
        --max-turns 10 \
        2>&1 | tail -3
    fi
  done

  if [[ "$VERIFY_OK" != true ]]; then
    log "ABORT: Gates failed after 3 fix attempts"
    break
  fi

  # ── COMMIT in worktree ──
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    git commit -m "$(cat <<COMMITMSG
chore(auto): $FOCUS improvement (session $SESSION_ID, iter $iter)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
COMMITMSG
)" 2>&1 | tail -1
    TOTAL_COMMITS=$((TOTAL_COMMITS + 1))
    log "Committed (iter $iter)"
  else
    log "No changes (iter $iter)"
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
# MERGE BACK TO MAIN
# ============================================================
if [[ $TOTAL_COMMITS -gt 0 ]]; then
  log "Merging $TOTAL_COMMITS commits back to main..."
  cd "$PROJECT_DIR" || exit 1

  # Acquire merge lock (only one session merges at a time)
  MERGE_LOCK="/tmp/graph-island-merge.lock"
  for wait in $(seq 1 30); do
    if mkdir "$MERGE_LOCK" 2>/dev/null; then
      break
    fi
    sleep 2
  done
  trap 'rmdir "$MERGE_LOCK" 2>/dev/null; cleanup' EXIT

  # Verify main is clean
  if [[ -n "$(git status --porcelain)" ]]; then
    log "WARN: Main dirty at merge time, skipping merge"
  else
    git merge "$WORKTREE_BRANCH" --no-edit 2>&1 | while IFS= read -r line; do log "  $line"; done
    MERGE_EXIT=$?
    if [[ $MERGE_EXIT -ne 0 ]]; then
      log "WARN: Merge conflict — aborting merge, keeping worktree branch"
      git merge --abort 2>/dev/null
    else
      log "Merge successful"
    fi
  fi

  rmdir "$MERGE_LOCK" 2>/dev/null
else
  log "No commits to merge"
fi

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
