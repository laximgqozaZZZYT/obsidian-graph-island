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

# ── Check user issue queue (HIGHEST PRIORITY) ──
ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
ISSUE_FILE=""
ISSUE_CONTENT=""
if [[ -d "$ISSUE_DIR" ]]; then
  # Pick highest-priority pending issue (critical > high > medium > low)
  for prio in critical high medium low; do
    ISSUE_FILE=$(grep -rl "priority: $prio" "$ISSUE_DIR"/*.md 2>/dev/null | while read f; do
      grep -q "status: pending" "$f" && echo "$f" && break
    done)
    [[ -n "$ISSUE_FILE" ]] && break
  done
fi

if [[ -n "$ISSUE_FILE" ]]; then
  FOCUS="user-issue"
  ISSUE_CONTENT=$(cat "$ISSUE_FILE")
  ISSUE_NAME=$(basename "$ISSUE_FILE")
  log "USER ISSUE: $ISSUE_NAME (priority: $prio)"
  # Mark as in-progress + commit to keep main clean
  sed -i 's/status: pending/status: in-progress/' "$PROJECT_DIR/scripts/pipeline/issues/$ISSUE_NAME" 2>/dev/null || true
  (cd "$PROJECT_DIR" && git add "scripts/pipeline/issues/$ISSUE_NAME" && git commit -m "chore: mark issue $ISSUE_NAME as in-progress" --no-verify 2>/dev/null) || true
else
  # ── Choose focus based on time-of-day rotation (not session count) ──
  # This ensures all 3 focus areas get equal time even with 1 session
  HOUR=$(date +%-H)
  FOCUS_AREAS=("coverage" "eslint" "refactor")
  FOCUS_INDEX=$(( (HOUR / 2) % 3 ))
  FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
fi
HOUR=${HOUR:-$(date +%-H)}
FOCUS_INDEX=${FOCUS_INDEX:-0}
log "Focus area: $FOCUS (hour=$HOUR, slot=$((FOCUS_INDEX + 1)))"

# ── CDP check (E2E runs via CDP — no display occupation) ──
# CDP page.screenshot() captures the internal render buffer,
# not the visible window. This is fully background-compatible.
CDP_AVAILABLE=false
if curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
  CDP_AVAILABLE=true
  log "CDP available — E2E screenshot + readability checks enabled (background, no display occupation)"
fi

# ============================================================
# IMPROVEMENT LOOP
# ============================================================
TOTAL_COMMITS=0

for iter in $(seq 1 "$MAX_ITERATIONS"); do
  log "── Iteration $iter/$MAX_ITERATIONS (focus: $FOCUS) ──"

  # ── ASSESS ──
  GATE_JSON=$(bash scripts/pipeline/enforce-gates.sh --json --skip-e2e 2>/dev/null || echo '{"passed":0}')
  GODOBJ_JSON=$(bash scripts/pipeline/god-object-audit.sh --json 2>&1 || echo '{"passed":0}')

  # Include visual regression feedback from previous iteration
  VISUAL_INFO="CDP unavailable"
  if [[ -n "${VISUAL_ISSUE:-}" ]]; then
    VISUAL_INFO="VISUAL REGRESSION: $VISUAL_ISSUE"
    VISUAL_ISSUE=""  # consume once
  fi
  if [[ "$CDP_AVAILABLE" == true ]]; then
    npx tsx scripts/pipeline/visual-report.ts 2>/dev/null
    VISUAL_INFO=$(python3 -c "
import json; r=json.load(open('scripts/pipeline/visual-report.json'))
print(f\"overall:{r['overallScore']}/100\")
" 2>/dev/null || echo "?")
  fi

  # ── IMPLEMENT ──
  log "Claude implementing ($FOCUS)..."

  GATE_STATUS=$(echo "$GATE_JSON" | python3 -c "import sys,json; g=json.load(sys.stdin).get('gates',{}); print(' '.join(f'{k}:{v}' for k,v in g.items()))" 2>/dev/null || echo "?")
  GODOBJ_STATUS=$(echo "$GODOBJ_JSON" | python3 -c "import sys,json; [print(f\"{k.split('/')[-1]}:{v['current']}/{v['limit']}\",end=' ') for k,v in json.load(sys.stdin).get('files',{}).items() if v.get('status')=='fail']" 2>/dev/null || echo "all pass")

  if [[ "$FOCUS" == "user-issue" ]]; then
    PROMPT="ユーザーから報告された課題を修正してください。

## 課題内容
$ISSUE_CONTENT

## 現在の状態
- ゲート: $GATE_STATUS
- God Objects: $GODOBJ_STATUS
- 視覚品質: $VISUAL_INFO

## ルール
- CLAUDE.md厳守
- God Object肥大化禁止
- テストを壊さない
- 課題の acceptance criteria を満たすこと
- 実装後は何もせず終了（検証はシェルが行う）"
  else
    PROMPT="自律改善サイクル iteration $iter/$MAX_ITERATIONS。focus: $FOCUS

状態:
- ゲート: $GATE_STATUS
- God Objects: $GODOBJ_STATUS
- 視覚品質: $VISUAL_INFO

focus=$FOCUS の改善を1つ実装せよ:
- coverage: 低カバレッジファイルにテスト追加 (純粋関数優先)
- eslint: complexity警告のリファクタ (閾値25、GVC内は行数を減らす方向で)
- refactor: God Object からのロジック抽出

禁止事項:
- ESLint設定ファイル (eslint.config.js) を変更しない
- カバレッジ閾値 (vitest.config.ts) を下げない
- 新しいESLint warningを出さない
- God Object ファイルの行数を増やさない

実装後は何もせず終了（検証はシェルが行う）。CLAUDE.md厳守。"
  fi

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

  # ── E2E VISUAL CHECK (background, no display occupation) ──
  if [[ "$CDP_AVAILABLE" == true ]]; then
    log "E2E: capturing screenshot + readability analysis (background)..."
    # Build + deploy first so Obsidian picks up changes
    node esbuild.config.mjs production >/dev/null 2>&1
    cp main.js "$PROJECT_DIR/../開発/.obsidian/plugins/graph-island/main.js" 2>/dev/null || true
    cp main.js "$PROJECT_DIR/../.obsidian/plugins/graph-island/main.js" 2>/dev/null || true
    sleep 3  # wait for Obsidian to hot-reload

    # Run visual report (CDP screenshot = background, no display needed)
    VISUAL_OUT=$(npx tsx "$PROJECT_DIR/scripts/pipeline/visual-report.ts" 2>&1 || echo "visual report failed")
    VISUAL_SCORE=$(python3 -c "
import json
r=json.load(open('$PROJECT_DIR/scripts/pipeline/visual-report.json'))
print(r['overallScore'])
" 2>/dev/null || echo "0")
    READABILITY_SCORE=$(python3 -c "
import json
r=json.load(open('$PROJECT_DIR/scripts/pipeline/visual-report.json'))
sr = next((s for s in r['scores'] if s['name']=='screenshotReadability'), None)
print(sr['score'] if sr else 0)
" 2>/dev/null || echo "0")
    SCREENSHOT=$(python3 -c "
import json
r=json.load(open('$PROJECT_DIR/scripts/pipeline/visual-report.json'))
print(r.get('screenshot','none'))
" 2>/dev/null || echo "none")

    log "E2E: overall=$VISUAL_SCORE/100, readability=$READABILITY_SCORE/100, screenshot=$SCREENSHOT"

    if [[ "$READABILITY_SCORE" -lt 30 ]]; then
      log "WARN: Readability score $READABILITY_SCORE < 30 — visual regression detected"
      # Feed back to Claude for the next iteration
      VISUAL_ISSUE="E2E readability score is $READABILITY_SCORE/100 (critical). Screenshot: $SCREENSHOT. Check visual-report.json for details."
    fi
  fi

  # ── COMMIT in worktree ──
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    COMMIT_PREFIX="chore(auto)"
    COMMIT_DETAIL="$FOCUS improvement"
    if [[ "$FOCUS" == "user-issue" && -n "$ISSUE_NAME" ]]; then
      COMMIT_PREFIX="fix(auto)"
      COMMIT_DETAIL="resolve $ISSUE_NAME"
    fi
    git commit -m "$(cat <<COMMITMSG
$COMMIT_PREFIX: $COMMIT_DETAIL (session $SESSION_ID, iter $iter)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
COMMITMSG
)" 2>&1 | tail -1
    TOTAL_COMMITS=$((TOTAL_COMMITS + 1))
    log "Committed (iter $iter)"
  else
    log "No changes (iter $iter)"
  fi

  # ── Mark user issue as done (if applicable) ──
  if [[ "$FOCUS" == "user-issue" && -n "$ISSUE_FILE" && $TOTAL_COMMITS -gt 0 ]]; then
    ISSUE_NAME=$(basename "$ISSUE_FILE")
    # Update status in main repo
    sed -i 's/status: in-progress/status: done/' "$PROJECT_DIR/scripts/pipeline/issues/$ISSUE_NAME" 2>/dev/null
    mv "$PROJECT_DIR/scripts/pipeline/issues/$ISSUE_NAME" "$PROJECT_DIR/scripts/pipeline/issues/done/$ISSUE_NAME" 2>/dev/null
    (cd "$PROJECT_DIR" && git add "scripts/pipeline/issues/" && git commit -m "chore: issue $ISSUE_NAME done" --no-verify 2>/dev/null) || true
    log "Issue $ISSUE_NAME marked as done and moved to done/"
    # Clear issue for next iteration (fall back to auto-focus)
    ISSUE_FILE=""
    FOCUS_AREAS=("coverage" "eslint" "refactor")
    FOCUS_INDEX=$((ACTIVE_COUNT % ${#FOCUS_AREAS[@]}))
    FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
    log "Switching to auto-focus: $FOCUS"
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
