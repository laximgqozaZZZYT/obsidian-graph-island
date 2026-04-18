---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 766-733-issue-read-frontmatter
depends: subtask-1
summary: head30 から frontmatter 領域 `---`〜`---` を抽出する純関数追加
---

## Description (subtask of 766-733-issue-read-frontmatter)

scripts/issue-pipeline/extract-frontmatter.mjs に extractFrontmatter(head30: string): string | null を新規実装。
  - 行分割し、1行目が `---` でなければ null を返す（frontmatter なし判定、次タスクでエラー扱い）
  - 2行目以降で最初に出現する `---` までの行を連結し返す（区切り行自体は含めない）
  - 閉じ `---` が30行内に見つからなければ null を返す
  - 末尾改行は除去
  - read-frontmatter.mjs から呼び出し、null の場合 process.exit(3) で "E_FRONTMATTER_MISSING:<path>" を stderr 出力
  - テスト: ① 正常 ② 1行目が `---` でない ③ 閉じ `---` なし ④ 空 frontmatter（`---\n---`）⑤ YAML内に `---` を含まないケースのみ（複数 `---` 検出は仕様外として最初の閉じのみ拾えば OK）

`★ Insight ─────────────────────────────────────`
- subtask-1 は I/O 専念、subtask-2 は純関数に分離することで、後続 issue（frontmatter status 判定、更新書き戻し）で extract 関数を再利用可能
- exit code を 2/3 と分けているのは、パイプライン側で「ファイル問題」か「frontmatter 構造問題」かを再試行ロジックで区別するため
- CLAUDE.md の God Object Policy には抵触せず、src/ 配下は変更しないので bundle size budget/coverage ratchet にも影響なし
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
