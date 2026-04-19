---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 691-662-subtask-status-done
depends: 701-691-glob-read
summary: frontmatter status を done に書き換え
---

## Description (subtask of 691-662-subtask-status-done)

1. 701-691-glob-read で特定したファイルの絶対パスを受け取り、Edit ツールで開く。
2. frontmatter の `status: decomposed` または `status: decomposed` のみを `status: done` に置換する。
3. `priority` / `reported` / `parent` / `depends` / `summary` / `source` など他の frontmatter フィールドは一切変更しない。
4. 本文 (Description / Acceptance criteria) も変更しない。
5. git mv / git commit はこのタスクでは実行しない (兄弟タスクに委譲)。
6. 編集後、Read で frontmatter を再確認し `status: done` になっていることを検証する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
