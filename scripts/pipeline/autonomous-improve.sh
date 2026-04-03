#!/usr/bin/env bash
# autonomous-improve.sh — Headless autonomous improvement cycle
# crontab: 23 */3 * * * /home/ubuntu/obsidian-plugins/obsidian-graph-island/scripts/pipeline/autonomous-improve.sh >> /tmp/graph-island-improve.log 2>&1
set -euo pipefail

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
LOCK_FILE="/tmp/graph-island-improve.lock"
LOG_FILE="/tmp/graph-island-improve.log"
MAX_LOG_SIZE=$((10 * 1024 * 1024))

cd "$PROJECT_DIR"

if [[ -f "$LOCK_FILE" ]]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "0")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[$(date -Iseconds)] SKIP: Previous run active (PID $LOCK_PID)"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

[[ -f "$LOG_FILE" ]] && [[ $(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]] && mv "$LOG_FILE" "${LOG_FILE}.old"

echo "[$(date -Iseconds)] AUTONOMOUS IMPROVE CYCLE START"

if [[ -n "$(git status --porcelain)" ]]; then
  git stash push -m "auto-stash $(date -Iseconds)"
fi

PROMPT='自律改善サイクルを実行してください。

Step 1: bash scripts/pipeline/enforce-gates.sh --json --skip-e2e でアセスメント
Step 2: 最優先の問題を1つ選択 (gate failure > god object > coverage > lint > visual)
Step 3: 実装
Step 4: bash scripts/pipeline/enforce-gates.sh --skip-e2e で検証 (失敗→修正、最大5回)
Step 5: git commit
Step 6: Step 1に戻る。最大5イテレーション。

ルール: CLAUDE.md厳守、God Object肥大化禁止、しきい値緩和禁止、1回1改善。'

if command -v claude &>/dev/null; then
  claude -p "$PROMPT" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Agent" \
    --max-turns 50 \
    2>&1 | tee -a "$LOG_FILE"
fi

if git stash list | head -1 | grep -q "auto-stash"; then
  git stash pop 2>/dev/null || true
fi

echo "[$(date -Iseconds)] AUTONOMOUS IMPROVE CYCLE COMPLETE"
