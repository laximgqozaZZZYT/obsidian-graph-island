---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 856-737-status-line-count-verify
depends: none
summary: subtask
---

## Description (subtask of 856-737-status-line-count-verify)

`★ Insight ─────────────────────────────────────`
- read-only 検証タスクは「特定 → 検証」の 2 段構成で分解すると自律パイプラインで扱いやすい
- frontmatter の status 重複は編集ロジックのバグ検出の hot-spot — Read + Grep の二段で十分
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
