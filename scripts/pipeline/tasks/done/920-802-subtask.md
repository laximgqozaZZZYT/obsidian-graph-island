---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 802-769-subtask
depends: none
summary: subtask
---

## Description (subtask of 802-769-subtask)

で**生出力をそのまま返す**のがポイントです。parse処理を混ぜると「取得」と「解析」の責務が混ざり、親タスク769-760の次サブタスク（parseする側）が設計しづらくなります。pipeline末端タスクほど「一つのI/O境界だけ触る」原則を守ると、後段での再利用性が上がります。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
