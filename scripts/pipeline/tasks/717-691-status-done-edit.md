---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 691-662-subtask-status-done
depends: subtask-1
summary: 特定ファイルの status を done に Edit
---

## Description (subtask of 691-662-subtask-status-done)

1. subtask-1 で特定したファイルを Read で再読込する（frontmatter 検証）。
  2. Edit ツールで frontmatter の `status: pending` または `status: in-progress` を `status: done` に置換する。
  3. 他フィールド (priority / reported / parent / depends / summary / source) は一切変更しない。
  4. 本文 (## Description 以降、## Acceptance criteria) は変更しない。
  5. Edit 後に Read で再確認し、status 行以外に差分がないことを検証する。
  6. この時点では git mv / git add / git commit は行わない（兄弟タスクに委譲）。
  7. Bash で `git status --short` を実行し、対象ファイルが modified になっていることのみ確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
