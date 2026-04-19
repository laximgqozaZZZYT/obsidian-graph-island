---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 719-702-frontmatter-status-done-edit
depends: none
summary: 対象 issue ファイルの frontmatter を Read して現在の status 値を特定
---

## Description (subtask of 719-702-frontmatter-status-done-edit)

1. 701-691-glob-read から受け取った絶対パスに対し、Read ツールを offset=0, limit=30 で実行。
  2. 出力から frontmatter 内の `status:` 行を抽出し、値が `pending` / `in-progress` / `done` のいずれかを判定。
  3. 既に `done` の場合は以降の

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
