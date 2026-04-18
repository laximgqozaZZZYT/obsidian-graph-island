---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 759-730-edit-read-frontmatter
depends: 782-759-read-frontmatter-subtask-1-baseline
summary: 対象ファイルの Description 本文を subtask-1 baseline と照合 (subtask-3)
---

## Description (subtask of 759-730-edit-read-frontmatter)

1. 先行ステップ (782-759-read-frontmatter-subtask-1-baseline) で `FRONTMATTER OK` を受けた後に実行。
2. baseline.json から `body` フィールド (subtask-1 で保存済の `## Description` 以降の原文文字列) を取得。
3. 対象 .md ファイルの `## Description` 行以降すべて (末尾改行含む) を抽出。
4. 文字列完全一致を検証:
   - 行数一致
   - 各行の前後空白・タブ・wiki-link (`[[...]]`) 完全一致
   - 末尾改行の有無まで一致
5. 不一致なら ERROR を出力し、最初の差分行番号と expected/actual の該当行を表示して exit 2。
6. 一致なら `BODY OK` を出力し exit 0。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
