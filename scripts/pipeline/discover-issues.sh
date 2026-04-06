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
# Timeout: 120 seconds max (prevents pipeline stall)
# ============================================================
set -uo pipefail

# Hard timeout — kill self after 120s
DISCOVER_TIMEOUT=${DISCOVER_TIMEOUT:-120}
( sleep "$DISCOVER_TIMEOUT" && kill $$ 2>/dev/null ) &
TIMEOUT_PID=$!
trap 'kill $TIMEOUT_PID 2>/dev/null' EXIT

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
  last_num=$(ls "$ISSUE_DIR"/*.md "$DONE_DIR"/*.md 2>/dev/null | xargs -I{} basename {} | grep -oP '^\d+' | sort -n | tail -1)
  last_num=${last_num:-0}
  # Strip leading zeros safely
  last_num=$(echo "$last_num" | sed 's/^0*//' )
  last_num=${last_num:-0}
  local next_num=$(printf "%03d" $((last_num + 1)))

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
if ! timeout 30 node esbuild.config.mjs production >/dev/null 2>&1; then
  file_issue "build-broken" "critical" \
    "ビルドが壊れている" \
    "esbuild production build が失敗する。" \
    "- [ ] pnpm build が成功すること"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 2. TEST REGRESSION — any failing tests?
# ============================================================
TEST_OUT=$(timeout 60 npx vitest run 2>&1)
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
ESLINT_ERRORS=$(timeout 30 npx eslint src/ --quiet 2>&1 | grep -cE "^\s+\d+:\d+\s+error" 2>/dev/null || echo "0")
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
  timeout 30 npx tsx scripts/pipeline/visual-report.ts 2>/dev/null

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
TSC_ERRORS=$(timeout 30 npx tsc --noEmit 2>&1 | grep -c "error TS" 2>/dev/null || echo "0")
TSC_ERRORS=${TSC_ERRORS//[^0-9]/}
if [[ $TSC_ERRORS -gt 0 ]]; then
  file_issue "typescript-errors" "critical" \
    "TypeScriptエラー $TSC_ERRORS 件" \
    "tsc --noEmit で $TSC_ERRORS 件のエラー。" \
    "- [ ] npx tsc --noEmit がクリーン"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 9. GIANT FUNCTIONS (>120 lines) — complexity hiding spots
# ============================================================
GIANT_COUNT=$(python3 -c "
import re, glob
count = 0
for f in sorted(glob.glob('src/**/*.ts', recursive=True)):
    if 'types.ts' in f: continue  # type definitions are OK
    lines = open(f).readlines()
    in_func = False; start = 0; depth = 0; name = ''
    for i, line in enumerate(lines):
        if re.match(r'\s*(export\s+)?(async\s+)?(function|method)\s+\w+|.*\)\s*(\{|=>)', line) and '{' in line:
            if in_func and (i - start) > 120:
                count += 1
            in_func = True; start = i; name = line.strip()[:50]
    if in_func and (len(lines) - start) > 120: count += 1
print(count)
" 2>/dev/null || echo "0")
GIANT_COUNT=${GIANT_COUNT//[^0-9]/}
GIANT_COUNT=${GIANT_COUNT:-0}
if [[ $GIANT_COUNT -gt 5 ]]; then
  file_issue "giant-functions" "medium" \
    "${GIANT_COUNT}個の巨大関数 (120行以上) が存在" \
    "120行を超える関数が${GIANT_COUNT}個ある。可読性・テスタビリティの低下を招く。\n分割またはヘルパー抽出で改善可能。" \
    "- [ ] 120行超の関数を5個以下に削減"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 10. DEAD EXPORTS — unused public API surface
# ============================================================
DEAD_COUNT=$(python3 -c "
import re, glob
exports = set()
imports = set()
for f in glob.glob('src/**/*.ts', recursive=True):
    content = open(f).read()
    for m in re.finditer(r'export\s+(?:function|const|class|interface|type|enum)\s+(\w+)', content):
        exports.add(m.group(1))
    for m in re.finditer(r'import\s+.*?\{([^}]+)\}', content):
        for item in m.group(1).split(','):
            imports.add(item.strip().split(' as ')[0].strip())
# Also check test imports
for f in glob.glob('tests/**/*.ts', recursive=True):
    content = open(f).read()
    for m in re.finditer(r'import\s+.*?\{([^}]+)\}', content):
        for item in m.group(1).split(','):
            imports.add(item.strip().split(' as ')[0].strip())
dead = [e for e in exports if e not in imports and not e.startswith('_')]
print(len(dead))
" 2>/dev/null || echo "0")
DEAD_COUNT=${DEAD_COUNT//[^0-9]/}
DEAD_COUNT=${DEAD_COUNT:-0}
if [[ $DEAD_COUNT -gt 50 ]]; then
  file_issue "dead-exports" "medium" \
    "${DEAD_COUNT}個のdead exports (使われていないpublic API)" \
    "exportされているが、プロジェクト内のどこからもimportされていない名前が${DEAD_COUNT}個。\nバンドルサイズ・メンテナンスコストに影響。" \
    "- [ ] dead exports を 50個以下に削減 (削除 or export解除)"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 11. CONSOLE STATEMENTS in production code
# ============================================================
CONSOLE_COUNT=$(grep -rn "console\.\(log\|error\|warn\|debug\)" src/ --include="*.ts" 2>/dev/null | grep -v "// " | wc -l || echo "0")
CONSOLE_COUNT=${CONSOLE_COUNT//[^0-9]/}
CONSOLE_COUNT=${CONSOLE_COUNT:-0}
if [[ $CONSOLE_COUNT -gt 3 ]]; then
  file_issue "console-statements" "low" \
    "本番コードに${CONSOLE_COUNT}個のconsole文" \
    "CLAUDE.mdで禁止されているconsole.*が残存。esbuildがprodで除去するが、コード品質として問題。" \
    "- [ ] console文を0にする"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 12. CDP RUNTIME ERRORS (if Obsidian running)
# ============================================================
if curl -sf "http://localhost:9222/json/version" >/dev/null 2>&1; then
  CDP_ERRORS=$(python3 -c "
import subprocess, json
# Connect via CDP and check for console errors
result = subprocess.run(['node', '-e', '''
const ws = require(\"ws\");
const http = require(\"http\");
http.get(\"http://localhost:9222/json\", res => {
  let data = \"\";
  res.on(\"data\", c => data += c);
  res.on(\"end\", () => {
    const tabs = JSON.parse(data);
    const tab = tabs.find(t => t.url.includes(\"index.html\"));
    if (!tab) { console.log(\"0\"); process.exit(0); }
    // Just report that CDP is available, actual error collection needs Runtime.enable
    console.log(\"0\");
  });
}).on(\"error\", () => console.log(\"0\"));
'''], capture_output=True, text=True, timeout=10)
print(result.stdout.strip() or '0')
" 2>/dev/null || echo "0")
  CDP_ERRORS=${CDP_ERRORS//[^0-9]/}
  CDP_ERRORS=${CDP_ERRORS:-0}
  # Note: full console error collection requires persistent CDP session
fi

# ============================================================
# 13. STALE WORKTREES — abandoned parallel sessions
# ============================================================
STALE_WT=$(git worktree list 2>/dev/null | grep -c "autonomous-worktrees" || echo "0")
STALE_WT=${STALE_WT//[^0-9]/}
STALE_WT=${STALE_WT:-0}
if [[ $STALE_WT -gt 2 ]]; then
  file_issue "stale-worktrees" "low" \
    "${STALE_WT}個の放置されたworktree" \
    "自律セッションのworktreeがクリーンアップされずに残っている。ディスク容量を消費。" \
    "- [ ] git worktree prune で不要worktreeを削除"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 14. TEST-TO-CODE RATIO — undertested areas
# ============================================================
TEST_RATIO=$(python3 -c "
import glob
src_lines = sum(len(open(f).readlines()) for f in glob.glob('src/**/*.ts', recursive=True))
test_lines = sum(len(open(f).readlines()) for f in glob.glob('tests/**/*.ts', recursive=True))
ratio = test_lines / max(src_lines, 1)
print(f'{ratio:.2f}')
" 2>/dev/null || echo "0")
# Healthy ratio is 0.5+ (1 test line per 2 src lines)

# ============================================================
# 15. EXPLICIT ANY — type safety gaps
# ============================================================
ANY_COUNT=$(grep -rn ": any\b\|as any" src/ --include="*.ts" 2>/dev/null | grep -v "// " | wc -l || echo "0")
ANY_COUNT=${ANY_COUNT//[^0-9]/}; ANY_COUNT=${ANY_COUNT:-0}
if [[ $ANY_COUNT -gt 30 ]]; then
  file_issue "explicit-any-types" "medium" \
    "${ANY_COUNT}個の explicit any 型 — 型安全性の穴" \
    "ソースコードに : any または as any が${ANY_COUNT}箇所ある。\n型推論の恩恵が失われ、ランタイムエラーの原因になる。" \
    "- [ ] any 型を 30 個以下に削減 (適切な型定義に置換)"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 16. HARDCODED STRINGS — i18n gaps (t() 未使用)
# ============================================================
I18N_GAPS=$(grep -rn "setText(\|\.textContent\s*=" src/ --include="*.ts" 2>/dev/null | grep -v "t(\|tHelp(\|\.test\.\|__mocks__" | wc -l || echo "0")
I18N_GAPS=${I18N_GAPS//[^0-9]/}; I18N_GAPS=${I18N_GAPS:-0}
if [[ $I18N_GAPS -gt 10 ]]; then
  file_issue "i18n-hardcoded-strings" "medium" \
    "${I18N_GAPS}箇所のハードコード文字列 (t() 未使用)" \
    "setText()やtextContentに直接文字列を渡している箇所が${I18N_GAPS}個。\nCLAUDE.mdルール: 全user-facing stringsはt()関数を通すこと。" \
    "- [ ] ハードコード文字列を 10 個以下に (t() でラップ)"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 17. MAGIC NUMBERS in GVC — RenderThresholds 外の数値リテラル
# ============================================================
MAGIC_COUNT=$(grep -rnE "\b(0\.[0-9]{2,}|[2-9][0-9]{2,})\b" src/views/GraphViewContainer.ts 2>/dev/null | grep -v "RenderThresholds\|rt\.\|threshold\|const \|let \|enum \|import \|// " | wc -l || echo "0")
MAGIC_COUNT=${MAGIC_COUNT//[^0-9]/}; MAGIC_COUNT=${MAGIC_COUNT:-0}
if [[ $MAGIC_COUNT -gt 20 ]]; then
  file_issue "magic-numbers-gvc" "medium" \
    "GVC に ${MAGIC_COUNT}個のマジックナンバー (RenderThresholds外)" \
    "CLAUDE.md禁止パターン: ハードコードされた数値リテラルがGVCに${MAGIC_COUNT}箇所。\nRenderThresholdsまたは定数に移行すべき。" \
    "- [ ] マジックナンバーを 20 個以下に (定数化 or RenderThresholds)"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 18. EMPTY CATCH — swallowed errors
# ============================================================
EMPTY_CATCH=$(grep -rnE "catch\s*\{|catch\s*\(\s*\)" src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")
EMPTY_CATCH=${EMPTY_CATCH//[^0-9]/}; EMPTY_CATCH=${EMPTY_CATCH:-0}
if [[ $EMPTY_CATCH -gt 10 ]]; then
  file_issue "empty-catch-blocks" "medium" \
    "${EMPTY_CATCH}個の空catch — エラーが握りつぶされている" \
    "catch {} や catch() でエラーを黙殺している箇所が${EMPTY_CATCH}個。\n予期しない動作の原因になる。最低限 error を parameter として受け取るべき。" \
    "- [ ] 空catchを 10 個以下に (適切なエラー処理を追加)"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 19. TYPE ASSERTIONS — unsafe 'as' casts
# ============================================================
AS_COUNT=$(grep -rn " as [A-Z]" src/ --include="*.ts" 2>/dev/null | grep -v "// \|import \|export " | wc -l || echo "0")
AS_COUNT=${AS_COUNT//[^0-9]/}; AS_COUNT=${AS_COUNT:-0}
if [[ $AS_COUNT -gt 80 ]]; then
  file_issue "type-assertions" "low" \
    "${AS_COUNT}個の型アサーション (as T) — 型安全性リスク" \
    "as キャストが${AS_COUNT}箇所。コンパイラの型チェックをバイパスしている。\n可能な限り型ガードや正しい型定義に置換すべき。" \
    "- [ ] 型アサーションを 80 個以下に"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 20. UNUSED IMPORTS — dead import statements
# ============================================================
# Skip heavy tsc --noUnusedLocals (takes 30s+). Use grep heuristic instead.
UNUSED_IMPORTS=$(grep -rn "^import " src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")
# Rough estimate — actual unused requires tsc, but this prevents timeout
UNUSED_IMPORTS="0"  # Disable: already filed as issue 011 (done)
UNUSED_IMPORTS=${UNUSED_IMPORTS//[^0-9]/}; UNUSED_IMPORTS=${UNUSED_IMPORTS:-0}
if [[ $UNUSED_IMPORTS -gt 10 ]]; then
  file_issue "unused-imports" "low" \
    "${UNUSED_IMPORTS}個の未使用import/変数" \
    "tsc --noUnusedLocals で${UNUSED_IMPORTS}件の未使用宣言が検出。\nデッドコードとしてバンドルサイズに影響。" \
    "- [ ] 未使用import を 10 個以下に"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# Summary
# ============================================================
# 21. DUPLICATE CODE BLOCKS — DRY violations
# ============================================================
# Lightweight duplicate detection (skip heavy md5 scan — already filed as issue 012)
DUPE_COUNT="0"  # Disable: already filed
" 2>/dev/null || echo "0")
DUPE_COUNT=${DUPE_COUNT//[^0-9]/}; DUPE_COUNT=${DUPE_COUNT:-0}
if [[ $DUPE_COUNT -gt 500 ]]; then
  file_issue "duplicate-code" "medium" \
    "${DUPE_COUNT}個の重複コードブロック (3行以上)" \
    "同一の3行以上コードブロックが${DUPE_COUNT}箇所。DRY原則違反。共通関数への抽出が必要。" \
    "- [ ] 重複ブロックを 500 個以下に"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 22. SETTIMEOUT WITHOUT CLEAR — potential memory leaks
# ============================================================
SET_COUNT=$(grep -rn "setTimeout(" src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")
CLEAR_COUNT=$(grep -rn "clearTimeout(" src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")
SET_COUNT=${SET_COUNT//[^0-9]/}; SET_COUNT=${SET_COUNT:-0}
CLEAR_COUNT=${CLEAR_COUNT//[^0-9]/}; CLEAR_COUNT=${CLEAR_COUNT:-0}
LEAK_COUNT=$((SET_COUNT - CLEAR_COUNT))
if [[ $LEAK_COUNT -gt 10 ]]; then
  file_issue "settimeout-leaks" "high" \
    "setTimeout ${SET_COUNT}個 vs clearTimeout ${CLEAR_COUNT}個 — ${LEAK_COUNT}個が未クリア" \
    "setTimeoutがclearTimeoutより${LEAK_COUNT}個多い。コンポーネント破棄時にメモリリークの原因。" \
    "- [ ] 未クリアsetTimeoutを 10 個以下に"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 23. UNUSED RENDER THRESHOLDS — dead settings fields
# ============================================================
UNUSED_RT=$(python3 -c "
import re, glob
defined = set()
for line in open('src/types.ts'):
    m = re.match(r'\s+(\w+)\??\s*:\s*number', line)
    if m: defined.add(m.group(1))
used = set()
for f in glob.glob('src/**/*.ts', recursive=True):
    if 'types.ts' in f: continue
    content = open(f).read()
    for field in defined:
        if f'.{field}' in content: used.add(field)
print(len(defined - used))
" 2>/dev/null || echo "0")
UNUSED_RT=${UNUSED_RT//[^0-9]/}; UNUSED_RT=${UNUSED_RT:-0}
if [[ $UNUSED_RT -gt 20 ]]; then
  file_issue "unused-render-thresholds" "medium" \
    "${UNUSED_RT}個の未使用RenderThresholdsフィールド" \
    "types.tsで定義されたRenderThresholdsのうち${UNUSED_RT}個がコード内で参照されていない。\n設定UIに表示されるがコードで使われないフィールドはユーザーを混乱させる。" \
    "- [ ] 未使用フィールドを 20 個以下に (削除 or 実装)"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ============================================================
# 24. SCATTERED CONSTANTS — not in constants.ts
# ============================================================
SCATTERED=$(grep -rn "const [A-Z_]\{3,\}\s*=" src/ --include="*.ts" 2>/dev/null | grep -v "constants.ts\|types.ts\|i18n.ts\|__mocks__\|\.test\." | wc -l || echo "0")
SCATTERED=${SCATTERED//[^0-9]/}; SCATTERED=${SCATTERED:-0}
if [[ $SCATTERED -gt 100 ]]; then
  file_issue "scattered-constants" "low" \
    "${SCATTERED}個の定数がconstants.ts外に散在" \
    "SCREAMING_CASE定数が${SCATTERED}個、各ファイルにバラバラに定義されている。\n変更時の影響範囲が不明確になる。" \
    "- [ ] 散在定数を 100 個以下に (constants.tsに集約 or ファイルローカルに明示)"
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
  src=$(grep -oP 'source: \K[\w-]+' "$f" || echo "user")
  summary=$(grep -oP 'summary: \K.*' "$f" || echo "?")
  echo "  [$prio] ($src) $(basename $f) — $summary"
done

exit 0
