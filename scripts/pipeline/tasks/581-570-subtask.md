---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 570-564-subtask
depends: none
summary: subtask
---

## Description (subtask of 570-564-subtask)

`★ Insight ─────────────────────────────────────`
- 親タスク `564-561-subtask` は既に "verify-only" として明示されており、実装ではなく検証のみを要求している
- このようなタスクは再分解するとオーバーヘッドが増えるだけなので、単一の SUBTASK として出力する
- verify-only タスクは GOD OBJECT ポリシー遵守の確認など、読み取りベースの作業に留めるべき
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
