---
priority: medium
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 138-perf-usability-overhaul
depends: none
summary: subtask
---

## Description (subtask of 138-perf-usability-overhaul)

`★ Insight ─────────────────────────────────────`
- CLAUDE.md の GOD OBJECT ポリシー上、`GraphViewContainer.ts` や `RenderPipeline.ts` は line count を増やせない。パフォーマンス改善ロジックは新規ファイルに抽出する設計が必須。
- 「Phase 1 で測定→ Phase 2/3 で修正」の順を壊すと、改善効果を検証できなくなるため、最初のタスクは**計測専用**として分離するのが安全。
- ズーム慣性・debounce 調整はユーザー感覚への影響が大きい。純粋関数化してテストで回帰を防ぐ形にする。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
