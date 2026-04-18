---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 943-936-639-626-subtask-issue-frontmatter-status
depends: none
summary: subtask
---

## Description (subtask of 943-936-639-626-subtask-issue-frontmatter-status)

`★ Insight ─────────────────────────────────────`
- このissueは単一ファイルのfrontmatter 1行変更＋コミットのみで、max-turns 30内で余裕を持って完了できる原子的タスク。さらに分割すると git commit の粒度が不自然になる
- Glob→Read→Edit→commit の一連フローは依存関係が直列で、並列化の利得もない。1 subtaskにまとめるのが適切
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
