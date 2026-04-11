---
priority: high
reported: 2026-04-11
status: in-progress
source: decomposed
parent: 093-perf-animation-smoothness
depends: subtask-1
summary: レンダーループの不要再描画を除去し大規模グラフのフレームレートを改善
---

## Description (subtask of 093-perf-animation-smoothness)

doRender() デバウンスとレンダーループの効率を改善する。

  1. doRender() 50ms デバウンスの精査 (GVC:6833-6846)
     - 連続 doRender() 呼び出しパターンを調査し、根本原因を修正
     - デバウンスが症状隠しになっている場合、呼び出し元を修正

  2. RenderPipeline.renderTick() の最適化 (RenderPipeline.ts:530-587)
     - needsRedraw=false かつ transition/inertia もない場合のアーリーリターンを確認
     - IDLE_FRAME_DETACH_THRESHOLD (60フレーム) のアイドル検出が正常動作しているか確認
     - markDirty(false) → needsFullRedraw=false の場合に updatePositions のスキップ条件確認

  3. handleWheel() の重複処理を調査 (InteractionManager.ts:366-406)
     - ホイールイベント毎に markDirty + updateLabelsForZoom が走っていないか
     - ラベル更新のデバウンス（50ms）が適切に動作しているか

  4. 2000+ ノードでの FPS を CDP 経由で計測
     - currentFps プロパティを CDP で読み取り 30fps 以上を確認
     - ボトルネックがあれば特定して報告

  enforce-gates 全パスを確認してコミット。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
