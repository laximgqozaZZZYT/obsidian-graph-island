---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 719-702-frontmatter-status-done-edit
depends: subtask-1
summary: 編集後のdiff検証 (status行以外が変化していないこと)
---

## Description (subtask of 719-702-frontmatter-status-done-edit)

1. Bash で `git diff -- <issueファイルパス>` を実行し、変更が status 行 1 行のみであることを確認する。
  2. 期待: `-status: in-progress` (または `-status: pending`) と `+status: done` の2行のみが差分に出ること。
  3. それ以外の行 (priority / reported / parent / depends / summary / source / 本文 / `---`) が diff に現れた場合は失敗として終了し、後続の commit タスクをブロックする。
  4. 末尾改行の増減 (`\ No newline at end of file` 表示) もエラー扱いとする。
  5. 検証結果を標準出力に 1 行サマリで出す (例: `OK: status pending→done on <path>`)。
  6. ファイルへの書き込みは一切行わない (検証専用タスク)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
