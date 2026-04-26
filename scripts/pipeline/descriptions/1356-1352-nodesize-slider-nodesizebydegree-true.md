## Description (subtask of 1352-broken-node-settings-cleanup)

`nodeSizeByDegree=true` 時に `panel.nodeSize` slider 値が無視される問題を修正する (Issue #1352 acceptance A-1)。

  対象箇所:
  - `src/views/GraphViewContainer.ts:7083-7110` 付近の `recalcNodeRadii` で `sizeByDeg` 分岐に入った場合に `panel.nodeSize` (基準サイズ) が degree 計算結果に反映されているか確認し、反映されていなければ degree-scaled radius に `(panel.nodeSize / DEFAULT_NODE_SIZE)` のような乗数として組み込む。
  - `src/views/GraphViewContainer.ts:8293-8320` 付近の zoom-aware shrink (`_zoomBaseNodeSize`) も同様に `panel.nodeSize` を反映する。
  - `src/views/LayoutController.ts:112-130` の半径計算経路で `sizeByDeg` ブランチに `panel.nodeSize` 因子を渡す。

  実装方針:
  - degree モード時の最終半径 = `degreeScale(degree) * (panel.nodeSize / NODE_SIZE_BASELINE)` の形にする (NODE_SIZE_BASELINE は `RenderThresholds` か `constants.ts` に定数として追加してよい — マジックナンバー禁止ポリシー遵守)。
  - 既存の slider 範囲 (5..300, default は確認) で min/max のレシオが極端にならないようガード。
  - 描画再計算トリガ (`cb.recalcNodeRadii`, `cb.markDirty`) が slider 操作で確実に呼ばれていることを確認 (`panel-sections-node-display.ts:73-78` で既に呼ばれているはず)。

  禁止事項:
  - 半径計算を `GraphViewContainer.ts` に新たに足してはいけない (god object policy)。新規 helper が必要なら `src/views/node-radius.ts` のような新ファイルに pure function として抽出。
  - マジックナンバーを inline 記述しない。`RenderThresholds` か `constants.ts` 経由。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
