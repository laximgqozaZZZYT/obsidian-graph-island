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
MAX_SESSIONS=5
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

# ── DISCOVER: static scan + kaizen analysis ──
log "Running static issue discovery..."
bash "$PROJECT_DIR/scripts/pipeline/discover-issues.sh" 2>&1 | tail -5 | while IFS= read -r line; do log "  $line"; done

# Kaizen-driven deep analysis (every 4th session to save API calls)
HOUR=${HOUR:-$(date +%-H)}
if [[ $((HOUR % 4)) -eq 0 ]]; then
  PENDING_COUNT=$(ls "$PROJECT_DIR/scripts/pipeline/issues"/*.md 2>/dev/null | wc -l || echo "0")
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

# ── CDP: ensure Obsidian is running with remote debugging ──
# E2E runs via CDP internal render buffer — no display occupation.
# If CDP is not available, auto-restart Obsidian with --remote-debugging-port.
CDP_AVAILABLE=false
if curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
  CDP_AVAILABLE=true
  log "CDP available"
else
  log "CDP unavailable — attempting Obsidian restart with CDP..."
  # Kill existing Obsidian (if running without CDP)
  killall obsidian 2>/dev/null
  sleep 3
  # Restart in background with CDP (no display occupation — runs as bg process)
  nohup /opt/Obsidian/obsidian --remote-debugging-port=9222 > /dev/null 2>&1 &
  OBSIDIAN_PID=$!
  log "Obsidian started (PID $OBSIDIAN_PID), waiting for CDP..."
  # Wait for CDP to become available (max 30s)
  for cdp_wait in $(seq 1 15); do
    sleep 2
    if curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
      CDP_AVAILABLE=true
      log "CDP connected after ${cdp_wait}x2s"
      break
    fi
  done
  if [[ "$CDP_AVAILABLE" != true ]]; then
    log "WARN: CDP failed to connect after 30s — E2E disabled this session"
  fi
fi

# ============================================================
# IMPROVEMENT LOOP
# ============================================================
TOTAL_COMMITS=0

for iter in $(seq 1 "$MAX_ITERATIONS"); do

  # ── CONTEXT RESET (コンテキスト汚染防止) ──
  # 各イテレーションをクリーンな状態から開始。
  # 保持するもの: issueファイル、git状態、TOTAL_COMMITS, CDP_AVAILABLE
  # リセットするもの: 前イテレーションの判断結果・中間変数
  GATE_JSON=""
  GODOBJ_JSON=""
  GATE_STATUS=""
  GODOBJ_STATUS=""
  VISUAL_INFO="CDP unavailable"
  REVIEW_FINDINGS=""
  PROMPT=""
  SKILL_CONTEXT=""
  ISSUE_FILE=""
  ISSUE_CONTENT=""
  ISSUE_NAME=""

  # ── Re-evaluate focus (issue queue may have changed) ──
  ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
  if [[ -d "$ISSUE_DIR" ]]; then
    for prio in critical high medium low; do
      ISSUE_FILE=$(grep -rl "priority: $prio" "$ISSUE_DIR"/*.md 2>/dev/null | while read f; do
        grep -q "status: pending" "$f" || continue
        grep -q "source: auto-discovered" "$f" && continue
        echo "$f" && break
      done)
      [[ -n "$ISSUE_FILE" ]] && break
    done
    if [[ -z "$ISSUE_FILE" ]]; then
      for prio in critical high medium low; do
        ISSUE_FILE=$(grep -rl "priority: $prio" "$ISSUE_DIR"/*.md 2>/dev/null | while read f; do
          grep -q "status: pending" "$f" || continue
          echo "$f" && break
        done)
        [[ -n "$ISSUE_FILE" ]] && break
      done
    fi
  fi

  if [[ -n "$ISSUE_FILE" ]]; then
    FOCUS="user-issue"
    ISSUE_CONTENT=$(cat "$ISSUE_FILE")
    ISSUE_NAME=$(basename "$ISSUE_FILE")
    log "USER ISSUE: $ISSUE_NAME"
    sed -i 's/status: pending/status: in-progress/' "$PROJECT_DIR/scripts/pipeline/issues/$ISSUE_NAME" 2>/dev/null || true
    (cd "$PROJECT_DIR" && git add "scripts/pipeline/issues/$ISSUE_NAME" && git commit -m "chore: mark issue $ISSUE_NAME as in-progress" --no-verify 2>/dev/null) || true
  else
    HOUR=$(date +%-H)
    FOCUS_AREAS=("coverage" "eslint" "refactor")
    FOCUS_INDEX=$(( (HOUR / 2) % 3 ))
    FOCUS="${FOCUS_AREAS[$FOCUS_INDEX]}"
  fi

  log "── Iteration $iter/$MAX_ITERATIONS (focus: $FOCUS, context: clean) ──"

  # ── ASSESS (fresh data, no carry-over) ──
  GATE_JSON=$(bash scripts/pipeline/enforce-gates.sh --json 2>/dev/null || echo '{"passed":0}')
  GODOBJ_JSON=$(bash scripts/pipeline/god-object-audit.sh --json 2>&1 || echo '{"passed":0}')
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
    # Layer: /research → /systematic-debugging → implement
    PROMPT="あなたはコードベース調査と問題解決のスペシャリストです。

## Phase 1: /research — 課題の理解
まずコードベースを調査して、課題に関連するファイルと実装を理解してください。
関連する型定義、関数、依存関係を把握すること。

## Phase 2: /systematic-debugging — 根本原因特定
仮説を立てる前に事実を集める。根本原因を特定してから修正する。

## Phase 3: 実装
根本原因に対する最小限の修正を行う。

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
      # File as issue (persists across context resets, not a shell variable)
      bash "$PROJECT_DIR/scripts/pipeline/discover-issues.sh" 2>/dev/null  # triggers visual regression detection
      if [[ -n "$(cd "$PROJECT_DIR" && git status --porcelain scripts/pipeline/issues/)" ]]; then
        (cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ && git commit -m "chore: auto-file visual regression issue (score $READABILITY_SCORE)" --no-verify 2>/dev/null) || true
      fi
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
