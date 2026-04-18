---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 791-763-subtask
depends: none
summary: subtask
---

## Description (subtask of 791-763-subtask)

`★ Insight ─────────────────────────────────────`
- このissueは既に「検証専用サブタスク」として最小粒度まで分解済み — 親タスク 763-731-git-diff-status の1ステップ
- 副作用なし(read-only git操作)なので、パイプラインの「ゲート」役 — 過度な分解は避け、`git status`による対象特定 → `git diff`による差分検証の2ステップに留めるのが適切
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
