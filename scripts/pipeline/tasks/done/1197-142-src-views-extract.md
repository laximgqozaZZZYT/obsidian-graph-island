---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 142-coverage-drop
depends: none
summary: src/views/ から extract 済み純粋関数のテスト拡充
---

## Description (subtask of 142-coverage-drop)

EdgeRenderer.ts / RenderPipeline.ts / PanelBuilder.ts から既に export されている純粋関数 (resolveEdgeStyle, computeDensityScale, getDashPattern, screenToWorld 等) のテストで、未カバーの分岐を洗い出して追加する。
  - LOD ティア境界 (zoom = 0.1, 0.5, 1, 2, 5)
  - highContrast / fadeByDegree / highlight の組み合わせ
  - edgeType ごとの分岐網羅
  tests/views/ 配下に 10-15 件追加。
  **god object 本体に行を追加するような変更は禁止** (関数本体への追加変更は一切しない、新規テストのみ)。
  完了基準: `pnpm test` 全 PASS、branches カバレッジが +0.3% 以上上昇。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
