---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 717-691-status-done-edit
depends: subtask-2
summary: 再 Read と git status で差分検証
---

## Description (subtask of 717-691-status-done-edit)

Edit 後に同ファイルを Read で再読込し、`status: done` になっていること、および status 行以外に変更がないこと（他 frontmatter フィールド・本文が完全保全）を目視検証する。
  Bash で `git status --short docs/issues/<該当ファイル>` を実行し、出力が ` M ...` であること（modified 1件）を確認する。
  git add / git commit / git mv は一切実行しない（兄弟タスクの責務）。検証のみで完了とする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
