---
priority: high
reported: 2026-04-20
status: pending
source: decomposed
parent: 1168-1159-panel-sections-edge-display
depends: none
summary: panel-sections-edge-display.test.ts のscaffold + buildEdgeStyleControls の2テスト追加
---

## Description (subtask of 1168-1159-panel-sections-edge-display)

新規ファイル `tests/views/panel-sections-edge-display.test.ts` を作成。
  既存 `tests/views/panel-sections-*.test.ts` のパターンを参考に、以下を実装:
  - import: `buildEdgeStyleControls`, `buildEdgeLabelControls`, `buildEdgeColorControls`, `buildEdgeVisibilityControls` from `src/views/panel-sections-edge-display`
  - jsdom 環境セットアップ (vitest config 既存)
  - 共通 fixture: `createBody()`, `createMockState()`, `createMockCallbacks()` (markDirty/rebuildPanel/announceA11y/invalidateDataKeepPanel を vi.fn)
  - describe("buildEdgeStyleControls") 配下に2テスト:
    1. body.children.length > 0 となること
    2. showArrows トグルクリック → cb.markDirty が呼ばれること
  検証: `pnpm test tests/views/panel-sections-edge-display.test.ts` PASS、`pnpm test` 全体 regression なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
