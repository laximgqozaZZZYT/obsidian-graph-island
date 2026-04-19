---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 949-939-639-626-subtask-issue-pending-done-git-m
depends: none
summary: subtask
---

## Description (subtask of 949-939-639-626-subtask-issue-pending-done-git-m)

`★ Insight ─────────────────────────────────────`
- このissueは「pending→done の git mv + status 書換を単一コミットで行う」という本質的にアトミックな操作です。ステップを分割すると中間commitが発生し "単一コミット" 要件に違反します。
- 依存関係: Glob→Read→Edit→git mv→commit は全て直列でかつ短時間。claude -p max-turns 30 の1セッションに十分収まります。
- 複数件マッチ時の中止ロジックと no-op exit 0 分岐があるため、単一タスク内で分岐処理をハンドリングさせるのが安全です。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
