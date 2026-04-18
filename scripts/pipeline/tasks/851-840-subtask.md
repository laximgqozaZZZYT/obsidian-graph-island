---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 840-726-704-694-ratchet-claude-md-issue
depends: none
summary: subtask
---

## Description (subtask of 840-726-704-694-ratchet-claude-md-issue)

`★ Insight ─────────────────────────────────────`
この親タスクは「単一コミット」制約（分割禁止）を明示しているため、通常の多段分解は不適切。測定→更新→移動→検証→コミットが不可分なワークフローなので、1セッションで完結させるのが正解です。claude -p の max-turns 30 にも収まる規模。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
