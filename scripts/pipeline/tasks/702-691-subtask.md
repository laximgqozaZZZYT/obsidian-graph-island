---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 691-662-subtask-status-done
depends: none
summary: subtask
---

## Description (subtask of 691-662-subtask-status-done)

で特定したファイルを Edit ツールで開く
  2. frontmatter の `status: pending` または `status: in-progress` のみを `status: done` に置換する
  3. `priority` / `reported` / `parent` / `depends` / `summary` / `source` など他の frontmatter フィールドは一切変更しない
  4. 本文 (Description / Acceptance criteria) も変更しない
  5. git mv / git commit はこのタスクでは実行しない (兄弟タスクに委譲)
  6. 編集後、Read で frontmatter を再確認し `status: done` になっていることを検証する

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
