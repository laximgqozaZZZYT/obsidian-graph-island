# Dead Exports Report (subtask of 1438-dead-exports)

Generated: 2026-04-27T22:10:14.350Z
Source: `npx ts-prune` (post-processed via `node scripts/list-dead-exports.mjs`)
Total dead exports under src/: **434**

## カテゴリ定義

| Cat | 説明 | 対応 |
|-----|------|------|
| A | 安全に削除可: 関数/定数/クラスでプロジェクト内 (src/, tests/) から参照ゼロ | 関数本体ごと削除 |
| B | export解除のみ可: 同ファイル内では使用されているが、外部参照ゼロ (ts-prune `used in module`) | `export` キーワードのみ除去 (関数本体は残す) |
| C | 保留: 型エクスポート / テスト経由参照 / Obsidian API 公開要件 | 触らない |

## Summary

| Category | Count |
|----------|------:|
| A — 削除可          | 110 |
| B — unexport 可     | 301 |
| C — 保留            | 23 |
| **Total**           | **434** |

## Notes / Caveats

- Category B には interface / type alias の export が含まれる (例: `RAFHandle`, `BBoxFace`, `GroupPort` 等)。同ファイル内のみで使う型なら export 解除は安全だが、将来の外部利用を見越して敢えて export している可能性もあるため、個別に判断する。
- Category C のうち `tests/` 経由参照は、テストを書き換えれば削除できる場合もある。ただし「テスト経由でのみ生存している API」として保守工数を温存する判断もありうるので、機械削除しない。
- `src/main.ts` の Obsidian Plugin default export は ts-prune には現れない (Obsidian ランタイムから動的に呼ばれるため)。本リストには登場しない。
- 数値ゆれ (parent task 説明の "111個" vs 実測 110個) は ts-prune の検出粒度や直近のリファクタによる。意味のある差ではない。

## Category A — 安全に削除可 (関数/定数/クラスで参照ゼロ)

| File | Line | Symbol | Category |
|------|-----:|--------|----------|
| `src/constants.ts` | 50 | `VIEW_MODE_GRAPH` | A |
| `src/constants.ts` | 51 | `VIEW_MODE_SUNBURST` | A |
| `src/constants.ts` | 52 | `VIEW_MODE_TIMELINE` | A |
| `src/constants.ts` | 53 | `VIEW_MODE_TREE` | A |
| `src/constants.ts` | 54 | `VIEW_MODE_MATRIX` | A |
| `src/constants.ts` | 395 | `NODE_DECO_BADGE_RADIUS_PX` | A |
| `src/constants.ts` | 397 | `NODE_DECO_BADGE_MAX_COUNT` | A |
| `src/constants.ts` | 399 | `NODE_DECO_BADGE_PAD_FACTOR` | A |
| `src/constants.ts` | 401 | `NODE_DECO_RING_WIDTH` | A |
| `src/constants.ts` | 403 | `NODE_DECO_RING_PAD` | A |
| `src/constants.ts` | 405 | `NODE_DECO_RING_ALPHA` | A |
| `src/constants.ts` | 407 | `NODE_DECO_DASH_SEGMENTS` | A |
| `src/constants.ts` | 409 | `NODE_DECO_DASH_GAP_FRACTION` | A |
| `src/constants.ts` | 411 | `NODE_DECO_HALO_ALPHA_BASE` | A |
| `src/constants.ts` | 413 | `NODE_DECO_HALO_ALPHA_FACTOR` | A |
| `src/constants.ts` | 415 | `NODE_DECO_BOOKMARK_STAR_SPIKES` | A |
| `src/constants.ts` | 466 | `OUTLINE_PAD_MIN` | A |
| `src/constants.ts` | 468 | `OUTLINE_PAD_FACTOR` | A |
| `src/constants.ts` | 470 | `HULL_SAMPLES` | A |
| `src/constants.ts` | 472 | `OVERLAP_RECOMPUTE_FRAMES` | A |
| `src/constants.ts` | 474 | `SIZE_FADE_DIVISOR` | A |
| `src/constants.ts` | 476 | `FILL_ALPHA_BASE` | A |
| `src/constants.ts` | 478 | `FILL_ALPHA_OVERLAP` | A |
| `src/constants.ts` | 480 | `LABEL_COLLISION_MAX_ATTEMPTS` | A |
| `src/constants.ts` | 482 | `STROKE_ALPHA_NO_OVERLAP` | A |
| `src/constants.ts` | 484 | `STROKE_ALPHA_OVERLAP_MIN` | A |
| `src/constants.ts` | 486 | `STROKE_ALPHA_OVERLAP_BASE` | A |
| `src/constants.ts` | 488 | `STROKE_WIDTH_NO_OVERLAP` | A |
| `src/constants.ts` | 490 | `STROKE_WIDTH_OVERLAP_BASE` | A |
| `src/constants.ts` | 492 | `STROKE_WIDTH_OVERLAP_MIN` | A |
| `src/constants.ts` | 494 | `BORDER_OUTER_WIDTH` | A |
| `src/constants.ts` | 496 | `BORDER_OUTER_ALPHA_FACTOR` | A |
| `src/constants.ts` | 498 | `SIZE_FADE_MIN` | A |
| `src/constants.ts` | 500 | `FILL_ALPHA_VISIBILITY_THRESHOLD` | A |
| `src/constants.ts` | 502 | `LABEL_DARKEN_FACTOR` | A |
| `src/constants.ts` | 504 | `LABEL_PILL_PAD_X` | A |
| `src/constants.ts` | 506 | `LABEL_PILL_PAD_Y` | A |
| `src/constants.ts` | 508 | `COLLISION_ESCAPE_MARGIN` | A |
| `src/constants.ts` | 510 | `ZOOM_OUT_THRESHOLD` | A |
| `src/constants.ts` | 735 | `PATHFINDER_COLOR` | A |
| `src/constants.ts` | 737 | `PATHFINDER_COLOR_CSS` | A |
| `src/constants.ts` | 747 | `PATHFINDER_GLOW_STROKE_WIDTH` | A |
| `src/constants.ts` | 749 | `PATHFINDER_SOLID_STROKE_WIDTH` | A |
| `src/constants.ts` | 751 | `PATHFINDER_DOT_RADIUS` | A |
| `src/constants.ts` | 753 | `PATHFINDER_LABEL_FONT_SIZE` | A |
| `src/layouts/cable-tray.ts` | 523 | `findNearestIntersection` | A |
| `src/layouts/cable-tray.ts` | 589 | `cachedFindShortestPath` | A |
| `src/layouts/coordinate-presets.ts` | 237 | `resolveArrangementFromLayout` | A |
| `src/utils/color.ts` | 22 | `adjustBrightness` | A |
| `src/utils/git-status-emit.ts` | 34 | `emitGitStatusShortResult` | A |
| `src/utils/graph-helpers.ts` | 185 | `shiftHue` | A |
| `src/utils/graph-helpers.ts` | 998 | `computeTimelineFilteredIds` | A |
| `src/utils/gvc-helpers.ts` | 103 | `heatmapColor` | A |
| `src/utils/gvc-helpers.ts` | 112 | `COMMUNITY_PALETTE` | A |
| `src/utils/gvc-helpers.ts` | 121 | `findMatchingGroupPreset` | A |
| `src/utils/gvc-helpers.ts` | 139 | `resolveNodeColor` | A |
| `src/utils/node-grouping.ts` | 70 | `groupNodesByTag` | A |
| `src/utils/node-grouping.ts` | 237 | `expandGroup` | A |
| `src/views/animation-controller.ts` | 66 | `cancelAllHandles` | A |
| `src/views/animation-controller.ts` | 88 | `fadeNodeAlphaCancellable` | A |
| `src/views/CableTrayRenderer.ts` | 151 | `HIGHLIGHT_CABLE_TRUNK_WIDTH` | A |
| `src/views/CableTrayRenderer.ts` | 152 | `CABLE_FAN_CROWD_THRESHOLD` | A |
| `src/views/CableTrayRenderer.ts` | 153 | `CABLE_FAN_CROWD_MIN_FRACTION` | A |
| `src/views/CableTrayRenderer.ts` | 158 | `MAX_CONDUIT_WIDTH` | A |
| `src/views/CableTrayRenderer.ts` | 302 | `computeCablePath` | A |
| `src/views/EdgeRenderer.ts` | 674 | `findPerimeterBranchPoint` | A |
| `src/views/export-orchestrator.ts` | 132 | `orchestrateSvgExport` | A |
| `src/views/export/ExportOrchestrator.ts` | 104 | `buildSvgExportArgs` | A |
| `src/views/export/ExportOrchestrator.ts` | 143 | `buildPngExportArgs` | A |
| `src/views/export/ExportOrchestrator.ts` | 170 | `buildPresetJson` | A |
| `src/views/export/ExportOrchestrator.ts` | 209 | `safeExport` | A |
| `src/views/ExportManager.ts` | 90 | `exportPng` | A |
| `src/views/ExportManager.ts` | 108 | `exportFullGraph` | A |
| `src/views/group-label-manager.ts` | 630 | `parseGroupByFields` | A |
| `src/views/LabelManager.ts` | 634 | `computePriorityScores` | A |
| `src/views/LabelManager.ts` | 763 | `selectLabelMode` | A |
| `src/views/LayoutTransition.ts` | 116 | `LAYOUT_TRANSITION_DURATION_MS` | A |
| `src/views/LayoutTransition.ts` | 117 | `LAYOUT_LARGE_GRAPH_THRESHOLD` | A |
| `src/views/panel-helpers.ts` | 3 | `setPanelValue` | A |
| `src/views/panel-helpers.ts` | 7 | `getPanelValue` | A |
| `src/views/panel-sections-filter-logic.ts` | 186 | `countActiveHoverHighlights` | A |
| `src/views/panel-sections-filter.ts` | 49 | `buildBookmarkSection` | A |
| `src/views/panel-sections-filter.ts` | 206 | `buildNodeDecorationSection` | A |
| `src/views/panel-sections-filter.ts` | 324 | `buildStructureAnalysisSection` | A |
| `src/views/panel-sections-filter.ts` | 438 | `buildDiscoverySection` | A |
| `src/views/panel-sections-filter.ts` | 522 | `buildInteractionSection` | A |
| `src/views/panel-sections-filter.ts` | 872 | `buildRenderThresholdsSection` | A |
| `src/views/panel-sections-layout.ts` | 89 | `buildGraphSyncSection` | A |
| `src/views/panel-sections-layout.ts` | 141 | `buildPluginSettingsSection` | A |
| `src/views/panel-sections-layout.ts` | 283 | `buildCustomMappingsSection` | A |
| `src/views/panel-sections-layout.ts` | 557 | `buildTimelineControls` | A |
| `src/views/panel-sections-layout.ts` | 776 | `buildForceParameters` | A |
| `src/views/panel-sections-layout.ts` | 857 | `buildClusterGroupRules` | A |
| `src/views/PanelBuilder.ts` | 1719 | `axisSourceToString` | A |
| `src/views/PanelBuilder.ts` | 1719 | `parseAxisSourceString` | A |
| `src/views/render-pipeline-utils.ts` | 145 | `computeTimelineFilteredSet` | A |
| `src/views/SearchOrchestrator.ts` | 62 | `parseHopFilters` | A |
| `src/views/SearchOrchestrator.ts` | 86 | `computeHopSet` | A |
| `src/views/SearchOrchestrator.ts` | 140 | `filterBySearchExpr` | A |
| `src/views/SearchOrchestrator.ts` | 190 | `countSearchMatches` | A |
| `src/views/SearchOrchestrator.ts` | 217 | `expandLocalGraphNeighbors` | A |
| `src/views/SearchOrchestrator.ts` | 260 | `capNodesByDegree` | A |
| `src/views/SearchOrchestrator.ts` | 296 | `buildRichStatus` | A |
| `src/views/SearchOrchestrator.ts` | 343 | `computePathfinderBFS` | A |
| `src/views/SearchOrchestrator.ts` | 404 | `computeEntropyScores` | A |
| `src/views/SearchOrchestrator.ts` | 435 | `computeCardHaloGeometry` | A |
| `src/views/snapshot/GraphSnapshot.ts` | 52 | `restoreState` | A |
| `src/views/SnapshotManager.ts` | 48 | `showSnapshotMenu` | A |
| `src/views/SnapshotManager.ts` | 291 | `createAutoSnapshot` | A |
| `src/views/webgl/shaders.ts` | 124 | `ShaderCache` | A |

## Category B — export解除のみ可 (同ファイル内では使用、外部参照ゼロ)

| File | Line | Symbol | Category |
|------|-----:|--------|----------|
| `src/analysis/graph-analysis.ts` | 67 | `countConnectedComponents` | B |
| `src/layouts/cable-tray.ts` | 326 | `findShortestPath` | B |
| `src/layouts/cable-tray.ts` | 380 | `pathToWaypoints` | B |
| `src/layouts/cluster-force.ts` | 945 | `getSpacing` | B |
| `src/layouts/cluster-force.ts` | 952 | `computeGroupGap` | B |
| `src/layouts/cluster-force.ts` | 960 | `pairwiseGap` | B |
| `src/layouts/cluster-force.ts` | 973 | `estimateLabelExtent` | B |
| `src/layouts/cluster-force.ts` | 1052 | `ArrangementParams` | B |
| `src/layouts/cluster-force.ts` | 1538 | `computeEffectiveColumnSpacing` | B |
| `src/layouts/cluster-force.ts` | 2294 | `estimateGroupRadius` | B |
| `src/layouts/cluster-force.ts` | 2356 | `partitionNodes` | B |
| `src/layouts/cluster-force.ts` | 2452 | `backlinkBucket` | B |
| `src/layouts/cluster-force.ts` | 2753 | `concentricOffsets` | B |
| `src/layouts/cluster-force.ts` | 2863 | `gridOffsets` | B |
| `src/layouts/cluster-force.ts` | 2914 | `triangleOffsets` | B |
| `src/layouts/cluster-force.ts` | 3091 | `randomOffsets` | B |
| `src/layouts/cluster-force.ts` | 3171 | `estimateLabelWidth` | B |
| `src/layouts/coordinate-engine.ts` | 398 | `resolveAxisValues` | B |
| `src/layouts/coordinate-engine.ts` | 648 | `applyTransform` | B |
| `src/layouts/coordinate-engine.ts` | 729 | `toCartesian` | B |
| `src/layouts/coordinate-engine.ts` | 1080 | `resolveAxisCategories` | B |
| `src/layouts/coordinate-engine.ts` | 1322 | `formatGridValue` | B |
| `src/layouts/ego-sector.ts` | 41 | `classifyEgoNeighbors` | B |
| `src/layouts/road-network-metrics.ts` | 13 | `pointToSegmentDist` | B |
| `src/layouts/sunburst.ts` | 128 | `collectFilePaths` | B |
| `src/layouts/sunburst.ts` | 140 | `countDirectChildren` | B |
| `src/layouts/sunburst.ts` | 149 | `buildSunburstFromGraphNodes` | B |
| `src/layouts/sunburst.ts` | 208 | `getGroupingPath` | B |
| `src/layouts/sunburst.ts` | 233 | `computeSunburstArcs` | B |
| `src/layouts/sunburst.ts` | 269 | `assignValues` | B |
| `src/layouts/sunburst.ts` | 282 | `maxDepth` | B |
| `src/layouts/timeline-layout.ts` | 211 | `timelinePartitionNodes` | B |
| `src/layouts/timeline-layout.ts` | 280 | `timelineSortAndBuildSteps` | B |
| `src/layouts/timeline-layout.ts` | 306 | `timelineComputeSpacing` | B |
| `src/layouts/timeline-layout.ts` | 329 | `timelinePlaceTimedNodes` | B |
| `src/layouts/timeline-layout.ts` | 393 | `timelineAlignHierarchy` | B |
| `src/layouts/timeline-layout.ts` | 429 | `timelinePlaceUntimedNodes` | B |
| `src/layouts/timeline-layout.ts` | 451 | `timelineCenterOffsets` | B |
| `src/layouts/timeline-layout.ts` | 537 | `timelineAssignBarLanes` | B |
| `src/layouts/timeline-layout.ts` | 603 | `timelineEnforceColumnGaps` | B |
| `src/layouts/timeline-layout.ts` | 644 | `timelineRecenterY` | B |
| `src/layouts/timeline-layout.ts` | 663 | `timelineBuildSequenceEdges` | B |
| `src/layouts/timeline-layout.ts` | 754 | `buildLinkChainOrder` | B |
| `src/layouts/timeline-layout.ts` | 820 | `buildHierarchyOrder` | B |
| `src/layouts/timeline-layout.ts` | 889 | `resolveTimeKey` | B |
| `src/layouts/timeline.ts` | 60 | `defaultTimeComparator` | B |
| `src/layouts/timeline.ts` | 68 | `buildTimelineDAG` | B |
| `src/layouts/timeline.ts` | 83 | `assignLanes` | B |
| `src/obsidian-internals.ts` | 105 | `ObsidianSearchView` | B |
| `src/parsers/metadata-parser.ts` | 33 | `classifyRelation` | B |
| `src/parsers/metadata-parser.ts` | 463 | `collectAllTags` | B |
| `src/parsers/metadata-parser.ts` | 658 | `simpleHash` | B |
| `src/parsers/metadata-parser.ts` | 727 | `parseInlineRelationLinksRaw` | B |
| `src/parsers/metadata-parser.ts` | 771 | `defineLazyMeta` | B |
| `src/parsers/metadata-parser.ts` | 793 | `snapshotMeta` | B |
| `src/parsers/metadata-parser.ts` | 828 | `extractBodyInfo` | B |
| `src/settings.ts` | 139 | `HELP` | B |
| `src/settings.ts` | 139 | `HelpModal` | B |
| `src/settings.ts` | 140 | `HelpEntry` | B |
| `src/utils/color.ts` | 32 | `wcagRelativeLuminance` | B |
| `src/utils/git-status-emit.ts` | 8 | `GitStatusShortEmitInput` | B |
| `src/utils/git-status-emit.ts` | 14 | `assertGitStatusShortInput` | B |
| `src/utils/git-status-emit.ts` | 23 | `buildGitStatusShortResult` | B |
| `src/utils/git-status-formatter.ts` | 1 | `GitStatusShortResultStatus` | B |
| `src/utils/graph-filter.ts` | 14 | `filterOrphans` | B |
| `src/utils/graph-filter.ts` | 43 | `filterAttachments` | B |
| `src/utils/graph-filter.ts` | 54 | `filterTagNodes` | B |
| `src/utils/graph-filter.ts` | 62 | `filterSimilarEdges` | B |
| `src/utils/graph-filter.ts` | 67 | `filterNamedRelationEdges` | B |
| `src/utils/graph-helpers.ts` | 136 | `bfsShortestPath` | B |
| `src/utils/graph-helpers.ts` | 435 | `buildPositionMap` | B |
| `src/utils/graph-helpers.ts` | 446 | `computeSvgViewBox` | B |
| `src/utils/graph-helpers.ts` | 478 | `nodeColorHex` | B |
| `src/utils/graph-helpers.ts` | 862 | `computeAutoFitBoundsTrimmed` | B |
| `src/utils/graph-helpers.ts` | 905 | `autoFitVisibleThreshold` | B |
| `src/utils/gvc-helpers.ts` | 16 | `deriveOneRule` | B |
| `src/utils/louvain.ts` | 11 | `LouvainEdge` | B |
| `src/utils/node-grouping.ts` | 43 | `resolveFrontmatterField` | B |
| `src/utils/node-grouping.ts` | 56 | `pickLargestGroup` | B |
| `src/utils/snapshot.ts` | 17 | `fnv1a` | B |
| `src/utils/snapshot.ts` | 44 | `hashMeta` | B |
| `src/utils/snapshot.ts` | 92 | `edgeKey` | B |
| `src/utils/tooltip-position.ts` | 56 | `tooltipNeedsFlip` | B |
| `src/utils/tooltip-position.ts` | 84 | `computeFlippedOffset` | B |
| `src/views/animation-controller.ts` | 13 | `RAFHandle` | B |
| `src/views/animation-controller.ts` | 17 | `RAFApi` | B |
| `src/views/animation-controller.ts` | 35 | `startCancellableRAF` | B |
| `src/views/animation-controller.ts` | 75 | `FadeableNode` | B |
| `src/views/CableTrayRenderer.ts` | 37 | `BBoxFace` | B |
| `src/views/CableTrayRenderer.ts` | 162 | `DEFAULT_CLUSTER_RADIUS` | B |
| `src/views/CableTrayRenderer.ts` | 185 | `buildManhattanPath` | B |
| `src/views/CableTrayRenderer.ts` | 208 | `buildHorizontalTrunkPath` | B |
| `src/views/CableTrayRenderer.ts` | 223 | `buildVerticalTrunkPath` | B |
| `src/views/CableTrayRenderer.ts` | 241 | `buildPolarTrunkPath` | B |
| `src/views/CableTrayRenderer.ts` | 410 | `computePolarJunctionGrid` | B |
| `src/views/CableTrayRenderer.ts` | 488 | `filterPolarGridForPort` | B |
| `src/views/CableTrayRenderer.ts` | 566 | `routeViaPolarGrid` | B |
| `src/views/CableTrayRenderer.ts` | 629 | `computeRadialPort` | B |
| `src/views/CableTrayRenderer.ts` | 654 | `estimateNodeSpacingMargin` | B |
| `src/views/canvas2d/CanvasContainer.ts` | 5 | `CanvasChild` | B |
| `src/views/canvas2d/interfaces.ts` | 22 | `IScale` | B |
| `src/views/canvas2d/interfaces.ts` | 32 | `IChild` | B |
| `src/views/canvas2d/interfaces.ts` | 112 | `IAnchor` | B |
| `src/views/card-renderer.ts` | 35 | `isCardText` | B |
| `src/views/card-renderer.ts` | 40 | `markAsCardText` | B |
| `src/views/card-renderer.ts` | 73 | `CARD_ICON` | B |
| `src/views/card-renderer.ts` | 85 | `wrapTextToLines` | B |
| `src/views/card-renderer.ts` | 102 | `PLAIN_CARD` | B |
| `src/views/card-renderer.ts` | 405 | `estimateBodyLineCount` | B |
| `src/views/coord-panel.ts` | 22 | `evalSource` | B |
| `src/views/coord-panel.ts` | 63 | `evalTransform` | B |
| `src/views/coord-panel.ts` | 119 | `plotCurve` | B |
| `src/views/coord-panel.ts` | 670 | `syncUserVarsFromLayout` | B |
| `src/views/DiffOverlay.ts` | 490 | `layoutGhostNodes` | B |
| `src/views/DiffOverlay.ts` | 517 | `ghostLabel` | B |
| `src/views/donut-renderer.ts` | 17 | `RING_STROKE_DARKEN` | B |
| `src/views/donut-renderer.ts` | 19 | `RING_STROKE_ALPHA` | B |
| `src/views/donut-renderer.ts` | 21 | `SUNBURST_SEGMENT_ARC_DEG` | B |
| `src/views/donut-renderer.ts` | 82 | `renderDonutBreakdown` | B |
| `src/views/EdgeLabelRenderer.ts` | 30 | `EDGE_LABEL_BG_ALPHA` | B |
| `src/views/EdgeLabelRenderer.ts` | 30 | `EDGE_LABEL_FONT_SIZE_DEFAULT` | B |
| `src/views/EdgeLabelRenderer.ts` | 30 | `MAX_EDGE_LABELS` | B |
| `src/views/EdgeLabelRenderer.ts` | 43 | `a11yEdgeLabelFill` | B |
| `src/views/EdgeLabelRenderer.ts` | 53 | `getEdgeLabel` | B |
| `src/views/EdgeLabelRenderer.ts` | 78 | `collectLabelableEdges` | B |
| `src/views/EdgeLabelRenderer.ts` | 91 | `trimLabelsByDegree` | B |
| `src/views/EdgeLabelRenderer.ts` | 112 | `seedNodeRects` | B |
| `src/views/EdgeLabelRenderer.ts` | 135 | `computeLabelPosition` | B |
| `src/views/EdgeRenderer.ts` | 70 | `STRUCTURAL_EDGE_ALPHA` | B |
| `src/views/EdgeRenderer.ts` | 71 | `NON_STRUCTURAL_EDGE_ALPHA` | B |
| `src/views/EdgeRenderer.ts` | 72 | `DEFAULT_LINE_THICKNESS` | B |
| `src/views/EdgeRenderer.ts` | 75 | `RELATION_COLOR_ALPHA` | B |
| `src/views/EdgeRenderer.ts` | 76 | `HIGHLIGHT_THICKNESS_MULTIPLIER` | B |
| `src/views/EdgeRenderer.ts` | 77 | `DENSITY_FULL_ALPHA_THRESHOLD` | B |
| `src/views/EdgeRenderer.ts` | 78 | `DENSITY_GENTLE_THRESHOLD` | B |
| `src/views/EdgeRenderer.ts` | 79 | `DENSITY_AGGRESSIVE_THRESHOLD` | B |
| `src/views/EdgeRenderer.ts` | 80 | `DENSITY_MIN_ALPHA` | B |
| `src/views/EdgeRenderer.ts` | 81 | `ZOOM_FADE_THRESHOLD` | B |
| `src/views/EdgeRenderer.ts` | 82 | `ZOOM_FADE_MIN_ALPHA` | B |
| `src/views/EdgeRenderer.ts` | 83 | `DEFAULT_DENSITY_FLOOR` | B |
| `src/views/EdgeRenderer.ts` | 118 | `GroupPort` | B |
| `src/views/EdgeRenderer.ts` | 119 | `Trunk` | B |
| `src/views/EdgeRenderer.ts` | 120 | `TrunkCable` | B |
| `src/views/EdgeRenderer.ts` | 121 | `NodePort` | B |
| `src/views/EdgeRenderer.ts` | 122 | `IntraGroupCable` | B |
| `src/views/EdgeRenderer.ts` | 123 | `CableRouteOpts` | B |
| `src/views/EdgeRenderer.ts` | 124 | `GroupPerimInfo` | B |
| `src/views/EdgeRenderer.ts` | 125 | `PolarJunctionGrid` | B |
| `src/views/EdgeRenderer.ts` | 126 | `PortLaneInfo` | B |
| `src/views/EdgeRenderer.ts` | 127 | `PortColorLanes` | B |
| `src/views/EdgeRenderer.ts` | 128 | `CablePrepResult` | B |
| `src/views/EdgeRenderer.ts` | 300 | `buildBidirectionalSet` | B |
| `src/views/EdgeRenderer.ts` | 335 | `defaultColor` | B |
| `src/views/EdgeRenderer.ts` | 349 | `EDGE_TYPE_SPECS` | B |
| `src/views/EdgeRenderer.ts` | 371 | `EDGE_TYPE_FALLBACK_COLORS` | B |
| `src/views/EdgeRenderer.ts` | 421 | `normalizeAngle` | B |
| `src/views/EdgeRenderer.ts` | 497 | `isOntologyEdge` | B |
| `src/views/EdgeRenderer.ts` | 848 | `findGapBetween` | B |
| `src/views/EdgeRenderer.ts` | 879 | `pushSrcEntry` | B |
| `src/views/EdgeRenderer.ts` | 884 | `pushTgtExit` | B |
| `src/views/EdgeRenderer.ts` | 889 | `computeJunctionWaypoints` | B |
| `src/views/EdgeRenderer.ts` | 1654 | `resolveEdgeStyle` | B |
| `src/views/EdgeRenderer.ts` | 1721 | `getDashPattern` | B |
| `src/views/EdgeRenderer.ts` | 1944 | `computeDensityScale` | B |
| `src/views/EdgeRenderer.ts` | 1974 | `buildPairCounts` | B |
| `src/views/EnclosureRenderer.ts` | 628 | `drawSmoothHull` | B |
| `src/views/EnclosureRenderer.ts` | 637 | `drawCapsule` | B |
| `src/views/EnclosureRenderer.ts` | 674 | `filterOutliers` | B |
| `src/views/export-orchestrator.ts` | 32 | `SvgExportOverrides` | B |
| `src/views/export-orchestrator.ts` | 41 | `ResolvedSvgExportOptions` | B |
| `src/views/export-orchestrator.ts` | 50 | `DEFAULT_SVG_EXPORT_OPTIONS` | B |
| `src/views/export-orchestrator.ts` | 61 | `resolveSvgExportOptions` | B |
| `src/views/export-orchestrator.ts` | 78 | `buildExportTimestamp` | B |
| `src/views/export-orchestrator.ts` | 86 | `buildExportFilename` | B |
| `src/views/export-orchestrator.ts` | 102 | `ExportCounts` | B |
| `src/views/export-orchestrator.ts` | 110 | `resolveExportCounts` | B |
| `src/views/export-orchestrator.ts` | 122 | `ExportOrchestratorHost` | B |
| `src/views/export/ExportOrchestrator.ts` | 32 | `exportGraphSVG` | B |
| `src/views/export/ExportOrchestrator.ts` | 38 | `SvgExportGraph` | B |
| `src/views/export/ExportOrchestrator.ts` | 43 | `SvgExportSettings` | B |
| `src/views/export/ExportOrchestrator.ts` | 50 | `SvgExportViewState` | B |
| `src/views/export/ExportOrchestrator.ts` | 58 | `SvgExportArgs` | B |
| `src/views/export/ExportOrchestrator.ts` | 71 | `PngExportCanvasLike` | B |
| `src/views/export/ExportOrchestrator.ts` | 76 | `PngExportSettings` | B |
| `src/views/export/ExportOrchestrator.ts` | 81 | `PngExportArgs` | B |
| `src/views/export/ExportOrchestrator.ts` | 88 | `PresetMetadata` | B |
| `src/views/export/ExportOrchestrator.ts` | 202 | `SafeExportResult` | B |
| `src/views/GraphViewContainer.ts` | 305 | `PixiNode` | B |
| `src/views/group-label-manager.ts` | 67 | `AggregateHitRegion` | B |
| `src/views/GuideRenderer.ts` | 41 | `findCellIndex` | B |
| `src/views/hover-helpers.ts` | 13 | `HoverTooltipInput` | B |
| `src/views/hover-helpers.ts` | 22 | `HoverTooltipOptions` | B |
| `src/views/inertia-pan.ts` | 1 | `FRICTION` | B |
| `src/views/InteractionManager.ts` | 201 | `ZOOM_IN_FACTOR` | B |
| `src/views/InteractionManager.ts` | 202 | `ZOOM_OUT_FACTOR` | B |
| `src/views/InteractionManager.ts` | 205 | `ZOOM_SCALE_MIN` | B |
| `src/views/InteractionManager.ts` | 206 | `ZOOM_SCALE_MAX` | B |
| `src/views/InteractionManager.ts` | 216 | `computeZoomFactor` | B |
| `src/views/InteractionManager.ts` | 226 | `clampScale` | B |
| `src/views/LabelManager.ts` | 687 | `extractInitials` | B |
| `src/views/LabelManager.ts` | 705 | `estimateTextWidth` | B |
| `src/views/LabelManager.ts` | 718 | `computeRotatedAABB` | B |
| `src/views/LabelManager.ts` | 735 | `smartTruncateLabel` | B |
| `src/views/layout-compute.ts` | 164 | `detectTimeKey` | B |
| `src/views/layout-compute.ts` | 187 | `buildTimelineBars` | B |
| `src/views/layout-compute.ts` | 218 | `resolveBarOverlaps` | B |
| `src/views/layout-compute.ts` | 237 | `computeWorkGroupRanges` | B |
| `src/views/LayoutController.ts` | 43 | `resolveGroupLayoutMode` | B |
| `src/views/LayoutTransition.ts` | 111 | `easeInOutCubic` | B |
| `src/views/matrix-renderer.ts` | 58 | `buildMatrixData` | B |
| `src/views/matrix-renderer.ts` | 123 | `matrixNodeLabel` | B |
| `src/views/node-coloring.ts` | 15 | `COMMUNITY_PALETTE` | B |
| `src/views/NodeComparisonView.ts` | 36 | `bfsShortestPath` | B |
| `src/views/NodeComparisonView.ts` | 69 | `classifyNeighbors` | B |
| `src/views/NodeComparisonView.ts` | 90 | `classifyTags` | B |
| `src/views/NodeComparisonView.ts` | 110 | `computeComparison` | B |
| `src/views/panel-defaults.ts` | 28 | `DEFAULT_FILTER_STATE` | B |
| `src/views/panel-defaults.ts` | 59 | `DEFAULT_DISPLAY_STATE` | B |
| `src/views/panel-defaults.ts` | 170 | `DEFAULT_LAYOUT_STATE` | B |
| `src/views/panel-defaults.ts` | 206 | `DEFAULT_TOOLBAR_STATE` | B |
| `src/views/panel-sections-filter-logic.ts` | 42 | `CardPreset` | B |
| `src/views/panel-sections-filter-logic.ts` | 166 | `HoverHighlightTypes` | B |
| `src/views/panel-sections-filter-logic.ts` | 173 | `DEFAULT_HOVER_HIGHLIGHT_TYPES` | B |
| `src/views/panel-sections-layout.ts` | 46 | `getPreset` | B |
| `src/views/panel-sections-nodes-tab.ts` | 230 | `buildNodesStatsSection` | B |
| `src/views/panel-sections-nodes-tab.ts` | 247 | `buildNodesDegreeSection` | B |
| `src/views/panel-sections-nodes-tab.ts` | 256 | `buildNodesFilterSection` | B |
| `src/views/panel-sections-nodes-tab.ts` | 290 | `buildNodesTreeSection` | B |
| `src/views/panel-sections-nodes-tab.ts` | 359 | `buildNodesLegendSection` | B |
| `src/views/panel-widgets.ts` | 18 | `updateSliderProgress` | B |
| `src/views/panel-widgets.ts` | 244 | `getGroupByOptions` | B |
| `src/views/panel-widgets.ts` | 400 | `parseGroupByRules` | B |
| `src/views/panel-widgets.ts` | 423 | `deriveClusterRulesFromGroupBy` | B |
| `src/views/panel-widgets.ts` | 432 | `serializeGroupByRules` | B |
| `src/views/panel-widgets.ts` | 707 | `getQueryOptions` | B |
| `src/views/panel-widgets.ts` | 750 | `resolvePrefix` | B |
| `src/views/panel-widgets.ts` | 761 | `parseActiveToken` | B |
| `src/views/panel-widgets.ts` | 882 | `_insertTextAtCursor` | B |
| `src/views/panel-widgets.ts` | 896 | `_replaceTokenAtPosition` | B |
| `src/views/panel-widgets.ts` | 909 | `_updateHintSelection` | B |
| `src/views/panel-widgets.ts` | 917 | `_buildQueryHintContainer` | B |
| `src/views/panel-widgets.ts` | 1285 | `renderGroupList` | B |
| `src/views/panel-widgets.ts` | 1327 | `getSortKeyOptions` | B |
| `src/views/panel-widgets.ts` | 1552 | `getGravityDirOptions` | B |
| `src/views/panel-widgets.ts` | 1563 | `angleToPreset` | B |
| `src/views/panel-widgets.ts` | 1745 | `renderNodeRuleList` | B |
| `src/views/pathfinder-overlay.ts` | 16 | `PATHFINDER_PULSE_SPEED` | B |
| `src/views/pathfinder-overlay.ts` | 17 | `PATHFINDER_PULSE_AMPLITUDE` | B |
| `src/views/pathfinder-overlay.ts` | 18 | `PATHFINDER_GLOW_ALPHA_BASE` | B |
| `src/views/pathfinder-overlay.ts` | 19 | `PATHFINDER_SOLID_ALPHA_BASE` | B |
| `src/views/pathfinder-overlay.ts` | 20 | `PATHFINDER_LABEL_OFFSET_X` | B |
| `src/views/pathfinder-overlay.ts` | 21 | `PATHFINDER_LABEL_OFFSET_Y` | B |
| `src/views/pathfinder-overlay.ts` | 57 | `computePathfinderPulse` | B |
| `src/views/pathfinder-overlay.ts` | 70 | `buildPathSegments` | B |
| `src/views/renderer-factory.ts` | 19 | `detectBackend` | B |
| `src/views/RenderHelpers.ts` | 36 | `setFrontmatterField` | B |
| `src/views/RenderHelpers.ts` | 39 | `addFrontmatterTag` | B |
| `src/views/RenderHelpers.ts` | 49 | `generatePhantomNodes` | B |
| `src/views/RenderPipeline.ts` | 57 | `lightenColor` | B |
| `src/views/RenderPipeline.ts` | 58 | `blendColors` | B |
| `src/views/RenderPipeline.ts` | 59 | `desaturateColor` | B |
| `src/views/RenderPipeline.ts` | 60 | `computeGlowParams` | B |
| `src/views/RenderPipeline.ts` | 61 | `computeLabelColors` | B |
| `src/views/RenderPipeline.ts` | 62 | `isDensityTooClose` | B |
| `src/views/RenderPipeline.ts` | 63 | `computeZonePlacementFromAngles` | B |
| `src/views/RenderPipeline.ts` | 64 | `GLOW_ATTENUATE_THRESHOLD` | B |
| `src/views/RenderPipeline.ts` | 65 | `GLOW_ATTENUATE_RANGE` | B |
| `src/views/RenderPipeline.ts` | 66 | `GLOW_RADIUS_ATTENUATE_FACTOR` | B |
| `src/views/RenderPipeline.ts` | 67 | `GLOW_P90_FRACTION` | B |
| `src/views/RenderPipeline.ts` | 68 | `LABEL_Y_OFFSET_FACTOR` | B |
| `src/views/RenderPipeline.ts` | 128 | `computeZoomFadeAlpha` | B |
| `src/views/RenderPipeline.ts` | 145 | `computeLodLevel` | B |
| `src/views/RenderPipeline.ts` | 171 | `computeDensityScale` | B |
| `src/views/RenderPipeline.ts` | 187 | `computeDensityMinDist` | B |
| `src/views/RenderPipeline.ts` | 200 | `generateDisplacementOffsets` | B |
| `src/views/RenderPipeline.ts` | 379 | `quickSelect` | B |
| `src/views/SearchOrchestrator.ts` | 177 | `classifySearchMatch` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 13 | `AUTO_SNAP_PREFIX` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 16 | `AUTO_SNAP_MAX` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 19 | `SnapshotContext` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 26 | `RestoredSnapshotState` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 39 | `serializeState` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 72 | `buildAutoSnapshotName` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 80 | `pruneAutoSnapshots` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 99 | `appendAutoSnapshot` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 117 | `AutoSnapshotHost` | B |
| `src/views/snapshot/GraphSnapshot.ts` | 136 | `TimerHooks` | B |
| `src/views/SnapshotManager.ts` | 17 | `SnapshotHost` | B |
| `src/views/SnapshotManager.ts` | 111 | `saveSnapshot` | B |
| `src/views/SnapshotManager.ts` | 147 | `compareWithSnapshot` | B |
| `src/views/SnapshotManager.ts` | 173 | `deleteSnapshot` | B |
| `src/views/SnapshotManager.ts` | 185 | `showSnapshotTimeline` | B |
| `src/views/SnapshotManager.ts` | 276 | `clearDiffOverlay` | B |
| `src/views/SnapshotManager.ts` | 287 | `AUTO_SNAP_PREFIX` | B |
| `src/views/SnapshotManager.ts` | 288 | `AUTO_SNAP_MAX` | B |
| `src/views/timeline-bar-renderer.ts` | 16 | `TimelineBarHost` | B |
| `src/views/webgl/buffer-pool.ts` | 5 | `BufferHandle` | B |
| `src/views/webgl/mat3.ts` | 54 | `mat3MultiplyInto` | B |
| `src/views/webgl/shaders.ts` | 62 | `compileShader` | B |
| `src/views/webgl/shaders.ts` | 79 | `createProgram` | B |
| `src/views/webgl/WebGLApp.ts` | 31 | `WebGLAppOptions` | B |

## Category C — 保留 (型エクスポート/テスト経由参照/Obsidian API公開要件)

| File | Line | Symbol | Category |
|------|-----:|--------|----------|
| `src/i18n.ts` | 2057 | `_getTranslationKeys` | C |
| `src/layouts/coordinate-presets.ts` | 278 | `isExactPreset` | C |
| `src/layouts/road-network-metrics.ts` | 28 | `pointToNearestRoad` | C |
| `src/layouts/tree.ts` | 21 | `applyTreeLayout` | C |
| `src/utils/color.ts` | 16 | `hexBrightness` | C |
| `src/utils/graph-helpers.ts` | 578 | `truncateBreadcrumb` | C |
| `src/utils/timer-registry.ts` | 10 | `TimerRegistry` | C |
| `src/utils/transform-expr.ts` | 356 | `getTransformExprSuggestions` | C |
| `src/views/coord-panel.ts` | 784 | `axisSourceToString` | C |
| `src/views/coord-panel.ts` | 784 | `parseAxisSourceString` | C |
| `src/views/EdgeRenderer.ts` | 508 | `classifyEdgePort` | C |
| `src/views/EdgeRenderer.ts` | 516 | `portLaneKey` | C |
| `src/views/inertia-pan.ts` | 12 | `InertiaPan` | C |
| `src/views/pan-inertia-controller.ts` | 1 | `PanInertiaController` | C |
| `src/views/panel-sections.ts` | 243 | `buildNodeDisplaySection` | C |
| `src/views/panel-sections.ts` | 382 | `buildEdgeDisplaySection` | C |
| `src/views/panel-sections.ts` | 940 | `buildNodesTab` | C |
| `src/views/panel-widgets.ts` | 347 | `addMultiValueInput` | C |
| `src/views/soft-render.ts` | 18 | `applySoftRender` | C |
| `src/views/webgl/buffer-pool.ts` | 14 | `BufferPool` | C |
| `src/views/webgl/mat3.ts` | 16 | `mat3Identity` | C |
| `src/views/webgl/mat3.ts` | 25 | `mat3Translate` | C |
| `src/views/webgl/mat3.ts` | 36 | `mat3Scale` | C |

## 再現手順

```bash
# 1. 中間データを生成
node scripts/list-dead-exports.mjs   # → tmp/dead-exports-report.md (A/B/C/D ラベル)
# 2. このレポートはその出力を本タスク向けに再カテゴライズしたもの。
#    ts-prune を直接実行する場合:
npx ts-prune                          # 全 export の dead 列挙 (used in module マーカー含む)
```
