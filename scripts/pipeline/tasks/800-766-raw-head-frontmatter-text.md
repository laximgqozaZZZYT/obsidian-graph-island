---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 766-733-issue-read-frontmatter
depends: subtask-1
summary: RAW_HEAD から `---`〜`---` を抽出し FRONTMATTER_TEXT へ格納
---

## Description (subtask of 766-733-issue-read-frontmatter)

RAW_HEAD の 1行目が `---` であることを確認し、
  次の `---` が現れるまでの行を連結して FRONTMATTER_TEXT に格納するロジックを
  タスクファイル内に擬似コードで記述。
  正規表現 `/^---\n([\s\S]*?)\n---/m` でのキャプチャ方針を明記。
  ログに `[frontmatter-read] extracted <N> lines` を出力。
  次タスク (status 抽出) へ FRONTMATTER_TEXT を引き渡す旨を明示。

### 実行トレース（期待ログ）

```text
# [前提] 799-766-read-offset-0-limit-30 の出力変数
RAW_HEAD: string   # Read(offset=0, limit=30) で取得済みの先頭30行生テキスト

# [Step 1] 1行目判定（guard）
#   - RAW_HEAD.split(/\r?\n/)[0] が "---" でなければ frontmatter 無しとみなし
#     FRONTMATTER_TEXT = null を返して後続タスク(status抽出)へ abort シグナル
if (RAW_HEAD.split(/\r?\n/)[0] !== "---") {
  log("[frontmatter-read] no leading --- marker")
  FRONTMATTER_TEXT = null
  // 次タスクは null を検出したら status 判定スキップ
  return
}

# [Step 2] 正規表現キャプチャ
#   - パターン: /^---\n([\s\S]*?)\n---/m
#     * `^---\n`          : 先頭行 `---` と直後の改行
#     * `([\s\S]*?)`      : 改行を含む任意文字の非貪欲キャプチャ（最初の閉じ `---` までで止める）
#     * `\n---`           : 閉じの区切り（区切り行自体はキャプチャに含めない）
#     * フラグ `m`         : `^` を行頭アンカーとして有効化
#   - YAML 内に `---` が登場する病的ケースは仕様外（最短一致で最初の閉じを採用）
const m = RAW_HEAD.match(/^---\n([\s\S]*?)\n---/m)
if (m === null) {
  log("[frontmatter-read] unterminated frontmatter (no closing ---)")
  FRONTMATTER_TEXT = null
  return
}
FRONTMATTER_TEXT = m[1]   // 区切り `---` を除いた中身のみ

# [Step 3] 行数カウント & ログ
const N = FRONTMATTER_TEXT.length === 0
  ? 0
  : FRONTMATTER_TEXT.split(/\r?\n/).length
log(`[frontmatter-read] extracted ${N} lines`)

# [事後条件]
# - FRONTMATTER_TEXT は区切り `---` を含まない純粋な YAML 本文
# - 空 frontmatter (`---\n---`) の場合 FRONTMATTER_TEXT === "" かつ N === 0
# - 次タスク (status 抽出サブタスク) は FRONTMATTER_TEXT を入力とし
#   `/^status:\s*(\S+)/m` 等で status フィールドをキャプチャする想定
# - 本タスクはソース変更なし、擬似コード追記と期待ログ定義のみ
```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
