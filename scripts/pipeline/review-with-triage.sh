#!/usr/bin/env bash
# ============================================================
# review-with-triage.sh — WORKFLOW LAYER: Review → Triage → Fix loop
# ============================================================
# Shell enforces: "findings が 0 になるまで止めない"
# Claude cannot decide "this is good enough" — the loop continues
# until triaged findings = 0 or MAX_ROUNDS reached.
#
# Usage:
#   bash scripts/pipeline/review-with-triage.sh [--max-rounds 6]
#
# Exit codes:
#   0 = findings resolved to 0
#   1 = findings remain after MAX_ROUNDS
# ============================================================
set -uo pipefail

export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"
cd "$(git rev-parse --show-toplevel)" || exit 1

MAX_ROUNDS=${1:-6}
[[ "$1" == "--max-rounds" ]] && MAX_ROUNDS="${2:-6}"
MAX_TURNS=${MAX_TURNS:-30}
FINDINGS_FILE="/tmp/graph-island-review-findings.md"
TRIAGED_FILE="/tmp/graph-island-triaged-findings.md"

echo "=== REVIEW-WITH-TRIAGE ==="
echo "Max rounds: $MAX_ROUNDS"
echo ""

for round in $(seq 1 "$MAX_ROUNDS"); do
  echo "── Round $round/$MAX_ROUNDS ──"

  # ── Step 1: Review (AGENT — judgment allowed) ──
  echo "[$(date +%H:%M:%S)] Reviewing diff..."
  DIFF_STAT=$(git diff main --stat 2>/dev/null | tail -3)
  claude -p "以下のdiffをコードレビューしてください。findingsを番号付きリスト(severity: critical/high/medium/low)で出力してください。
diff stat: $DIFF_STAT
全diffを確認するには git diff main を実行してください。
出力先: $FINDINGS_FILE に書き込むこと。findingsが0件なら 'NO FINDINGS' とだけ書くこと。" \
    --allowedTools "Bash,Read,Write,Glob,Grep" \
    --max-turns "$MAX_TURNS" \
    2>&1 | tail -3

  # ── Step 2: Check findings (WORKFLOW — mechanical) ──
  if [[ ! -f "$FINDINGS_FILE" ]]; then
    echo "NO FINDINGS FILE — assuming clean"
    exit 0
  fi

  if grep -qi "NO FINDINGS" "$FINDINGS_FILE" 2>/dev/null; then
    echo "FINDINGS = 0. Review complete."
    exit 0
  fi

  FINDING_COUNT=$(grep -cE "^[0-9]+\." "$FINDINGS_FILE" 2>/dev/null || echo "0")
  echo "Raw findings: $FINDING_COUNT"

  if [[ "$FINDING_COUNT" -eq 0 ]]; then
    echo "No numbered findings. Review complete."
    exit 0
  fi

  # ── Step 3: Triage (AGENT — judgment: remove false positives) ──
  echo "[$(date +%H:%M:%S)] Triaging..."
  claude -p "以下のレビューfindingsをトリアージしてください。
削除: 偽陽性、low-severity style nits、主観的な好み
保持: バグ、セキュリティ問題、正確性の問題、high-severity項目
振り子防止: A says X, B says not-X → binding directive発行
入力: $FINDINGS_FILE
出力: $TRIAGED_FILE に書き込むこと。0件なら 'NO FINDINGS' とだけ書くこと。" \
    --allowedTools "Bash,Read,Write" \
    --max-turns 10 \
    2>&1 | tail -3

  # ── Step 4: Check triaged findings (WORKFLOW — mechanical) ──
  if grep -qi "NO FINDINGS" "$TRIAGED_FILE" 2>/dev/null; then
    echo "TRIAGED FINDINGS = 0. Review complete."
    exit 0
  fi

  TRIAGED_COUNT=$(grep -cE "^[0-9]+\." "$TRIAGED_FILE" 2>/dev/null || echo "0")
  echo "Triaged findings: $TRIAGED_COUNT"

  if [[ "$TRIAGED_COUNT" -eq 0 ]]; then
    echo "No triaged findings. Review complete."
    exit 0
  fi

  # ── Step 5: Fix (AGENT — judgment: how to fix) ──
  echo "[$(date +%H:%M:%S)] Fixing $TRIAGED_COUNT findings..."
  claude -p "以下のトリアージ済みfindingsを修正してください。
findings: $(cat "$TRIAGED_FILE")
ルール: CLAUDE.md厳守、God Object肥大化禁止。根本原因を修正、band-aid fixは不可。" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --max-turns "$MAX_TURNS" \
    2>&1 | tail -3

  # ── Step 6: Gates (WORKFLOW — mechanical) ──
  echo "[$(date +%H:%M:%S)] Running gates..."
  if ! bash scripts/pipeline/enforce-gates.sh --skip-e2e 2>&1 | tail -3; then
    echo "GATES FAILED after fix — will retry in next round"
  fi

  # Clean up for next round
  rm -f "$FINDINGS_FILE" "$TRIAGED_FILE"
  echo ""
done

echo "REVIEW INCOMPLETE: findings may remain after $MAX_ROUNDS rounds"
exit 1
