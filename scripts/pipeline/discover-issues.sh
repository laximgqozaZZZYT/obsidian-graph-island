#!/usr/bin/env bash
# ============================================================
# discover-issues.sh — Automated issue discovery (not ideas)
# ============================================================
# Scans for REAL PROBLEMS: regressions, quality drops, broken
# invariants, visual defects. Does NOT generate feature ideas.
#
# Writes discovered issues to scripts/pipeline/issues/ with
# priority "auto-discovered" (lower than user-reported issues).
#
# Usage: bash scripts/pipeline/discover-issues.sh
# ============================================================
set -uo pipefail

export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
DONE_DIR="$ISSUE_DIR/done"

cd "$PROJECT_DIR" || exit 1
mkdir -p "$ISSUE_DIR" "$DONE_DIR"

# ── Helper: create issue if not already filed ──
file_issue() {
  local slug="$1"
  local priority="$2"
  local summary="$3"
  local description="$4"
  local criteria="$5"

  # Skip if same slug already exists (pending or in-progress)
  if ls "$ISSUE_DIR"/*-"$slug".md 2>/dev/null | grep -q .; then
    return 0
  fi
  # Skip if recently completed (avoid re-filing)
  if ls "$DONE_DIR"/*-"$slug".md 2>/dev/null | grep -q .; then
    return 0
  fi

  # Find next number
  local last_num
  last_num=$(ls "$ISSUE_DIR"/*.md "$DONE_DIR"/*.md 2>/dev/null | grep -oP '\d+' | sort -n | tail -1 || echo "0")
  local next_num=$(printf "%03d" $((10#${last_num:-0} + 1)))

  cat > "$ISSUE_DIR/${next_num}-${slug}.md" << ISSUE_EOF
---
priority: $priority
reported: $(date +%Y-%m-%d)
status: pending
source: auto-discovered
summary: $summary
---

## Description
$description

## Acceptance criteria
$criteria
ISSUE_EOF

  echo "FILED: ${next_num}-${slug}.md ($priority)"
}

ISSUES_FOUND=0

# ============================================================
# 1. BUILD REGRESSION — does it still build?
# ============================================================
if ! node esbuild.config.mjs production >/dev/null 2>&1; then
  file_issue "build-broken" "critical" \
    "ビルドが壊れている" \
    "esbuild production build が失敗する。" \
    "- [ ] pnpm build が成功すること"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 2. TEST REGRESSION — any failing tests?
# ============================================================
TEST_OUT=$(npx vitest run 2>&1)
if echo "$TEST_OUT" | grep -q "failed"; then
  FAILED=$(echo "$TEST_OUT" | grep -oP '\d+ failed' | head -1)
  file_issue "test-regression" "critical" \
    "テスト失敗: $FAILED" \
    "vitest run で $FAILED が検出された。" \
    "- [ ] pnpm test が全パスすること"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 3. GOD OBJECT GROWTH — line counts exceeding limits?
# ============================================================
GOD_OUT=$(bash scripts/pipeline/god-object-audit.sh 2>&1)
if echo "$GOD_OUT" | grep -q "^FAIL"; then
  VIOLATIONS=$(echo "$GOD_OUT" | grep "^FAIL" | head -3)
  file_issue "god-object-violation" "high" \
    "God Object が上限超過" \
    "CLAUDE.md の行数上限を超えている:\n$VIOLATIONS" \
    "- [ ] 全ファイルが CLAUDE.md の Max Allowed 以下"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 4. BUNDLE SIZE REGRESSION — over budget?
# ============================================================
if [[ -f main.js ]]; then
  BUNDLE_SIZE=$(stat -c%s main.js 2>/dev/null || echo 0)
  BUDGET=819200
  if [[ $BUNDLE_SIZE -gt $BUDGET ]]; then
    file_issue "bundle-over-budget" "high" \
      "バンドルサイズ超過: ${BUNDLE_SIZE} bytes (budget: ${BUDGET})" \
      "main.js が 800KB budget を超過している。" \
      "- [ ] main.js が ${BUDGET} bytes 以下"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
fi

# ============================================================
# 5. ESLINT ERRORS (not warnings) — new errors introduced?
# ============================================================
ESLINT_ERRORS=$(npx eslint src/ --quiet 2>&1 | grep -cE "^\s+\d+:\d+\s+error" 2>/dev/null || echo "0")
ESLINT_ERRORS=${ESLINT_ERRORS//[^0-9]/}
ESLINT_ERRORS=${ESLINT_ERRORS:-0}
if [[ $ESLINT_ERRORS -gt 0 ]]; then
  file_issue "eslint-errors" "high" \
    "ESLint エラー $ESLINT_ERRORS 件" \
    "eslint --quiet で $ESLINT_ERRORS 件のエラーが検出された。" \
    "- [ ] npx eslint src/ --quiet でエラー 0"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 6. COVERAGE DROP — below ratcheted thresholds?
# ============================================================
if [[ -f coverage/coverage-summary.json ]]; then
  COV_DROP=$(python3 -c "
import json
d = json.load(open('coverage/coverage-summary.json'))['total']
t_s = $(grep -oP 'statements:\s*\K[0-9.]+' vitest.config.ts)
t_f = $(grep -oP 'functions:\s*\K[0-9.]+' vitest.config.ts)
drops = []
if d['statements']['pct'] < t_s - 0.5: drops.append(f\"statements {d['statements']['pct']:.1f}% < {t_s}%\")
if d['functions']['pct'] < t_f - 0.5: drops.append(f\"functions {d['functions']['pct']:.1f}% < {t_f}%\")
print('|'.join(drops) if drops else '')
" 2>/dev/null || echo "")

  if [[ -n "$COV_DROP" ]]; then
    file_issue "coverage-drop" "high" \
      "カバレッジ低下: $COV_DROP" \
      "カバレッジがラチェット閾値を下回っている。" \
      "- [ ] pnpm test:coverage が閾値をパス"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
fi

# ============================================================
# 7. VISUAL QUALITY REGRESSION (CDP required)
# ============================================================
if curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
  # Run visual report (background, no display occupation)
  npx tsx scripts/pipeline/visual-report.ts 2>/dev/null

  if [[ -f scripts/pipeline/visual-report.json ]]; then
    VISUAL_ISSUES=$(python3 -c "
import json
r = json.load(open('scripts/pipeline/visual-report.json'))
issues = []
for s in r['scores']:
    if s['score'] < 40:
        issues.append(f\"{s['name']}: {s['score']}/100\")
if r['overallScore'] < 50:
    issues.append(f\"overall: {r['overallScore']}/100\")
print('|'.join(issues) if issues else '')
" 2>/dev/null || echo "")

    if [[ -n "$VISUAL_ISSUES" ]]; then
      file_issue "visual-regression" "high" \
        "視覚品質低下: $VISUAL_ISSUES" \
        "E2Eスクリーンショット分析でスコアが基準値を下回っている。\nscripts/pipeline/visual-report.json を参照。" \
        "- [ ] visual-report の全スコアが 50 以上\n- [ ] overallScore が 60 以上"
      ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
  fi
fi

# ============================================================
# 8. TYPESCRIPT STRICT ERRORS
# ============================================================
TSC_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "error TS" 2>/dev/null || echo "0")
TSC_ERRORS=${TSC_ERRORS//[^0-9]/}
if [[ $TSC_ERRORS -gt 0 ]]; then
  file_issue "typescript-errors" "critical" \
    "TypeScriptエラー $TSC_ERRORS 件" \
    "tsc --noEmit で $TSC_ERRORS 件のエラー。" \
    "- [ ] npx tsc --noEmit がクリーン"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "=== Issue Discovery Complete ==="
echo "Issues found: $ISSUES_FOUND"
echo "Pending issues:"
ls "$ISSUE_DIR"/*.md 2>/dev/null | while read f; do
  prio=$(grep -oP 'priority: \K\w+' "$f" || echo "?")
  src=$(grep -oP 'source: \K\w+' "$f" || echo "user")
  summary=$(grep -oP 'summary: \K.*' "$f" || echo "?")
  echo "  [$prio] ($src) $(basename $f) — $summary"
done

exit 0
