#!/usr/bin/env bash
# ============================================================
# implement-with-gates.sh — WORKFLOW LAYER: Implement → Verify loop
# ============================================================
# This script IS the workflow. Claude cannot skip the gates.
# The shell loop runs regardless of Claude's judgment.
#
# Usage:
#   bash scripts/pipeline/implement-with-gates.sh "Implement feature X in src/foo.ts"
#   bash scripts/pipeline/implement-with-gates.sh --prompt-file /tmp/implement-prompt.txt
#
# Exit codes:
#   0 = implementation + gates passed
#   1 = failed after MAX_ATTEMPTS
# ============================================================
set -uo pipefail

export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"
cd "$(git rev-parse --show-toplevel)" || exit 1

MAX_ATTEMPTS=${MAX_ATTEMPTS:-5}
MAX_TURNS=${MAX_TURNS:-30}
GATE_FLAGS="${GATE_FLAGS:---skip-e2e}"
ERROR_FILE="/tmp/graph-island-gate-errors.txt"

# ── Parse prompt ──
if [[ "${1:-}" == "--prompt-file" && -f "${2:-}" ]]; then
  PROMPT=$(cat "$2")
elif [[ -n "${1:-}" ]]; then
  PROMPT="$1"
else
  echo "Usage: $0 <prompt> | --prompt-file <path>"
  exit 1
fi

echo "=== IMPLEMENT-WITH-GATES ==="
echo "Max attempts: $MAX_ATTEMPTS"
echo "Prompt: ${PROMPT:0:100}..."
echo ""

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "── Attempt $attempt/$MAX_ATTEMPTS ──"

  # ── Step 1: Claude implements (AGENT LAYER — judgment allowed) ──
  echo "[$(date +%H:%M:%S)] Running Claude..."
  CLAUDE_OUTPUT=$(claude -p "$PROMPT" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --max-turns "$MAX_TURNS" \
    2>&1) || true
  echo "$CLAUDE_OUTPUT" | tail -5

  # ── Step 2: Gates verify (WORKFLOW LAYER — mechanical, no judgment) ──
  echo "[$(date +%H:%M:%S)] Running gates..."
  GATE_OUTPUT=$(bash scripts/pipeline/enforce-gates.sh $GATE_FLAGS 2>&1)
  GATE_EXIT=$?

  if [[ $GATE_EXIT -eq 0 ]]; then
    echo ""
    echo "GATES PASSED on attempt $attempt"
    exit 0
  fi

  # ── Step 3: Feed errors back (WORKFLOW LAYER — Claude cannot skip this) ──
  echo "$GATE_OUTPUT" > "$ERROR_FILE"
  FAILED_GATES=$(echo "$GATE_OUTPUT" | grep "^FAIL" | head -5)
  echo "GATES FAILED: $FAILED_GATES"

  # Construct error-aware prompt for next attempt
  PROMPT="前回の実装でゲートが失敗しました。以下のエラーを修正してください。

失敗したゲート:
$FAILED_GATES

元の要件: $1

ルール: CLAUDE.md厳守、God Object肥大化禁止。エラーを修正するだけ、新機能を追加しない。"

  echo ""
done

echo "FAILED after $MAX_ATTEMPTS attempts"
cat "$ERROR_FILE"
exit 1
