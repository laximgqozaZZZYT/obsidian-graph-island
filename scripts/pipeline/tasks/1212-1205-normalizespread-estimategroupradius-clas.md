---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1205-145-cluster-force-ts-export
depends: subtask-2
summary: normalizeSpread/estimateGroupRadius/classifyNeighborEdges を export しテスト追加
---

## Description (subtask of 1205-145-cluster-force-ts-export)

src/layouts/cluster-force.ts で以下を export 追加:
  - `normalizeSpread(...)` (L2574)
  - `estimateGroupRadius(...)` (L2294)
  - `classifyNeighborEdges(...)` (L2965)

  tests/cluster-force-pure.test.ts にさらに 4件以上追加 (合計 12件以上に到達):
  - normalizeSpread: 均等分布 / 偏った分布 / 単一要素
  - estimateGroupRadius: ノード数 0 / 1 / 多数、nodeSize 変化に対する単調性
  - classifyNeighborEdges: 空 edges / link のみ / 混合タイプ / 自己ループ

  完了条件: `pnpm test tests/cluster-force-pure.test.ts` が全 PASS、
  `pnpm lint` / `pnpm format:check` が通る、
  CLAUDE.md の "GOD OBJECT Policy" および "coverage ratchet" ルールを遵守 (行数 3556 から大幅増加させない — export 追加のみで本文変更なし)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
