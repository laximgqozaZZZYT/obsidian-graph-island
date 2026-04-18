---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 717-691-status-done-edit
depends: none
summary: subtask
---

## Description (subtask of 717-691-status-done-edit)

`★ Insight ─────────────────────────────────────`
- このタスクは単一ファイルの frontmatter 1行変更。subtask-1 で特定した対象ファイルが単一なら、実質「Read→Edit→Read→git status」の直列フローで完結するため、過度な分解はオーバーヘッドになります
- Edit 前後の差分検証を独立タスクにすると、context 断絶で再 Read が発生して非効率。「変更+検証」を1タスクに束ねるのが claude -p セッションに適した粒度です
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
