---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1174-1168-buildedgelabelcontrols-buildedgecolorcon
depends: none
summary: buildEdgeLabelControls の showEdgeLabels トグルテストを追加
---

## Description (subtask of 1174-1168-buildedgelabelcontrols-buildedgecolorcon)

既存の `tests/views/panel-sections-edge-display.test.ts` に
  `describe("buildEdgeLabelControls")` ブロックを追加する。

  テストケース:
  - "showEdgeLabels トグル → cb.markDirty が呼ばれる"
    - mock container, mock callbacks (markDirty, rebuildPanel) を用意
    - `buildEdgeLabelControls(container, settings, callbacks)` を呼ぶ
    - showEdgeLabels の toggle 要素を取得し change/toggle をシミュレート
    - `expect(callbacks.markDirty).toHaveBeenCalled()` を検証
    - rebuildPanel が呼ばれていないこと (`not.toHaveBeenCalled`) も検証

  検証:
    `pnpm test tests/views/panel-sections-edge-display.test.ts` が PASS
    `pnpm test:coverage` で S28.67% 以上を維持

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
