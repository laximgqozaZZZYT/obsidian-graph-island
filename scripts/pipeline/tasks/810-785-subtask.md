---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 785-762-717-691-edit
depends: none
summary: subtask
---

## Description (subtask of 785-762-717-691-edit)

で得られた TARGET_FILE パスを親タスク 762-731-edit-read-status-done.md の
  Description 末尾または新規 "## Investigation result" セクションに追記する。

  追記内容(例):
  ```
  ## Investigation result (2026-04-18)
  - TARGET_FILE: <subtask-1 で特定した絶対パス>
  - Source commit: <git hash または grep 経由>
  ```

  制約:
  - 既存の frontmatter(priority/reported/status/source/parent/depends/summary)を改変しない
  - Acceptance criteria セクションを改変しない
  - Edit ツールで該当ファイルのみ変更、他ファイルには触れない

`★ Insight ─────────────────────────────────────`
-

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
