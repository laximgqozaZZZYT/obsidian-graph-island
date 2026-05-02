## Description (subtask of 1597-dead-exports)

Category C で以下 3 ファイルに固まっている未使用 export を削除。

  src/views/panel-state-setter.ts (22 件):
  setPanelField, asNodeShape, asNodeColorMode, asEdgeDirectionFilter,
  asNodeDisplayMode, asImportanceMetric, asClusterLabelDetail,
  asAnalysisOverlay, asCableBundleMode, asLabelModeOverride,
  asEnclosureLabelPosition, asClusterArrangement, asClusterGroupArrangement,
  asCoordinateSystem, asGridStyle, asGridLabelPlacement, asCardPreset,
  asHeaderStyle, asFieldFormat, setEdgeTypeFlag, getEdgeTypeFlag,
  asHoverEdgeTypeKey, setHoverEdgeTypeFlag, getHoverEdgeTypeFlag
  (line 166 の `readonly` / `satisfies` は ts-prune の誤検出なので除外)

  src/views/SearchOrchestrator.ts (10 件):
  parseHopFilters, computeHopSet, filterBySearchExpr, countSearchMatches,
  expandLocalGraphNeighbors, capNodesByDegree, buildRichStatus,
  computePathfinderBFS, computeEntropyScores, computeCardHaloGeometry

  src/views/panel-sections-filter.ts (6 件):
  buildBookmarkSection, buildNodeDecorationSection,
  buildStructureAnalysisSection, buildDiscoverySection,
  buildInteractionSection, buildRenderThresholdsSection

  手順:
  1. 各シンボルについて `grep -rn "<NAME>" src/ tests/` で参照ゼロを確認
  2. クラスメソッドの場合は呼び出し元がいないか確認 (private 化ではなく、
     完全に呼ばれていない場合のみ削除)
  3. 参照があるものはスキップしコミットメッセージに記録
  4. `pnpm build && pnpm test && pnpm lint && node scripts/check-dead-exports.mjs`
     をすべて green にしてコミット

  注: GraphViewContainer.ts などの GOD OBJECT を肥大化させない。
  削除対象ファイルのみ編集する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
