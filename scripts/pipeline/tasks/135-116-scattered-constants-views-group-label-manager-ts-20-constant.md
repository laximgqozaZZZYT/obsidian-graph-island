---
priority: high
reported: 2026-04-15
status: pending
source: decomposed
parent: 116-scattered-constants
depends: none
summary: views/group-label-manager.ts の20+定数をconstants.tsに移動
---

## Description (subtask of 116-scattered-constants)

group-label-manager.ts に最大の定数集中（20+個: 色、サイズ、alpha、パディング等）。
  以下を実施:
  1. GROUP_LABEL_*, AGGREGATE_*, HULL_DRIFT_*, PALETTE 等の描画定数をconstants.tsに移動
  2. constants.tsにセクションコメント「// Group label rendering」追加
  3. group-label-manager.ts側をimportに切替
  4. AGGREGATE_ZOOM_THRESHOLD はexportされているため、importerも更新
  5. pnpm test && pnpm lint で確認
  目標: 20+個削減
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
