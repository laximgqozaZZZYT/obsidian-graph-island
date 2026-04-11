---
priority: high
reported: 2026-04-10
status: done
source: decomposed
parent: 064-comprehensive-perf-regression
depends: none
summary: ズーム・パン時の不要再計算を削減（spatial grid / minimap / edge filter）
---

## Description (subtask of 064-comprehensive-perf-regression)

ズーム・パン操作時のフレームごとのコストを削減する。

  1. RenderPipeline.updatePositions() 内の rebuildSpatialGrid() 呼び出しに
     条件ガードを追加。ノード位置が変化していない場合（zoom/panのみ）は
     spatial grid再構築をスキップする。_spatialGridDirty フラグを導入し、
     ノード移動時にのみtrueにする。

  2. RenderPipeline.onPostRender のミニマップ描画に dirty ガードを追加。
     needsRedraw=false かつ viewport変化なしの場合はスキップ。
     _lastViewportHash (scale+x+y の簡易比較) で変化検出。

  3. EdgeRenderer.drawEdges() 内の edges.filter() 配列アロケーションを削減。
     フィルタ結果をキャッシュし、edgeリスト自体が変わっていない場合は
     前回の結果を再利用する（_filteredEdgesCache + _edgeListVersion）。

  4. 各改善の前後でパフォーマンス計測コメントを記録（console.timeではなく
     performance.mark/measure を使い、esbuild prod dropで除去されるよう
     DEV_PERF定数でガード）。

  テスト: RenderPipeline の spatial grid スキップ条件、
         EdgeRenderer のフィルタキャッシュ有効性のユニットテスト。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
