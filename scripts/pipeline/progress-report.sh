#!/usr/bin/env bash
# Graph Island 自律パイプライン進捗レポート生成
# 出力: /tmp/graph-island-progress.md
# Usage: progress-report.sh [hours]   (default: 6)

set -uo pipefail

HOURS="${1:-6}"
OUT="/tmp/graph-island-progress.md"
RESULTS_DIR="/tmp/graph-island-improve-results"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

NOW="$(date '+%Y-%m-%d %H:%M:%S')"
SINCE="${HOURS} hours ago"

# ─────────────────────────────────────────────
# コミット集計
# ─────────────────────────────────────────────
# awk 'END{print NR+0}' は空入力でも 0 を返し pipefail 耐性があるため
# `grep -c` + `|| true` イディオムより安全。
COMMIT_LOG="$(git log --since="$SINCE" --pretty=format:'%H%x09%s' 2>/dev/null || true)"
count_log() { awk -v pat="$1" '$0 ~ pat { c++ } END { print c+0 }' <<<"$COMMIT_LOG"; }

TOTAL_COMMITS=$(awk 'NF { c++ } END { print c+0 }' <<<"$COMMIT_LOG")
C_COVERAGE=$(count_log 'chore\(auto\): coverage improvement')
C_ESLINT=$(count_log 'chore\(auto\): eslint improvement')
C_REFACTOR=$(count_log 'chore\(auto\): refactor improvement')
C_SUBTASK=$(count_log 'chore\(auto\): subtask improvement')

# ─────────────────────────────────────────────
# アクティブセッション
# ─────────────────────────────────────────────
# pgrep -fc はマッチ件数を直接返す。パターンに `/` と `\b` を含めることで
# 子 bash/親 sh/worktree サブシェル等の重複マッチを避ける。
ACTIVE=$(pgrep -fc '/autonomous-improve\.sh( |$)' 2>/dev/null || echo 0)
MAX_SESSIONS=$(grep -E '^MAX_SESSIONS=' scripts/pipeline/autonomous-improve.sh 2>/dev/null | head -1 | cut -d= -f2)
MAX_SESSIONS="${MAX_SESSIONS:-2}"

# ─────────────────────────────────────────────
# 完了セッション (直近 HOURS 時間)
# ─────────────────────────────────────────────
SESSION_TABLE=""
if [[ -d "$RESULTS_DIR" ]]; then
  CUTOFF_EPOCH=$(date -d "$SINCE" +%s 2>/dev/null || echo 0)
  # find -printf で NUL 区切りに近い安全な列挙（ls パイプより堅牢）。
  # 結果 JSON はセッション ID ベースで空白/改行は含まれない前提だが、
  # ポータビリティのため mtime 昇順で列挙する。
  while IFS= read -r jf; do
    [[ -f "$jf" ]] || continue
    sess=$(grep -oP '"session":\s*"\K[^"]+' "$jf" || echo "")
    focus=$(grep -oP '"focus":\s*"\K[^"]+' "$jf" || echo "")
    commits=$(grep -oP '"commits":\s*\K[0-9]+' "$jf" || echo "0")
    ts=$(grep -oP '"timestamp":\s*"\K[^"]+' "$jf" || echo "")
    [[ -z "$sess" ]] && continue
    if [[ -n "$ts" ]]; then
      ts_epoch=$(date -d "$ts" +%s 2>/dev/null || echo 0)
      [[ $ts_epoch -lt $CUTOFF_EPOCH ]] && continue
    fi
    SESSION_TABLE+="| ${sess} | ${focus} | ${commits} | ${ts} |"$'\n'
  done < <(find "$RESULTS_DIR" -maxdepth 1 -name '*.json' -printf '%T@\t%p\n' 2>/dev/null | sort -n | cut -f2-)
fi

# ─────────────────────────────────────────────
# Issue キュー
# ─────────────────────────────────────────────
ISSUE_DIR="scripts/pipeline/issues"
PENDING=0; INPROG=0; DONE=0; UNKNOWN=0
if [[ -d "$ISSUE_DIR" ]]; then
  # glob を nullglob で空ループ安全に
  shopt -s nullglob
  for f in "$ISSUE_DIR"/*.md; do
    status=$(grep -oP '^status:\s*\K\S+' "$f" 2>/dev/null || echo "pending")
    case "$status" in
      in-progress) INPROG=$(( INPROG + 1 )) ;;
      done)        DONE=$(( DONE + 1 )) ;;
      pending)     PENDING=$(( PENDING + 1 )) ;;
      *)           UNKNOWN=$(( UNKNOWN + 1 )) ;;
    esac
  done
  # done/ サブディレクトリ内のアーカイブ分も DONE に加算
  DONE=$(( DONE + $(find "$ISSUE_DIR/done" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l) ))
  shopt -u nullglob
fi

RECENT_DONE=""
if [[ -d "$ISSUE_DIR/done" ]]; then
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    base=$(basename "$f" .md)
    summary=$(grep -oP '^summary:\s*\K.+' "$f" 2>/dev/null | head -1 || echo "")
    RECENT_DONE+="- ${base}: ${summary}"$'\n'
  done < <(find "$ISSUE_DIR/done" -maxdepth 1 -name '*.md' -printf '%T@\t%p\n' 2>/dev/null | sort -rn | head -5 | cut -f2-)
fi

# ─────────────────────────────────────────────
# カバレッジしきい値推移
# ─────────────────────────────────────────────
extract_thresholds() {
  local sha="$1"
  git show "${sha}:vitest.config.ts" 2>/dev/null | awk '
    /thresholds:/ {in_t=1; next}
    in_t && /statements:/ {gsub(/[^0-9.]/,""); s=$0}
    in_t && /branches:/   {gsub(/[^0-9.]/,""); b=$0}
    in_t && /functions:/  {gsub(/[^0-9.]/,""); f=$0}
    in_t && /lines:/      {gsub(/[^0-9.]/,""); l=$0; print s, b, f, l; exit}
  '
}

CURRENT_THRESH=$(extract_thresholds HEAD)
read -r CUR_S CUR_B CUR_F CUR_L <<<"$CURRENT_THRESH"

THRESH_ROWS=""
# --reverse で時系列順（古い→新しい）にイテレートし、delta を
# 「この行のコミットで何が変わったか」として正しく紐付ける。
# --since で既に期間フィルタ済みなので head は不要。
RATCHET_SHAS=$(git log --reverse --since="$SINCE" --pretty=format:'%h %ad' --date=short -- vitest.config.ts 2>/dev/null || true)
if [[ -n "$RATCHET_SHAS" ]]; then
  prev_s="" prev_b="" prev_f="" prev_l=""
  while IFS=' ' read -r sha date; do
    [[ -z "$sha" ]] && continue
    th=$(extract_thresholds "$sha")
    [[ -z "$th" ]] && continue
    read -r s b f l <<<"$th"
    if [[ -n "$prev_s" ]]; then
      ds=$(awk -v a="$s" -v p="$prev_s" 'BEGIN{printf "%+.1f", a-p}')
      db=$(awk -v a="$b" -v p="$prev_b" 'BEGIN{printf "%+.1f", a-p}')
      df=$(awk -v a="$f" -v p="$prev_f" 'BEGIN{printf "%+.1f", a-p}')
      dl=$(awk -v a="$l" -v p="$prev_l" 'BEGIN{printf "%+.1f", a-p}')
    else
      ds="+0.0" db="+0.0" df="+0.0" dl="+0.0"
    fi
    THRESH_ROWS+="| ${date} | ${sha} | ${s} | ${b} | ${f} | ${l} | ${ds} | ${db} | ${df} | ${dl} |"$'\n'
    prev_s="$s" prev_b="$b" prev_f="$f" prev_l="$l"
  done <<<"$RATCHET_SHAS"
fi

# ─────────────────────────────────────────────
# God Object サイズ
# ─────────────────────────────────────────────
declare -A LIMITS=(
  ["src/views/EdgeRenderer.ts"]=3853
  ["src/views/PanelBuilder.ts"]=4377
  ["src/views/RenderPipeline.ts"]=3438
  ["src/views/GraphViewContainer.ts"]=9947
)
# god-object-audit.sh から動的に取得を試みる
if [[ -f scripts/pipeline/god-object-audit.sh ]]; then
  while IFS= read -r line; do
    f=$(echo "$line" | grep -oP 'LIMITS\["\K[^"]+')
    v=$(echo "$line" | grep -oP '\]=\K[0-9]+')
    [[ -n "$f" && -n "$v" ]] && LIMITS["$f"]="$v"
  done < <(grep -E 'LIMITS\["[^"]+"\]=[0-9]+' scripts/pipeline/god-object-audit.sh)
fi

GO_TABLE=""
GO_COMMITS=""
for file in src/views/EdgeRenderer.ts src/views/PanelBuilder.ts src/views/RenderPipeline.ts src/views/GraphViewContainer.ts; do
  [[ -f "$file" ]] || continue
  cur=$(wc -l < "$file" | tr -d ' ')
  lim="${LIMITS[$file]:-?}"
  if [[ "$lim" =~ ^[0-9]+$ ]]; then
    head=$(( lim - cur ))
  else
    head="?"
  fi
  GO_TABLE+="| ${file} | ${cur} | ${lim} | ${head} |"$'\n'
  GO_COMMITS+=$'\n'"**${file}**"$'\n'
  while IFS= read -r c; do
    [[ -n "$c" ]] && GO_COMMITS+="- ${c}"$'\n'
  done < <(git log --since="$SINCE" --oneline -- "$file" 2>/dev/null | head -5)
done

# ─────────────────────────────────────────────
# 出力
# ─────────────────────────────────────────────
{
cat <<EOF
# Graph Island 進捗レポート

生成時刻: ${NOW}
集計期間: 直近 ${HOURS} 時間

## コミット

合計: ${TOTAL_COMMITS} 件

| focus | count |
|-------|-------|
| coverage | ${C_COVERAGE} |
| eslint | ${C_ESLINT} |
| refactor | ${C_REFACTOR} |
| subtask | ${C_SUBTASK} |

## アクティブセッション

${ACTIVE}/${MAX_SESSIONS} セッション稼働中

## 完了セッション

| session | focus | commits | timestamp |
|---------|-------|---------|-----------|
EOF
[[ -n "$SESSION_TABLE" ]] && printf '%s' "$SESSION_TABLE" || echo "| (none in window) | - | - | - |"

cat <<EOF

## Issue キュー

- pending: ${PENDING} 件
- in-progress: ${INPROG} 件
- done: ${DONE} 件

直近完了:
EOF
[[ -n "$RECENT_DONE" ]] && printf '%s' "$RECENT_DONE" || echo "- (none)"

cat <<EOF

## カバレッジしきい値推移

現在: S${CUR_S} / B${CUR_B} / F${CUR_F} / L${CUR_L}

| date | hash | S | B | F | L | ΔS | ΔB | ΔF | ΔL |
|------|------|---|---|---|---|----|----|----|----|
EOF
[[ -n "$THRESH_ROWS" ]] && printf '%s' "$THRESH_ROWS" || echo "| - | - | - | - | - | - | - | - | - | - |"

cat <<EOF

## God Object サイズ

| file | current | limit | headroom |
|------|---------|-------|----------|
EOF
printf '%s' "$GO_TABLE"

cat <<EOF

### 直近変更コミット
EOF
printf '%s' "$GO_COMMITS"
} > "$OUT"

echo "Wrote ${OUT} ($(wc -l < "$OUT") lines)"
