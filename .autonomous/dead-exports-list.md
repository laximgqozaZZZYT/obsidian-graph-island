# Dead Exports List

Generated: 2026-04-27T19:57:27.871Z
Source: `npx ts-prune` under `src/`, excluding `(used in module)` entries.
Total entries: **133** across 40 files.

Format: `` `<path>:<line>:<col>` `<exportName>` [<kind>] ``  (kind ∈ type/const/function/class/enum/other)

## `src/constants.ts`

- `src/constants.ts:50:14` `VIEW_MODE_GRAPH` [const]
- `src/constants.ts:51:14` `VIEW_MODE_SUNBURST` [const]
- `src/constants.ts:52:14` `VIEW_MODE_TIMELINE` [const]
- `src/constants.ts:53:14` `VIEW_MODE_TREE` [const]
- `src/constants.ts:54:14` `VIEW_MODE_MATRIX` [const]
- `src/constants.ts:395:14` `NODE_DECO_BADGE_RADIUS_PX` [const]
- `src/constants.ts:397:14` `NODE_DECO_BADGE_MAX_COUNT` [const]
- `src/constants.ts:399:14` `NODE_DECO_BADGE_PAD_FACTOR` [const]
- `src/constants.ts:401:14` `NODE_DECO_RING_WIDTH` [const]
- `src/constants.ts:403:14` `NODE_DECO_RING_PAD` [const]
- `src/constants.ts:405:14` `NODE_DECO_RING_ALPHA` [const]
- `src/constants.ts:407:14` `NODE_DECO_DASH_SEGMENTS` [const]
- `src/constants.ts:409:14` `NODE_DECO_DASH_GAP_FRACTION` [const]
- `src/constants.ts:411:14` `NODE_DECO_HALO_ALPHA_BASE` [const]
- `src/constants.ts:413:14` `NODE_DECO_HALO_ALPHA_FACTOR` [const]
- `src/constants.ts:415:14` `NODE_DECO_BOOKMARK_STAR_SPIKES` [const]
- `src/constants.ts:466:14` `OUTLINE_PAD_MIN` [const]
- `src/constants.ts:468:14` `OUTLINE_PAD_FACTOR` [const]
- `src/constants.ts:470:14` `HULL_SAMPLES` [const]
- `src/constants.ts:472:14` `OVERLAP_RECOMPUTE_FRAMES` [const]
- `src/constants.ts:474:14` `SIZE_FADE_DIVISOR` [const]
- `src/constants.ts:476:14` `FILL_ALPHA_BASE` [const]
- `src/constants.ts:478:14` `FILL_ALPHA_OVERLAP` [const]
- `src/constants.ts:480:14` `LABEL_COLLISION_MAX_ATTEMPTS` [const]
- `src/constants.ts:482:14` `STROKE_ALPHA_NO_OVERLAP` [const]
- `src/constants.ts:484:14` `STROKE_ALPHA_OVERLAP_MIN` [const]
- `src/constants.ts:486:14` `STROKE_ALPHA_OVERLAP_BASE` [const]
- `src/constants.ts:488:14` `STROKE_WIDTH_NO_OVERLAP` [const]
- `src/constants.ts:490:14` `STROKE_WIDTH_OVERLAP_BASE` [const]
- `src/constants.ts:492:14` `STROKE_WIDTH_OVERLAP_MIN` [const]
- `src/constants.ts:494:14` `BORDER_OUTER_WIDTH` [const]
- `src/constants.ts:496:14` `BORDER_OUTER_ALPHA_FACTOR` [const]
- `src/constants.ts:498:14` `SIZE_FADE_MIN` [const]
- `src/constants.ts:500:14` `FILL_ALPHA_VISIBILITY_THRESHOLD` [const]
- `src/constants.ts:502:14` `LABEL_DARKEN_FACTOR` [const]
- `src/constants.ts:504:14` `LABEL_PILL_PAD_X` [const]
- `src/constants.ts:506:14` `LABEL_PILL_PAD_Y` [const]
- `src/constants.ts:508:14` `COLLISION_ESCAPE_MARGIN` [const]
- `src/constants.ts:510:14` `ZOOM_OUT_THRESHOLD` [const]
- `src/constants.ts:735:14` `PATHFINDER_COLOR` [const]
- `src/constants.ts:737:14` `PATHFINDER_COLOR_CSS` [const]
- `src/constants.ts:747:14` `PATHFINDER_GLOW_STROKE_WIDTH` [const]
- `src/constants.ts:749:14` `PATHFINDER_SOLID_STROKE_WIDTH` [const]
- `src/constants.ts:751:14` `PATHFINDER_DOT_RADIUS` [const]
- `src/constants.ts:753:14` `PATHFINDER_LABEL_FONT_SIZE` [const]

## `src/i18n.ts`

- `src/i18n.ts:2057:17` `_getTranslationKeys` [function]

## `src/layouts/cable-tray.ts`

- `src/layouts/cable-tray.ts:523:17` `findNearestIntersection` [function]
- `src/layouts/cable-tray.ts:589:17` `cachedFindShortestPath` [function]

## `src/layouts/coordinate-presets.ts`

- `src/layouts/coordinate-presets.ts:237:17` `resolveArrangementFromLayout` [function]
- `src/layouts/coordinate-presets.ts:278:17` `isExactPreset` [function]

## `src/layouts/road-network-metrics.ts`

- `src/layouts/road-network-metrics.ts:28:17` `pointToNearestRoad` [function]

## `src/layouts/tree.ts`

- `src/layouts/tree.ts:21:17` `applyTreeLayout` [function]

## `src/utils/color.ts`

- `src/utils/color.ts:16:17` `hexBrightness` [function]
- `src/utils/color.ts:22:17` `adjustBrightness` [function]

## `src/utils/git-status-emit.ts`

- `src/utils/git-status-emit.ts:34:17` `emitGitStatusShortResult` [function]

## `src/utils/graph-helpers.ts`

- `src/utils/graph-helpers.ts:185:17` `shiftHue` [function]
- `src/utils/graph-helpers.ts:578:17` `truncateBreadcrumb` [function]
- `src/utils/graph-helpers.ts:998:17` `computeTimelineFilteredIds` [function]

## `src/utils/gvc-helpers.ts`

- `src/utils/gvc-helpers.ts:103:17` `heatmapColor` [function]
- `src/utils/gvc-helpers.ts:112:14` `COMMUNITY_PALETTE` [const]
- `src/utils/gvc-helpers.ts:121:17` `findMatchingGroupPreset` [function]
- `src/utils/gvc-helpers.ts:139:17` `resolveNodeColor` [function]

## `src/utils/node-grouping.ts`

- `src/utils/node-grouping.ts:70:17` `groupNodesByTag` [function]
- `src/utils/node-grouping.ts:237:17` `expandGroup` [function]

## `src/utils/timer-registry.ts`

- `src/utils/timer-registry.ts:10:14` `TimerRegistry` [class]

## `src/utils/transform-expr.ts`

- `src/utils/transform-expr.ts:356:17` `getTransformExprSuggestions` [function]

## `src/views/CableTrayRenderer.ts`

- `src/views/CableTrayRenderer.ts:151:2` `HIGHLIGHT_CABLE_TRUNK_WIDTH` [other]
- `src/views/CableTrayRenderer.ts:152:2` `CABLE_FAN_CROWD_THRESHOLD` [other]
- `src/views/CableTrayRenderer.ts:153:2` `CABLE_FAN_CROWD_MIN_FRACTION` [other]
- `src/views/CableTrayRenderer.ts:158:2` `MAX_CONDUIT_WIDTH` [other]
- `src/views/CableTrayRenderer.ts:302:17` `computeCablePath` [function]

## `src/views/EdgeRenderer.ts`

- `src/views/EdgeRenderer.ts:508:17` `classifyEdgePort` [function]
- `src/views/EdgeRenderer.ts:516:17` `portLaneKey` [function]
- `src/views/EdgeRenderer.ts:674:17` `findPerimeterBranchPoint` [function]

## `src/views/ExportManager.ts`

- `src/views/ExportManager.ts:90:17` `exportPng` [function]
- `src/views/ExportManager.ts:108:17` `exportFullGraph` [function]

## `src/views/LabelManager.ts`

- `src/views/LabelManager.ts:634:17` `computePriorityScores` [function]
- `src/views/LabelManager.ts:763:17` `selectLabelMode` [function]

## `src/views/LayoutTransition.ts`

- `src/views/LayoutTransition.ts:116:14` `LAYOUT_TRANSITION_DURATION_MS` [const]
- `src/views/LayoutTransition.ts:117:14` `LAYOUT_LARGE_GRAPH_THRESHOLD` [const]

## `src/views/PanelBuilder.ts`

- `src/views/PanelBuilder.ts:1719:10` `parseAxisSourceString` [other]
- `src/views/PanelBuilder.ts:1719:33` `axisSourceToString` [other]

## `src/views/SearchOrchestrator.ts`

- `src/views/SearchOrchestrator.ts:62:17` `parseHopFilters` [function]
- `src/views/SearchOrchestrator.ts:86:17` `computeHopSet` [function]
- `src/views/SearchOrchestrator.ts:140:17` `filterBySearchExpr` [function]
- `src/views/SearchOrchestrator.ts:190:17` `countSearchMatches` [function]
- `src/views/SearchOrchestrator.ts:217:17` `expandLocalGraphNeighbors` [function]
- `src/views/SearchOrchestrator.ts:260:17` `capNodesByDegree` [function]
- `src/views/SearchOrchestrator.ts:296:17` `buildRichStatus` [function]
- `src/views/SearchOrchestrator.ts:343:17` `computePathfinderBFS` [function]
- `src/views/SearchOrchestrator.ts:404:17` `computeEntropyScores` [function]
- `src/views/SearchOrchestrator.ts:435:17` `computeCardHaloGeometry` [function]

## `src/views/SnapshotManager.ts`

- `src/views/SnapshotManager.ts:48:23` `showSnapshotMenu` [function]
- `src/views/SnapshotManager.ts:291:23` `createAutoSnapshot` [function]

## `src/views/animation-controller.ts`

- `src/views/animation-controller.ts:66:17` `cancelAllHandles` [function]
- `src/views/animation-controller.ts:88:17` `fadeNodeAlphaCancellable` [function]

## `src/views/coord-panel.ts`

- `src/views/coord-panel.ts:784:10` `parseAxisSourceString` [other]
- `src/views/coord-panel.ts:784:33` `axisSourceToString` [other]

## `src/views/export-orchestrator.ts`

- `src/views/export-orchestrator.ts:132:17` `orchestrateSvgExport` [function]

## `src/views/export/ExportOrchestrator.ts`

- `src/views/export/ExportOrchestrator.ts:104:17` `buildSvgExportArgs` [function]
- `src/views/export/ExportOrchestrator.ts:143:17` `buildPngExportArgs` [function]
- `src/views/export/ExportOrchestrator.ts:170:17` `buildPresetJson` [function]
- `src/views/export/ExportOrchestrator.ts:209:17` `safeExport` [function]

## `src/views/group-label-manager.ts`

- `src/views/group-label-manager.ts:630:10` `parseGroupByFields` [other]

## `src/views/inertia-pan.ts`

- `src/views/inertia-pan.ts:12:14` `InertiaPan` [class]

## `src/views/pan-inertia-controller.ts`

- `src/views/pan-inertia-controller.ts:1:14` `PanInertiaController` [class]

## `src/views/panel-helpers.ts`

- `src/views/panel-helpers.ts:3:17` `setPanelValue` [function]
- `src/views/panel-helpers.ts:7:17` `getPanelValue` [function]

## `src/views/panel-sections-filter-logic.ts`

- `src/views/panel-sections-filter-logic.ts:186:17` `countActiveHoverHighlights` [function]

## `src/views/panel-sections-filter.ts`

- `src/views/panel-sections-filter.ts:49:17` `buildBookmarkSection` [function]
- `src/views/panel-sections-filter.ts:206:17` `buildNodeDecorationSection` [function]
- `src/views/panel-sections-filter.ts:324:17` `buildStructureAnalysisSection` [function]
- `src/views/panel-sections-filter.ts:438:17` `buildDiscoverySection` [function]
- `src/views/panel-sections-filter.ts:522:17` `buildInteractionSection` [function]
- `src/views/panel-sections-filter.ts:872:17` `buildRenderThresholdsSection` [function]

## `src/views/panel-sections-layout.ts`

- `src/views/panel-sections-layout.ts:89:17` `buildGraphSyncSection` [function]
- `src/views/panel-sections-layout.ts:141:17` `buildPluginSettingsSection` [function]
- `src/views/panel-sections-layout.ts:283:17` `buildCustomMappingsSection` [function]
- `src/views/panel-sections-layout.ts:557:17` `buildTimelineControls` [function]
- `src/views/panel-sections-layout.ts:776:17` `buildForceParameters` [function]
- `src/views/panel-sections-layout.ts:857:17` `buildClusterGroupRules` [function]

## `src/views/panel-sections.ts`

- `src/views/panel-sections.ts:243:17` `buildNodeDisplaySection` [function]
- `src/views/panel-sections.ts:382:17` `buildEdgeDisplaySection` [function]
- `src/views/panel-sections.ts:940:17` `buildNodesTab` [function]

## `src/views/panel-widgets.ts`

- `src/views/panel-widgets.ts:347:17` `addMultiValueInput` [function]

## `src/views/render-pipeline-utils.ts`

- `src/views/render-pipeline-utils.ts:145:17` `computeTimelineFilteredSet` [function]

## `src/views/snapshot/GraphSnapshot.ts`

- `src/views/snapshot/GraphSnapshot.ts:52:17` `restoreState` [function]

## `src/views/soft-render.ts`

- `src/views/soft-render.ts:18:23` `applySoftRender` [function]

## `src/views/webgl/buffer-pool.ts`

- `src/views/webgl/buffer-pool.ts:14:14` `BufferPool` [class]

## `src/views/webgl/mat3.ts`

- `src/views/webgl/mat3.ts:16:17` `mat3Identity` [function]
- `src/views/webgl/mat3.ts:25:17` `mat3Translate` [function]
- `src/views/webgl/mat3.ts:36:17` `mat3Scale` [function]

## `src/views/webgl/shaders.ts`

- `src/views/webgl/shaders.ts:124:14` `ShaderCache` [class]

## Per-file summary

| File | Count |
|------|------:|
| `src/constants.ts` | 45 |
| `src/views/SearchOrchestrator.ts` | 10 |
| `src/views/panel-sections-filter.ts` | 6 |
| `src/views/panel-sections-layout.ts` | 6 |
| `src/views/CableTrayRenderer.ts` | 5 |
| `src/utils/gvc-helpers.ts` | 4 |
| `src/views/export/ExportOrchestrator.ts` | 4 |
| `src/utils/graph-helpers.ts` | 3 |
| `src/views/EdgeRenderer.ts` | 3 |
| `src/views/panel-sections.ts` | 3 |
| `src/views/webgl/mat3.ts` | 3 |
| `src/layouts/cable-tray.ts` | 2 |
| `src/layouts/coordinate-presets.ts` | 2 |
| `src/utils/color.ts` | 2 |
| `src/utils/node-grouping.ts` | 2 |
| `src/views/animation-controller.ts` | 2 |
| `src/views/coord-panel.ts` | 2 |
| `src/views/ExportManager.ts` | 2 |
| `src/views/LabelManager.ts` | 2 |
| `src/views/LayoutTransition.ts` | 2 |
| `src/views/panel-helpers.ts` | 2 |
| `src/views/PanelBuilder.ts` | 2 |
| `src/views/SnapshotManager.ts` | 2 |
| `src/i18n.ts` | 1 |
| `src/layouts/road-network-metrics.ts` | 1 |
| `src/layouts/tree.ts` | 1 |
| `src/utils/git-status-emit.ts` | 1 |
| `src/utils/timer-registry.ts` | 1 |
| `src/utils/transform-expr.ts` | 1 |
| `src/views/export-orchestrator.ts` | 1 |
| `src/views/group-label-manager.ts` | 1 |
| `src/views/inertia-pan.ts` | 1 |
| `src/views/pan-inertia-controller.ts` | 1 |
| `src/views/panel-sections-filter-logic.ts` | 1 |
| `src/views/panel-widgets.ts` | 1 |
| `src/views/render-pipeline-utils.ts` | 1 |
| `src/views/snapshot/GraphSnapshot.ts` | 1 |
| `src/views/soft-render.ts` | 1 |
| `src/views/webgl/buffer-pool.ts` | 1 |
| `src/views/webgl/shaders.ts` | 1 |

## Kind totals

| Kind | Count |
|------|------:|
| type | 0 |
| const | 48 |
| function | 71 |
| class | 5 |
| enum | 0 |
| other | 9 |
