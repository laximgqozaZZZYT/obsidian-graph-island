---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 144-coverage-drop
depends: none
summary: soft-render.ts に host モックでテスト追加
---

## Description (subtask of 144-coverage-drop)

src/views/soft-render.ts (41行・未テスト) の `applySoftRender(host)` を対象に
  tests/views/soft-render.test.ts を新規作成。
  
  SoftRenderHost インタフェースを満たす最小モックを vi.fn() で構築し、
  - applySoftRender が _invalidateRenderCaches → getGraphData → _build*(gd) 群 → recolorNodes → recalcNodeRadii → setStatus → markDirty(true) → doRender の順で呼ばれることを呼び出し順テストで検証
  - getGraphData が空配列を返した場合の動作
  - doRender の Promise が await されること
  - markDirty の引数が常に true であること
  
  最低 5 件のテスト。InteractionManager の PixiNode は型のみ参照のため、Map の最小モックで十分。
  期待: 関数 1件 + statements ~30行カバー

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
