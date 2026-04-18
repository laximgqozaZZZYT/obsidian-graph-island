---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 717-691-status-done-edit
depends: subtask-1
summary: Edit ツールで status: done に置換
---

## Description (subtask of 717-691-status-done-edit)

Edit ツールで frontmatter 内の `status: done` または `status: in-progress` を `status: done` に置換する。
  old_string / new_string は当該の1行のみ（前後にコンテキスト行を含めて一意化）。
  他フィールド (priority / reported / parent / depends / summary / source) の行、本文 (## Description 以降および ## Acceptance criteria) は絶対に触れない。
  replace_all は使用しない（frontmatter の status 行は常に1箇所のみ）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
