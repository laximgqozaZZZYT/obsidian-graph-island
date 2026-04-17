---
priority: medium
reported: 2026-04-17
status: done
source: decomposed
parent: 469-138-
depends: none
summary: subtask
---

## Description (subtask of 469-138-)

`★ Insight ─────────────────────────────────────`
- 純粋関数を先に (RenderThresholds定数 → input-smoothing.ts) 作ってからGVC統合するのがGod Object肥大化防止の定石
- `scheduleRender("pan-inertia")` は subtask-2 のスケジューラ依存 → 統合は最後
- pure function化されているのでテストは関数単体で30+ケース書ける (GVC改造前に完了可能)
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
