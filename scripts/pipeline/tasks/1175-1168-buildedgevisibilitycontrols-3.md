---
priority: high
reported: 2026-04-20
status: in-progress
source: decomposed
parent: 1168-1159-panel-sections-edge-display
depends: subtask-2
summary: buildEdgeVisibilityControls の3テスト追加 + 全体回帰確認
---

## Description (subtask of 1168-1159-panel-sections-edge-display)

subtask-2 で拡張した test ファイルに以下を追加:
  - describe("buildEdgeVisibilityControls") 配下に3テスト:
    1. edgeTypeCounts={link:5} を渡すと link トグルが表示される (querySelector で確認)
    2. count=0 の edge type (similar 以外) は描画されない
    3. Solo ボタンクリック → cb.markDirty + cb.rebuildPanel が両方呼ばれる
  最終検証:
  - `pnpm test tests/views/panel-sections-edge-display.test.ts` 全PASS (計8テスト)
  - `pnpm test` 全体 PASS、カバレッジ S28.67%/B27.19%/F25.49%/L28.35% 以上維持
  - `pnpm lint` および `pnpm format:check` PASS

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
