---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 728-717-subtask
depends: subtask-2
summary: Post-Edit Read 検証と git status 確認
---

## Description (subtask of 728-717-subtask)

1. 対象ファイルを Read で再読込し、status 行が `status: done` になっていることを確認する。
  2. 他フィールド (priority / reported / parent / depends / summary / source) および本文 (## Description / ## Acceptance criteria) に差分がないことを目視検証する。
  3. Bash で `git status --short <対象ファイル絶対パス>` を実行し、`M` (modified) 状態になっていることを確認する。
  4. Bash で `git diff --stat <対象ファイル絶対パス>` を実行し、変更行数が `1 insertion(+), 1 deletion(-)` であることを確認する。
  5. 期待と異なる場合は、差分内容をそのまま報告してタスクを失敗として終了する (git restore 等で勝手に戻さない)。
  6. git add / git commit / git mv は一切行わない (兄弟タスクに委譲)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
