
## Description (subtask of 1161-140-panelbuilder-createdefaultpanel-179)

新規ファイル src/views/panel-defaults.ts を作成し、以下を export する:
    - DEFAULT_FILTER_STATE: searchQuery, searchMode, includeTagsInData, showAttachments,
      existingOnly, showOrphans, showTagNodes, tagDisplay, excludeNodes,
      minDegreeFilter, maxDegreeFilter, edgeDirectionFilter, groupFilter,
      multiSelectNodeIds, subgraphNodeIds, subgraphStack, focusNodeId,
      focusMode, localGraphCenter, localGraphHops, expandedNodes,
      orphanClusterField, savedSearchQueries, searchHistory, commonQueries,
      bookmarkedNodes, syncWithEditor, syncViewId
    - DEFAULT_DISPLAY_STATE: nodeSize, textFadeThreshold, showArrows, showInheritance,
      showAggregation, showSimilar, showSibling, showSequence, showInlineRelation,
      showNamedRelation, showLinks, showTagEdges, showCategoryEdges,
      showSemanticEdges, showEdgeLabels, edgeLabelPlacement, fadeEdgesByDegree,
      edgeBundleStrength, edgeWeightThickness, edgeLayerMode, edgeCardinalityMode,
      cardinalityRules, cableBundleMode, cableTrunkWidth, cableTrunkAlpha,
      cableSpacing, cableFanWidth, cableFanAlpha, colorEdgesByRelation,
      nodeColorMode, nodeColorField, customColorPalette, nodeRules,
      nodeShapeRules, nodeDisplayMode, cardDisplayConfig, donutDisplayConfig,
      showNodeThumbnails, nodeIconField, nodeIconMap, nodeSubLabelFields,
      hoverHops, hoverHighlightTypes, hoverEdgeTypes, hoverTooltipFields,
      hoverShowTitle, hoverShowMeta, hoverShowBody, focusConeEnabled,
      highContrastMode, semanticZoom, showTagBadges, showImportanceRing,
      importanceMetric, showRecencyMarker, recencyDays, highlightPatterns,
      highlightMissingNeighbors, showBridgeNodes, clusterLabelDetail,
      definitionField, analysisOverlay, showOntologyBackbone
    - DEFAULT_LAYOUT_STATE: centerForce, repelForce, linkForce, linkDistance,
      concentricMinRadius, concentricRadiusStep, showOrbitRings, orbitAutoRotate,
      enclosureSpacing, directionalGravityRules, clusterGroupRules,
      clusterArrangement, clusterGroupArrangement, clusterNodeSpacing,
      clusterGroupScale, clusterGroupSpacing, clusterGravity, clusterFollowsGroupBy,
      sortRules, groups, groupBy, groupByRules, groupMinSize, collapsedGroups,
      timelineKey, timelineEndKey, timelineOrderFields, timelineRangeMin,
      timelineRangeMax, showDurationBars, showTimelineRoutes,
      showTimelineTickLabels, coordinateLayout, ringChartMode, gridShowHeaders,
      showAxisTitles, gridCellShading, gridStyle, gridLabelPlacement,
      pinnedPositions, focusLayout
    - DEFAULT_TOOLBAR_STATE: viewMode, matrixSortMode, activeTab, autoFit,
      autoFitOnFilter, showMinimap, showLegend, showOutOfBoundsIndicator,
      showDotGrid, showGraphStats, showAncestryBreadcrumb,
      showHierarchyBreadcrumb, showSimilarSuggestions, showStructureQuestions,
      showEntropyOverlay, showClusterCompare, showRelationMatrix,
      showPathfinderOverlay, presentationMode, presetZoomLevel, zoomSensitivity,
      navHistory, navHistoryCursor, savedViewports, annotations, dataviewQuery
  各 DEFAULT_* は `as const` を付けず、PanelState の対応サブセット型として定義する
  (`Pick<PanelState, ...>` 推奨)。
  `createDefaultPanelState(): PanelState` を export し、4つの DEFAULT_* を spread
  してマージし返す純粋関数とする。Set/配列/オブジェクトはファクトリ呼び出しごとに
  新規インスタンスを作るよう、内部で都度 `new Set()` / `[]` / `{}` を生成すること
  (shared-reference バグ防止 — 既存コメント line 396-398 参照)。
  
  src/views/PanelBuilder.ts の createDefaultPanel (line 396-578) を以下に縮小:
    export function createDefaultPanel(): PanelState {
      return createDefaultPanelState();
    }
  上部に `import { createDefaultPanelState } from "./panel-defaults";` を追加。
  PanelBuilder.ts の総行数が現状 2216 を超えないこと (Max Allowed)。
  validatePanelState は createDefaultPanel() を呼び続けるため変更不要。
  
  完了条件: pnpm build && pnpm test が通る。pnpm lint クリーン。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
