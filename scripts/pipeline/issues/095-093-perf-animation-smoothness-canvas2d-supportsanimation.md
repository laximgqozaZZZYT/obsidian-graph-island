---
priority: critical
reported: 2026-04-11
status: pending
source: decomposed
parent: 093-perf-animation-smoothness
depends: none
summary: Canvas2D バックエンドでアニメーションを有効化 — supportsAnimation 廃止と軽量アニメーション許可
---

## Description (subtask of 093-perf-animation-smoothness)

Canvas2D の supportsAnimation=false が全アニメーションを殺している根本原因を修正する。

  1. IApp インターフェースから supportsAnimation プロパティを削除
     - src/views/canvas2d/interfaces.ts: readonly supportsAnimation 行を削除
     - src/views/canvas2d/CanvasApp.ts: supportsAnimation = false 行を削除
     - src/views/webgl/WebGLApp.ts: supportsAnimation = true 行を削除

  2. GVC 内の supportsAnimation ガードを撤廃し、全バックエンドでアニメーションを有効化
     - src/views/GraphViewContainer.ts:5833 — setZoom() の !this.pixiApp?.supportsAnimation 条件を削除
     - src/views/GraphViewContainer.ts:7354 — _applyLayoutTransition() の supportsAnimation チェックを削除
       ただしノード数が TRANSITION_SKIP_THRESHOLD (500) を超える場合のスキップは維持
       （条件を「transitionData.length > TRANSITION_SKIP_THRESHOLD」のみに変更）
     - src/views/GraphViewContainer.ts:7734 — panToNode() の supportsAnimation チェックを削除
     - src/views/GraphViewContainer.ts:7774 — focusZoomToNode() の supportsAnimation チェックを削除

  3. prefers-reduced-motion チェックは全箇所で維持すること

  4. 既存テストの supportsAnimation 参照箇所を更新（grep で全件確認）

  enforce-gates (lint/test/build) 全パスを確認してコミット。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
