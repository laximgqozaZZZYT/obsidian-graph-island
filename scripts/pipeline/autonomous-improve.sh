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
MAX_SESSIONS=4
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

# ── Cleanup zombie/orphan processes from previous sessions ──
# Skip if e2e-patrol is running (don't kill its processes)
E2E_PATROL_RUNNING=false
if [[ -f /tmp/graph-island-e2e-patrol.lock ]]; then
  E2E_PID=$(cat /tmp/graph-island-e2e-patrol.lock 2>/dev/null || echo "0")
  kill -0 "$E2E_PID" 2>/dev/null && E2E_PATROL_RUNNING=true
fi

if [[ "$E2E_PATROL_RUNNING" == true ]]; then
  log "e2e-patrol running (PID $E2E_PID) — skipping zombie cleanup"
else
  # visual-report.ts orphans (pre-fix sessions that never called browser.close)
  ZOMBIE_VR=$(pgrep -f "tsx scripts/pipeline/visual-report" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_VR -gt 0 ]]; then
    pkill -9 -f "tsx scripts/pipeline/visual-report" 2>/dev/null
    log "Killed $ZOMBIE_VR zombie visual-report processes"
  fi
  # playwright orphans (not from active e2e-patrol)
  ZOMBIE_PW=$(pgrep -f "playwright.*cdp-smoke" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_PW -gt 0 ]]; then
    pkill -9 -f "playwright.*cdp-smoke" 2>/dev/null
    log "Killed $ZOMBIE_PW zombie playwright processes"
  fi
  # esbuild daemon orphans (keep 2 for active sessions)
  ZOMBIE_ES=$(pgrep -f "esbuild --service" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_ES -gt 2 ]]; then
    pkill -9 -f "esbuild --service" 2>/dev/null
    log "Killed $ZOMBIE_ES zombie esbuild processes"
  fi
  # vitest worker orphans (keep 4 for active sessions)
  ZOMBIE_VT=$(pgrep -f "vitest.mjs" 2>/dev/null | wc -l)
  if [[ $ZOMBIE_VT -gt 4 ]]; then
    pkill -9 -f "vitest.mjs" 2>/dev/null
    log "Killed $ZOMBIE_VT zombie vitest processes"
  fi
fi

# ── Pre-flight checks ──
if ! command -v claude &>/dev/null; then
  log "ERROR: claude CLI not found"
  exit 1
fi

if ! node -e "process.exit(0)" 2>/dev/null; then
  log "ERROR: node not working"
  exit 1
fi

# ── Count active sessions via lock directory (not pgrep) ──
LOCK_DIR="/tmp/graph-island-sessions"
mkdir -p "$LOCK_DIR"
# Clean stale locks (PID dead OR session older than 2 hours)
MAX_SESSION_AGE=7200  # 2 hours
for lockfile in "$LOCK_DIR"/*.pid; do
  [[ -f "$lockfile" ]] || continue
  LOCK_PID=$(cat "$lockfile" 2>/dev/null || echo "0")
  LOCK_AGE=$(( $(date +%s) - $(stat -c%Y "$lockfile" 2>/dev/null || echo "$(date +%s)") ))
  if ! kill -0 "$LOCK_PID" 2>/dev/null || [[ $LOCK_AGE -gt $MAX_SESSION_AGE ]]; then
    kill -9 "$LOCK_PID" 2>/dev/null  # force kill if still alive but too old
    rm -f "$lockfile"
    log "CLEANED: stale lock $(basename $lockfile) (PID=$LOCK_PID, age=${LOCK_AGE}s)"
  fi
done
ACTIVE_COUNT=$(find "$LOCK_DIR" -maxdepth 1 -name '*.pid' 2>/dev/null | wc -l)
if [[ $ACTIVE_COUNT -ge $MAX_SESSIONS ]]; then
  log "SKIP: $ACTIVE_COUNT sessions running (max $MAX_SESSIONS)"
  exit 0
fi
# Register this session (cleanup in main trap)
echo $$ > "$LOCK_DIR/$SESSION_ID.pid"
log "Active sessions: $ACTIVE_COUNT/$MAX_SESSIONS — proceeding"

# ── Handle orphaned in-progress items (issues + tasks) ──
# Issues: carry over with attempt history
# Tasks: auto-subdivide into smaller tasks via decompose-issue.sh
ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
TASK_DIR="$PROJECT_DIR/scripts/pipeline/tasks"
TASK_DONE_DIR="$TASK_DIR/done"
mkdir -p "$TASK_DIR" "$TASK_DONE_DIR"

NOW=$(date +%s)
for dir in "$ISSUE_DIR" "$TASK_DIR"; do
  [[ -d "$dir" ]] || continue
  for f in "$dir"/*.md; do
    [[ -f "$f" ]] || continue
    grep -q "status: in-progress" "$f" 2>/dev/null || continue
    FILE_AGE=$(( NOW - $(stat -c%Y "$f" 2>/dev/null || echo "$NOW") ))
    [[ $FILE_AGE -gt 600 ]] || continue  # 10 min grace period

    FNAME=$(basename "$f")
    if [[ "$dir" == "$TASK_DIR" ]]; then
      # Task timed out → subdivide, with guards against explosion:
      # 1. Max depth 1 (parent→child only, no grandchildren)
      # 2. Max 10 total tasks per parent issue
      DEPTH=$(echo "$FNAME" | grep -o "subtask" | wc -l)
      PARENT_NUM=$(echo "$FNAME" | grep -oP '^\d+-\K\d+' | head -1)
      SIBLING_COUNT=$(find "$TASK_DIR" "$TASK_DONE_DIR" -maxdepth 1 -name "*-${PARENT_NUM:-xxx}-*" 2>/dev/null | wc -l)
      if [[ $DEPTH -lt 1 && $SIBLING_COUNT -lt 10 ]]; then
        log "SUBDIVIDE: $FNAME timed out (${FILE_AGE}s, depth=$DEPTH)"
        if ! bash "$PROJECT_DIR/scripts/pipeline/decompose-issue.sh" "$f" 2>&1 | while IFS= read -r line; do log "  $line"; done; then
          # Subdivision failed (rate limit, etc) → reset to pending instead of leaving in-progress
          log "SUBDIVIDE FAILED: $FNAME — resetting to pending"
          sed -i 's/status: in-progress/status: pending/' "$f"
          sed -i 's/status: decomposed/status: pending/' "$f"
        fi
      else
        # Max depth reached → mark as blocked, don't subdivide further
        log "BLOCKED: $FNAME at max subdivision depth ($DEPTH) — needs manual attention"
        sed -i 's/status: in-progress/status: blocked/' "$f"
      fi
      (cd "$PROJECT_DIR" && git add scripts/pipeline/ && git commit -m "chore: handle timed-out task $FNAME" --no-verify 2>/dev/null) || true
    else
      # Issue timed out → carry over with attempt history
      ORPHANED=false
      if [[ -z "$(find "$LOCK_DIR" -maxdepth 1 -name '*.pid' 2>/dev/null | head -1)" ]]; then
        ORPHANED=true
      elif [[ $FILE_AGE -gt 600 ]]; then
        ORPHANED=true
      fi
      if [[ "$ORPHANED" == true ]]; then
        FNAME=$(basename "$f")
        ATTEMPT_COUNT=$(grep -c "^### Attempt " "$f" 2>/dev/null; true)
        ATTEMPT_COUNT=${ATTEMPT_COUNT:-0}
        NEXT_ATTEMPT=$((ATTEMPT_COUNT + 1))

        # Find relevant session log entries
        SLUG="${FNAME%.md}"
        LAST_SESSION_LOG=$(grep -l "$SLUG" /tmp/graph-island-improve-results/*.json 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
        SESSION_SUMMARY=""
        if [[ -n "$LAST_SESSION_LOG" ]]; then
          LAST_SID=$(grep -oP '"session":\s*"\K[^"]+' "$LAST_SESSION_LOG" 2>/dev/null || echo "unknown")
          LAST_COMMITS=$(grep -oP '"commits":\s*\K[0-9]+' "$LAST_SESSION_LOG" 2>/dev/null || echo "0")
          SESSION_SUMMARY="session=$LAST_SID, commits=$LAST_COMMITS"
        fi

        # Append attempt record to issue file
        cat >> "$f" << ATTEMPT_EOF

### Attempt $NEXT_ATTEMPT ($(date -Iseconds))
- Status: timed out after 1h
- ${SESSION_SUMMARY:-no session log found}
- Previous session could not complete this issue within max turns.
- **Continue from where the last session left off. Do not repeat already-attempted approaches.**
ATTEMPT_EOF

        # Reset to pending so it gets picked up again
        sed -i 's/status: in-progress/status: pending/' "$f"
        log "CARRYOVER: $FNAME → pending (attempt $NEXT_ATTEMPT, age: ${FILE_AGE}s)"
        (cd "$PROJECT_DIR" && git add "$f" && git commit -m "chore: carryover stale issue $FNAME (attempt $NEXT_ATTEMPT)" --no-verify 2>/dev/null) || true
      fi
    fi
  done
done

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

# ── Cleanup trap (worktree + session lock + child processes) ──
cleanup() {
  rm -f "$LOCK_DIR/$SESSION_ID.pid" 2>/dev/null
  # Kill any child processes this session spawned
  pkill -P $$ 2>/dev/null
  wait 2>/dev/null  # Reap zombies
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

# ── DISCOVER: static scan + kaizen analysis ──
log "Running static issue discovery..."
bash "$PROJECT_DIR/scripts/pipeline/discover-issues.sh" 2>&1 | tail -5 | while IFS= read -r line; do log "  $line"; done

# Kaizen-driven deep analysis (every 4th session to save API calls)
HOUR=${HOUR:-$(date +%-H)}
if [[ $((HOUR % 4)) -eq 0 ]]; then
  PENDING_COUNT=$(find "$PROJECT_DIR/scripts/pipeline/issues" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
  if [[ $PENDING_COUNT -lt 5 ]]; then
    log "Running /kaizen issue discovery (hour=$HOUR, pending=$PENDING_COUNT)..."
    KAIZEN_PROMPT="あなたはKaizen(継続的改善)のスペシャリストです。

Graph Island Obsidian プラグインのソースコード(src/)を分析し、
既存コードの品質課題を発見してください。

## ルール
- 機能追加のアイデアは禁止。既存コードの問題だけ報告すること
- 課題 = バグ、品質劣化、規約違反、一貫性の欠如、リスクのある実装
- アイデア ≠ 課題。「こうしたら良い」ではなく「ここが壊れている/危険」を報告
- CLAUDE.md のルールに照らして違反を探す
- 具体的なファイル名と行番号を含めること

## 分析対象 (優先順位順)
1. ランタイムバグの可能性 (null参照、境界値、競合状態)
2. リソースリーク (イベントリスナー未解除、タイマー未クリア)
3. CLAUDE.md規約違反 (ハードコード値、God Object肥大化兆候)
4. エラーハンドリングの欠陥
5. 型安全性の穴 (any型、unsafe cast)
6. テストされていない危険なコードパス

## 出力形式
発見した課題ごとに以下を scripts/pipeline/issues/ にファイルとして書き出すこと:

ファイル名: scripts/pipeline/issues/NNN-slug.md (NNNは既存最大番号+1)

内容:
---
priority: high または medium
reported: $(date +%Y-%m-%d)
status: pending
source: kaizen
summary: 1行要約
---
## Description
詳細説明(ファイル名:行番号を含む)
## Acceptance criteria
- [ ] 具体的な修正基準

最大3件まで。既に scripts/pipeline/issues/ にある課題と重複しないこと。
既存のissueを確認してから書くこと。"

    claude -p "$KAIZEN_PROMPT" \
      --allowedTools "Bash,Read,Glob,Grep,Write" \
      --max-turns 20 \
      2>&1 | tail -5 | while IFS= read -r line; do log "  kaizen: $line"; done

    # Auto-commit any newly created issues to keep main clean
    if [[ -n "$(cd "$PROJECT_DIR" && git status --porcelain scripts/pipeline/issues/)" ]]; then
      (cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ && git commit -m "chore: kaizen-discovered issues

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" --no-verify 2>/dev/null) || true
      log "Kaizen issues committed to main"
    fi
  fi
fi

# ── PRIORITIZE: moved into loop (per-iteration context reset) ──
# Issue queue check + focus selection now happens at the start of each iteration
# to ensure clean context and pick up newly filed issues mid-session.

# ── Focus exhaustion check ──
# Returns 0 (true) if the last 3 sessions with this focus all had 0 commits.
_focus_exhausted() {
  local f="$1"
  local recent_commits
  recent_commits=$(grep -l "\"focus\": \"$f\"" "$RESULT_DIR"/*.json 2>/dev/null \
    | xargs ls -t 2>/dev/null | head -3 \
    | xargs grep -h '"commits":' 2>/dev/null \
    | grep -oP '"commits":\s*\K[0-9]+' \
    | awk '{s+=$1} END{print s+0}')
  [[ "$recent_commits" -eq 0 ]]
}

# ── E2E/CDP: handled by e2e-patrol.sh (separate cron, background) ──

# ============================================================
# IMPROVEMENT LOOP
# ============================================================
TOTAL_COMMITS=0

for iter in $(seq 1 "$MAX_ITERATIONS"); do

  # ── CONTEXT RESET (コンテキスト汚染防止) ──
  # 各イテレーションをクリーンな状態から開始。
  # リセットするもの: 前イテレーションの判断結果・中間変数
  GATE_JSON=""
  GODOBJ_JSON=""
  GATE_STATUS=""
  GODOBJ_STATUS=""
  REVIEW_FINDINGS=""
  PROMPT=""
  SKILL_CONTEXT=""
  ISSUE_FILE=""
  ISSUE_CONTENT=""
  ISSUE_NAME=""

  # ── Work selection: tasks first → issues → focus rotation ──
  ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
  TASK_DIR="$PROJECT_DIR/scripts/pipeline/tasks"

  # Step 1: Check tasks/ for pending work (already decomposed, ready to implement)
  ISSUE_FILE=""
  if [[ -d "$TASK_DIR" ]]; then
    for prio in critical high medium low; do
      ISSUE_FILE=$(grep -rl "priority: $prio" "$TASK_DIR"/*.md 2>/dev/null | while read f; do
        grep -q "status: pending" "$f" || continue
        echo "$f" && break
      done)
      [[ -n "$ISSUE_FILE" ]] && break
    done
  fi

  if [[ -n "$ISSUE_FILE" ]]; then
    FOCUS="task"
    ISSUE_CONTENT=$(cat "$ISSUE_FILE")
    ISSUE_NAME=$(basename "$ISSUE_FILE")
    log "TASK: $ISSUE_NAME"
    sed -i 's/status: pending/status: in-progress/' "$ISSUE_FILE" 2>/dev/null || true
    (cd "$PROJECT_DIR" && git add scripts/pipeline/tasks/ && git commit -m "chore: start task $ISSUE_NAME" --no-verify 2>/dev/null) || true
  else
    # Step 2: Check issues/ for pending issues → decompose into tasks
    ISSUE_FILE=""
    if [[ -d "$ISSUE_DIR" ]]; then
      for prio in critical high medium low; do
        ISSUE_FILE=$(grep -rl "priority: $prio" "$ISSUE_DIR"/*.md 2>/dev/null | while read f; do
          grep -q "status: pending" "$f" || continue
          echo "$f" && break
        done)
        [[ -n "$ISSUE_FILE" ]] && break
      done
    fi

    if [[ -n "$ISSUE_FILE" ]]; then
      ISSUE_NAME=$(basename "$ISSUE_FILE")
      log "ISSUE: $ISSUE_NAME — decomposing into tasks..."
      bash "$PROJECT_DIR/scripts/pipeline/decompose-issue.sh" "$ISSUE_FILE" 2>&1 | while IFS= read -r line; do log "  decompose: $line"; done

      # Pick first task from newly created tasks
      ISSUE_FILE=""
      for prio in critical high medium low; do
        ISSUE_FILE=$(grep -rl "status: pending" "$TASK_DIR"/*.md 2>/dev/null | head -1)
        [[ -n "$ISSUE_FILE" ]] && break
      done

      if [[ -n "$ISSUE_FILE" ]]; then
        FOCUS="task"
        ISSUE_CONTENT=$(cat "$ISSUE_FILE")
        ISSUE_NAME=$(basename "$ISSUE_FILE")
        log "FIRST TASK: $ISSUE_NAME"
        sed -i 's/status: pending/status: in-progress/' "$ISSUE_FILE" 2>/dev/null || true
        (cd "$PROJECT_DIR" && git add scripts/pipeline/tasks/ && git commit -m "chore: start task $ISSUE_NAME" --no-verify 2>/dev/null) || true
      else
        log "WARN: decomposition produced no tasks, falling back to auto-focus"
        HOUR=$(date +%-H)
        FOCUS_AREAS=("coverage" "eslint" "refactor")
        FOCUS_INDEX=$(( (HOUR / 2) % 3 ))
        FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
      fi
    else
      # Step 3: No issues or tasks → focus rotation
    HOUR=$(date +%-H)
    FOCUS_AREAS=("coverage" "eslint" "refactor")
    FOCUS_INDEX=$(( (HOUR / 2) % 3 ))
    FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"

    # ── Skip exhausted focus areas ──
    TRIED=0
    while _focus_exhausted "$FOCUS" && [[ $TRIED -lt 3 ]]; do
      log "SKIP focus=$FOCUS (last 3 sessions: 0 commits) — trying next"
      FOCUS_INDEX=$(( (FOCUS_INDEX + 1) % 3 ))
      FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
      TRIED=$((TRIED + 1))
    done
    if [[ $TRIED -ge 3 ]]; then
      log "ALL focus areas exhausted (0 commits each). Skipping session."
      exit 0
    fi
    fi  # end: if [[ -n "$ISSUE_FILE" ]] (Step 2)
  fi  # end: if [[ -n "$ISSUE_FILE" ]] (Step 1)

  log "── Iteration $iter/$MAX_ITERATIONS (focus: $FOCUS, context: clean) ──"

  # ── ASSESS (fresh data, no carry-over) ──
  GATE_JSON=$(bash scripts/pipeline/enforce-gates.sh --json 2>/dev/null || echo '{"passed":0}')
  GODOBJ_JSON=$(bash scripts/pipeline/god-object-audit.sh --json 2>&1 || echo '{"passed":0}')

  # ── IMPLEMENT ──
  log "Claude implementing ($FOCUS)..."

  GATE_STATUS=$(echo "$GATE_JSON" | python3 -c "import sys,json; g=json.load(sys.stdin).get('gates',{}); print(' '.join(f'{k}:{v}' for k,v in g.items()))" 2>/dev/null || echo "?")
  GODOBJ_STATUS=$(echo "$GODOBJ_JSON" | python3 -c "import sys,json; [print(f\"{k.split('/')[-1]}:{v['current']}/{v['limit']}\",end=' ') for k,v in json.load(sys.stdin).get('files',{}).items() if v.get('status')=='fail']" 2>/dev/null || echo "all pass")

  if [[ "$FOCUS" == "task" || "$FOCUS" == "auto-issue" ]]; then
    # Task or auto-discovered issue — small, focused implementation
    PROMPT="以下のタスクを実装してください。

## タスク
$ISSUE_CONTENT

## 現在の状態
- ゲート: $GATE_STATUS
- God Objects: $GODOBJ_STATUS

## 手順
1. /research: 関連ファイルを読んで理解する
2. 実装: 最小限の変更で acceptance criteria を満たす
3. 実装後は何もせず終了（検証はシェルが行う）

## ルール
- CLAUDE.md厳守
- God Object肥大化禁止
- テストを壊さない
- 1つのタスクだけ実装する（他のタスクに手を出さない）
- ESLint設定やカバレッジ閾値を変更しない"
  else
    # Each focus uses its appropriate skill
    SKILL_CONTEXT=""
    case "$FOCUS" in
      coverage)
        SKILL_CONTEXT="あなたは /test スペシャリストです。
## /test の原則
- カバレッジレポートを読んで最も効果的なテスト対象を選ぶ
- 純粋関数を優先 (DOM/Canvas依存は後回し)
- 境界値テスト: 空入力、極端な値、型境界
- 既存テストと重複しない
- テストの意味がある (形式だけのテストは不要)"
        ;;
      eslint)
        SKILL_CONTEXT="あなたは /simplify スペシャリストです。
## /simplify の原則
- 複雑な関数を小さなヘルパーに分割
- 早期returnで分岐を減らす
- 重複コードを共通関数に抽出
- 動作は変えない (純粋なリファクタ)
- ESLint complexity 閾値は 25"
        ;;
      refactor)
        SKILL_CONTEXT="あなたは /research + /simplify スペシャリストです。
## /research の原則
- まずコードを読んで構造を理解する
- 依存関係を把握してから抽出する
## /simplify の原則
- God Object からロジックを新ファイルに抽出
- importを正しく更新
- 行数削減を確認"
        ;;
    esac

    PROMPT="自律改善サイクル iteration $iter/$MAX_ITERATIONS。focus: $FOCUS

$SKILL_CONTEXT

状態:
- ゲート: $GATE_STATUS
- God Objects: $GODOBJ_STATUS

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

  # ── VERIFY: gates (mechanical) ──
  log "Verifying gates..."
  VERIFY_OK=false
  for fix_attempt in $(seq 1 3); do
    if bash scripts/pipeline/enforce-gates.sh >/dev/null 2>&1; then
      VERIFY_OK=true
      break
    fi
    if [[ $fix_attempt -lt 3 ]]; then
      log "Gate failed, fix attempt $fix_attempt/3 — /systematic-debugging..."
      ERRORS=$(bash scripts/pipeline/enforce-gates.sh 2>&1 | grep "^FAIL" || echo "unknown")
      # Layer: /systematic-debugging — diagnose root cause before fixing
      claude -p "あなたは systematic-debugging のスペシャリストです。

ゲートが失敗しました: $ERRORS

## 手順 (systematic-debugging)
1. エラーメッセージを正確に読む
2. 仮説を立てる前に事実を集める (ファイルを読む、テストを実行する)
3. 根本原因を特定してから修正する (表面的なband-aid fix禁止)
4. 修正後に同じテストが通ることを確認

修正してください。CLAUDE.md厳守。" \
        --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
        --max-turns 15 \
        2>&1 | tail -3
    fi
  done

  if [[ "$VERIFY_OK" != true ]]; then
    log "ABORT: Gates failed after 3 fix attempts"
    break
  fi

  # ── REVIEW: /review — code review the changes ──
  log "Running /review on changes..."
  DIFF_STAT=$(git diff HEAD~1 --stat 2>/dev/null | tail -3 || echo "no diff")
  REVIEW_FINDINGS=$(claude -p "あなたはコードレビューのスペシャリストです。

直近の変更をレビューしてください。

diff stat: $DIFF_STAT
全diffを確認するには git diff HEAD~1 を実行してください。

## レビュー観点 (/review)
1. 正確性: ロジックエラー、境界値の見落とし
2. セキュリティ: インジェクション、XSS、unsafe patterns
3. CLAUDE.md規約: God Object肥大化、ハードコード値、console文
4. パフォーマンス: 不要な再計算、O(n²)ループ

findingsがあれば番号付きリストで出力。なければ 'NO FINDINGS' と出力。" \
    --allowedTools "Bash,Read,Glob,Grep" \
    --max-turns 10 \
    2>&1 || echo "NO FINDINGS")

  if echo "$REVIEW_FINDINGS" | grep -qi "NO FINDINGS"; then
    log "Review: clean"
  else
    log "Review: findings detected — /simplify で修正..."
    # Layer: /simplify — fix review findings + simplify
    claude -p "あなたはコード簡素化のスペシャリストです。

以下のレビューfindingsを修正し、コードを簡素化してください。

## Findings
$REVIEW_FINDINGS

## /simplify の原則
- 変更されたコードに焦点を当てる
- 冗長なコードを簡潔にする
- 重複を排除する
- 命名を改善する
- 動作は変えない (純粋なリファクタ)

CLAUDE.md厳守。God Object行数を増やさない。" \
      --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
      --max-turns 10 \
      2>&1 | tail -3

    # Re-verify after simplification
    if ! bash scripts/pipeline/enforce-gates.sh >/dev/null 2>&1; then
      log "WARN: Simplification broke gates — reverting"
      git checkout -- . 2>/dev/null
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

  # ── Mark task/issue as done (if applicable) ──
  if [[ ("$FOCUS" == "task" || "$FOCUS" == "auto-issue") && -n "$ISSUE_FILE" && $TOTAL_COMMITS -gt 0 ]]; then
    ISSUE_NAME=$(basename "$ISSUE_FILE")

    if [[ "$ISSUE_FILE" == *"/tasks/"* ]]; then
      # Task completed → move to tasks/done/
      sed -i 's/status: in-progress/status: done/' "$ISSUE_FILE" 2>/dev/null
      mv "$ISSUE_FILE" "$TASK_DONE_DIR/$ISSUE_NAME" 2>/dev/null
      log "Task $ISSUE_NAME done"

      # Check if all sibling tasks for parent issue are done
      PARENT=$(grep -oP 'parent: \K.*' "$TASK_DONE_DIR/$ISSUE_NAME" 2>/dev/null || echo "")
      if [[ -n "$PARENT" ]]; then
        REMAINING=$(find "$TASK_DIR" -maxdepth 1 -name '*.md' 2>/dev/null | xargs grep -l "parent: $PARENT" 2>/dev/null | while read f; do
          grep -q "status: pending\|status: in-progress" "$f" && echo "$f"
        done | wc -l)
        if [[ $REMAINING -eq 0 ]]; then
          PARENT_FILE=$(ls "$ISSUE_DIR/$PARENT.md" "$ISSUE_DIR/done/$PARENT.md" 2>/dev/null | head -1)
          if [[ -n "$PARENT_FILE" ]]; then
            sed -i 's/status: decomposed/status: done/' "$PARENT_FILE" 2>/dev/null
            mv "$PARENT_FILE" "$ISSUE_DIR/done/" 2>/dev/null
            log "Parent issue $PARENT → done (all tasks complete)"
          fi
        else
          log "Task done. Parent $PARENT: $REMAINING tasks remaining"
        fi
      fi
    else
      # Issue completed directly (auto-discovered)
      sed -i 's/status: in-progress/status: done/' "$ISSUE_FILE" 2>/dev/null
      mv "$ISSUE_FILE" "$ISSUE_DIR/done/$ISSUE_NAME" 2>/dev/null
      log "Issue $ISSUE_NAME done"
    fi

    (cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ scripts/pipeline/tasks/ && \
      git commit -m "chore: done $ISSUE_NAME" --no-verify 2>/dev/null) || true
    ISSUE_FILE=""
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

# ── Update progress report ──
log "Updating progress report..."
bash "$PROJECT_DIR/scripts/pipeline/progress-report.sh" >>"$SESSION_LOG" 2>&1 \
  || log "progress-report failed (see $SESSION_LOG)"

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
