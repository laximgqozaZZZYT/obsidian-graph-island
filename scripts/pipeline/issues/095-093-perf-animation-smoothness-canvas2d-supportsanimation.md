---
priority: critical
reported: 2026-04-11
status: in-progress
source: decomposed
parent: 093-perf-animation-smoothness
depends: none
summary: Canvas2D supportsAnimation有効化 + レイアウト遷移アニメーション修正
---

## Description (subtask of 093-perf-animation-smoothness)

Canvas2Dバックエンドでアニメーションがすべてスキップされているのが最大の原因。

  1. src/views/canvas2d/CanvasApp.ts:34 — `supportsAnimation = false` → `true` に変更
     Canvas2DでもrequestAnimationFrameベースのアニメーションは問題なく動作する。
     WebGLとの差はGPUアクセラレーションであり、アニメーション機能の有無ではない。

  2. src/views/GraphViewContainer.ts:7354 — TRANSITION_SKIP_THRESHOLD ガードの見直し
     supportsAnimation=true後はこのガードは大規模グラフ(2000+)のみに絞る:
     - TRANSITION_SKIP_THRESHOLD を 500 → 2000 に引き上げ
     - または `supportsAnimation` チェックを削除して純粋にノード数のみで判断

  3. src/views/GraphViewContainer.ts:5833, 7734, 7774 — supportsAnimationガード3箇所
     全て supportsAnimation=true になるため自動的に有効化される。追加変更不要。

  テスト: pnpm test でレイアウト遷移テスト既存パス確認。
  確認: pnpm build → E2E smoke でレイアウト切替時にノードが滑らかに移動すること。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
