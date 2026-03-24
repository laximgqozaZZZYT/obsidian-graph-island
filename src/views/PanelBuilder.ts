import type { LayoutType, ViewMode, GraphNode, ShellInfo, DirectionalGravityRule, ClusterArrangement, ClusterGroupArrangement, ClusterGroupBy, ClusterGroupRule, GroupRule, SortRule, SortKey, SortOrder, NodeRule, GraphViewsSettings, OntologyRule, OntologyRelation, CoordinateLayout, CoordinateSystem, AxisSource, AxisConfig, AxisTransform, CurveKind, ClusterGravityConfig, NodeDisplayMode, CardDisplayConfig, DonutDisplayConfig, EdgeCardinalityMode, CardinalityRule, CardRenderConfig, CardinalityRenderConfig, RenderThresholds } from "../types";
import { DEFAULT_CARD_RENDER_CONFIG, DEFAULT_CARDINALITY_RENDER_CONFIG, mergeRenderThresholds } from "../types";
import { ontologyToRules, rulesToOntologyFields } from "../types";
import { DEFAULT_COLORS } from "../types";
import { repositionShell } from "../layouts/concentric";
import type { QueryExpression, BoolOp } from "../utils/query-expr";
import { parseQueryExpr, serializeExpr } from "../utils/query-expr";
import { setIcon, Menu } from "obsidian";
import { t, tHelp, getLocale } from "../i18n";
import type { ShapeRule, NodeShape } from "../utils/node-shapes";
import { ALL_SHAPES } from "../utils/node-shapes";
import { exportPreset, exportPresetDiff, importPreset, applyPreset, type PresetMigrationInfo } from "../utils/presets";
import { showToast } from "../utils/toast";
import { ARRANGEMENT_PRESETS, findMatchingPreset, CURVE_REGISTRY } from "../layouts/coordinate-presets";
import { validateExpr, parseExpr, evalExpr, setUserVars, type ExprNode } from "../utils/expr-eval";
import { parseTransformExpr, transformExprToString, getTransformExprSuggestions, TRANSFORM_FUNCTION_NAMES } from "../utils/transform-expr";
import {
  TAG_DISPLAY_ENCLOSURE, TAG_DISPLAY_NODE,
  ARRANGEMENT_CONCENTRIC, ARRANGEMENT_TIMELINE,
  SOURCE_PROPERTY, TRANSFORM_EVEN_DIVIDE, EDGE_TYPE_INHERITANCE,
} from "../constants";
import { isSectionVisible } from "../utils/view-mode-sections";
import type { PanelSectionId } from "../utils/view-mode-sections";
import { updateSliderProgress, buildDualRangeSlider, _buildQueryHintContainer, addSlider, addToggle, addSelect, addTextInput, addMultiValueInput, addCheckboxGroup, attachAutocomplete, attachDatalist, renderClusterRuleList, renderDirectionalGravityList, renderSortRuleList, getUnifiedFieldSuggestions, renderGroupByRules, getGroupByOptions, parseGroupByRules, deriveClusterRulesFromGroupBy, serializeGroupByRules, renderOntologyRule, renderCustomMappings, renderTagRelations, getQueryOptions, resolvePrefix, attachQueryHint, setCachedFieldSuggestions, attachSearchJump, renderGroupList, renderNodeRuleList } from "./panel-widgets";

// ---------------------------------------------------------------------------
// Panel state (shared with GraphViewContainer)
// ---------------------------------------------------------------------------
export interface GroupByRule { field: string; op?: string; indent?: number; recursive?: boolean; }

/** Node tree entry for the Nodes tab directory view */
export interface NodeTreeEntry {
  id: string;
  label: string;
  path: string;
  isVisible: boolean;
  isTag?: boolean;
}

export interface PanelState {
  /** Explicitly excluded node IDs (hidden via Nodes tab) */
  /** Top-level visualization mode */
  viewMode: ViewMode;
  /** Matrix sort mode: degree (default), alpha, category */
  matrixSortMode: "degree" | "alpha" | "category";
  excludeNodes: string[];
  /** GK: Auto-fit view after filter changes */
  autoFitOnFilter: boolean;
  /** FZ: Minimum degree to show a node (0 = no filter) */
  minDegreeFilter: number;
  /** FZ: Maximum degree to show a node (0 = no filter) */
  maxDegreeFilter: number;
  includeTagsInData: boolean;
  showAttachments: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
  showArrows: boolean;
  textFadeThreshold: number;
  nodeSize: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  concentricMinRadius: number;
  concentricRadiusStep: number;
  showOrbitRings: boolean;
  orbitAutoRotate: boolean;
  groups: GroupRule[];
  searchQuery: string;
  /** N2: Search behavior — "filter" removes non-matches, "highlight" dims them */
  searchMode: "filter" | "highlight";
  colorEdgesByRelation: boolean;
  showInheritance: boolean;
  showAggregation: boolean;
  showTagNodes: boolean;
  tagDisplay: "node" | "enclosure";
  showSimilar: boolean;
  showSibling: boolean;
  showSequence: boolean;
  showLinks: boolean;
  showTagEdges: boolean;
  showCategoryEdges: boolean;
  showSemanticEdges: boolean;
  enclosureSpacing: number;
  directionalGravityRules: DirectionalGravityRule[];
  hoverHops: number;
  /** Edge types to follow during hover BFS traversal.
   *  Only edge types set to true are traversed for hover highlighting. */
  hoverEdgeTypes: {
    link: boolean;
    semantic: boolean;
    tag: boolean;
    hasTag: boolean;
    similar: boolean;
    sibling: boolean;
    sequence: boolean;
    inheritance: boolean;
    aggregation: boolean;
  };
  commonQueries: { query: string; recursive: boolean }[];
  clusterGroupRules: ClusterGroupRule[];
  clusterArrangement: ClusterArrangement;
  /** Inter-group layout: how groups are positioned relative to each other.
   *  "auto" derives from clusterArrangement (legacy behavior). */
  clusterGroupArrangement: ClusterGroupArrangement;
  clusterNodeSpacing: number;
  clusterGroupScale: number;
  clusterGroupSpacing: number;
  fadeEdgesByDegree: boolean;
  edgeBundleStrength: number;
  sortRules: SortRule[];
  nodeRules: NodeRule[];
  nodeShapeRules: ShapeRule[];
  dataviewQuery: string;
  timelineKey: string;
  showEdgeLabels: boolean;
  edgeLabelPlacement: "center" | "offset" | "smart";
  showMinimap: boolean;
  groupBy: string;
  /** Editable rules array for the groupBy multi-rule editor.
   *  Stored directly so that pending (empty-field) rules survive panel rebuilds.
   *  When null/undefined, rules are parsed from the groupBy string on first render. */
  groupByRules: GroupByRule[] | null;
  groupMinSize: number;
  groupFilter: string;
  collapsedGroups: Set<string>;
  activeTab: "filter" | "display" | "layout" | "settings" | "nodes";
  /** Auto-fit spacing: automatically compute nodeSpacing, groupScale, groupSpacing */
  autoFit: boolean;
  /** Show duration bars on timeline arrangement */
  showDurationBars: boolean;
  /** Show per-group route lines on timeline arrangement (transit map style) */
  showTimelineRoutes: boolean;
  /** Frontmatter field for timeline end date */
  timelineEndKey: string;
  /** Comma-separated fields for hierarchy-based ordering (e.g. parent_id,story_order). Sequence fields (next/prev) come from ontology settings. */
  timelineOrderFields: string;
  /** Coordinate layout override — when set, takes precedence over clusterArrangement */
  coordinateLayout: CoordinateLayout | null;
  /** Whether to show the background dot grid */
  showDotGrid: boolean;
  /** Timeline range filter [min, max] normalized 0–1 (0 = earliest, 1 = latest) */
  timelineRangeMin: number;
  timelineRangeMax: number;
  /** Display sunburst as filled ring chart instead of nodes */
  ringChartMode: boolean;
  /** Show row/column header labels on grid */
  gridShowHeaders: boolean;
  /** Show axis name titles on coordinate grid */
  showAxisTitles: boolean;
  /** Show tick labels on timeline axis */
  showTimelineTickLabels: boolean;
  /** Shade cells by node density */
  gridCellShading: boolean;
  /** Grid display style */
  gridStyle: "lines" | "table";
  /** Grid label placement mode: on grid lines or between them */
  gridLabelPlacement: "on-line" | "between";
  /** Cluster-level gravity coefficients for group spacing */
  clusterGravity: ClusterGravityConfig;
  /** When true, clusterGroupRules are auto-derived from groupByRules */
  clusterFollowsGroupBy: boolean;
  /** Node display mode: how nodes are rendered */
  nodeDisplayMode: NodeDisplayMode;
  /** Card display configuration */
  cardDisplayConfig: CardDisplayConfig;
  /** Donut display configuration */
  donutDisplayConfig: DonutDisplayConfig;
  /** Edge cardinality marker mode */
  edgeCardinalityMode: EdgeCardinalityMode;
  /** Custom cardinality rules (matched in order, first match wins) */
  cardinalityRules: CardinalityRule[];
  /** Cable bundling mode: auto (when clusters exist), always, never */
  cableBundleMode: "auto" | "always" | "never";
  /** Cable trunk line width (px) */
  cableTrunkWidth: number;
  /** Cable trunk opacity (0-1) */
  cableTrunkAlpha: number;
  /** Spacing between parallel cables (px) */
  cableSpacing: number;
  /** Fan wire width (px) — lines from cable endpoints to individual nodes */
  cableFanWidth: number;
  /** Fan wire opacity (0-1) */
  cableFanAlpha: number;
  /** Sync graph highlight with active editor file */
  syncWithEditor: boolean;
  /** Local graph center file path (null = global view) */
  localGraphCenter: string | null;
  /** Local graph BFS hop depth (1-5, default 2) */
  localGraphHops: number;
  /** Show edge weight via line thickness (same source-target pair count) */
  edgeWeightThickness: boolean;
  /** エッジ種別ごとにレイヤー分離描画 (z-order + alpha/width差分) */
  edgeLayerMode: boolean;
  /** フォーカスモード: クリックでハイライトを固定 */
  focusMode: boolean;
  /** フォーカス中のノードID (null = フォーカスなし) */
  focusNodeId: string | null;
  /** ビュー同期: 他の Graph Island ビューとパネル状態を同期 */
  syncViewId: string | null;
  /** キャンバス上の注釈リスト (W4: color added for sticky note support) */
  annotations: { nodeId: string; text: string; x: number; y: number; color?: string }[];
  /** ブックマークされたノードIDリスト */
  bookmarkedNodes: string[];
  /** Unified node color mode */
  nodeColorMode: "default" | "category" | "heatmap" | "community" | "field";
  /** EO: Field name for nodeColorMode="field" */
  nodeColorField: string;
  /** ET: Custom color palette (CSS color strings, comma-separated) */
  customColorPalette: string;
  /** Filter edges by directionality: "all" | "bidirectional" | "unidirectional" */
  edgeDirectionFilter: "all" | "bidirectional" | "unidirectional";
  /** Show pathfinder overlay when start+end nodes are selected */
  showPathfinderOverlay: boolean;
  /** 凡例オーバーレイ表示 */
  showLegend: boolean;
  /** Show off-screen node count indicator badge */
  showOutOfBoundsIndicator: boolean;
  /** Highlight nodes that share tags but have no edge between them */
  highlightMissingNeighbors: boolean;
  /** 検索クエリ履歴（最大10件） */
  searchHistory: string[];
  /** Metadata field to cluster orphan nodes by (e.g. "category", "folder", "tag") */
  orphanClusterField: string;
  /** Show graph statistics panel (node count, density, hubs, components) */
  showGraphStats: boolean;
  /** Show ancestry breadcrumb trail from hub to hovered node */
  showAncestryBreadcrumb: boolean;
  /** Additional metadata fields to show below node label (comma-separated frontmatter keys) */
  nodeSubLabelFields: string;
  /** Metadata fields to show in hover tooltip (comma-separated frontmatter keys) */
  hoverTooltipFields: string;
  /** IE: Hover/card content checklist — which sections to display */
  hoverShowTitle: boolean;
  hoverShowMeta: boolean;
  hoverShowBody: boolean;
  /** Named saved search queries */
  savedSearchQueries: { name: string; query: string }[];
  /** Pinned node positions: persisted across layout changes */
  pinnedPositions: Record<string, { x: number; y: number }>;
  /** ED: Saved viewport positions (name → {x, y, scale}) */
  savedViewports: { name: string; x: number; y: number; scale: number }[];
  /** Preset zoom level — applied when loading a preset (0 = use auto-fit) */
  presetZoomLevel: number;
  /** IL: Zoom wheel sensitivity (0.5 = gentle, 1.0 = normal, 2.0 = fast) */
  zoomSensitivity: number;
  /** Navigation history: visited node IDs (max 20) */
  navHistory: string[];
  /** Navigation history cursor (index into navHistory, -1 = latest) */
  navHistoryCursor: number;
  /** Enable semantic zoom: per-node LOD based on screen size */
  semanticZoom: boolean;
  /** Show colored tag badges on node circumference */
  showTagBadges: boolean;
  /** A11y: High contrast mode — thicker edges, stronger node outlines */
  highContrastMode: boolean;
  /** Show importance ring around nodes (based on selected metric) */
  showImportanceRing: boolean;
  /** Metric for importance ring: degree, betweenness, or pagerank */
  importanceMetric: "degree" | "betweenness" | "pagerank";
  /** Show recency marker (green dot for recent, fade for old) */
  showRecencyMarker: boolean;
  /** Recency threshold in days (nodes modified within this period get green dot) */
  recencyDays: number;
  /** Frontmatter field to show as definition (bold, large) at top of card */
  definitionField: string;
  // --- Phase 3: Structure visualization ---
  /** Cluster label detail level */
  clusterLabelDetail: "minimal" | "standard" | "detailed" | "rich";
  /** Highlight structural patterns (articulation points, spokes, cliques) */
  highlightPatterns: boolean;
  /** Highlight bridge nodes (top betweenness centrality) */
  showBridgeNodes: boolean;
  // --- Phase 6: ExcaliBrain-like features ---
  /** Enable focus-center layout (ego graph: selected node at center) */
  focusLayout: boolean;
  /** Show hierarchy breadcrumb bar above graph */
  showHierarchyBreadcrumb: boolean;
  // --- Phase 5: Discovery & insight ---
  /** Show similar note suggestions on hover */
  showSimilarSuggestions: boolean;
  /** Show structure-based questions in statistics panel */
  showStructureQuestions: boolean;
  /** Show knowledge entropy heatmap overlay */
  showEntropyOverlay: boolean;
  /** D5: Cluster comparison mode — highlight differences between two clusters */
  showClusterCompare: boolean;
  /** S1: Show hierarchy tree overlay from focused node */
  showHierarchyTree?: boolean;
  /** S1: Hierarchy relation types to follow */
  hierarchyRelations?: string[];
  /** S6: Show ontology backbone (is-a hierarchy as skeleton) */
  showOntologyBackbone?: boolean;
  /** S4: Show gap detection dotted edges */
  showGapEdges?: boolean;
  /** R2: Consolidated analysis overlay mode */
  analysisOverlay?: "off" | "bridges" | "entropy" | "gaps" | "missing" | "density" | "all";
  // --- Phase 4: Interaction enhancements ---
  /** C6: Multi-select node set (Shift+click to add, operations on selection) */
  multiSelectNodeIds: string[];
  /** Subgraph view: node IDs to display (empty = show all) */
  subgraphNodeIds: string[];
  /** Subgraph navigation stack for back/forward */
  subgraphStack: { nodeIds: string[]; viewMode: ViewMode; panX: number; panY: number; zoom: number }[];
  /** F5: Relation matrix view */
  showRelationMatrix: boolean;
  // --- Phase 7: Advanced features ---
  /** E5: Presentation mode — step-through guided tour */
  presentationMode: boolean;
  /** Show frontmatter image as node thumbnail */
  showNodeThumbnails: boolean;
  /** A3: Frontmatter field to use for node icon prefix (e.g. "node_type") */
  nodeIconField?: string;
  /** A3: Mapping from field value to icon text (e.g. {"character":"👤","episode":"📖"}) */
  nodeIconMap?: Record<string, string>;
  /** Card rendering visual config (opacity, dimensions, typography) */
  cardRenderConfig?: CardRenderConfig;
  /** Cardinality marker rendering config */
  cardinalityRenderConfig?: CardinalityRenderConfig;
  /** Rendering performance thresholds and misc numeric settings */
  renderThresholds?: RenderThresholds;
  /** R2: Distance-based alpha gradient on hover (focus cone) */
  focusConeEnabled?: boolean;
  /** V2: Scale edge width by average endpoint degree (0 = off, default 0) */
  degreeEdgeWidth?: number;
  /** D1: Manually expanded nodes in local graph mode (IDs whose neighbors are shown beyond hop limit) */
  expandedNodes?: string[];
}

/** Create a fresh PanelState with all mutable values as new instances.
 *  Always use this instead of spreading a shared constant — prevents
 *  shared-reference bugs where mutations leak back into "defaults". */
export function createDefaultPanel(): PanelState {
  return {
    viewMode: "graph" as ViewMode,
    matrixSortMode: "degree",
    excludeNodes: [],
    autoFitOnFilter: false,
    minDegreeFilter: 0,
    maxDegreeFilter: 0,
    includeTagsInData: true,
    showAttachments: false,
    existingOnly: false,
    showOrphans: true,
    showArrows: false,
    textFadeThreshold: 0.5,
    nodeSize: 15,
    centerForce: 0.03,
    repelForce: 200,
    linkForce: 0.01,
    linkDistance: 100,
    concentricMinRadius: 50,
    concentricRadiusStep: 60,
    showOrbitRings: true,
    orbitAutoRotate: true,
    groups: [],
    searchQuery: "",
    searchMode: "filter" as const,
    colorEdgesByRelation: true,
    nodeColorMode: "category" as const,
    nodeColorField: "",
    customColorPalette: "",
    showInheritance: false,
    showAggregation: false,
    showTagNodes: true,
    tagDisplay: TAG_DISPLAY_ENCLOSURE,
    showSimilar: false,
    showSibling: false,
    showSequence: false,
    showLinks: true,
    showTagEdges: false,
    showCategoryEdges: false,
    showSemanticEdges: false,
    enclosureSpacing: 1.5,
    directionalGravityRules: [],
    hoverHops: 2,
    hoverEdgeTypes: {
      link: true,
      semantic: false,
      tag: false,
      hasTag: false,
      similar: false,
      sibling: false,
      sequence: false,
      inheritance: true,
      aggregation: true,
    },
    commonQueries: [],
    clusterGroupRules: [],
    clusterArrangement: "grid" as ClusterArrangement,
    clusterGroupArrangement: "auto" as ClusterGroupArrangement,
    clusterNodeSpacing: 3.0,
    clusterGroupScale: 3.0,
    clusterGroupSpacing: 2.0,
    fadeEdgesByDegree: false,
    edgeBundleStrength: 0.65,
    sortRules: [{ key: "degree" as SortKey, order: "desc" as SortOrder }],
    nodeRules: [],
    nodeShapeRules: [
      { match: "isTag", shape: "triangle" },
      { match: "default", shape: "circle" },
    ],
    dataviewQuery: "",
    timelineKey: "date",
    showEdgeLabels: false,
    edgeLabelPlacement: "center",
    showMinimap: true,
    groupBy: "none" as const,
    groupByRules: null,
    groupMinSize: 2,
    groupFilter: "",
    collapsedGroups: new Set<string>(),
    activeTab: "filter" as const,
    autoFit: false,
    showDurationBars: true,
    showTimelineRoutes: true,
    timelineEndKey: "end-date",
    timelineOrderFields: "",
    coordinateLayout: null,
    showDotGrid: true,
    timelineRangeMin: 0,
    timelineRangeMax: 1,
    ringChartMode: false,
    gridShowHeaders: true,
    showAxisTitles: true,
    showTimelineTickLabels: true,
    gridCellShading: false,
    gridStyle: "lines" as const,
    gridLabelPlacement: "on-line" as const,
    clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
    clusterFollowsGroupBy: true,
    nodeDisplayMode: "node" as NodeDisplayMode,
    cardDisplayConfig: { fields: [], maxWidth: 120, showIcon: false },
    donutDisplayConfig: { innerRadius: 0.6 },
    edgeCardinalityMode: "none" as EdgeCardinalityMode,
    cardinalityRules: [],
    cableBundleMode: "auto" as const,
    cableTrunkWidth: 12,
    cableTrunkAlpha: 0.25,
    cableSpacing: 14,
    cableFanWidth: 2.5,
    cableFanAlpha: 0.9,
    syncWithEditor: true,
    localGraphCenter: null,
    localGraphHops: 2,
    edgeWeightThickness: true,
    edgeLayerMode: false,
    focusMode: false,
    focusNodeId: null,
    syncViewId: null,
    annotations: [],
    bookmarkedNodes: [],
    edgeDirectionFilter: "all" as const,
    showPathfinderOverlay: true,
    showLegend: true,
    showOutOfBoundsIndicator: false,
    searchHistory: [],
    orphanClusterField: "",
    highlightMissingNeighbors: false,
    showGraphStats: false,
    showAncestryBreadcrumb: false,
    nodeSubLabelFields: "",
    hoverTooltipFields: "",
    hoverShowTitle: true,
    hoverShowMeta: true,
    hoverShowBody: false,
    savedSearchQueries: [],
    savedViewports: [],
    presetZoomLevel: 0,
    zoomSensitivity: 1.0,
    pinnedPositions: {},
    navHistory: [],
    navHistoryCursor: -1,
    semanticZoom: false,
    showTagBadges: false,
    highContrastMode: false,
    showImportanceRing: false,
    importanceMetric: "degree" as const,
    showRecencyMarker: false,
    recencyDays: 7,
    definitionField: "",
    clusterLabelDetail: "standard" as const,
    highlightPatterns: false,
    showBridgeNodes: false,
    focusLayout: false,
    showHierarchyBreadcrumb: false,
    showSimilarSuggestions: false,
    showStructureQuestions: false,
    showEntropyOverlay: false,
    showClusterCompare: false,
    multiSelectNodeIds: [],
    subgraphNodeIds: [],
    subgraphStack: [],
    showRelationMatrix: false,
    presentationMode: false,
    showNodeThumbnails: false,
    nodeIconField: "",
    nodeIconMap: {},
    focusConeEnabled: true,
    expandedNodes: [],
    analysisOverlay: "off" as const,
    degreeEdgeWidth: 0,
    showOntologyBackbone: false,
  };
}

/** B2: Validate and sanitize panel state — fix NaN, undefined, out-of-range values */
export function validatePanelState(panel: PanelState): void {
  const defaults = createDefaultPanel();
  // Numeric fields: replace NaN/Infinity with defaults
  const numericKeys: (keyof PanelState)[] = [
    "nodeSize", "centerForce", "repelForce", "linkForce", "linkDistance",
    "textFadeThreshold", "concentricMinRadius", "concentricRadiusStep",
    "hoverHops", "enclosureSpacing", "edgeBundleStrength",
    "clusterNodeSpacing", "clusterGroupScale", "clusterGroupSpacing",
  ];
  for (const key of numericKeys) {
    const val = panel[key] as number;
    if (typeof val !== "number" || !isFinite(val)) {
      (panel as any)[key] = (defaults as any)[key];
    }
  }
  // ViewMode validation
  const validViewModes = new Set(["graph", "sunburst", "timeline", "matrix"]);
  if (!validViewModes.has(panel.viewMode)) {
    panel.viewMode = "graph";
  }
  // Clamp hoverHops to 0-10
  if (panel.hoverHops < 0) panel.hoverHops = 0;
  if (panel.hoverHops > 10) panel.hoverHops = 10;
  // Clamp nodeSize to 1-100
  if (panel.nodeSize < 1) panel.nodeSize = 1;
  if (panel.nodeSize > 100) panel.nodeSize = 100;
  // Ensure arrays are arrays
  if (!Array.isArray(panel.multiSelectNodeIds)) panel.multiSelectNodeIds = [];
  if (!Array.isArray(panel.subgraphNodeIds)) panel.subgraphNodeIds = [];
  if (!Array.isArray(panel.subgraphStack)) panel.subgraphStack = [];
  // Ensure collapsedGroups is a Set
  if (!(panel.collapsedGroups instanceof Set)) {
    panel.collapsedGroups = new Set(Array.isArray(panel.collapsedGroups) ? panel.collapsedGroups : []);
  }
  // Settings migration: fix invisible cable trunks (old default was 0)
  if (panel.cableTrunkAlpha === 0) panel.cableTrunkAlpha = 0.25;
  // Settings migration: ensure new-default features are enabled
  if (panel.renderThresholds) {
    if (panel.renderThresholds.nodeSizeByDegree === false || panel.renderThresholds.nodeSizeByDegree === undefined) {
      panel.renderThresholds.nodeSizeByDegree = true;
    }
    if (panel.renderThresholds.autoLOD === undefined) {
      panel.renderThresholds.autoLOD = true;
    }
  }
}

/** Lazy-initialize panel.renderThresholds and return it.
 *  Eliminates 35+ repetitive null-checks throughout PanelBuilder. */
export function ensureRT(panel: PanelState): RenderThresholds {
  if (!panel.renderThresholds) panel.renderThresholds = {};
  return panel.renderThresholds;
}

/** Shared immutable reference for property key enumeration and type checking.
 *  DO NOT mutate or spread — use createDefaultPanel() for new instances. */
export const DEFAULT_PANEL: Readonly<PanelState> = Object.freeze(createDefaultPanel());

// ---------------------------------------------------------------------------
// Callbacks — operations the panel requests from the main view
// ---------------------------------------------------------------------------
export interface PanelCallbacks {
  doRender(): void;
  /** Like doRender but does NOT rebuild the panel DOM (keeps editors open) */
  doRenderKeepPanel(): void;
  markDirty(): void;
  updateForces(): void;
  applySearch(): void;
  applyTextFade(): void;
  /** Recalculate hover highlight set (BFS with current hoverHops) */
  applyHover(): void;
  applyDirectionalGravityForce(): void;
  applyNodeRules(): void;
  startOrbitAnimation(): void;
  stopOrbitAnimation(): void;
  wakeRenderLoop(): void;
  rebuildPanel(): void;
  /** A11y: announce status message via aria-live region */
  announceA11y?(msg: string): void;
  invalidateData(): void;       // sets rawData = null then doRender
  setZoom?(level: number): void;
  /** Like invalidateData but keeps the panel DOM intact (for search filtering) */
  invalidateDataKeepPanel(): void;
  restartSimulation(alpha: number): void;
  applyClusterForce(resetPositions?: boolean): void;
  collectFieldSuggestions(): string[];
  collectValueSuggestions(field: string): string[];
  saveGroupPreset(): void;
  resetPanel(): void;
  /** ED: Restore saved viewport position */
  restoreViewport?(name: string): void;
  applyPreset(preset: string): void;
  /** Get a human-readable summary of preset settings (for tooltip preview) */
  getPresetSummary?(preset: string): string;
  jumpToNode(nodeId: string): void;
  getNodeIds(): string[];
  /** Recolor existing nodes without full graph rebuild (keeps panel DOM intact) */
  recolorNodes(): void;
  /** Get node tree data for Nodes tab: all vault files with visibility info */
  getNodeTreeData(): NodeTreeEntry[];
  /** Get currently hovered node ID */
  getHoveredNodeId(): string | null;
  /** Get forward link targets for a node */
  getForwardLinks(nodeId: string): string[];
  /** Get backlink sources for a node */
  getBacklinks(nodeId: string): string[];
  /** Toggle node visibility (add/remove from excludeNodes) */
  toggleNodeVisibility(nodeId: string): void;
  /** Auto-optimize: analyze overlaps and adjust force parameters iteratively */
  autoOptimize(): void;
  /** テンプレート保存: 現在のパネル設定を名前付きテンプレートとして保存 */
  saveTemplate(name: string): boolean;
  /** テンプレート読込: 保存済みテンプレートを適用 */
  loadTemplate(name: string): void;
  /** テンプレート削除: 保存済みテンプレートを削除 */
  deleteTemplate(name: string): void;
  /** Reset zoom base node size (call when user explicitly changes nodeSize) */
  resetZoomBaseNodeSize(): void;
  /** Recalculate visual radii without full re-render (lightweight nodeSize preview) */
  recalcNodeRadii(): void;
  /** Navigate back in node visit history */
  navBack(): void;
  /** Navigate forward in node visit history */
  navForward(): void;
  /** M2: Apply ego layout to visible nodes */
  applyEgoToVisible?(): void;
  /** C6: Bulk add tag to selected nodes */
  bulkAddTag?(nodeIds: string[], tag: string): void;
  /** C6: Bulk set frontmatter field on selected nodes */
  bulkSetField?(nodeIds: string[], field: string, value: string): void;
  /** Refresh DOM overlays (stats, legend, matrix, thumbnails, breadcrumb) without full re-render */
  refreshOverlays(): void;
  /** Rebuild node display objects in place (labels/icons/shapes) without simulation restart */
  rebuildNodesInPlace(): void;
  /** Rebuild hover adjacency list after hoverEdgeTypes change */
  rebuildHoverAdj(): void;
  /** Switch to a different visualization mode (graph/sunburst/timeline/tree) */
  setViewMode(mode: ViewMode): void;
}

// ---------------------------------------------------------------------------
// Read-only context the panel needs from the view
// ---------------------------------------------------------------------------
export interface PanelContext {
  currentLayout: LayoutType;
  setLayout(layout: LayoutType): void;
  shells: ShellInfo[];
  pixiNodes: Map<string, { data: GraphNode }>;
  relationColors: Map<string, string>;
  simulation: unknown | null;  // only used for null-check
  settings: GraphViewsSettings;
  saveSettings(): void;
  nodeCount: number;
  edgeCount: number;
  app: unknown;
  /** All frontmatter keys discovered in the vault */
  frontmatterKeys: string[];
  /** Available group names for current groupBy mode (e.g. tag names, category values, folder paths) */
  availableGroups: string[];
  /** All tag names found across nodes in the graph */
  availableTags: string[];
  /** ノードIDごとの次数マップ（統計ダッシュボード用） */
  degrees: Map<string, number>;
  /** Current zoom level (worldContainer.scale.x) */
  currentZoom?: number;
  /** Edge counts by type for progressive disclosure of edge toggles */
  edgeTypeCounts?: Record<string, number>;
  /** Whether any nodes have image/thumbnail/cover frontmatter metadata */
  hasImageMetaNodes?: boolean;
  /** Whether any inheritance-type edges exist in the current graph */
  hasInheritanceEdges?: boolean;
}

// ---------------------------------------------------------------------------
// Shared context for cluster arrangement sub-builders
// ---------------------------------------------------------------------------
interface ClusterSectionCtx {
  body: HTMLElement;
  panel: PanelState;
  cb: PanelCallbacks;
  ctx: PanelContext;
  /** Slider elements that should be disabled when autoFit is ON */
  spacingSliders: HTMLElement[];
}

// ---------------------------------------------------------------------------
// PanelBuilder
// ---------------------------------------------------------------------------
/**
 * After any coordinate-layout field is changed, sync the arrangement dropdown.
 * If the new layout matches a known preset, switch to that preset and clear the override.
 * Otherwise, switch to "custom".
 */
function syncArrangementFromLayout(panel: PanelState): void {
  if (!panel.coordinateLayout) return;
  const match = findMatchingPreset(panel.coordinateLayout);
  // Always keep coordinateLayout set so the coordinate engine is used.
  // Update the arrangement dropdown to reflect the closest matching preset.
  panel.clusterArrangement = match;
}

/** Safe accessor for ARRANGEMENT_PRESETS — returns grid preset as fallback */
function getPreset(arrangement: ClusterArrangement): CoordinateLayout {
  return ARRANGEMENT_PRESETS[arrangement] ?? ARRANGEMENT_PRESETS.grid;
}

export function buildPanel(
  panelEl: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  panelEl.empty();
  // Cache field suggestions for query autocomplete
  setCachedFieldSuggestions(cb.collectFieldSuggestions());

  // =========================================================================
  // Top bar: Search (always visible, outside sections)
  // =========================================================================
  const topBar = panelEl.createDiv({ cls: "gi-top-bar" });

  // --- Search bar with help icon ---
  const searchRow = topBar.createDiv({ cls: "gi-search-row" });
  const searchWrapper = searchRow.createDiv({ cls: "gi-search-wrapper" });
  const searchIcon = searchWrapper.createEl("span", { cls: "gi-search-icon" });
  setIcon(searchIcon, "search");
  // IF: ARIA combobox pattern for search + history dropdown
  const searchBar = searchWrapper.createEl("input", {
    cls: "gi-search gi-top-search",
    type: "text",
    placeholder: t("search.placeholder"),
    attr: {
      "aria-label": t("search.placeholder"),
      role: "combobox",
      "aria-expanded": "false",
      "aria-controls": "gi-search-history-list",
      "aria-autocomplete": "list",
    },
  });
  const searchClearBtn = searchWrapper.createEl("span", { cls: "gi-search-clear" });
  searchClearBtn.textContent = "\u00d7";
  searchClearBtn.style.display = panel.searchQuery ? "flex" : "none";

  // IO: Search hit count badge — shows "filtered/total nodes"
  const searchCountBadge = searchWrapper.createEl("span", { cls: "gi-search-count", attr: { "aria-live": "polite" } });
  searchCountBadge.style.cssText = "font-size:10px;color:var(--text-muted);margin-right:4px;display:none;";
  if (panel.searchQuery && ctx.nodeCount > 0) {
    searchCountBadge.textContent = `${ctx.pixiNodes.size}/${ctx.nodeCount}`;
    searchCountBadge.style.display = "";
  }
  searchBar.value = panel.searchQuery;

  // --- 検索構文ハイライトプレビュー ---
  const syntaxPreview = searchWrapper.createDiv({ cls: "gi-search-syntax" });
  syntaxPreview.style.cssText = "font-size:10px;padding:2px 4px;color:var(--text-muted);display:none;white-space:nowrap;overflow:hidden;";
  const KNOWN_QUERY_FIELDS = new Set([
    "path", "tag", "category", "file", "id", "label", "folder",
    "node_type", "prop-category", "story_order", "start-date", "date",
    "hop", "degree", "connected", ...cb.collectFieldSuggestions(),
  ]);
  const updateSyntaxPreview = () => {
    const q = searchBar.value.trim();
    if (!q) { syntaxPreview.style.display = "none"; return; }
    syntaxPreview.style.display = "";
    syntaxPreview.empty();
    const tokens = q.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      if (i > 0) syntaxPreview.appendText(" ");
      const colonIdx = tokens[i].indexOf(":");
      if (colonIdx > 0) {
        const fieldName = tokens[i].slice(0, colonIdx);
        const isValid = KNOWN_QUERY_FIELDS.has(fieldName);
        const field = syntaxPreview.createEl("span", { text: tokens[i].slice(0, colonIdx + 1) });
        field.style.color = isValid ? "var(--interactive-accent)" : "var(--text-error, #e53e3e)";
        field.style.fontWeight = "600";
        if (!isValid) field.title = `Unknown field: ${fieldName}`;
        syntaxPreview.createEl("span", { text: tokens[i].slice(colonIdx + 1) });
      } else if (["OR", "AND", "XOR", "NOR", "NAND", "NOT"].includes(tokens[i].toUpperCase())) {
        const op = syntaxPreview.createEl("span", { text: tokens[i] });
        op.style.color = "var(--text-accent)";
        op.style.fontWeight = "bold";
      } else {
        syntaxPreview.appendText(tokens[i]);
      }
    }
  };
  searchBar.addEventListener("input", updateSyntaxPreview);
  updateSyntaxPreview();

  // --- 検索履歴ドロップダウン ---
  const historyDropdown = searchWrapper.createDiv({
    cls: "gi-search-history",
    attr: { role: "listbox", id: "gi-search-history-list", "aria-label": t("search.history") ?? "Search history" },
  });
  historyDropdown.style.display = "none";
  /** 履歴ドロップダウンを現在の入力値でフィルターして表示 */
  const showHistory = () => {
    if (!panel.searchHistory || panel.searchHistory.length === 0) {
      historyDropdown.style.display = "none";
      return;
    }
    const filter = searchBar.value.trim().toLowerCase();
    const filtered = filter
      ? panel.searchHistory.filter(q => q.toLowerCase().includes(filter))
      : panel.searchHistory;
    if (filtered.length === 0) {
      historyDropdown.style.display = "none";
      searchBar.setAttribute("aria-expanded", "false");
      return;
    }
    historyDropdown.empty();
    searchBar.setAttribute("aria-expanded", "true");

    // Saved queries section (named slots)
    if (panel.savedSearchQueries && panel.savedSearchQueries.length > 0) {
      const savedHeader = historyDropdown.createDiv({ cls: "gi-search-history-item", text: "── Saved ──" });
      savedHeader.style.cssText = "font-size:10px;color:var(--text-muted);pointer-events:none;text-align:center;";
      for (const sq of panel.savedSearchQueries) {
        const item = historyDropdown.createDiv({ cls: "gi-search-history-item" });
        item.createEl("span", { text: `★ ${sq.name}`, cls: "gi-saved-query-name" });
        item.createEl("span", { text: sq.query, cls: "gi-saved-query-text" });
        item.style.cssText = "display:flex;justify-content:space-between;gap:8px;";
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          searchBar.value = sq.query;
          searchBar.dispatchEvent(new Event("input"));
          historyDropdown.style.display = "none";
        });
        // Delete button
        const delBtn = item.createEl("span", { text: "×", cls: "gi-saved-query-del" });
        delBtn.style.cssText = "cursor:pointer;color:var(--text-muted);margin-left:4px;";
        delBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          panel.savedSearchQueries = panel.savedSearchQueries.filter(s => s !== sq);
          showHistory();
        });
      }
    }

    // History section
    for (const query of filtered) {
      const item = historyDropdown.createDiv({ cls: "gi-search-history-item", attr: { role: "option" } });
      item.textContent = query;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        searchBar.value = query;
        searchBar.dispatchEvent(new Event("input"));
        historyDropdown.style.display = "none";
      });
    }
    // Save current query button
    const currentQuery = searchBar.value.trim();
    if (currentQuery) {
      const saveBtn = historyDropdown.createDiv({ cls: "gi-search-history-item gi-search-history-clear" });
      saveBtn.textContent = `★ ${t("search.saveQuery")}`;
      saveBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const name = currentQuery.length > 20 ? currentQuery.slice(0, 20) + "…" : currentQuery;
        if (!panel.savedSearchQueries) panel.savedSearchQueries = [];
        panel.savedSearchQueries.push({ name, query: currentQuery });
        historyDropdown.style.display = "none";
      });
    }
    // Clear history button
    const clearBtn = historyDropdown.createDiv({ cls: "gi-search-history-item gi-search-history-clear" });
    clearBtn.textContent = t("search.clearHistory");
    clearBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      panel.searchHistory = [];
      historyDropdown.style.display = "none";
    });
    historyDropdown.style.display = "";
  };
  /** 検索履歴にクエリを追加（重複排除、最大10件） */
  const pushHistory = (query: string) => {
    if (!query.trim()) return;
    if (!panel.searchHistory) panel.searchHistory = [];
    // 既存エントリを削除して先頭に追加
    panel.searchHistory = panel.searchHistory.filter(q => q !== query);
    panel.searchHistory.unshift(query);
    // 最大10件に制限
    if (panel.searchHistory.length > 10) panel.searchHistory.length = 10;
  };
  let lastCommittedQuery = panel.searchQuery;
  {
    let searchDebounce: ReturnType<typeof setTimeout> | null = null;
    searchBar.addEventListener("input", () => {
      panel.searchQuery = searchBar.value;
      searchClearBtn.style.display = searchBar.value ? "flex" : "none";
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        // 非空クエリが変化した場合に履歴に追加
        const q = searchBar.value.trim();
        if (q && q !== lastCommittedQuery) {
          pushHistory(q);
          lastCommittedQuery = q;
        }
        cb.invalidateDataKeepPanel();
        // IO: Update search count badge after re-render
        requestAnimationFrame(() => {
          const filtered = ctx.pixiNodes.size;
          if (q) {
            searchCountBadge.textContent = `${filtered}/${ctx.nodeCount}`;
            searchCountBadge.style.display = "";
          } else {
            searchCountBadge.style.display = "none";
          }
        });
      }, 400);
    });
  }
  // フォーカス時に履歴を表示
  searchBar.addEventListener("focus", () => { showHistory(); });
  searchBar.addEventListener("blur", () => {
    // 少し遅延させてクリックイベントが先に処理されるようにする
    setTimeout(() => { historyDropdown.style.display = "none"; searchBar.setAttribute("aria-expanded", "false"); }, 150);
  });
  searchClearBtn.addEventListener("click", () => {
    searchBar.value = "";
    searchBar.dispatchEvent(new Event("input"));
    searchClearBtn.style.display = "none";
    lastCommittedQuery = "";
  });
  attachQueryHint(searchBar, (field) => cb.collectValueSuggestions(field));
  attachSearchJump(searchBar, cb);

  // --- N2: Search mode toggle (filter / highlight) ---
  const searchModeSelect = searchRow.createEl("select", {
    cls: "dropdown gi-search-mode",
    attr: { "aria-label": t("display.searchMode") },
  });
  searchModeSelect.style.cssText = "font-size:11px;padding:2px 4px;max-width:90px;";
  for (const opt of [
    { value: "filter", label: t("search.modeFilter") },
    { value: "highlight", label: t("search.modeHighlight") },
  ]) {
    const el = searchModeSelect.createEl("option", { text: opt.label, value: opt.value });
    if (opt.value === (panel.searchMode ?? "filter")) el.selected = true;
  }
  searchModeSelect.addEventListener("change", () => {
    panel.searchMode = searchModeSelect.value as "filter" | "highlight";
    cb.invalidateData();
  });

  // --- Navigation history back/forward buttons ---
  const navBackBtn = searchRow.createEl("span", {
    cls: "clickable-icon gi-nav-btn",
    attr: { "aria-label": t("nav.back") },
  });
  setIcon(navBackBtn, "arrow-left");
  navBackBtn.addEventListener("click", () => cb.navBack());
  const navFwdBtn = searchRow.createEl("span", {
    cls: "clickable-icon gi-nav-btn",
    attr: { "aria-label": t("nav.forward") },
  });
  setIcon(navFwdBtn, "arrow-right");
  navFwdBtn.addEventListener("click", () => cb.navForward());

  const searchHelpBtn = searchRow.createEl("span", {
    cls: "clickable-icon gi-search-help",
    attr: { "aria-label": t("help.ariaLabel") },
  });
  setIcon(searchHelpBtn, "help-circle");
  searchHelpBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const existing = topBar.querySelector(".gi-help-popup");
    if (existing) { existing.remove(); return; }
    const popup = topBar.createDiv({ cls: "gi-help-popup gi-search-help-popup" });
    popup.style.whiteSpace = "pre-wrap";
    popup.textContent = t("search.filterHelp");
  });

  // =========================================================================
  // P2: Empty state — shown when no nodes are in the graph
  // =========================================================================
  if (ctx.nodeCount === 0) {
    const empty = panelEl.createDiv({ cls: "gi-empty-state" });
    empty.createEl("div", { cls: "gi-empty-title", text: t("empty.title") });
    empty.createEl("p", { cls: "gi-empty-hint", text: t("empty.hint") });
    const steps = empty.createEl("ol", { cls: "gi-empty-steps" });
    steps.createEl("li", { text: t("empty.step1") });
    steps.createEl("li", { text: t("empty.step2") });
    steps.createEl("li", { text: t("empty.step3") });
  }

  // =========================================================================
  // Tab bar + tab containers
  // =========================================================================
  const tabContainers = new Map<TabId, HTMLElement>();

  buildTabBar(panelEl, panel.activeTab, tabContainers, (tab) => {
    panel.activeTab = tab;
    // Clear settings filter when switching tabs
    if (settingsFilterInput) {
      settingsFilterInput.value = "";
      applySettingsFilter("");
    }
  }, panel);

  // --- Settings filter (searches across all tabs) ---
  const settingsFilterWrapper = panelEl.createDiv({ cls: "gi-search-wrapper gi-settings-filter-wrapper" });
  const settingsFilterIcon = settingsFilterWrapper.createEl("span", { cls: "gi-search-icon" });
  setIcon(settingsFilterIcon, "search");
  const settingsFilterInput = settingsFilterWrapper.createEl("input", {
    cls: "gi-settings-filter",
    type: "text",
    placeholder: t("settingsFilter.placeholder"),
    attr: { "aria-label": t("settingsFilter.placeholder") },
  });
  const settingsFilterClearBtn = settingsFilterWrapper.createEl("span", { cls: "gi-search-clear" });
  settingsFilterClearBtn.textContent = "\u00d7";
  settingsFilterClearBtn.style.display = "none";

  for (const def of TAB_DEFS) {
    const container = panelEl.createDiv({ cls: "gi-tab-content" });
    if (def.id === panel.activeTab) container.addClass("is-active");
    tabContainers.set(def.id, container);
  }

  function applySettingsFilter(query: string) {
    const q = query.toLowerCase().trim();
    for (const [, tabEl] of tabContainers) {
      // Filter setting items
      const items = tabEl.querySelectorAll(".setting-item");
      for (const item of Array.from(items)) {
        const text = (item as HTMLElement).textContent?.toLowerCase() || "";
        (item as HTMLElement).style.display = q && !text.includes(q) ? "none" : "";
      }
      // Filter sections: hide if all children hidden
      const sections = tabEl.querySelectorAll(".graph-control-section");
      for (const sec of Array.from(sections)) {
        const header = sec.querySelector(".graph-control-section-header");
        const headerText = header?.textContent?.toLowerCase() || "";
        const children = sec.querySelectorAll(".setting-item");
        const anyVisible = Array.from(children).some(c => (c as HTMLElement).style.display !== "none");
        const sectionMatch = q && headerText.includes(q);
        (sec as HTMLElement).style.display = q && !anyVisible && !sectionMatch ? "none" : "";
        // If section header matches, show all its children
        if (sectionMatch) {
          for (const c of Array.from(children)) (c as HTMLElement).style.display = "";
        }
      }
    }
    // When filtering, show all tabs; when not, restore original tab state
    if (q) {
      for (const [, el] of tabContainers) {
        el.addClass("is-active"); // Override CSS display:none on non-active tabs
        el.style.display = "";
      }
    } else {
      for (const [id, el] of tabContainers) {
        el.toggleClass("is-active", id === panel.activeTab);
        el.style.display = ""; // Clear any inline override
      }
    }
  }

  settingsFilterInput.addEventListener("input", () => {
    settingsFilterClearBtn.style.display = settingsFilterInput.value ? "flex" : "none";
    applySettingsFilter(settingsFilterInput.value);
  });
  settingsFilterClearBtn.addEventListener("click", () => {
    settingsFilterInput.value = "";
    settingsFilterInput.dispatchEvent(new Event("input"));
    settingsFilterClearBtn.style.display = "none";
  });

  const filterTab = tabContainers.get("filter")!;
  const displayTab = tabContainers.get("display")!;
  const layoutTab = tabContainers.get("layout")!;
  const nodesTab = tabContainers.get("nodes")!;
  const settingsTab = tabContainers.get("settings")!;

  // Preset bar (quick-apply simple/analysis/creative presets)
  buildPresetBar(panelEl, cb);

  // 統計ダッシュボード（プリセットバーの下に配置）
  _buildStatsBar(panelEl, panel, ctx);

  // Lazy tab construction — only build the active tab initially.
  // Other tabs are built on first activation or when settings filter is used.
  const tabBuilders: Record<TabId, () => void> = {
    filter:   () => buildFilterTab(filterTab, panel, ctx, cb),
    display:  () => buildDisplayTab(displayTab, panel, ctx, cb),
    layout:   () => buildLayoutTab(layoutTab, panel, ctx, cb),
    nodes:    () => _buildNodesTab(nodesTab, panel, ctx, cb),
    settings: () => buildSettingsTab(settingsTab, panel, ctx, cb),
  };
  const builtTabs = new Set<TabId>();

  function ensureTabBuilt(tabId: TabId) {
    if (builtTabs.has(tabId)) return;
    builtTabs.add(tabId);
    tabBuilders[tabId]();
  }

  function ensureAllTabsBuilt() {
    for (const def of TAB_DEFS) ensureTabBuilt(def.id);
  }

  // Build active tab immediately
  ensureTabBuilt(panel.activeTab);

  // Patch tab switch to lazily build on first visit
  const origOnSwitch = tabContainers.get(panel.activeTab)!.parentElement;
  const tabBar = panelEl.querySelector(".gi-tab-bar");
  if (tabBar) {
    // Re-wire click handlers to include lazy build
    const buttons = tabBar.querySelectorAll<HTMLButtonElement>(".gi-tab-btn");
    buttons.forEach((btn, idx) => {
      const tabId = TAB_DEFS[idx]?.id;
      if (!tabId) return;
      btn.addEventListener("click", () => ensureTabBuilt(tabId), { once: true });
    });
  }

  // Patch settings filter to build all tabs on first use
  settingsFilterInput.addEventListener("input", () => ensureAllTabsBuilt(), { once: true });
}

// ---------------------------------------------------------------------------
// Tab builders — extracted from buildPanel() for readability
// ---------------------------------------------------------------------------

function buildFilterTab(
  filterTab: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  buildSection(filterTab, t("section.filter"), (body) => {
    // --- Basic (always visible) ---
    addToggle(body, t("filter.includeTagsInData"), panel.includeTagsInData, (v) => { panel.includeTagsInData = v; cb.invalidateDataKeepPanel(); }, t("desc.includeTagsInData"));
    addToggle(body, t("filter.orphans"), panel.showOrphans, (v) => { panel.showOrphans = v; cb.invalidateDataKeepPanel(); cb.rebuildPanel(); }, t("desc.orphans"));
    // GK: Auto-fit on filter change
    addToggle(body, t("filter.autoFit") ?? "Auto-fit on filter", panel.autoFitOnFilter, (v) => { panel.autoFitOnFilter = v; cb.markDirty(); });
    // FZ: Degree filter
    addSlider(body, t("filter.minDegree") ?? "Min Degree", 0, 50, 1, panel.minDegreeFilter, (v) => {
      panel.minDegreeFilter = v;
      cb.invalidateDataKeepPanel();
      cb.announceA11y?.(`${t("filter.minDegree") ?? "Min Degree"}: ${v}`);
    });
    addSlider(body, t("filter.maxDegree") ?? "Max Degree", 0, 200, 1, panel.maxDegreeFilter, (v) => {
      panel.maxDegreeFilter = v;
      cb.invalidateDataKeepPanel();
      cb.announceA11y?.(`${t("filter.maxDegree") ?? "Max Degree"}: ${v}`);
    });
    addSelect(body, t("filter.tagDisplay"), [
      { value: "off", label: t("filter.tagDisplay.off") },
      { value: "node", label: t("filter.tagDisplay.node") },
      { value: "enclosure", label: t("filter.tagDisplay.enclosure") },
    ], !panel.showTagNodes ? "off" : panel.tagDisplay, (v) => {
      panel.showTagNodes = v !== "off";
      panel.tagDisplay = v === TAG_DISPLAY_ENCLOSURE ? TAG_DISPLAY_ENCLOSURE : TAG_DISPLAY_NODE;
      cb.invalidateDataKeepPanel();
      cb.rebuildPanel(); // Progressive disclosure: tag shape / enclosure settings
    }, t("desc.tagDisplay"));
    // --- Advanced (hidden by default) ---
    addAdvancedGroup(body, (adv) => {
      addToggle(adv, t("filter.attachments"), panel.showAttachments, (v) => { panel.showAttachments = v; cb.invalidateDataKeepPanel(); }, t("desc.attachments"));
      addToggle(adv, t("filter.existingOnly"), panel.existingOnly, (v) => { panel.existingOnly = v; cb.invalidateDataKeepPanel(); }, t("desc.existingOnly"));
      if (panel.showOrphans) {
        addTextInput(adv, t("filter.orphanClusterField"), panel.orphanClusterField ?? "", "category, folder, tag", (v) => { panel.orphanClusterField = v; cb.invalidateDataKeepPanel(); });
      }
      // Dataview query filter
      const dvRow = adv.createDiv({ cls: "gi-setting-row" });
      dvRow.createEl("span", { cls: "gi-setting-label", text: t("filter.dataviewQuery") });
      const dvInput = dvRow.createEl("input", { cls: "gi-setting-input", type: "text" });
      dvInput.value = panel.dataviewQuery;
      dvInput.placeholder = '#tag, "folder"';
      dvInput.setAttribute("aria-label", t("filter.dataviewHint"));
      // Check if Dataview plugin is available
      const dvApi = (ctx.app as any)?.plugins?.plugins?.dataview?.api;
      if (!dvApi) {
        dvInput.disabled = true;
        dvInput.placeholder = t("filter.dataviewUnavailable");
      }
      dvInput.addEventListener("change", () => {
        panel.dataviewQuery = dvInput.value.trim();
        cb.invalidateDataKeepPanel();
      });
      adv.createEl("p", { cls: "gi-hint", text: t("filter.dataviewHint") });
    });
  }, tHelp("help.filter"), false, "filter");

  buildSection(filterTab, t("section.groups"), (body) => {
    const list = body.createDiv();
    renderGroupList(list, panel, ctx, cb);
    const addBtn = body.createEl("button", { cls: "gi-add-group", text: t("groups.addGroup") });
    addBtn.addEventListener("click", () => {
      const idx = panel.groups.length;
      panel.groups.push({ expression: null, color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });
      renderGroupList(list, panel, ctx, cb);
    });
  }, tHelp("help.groups"), false, "layers");

  // --- ブックマークセクション ---
  _buildBookmarkSection(filterTab, panel, ctx, cb);
}

// ---------------------------------------------------------------------------
// Bookmark section builder (Feature L)
// ---------------------------------------------------------------------------
function _buildBookmarkSection(
  tabEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.bookmarks"), (body) => {
    if (panel.bookmarkedNodes.length === 0) {
      body.createEl("p", { cls: "gi-hint", text: t("bookmark.empty") });
      return;
    }
    const list = body.createDiv({ cls: "gi-bookmark-list" });
    for (const nodeId of panel.bookmarkedNodes) {
      const row = list.createDiv({ cls: "gi-bookmark-item" });
      // ノード名ラベル — クリックでジャンプ
      const label = row.createEl("span", { cls: "gi-bookmark-label", text: nodeId });
      label.addEventListener("click", () => { cb.jumpToNode(nodeId); });
      // 削除ボタン
      const removeBtn = row.createEl("span", { cls: "gi-bookmark-remove" });
      setIcon(removeBtn, "x");
      removeBtn.setAttribute("aria-label", t("bookmark.remove"));
      removeBtn.addEventListener("click", () => {
        panel.bookmarkedNodes = panel.bookmarkedNodes.filter(id => id !== nodeId);
        cb.markDirty();
        cb.rebuildPanel();
      });
    }
  }, tHelp("help.bookmarks"), false, "star");
}

// ---------------------------------------------------------------------------
// Display tab section builders (file-private)
// ---------------------------------------------------------------------------

function _buildNodeDisplaySection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.displayNodes"), (body) => {
    // --- Basic (always visible) ---
    // Node color mode dropdown
    const colorModeOptions = [
      { value: "default", label: t("display.nodeColor.default") },
      { value: "category", label: t("display.nodeColor.category") },
      { value: "heatmap", label: t("display.nodeColor.heatmap") },
      { value: "community", label: t("display.nodeColor.community") },
      { value: "field", label: t("display.nodeColor.field") ?? "By Field" },
    ];
    const currentColorMode = panel.nodeColorMode ?? "category";
    addSelect(body, t("display.nodeColorMode"), colorModeOptions, currentColorMode, (v) => {
      panel.nodeColorMode = v as PanelState["nodeColorMode"];
      cb.recolorNodes();
      cb.rebuildPanel();
    }, t("desc.nodeColorMode"));
    // EO+EQ: Field selector when mode is "field" (with autocomplete from frontmatter)
    if (currentColorMode === "field") {
      const fields = cb.collectFieldSuggestions();
      const options = [{ value: "", label: "-- select --" }, ...fields.map(f => ({ value: f, label: f }))];
      addSelect(body, t("display.nodeColorField") ?? "Color Field", options, panel.nodeColorField ?? "", (v) => {
        panel.nodeColorField = v;
        cb.recolorNodes();
      });
      // ET: Custom color palette input
      addTextInput(body, t("display.customPalette") ?? "Custom Palette", panel.customColorPalette ?? "", "#ff0000, #00ff00, #0000ff", (v) => {
        panel.customColorPalette = v;
        cb.recolorNodes();
      });
    }
    addSlider(body, t("display.nodeSize"), 5, 300, 1, panel.nodeSize, (v) => { panel.nodeSize = v; cb.resetZoomBaseNodeSize(); cb.recalcNodeRadii(); cb.markDirty(); }, t("desc.nodeSize"));
    addSlider(body, t("display.textFade"), 0, 1, 0.05, panel.textFadeThreshold, (v) => { panel.textFadeThreshold = v; cb.applyTextFade(); }, t("desc.textFade"));
    // Label density at zoom-out
    const rtDens = mergeRenderThresholds(panel.renderThresholds);
    addSlider(body, t("display.labelDensity") ?? "Label Density", 0.2, 3.0, 0.1, rtDens.labelDensity, (v) => {
      ensureRT(panel).labelDensity = v;
      cb.applyTextFade();
      cb.announceA11y?.(`${t("display.labelDensity") ?? "Label Density"}: ${v.toFixed(1)}`);
    }, t("desc.labelDensity") ?? "Controls how many labels are shown when zoomed out");
    // Label mode override (auto / initials / truncated / full)
    const rtMode = mergeRenderThresholds(panel.renderThresholds);
    addSelect(body, t("display.labelMode") ?? "Label Mode", [
      { value: "auto", label: "Auto (zoom)" },
      { value: "initials", label: "Initials (2 chars)" },
      { value: "truncated", label: "Truncated (5-12)" },
      { value: "full", label: "Full name" },
    ], rtMode.labelModeOverride, (v) => {
      ensureRT(panel).labelModeOverride = v as "auto" | "initials" | "truncated" | "full";
      cb.applyTextFade();
      cb.announceA11y?.(`${t("display.labelMode") ?? "Label Mode"}: ${v}`);
    });

    // GD: Label max characters
    const rtLabel = mergeRenderThresholds(panel.renderThresholds);
    addSlider(body, t("display.labelMaxChars") ?? "Label Max Chars", 0, 60, 1, rtLabel.labelMaxChars, (v) => {
      ensureRT(panel).labelMaxChars = v;
      cb.markDirty();
    });
    // --- Advanced (hidden by default) ---
    addAdvancedGroup(body, (adv) => {
      const rtNode = mergeRenderThresholds(panel.renderThresholds);
      addToggle(adv, t("display.nodeSizeByDegree"), rtNode.nodeSizeByDegree, (v) => {
        ensureRT(panel).nodeSizeByDegree = v;
        cb.recalcNodeRadii();
        cb.markDirty();
      }, t("desc.nodeSizeByDegree"));
      addTextInput(adv, t("display.nodeSubLabelFields"), panel.nodeSubLabelFields ?? "", "e.g. category, date, degree", (v) => {
        panel.nodeSubLabelFields = v;
        cb.rebuildNodesInPlace();
      });
      addTextInput(adv, t("display.hoverTooltipFields"), panel.hoverTooltipFields ?? "", "e.g. date, story_order", (v) => {
        panel.hoverTooltipFields = v;
        cb.markDirty();
      });
      // IE: Hover/card content checklist
      addToggle(adv, t("display.hoverShowTitle") ?? "Hover: Title", panel.hoverShowTitle, (v) => { panel.hoverShowTitle = v; cb.markDirty(); });
      addToggle(adv, t("display.hoverShowMeta") ?? "Hover: Metadata", panel.hoverShowMeta, (v) => { panel.hoverShowMeta = v; cb.markDirty(); });
      addToggle(adv, t("display.hoverShowBody") ?? "Hover: Body", panel.hoverShowBody, (v) => { panel.hoverShowBody = v; cb.markDirty(); });
      // A3: Node icon prefix
      addTextInput(adv, t("display.nodeIconField"), panel.nodeIconField ?? "", "e.g. node_type", (v) => {
        panel.nodeIconField = v;
        cb.rebuildNodesInPlace();
      });
      addTextInput(adv, t("display.nodeIconMap"), JSON.stringify(panel.nodeIconMap ?? {}), '{"character":"👤","episode":"📖"}', (v) => {
        try { panel.nodeIconMap = JSON.parse(v); } catch { /* ignore invalid JSON */ }
        cb.rebuildNodesInPlace();
      });
      addSlider(adv, t("display.hoverHops"), 1, 5, 1, panel.hoverHops, (v) => { panel.hoverHops = v; cb.rebuildHoverAdj(); cb.applyHover(); cb.markDirty(); }, t("desc.hoverHops"));
      // Hover edge type filter — which edge types to follow during hover BFS
      const het = panel.hoverEdgeTypes ?? { link: true, semantic: false, tag: false, hasTag: false, similar: false, sibling: false, sequence: false, inheritance: true, aggregation: true };
      const hoverTypeEntries: [string, string][] = [
        ["link", t("hover.link") ?? "Link"],
        ["semantic", t("hover.semantic") ?? "Semantic"],
        ["tag", t("hover.tag") ?? "Tag"],
        ["hasTag", t("hover.hasTag") ?? "Has-Tag"],
        ["similar", t("hover.similar") ?? "Similar"],
        ["inheritance", t("hover.inheritance") ?? "Inheritance"],
        ["aggregation", t("hover.aggregation") ?? "Aggregation"],
        ["sibling", t("hover.sibling") ?? "Sibling"],
        ["sequence", t("hover.sequence") ?? "Sequence"],
      ];
      for (const [key, label] of hoverTypeEntries) {
        addToggle(adv, label, (het as any)[key] ?? false, (v) => {
          if (!panel.hoverEdgeTypes) panel.hoverEdgeTypes = { ...het };
          (panel.hoverEdgeTypes as any)[key] = v;
          cb.rebuildHoverAdj();
          cb.applyHover();
          cb.markDirty();
        });
      }
      // HR: Max hover neighbor labels
      const rtHover = mergeRenderThresholds(panel.renderThresholds);
      addSlider(adv, t("display.maxHoverLabels") ?? "Max Hover Labels", 5, 100, 5, rtHover.maxHoverNeighborLabels, (v) => {
        ensureRT(panel).maxHoverNeighborLabels = v;
        cb.applyHover();
        cb.announceA11y?.(`${t("display.maxHoverLabels") ?? "Max Hover Labels"}: ${v}`);
      });
      // フォーカスモード: クリックでハイライトを固定
      addToggle(adv, t("display.focusMode"), panel.focusMode, (v) => {
        panel.focusMode = v;
        if (!v) { panel.focusNodeId = null; cb.applyHover(); }
        cb.markDirty();
        cb.rebuildPanel();
      }, t("desc.focusMode"));
      // R2: フォーカスコーン — only shown when focusMode is enabled (progressive disclosure)
      if (panel.focusMode) {
        addToggle(adv, t("display.focusCone"), panel.focusConeEnabled ?? true, (v) => {
          panel.focusConeEnabled = v;
          cb.applyHover();
        }, t("desc.focusCone"));
      }
      // R2: highlightMissingNeighbors toggle removed — now controlled via analysisOverlay dropdown
      // --- ノード形状 ---
      // GH: Shape preview swatches
      const shapeIcons: Record<string, string> = {
        circle: "O", triangle: "^", square: "#", diamond: "<>",
        pentagon: "5", hexagon: "6", star: "*", cross: "+",
      };
      const shapeOptions = ALL_SHAPES.map(s => ({ value: s, label: `${shapeIcons[s] ?? ""} ${t(`shape.${s}`)}` }));
      const defaultRule = panel.nodeShapeRules.find(r => r.match === "default");
      if (panel.showTagNodes) {
        const tagRule = panel.nodeShapeRules.find(r => r.match === "isTag");
        addSelect(adv, t("display.tagNodeShape"), shapeOptions, tagRule?.shape ?? "triangle", (v) => {
          const rule = panel.nodeShapeRules.find(r => r.match === "isTag");
          if (rule) rule.shape = v as NodeShape;
          else panel.nodeShapeRules.unshift({ match: "isTag", shape: v as NodeShape });
          cb.rebuildNodesInPlace();
        }, t("desc.tagNodeShape"));
      }
      addSelect(adv, t("display.defaultNodeShape"), shapeOptions, defaultRule?.shape ?? "circle", (v) => {
        const rule = panel.nodeShapeRules.find(r => r.match === "default");
        if (rule) rule.shape = v as NodeShape;
        else panel.nodeShapeRules.push({ match: "default", shape: v as NodeShape });
        cb.rebuildNodesInPlace();
      }, t("desc.defaultNodeShape"));
    });
  }, tHelp("help.displayNodes"), false, "circle-dot");
}

function _buildNodeDisplayModeSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("display.nodeDisplayMode"), (body) => {
    const modeOptions = [
      { value: "node", label: t("display.modeNode") },
      { value: "card", label: t("display.modeCard") },
      { value: "donut", label: t("display.modeDonut") },
      { value: "sunburst-segment", label: t("display.modeSunburst") },
    ];
    addSelect(body, t("display.nodeDisplayMode"), modeOptions, panel.nodeDisplayMode, (v) => {
      panel.nodeDisplayMode = v as NodeDisplayMode;
      cb.doRenderKeepPanel();
      cb.rebuildPanel(); // Progressive disclosure: card/donut sub-settings
      // HF: Announce display mode change for screen readers
      const modeLabel = modeOptions.find(o => o.value === v)?.label ?? v;
      cb.announceA11y?.(`${t("display.nodeDisplayMode")}: ${modeLabel}`);
    }, t("desc.nodeDisplayMode"));

    // Progressive disclosure: show sub-settings based on mode
    if (panel.nodeDisplayMode === "card") {
      // FO: Card display presets
      addSelect(body, t("display.cardPreset") ?? "Card Preset", [
        { value: "custom", label: t("display.cardPresetCustom") ?? "Custom" },
        { value: "compact", label: t("display.cardPresetCompact") ?? "Compact" },
        { value: "detailed", label: t("display.cardPresetDetailed") ?? "Detailed" },
        { value: "full", label: t("display.cardPresetFull") ?? "Full" },
      ], "custom", (v) => {
        if (v === "compact") {
          panel.cardDisplayConfig = { ...panel.cardDisplayConfig, fields: [], maxWidth: 80, showIcon: false, headerStyle: "plain" };
        } else if (v === "detailed") {
          panel.cardDisplayConfig = { ...panel.cardDisplayConfig, fields: ["category"], maxWidth: 150, showIcon: true, headerStyle: "table" };
        } else if (v === "full") {
          panel.cardDisplayConfig = { ...panel.cardDisplayConfig, fields: ["category", "node_type", "tags"], maxWidth: 200, showIcon: true, headerStyle: "table" };
        }
        cb.doRenderKeepPanel();
      });
      addTextInput(body, t("display.cardFields"),
        panel.cardDisplayConfig.fields.join(", "),
        "e.g. category, tags, node_type",
        (v) => {
          panel.cardDisplayConfig.fields = v.split(",").map(s => s.trim()).filter(Boolean);
          cb.doRenderKeepPanel();
        });
      addSlider(body, t("display.cardMaxWidth"), 60, 300, 10, panel.cardDisplayConfig.maxWidth ?? 120, (v) => {
        panel.cardDisplayConfig.maxWidth = v;
        cb.doRenderKeepPanel();
      });
      addToggle(body, t("display.cardShowIcon"), panel.cardDisplayConfig.showIcon ?? false, (v) => {
        panel.cardDisplayConfig.showIcon = v;
        cb.doRenderKeepPanel();
      });
      addSelect(body, t("display.cardHeaderStyle"), [
        { value: "plain", label: t("display.cardStylePlain") },
        { value: "table", label: t("display.cardStyleTable") },
      ], panel.cardDisplayConfig.headerStyle ?? "plain", (v) => {
        panel.cardDisplayConfig.headerStyle = v as "plain" | "table";
        cb.doRenderKeepPanel();
      });
      addSelect(body, t("display.cardFieldFormat") ?? "Field Format", [
        { value: "key-value", label: "Key: Value" },
        { value: "value-only", label: "Value Only" },
      ], panel.cardDisplayConfig.fieldFormat ?? "key-value", (v) => {
        panel.cardDisplayConfig.fieldFormat = v as "key-value" | "value-only";
        cb.doRenderKeepPanel();
      });
      // FT: Card body max lines
      const rtCard = mergeRenderThresholds(panel.renderThresholds);
      addSlider(body, t("display.cardBodyLines") ?? "Body Lines", 0, 10, 1, rtCard.cardBodyMaxLines, (v) => {
        ensureRT(panel).cardBodyMaxLines = v;
        cb.doRenderKeepPanel();
      });
      // HM: Card content scale — log-based size boost from body length
      addSlider(body, t("display.cardContentScale") ?? "Card Size by Content", 0, 2.0, 0.1, rtCard.cardContentScale, (v) => {
        ensureRT(panel).cardContentScale = v;
        cb.recalcNodeRadii();
        cb.markDirty();
        cb.announceA11y?.(`${t("display.cardContentScale") ?? "Card Size by Content"}: ${(v * 100).toFixed(0)}%`);
      }, t("desc.cardContentScale"));
      // GE: Card background opacity
      const crcGE = panel.cardRenderConfig ?? {};
      addSlider(body, t("display.cardBgOpacity") ?? "Card Opacity", 0.1, 1.0, 0.05, (crcGE as any).plainCardFillAlpha ?? 0.8, (v) => {
        if (!panel.cardRenderConfig) panel.cardRenderConfig = {} as any;
        (panel.cardRenderConfig as any).plainCardFillAlpha = v;
        cb.doRenderKeepPanel();
      });
      // FX: Card body font size
      addSlider(body, t("display.cardBodyFontSize") ?? "Body Font Size", 4, 16, 1, rtCard.cardBodyFontSize, (v) => {
        ensureRT(panel).cardBodyFontSize = v;
        cb.doRenderKeepPanel();
      });
    } else if (panel.nodeDisplayMode === "donut") {
      addTextInput(body, t("display.donutBreakdown"),
        panel.donutDisplayConfig.breakdownField ?? "",
        "e.g. category, node_type",
        (v) => {
          panel.donutDisplayConfig.breakdownField = v.trim() || undefined;
          cb.doRenderKeepPanel();
        });
      addSlider(body, t("display.donutInnerRadius"), 0, 0.9, 0.05, panel.donutDisplayConfig.innerRadius ?? 0.6, (v) => {
        panel.donutDisplayConfig.innerRadius = v;
        cb.doRenderKeepPanel();
      });
    }
    // sunburst-segment mode: uses default arcAngle (30 degrees)
  }, t("desc.nodeDisplayMode"), false, "layout-grid");
}

function _buildNodeDecorationSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.nodeDecorations"), (body) => {
    // Semantic zoom
    addToggle(body, t("display.semanticZoom"), panel.semanticZoom, (v) => {
      panel.semanticZoom = v;
      cb.markDirty();
    }, t("desc.semanticZoom"));
    // Auto LOD (5-level)
    addToggle(body, t("display.autoLOD"), panel.renderThresholds?.autoLOD ?? false, (v) => {
      ensureRT(panel).autoLOD = v;
      cb.markDirty();
    }, t("desc.autoLOD"));
    // Tag badges
    addToggle(body, t("display.showTagBadges"), panel.showTagBadges, (v) => {
      panel.showTagBadges = v;
      cb.markDirty();
    }, t("desc.showTagBadges"));
    // Importance ring
    addToggle(body, t("display.showImportanceRing"), panel.showImportanceRing, (v) => {
      panel.showImportanceRing = v;
      cb.markDirty();
      cb.rebuildPanel();
    }, t("desc.showImportanceRing"));
    if (panel.showImportanceRing) {
      addSelect(body, t("display.importanceMetric"), [
        { value: "degree", label: t("display.metricDegree") },
        { value: "betweenness", label: t("display.metricBetweenness") },
        // pagerank option removed — not implemented, falls back to degree silently
      ], panel.importanceMetric, (v) => {
        panel.importanceMetric = v as "degree" | "betweenness" | "pagerank";
        cb.markDirty();
      }, t("desc.importanceMetric"));
    }
    // Recency marker
    addToggle(body, t("display.showRecencyMarker"), panel.showRecencyMarker, (v) => {
      panel.showRecencyMarker = v;
      cb.markDirty();
      cb.rebuildPanel();
    }, t("desc.showRecencyMarker"));
    if (panel.showRecencyMarker) {
      addSlider(body, t("display.recencyDays"), 1, 90, 1, panel.recencyDays, (v) => {
        panel.recencyDays = v;
        cb.markDirty();
      });
    }
    // Definition field
    addTextInput(body, t("display.definitionField"), panel.definitionField,
      "e.g. definition, summary",
      (v) => {
        panel.definitionField = v.trim();
        cb.rebuildNodesInPlace();
      });
    // Gate: showNodeThumbnails only when nodes have image/thumbnail/cover metadata
    if (_ctx.hasImageMetaNodes) {
      addToggle(body, t("display.showNodeThumbnails") ?? "Node Thumbnails", panel.showNodeThumbnails, (v) => {
        panel.showNodeThumbnails = v;
        cb.refreshOverlays();
      }, t("desc.showNodeThumbnails") ?? "Show frontmatter image as node thumbnail");
    }
  }, tHelp("help.nodeDecorations"), false, "sparkles");
}

function _buildStructureAnalysisSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.structureAnalysis"), (body) => {
    // Gate: ontology backbone requires ontology rules
    if (_ctx.settings.ontology?.rules?.length) {
      addToggle(body, t("display.ontologyBackbone"), panel.showOntologyBackbone ?? false, (v) => {
        panel.showOntologyBackbone = v;
        cb.markDirty();
        cb.rebuildPanel();
      }, t("desc.ontologyBackbone"));
    }
    // Gate: cluster label detail only when tag enclosures are active
    if (panel.showTagNodes && panel.tagDisplay === "enclosure") {
      addSelect(body, t("display.clusterLabelDetail"), [
        { value: "minimal", label: t("display.clusterLabelMinimal") },
        { value: "standard", label: t("display.clusterLabelStandard") },
        { value: "detailed", label: t("display.clusterLabelDetailed") },
        { value: "rich", label: t("display.clusterLabelRich") },
      ], panel.clusterLabelDetail, (v) => {
        panel.clusterLabelDetail = v as "minimal" | "standard" | "detailed" | "rich";
        cb.markDirty();
      }, t("desc.clusterLabelDetail"));
    }
    addToggle(body, t("display.highlightPatterns"), panel.highlightPatterns, (v) => {
      panel.highlightPatterns = v;
      cb.markDirty();
    }, t("desc.highlightPatterns"));
    // R2: showBridgeNodes toggle removed — now controlled via analysisOverlay dropdown
    // Gate: focusLayout requires focusMode
    if (panel.focusMode) {
      addToggle(body, t("display.focusLayout"), panel.focusLayout, (v) => {
        panel.focusLayout = v;
        if (v && panel.localGraphCenter) {
          panel.clusterArrangement = "ego";
        }
        cb.doRender();
        cb.rebuildPanel();
      }, t("desc.focusLayout"));
    }
    // Gate: hierarchy breadcrumb requires local graph mode
    if (panel.localGraphCenter) {
      addToggle(body, t("display.showHierarchyBreadcrumb"), panel.showHierarchyBreadcrumb, (v) => {
        panel.showHierarchyBreadcrumb = v;
        cb.refreshOverlays();
      }, t("desc.showHierarchyBreadcrumb"));
    }
    // M2: Apply Ego Layout button — gate: needs a focused/highlighted node
    if (panel.focusNodeId || panel.localGraphCenter) {
      const egoBtn = body.createEl("button", { cls: "mod-cta", text: t("action.applyEgoLayout") });
      egoBtn.style.marginTop = "6px";
      egoBtn.style.width = "100%";
      egoBtn.addEventListener("click", () => {
        cb.applyEgoToVisible?.();
      });
    }
    // F5: Relation matrix
    addToggle(body, t("display.relationMatrix"), panel.showRelationMatrix, (v) => {
      panel.showRelationMatrix = v;
      cb.refreshOverlays();
    }, t("desc.relationMatrix"));
  }, tHelp("help.structureAnalysis"), true, "git-branch");
}

function _buildDiscoverySection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.discovery"), (body) => {
    // R2: Consolidated analysis overlay dropdown
    addSelect(body, t("display.analysisOverlay"), [
      { value: "off", label: t("analysis.off") },
      { value: "bridges", label: t("analysis.bridges") },
      { value: "entropy", label: t("analysis.entropy") },
      { value: "gaps", label: t("analysis.gaps") },
      { value: "missing", label: t("analysis.missing") },
      { value: "density", label: t("analysis.density") },
      { value: "all", label: t("analysis.all") },
    ], panel.analysisOverlay ?? "off", (v) => {
      panel.analysisOverlay = v as PanelState["analysisOverlay"];
      // doRender() so GVC._applyAnalysisOverlay() runs (sets _showDensityHeatmap)
      cb.doRender();
    });
    // S1: Hierarchy Tree Overlay — only when inheritance edges exist
    if (_ctx.hasInheritanceEdges) {
      addToggle(body, t("display.hierarchyTree"), panel.showHierarchyTree ?? false, (v) => {
        panel.showHierarchyTree = v;
        cb.markDirty();
        cb.rebuildPanel();
      }, t("desc.hierarchyTree"));
    }
    addToggle(body, t("display.similarSuggestions"), panel.showSimilarSuggestions, (v) => {
      panel.showSimilarSuggestions = v;
      cb.markDirty();
    }, t("desc.similarSuggestions"));
    addToggle(body, t("display.structureQuestions"), panel.showStructureQuestions, (v) => {
      panel.showStructureQuestions = v;
      cb.refreshOverlays();
    }, t("desc.structureQuestions"));
    addToggle(body, t("display.clusterCompare"), panel.showClusterCompare, (v) => {
      panel.showClusterCompare = v;
      cb.markDirty();
    }, t("desc.clusterCompare"));
  }, tHelp("help.discovery"), true, "lightbulb");
}

function _buildInteractionSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.interaction"), (body) => {
    // Multi-select: show status label only when active
    if (panel.multiSelectNodeIds.length > 0) {
      addToggle(body, t("display.multiSelect"), true, (v) => {
        if (!v) { panel.multiSelectNodeIds = []; cb.rebuildPanel(); }
        cb.markDirty();
      }, t("desc.multiSelect"));
    }

    // C6: Multi-select status and bulk actions
    if (panel.multiSelectNodeIds.length > 0) {
      const msInfo = body.createDiv({ cls: "setting-item" });
      msInfo.createEl("span", {
        text: t("label.selectedNodes").replace("{count}", String(panel.multiSelectNodeIds.length)),
        cls: "gi-ms-label",
      });

      const msRow = body.createDiv({ cls: "setting-item" });
      const addTagBtn = msRow.createEl("button", { text: t("action.addTag") });
      addTagBtn.addEventListener("click", () => {
        const tag = prompt("Tag:");
        if (tag) cb.bulkAddTag?.(panel.multiSelectNodeIds, tag);
      });

      const setFieldBtn = msRow.createEl("button", { text: t("action.setField") });
      setFieldBtn.style.marginLeft = "4px";
      setFieldBtn.addEventListener("click", () => {
        const field = prompt("Field name:");
        if (!field) return;
        const value = prompt("Value:");
        if (value !== null) cb.bulkSetField?.(panel.multiSelectNodeIds, field, value);
      });

      const clearBtn = msRow.createEl("button", { text: t("action.clearSelection") });
      clearBtn.style.marginLeft = "4px";
      clearBtn.addEventListener("click", () => {
        panel.multiSelectNodeIds = [];
        cb.rebuildPanel();
        cb.markDirty();
      });
    }
  }, tHelp("help.interaction"), true, "mouse-pointer-2");
}


function _buildEdgeDisplaySection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.displayEdges"), (body) => {
    // --- Basic (always visible) ---
    addToggle(body, t("display.arrows"), panel.showArrows, (v) => { panel.showArrows = v; cb.markDirty(); }, t("desc.arrows"));
    addToggle(body, t("display.fadeEdges"), panel.fadeEdgesByDegree, (v) => { panel.fadeEdgesByDegree = v; cb.markDirty(); }, t("desc.fadeEdges"));
    // GG: Global edge opacity
    const rtEdge = mergeRenderThresholds(panel.renderThresholds);
    addSlider(body, t("display.edgeOpacity") ?? "Edge Opacity", 0.05, 1.0, 0.05, rtEdge.globalEdgeAlpha, (v) => {
      ensureRT(panel).globalEdgeAlpha = v;
      cb.markDirty();
    });
    addSlider(body, t("display.edgeMinZoom") ?? "Edge Min Zoom", 0, 0.1, 0.005, rtEdge.edgeMinZoom, (v) => {
      ensureRT(panel).edgeMinZoom = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("display.edgeMinZoom") ?? "Edge Min Zoom"}: ${v.toFixed(3)}`);
    }, t("desc.edgeMinZoom"));
    // Edge zoom fade threshold — controls gradual thinning/fading
    addSlider(body, t("display.edgeZoomFadeThreshold") ?? "Edge Zoom Fade", 0.1, 1.0, 0.05, rtEdge.edgeZoomFadeThreshold, (v) => {
      ensureRT(panel).edgeZoomFadeThreshold = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("display.edgeZoomFadeThreshold") ?? "Edge Zoom Fade"}: ${v.toFixed(2)}`);
    }, t("desc.edgeZoomFadeThreshold"));
    // Edge label zoom thresholds
    addSlider(body, t("display.edgeLabelZoomHide") ?? "Label Hide Zoom", 0, 0.5, 0.05, rtEdge.edgeLabelZoomHide, (v) => {
      ensureRT(panel).edgeLabelZoomHide = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("display.edgeLabelZoomHide") ?? "Label Hide Zoom"}: ${v.toFixed(2)}`);
    }, t("desc.edgeLabelZoomHide"));
    addSlider(body, t("display.edgeLabelZoomFade") ?? "Label Fade Zoom", 0.05, 1.0, 0.05, rtEdge.edgeLabelZoomFade, (v) => {
      ensureRT(panel).edgeLabelZoomFade = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("display.edgeLabelZoomFade") ?? "Label Fade Zoom"}: ${v.toFixed(2)}`);
    }, t("desc.edgeLabelZoomFade"));
    // Edge fade minimum alpha
    addSlider(body, t("display.edgeFadeMinAlpha") ?? "Edge Fade Floor", 0.01, 0.5, 0.01, rtEdge.edgeFadeMinAlpha, (v) => {
      ensureRT(panel).edgeFadeMinAlpha = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("display.edgeFadeMinAlpha") ?? "Edge Fade Floor"}: ${v.toFixed(2)}`);
    }, t("desc.edgeFadeMinAlpha"));
    // GW: Edge label font size
    addSlider(body, t("display.edgeLabelFontSize") ?? "Edge Label Size", 6, 18, 1, rtEdge.edgeLabelFontSize, (v) => {
      ensureRT(panel).edgeLabelFontSize = v;
      cb.markDirty();
    });
    // HV: Hover edge alpha falloff
    // IQ: Edge density floor — minimum alpha when many edges overlap
    addSlider(body, t("display.edgeDensityFloor") ?? "Edge Density Floor", 0.02, 0.5, 0.02, rtEdge.edgeDensityFloor, (v) => {
      ensureRT(panel).edgeDensityFloor = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("display.edgeDensityFloor") ?? "Edge Density Floor"}: ${v.toFixed(2)}`);
    });
    addSlider(body, t("display.hoverEdgeFalloff") ?? "Hover Edge Fade", 0.3, 0.95, 0.05, rtEdge.hoverEdgeFalloff, (v) => {
      ensureRT(panel).hoverEdgeFalloff = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("display.hoverEdgeFalloff") ?? "Hover Edge Fade"}: ${v.toFixed(2)}`);
    });
    // --- Advanced (hidden by default) ---
    addAdvancedGroup(body, (adv) => {
      addToggle(adv, t("display.edgeColor"), panel.colorEdgesByRelation, (v) => { panel.colorEdgesByRelation = v; cb.markDirty(); cb.rebuildPanel(); }, t("desc.edgeColor"));
      // Edge labels: simplified to on/off toggle
      addToggle(adv, t("display.edgeLabelMode.relation"), panel.showEdgeLabels, (v) => {
        panel.showEdgeLabels = v;
        cb.markDirty();
        cb.announceA11y?.(`Edge labels: ${v ? "on" : "off"}`);
      }, t("desc.edgeLabelMode"));
      addToggle(adv, t("display.edgeLayerMode"), panel.edgeLayerMode, (v) => { panel.edgeLayerMode = v; cb.markDirty(); }, t("desc.edgeLayerMode"));
      addSelect(adv, t("display.edgeDirectionFilter"), [
        { value: "all", label: t("display.edgeDirAll") },
        { value: "bidirectional", label: t("display.edgeDirBidirectional") },
        { value: "unidirectional", label: t("display.edgeDirUnidirectional") },
      ], panel.edgeDirectionFilter, (v) => {
        panel.edgeDirectionFilter = v as "all" | "bidirectional" | "unidirectional";
        cb.markDirty();
      }, t("desc.edgeDirectionFilter"));
      // Removed: showBidirectionalIndicator (subtle, rarely useful)
      // Removed: edgeStrengthGlow (subtle degree-based glow)
      // Removed: degreeEdgeWidth (default 0, minimal effect)
      // Removed: showPathfinderOverlay (keyboard-controlled S/E, not a settings item)
      // Removed: edgeWeightThickness (no weight data in typical vaults)
      // GN: Edge toggle with a11y announcements
      const _edgeToggle = (label: string, key: keyof PanelState, cb2: () => void) => (v: boolean) => {
        (panel as any)[key] = v;
        cb2();
        cb.announceA11y?.(`${label}: ${v ? "on" : "off"}`);
      };
      // Edge type toggles — hide types with 0 edges, show count for others
      const etc = _ctx.edgeTypeCounts ?? {};
      const edgeTypeToggles: [string, string, keyof PanelState, string, () => void][] = [
        [t("display.links"), "link", "showLinks", t("desc.links"), () => cb.markDirty()],
        [t("display.sharedTags"), "tag", "showTagEdges", t("desc.sharedTags"), () => cb.markDirty()],
        [t("display.sharedCategory"), "category", "showCategoryEdges", t("desc.sharedCategory"), () => cb.markDirty()],
        [t("display.semantic"), "semantic", "showSemanticEdges", t("desc.semantic"), () => cb.markDirty()],
        [t("display.inheritance"), "inheritance", "showInheritance", t("desc.inheritance"), () => cb.markDirty()],
        [t("display.aggregation"), "aggregation", "showAggregation", t("desc.aggregation"), () => cb.markDirty()],
        [t("display.similar"), "similar", "showSimilar", t("desc.similar"), () => cb.invalidateDataKeepPanel()],
        [t("display.sibling"), "sibling", "showSibling", t("desc.sibling"), () => cb.markDirty()],
        [t("display.sequence"), "sequence", "showSequence", t("desc.sequence"), () => cb.markDirty()],
      ];
      for (const [label, edgeType, key, desc, cb2] of edgeTypeToggles) {
        const count = etc[edgeType] ?? 0;
        if (count === 0) continue; // Hide toggles for edge types with no data
        const labelWithCount = `${label} (${count})`;
        addToggle(adv, labelWithCount, panel[key] as boolean, _edgeToggle(label, key, cb2), desc);
      }

      // Solo button: cycle through edge types one at a time
      const EDGE_TYPE_KEYS: (keyof PanelState)[] = [
        "showLinks", "showTagEdges", "showCategoryEdges", "showSemanticEdges",
        "showInheritance", "showAggregation", "showSimilar", "showSibling", "showSequence",
      ];
      const soloRow = adv.createDiv({ cls: "gi-setting-row" });
      const soloBtn = soloRow.createEl("button", { cls: "gi-solo-btn", text: t("display.soloEdgeType") });
      soloBtn.title = t("desc.soloEdgeType");
      soloBtn.addEventListener("click", () => {
        // Find currently soloed type (exactly one ON, rest OFF)
        const onKeys = EDGE_TYPE_KEYS.filter(k => panel[k] as boolean);
        if (onKeys.length === 1) {
          // Advance to next type
          const idx = EDGE_TYPE_KEYS.indexOf(onKeys[0]);
          const nextIdx = (idx + 1) % EDGE_TYPE_KEYS.length;
          if (nextIdx === 0) {
            // Wrapped around: restore all ON
            for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = true;
          } else {
            for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = false;
            (panel as unknown as Record<string, unknown>)[EDGE_TYPE_KEYS[nextIdx]] = true;
          }
        } else {
          // Start solo: turn on only the first type
          for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = false;
          (panel as unknown as Record<string, unknown>)[EDGE_TYPE_KEYS[0]] = true;
        }
        cb.markDirty();
        cb.rebuildPanel();
      });

      // Removed: edgeCardinalityMode (crow's foot notation — too niche for graph viz)
    });
  }, tHelp("help.displayEdges"), false, "git-branch");
}

function _buildCableDisplaySection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("display.cableBundleMode"), (body) => {
    addSelect(body, t("display.cableBundleMode"), [
      { value: "auto", label: t("display.cableModeAuto") },
      { value: "always", label: t("display.cableModeAlways") },
      { value: "never", label: t("display.cableModeNever") },
    ], panel.cableBundleMode, (v) => {
      panel.cableBundleMode = v as "auto" | "always" | "never";
      cb.markDirty();
      cb.rebuildPanel(); // Progressive disclosure: show/hide cable sub-sliders
    }, t("desc.cableBundleMode"));

    // Progressive disclosure: show sub-settings only when cables can be active
    if (panel.cableBundleMode !== "never") {
      addSlider(body, t("display.cableTrunkWidth"), 2, 24, 1, panel.cableTrunkWidth, (v) => {
        panel.cableTrunkWidth = v;
        cb.markDirty();
      }, t("desc.cableTrunkWidth"));
      addSlider(body, t("display.cableTrunkAlpha"), 0, 1, 0.05, panel.cableTrunkAlpha, (v) => {
        panel.cableTrunkAlpha = v;
        cb.markDirty();
      }, t("desc.cableTrunkAlpha"));
      addSlider(body, t("display.cableSpacing"), 2, 30, 1, panel.cableSpacing, (v) => {
        panel.cableSpacing = v;
        cb.markDirty();
      }, t("desc.cableSpacing"));
      addSlider(body, t("display.cableFanWidth"), 0.5, 6, 0.5, panel.cableFanWidth, (v) => {
        panel.cableFanWidth = v;
        cb.markDirty();
      }, t("desc.cableFanWidth"));
      addSlider(body, t("display.cableFanAlpha"), 0.05, 1, 0.05, panel.cableFanAlpha, (v) => {
        panel.cableFanAlpha = v;
        cb.markDirty();
      }, t("desc.cableFanAlpha"));
    }
  }, tHelp("help.cableBundle"), true, "git-merge");
}

function _buildRoadNetworkSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.roadNetwork"), (body) => {
    const rt = mergeRenderThresholds(panel.renderThresholds);
    addToggle(body, t("display.showRoadNetwork"), rt.showRoadNetwork, (v) => {
      ensureRT(panel).showRoadNetwork = v;
      cb.markDirty();
      cb.rebuildPanel(); // Progressive disclosure: show/hide road sub-settings
    }, t("desc.showRoadNetwork"));
    // Progressive disclosure: show sub-settings only when road network is active
    if (rt.showRoadNetwork) {
      addToggle(body, t("display.roadRouteEdges"), rt.roadRouteEdges, (v) => {
        ensureRT(panel).roadRouteEdges = v;
        cb.markDirty();
      }, t("desc.roadRouteEdges"));
      addSlider(body, t("display.roadAlpha"), 0.05, 0.8, 0.05, rt.roadAlpha, (v) => {
        ensureRT(panel).roadAlpha = v;
        cb.markDirty();
      }, t("desc.roadAlpha"));
      addSlider(body, t("display.roadWidth"), 2, 20, 1, rt.roadWidth, (v) => {
        ensureRT(panel).roadWidth = v;
        cb.markDirty();
      }, t("desc.roadWidth"));
    }
  }, tHelp("help.roadNetwork"), true, "map");
}

function _buildMinimapSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.displayOther"), (body) => {
    addToggle(body, t("display.minimap"), panel.showMinimap, (v) => { panel.showMinimap = v; cb.refreshOverlays(); }, t("desc.minimap"));
    addToggle(body, t("display.showLegend"), panel.showLegend, (v) => { panel.showLegend = v; cb.refreshOverlays(); }, t("desc.showLegend"));
    addToggle(body, t("display.oobIndicator"), panel.showOutOfBoundsIndicator ?? false, (v) => { panel.showOutOfBoundsIndicator = v; cb.markDirty(); }, t("desc.oobIndicator"));
    addToggle(body, t("display.graphStats"), panel.showGraphStats ?? false, (v) => { panel.showGraphStats = v; cb.refreshOverlays(); cb.rebuildPanel(); }, t("desc.graphStats"));
    // Removed: showAncestryBreadcrumb (tooltip-only, no visual change on graph)
    addToggle(body, t("display.highContrast") ?? "High Contrast", panel.highContrastMode, (v) => { panel.highContrastMode = v; cb.markDirty(); }, t("desc.highContrast") ?? "Thicker edges and stronger outlines for better visibility");
    // IL: Zoom wheel sensitivity slider (a11y: low-dexterity users)
    addSlider(body, t("display.zoomSensitivity") ?? "Zoom Sensitivity", 0.3, 2.0, 0.1, panel.zoomSensitivity, (v) => { panel.zoomSensitivity = v; }, t("desc.zoomSensitivity") ?? "Scroll wheel zoom speed (0.3=gentle, 1.0=normal, 2.0=fast)");
    // EE: Saved viewport list
    if (panel.savedViewports && panel.savedViewports.length > 0) {
      const vpList = body.createDiv({ cls: "gi-viewport-list" });
      vpList.style.cssText = "margin-top:6px;font-size:11px;";
      for (const vp of panel.savedViewports) {
        const row = vpList.createDiv({ cls: "gi-viewport-item" });
        row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:2px 0;cursor:pointer;";
        row.createEl("span", { text: vp.name });
        row.addEventListener("click", () => {
          cb.restoreViewport?.(vp.name);
        });
        const del = row.createEl("span", { text: "x", cls: "gi-viewport-del" });
        del.style.cssText = "cursor:pointer;color:var(--text-muted);margin-left:4px;font-size:10px;";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          panel.savedViewports = panel.savedViewports.filter(v => v !== vp);
          cb.rebuildPanel();
        });
      }
    }
  }, tHelp("help.displayOther"), false, "eye");
}

function _buildRenderThresholdsSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.renderThresholds"), (body) => {
    const rt = mergeRenderThresholds(panel.renderThresholds);
    addSlider(body, t("render.cardTextNodeCount"), 50, 1000, 50,
      rt.cardTextNodeCount, (v) => {
        ensureRT(panel).cardTextNodeCount = v;
        cb.markDirty();
      }, t("render.cardTextNodeCountDesc"));
    addSlider(body, t("render.gradientNodeCount"), 100, 2000, 100,
      rt.gradientNodeCount, (v) => {
        ensureRT(panel).gradientNodeCount = v;
        cb.markDirty();
      }, t("render.gradientNodeCountDesc"));
    addSlider(body, t("render.glowNodeCount"), 100, 2000, 100,
      rt.glowNodeCount, (v) => {
        ensureRT(panel).glowNodeCount = v;
        cb.markDirty();
      }, t("render.glowNodeCountDesc"));
    addSlider(body, t("render.gridLabelOffset"), 0, 40, 1,
      rt.gridLabelOffset, (v) => {
        ensureRT(panel).gridLabelOffset = v;
        cb.markDirty();
      }, t("render.gridLabelOffsetDesc"));
    addToggle(body, t("render.showFpsMonitor"), rt.showFpsMonitor, (v) => {
      ensureRT(panel).showFpsMonitor = v;
      cb.markDirty();
      cb.wakeRenderLoop();
    }, t("render.showFpsMonitorDesc"));
    addSlider(body, t("render.labelCullCooldown") ?? "Label Cull Cooldown", 1, 12, 1, rt.labelCullCooldown, (v) => {
      ensureRT(panel).labelCullCooldown = v;
      cb.markDirty();
      cb.announceA11y?.(`${t("render.labelCullCooldown") ?? "Label Cull Cooldown"}: ${v}`);
    }, t("render.labelCullCooldownDesc"));
    addSlider(body, t("render.highlightDimAlpha"), 0, 0.5, 0.01,
      rt.highlightEdgeNonMatchAlpha, (v) => {
        ensureRT(panel).highlightEdgeNonMatchAlpha = v;
        cb.markDirty();
      }, t("render.highlightDimAlphaDesc"));
    // Removed: showRecentVisitHalo (subtle effect, rarely noticed)
  }, tHelp("help.renderThresholds"), true, "sliders");
}

function _buildRelationColorSection(
  tabEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  if (panel.colorEdgesByRelation && ctx.relationColors.size > 0) {
    buildSection(tabEl, t("section.relationColors"), (body) => {
      const container = body.createDiv({ cls: "graph-color-groups-container" });
      for (const [rel, color] of ctx.relationColors) {
        const group = container.createDiv({ cls: "graph-color-group" });
        const label = group.createEl("span", { text: rel, cls: "graph-color-group-label gi-color-group-label" });
        const picker = group.createEl("input", { type: "color" });
        picker.setAttribute("aria-label", t("relationColors.changeColor"));
        picker.value = color;
        picker.addEventListener("input", () => {
          ctx.relationColors.set(rel, picker.value);
          cb.markDirty();
        });
      }
    }, tHelp("help.relationColors"), false, "palette");
  }
}

function buildDisplayTab(
  displayTab: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  const v = (id: PanelSectionId) => isSectionVisible(panel.viewMode, id);

  if (v("nodeDisplay"))        _buildNodeDisplaySection(displayTab, panel, ctx, cb);
  if (v("nodeDisplayMode"))    _buildNodeDisplayModeSection(displayTab, panel, ctx, cb);
  if (v("nodeDecorations"))    _buildNodeDecorationSection(displayTab, panel, ctx, cb);
  if (v("structureAnalysis"))  _buildStructureAnalysisSection(displayTab, panel, ctx, cb);
  if (v("discovery"))          _buildDiscoverySection(displayTab, panel, ctx, cb);
  if (v("interaction"))        _buildInteractionSection(displayTab, panel, ctx, cb);
  if (v("edgeDisplay"))        _buildEdgeDisplaySection(displayTab, panel, ctx, cb);
  if (v("cableDisplay"))       _buildCableDisplaySection(displayTab, panel, ctx, cb);
  if (v("roadNetwork"))        _buildRoadNetworkSection(displayTab, panel, ctx, cb);
  if (v("minimap"))            _buildMinimapSection(displayTab, panel, ctx, cb);
  if (v("renderThresholds"))   _buildRenderThresholdsSection(displayTab, panel, ctx, cb);
  if (v("relationColors"))     _buildRelationColorSection(displayTab, panel, ctx, cb);
}

function buildLayoutTab(
  layoutTab: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  const v = (id: PanelSectionId) => isSectionVisible(panel.viewMode, id);

  // --- Grouping (in Layout tab) ---
  if (v("grouping")) {
    buildSection(layoutTab, t("section.displayGrouping"), (body) => {
      {
        const groupByLabel = body.createDiv({ cls: "setting-item-name", text: t("display.groupBy") });
        const groupByListEl = body.createDiv({ cls: "gi-multirule-list" });
        renderGroupByRules(groupByListEl, panel, ctx, cb);
      }
      if (panel.groupBy && panel.groupBy !== "none") {
        // Expand/Collapse all groups buttons
        const groupBtnRow = body.createDiv({ cls: "gi-setting-row gi-group-btn-row" });
        const expandBtn = groupBtnRow.createEl("button", { cls: "gi-btn-sm", text: t("groups.expandAll") });
        expandBtn.addEventListener("click", () => {
          // Set a dummy marker so size>0 prevents auto-collapse, but no real group matches
          panel.collapsedGroups.clear();
          panel.collapsedGroups.add("__gi_expand_all__");
          cb.doRenderKeepPanel();
          cb.rebuildPanel();
          cb.announceA11y?.(`${t("groups.expandAll") ?? "Expand All"}: groups expanded`);
        });
        const collapseBtn = groupBtnRow.createEl("button", { cls: "gi-btn-sm", text: t("groups.collapseAll") });
        collapseBtn.addEventListener("click", () => {
          panel.collapsedGroups.clear();
          // Empty set triggers auto-collapse of all groups
          cb.doRenderKeepPanel();
          cb.rebuildPanel();
          cb.announceA11y?.(`${t("groups.collapseAll") ?? "Collapse All"}: groups collapsed`);
        });

        addSlider(body, t("display.groupMinSize"), 1, 20, 1, panel.groupMinSize, (v) => {
          panel.groupMinSize = v;
          panel.collapsedGroups.clear();
          cb.doRenderKeepPanel();
        }, t("desc.groupMinSize"));
        if (ctx.availableGroups.length > 0) {
          const currentFilter = panel.groupFilter
            ? new Set(panel.groupFilter.split(",").map(s => s.trim()).filter(Boolean))
            : new Set(ctx.availableGroups);
          addCheckboxGroup(body, t("display.groupFilter"), ctx.availableGroups, currentFilter, (sel) => {
            panel.groupFilter = sel.size === ctx.availableGroups.length ? "" : [...sel].join(", ");
            panel.collapsedGroups.clear();
            cb.doRenderKeepPanel();
          });
        }
      }
      // Follow toggle: sync clusterGroupRules from groupByRules
      addToggle(body, t("cluster.followsGroupBy"), panel.clusterFollowsGroupBy, (v) => {
        panel.clusterFollowsGroupBy = v;
        if (v && panel.groupByRules) {
          const filled = panel.groupByRules.filter(r => r.field.trim() !== "");
          panel.clusterGroupRules = deriveClusterRulesFromGroupBy(filled);
        }
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
        cb.rebuildPanel();
      }, t("cluster.followsGroupByDesc"));
    }, tHelp("help.displayGrouping"), false, "layers");
  }

  // Cluster arrangement (core: pattern select, concentric, spacing, guides, cluster rules, sort)
  if (v("clusterArrangement")) {
    buildSection(layoutTab, t("section.clusterArrangement"), (body) => {
      const sctx: ClusterSectionCtx = { body, panel, cb, ctx, spacingSliders: [] };
      _buildArrangementPatternSelect(sctx);
      _buildConcentricOptions(sctx);
      _buildSpacingAndGroupArrangement(sctx);  // Must come before autoFit (populates spacingSliders)
      _buildAutoFitAndGuides(sctx);
      _buildClusterGroupRules(sctx);
      _buildDirectionalGravityRules(sctx);
      _buildSortRules(sctx);
    }, tHelp("help.clusterArrangement"), true, "layout-grid");
  }

  // Coordinate axis controls (independent so coordinate viewModes can show them)
  if (v("coordinateControls")) {
    buildSection(layoutTab, t("section.coordinateControls"), (body) => {
      const sctx: ClusterSectionCtx = { body, panel, cb, ctx, spacingSliders: [] };
      _buildCoordinateControls(sctx);
    }, undefined, true, "axis-3d");
  }

  // Timeline controls (independent so timeline viewMode can show them)
  if (v("timelineControls")) {
    buildSection(layoutTab, t("section.timelineControls"), (body) => {
      const sctx: ClusterSectionCtx = { body, panel, cb, ctx, spacingSliders: [] };
      _buildTimelineControls(sctx);
    }, undefined, true, "calendar");
  }

  // Force simulation parameters
  if (v("forceParameters")) {
    buildSection(layoutTab, t("section.forceParameters"), (body) => {
      const sctx: ClusterSectionCtx = { body, panel, cb, ctx, spacingSliders: [] };
      _buildForceParameters(sctx);
    }, undefined, true, "magnet");
  }

  // Node rules
  if (v("nodeRules")) {
    buildSection(layoutTab, t("section.nodeRules"), (body) => {
      const ruleListEl = body.createDiv({ cls: "gi-noderule-list" });
      renderNodeRuleList(ruleListEl, panel, ctx, cb);

      const addBtn = body.createEl("button", { cls: "gi-add-group", text: t("nodeRules.addRule") });
      addBtn.addEventListener("click", () => {
        panel.nodeRules.push({ query: "*", spacingMultiplier: 1.0, gravityAngle: -1, gravityStrength: 0.1, centerGravity: 1.0, repelMultiplier: 1.0 });
        renderNodeRuleList(ruleListEl, panel, ctx, cb);
        cb.applyNodeRules();
        cb.restartSimulation(0.3);
      });
    }, tHelp("help.nodeRules"), true, "sliders-horizontal");
  }
}

// ---------------------------------------------------------------------------
// Settings tab section builders (file-private)
// ---------------------------------------------------------------------------

function _buildGraphSyncSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.graphSync"), (body) => {
    addToggle(body, t("display.syncWithEditor"), panel.syncWithEditor, (v) => {
      panel.syncWithEditor = v;
      cb.markDirty(); // Persist setting
    }, t("desc.syncWithEditor"));
    // ビュー同期トグル: 他の Graph Island ビューとパネル状態を同期
    addToggle(body, t("display.syncView"), panel.syncViewId !== null, (v) => {
      panel.syncViewId = v ? crypto.randomUUID() : null;
      cb.markDirty();
    }, t("desc.syncView"));
    addSlider(body, t("display.localGraphHops"), 1, 5, 1, panel.localGraphHops, (v) => {
      panel.localGraphHops = v;
      if (panel.localGraphCenter) cb.doRenderKeepPanel();
      else cb.markDirty(); // Persist even when not in local graph mode
    }, t("desc.localGraphHops"));
  }, tHelp("help.graphSync"), false, "settings");
}

function _buildPluginSettingsSection(
  tabEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.pluginSettings"), (body) => {
    const s = ctx.settings;

    // metadataFields removed — not consumed by any parser; edge fields come from ontology rules
    if (panel.showTagNodes && panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
      addSlider(body, t("settings.enclosureMinRatio"), 0, 0.3, 0.02, s.enclosureMinRatio, (v) => {
        s.enclosureMinRatio = v;
        ctx.saveSettings();
        cb.markDirty();
      }, t("desc.enclosureMinRatio"));
      // FY: Enclosure fill opacity override
      const rtEnc = mergeRenderThresholds(panel.renderThresholds);
      addSlider(body, t("display.enclosureFillOpacity") ?? "Enclosure Fill", 0, 1, 0.05, rtEnc.enclosureFillOpacity, (v) => {
        ensureRT(panel).enclosureFillOpacity = v;
        cb.markDirty();
      });
      // GC: Enclosure stroke width override
      addSlider(body, t("display.enclosureStrokeWidth") ?? "Enclosure Stroke", 0, 10, 0.5, rtEnc.enclosureStrokeWidth, (v) => {
        ensureRT(panel).enclosureStrokeWidth = v;
        cb.markDirty();
      });
      // FU: Enclosure label position
      addSelect(body, t("display.enclosureLabelPos") ?? "Label Position", [
        { value: "top", label: t("display.enclosureLabelPos.top") ?? "Top" },
        { value: "center", label: t("display.enclosureLabelPos.center") ?? "Center" },
        { value: "bottom", label: t("display.enclosureLabelPos.bottom") ?? "Bottom" },
      ], rtEnc.enclosureLabelPosition, (v) => {
        ensureRT(panel).enclosureLabelPosition = v as "top" | "center" | "bottom";
        cb.markDirty();
      });
    }
  }, tHelp("help.pluginSettings"), false, "settings");
}

function _buildOntologySection(
  tabEl: HTMLElement, _panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.ontology"), (body) => {
    const s = ctx.settings;
    // Initialize rules from legacy fields if not present
    if (!s.ontology.rules || s.ontology.rules.length === 0) {
      s.ontology.rules = ontologyToRules(s.ontology);
    }
    const rules = s.ontology.rules;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      rulesToOntologyFields(rules, s.ontology);
      s.ontology.rules = rules;
      ctx.saveSettings();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => cb.invalidateDataKeepPanel(), 2000);
    };

    const listEl = body.createDiv({ cls: "gi-ont-rules" });

    function renderRules() {
      listEl.empty();
      for (let i = 0; i < rules.length; i++) {
        renderOntologyRule(listEl, rules, i, cb, save, () => renderRules());
      }
      // Add button
      const addBtn = listEl.createEl("button", { cls: "gi-ont-add-btn", text: `+ ${t("settings.ontAddRule")}` });
      addBtn.addEventListener("click", () => {
        rules.push({ forward: "", relation: "is-a", reverse: "" });
        save();
        renderRules();
      });
    }
    renderRules();

    addToggle(body, t("settings.tagHierarchy"), s.ontology.useTagHierarchy, (v) => {
      s.ontology.useTagHierarchy = v;
      ctx.saveSettings(); cb.invalidateDataKeepPanel();
    }, t("desc.tagHierarchy"));
  }, tHelp("help.ontology"), false, "network");
}

function _buildCustomMappingsSection(
  tabEl: HTMLElement, _panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.customMappings"), (body) => {
    const mappingsListEl = body.createDiv({ cls: "gi-mappings-list" });
    renderCustomMappings(mappingsListEl, ctx.settings, ctx, cb);
  }, tHelp("help.customMappings"), true, "map");
}

function _buildTagRelationsSection(
  tabEl: HTMLElement, _panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.tagRelations"), (body) => {
    const tagRelListEl = body.createDiv({ cls: "gi-tag-relations-list" });
    renderTagRelations(tagRelListEl, ctx.settings, ctx, cb);
  }, tHelp("help.tagRelations"), true, "tag");
}

function _buildSettingsActionButtons(
  tabEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  // --- Action buttons ---
  const actionRow = tabEl.createDiv({ cls: "gi-panel-actions gi-action-row" });

  const saveBtn = actionRow.createEl("button", { cls: "mod-cta", text: t("action.save") });
  saveBtn.addEventListener("click", () => cb.saveGroupPreset());

  const resetBtn = actionRow.createEl("button", { text: t("action.reset") });
  resetBtn.addEventListener("click", () => cb.resetPanel());

  // --- Export / Import preset buttons ---
  const presetRow = tabEl.createDiv({ cls: "ngp-panel-actions ngp-action-row" });

  const exportBtn = presetRow.createEl("button", { text: t("preset.export") });
  exportBtn.addEventListener("click", async () => {
    // Save current zoom level in preset for restoration on import
    panel.presetZoomLevel = ctx.currentZoom ?? 0;
    const json = exportPreset(panel);
    try {
      await navigator.clipboard.writeText(json);
      exportBtn.textContent = t("preset.exported");
      setTimeout(() => { exportBtn.textContent = t("preset.export"); }, 2000);
    } catch { /* clipboard not available */ }
  });

  const diffExportBtn = presetRow.createEl("button", { text: t("preset.exportDiff") });
  diffExportBtn.title = t("preset.exportDiffDesc");
  diffExportBtn.addEventListener("click", async () => {
    const defaults = createDefaultPanel();
    const json = exportPresetDiff(panel, defaults);
    try {
      await navigator.clipboard.writeText(json);
      diffExportBtn.textContent = t("preset.exported");
      setTimeout(() => { diffExportBtn.textContent = t("preset.exportDiff"); }, 2000);
    } catch { /* clipboard not available */ }
  });

  const importBtn = presetRow.createEl("button", { text: t("preset.import") });
  importBtn.addEventListener("click", () => {
    const modal = tabEl.createDiv({ cls: "ngp-import-modal" });
    modal.createEl("div", { text: t("preset.importPrompt"), cls: "ngp-import-label" });
    const textarea = modal.createEl("textarea", { cls: "ngp-import-textarea" });
    textarea.rows = 8;
    textarea.placeholder = "{ ... }";

    const btnRow = modal.createDiv({ cls: "ngp-import-btn-row" });
    const applyBtn = btnRow.createEl("button", { cls: "mod-cta", text: t("preset.import") });
    const cancelBtn = btnRow.createEl("button", { text: t("action.reset") });

    cancelBtn.addEventListener("click", () => modal.remove());

    applyBtn.addEventListener("click", () => {
      try {
        const info: PresetMigrationInfo = { migratedFields: [], removedFields: [] };
        const preset = importPreset(textarea.value, info);
        const merged = applyPreset(panel, preset);
        Object.assign(panel, merged);
        // Show migration feedback if any fields were migrated
        if (info.migratedFields.length > 0 || info.removedFields.length > 0) {
          const lines: string[] = [];
          if (info.migratedFields.length > 0) lines.push(`Migrated: ${info.migratedFields.join(", ")}`);
          if (info.removedFields.length > 0) lines.push(`Removed: ${info.removedFields.join(", ")}`);
          new (window as any).Notice(lines.join("\n"), 5000);
        }
        modal.remove();
        cb.invalidateData();
        // Restore preset zoom level if specified
        if (panel.presetZoomLevel > 0) {
          setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500);
        }
        cb.rebuildPanel();
      } catch {
        textarea.addClass("ngp-import-error");
        modal.querySelector(".ngp-import-label")!.textContent = t("preset.importError");
      }
    });
  });

  // --- テンプレート保存・読込・削除ボタン ---
  const templateRow = tabEl.createDiv({ cls: "gi-panel-actions gi-action-row" });

  // テンプレート保存ボタン
  const saveTemplateBtn = templateRow.createEl("button", { text: t("template.save") });
  saveTemplateBtn.addEventListener("click", () => {
    const templates = ctx.settings.templates ?? [];
    if (templates.length >= 20) {
      showToast(t("template.maxReached"));
      return;
    }
    const name = window.prompt(t("template.namePrompt"));
    if (!name || !name.trim()) return;
    const ok = cb.saveTemplate(name.trim());
    if (ok) {
      showToast(t("template.saved"));
      cb.rebuildPanel();
    }
  });

  // テンプレート読込ドロップダウン
  const templates = ctx.settings.templates ?? [];
  if (templates.length > 0) {
    const loadSelect = templateRow.createEl("select", { cls: "gi-template-select" });
    const defaultOpt = loadSelect.createEl("option", { text: t("template.load"), value: "" });
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    for (const tmpl of templates) {
      loadSelect.createEl("option", { text: tmpl.name, value: tmpl.name });
    }
    loadSelect.addEventListener("change", () => {
      const name = loadSelect.value;
      if (!name) return;
      cb.loadTemplate(name);
      showToast(t("template.loaded"));
    });

    // テンプレート削除ボタン
    const deleteTemplateBtn = templateRow.createEl("button", { text: t("template.delete") });
    deleteTemplateBtn.addEventListener("click", () => {
      if (templates.length === 0) return;
      const name = loadSelect.value;
      if (!name) return;
      const msg = t("template.confirmDelete").replace("{name}", name);
      if (!window.confirm(msg)) return;
      cb.deleteTemplate(name);
      showToast(t("template.deleted"));
      cb.rebuildPanel();
    });
  }
}

// ---------------------------------------------------------------------------
// Nodes Tab — Directory tree with visibility toggle and hover/link highlighting
// ---------------------------------------------------------------------------
function _buildNodesTab(
  tabEl: HTMLElement,
  panel: PanelState,
  _ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  const entries = cb.getNodeTreeData();
  const hoveredId = cb.getHoveredNodeId();
  const excludeSet = new Set(panel.excludeNodes ?? []);

  // Derive forward/backlinks for hovered node
  const fwdLinks = hoveredId ? new Set(cb.getForwardLinks(hoveredId)) : new Set<string>();
  const bkLinks = hoveredId ? new Set(cb.getBacklinks(hoveredId)) : new Set<string>();

  // Build directory tree structure
  interface DirNode { children: Map<string, DirNode>; files: NodeTreeEntry[]; }
  const root: DirNode = { children: new Map(), files: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/");
    const fileName = parts.pop()!;
    let cur = root;
    for (const dir of parts) {
      if (!cur.children.has(dir)) cur.children.set(dir, { children: new Map(), files: [] });
      cur = cur.children.get(dir)!;
    }
    cur.files.push(entry);
  }

  // EP: Stats summary bar
  const visibleCount = entries.filter(e => e.isVisible).length;
  const hiddenCount = excludeSet.size;
  const statsBar = tabEl.createDiv({ cls: "gi-node-stats" });
  statsBar.style.cssText = "padding:4px 8px;font-size:10px;color:var(--text-muted);display:flex;gap:8px;";
  statsBar.createEl("span", { text: `${entries.length} total` });
  statsBar.createEl("span", { text: `${visibleCount} visible` });
  if (hiddenCount > 0) {
    const hidSpan = statsBar.createEl("span", { text: `${hiddenCount} hidden` });
    hidSpan.style.color = "var(--text-error)";
  }

  // FA: Sort selector + Search filter
  const filterWrap = tabEl.createDiv({ cls: "gi-node-tree-filter" });
  filterWrap.style.cssText = "padding:4px 8px;display:flex;gap:4px;align-items:center;";
  const filterInput = filterWrap.createEl("input", {
    type: "text",
    placeholder: t("nodes.filterPlaceholder") ?? "Filter nodes...",
    cls: "gi-node-filter-input",
  });
  filterInput.style.cssText = "flex:1;padding:4px 6px;font-size:11px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);";
  const sortSelect = filterWrap.createEl("select", { cls: "gi-node-sort" });
  sortSelect.style.cssText = "font-size:10px;padding:2px;border-radius:3px;background:var(--background-primary);border:1px solid var(--background-modifier-border);";
  // GL: Added "Degree" sort option for importance ranking
  for (const [val, label] of [["name", "A-Z"], ["path", "Path"], ["visible", "Visible"], ["degree", "Degree"]]) {
    sortSelect.createEl("option", { value: val, text: label });
  }
  // Build degree lookup for GL sort
  const degreeLookup = new Map<string, number>();
  for (const e of entries) {
    const fwd = cb.getForwardLinks(e.id).length;
    const bk = cb.getBacklinks(e.id).length;
    degreeLookup.set(e.id, fwd + bk);
  }
  sortSelect.addEventListener("change", () => {
    const mode = sortSelect.value;
    const rows = [...treeContainer.querySelectorAll(".gi-node-row")] as HTMLElement[];
    rows.sort((a, b) => {
      const aId = a.dataset.nodeId ?? "";
      const bId = b.dataset.nodeId ?? "";
      if (mode === "visible") {
        const aVis = !excludeSet.has(aId) ? 0 : 1;
        const bVis = !excludeSet.has(bId) ? 0 : 1;
        return aVis - bVis || aId.localeCompare(bId);
      }
      if (mode === "degree") {
        return (degreeLookup.get(bId) ?? 0) - (degreeLookup.get(aId) ?? 0);
      }
      if (mode === "path") return aId.localeCompare(bId);
      return (a.textContent ?? "").localeCompare(b.textContent ?? "");
    });
    for (const row of rows) treeContainer.appendChild(row);
  });

  const treeContainer = tabEl.createDiv({ cls: "gi-node-tree" });
  treeContainer.style.cssText = "overflow-y:auto;max-height:400px;font-size:11px;padding:0 4px;";

  function renderDir(parent: HTMLElement, dir: DirNode, path: string, depth: number) {
    // Sort directories first, then files
    const sortedDirs = [...dir.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const sortedFiles = [...dir.files].sort((a, b) => a.label.localeCompare(b.label));

    for (const [name, child] of sortedDirs) {
      const dirEl = parent.createDiv({ cls: "gi-node-dir" });
      const header = dirEl.createDiv({ cls: "gi-node-dir-header" });
      header.style.cssText = `padding:2px 0 2px ${depth * 12}px;cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-muted);`;
      // EN: Folder-level checkbox for batch exclude
      const dirIds = collectDirIds(child);
      const allExcluded = dirIds.length > 0 && dirIds.every(id => excludeSet.has(id));
      const dirCb = header.createEl("input", { type: "checkbox" });
      dirCb.checked = !allExcluded;
      dirCb.style.cssText = "width:11px;height:11px;margin:0;cursor:pointer;";
      dirCb.addEventListener("click", (e) => {
        e.stopPropagation();
        const ids = collectDirIds(child);
        if (dirCb.checked) {
          // Show all: remove from excludeNodes
          panel.excludeNodes = (panel.excludeNodes ?? []).filter(id => !ids.includes(id));
        } else {
          // Hide all: add to excludeNodes
          const excl = new Set(panel.excludeNodes ?? []);
          for (const id of ids) excl.add(id);
          panel.excludeNodes = [...excl];
        }
        cb.invalidateDataKeepPanel();
      });
      const arrow = header.createEl("span", { text: ">" });
      arrow.style.cssText = "font-size:9px;transition:transform 0.15s;";
      header.createEl("span", { text: name });
      const fileCount = countFiles(child);
      header.createEl("span", { text: `(${fileCount})`, cls: "gi-node-count" });
      header.querySelector(".gi-node-count")!.setAttribute("style", "font-size:9px;color:var(--text-faint);");

      const body = dirEl.createDiv({ cls: "gi-node-dir-body" });
      // EW: Restore folder collapse state from localStorage
      const dirPath = path + name;
      const savedOpen = _getNodeDirStates()[dirPath];
      body.style.display = savedOpen ? "" : "none";
      if (savedOpen) arrow.style.transform = "rotate(90deg)";

      header.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        const open = body.style.display !== "none";
        body.style.display = open ? "none" : "";
        arrow.style.transform = open ? "" : "rotate(90deg)";
        // EW: Persist folder collapse state
        const states = _getNodeDirStates();
        if (open) delete states[dirPath]; else states[dirPath] = true;
        _saveNodeDirStates(states);
      });

      renderDir(body, child, path + name + "/", depth + 1);
    }

    for (const entry of sortedFiles) {
      const row = parent.createDiv({ cls: "gi-node-row" });
      row.style.cssText = `padding:1px 4px 1px ${depth * 12}px;display:flex;align-items:center;gap:4px;cursor:pointer;border-radius:3px;`;
      row.dataset.nodeId = entry.id;

      // Visibility checkbox
      const cb2 = row.createEl("input", { type: "checkbox" });
      cb2.checked = !excludeSet.has(entry.id);
      cb2.style.cssText = "width:12px;height:12px;margin:0;cursor:pointer;";
      cb2.addEventListener("change", (e) => {
        e.stopPropagation();
        cb.toggleNodeVisibility(entry.id);
      });

      // Label
      const label = row.createEl("span", { text: entry.label, cls: "gi-node-label" });
      label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

      // Color coding for state
      if (!entry.isVisible) {
        row.style.opacity = "0.4";
      }
      if (entry.id === hoveredId) {
        row.style.background = "var(--interactive-accent)";
        row.style.color = "var(--text-on-accent)";
      } else if (fwdLinks.has(entry.id)) {
        row.style.background = "rgba(34, 197, 94, 0.15)"; // green tint for forward links
        label.style.fontWeight = "600";
      } else if (bkLinks.has(entry.id)) {
        row.style.background = "rgba(59, 130, 246, 0.15)"; // blue tint for backlinks
        label.style.fontWeight = "600";
      }

      // Click to jump
      row.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey) {
          const idx = panel.multiSelectNodeIds.indexOf(entry.id);
          if (idx >= 0) panel.multiSelectNodeIds.splice(idx, 1);
          else panel.multiSelectNodeIds.push(entry.id);
          row.classList.toggle("gi-node-selected");
        } else {
          cb.jumpToNode(entry.id);
        }
      });
      // EU: Right-click context menu
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem(item => item.setTitle("Jump to Node").setIcon("locate").onClick(() => cb.jumpToNode(entry.id)));
        menu.addItem(item => item.setTitle(excludeSet.has(entry.id) ? "Show" : "Hide").setIcon("eye-off").onClick(() => cb.toggleNodeVisibility(entry.id)));
        const isBm = (panel.bookmarkedNodes ?? []).includes(entry.id);
        menu.addItem(item => item.setTitle(isBm ? "Remove Bookmark" : "Bookmark").setIcon("bookmark").onClick(() => {
          if (isBm) panel.bookmarkedNodes = panel.bookmarkedNodes.filter(id => id !== entry.id);
          else { if (!panel.bookmarkedNodes) panel.bookmarkedNodes = []; panel.bookmarkedNodes.push(entry.id); }
          cb.invalidateDataKeepPanel();
        }));
        menu.addItem(item => item.setTitle("Open File").setIcon("file-text").onClick(() => {
          const file = (window as any).app?.vault?.getAbstractFileByPath(entry.id);
          if (file) (window as any).app?.workspace?.getLeaf(false)?.openFile(file);
        }));
        menu.showAtPosition({ x: e.clientX, y: e.clientY });
      });
    }
  }

  function countFiles(dir: DirNode): number {
    let count = dir.files.length;
    for (const child of dir.children.values()) count += countFiles(child);
    return count;
  }

  // EN: Collect all file IDs under a directory recursively
  function collectDirIds(dir: DirNode): string[] {
    const ids: string[] = dir.files.map(f => f.id);
    for (const child of dir.children.values()) ids.push(...collectDirIds(child));
    return ids;
  }

  renderDir(treeContainer, root, "", 0);

  // Filter logic
  filterInput.addEventListener("input", () => {
    const q = filterInput.value.toLowerCase().trim();
    const rows = treeContainer.querySelectorAll(".gi-node-row");
    for (const row of Array.from(rows)) {
      const id = (row as HTMLElement).dataset.nodeId ?? "";
      const text = (row as HTMLElement).textContent?.toLowerCase() ?? "";
      (row as HTMLElement).style.display = q && !text.includes(q) && !id.toLowerCase().includes(q) ? "none" : "";
    }
    // Show parent dirs if any child is visible
    if (q) {
      const dirs = treeContainer.querySelectorAll(".gi-node-dir");
      for (const dir of Array.from(dirs)) {
        const body = dir.querySelector(".gi-node-dir-body") as HTMLElement;
        const arrow = dir.querySelector(".gi-node-dir-header span") as HTMLElement;
        if (body) body.style.display = "";
        if (arrow) arrow.style.transform = "rotate(90deg)";
      }
    }
  });

  // Legend
  const legend = tabEl.createDiv({ cls: "gi-node-legend" });
  legend.style.cssText = "padding:4px 8px;font-size:10px;color:var(--text-muted);display:flex;gap:8px;flex-wrap:wrap;";
  const addLegendItem = (color: string, text: string) => {
    const item = legend.createEl("span");
    item.style.cssText = `display:inline-flex;align-items:center;gap:2px;`;
    const dot = item.createEl("span");
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;`;
    item.createEl("span", { text });
  };
  addLegendItem("var(--interactive-accent)", t("nodes.hovered") ?? "Hovered");
  addLegendItem("rgba(34,197,94,0.6)", t("nodes.forwardLink") ?? "Link");
  addLegendItem("rgba(59,130,246,0.6)", t("nodes.backlink") ?? "Backlink");

  // EZ: CSV export button
  const exportBtn = legend.createEl("button", { text: "CSV", cls: "gi-node-export-btn" });
  exportBtn.style.cssText = "font-size:9px;padding:1px 6px;cursor:pointer;margin-left:auto;border-radius:3px;";
  exportBtn.addEventListener("click", () => {
    const rows = ["id,label,path,visible"];
    for (const e of entries) {
      rows.push(`"${e.id}","${e.label}","${e.path}",${e.isVisible}`);
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `graph-island-nodes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // EM: Inject hover sync CSS
  if (!tabEl.querySelector("style.gi-node-hover-css")) {
    const style = document.createElement("style");
    style.className = "gi-node-hover-css";
    style.textContent = `.gi-node-hovered{background:var(--interactive-accent)!important;color:var(--text-on-accent)!important;}.gi-node-linked{background:rgba(34,197,94,0.15)!important;font-weight:600;}.gi-node-selected{background:rgba(139,92,246,0.2)!important;border-left:2px solid var(--interactive-accent);}`;
    tabEl.prepend(style);
  }
}

function buildSettingsTab(
  settingsTab: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  _buildGraphSyncSection(settingsTab, panel, ctx, cb);
  _buildPluginSettingsSection(settingsTab, panel, ctx, cb);
  _buildOntologySection(settingsTab, panel, ctx, cb);
  _buildCustomMappingsSection(settingsTab, panel, ctx, cb);
  _buildTagRelationsSection(settingsTab, panel, ctx, cb);
  _buildSettingsActionButtons(settingsTab, panel, ctx, cb);
}

// ---------------------------------------------------------------------------
// Cluster arrangement section helpers (extracted from buildPanel)
// ---------------------------------------------------------------------------

/** Arrangement pattern dropdown */
function _buildArrangementPatternSelect(s: ClusterSectionCtx): void {
  addSelect(s.body, t("cluster.pattern"), [
    { value: "concentric", label: t("cluster.concentric") },
    { value: "radial", label: t("cluster.radial") },
    { value: "phyllotaxis", label: t("cluster.phyllotaxis") },
    { value: "grid", label: t("cluster.grid") },
    { value: "triangle", label: t("cluster.triangle") },
    { value: "random", label: t("cluster.random") },
    { value: "timeline", label: t("cluster.timeline") },
    { value: "custom", label: t("cluster.custom") },
    { value: "ego", label: t("cluster.ego") },
  ], s.panel.clusterArrangement, (v) => {
    s.panel.clusterArrangement = v as ClusterArrangement;
    const preset = getPreset(v as ClusterArrangement);
    // Preserve grid config if currently active
    const prevGrid = s.panel.coordinateLayout?.grid;
    s.panel.coordinateLayout = {
      ...preset,
      ...(prevGrid ? { grid: prevGrid } : {}),
    };
    s.cb.applyClusterForce();
    s.cb.rebuildPanel();
    s.cb.restartSimulation(1.0);
    // A11y: announce layout change
    s.cb.announceA11y?.(`${t("a11y.layoutChanged") ?? "Layout"}: ${v}`);
  }, t("desc.clusterPattern"));
}

/** Concentric orbit toggles (only shown for concentric arrangement) */
function _buildConcentricOptions(s: ClusterSectionCtx): void {
  if (s.panel.clusterArrangement !== ARRANGEMENT_CONCENTRIC) return;
  addToggle(s.body, t("concentric.showOrbitRings"), s.panel.showOrbitRings, (v) => {
    s.panel.showOrbitRings = v;
    s.cb.markDirty();
  });
  addToggle(s.body, t("concentric.autoRotate"), s.panel.orbitAutoRotate, (v) => {
    s.panel.orbitAutoRotate = v;
    if (v) s.cb.startOrbitAnimation(); else s.cb.stopOrbitAnimation();
  });
}

/** Coordinate system, axis inputs, preview, expression library, constants, perGroup, polar range */
function _buildCoordinateControls(s: ClusterSectionCtx): void {
  const { body, panel, cb, ctx } = s;
  const coordLayout = panel.coordinateLayout
    ?? getPreset(panel.clusterArrangement);

  addSelect(body, t("coord.system"), [
    { value: "cartesian", label: t("coord.cartesian") },
    { value: "polar", label: t("coord.polar") },
  ], coordLayout.system, (v) => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    panel.coordinateLayout = { ...base, system: v as CoordinateSystem };
    syncArrangementFromLayout(panel);
    cb.applyClusterForce();
    cb.rebuildPanel();
    cb.restartSimulation(0.5);
  }, t("desc.coordSystem"));

  const axis1Label = coordLayout.system === "polar" ? "r" : "X";
  const axis2Label = coordLayout.system === "polar" ? "θ" : "Y";

  const axisSuggestions = getAxisSourceSuggestions(ctx);

  buildAxisTextInput(body, `${axis1Label}:`, coordLayout.axis1, 1, panel, cb, ctx, axisSuggestions);
  buildAxisTextInput(body, `${axis2Label}:`, coordLayout.axis2, 2, panel, cb, ctx, axisSuggestions);

  // Coordinate function preview plot
  buildCoordPreview(body, coordLayout);

  // Expression library (preset formulas)
  buildExprLibrary(body, panel, cb);

  // Constants management
  buildConstantsUI(body, panel, cb);

  addToggle(body, t("coord.perGroup"), coordLayout.perGroup, (v) => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    panel.coordinateLayout = { ...base, perGroup: v };
    syncArrangementFromLayout(panel);
    cb.applyClusterForce();
    cb.rebuildPanel();
    cb.restartSimulation(0.5);
  }, t("desc.perGroup"));

  if (coordLayout.system === "polar" && coordLayout.axis2.transform.kind === TRANSFORM_EVEN_DIVIDE) {
    addSlider(body, `${axis2Label} ${t("coord.range")} (°)`, 30, 360, 10,
      coordLayout.axis2.transform.totalRange, (v) => {
      const base = panel.coordinateLayout
        ?? { ...getPreset(panel.clusterArrangement) };
      panel.coordinateLayout = {
        ...base,
        axis2: {
          ...base.axis2,
          transform: { kind: "even-divide", totalRange: v },
        },
      };
      syncArrangementFromLayout(panel);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    }, "Angle range for polar arrangement");
  }
}

/** Timeline-specific controls: time key, end key, duration bars, routes, tick labels, order fields, range */
function _buildTimelineControls(s: ClusterSectionCtx): void {
  const { body, panel, cb, ctx } = s;
  const effectiveLayout = panel.coordinateLayout ?? getPreset(panel.clusterArrangement);
  if (!effectiveLayout) return;
  const hasPropertyAxis = effectiveLayout.axis1.source.kind === SOURCE_PROPERTY
    || effectiveLayout.axis2.source.kind === SOURCE_PROPERTY;
  if (panel.clusterArrangement !== ARRANGEMENT_TIMELINE && !hasPropertyAxis) return;

  const row = body.createDiv({ cls: "gi-setting-row" });
  row.createEl("span", { cls: "gi-setting-label", text: t("timeline.timeKey") });
  const input = row.createEl("input", { cls: "gi-setting-input", type: "text" });
  input.value = panel.timelineKey;
  input.placeholder = "date";
  input.setAttribute("aria-label", t("timeline.timeKeyHint"));
  attachDatalist(input, ctx.frontmatterKeys);
  input.addEventListener("change", () => {
    panel.timelineKey = input.value.trim() || "date";
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  });
  body.createEl("p", { cls: "gi-hint", text: t("timeline.timeKeyHint") });

  // Timeline end key input (for duration bars)
  const endRow = body.createDiv({ cls: "gi-setting-row" });
  endRow.createEl("span", { cls: "gi-setting-label", text: t("timeline.endKey") });
  const endInput = endRow.createEl("input", { cls: "gi-setting-input", type: "text" });
  endInput.value = panel.timelineEndKey;
  endInput.placeholder = "end-date";
  endInput.setAttribute("aria-label", t("timeline.endKeyHint"));
  attachDatalist(endInput, ctx.frontmatterKeys);
  endInput.addEventListener("change", () => {
    panel.timelineEndKey = endInput.value.trim() || "end-date";
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  });

  // Duration bars toggle
  addToggle(body, t("timeline.showDurationBars"), panel.showDurationBars, (v) => {
    panel.showDurationBars = v;
    cb.markDirty();
  });

  // Timeline route lines toggle
  addToggle(body, t("timeline.showRoutes"), panel.showTimelineRoutes, (v) => {
    panel.showTimelineRoutes = v;
    cb.markDirty();
  });

  // Timeline tick labels toggle
  addToggle(body, t("timeline.showTickLabels"), panel.showTimelineTickLabels, (v) => {
    panel.showTimelineTickLabels = v;
    cb.markDirty();
  }, t("timeline.showTickLabelsDesc"));

  // Timeline order fields
  const orderRow = body.createDiv({ cls: "gi-setting-row" });
  orderRow.createEl("span", { cls: "gi-setting-label", text: t("timeline.orderFields") });
  const orderInput = orderRow.createEl("input", { cls: "gi-setting-input", type: "text" });
  orderInput.value = panel.timelineOrderFields;
  orderInput.placeholder = "parent_id,story_order";
  orderInput.setAttribute("aria-label", t("timeline.orderFieldsHint"));
  orderInput.addEventListener("change", () => {
    panel.timelineOrderFields = orderInput.value.trim();
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  });
  body.createEl("p", { cls: "gi-hint", text: t("timeline.orderFieldsHint") });

  // Timeline range dual slider
  buildDualRangeSlider(body, t("timeline.range") || "Time range",
    panel.timelineRangeMin, panel.timelineRangeMax,
    (min, max) => {
      panel.timelineRangeMin = min;
      panel.timelineRangeMax = max;
      cb.doRenderKeepPanel();
    }, t("desc.timelineRange") || "Visible time range (% of total)");
}

/** Auto-fit toggle, guide lines, group grid, and custom grid settings */
function _buildAutoFitAndGuides(s: ClusterSectionCtx): void {
  const { body, panel, cb } = s;

  // Auto-fit toggle — disables manual spacing sliders when ON
  const setSliderDisabled = (disabled: boolean) => {
    for (const el of s.spacingSliders) {
      el.style.opacity = disabled ? "0.5" : "";
      el.style.pointerEvents = disabled ? "none" : "";
    }
  };
  addToggle(body, t("cluster.autoFit"), panel.autoFit, (v) => {
    panel.autoFit = v;
    // HC: Reset preset zoom when enabling auto-fit (prevents race condition)
    if (v) panel.presetZoomLevel = 0;
    setSliderDisabled(v);
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
    cb.doRenderKeepPanel();
  }, t("desc.autoFit"));

  // --- Grid & Guide section ---
  addToggle(body, t("display.dotGrid"), panel.showDotGrid, (v) => { panel.showDotGrid = v; cb.markDirty(); }, t("desc.dotGrid"));

  // Custom grid settings (visible when coordinate layout is active)
  if (panel.coordinateLayout) {
    const hasGrid = !!panel.coordinateLayout.grid;
    addToggle(body, t("guide.gridTableMode"), hasGrid, (v) => {
      if (v && panel.coordinateLayout) {
        panel.coordinateLayout.grid = {
          style: panel.gridStyle,
          cellShading: panel.gridCellShading,
        };
      } else if (panel.coordinateLayout) {
        panel.coordinateLayout.grid = undefined;
      }
      cb.applyClusterForce();
      cb.restartSimulation(0.3);
      cb.rebuildPanel();
    }, t("guide.gridTableModeDesc"));

    if (hasGrid) {
      addSelect(body, t("guide.gridStyle"), [
        { value: "lines", label: t("guide.gridStyle.lines") },
        { value: "table", label: t("guide.gridStyle.table") },
      ], panel.gridStyle, (v) => {
        panel.gridStyle = v as "lines" | "table";
        if (panel.coordinateLayout?.grid) {
          panel.coordinateLayout.grid.style = panel.gridStyle;
        }
        cb.applyClusterForce();
        cb.restartSimulation(0.3);
        cb.doRenderKeepPanel();
      });

      addToggle(body, t("guide.gridShowHeaders"), panel.gridShowHeaders, (v) => {
        panel.gridShowHeaders = v;
        cb.markDirty();
      }, t("guide.gridShowHeadersDesc"));

      addSelect(body, t("guide.labelPlacement"), [
        { value: "on-line", label: t("guide.labelOnLine") },
        { value: "between", label: t("guide.labelBetween") },
      ], panel.gridLabelPlacement, (v) => {
        panel.gridLabelPlacement = v as "on-line" | "between";
        cb.markDirty();
      });

      addToggle(body, t("guide.gridCellShading"), panel.gridCellShading, (v) => {
        panel.gridCellShading = v;
        if (panel.coordinateLayout?.grid) {
          panel.coordinateLayout.grid.cellShading = v;
        }
        cb.applyClusterForce();
        cb.restartSimulation(0.3);
        cb.doRenderKeepPanel();
      }, t("guide.gridCellShadingDesc"));
    }
  }

  // Axis titles — only relevant when coordinate guides or timeline produce axis labels
  if (panel.coordinateLayout || panel.clusterArrangement === ARRANGEMENT_TIMELINE) {
    addToggle(body, t("guide.showAxisTitles"), panel.showAxisTitles, (v) => {
      panel.showAxisTitles = v;
      cb.markDirty();
    }, t("guide.showAxisTitlesDesc"));
  }
}

/** Node spacing, group arrangement, group size/spacing, cluster gravity, edge bundle */
function _buildSpacingAndGroupArrangement(s: ClusterSectionCtx): void {
  const { body, panel, cb } = s;

  let spacingDebounce: ReturnType<typeof setTimeout> | undefined;
  const debouncedClusterForce = () => {
    clearTimeout(spacingDebounce);
    spacingDebounce = setTimeout(() => {
      cb.applyClusterForce(false);
      cb.restartSimulation(0.5);
    }, 100);
  };

  s.spacingSliders.push(addSlider(body, t("cluster.nodeSpacing"), 1, 10, 0.5, panel.clusterNodeSpacing, (v) => {
    panel.clusterNodeSpacing = v;
    debouncedClusterForce();
  }, t("desc.nodeSpacing")));

  // Inter-group arrangement dropdown
  addSelect(body, t("cluster.groupArrangement"), [
    { value: "auto", label: t("cluster.groupArrangementAuto") },
    { value: "circle", label: t("cluster.groupArrangementCircle") },
    { value: "horizontal", label: t("cluster.groupArrangementHorizontal") },
    { value: "vertical", label: t("cluster.groupArrangementVertical") },
    { value: "concentric", label: t("cluster.groupArrangementConcentric") },
    { value: "grid", label: t("cluster.groupArrangementGrid") },
  ], panel.clusterGroupArrangement, (v) => {
    panel.clusterGroupArrangement = v as ClusterGroupArrangement;
    cb.applyClusterForce();
    cb.restartSimulation(1.0);
  }, t("desc.groupArrangement"));

  s.spacingSliders.push(addSlider(body, t("cluster.groupSize"), 0.5, 5, 0.25, panel.clusterGroupScale, (v) => {
    panel.clusterGroupScale = v;
    debouncedClusterForce();
  }, t("desc.groupSize")));
  s.spacingSliders.push(addSlider(body, t("cluster.groupSpacing"), 0.5, 5, 0.25, panel.clusterGroupSpacing, (v) => {
    panel.clusterGroupSpacing = v;
    debouncedClusterForce();
  }, t("desc.groupSpacing")));

  // Apply initial disabled state for autoFit
  for (const el of s.spacingSliders) {
    el.style.opacity = panel.autoFit ? "0.5" : "";
    el.style.pointerEvents = panel.autoFit ? "none" : "";
  }

  // Cluster gravity sliders (only when groupBy is active)
  if (panel.groupBy && panel.groupBy !== "none") {
    if (!panel.clusterGravity) {
      panel.clusterGravity = { interGroupAttraction: 0.5, intraGroupDensity: 1.0 };
    }
    addSlider(body, t("gravity.interGroupAttraction"), 0, 2, 0.1, panel.clusterGravity.interGroupAttraction, (v) => {
      panel.clusterGravity.interGroupAttraction = v;
      debouncedClusterForce();
    }, t("gravity.interGroupAttractionDesc"));
    addSlider(body, t("gravity.intraGroupDensity"), 0.1, 3, 0.1, panel.clusterGravity.intraGroupDensity, (v) => {
      panel.clusterGravity.intraGroupDensity = v;
      debouncedClusterForce();
    }, t("gravity.intraGroupDensityDesc"));
  }

  addSlider(body, t("cluster.edgeBundleStrength"), 0, 1, 0.05, panel.edgeBundleStrength, (v) => {
    panel.edgeBundleStrength = v;
    cb.applyClusterForce();
    cb.restartSimulation(0.3);
    cb.markDirty();
  }, t("desc.edgeBundleStrength"));
}

/** Force simulation parameter sliders (center, repel, link force, link distance) */
function _buildForceParameters(s: ClusterSectionCtx): void {
  const { body, panel, cb } = s;

  let forceDebounce: ReturnType<typeof setTimeout> | undefined;
  const debouncedForceUpdate = () => {
    clearTimeout(forceDebounce);
    forceDebounce = setTimeout(() => {
      cb.updateForces();
      cb.restartSimulation(0.3);
    }, 150);
  };

  addSlider(body, t("force.centerForce"), 0, 0.15, 0.005, panel.centerForce, (v) => {
    panel.centerForce = v;
    debouncedForceUpdate();
  }, t("desc.centerForce"));
  addSlider(body, t("force.repelForce"), 0, 500, 10, panel.repelForce, (v) => {
    panel.repelForce = v;
    debouncedForceUpdate();
  }, t("desc.repelForce"));
  addSlider(body, t("force.linkForce"), 0, 0.1, 0.005, panel.linkForce, (v) => {
    panel.linkForce = v;
    debouncedForceUpdate();
  }, t("desc.linkForce"));
  addSlider(body, t("force.linkDistance"), 10, 300, 10, panel.linkDistance, (v) => {
    panel.linkDistance = v;
    debouncedForceUpdate();
  }, t("desc.linkDistance"));
  const rt = mergeRenderThresholds(panel.renderThresholds);
  addSlider(body, t("render.clusterChargeForce"), -50, 0, 1,
    rt.clusterChargeForce, (v) => {
      ensureRT(panel).clusterChargeForce = v;
      cb.doRenderKeepPanel();
    }, t("render.clusterChargeForceDesc"));
}

/** Cluster group rules sub-section (follow-mode info or independent rule editor) */
function _buildClusterGroupRules(s: ClusterSectionCtx): void {
  const { body, panel, ctx, cb } = s;

  const clusterHeader = body.createDiv({ cls: "setting-item" });
  clusterHeader.createDiv({ cls: "setting-item-name", text: t("cluster.groupRulesHeading") });

  if (panel.clusterFollowsGroupBy) {
    const infoEl = body.createDiv({ cls: "setting-item-description gi-follow-info" });
    infoEl.textContent = t("cluster.usingGroupBy");
  } else {
    const clusterListEl = body.createDiv({ cls: "gi-multirule-list" });
    renderClusterRuleList(clusterListEl, panel, ctx, cb);

    const addClusterBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addGroupRule") });
    addClusterBtn.addEventListener("click", () => {
      panel.clusterGroupRules.push({ groupBy: "tag:?", recursive: false });
      renderClusterRuleList(clusterListEl, panel, ctx, cb);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });
  }
}

/** Directional gravity rules sub-section */
function _buildDirectionalGravityRules(s: ClusterSectionCtx): void {
  const { body, panel, ctx, cb } = s;

  const gravHeader = body.createDiv({ cls: "setting-item" });
  gravHeader.createDiv({ cls: "setting-item-name", text: t("cluster.gravityRulesHeading") });
  const gravListEl = body.createDiv({ cls: "gi-gravity-rule-list" });
  renderDirectionalGravityList(gravListEl, panel, ctx, cb);

  const addGravBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addGravityRule") });
  addGravBtn.addEventListener("click", () => {
    panel.directionalGravityRules.push({ filter: "*", direction: "top", strength: 0.1 });
    renderDirectionalGravityList(gravListEl, panel, ctx, cb);
    cb.applyDirectionalGravityForce();
    cb.restartSimulation(0.3);
  });
}

/** Sort rules sub-section */
function _buildSortRules(s: ClusterSectionCtx): void {
  const { body, panel, cb } = s;

  const sortHeader = body.createDiv({ cls: "setting-item" });
  sortHeader.createDiv({ cls: "setting-item-name", text: t("cluster.sortHeading") });
  const sortListEl = body.createDiv({ cls: "gi-sort-list" });
  renderSortRuleList(sortListEl, panel, cb);

  const addSortBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addSortRule") });
  addSortBtn.addEventListener("click", () => {
    panel.sortRules.push({ key: "label", order: "asc" });
    renderSortRuleList(sortListEl, panel, cb);
    cb.applyClusterForce();
    cb.doRenderKeepPanel();
  });
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const SECTION_STATE_KEY = "graph-island-section-state";
let _sectionIdCounter = 0;
function loadSectionStates(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || "{}"); } catch { return {}; }
}
function saveSectionState(title: string, collapsed: boolean) {
  const states = loadSectionStates();
  states[title] = collapsed;
  localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(states));
}

// EW: Node directory folder collapse state persistence
const NODE_DIR_STATE_KEY = "graph-island-node-dir-state";
function _getNodeDirStates(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(NODE_DIR_STATE_KEY) || "{}"); } catch { return {}; }
}
function _saveNodeDirStates(states: Record<string, boolean>) {
  localStorage.setItem(NODE_DIR_STATE_KEY, JSON.stringify(states));
}

// ---------------------------------------------------------------------------
// P2: Progressive disclosure — Advanced settings group
// ---------------------------------------------------------------------------
function addAdvancedGroup(parent: HTMLElement, callback: (container: HTMLElement) => void): void {
  const details = parent.createEl("details", { cls: "gi-advanced-group" });
  details.createEl("summary", { cls: "gi-advanced-summary", text: t("panel.advanced") });
  const inner = details.createDiv({ cls: "gi-advanced-inner" });
  callback(inner);
}

function buildSection(container: HTMLElement, title: string, build: (body: HTMLElement) => void, helpText?: string, collapsed = false, icon?: string) {
  const section = container.createDiv({ cls: "graph-control-section tree-item" });
  const saved = loadSectionStates();
  const isCollapsed = title in saved ? saved[title] : collapsed;
  if (isCollapsed) section.addClass("is-collapsed");
  const header = section.createDiv({ cls: "tree-item-self graph-control-section-header is-clickable", attr: { role: "button", "aria-expanded": String(!isCollapsed), tabindex: "0" } });
  const collapseIcon = header.createDiv({ cls: "tree-item-icon collapse-icon" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("svg-icon", "right-triangle");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 8L12 17L21 8");
  svg.appendChild(path);
  collapseIcon.appendChild(svg);
  if (icon) {
    const iconEl = header.createEl("span", { cls: "gi-section-icon" });
    setIcon(iconEl, icon);
  }
  header.createEl("span", { cls: "tree-item-inner", text: title });

  if (helpText) {
    const helpBtn = header.createEl("span", { cls: "clickable-icon gi-section-help", attr: { "aria-label": t("help.ariaLabel") } });
    helpBtn.addClass("gi-help-btn");
    setIcon(helpBtn, "help-circle");
    helpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = section.querySelector(".gi-help-popup");
      if (existing) { existing.remove(); return; }
      const popup = section.createDiv({ cls: "gi-help-popup", attr: { role: "tooltip", "aria-label": t("help.ariaLabel") } });
      popup.textContent = helpText;
    });
  }

  // IM: aria-controls links header to body for screen readers
  const bodyId = `gi-section-${_sectionIdCounter++}`;
  const body = section.createDiv({ cls: "tree-item-children", attr: { id: bodyId } });
  header.setAttribute("aria-controls", bodyId);
  build(body);
  header.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".gi-section-help")) return;
    const collapsed = section.hasClass("is-collapsed");
    section.toggleClass("is-collapsed", !collapsed);
    header.setAttribute("aria-expanded", String(collapsed));
    saveSectionState(title, !collapsed);
  });
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); header.click(); }
    // IM: Escape collapses open section
    if (e.key === "Escape" && !section.hasClass("is-collapsed")) {
      e.preventDefault();
      section.addClass("is-collapsed");
      header.setAttribute("aria-expanded", "false");
      saveSectionState(title, false);
    }
  });
}

type TabId = "filter" | "display" | "layout" | "settings" | "nodes";

const TAB_DEFS: { id: TabId; labelKey: string; icon: string }[] = [
  { id: "filter",   labelKey: "tab.filter",   icon: "filter" },
  { id: "display",  labelKey: "tab.display",  icon: "eye" },
  { id: "layout",   labelKey: "tab.layout",   icon: "layout-grid" },
  { id: "nodes",    labelKey: "tab.nodes",    icon: "list-tree" },
  { id: "settings", labelKey: "tab.settings", icon: "settings" },
];

/** Count how many panel fields differ from defaults */
function countChangedFields(panel: PanelState): number {
  const defaults = createDefaultPanel();
  let count = 0;
  for (const key of Object.keys(defaults) as (keyof PanelState)[]) {
    const cur = panel[key];
    const def = defaults[key];
    if (cur instanceof Set || def instanceof Set) continue;
    if (Array.isArray(cur) || Array.isArray(def)) continue;
    if (typeof cur === "object" || typeof def === "object") continue;
    if (cur !== def) count++;
  }
  return count;
}

function buildTabBar(
  container: HTMLElement,
  activeTab: TabId,
  tabContainers: Map<TabId, HTMLElement>,
  onSwitch: (tab: TabId) => void,
  panel?: PanelState,
) {
  const bar = container.createDiv({ cls: "gi-tab-bar" });
  const changedCount = panel ? countChangedFields(panel) : 0;
  for (const def of TAB_DEFS) {
    const label = t(def.labelKey);
    const btn = bar.createEl("button", { cls: "gi-tab-btn", attr: { "aria-label": label, title: label } });
    setIcon(btn, def.icon);
    if (def.id === activeTab) btn.addClass("is-active");
    btn.addEventListener("click", () => {
      bar.querySelectorAll(".gi-tab-btn").forEach(b => b.removeClass("is-active"));
      btn.addClass("is-active");
      for (const [id, el] of tabContainers) {
        el.toggleClass("is-active", id === def.id);
      }
      onSwitch(def.id);
    });
  }
  // Show badge with total changed field count
  if (changedCount > 0) {
    const badge = bar.createEl("span", { cls: "gi-diff-badge", text: String(changedCount), attr: { title: `${changedCount} settings changed from defaults` } });
    badge.style.cssText = "font-size:10px;background:var(--interactive-accent);color:var(--text-on-accent);border-radius:8px;padding:1px 5px;margin-left:4px;vertical-align:top;";
  }
}

function buildViewModeBar(
  container: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
): void {
  const modeBar = container.createDiv({ cls: "gi-view-mode-bar" });

  const modes: { mode: ViewMode; icon: string; labelKey: string }[] = [
    { mode: "graph",    icon: "git-branch",  labelKey: "viewMode.graph" },
    { mode: "sunburst", icon: "sun",         labelKey: "viewMode.sunburst" },
    { mode: "timeline", icon: "calendar",    labelKey: "viewMode.timeline" },
  ];

  for (const m of modes) {
    const btn = modeBar.createEl("button", {
      cls: `gi-view-mode-btn${panel.viewMode === m.mode ? " is-active" : ""}`,
      attr: {
        "aria-label": t(m.labelKey),
        "aria-pressed": String(panel.viewMode === m.mode),
        "data-mode": m.mode,
        role: "radio",
      },
    });
    setIcon(btn.createSpan({ cls: "gi-view-mode-icon" }), m.icon);
    btn.createSpan({ cls: "gi-view-mode-label", text: t(m.labelKey) });
    btn.addEventListener("click", () => {
      if (panel.viewMode === m.mode) return;
      cb.setViewMode(m.mode);
      cb.announceA11y?.(`${t("viewMode.switched")}: ${t(m.labelKey)}`);
    });
  }
}

function buildPresetBar(container: HTMLElement, cb: PanelCallbacks) {
  // Thinking Mode switcher (M1) — 3 primary modes
  const modes: { key: string; icon: string; labelKey: string; descKey: string }[] = [
    { key: "explore", icon: "compass", labelKey: "mode.explore", descKey: "mode.exploreDesc" },
    { key: "analyze", icon: "bar-chart-2", labelKey: "mode.analyze", descKey: "mode.analyzeDesc" },
    { key: "write", icon: "pen-tool", labelKey: "mode.write", descKey: "mode.writeDesc" },
  ];
  const modeBar = container.createDiv({ cls: "gi-mode-bar" });
  for (const m of modes) {
    const btn = modeBar.createEl("button", { cls: "gi-mode-btn", text: t(m.labelKey) });
    setIcon(btn.createSpan({ cls: "gi-mode-icon" }), m.icon);
    const modeDesc = t(m.descKey);
    const modeSummary = cb.getPresetSummary?.(m.key) ?? "";
    btn.setAttribute("aria-label", modeDesc);
    btn.title = modeSummary ? `${modeDesc}\n\n${modeSummary}` : modeDesc;
    btn.addEventListener("click", () => {
      cb.applyPreset(m.key);
      // Highlight active mode
      modeBar.querySelectorAll(".gi-mode-btn").forEach(b => b.removeClass("is-active"));
      btn.addClass("is-active");
      showToast(t("toast.modeApplied").replace("{name}", t(m.labelKey)));
    });
  }

  // Additional presets dropdown
  const presets: { key: string; labelKey: string; descKey: string }[] = [
    { key: "simple", labelKey: "preset.simple", descKey: "preset.simpleDesc" },
    { key: "analysis", labelKey: "preset.analysis", descKey: "preset.analysisDesc" },
    { key: "creative", labelKey: "preset.creative", descKey: "preset.creativeDesc" },
    { key: "active-focus", labelKey: "preset.activeFocus", descKey: "preset.activeFocusDesc" },
    { key: "full-analysis", labelKey: "preset.fullAnalysis", descKey: "preset.fullAnalysisDesc" },
  ];
  const moreBar = container.createDiv({ cls: "gi-preset-bar" });
  for (const p of presets) {
    const btn = moreBar.createEl("button", { cls: "gi-preset-btn", text: t(p.labelKey) });
    const presetDesc = t(p.descKey);
    const presetSummary = cb.getPresetSummary?.(p.key) ?? "";
    btn.setAttribute("aria-label", presetDesc);
    btn.title = presetSummary ? `${presetDesc}\n\n${presetSummary}` : presetDesc;
    btn.addEventListener("click", () => {
      cb.applyPreset(p.key);
      showToast(t("toast.presetApplied").replace("{name}", t(p.labelKey)));
    });
  }
}

// ---------------------------------------------------------------------------
// Statistics dashboard bar (Feature M)
// ---------------------------------------------------------------------------
function _buildStatsBar(
  container: HTMLElement, panel: PanelState, ctx: PanelContext,
): void {
  const bar = container.createDiv({ cls: "gi-stats-bar" });

  // コンパクト表示行
  const summary = bar.createDiv({ cls: "gi-stats-summary" });
  const nodeCount = ctx.pixiNodes.size;
  const edgeCount = ctx.edgeCount;
  // グループ数: collapsedGroups にあるグループ
  const groupCount = panel.collapsedGroups.size;

  // 平均次数の計算
  let totalDegree = 0;
  let maxDeg = 0;
  let maxHubName = "-";
  for (const [id, pn] of ctx.pixiNodes) {
    const deg = ctx.degrees.get(id) ?? 0;
    totalDegree += deg;
    if (deg > maxDeg) {
      maxDeg = deg;
      maxHubName = pn.data.label || id;
    }
  }
  const avgDegree = nodeCount > 0 ? (totalDegree / nodeCount).toFixed(1) : "0";

  const nodeLabel = panel.searchQuery
    ? `${t("stats.nodes")}: ${nodeCount} (${t("stats.filtered")})`
    : `${t("stats.nodes")}: ${nodeCount}`;
  summary.createEl("span", { cls: "gi-stats-item", text: nodeLabel });
  summary.createEl("span", { cls: "gi-stats-item", text: `${t("stats.edges")}: ${edgeCount}` });

  // 展開トグル
  const toggle = summary.createEl("span", { cls: "gi-stats-toggle" });
  setIcon(toggle, "chevron-down");

  // 詳細行（初期非表示）
  const detail = bar.createDiv({ cls: "gi-stats-detail" });
  detail.style.display = "none";
  detail.createEl("span", { cls: "gi-stats-item", text: `${t("stats.groups")}: ${groupCount}` });
  detail.createEl("span", { cls: "gi-stats-item", text: `${t("stats.avgDegree")}: ${avgDegree}` });
  detail.createEl("span", { cls: "gi-stats-item", text: `${t("stats.maxHub")}: ${maxHubName}` });

  toggle.addEventListener("click", () => {
    const isHidden = detail.style.display === "none";
    detail.style.display = isHidden ? "" : "none";
    setIcon(toggle, isHidden ? "chevron-up" : "chevron-down");
  });

  // Copy stats as Markdown
  const copyBtn = summary.createEl("span", { cls: "gi-stats-copy clickable-icon", attr: { title: t("stats.copyMarkdown") } });
  setIcon(copyBtn, "copy");
  copyBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const md = [
      `## Graph Statistics`,
      `- **${t("stats.nodes")}**: ${nodeCount}`,
      `- **${t("stats.edges")}**: ${edgeCount}`,
      `- **${t("stats.groups")}**: ${groupCount}`,
      `- **${t("stats.avgDegree")}**: ${avgDegree}`,
      `- **${t("stats.maxHub")}**: ${maxHubName} (${maxDeg})`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(md);
      showToast(t("stats.copied"));
    } catch { /* clipboard not available */ }
  });
}

// ---------------------------------------------------------------------------
// Coordinate function preview plot
// ---------------------------------------------------------------------------

/**
 * Generate a representative source value for preview.
 * Each source kind produces a distinct input distribution so presets
 * that share the same transform (e.g. tree vs grid) look different.
 */
function evalSource(source: AxisSource, i: number, n: number): number {
  const t = i / Math.max(n - 1, 1);
  switch (source.kind) {
    case "index":
      return t; // uniform ramp
    case "random": {
      // Deterministic pseudo-random (mulberry32-style) for consistent preview
      let s = (i * 2654435761 + (source.seed ?? 42)) >>> 0;
      s = (s ^ (s >> 16)) * 0x45d9f3b; s = (s ^ (s >> 16)) >>> 0;
      return (s & 0xffff) / 0xffff;
    }
    case "const":
      return source.value ?? 1;
    case "metric": {
      const m = source.metric;
      if (m === "degree") {
        // Power-law-like: many low-degree, few high-degree
        return Math.pow(t, 0.4);
      }
      if (m === "bfs-depth") {
        // Discrete depth levels (0..4)
        return Math.floor(t * 5) / 4;
      }
      if (m === "sibling-rank") {
        // Sawtooth: resets within each depth level
        return (t * 5) % 1;
      }
      return t;
    }
    case "property":
      return t; // date → monotonic
    case "field":
      // Categorical: discrete steps
      return Math.floor(t * 6) / 5;
    default:
      return t;
  }
}

/** Evaluate a single transform at input value t, index i of n total. */
function evalTransform(transform: AxisTransform, t: number, i: number, n: number, constants?: Record<string, number>): number {
  switch (transform.kind) {
    case "linear":
      return t * (transform.scale ?? 1);
    case "bin": {
      const count = Math.max(transform.count, 1);
      return Math.min(Math.floor(t * count), count - 1) / Math.max(count - 1, 1);
    }
    case "date-to-index":
      return t;
    case "golden-angle":
      return (i * 2.39996322972865332) % (Math.PI * 2);
    case "even-divide": {
      const totalRad = ((transform.totalRange ?? 360) * Math.PI) / 180;
      return t * totalRad;
    }
    case "stack-avoid":
      return t + Math.sin(i * 9.1) * 0.05;
    case "curve": {
      const curveDef = CURVE_REGISTRY[transform.curve];
      if (!curveDef) return t;
      const params = { ...curveDef.defaultParams, ...transform.params, ...constants };
      return curveDef.fn(t * n, params);
    }
    case "expression": {
      const expr = transform.expr || "t";
      try {
        const err = validateExpr(expr);
        if (err) return t;
        const ast = parseExpr(expr);
        return evalExpr(ast, { t: t * n, i, n, v: t, pi: Math.PI, e: Math.E, ...constants }) * (transform.scale ?? 1);
      } catch {
        return t;
      }
    }
  }
  return t;
}

/**
 * Draw source→transform curve onto a canvas region.
 * Source distribution shapes the x-input; transform shapes the y-output.
 */
function plotCurve(
  ctx: CanvasRenderingContext2D,
  axisCfg: AxisConfig,
  n: number,
  x0: number, y0: number, w: number, h: number,
  color: string,
  label: string,
  constants?: Record<string, number>,
): void {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const srcVal = evalSource(axisCfg.source, i, n);
    samples.push(evalTransform(axisCfg.transform, srcVal, i, n, constants));
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of samples) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = hi - lo || 1;

  // Axis line
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h); ctx.lineTo(x0 + w, y0 + h);
  ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + h);
  ctx.stroke();

  // Curve
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const sx = x0 + (i / (n - 1)) * w;
    const sy = y0 + h - ((samples[i] - lo) / range) * h;
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // Label (axis name)
  ctx.fillStyle = "rgba(200, 210, 230, 0.7)";
  ctx.font = "bold 9px sans-serif";
  ctx.fillText(label, x0 + 2, y0 + 10);

  // Source + transform subtitle
  const srcLabel = axisCfg.source.kind === "metric"
    ? (axisCfg.source as { metric: string }).metric
    : axisCfg.source.kind;
  ctx.fillStyle = "rgba(180, 190, 220, 0.5)";
  ctx.font = "8px sans-serif";
  ctx.fillText(`${srcLabel} → ${axisCfg.transform.kind}`, x0 + 2, y0 + 19);
}

/**
 * Build preview showing axis1 and axis2 transform functions as graphs,
 * plus a small combined XY/polar scatter for the overall shape.
 */
function buildCoordPreview(body: HTMLElement, layout: CoordinateLayout): void {
  const W = 240, H = 80;
  const N = 60;
  const PAD = 4;

  const container = body.createDiv({ cls: "gi-coord-preview" });
  const canvas = container.createEl("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0, 0, W, H);

  const isPolar = layout.system === "polar";
  const lbl1 = isPolar ? "r" : "X";
  const lbl2 = isPolar ? "θ" : "Y";
  const col1 = "rgba(100, 160, 255, 0.8)";
  const col2 = "rgba(255, 130, 100, 0.8)";

  // Left half: axis1 curve, Right half: axis2 curve
  const halfW = (W - PAD * 3) / 2;
  const plotH = H - PAD * 2;
  plotCurve(ctx, layout.axis1, N, PAD, PAD, halfW, plotH, col1, lbl1, layout.constants);
  plotCurve(ctx, layout.axis2, N, PAD * 2 + halfW, PAD, halfW, plotH, col2, lbl2, layout.constants);
}

// ---------------------------------------------------------------------------
// Expression Library — preset formulas for common shapes and patterns
// ---------------------------------------------------------------------------

interface ExprLibraryEntry {
  /** Display name (i18n key or literal) */
  name: string;
  /** Description */
  desc: string;
  /** Axis 1 expression */
  axis1: string;
  /** Axis 2 expression */
  axis2: string;
  /** Coordinate system */
  system?: "cartesian" | "polar";
  /** User-defined constants to set alongside the expressions */
  constants?: Record<string, number>;
}

const EXPR_LIBRARY: ExprLibraryEntry[] = [
  // ── Shape fills ──
  {
    name: "Grid",
    desc: "i % ceil(sqrt(n)) × floor(i / ceil(sqrt(n)))",
    axis1: "i % ceil(sqrt(n))",
    axis2: "floor(i / ceil(sqrt(n)))",
  },
  {
    name: "Triangle",
    desc: "row k → k+1 nodes, centered",
    axis1: "i - floor((-1+sqrt(1+8*i))/2)*(floor((-1+sqrt(1+8*i))/2)+1)/2 - floor((-1+sqrt(1+8*i))/2)/2",
    axis2: "floor((-1+sqrt(1+8*i))/2)",
  },
  {
    name: "Diamond",
    desc: "rhombus — triangle top + mirrored bottom",
    axis1: "i - floor((-1+sqrt(1+8*(i%floor(n/2))))/2)*(floor((-1+sqrt(1+8*(i%floor(n/2))))/2)+1)/2 - floor((-1+sqrt(1+8*(i%floor(n/2))))/2)/2",
    axis2: "floor((-1+sqrt(1+8*(i%floor(n/2))))/2) * (1 - 2*floor(i/floor(n/2)))",
  },
  {
    name: "Octagon",
    desc: "regular octagon outline — nodes on edges",
    axis1: "cos(floor(8*i/n)*pi/4+pi/8)*(1-8*i/n+floor(8*i/n))+cos((floor(8*i/n)+1)*pi/4+pi/8)*(8*i/n-floor(8*i/n))",
    axis2: "sin(floor(8*i/n)*pi/4+pi/8)*(1-8*i/n+floor(8*i/n))+sin((floor(8*i/n)+1)*pi/4+pi/8)*(8*i/n-floor(8*i/n))",
  },
  {
    name: "Hexagon",
    desc: "regular hexagon outline — nodes on edges",
    axis1: "cos(floor(6*i/n)*pi/3+pi/6)*(1-6*i/n+floor(6*i/n))+cos((floor(6*i/n)+1)*pi/3+pi/6)*(6*i/n-floor(6*i/n))",
    axis2: "sin(floor(6*i/n)*pi/3+pi/6)*(1-6*i/n+floor(6*i/n))+sin((floor(6*i/n)+1)*pi/3+pi/6)*(6*i/n-floor(6*i/n))",
  },
  {
    name: "Filled Polygon",
    desc: "golden-angle fill shaped to k-gon (k=sides, d=density)",
    axis1: "(i/n)^d*(cos(pi/k)/cos(i*2.39996%(2*pi/k)-pi/k))*cos(i*2.39996)",
    axis2: "(i/n)^d*(cos(pi/k)/cos(i*2.39996%(2*pi/k)-pi/k))*sin(i*2.39996)",
    constants: { k: 6, d: 0.5 },
  },
  // ── Spirals & curves ──
  {
    name: "Sunflower",
    desc: "r=√t, θ=golden angle (137.5°)",
    axis1: "sqrt(t)",
    axis2: "i * 137.508",
    system: "polar",
  },
  {
    name: "Archimedean Spiral",
    desc: "r=t, θ=t×360°",
    axis1: "t",
    axis2: "t * 720",
    system: "polar",
  },
  {
    name: "Fermat Spiral",
    desc: "r=√t, θ=t×720°",
    axis1: "sqrt(t)",
    axis2: "t * 720",
    system: "polar",
  },
  // ── Mathematical patterns ──
  {
    name: "Sine Wave",
    desc: "X=t, Y=sin(2πt)",
    axis1: "t",
    axis2: "sin(t * tau)",
  },
  {
    name: "Lissajous",
    desc: "sin(3t) × cos(2t)",
    axis1: "sin(3 * t * tau)",
    axis2: "cos(2 * t * tau)",
  },
  {
    name: "Concentric Rings",
    desc: "r=floor(sqrt(i)), θ evenly spaced per ring",
    axis1: "floor(sqrt(i))",
    axis2: "i * 137.508",
    system: "polar",
  },
  {
    name: "Diagonal",
    desc: "X=i, Y=i (simple baseline)",
    axis1: "i",
    axis2: "i",
  },
];

/** Variable reference entries: name → [description_en, description_ja, range] */
const VARIABLE_REFERENCE: Array<{ name: string; desc: string; descJa: string; range: string }> = [
  { name: "i", desc: "Node index in group (0-based)", descJa: "グループ内インデックス（0始まり）", range: "0, 1, …, n−1" },
  { name: "n", desc: "Total node count in group", descJa: "グループ内ノード総数", range: "≥ 1" },
  { name: "t", desc: "Normalized position (min→0, max→1)", descJa: "正規化位置（最小→0, 最大→1）", range: "[0, 1]" },
  { name: "v", desc: "Raw source value (before normalization)", descJa: "ソースの生値（正規化前）", range: "any" },
];

/** Build a compact variable reference table inside the expression library */
function buildVariableReference(container: HTMLElement): void {
  const section = container.createDiv({ cls: "gi-var-reference" });
  const header = section.createDiv({ cls: "gi-var-reference-header" });
  header.createEl("span", { text: t("coord.variableReference"), cls: "gi-setting-label" });

  const table = section.createEl("table", { cls: "gi-var-table" });
  for (const v of VARIABLE_REFERENCE) {
    const tr = table.createEl("tr");
    tr.createEl("td", { text: v.name, cls: "gi-var-name" });
    tr.createEl("td", { text: getLocale() === "ja" ? v.descJa : v.desc, cls: "gi-var-desc" });
    tr.createEl("td", { text: v.range, cls: "gi-var-range" });
  }
}

/** Build the expression library UI — collapsible list of preset formulas */
function buildExprLibrary(
  body: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
): void {
  const wrapper = body.createDiv({ cls: "gi-expr-library" });

  // Header (collapsible)
  const header = wrapper.createDiv({ cls: "gi-expr-library-header clickable-icon" });
  const chevron = header.createEl("span", { cls: "gi-expr-library-chevron", text: "▸" });
  header.createEl("span", { text: ` ${t("coord.exprLibrary")}` });

  // Help icon
  const helpBtn = header.createEl("span", { cls: "gi-help-btn clickable-icon" });
  setIcon(helpBtn, "help-circle");
  helpBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const existing = wrapper.querySelector(".gi-help-popup");
    if (existing) { existing.remove(); return; }
    const popup = wrapper.createDiv({ cls: "gi-help-popup" });
    popup.textContent = tHelp("help.exprReference");
  });

  // Body (initially hidden)
  const listBody = wrapper.createDiv({ cls: "gi-expr-library-body" });
  listBody.style.display = "none";

  header.addEventListener("click", () => {
    const open = listBody.style.display !== "none";
    listBody.style.display = open ? "none" : "block";
    chevron.textContent = open ? "▸" : "▾";
  });

  // Hint
  listBody.createEl("div", {
    cls: "gi-hint",
    text: t("coord.libraryHint"),
  });

  // Variable reference table
  buildVariableReference(listBody);

  // Library entries
  for (const entry of EXPR_LIBRARY) {
    const item = listBody.createDiv({ cls: "gi-expr-library-item" });
    const nameEl = item.createEl("span", { cls: "gi-expr-library-name", text: entry.name });
    item.createEl("span", { cls: "gi-expr-library-desc", text: entry.desc });

    item.addEventListener("click", () => {
      // Apply the preset to panel
      const base = panel.coordinateLayout
        ?? { ...getPreset(panel.clusterArrangement) };
      panel.coordinateLayout = {
        ...base,
        system: entry.system ?? "cartesian",
        axis1: {
          source: { kind: "index" },
          transform: { kind: "expression", expr: entry.axis1, scale: 1 },
        },
        axis2: {
          source: { kind: "index" },
          transform: { kind: "expression", expr: entry.axis2, scale: 1 },
        },
        ...(entry.constants ? { constants: { ...entry.constants } } : {}),
      };
      panel.clusterArrangement = "custom";
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);

      // Brief highlight
      nameEl.style.color = "var(--text-success, #4f4)";
      setTimeout(() => { nameEl.style.color = ""; }, 600);
    });
  }

  // Auto-optimize button
  const optRow = listBody.createDiv({ cls: "gi-auto-optimize-row" });
  const optBtn = optRow.createEl("button", {
    cls: "gi-auto-optimize-btn",
    text: t("coord.autoOptimize"),
  });
  optBtn.addEventListener("click", () => {
    optBtn.disabled = true;
    optBtn.textContent = t("coord.autoOptimizeRunning");
    cb.autoOptimize();
    const rt = mergeRenderThresholds(panel.renderThresholds);
    const waitMs = (rt.autoOptMaxPasses) * 1500 + 500;
    setTimeout(() => {
      optBtn.disabled = false;
      optBtn.textContent = t("coord.autoOptimize");
    }, waitMs);
  });
}

/** Build the constants management UI — key-value list for user-defined constants */
function buildConstantsUI(
  body: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
): void {
  const constants = panel.coordinateLayout?.constants ?? {};
  const entries = Object.entries(constants);

  const section = body.createDiv({ cls: "gi-constants-section" });

  // Header
  const header = section.createDiv({ cls: "gi-setting-row" });
  header.createEl("span", {
    cls: "gi-setting-label",
    text: t("coord.constants"),
  });

  // Existing constant rows
  const listEl = section.createDiv({ cls: "gi-constants-list" });
  for (const [key, val] of entries) {
    buildConstantRow(listEl, key, val, panel, cb);
  }

  // Add button
  const addBtn = section.createEl("button", {
    cls: "gi-add-group",
    text: t("coord.addConstant"),
  });
  addBtn.addEventListener("click", () => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    const existing = base.constants ?? {};
    // Find a free single-letter key
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const reserved = new Set(["t", "i", "n", "v", "e"]);
    let newKey = "c";
    for (const ch of alphabet) {
      if (!reserved.has(ch) && !(ch in existing)) {
        newKey = ch;
        break;
      }
    }
    panel.coordinateLayout = {
      ...base,
      constants: { ...existing, [newKey]: 1 },
    };
    syncUserVarsFromLayout(panel);
    cb.applyClusterForce();
    // Add the new row directly instead of rebuilding the entire panel
    buildConstantRow(listEl, newKey, 1, panel, cb);
    cb.restartSimulation(0.5);
  });

  // --- System constants (overlap control + arrangement-specific) ---
  const SYSTEM_CONSTANTS: Record<string, { default: number; hint: string }> = {
    _blend: { default: 0.85, hint: t("coord.sysBlend") },
    _overlapPad: { default: 1.3, hint: t("coord.sysOverlapPad") },
    _minGap: { default: 0, hint: t("coord.sysMinGap") },
  };

  const sysHeader = section.createDiv({ cls: "gi-setting-row" });
  sysHeader.createEl("span", {
    cls: "gi-setting-label gi-system-constants-label",
    text: t("coord.systemConstants"),
  });

  const sysListEl = section.createDiv({ cls: "gi-constants-list gi-system-constants" });
  for (const [sysKey, sysDef] of Object.entries(SYSTEM_CONSTANTS)) {
    const currentVal = constants[sysKey] ?? sysDef.default;
    const isDefault = !(sysKey in constants);
    buildSystemConstantRow(sysListEl, sysKey, currentVal, isDefault, sysDef.hint, panel, cb);
  }

  // Hint
  section.createEl("p", { cls: "gi-hint", text: t("coord.constantsHint") });
}

/** Build a single constant row: [key input] = [value input] [delete] */
function buildConstantRow(
  container: HTMLElement,
  key: string,
  value: number,
  panel: PanelState,
  cb: PanelCallbacks,
): void {
  const row = container.createDiv({ cls: "gi-setting-row gi-constant-row" });

  // Key input (1-2 letters)
  const keyInput = row.createEl("input", {
    cls: "gi-setting-input gi-constant-key",
    type: "text",
    attr: { "aria-label": t("coord.constantKey") },
  });
  keyInput.value = key;
  keyInput.maxLength = 2;
  keyInput.style.width = "40px";
  keyInput.style.textAlign = "center";

  row.createEl("span", { text: " = ", cls: "gi-constant-eq" });

  // Value input
  const valInput = row.createEl("input", {
    cls: "gi-setting-input gi-constant-val",
    type: "number",
    attr: { "aria-label": t("coord.constantValue") },
  });
  valInput.value = String(value);
  valInput.style.width = "70px";
  valInput.step = "0.1";

  // Delete button
  const delBtn = row.createEl("button", { cls: "gi-remove-btn", text: "\u00d7" });

  const applyChange = (oldKey: string, newKey: string, newVal: number) => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    const existing = { ...(base.constants ?? {}) };
    if (oldKey !== newKey) delete existing[oldKey];
    existing[newKey] = newVal;
    panel.coordinateLayout = { ...base, constants: existing };
    syncUserVarsFromLayout(panel);
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  };

  keyInput.addEventListener("change", () => {
    const newKey = keyInput.value.trim().toLowerCase();
    if (!newKey || newKey.length > 2) { keyInput.value = key; return; }
    // Reject reserved names
    const reserved = new Set(["t", "i", "n", "v"]);
    if (reserved.has(newKey)) { keyInput.value = key; return; }
    applyChange(key, newKey, parseFloat(valInput.value) || 0);
  });

  valInput.addEventListener("change", () => {
    const newVal = parseFloat(valInput.value);
    if (isNaN(newVal)) return;
    applyChange(key, keyInput.value.trim().toLowerCase() || key, newVal);
  });

  delBtn.addEventListener("click", () => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    const existing = { ...(base.constants ?? {}) };
    delete existing[key];
    panel.coordinateLayout = {
      ...base,
      constants: Object.keys(existing).length > 0 ? existing : undefined,
    };
    syncUserVarsFromLayout(panel);
    cb.applyClusterForce();
    // Remove the row from DOM directly instead of rebuilding the entire panel
    row.remove();
    cb.restartSimulation(0.5);
  });
}

/** Build a system constant row: [fixed label] = [value input] [reset] */
function buildSystemConstantRow(
  container: HTMLElement,
  key: string,
  value: number,
  isDefault: boolean,
  hint: string,
  panel: PanelState,
  cb: PanelCallbacks,
): void {
  const row = container.createDiv({ cls: "gi-setting-row gi-constant-row gi-system-constant-row" });
  if (isDefault) row.classList.add("gi-constant-default");

  // Fixed label (not editable)
  const label = row.createEl("span", {
    cls: "gi-constant-key gi-system-constant-key",
    text: key,
    attr: { title: hint },
  });
  label.style.width = "80px";
  label.style.display = "inline-block";
  label.style.fontSize = "11px";

  row.createEl("span", { text: " = ", cls: "gi-constant-eq" });

  // Value input
  const valInput = row.createEl("input", {
    cls: "gi-setting-input gi-constant-val",
    type: "number",
    attr: { "aria-label": key + " " + t("coord.constantValue") },
  });
  valInput.value = String(value);
  valInput.style.width = "70px";
  valInput.step = key === "_minGap" ? "1" : "0.05";
  if (isDefault) valInput.style.opacity = "0.5";

  // Hint text
  const hintEl = row.createEl("span", {
    cls: "gi-hint gi-constant-hint",
    text: hint,
  });
  hintEl.style.fontSize = "10px";
  hintEl.style.marginLeft = "4px";
  hintEl.style.opacity = "0.6";

  valInput.addEventListener("change", () => {
    const newVal = parseFloat(valInput.value);
    if (isNaN(newVal)) return;
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    const existing = { ...(base.constants ?? {}) };
    existing[key] = newVal;
    panel.coordinateLayout = { ...base, constants: existing };
    syncUserVarsFromLayout(panel);
    // Remove default styling
    row.classList.remove("gi-constant-default");
    valInput.style.opacity = "1";
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  });
}

/** Sync user-defined variables from layout constants to the expression parser */
function syncUserVarsFromLayout(panel: PanelState): void {
  const constants = panel.coordinateLayout?.constants ?? {};
  setUserVars(new Set(Object.keys(constants)));
}

/** Unified axis text input — combines source + transform in a single expression.
 *  Syntax: FUNC(source, params...) or just source (implicit linear).
 *  Examples: "COS(tag:?)", "BIN(degree, 5)", "ROSE(index, k=5)", "folder" */
function buildAxisTextInput(
  body: HTMLElement,
  axisLabel: string,
  axisCfg: AxisConfig,
  axisNum: 1 | 2,
  panel: PanelState,
  cb: PanelCallbacks,
  _ctx: PanelContext,
  suggestions: string[],
) {
  const axisKey = axisNum === 1 ? "axis1" : "axis2";

  const updateAxis = (source: AxisSource, transform: AxisTransform, skipRebuild = false) => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    panel.coordinateLayout = {
      ...base,
      [axisKey]: { ...base[axisKey], source, transform },
    };
    syncArrangementFromLayout(panel);
    cb.applyClusterForce();
    if (!skipRebuild) cb.rebuildPanel();
    cb.restartSimulation(0.5);
  };

  // --- Unified expression row ---
  const row = body.createDiv({ cls: "gi-setting-row" });
  row.createEl("span", { cls: "gi-setting-label", text: axisLabel });
  const input = row.createEl("textarea", { cls: "gi-setting-input gi-expr-textarea" }) as HTMLTextAreaElement;
  input.value = transformExprToString(axisCfg.source, axisCfg.transform);
  input.placeholder = t("coord.transformExprHint");
  input.title = t("coord.transformExprHelp");
  input.rows = 2;
  // Auto-expand textarea to fit content
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  });

  // Validation indicator
  const indicator = row.createEl("span", { cls: "gi-expr-indicator" });
  const updateIndicator = (value: string) => {
    const result = parseTransformExpr(value, axisCfg.source);
    if (result) {
      indicator.textContent = " \u2713";
      indicator.title = t("transform.exprValid");
      indicator.style.color = "var(--text-success, #4f4)";
    } else if (value.trim()) {
      indicator.textContent = " \u2717";
      indicator.title = t("transform.exprError");
      indicator.style.color = "var(--text-error, #f44)";
    } else {
      indicator.textContent = "";
    }
  };
  updateIndicator(input.value);

  input.addEventListener("input", () => {
    updateIndicator(input.value);
  });

  input.addEventListener("change", () => {
    const result = parseTransformExpr(input.value, axisCfg.source);
    if (!result) return;
    updateAxis(result.source, result.transform);
  });

  // --- Conditional sub-UI for curve params (when current transform is curve) ---
  if (axisCfg.transform.kind === "curve") {
    const sub = body.createDiv({ cls: "gi-transform-sub" });
    const curveTransform = axisCfg.transform;
    const curveDef = CURVE_REGISTRY[curveTransform.curve];
    if (curveDef) {
      const currentParams = { ...curveDef.defaultParams, ...curveTransform.params };
      for (const [pKey, defaultVal] of Object.entries(curveDef.defaultParams)) {
        const paramLabel = curveDef.paramLabels[pKey] ?? pKey;
        const currentVal = currentParams[pKey] ?? defaultVal;
        const minVal = pKey === "k" ? 1 : -5;
        const maxVal = pKey === "k" ? 12 : 5;
        addSlider(sub, `  ${paramLabel}`, minVal, maxVal, 0.1, currentVal, (v) => {
          const newParams = { ...currentParams, [pKey]: v };
          updateAxis(axisCfg.source, {
            kind: "curve",
            curve: curveTransform.curve,
            params: newParams,
            scale: curveTransform.scale ?? 1,
          }, true);
        });
      }
    }
  }
}

/** Generate autocomplete suggestions for axis source input */
function getAxisSourceSuggestions(ctx: PanelContext): string[] {
  const keywords = ["index", "degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank", "random", "const"];
  const fields = getUnifiedFieldSuggestions(ctx);
  return [...keywords, ...fields, "hop:"];
}

// ---------------------------------------------------------------------------
// Axis source string ↔ AxisSource conversion
// ---------------------------------------------------------------------------
// Supported syntax:
//   index                       → { kind: "index" }
//   random                      → { kind: "random", seed: 42 }
//   random:123                  → { kind: "random", seed: 123 }
//   const:5                     → { kind: "const", value: 5 }
//   degree / in-degree / out-degree / bfs-depth / sibling-rank
//                               → { kind: "metric", metric: "..." }
//   hop:nodeName                → { kind: "hop", from: "nodeName" }
//   hop:nodeName:5              → { kind: "hop", from: "nodeName", maxDepth: 5 }
//   path / file / folder / tag / category / id / isTag
//                               → { kind: "field", field: "..." }
//   [anyFrontmatterKey]         → { kind: "field", field: "..." }
// ---------------------------------------------------------------------------

const METRIC_NAMES = new Set(["degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank"]);
const BUILT_IN_FIELDS = new Set(["path", "file", "folder", "tag", "category", "id", "isTag"]);

export function parseAxisSourceString(s: string): AxisSource | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  // Exact matches for keywords
  if (trimmed === "index") return { kind: "index" };
  if (METRIC_NAMES.has(trimmed)) return { kind: "metric", metric: trimmed as import("../types").MetricKind };

  // random / random:seed
  if (trimmed === "random") return { kind: "random", seed: 42 };
  if (trimmed.startsWith("random:")) {
    const seed = parseInt(trimmed.slice(7), 10);
    return { kind: "random", seed: isNaN(seed) ? 42 : seed };
  }

  // const:value
  if (trimmed.startsWith("const")) {
    if (trimmed === "const") return { kind: "const", value: 1 };
    if (trimmed.startsWith("const:")) {
      const v = parseFloat(trimmed.slice(6));
      return { kind: "const", value: isNaN(v) ? 1 : v };
    }
  }

  // hop:from or hop:from:maxDepth
  if (trimmed.startsWith("hop:")) {
    const parts = trimmed.slice(4).split(":");
    const from = parts[0] || "";
    const maxDepth = parts[1] ? parseInt(parts[1], 10) : undefined;
    return { kind: "hop", from, ...(maxDepth != null && !isNaN(maxDepth) ? { maxDepth } : {}) };
  }
  if (trimmed === "hop") return { kind: "hop", from: "" };

  // Built-in fields (path, file, folder, tag, category, id, isTag)
  if (BUILT_IN_FIELDS.has(trimmed)) return { kind: "field", field: trimmed };

  // Anything else with ":" suffix pattern like "tag:?" → treat as field name before ":"
  // But "tag:?" is just "tag" effectively, so strip trailing ":?" or ":*"
  const fieldMatch = trimmed.replace(/:[\?\*]?$/, "");
  if (fieldMatch && fieldMatch !== trimmed) {
    return { kind: "field", field: fieldMatch };
  }

  // Fallback: treat as a frontmatter field name
  return { kind: "field", field: trimmed };
}

export function axisSourceToString(src: AxisSource): string {
  switch (src.kind) {
    case "index": return "index";
    case "metric": return src.metric;
    case "random": return src.seed === 42 ? "random" : `random:${src.seed}`;
    case "const": return src.value === 1 ? "const" : `const:${src.value}`;
    case "hop": {
      let s = `hop:${src.from}`;
      if (src.maxDepth != null) s += `:${src.maxDepth}`;
      return s;
    }
    case "field": return src.field;
    case "property": return src.key; // legacy — display as field name
    default: return "index";
  }
}

