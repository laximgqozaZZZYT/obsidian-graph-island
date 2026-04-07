---
priority: high
reported: 2026-04-07
status: in-progress
source: kaizen
summary: _wireCanvasManagers の匿名 addEventListener が removeEventListener 不可能でリークする
---

## Description

`src/views/GraphViewContainer.ts:2198` と `src/views/GraphViewContainer.ts:2238` で、canvas に対して
匿名関数で `addEventListener("pointermove", ...)` と `addEventListener("click", ...)` を登録している。

```ts
// line 2198
canvas.addEventListener("pointermove", (e) => { ... });
// line 2238
canvas.addEventListener("click", (e) => { ... });
```

これらの匿名ハンドラは参照を保持していないため `removeEventListener` で解除できない。

**影響**:
1. `onClose()` (line 1855) では `interactionManager.detach()` でInteractionManagerのlistenerは解除しているが、この2つの直接追加ハンドラは対象外
2. `_wireCanvasManagers` が同一canvas要素で再呼出しされた場合、ハンドラが蓄積する
3. ハンドラ内で `this.groupByLabels`, `this.worldContainer`, `this.pixiNodes` 等を参照しており、GVC インスタンスへの参照が canvas から保持され続ける → GC妨害

**根本原因**: InteractionManager にこれらのハンドラを委譲せず、`_wireCanvasManagers` 内で直接追加したこと。

## Acceptance criteria

- [ ] pointermove / click ハンドラを名前付き関数（またはフィールド）に格納する
- [ ] `onClose()` で明示的に `removeEventListener` する
- [ ] または InteractionManager に委譲して `detach()` で一括解除される設計にする
- [ ] `_wireCanvasManagers` 再呼出し時に旧ハンドラが解除されることを確認するテスト追加
