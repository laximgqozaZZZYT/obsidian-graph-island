---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 887-881-639-626-subtask-issue-pending-done-git-m
depends: none
summary: subtask
---

## Description (subtask of 887-881-639-626-subtask-issue-pending-done-git-m)

`★ Insight ─────────────────────────────────────`
- このissueは既に「原子的1コミット」として設計されており、これ以上分解すると `git mv` と frontmatter 編集が別コミットになり原子性が壊れる
- 分解ルール「各タスクは独立して実装・テスト・コミットできる」を満たす最小単位は1タスク
- 0件ヒット時の no-op 早期 return がフォールバック分岐になっており、実質的に追加タスク不要
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
