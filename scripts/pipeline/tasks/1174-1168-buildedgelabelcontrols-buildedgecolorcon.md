---
priority: high
reported: 2026-04-20
status: in-progress
source: decomposed
parent: 1168-1159-panel-sections-edge-display
depends: subtask-1
summary: buildEdgeLabelControls + buildEdgeColorControls の3テスト追加
---

## Description (subtask of 1168-1159-panel-sections-edge-display)

subtask-1 で作成した test ファイルに以下を追加:
  - describe("buildEdgeLabelControls"): showEdgeLabels トグル → cb.markDirty (1テスト)
  - describe("buildEdgeColorControls"):
    - colorEdgesByRelation トグル → cb.rebuildPanel (1テスト)
    - edgeDirectionFilter セレクト変更 → cb.markDirty (1テスト)
  検証: `pnpm test tests/views/panel-sections-edge-display.test.ts` PASS、カバレッジ閾値 (S28.67%以上) を下回らないこと

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
