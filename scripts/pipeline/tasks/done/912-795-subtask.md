---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 795-764-subtask
depends: none
summary: subtask
---

## Description (subtask of 795-764-subtask)

`★ Insight ─────────────────────────────────────`
- 元タスクは read-only 検証で副作用禁止のため、分解は「対象パスの状態確認」と「全体スキャン」の2段で十分
- `git status --short <path>` と `git status --short` は別用途なので、タスクを分けた方が失敗時の切り分けが明確
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
