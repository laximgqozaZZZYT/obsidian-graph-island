---
priority: high
reported: 2026-04-10
status: in-progress
source: decomposed
parent: 066-seamless-animation
depends: subtask-1
summary: レイアウト遷移のスキップ閾値撤廃とフォーカスズーム統合
---

## Description (subtask of 066-seamless-animation)

既存の LayoutTransition を改善し、大規模グラフでもアニメーションを有効にする。
  フォーカスズームの重複実装を LayoutTransition パターンに統合。

  1. LayoutTransition.ts を修正:
     - TRANSITION_SKIP_THRESHOLD (GVC L246, 500ノード) の参照を削除対象として整理
     - 大規模グラフ時の duration を設定値 animationDuration から取得
       (現在のハードコード 600ms/300ms → 設定値ベース)
     - enableAnimations=false 時に即座に最終位置へジャンプ
     - easing 関数を animation.ts から import（subtask-1 で対応済み）

  2. GraphViewContainer.ts を修正 (行数削減方向):
     - TRANSITION_SKIP_THRESHOLD 定数削除 (L246)
     - focusZoomToNode (L7886-7936) 内のインライン easing を
       animation.ts の関数呼び出しに置換（ロジック位置は変えない、行数微減）
     - _zoomAnimId 管理を AnimationTimer に委譲（行数微減）
     ※ GVC の行数を増やさないことが最優先

  3. テスト: tests/views/layout-transition.test.ts を更新:
     - 大規模グラフ (2000ノード) でもアニメーションが発火すること
     - enableAnimations=false で即座に最終位置に移動すること
     - animationDuration 設定値が反映されること
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
