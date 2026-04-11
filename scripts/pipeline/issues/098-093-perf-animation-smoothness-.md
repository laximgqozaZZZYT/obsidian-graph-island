---
priority: high
reported: 2026-04-11
status: pending
source: decomposed
parent: 093-perf-animation-smoothness
depends: subtask-1
summary: ズームイージング改善とレイアウト遷移の大規模グラフ対応
---

## Description (subtask of 093-perf-animation-smoothness)

Subtask 1 でアニメーションが有効になった状態で品質を調整する。

  1. setZoom() のイージング調整 (GVC:5842-5866)
     - 150ms ease-out が Obsidian コアと比較して適切か CDP で確認
     - ホイール連続操作時に前のアニメーションが cancelAnimationFrame されて
       ジャンプしないか確認 → 前の目標値を引き継ぐ方式を検討

  2. レイアウト遷移の TRANSITION_SKIP_THRESHOLD (500) を検証
     - 500ノード超でもアニメーション可能か CDP で計測
     - Canvas2D で 1000ノードの遷移アニメーションが 30fps 出るか確認
     - 閾値を引き上げるか、大規模グラフ用の duration 短縮で対応

  3. focusZoomToNode (GVC:7760-7810) のアニメーション品質
     - 300ms quadratic ease-out の体感を CDP で確認
     - パン + ズームの同時アニメーションがスムーズか確認

  4. CDP でレイアウト切替 (Force → Arc → Concentric) を実行し
     ノード位置がアニメーション遷移することを実証

  enforce-gates 全パスを確認してコミット。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
