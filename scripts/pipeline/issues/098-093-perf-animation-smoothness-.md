---
priority: high
reported: 2026-04-11
status: pending
source: decomposed
parent: 093-perf-animation-smoothness
depends: subtask-1
summary: 不要な再描画の除去とレンダーループ最適化
---

## Description (subtask of 093-perf-animation-smoothness)

プロファイリング観点での最適化。

  1. RenderPipeline.ts renderTick():
     - tickLayoutTransition() と tickInertiaPan() が両方 false の場合、
       needsRedraw も false なら即座に idleFrames++ してreturn（現状通り）
     - idleFrames 閾値を 60 → 30 に短縮（idle検出を早めてCPU節約）

  2. GraphViewContainer.ts の散在する requestAnimationFrame 呼び出し整理:
     - focusZoomToNode (line 7809), _animateToNode (line 7966),
       _animatePanToNode (line 7755) が独立rAFチェーンを使用
     - これらを Ticker 統合は困難（独立アニメーション）のため、
       少なくとも markDirty() が確実に呼ばれて idle detach を防ぐことを確認
     - orbit animation (line 1914) も同様に確認

  3. force simulation tick (line 7137):
     - PROGRESSIVE_INTERVAL（10フレームごと描画）は大規模グラフでは適切
     - 500ノード未満では PROGRESSIVE_INTERVAL を 5 に短縮してレスポンス改善

  テスト: pnpm test で RenderPipeline テストパス。
  ゲート: pnpm lint && pnpm build で enforce-gates パス。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
