---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 974-961-tasks-760-730-git-status-short-modified
depends: none
summary: subtask
---

## Description (subtask of 974-961-tasks-760-730-git-status-short-modified)

の調査で `status: in-progress` が確認できた場合のみ Edit 実行。
  - old_string: `status: in-progress`
  - new_string: `status: done`
  - replace_all: false (frontmatter はユニーク1箇所のため)
  既に `status: done` 等の場合は何もせず次の SUBTASK へ。
  他ファイル変更禁止、God Object 変更禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
