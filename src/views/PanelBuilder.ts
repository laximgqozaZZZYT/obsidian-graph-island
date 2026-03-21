import type { LayoutType, GraphNode, ShellInfo, DirectionalGravityRule, ClusterArrangement, ClusterGroupArrangement, ClusterGroupBy, ClusterGroupRule, GroupRule, SortRule, SortKey, SortOrder, NodeRule, GraphViewsSettings, OntologyRule, OntologyRelation, CoordinateLayout, CoordinateSystem, AxisSource, AxisConfig, AxisTransform, CurveKind, ClusterGravityConfig, NodeDisplayMode, CardDisplayConfig, DonutDisplayConfig, EdgeCardinalityMode, CardinalityRule, CardRenderConfig, CardinalityRenderConfig, RenderThresholds } from "../types";
import { DEFAULT_CARD_RENDER_CONFIG, DEFAULT_CARDINALITY_RENDER_CONFIG, DEFAULT_RENDER_THRESHOLDS } from "../types";
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

// ---------------------------------------------------------------------------
// Panel state (shared with GraphViewContainer)
// ---------------------------------------------------------------------------
interface GroupByRule { field: string; op?: string; indent?: number; recursive?: boolean; }

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
  /** ビジュアルリンクエディタ: Alt+ドラッグでノード間にリンク作成 */
  visualLinkEditor: boolean;
  /** フォーカス中のノードID (null = フォーカスなし) */
  focusNodeId: string | null;
  /** ビュー同期: 他の Graph Island ビューとパネル状態を同期 */
  syncViewId: string | null;
  /** キャンバス上の注釈リスト (W4: color added for sticky note support) */
  annotations: { nodeId: string; text: string; x: number; y: number; color?: string }[];
  /** ブックマークされたノードIDリスト */
  bookmarkedNodes: string[];
  /** エッジ重みラベル表示（同一ペア間のエッジ本数） */
  showEdgeWeightLabels: boolean;
  /** エッジ多重度ラベル: 同一ノードペア間のエッジ数を表示 (count > 1 only) */
  showEdgeCardinalityLabels: boolean;
  /** Unified node color mode */
  nodeColorMode: "default" | "category" | "heatmap" | "community" | "field";
  /** EO: Field name for nodeColorMode="field" */
  nodeColorField: string;
  /** ET: Custom color palette (CSS color strings, comma-separated) */
  customColorPalette: string;
  /** Filter edges by directionality: "all" | "bidirectional" | "unidirectional" */
  edgeDirectionFilter: "all" | "bidirectional" | "unidirectional";
  /** Visual indicator for bidirectional edges (thicker + higher alpha) */
  showBidirectionalIndicator: boolean;
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
  /** Named saved search queries */
  savedSearchQueries: { name: string; query: string }[];
  /** Pinned node positions: persisted across layout changes */
  pinnedPositions: Record<string, { x: number; y: number }>;
  /** ED: Saved viewport positions (name → {x, y, scale}) */
  savedViewports: { name: string; x: number; y: number; scale: number }[];
  /** Preset zoom level — applied when loading a preset (0 = use auto-fit) */
  presetZoomLevel: number;
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
  /** Gap detection mode for missing connections */
  gapDetectionMode: "within-tag" | "cross-cluster" | "both";
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
  /** C3: Relation type picker — right-click to assign edge type */
  showRelationTypePicker: boolean;
  /** C6: Multi-select node set (Shift+click to add, operations on selection) */
  multiSelectNodeIds: string[];
  /** C7: Inline edit — double-click to edit frontmatter in tooltip */
  enableInlineEdit: boolean;
  /** C8: Auto-open NodeDetailView side panel for relation details on graph open */
  showRelationDrawer: boolean;
  /** C4: Manual clustering — drag nodes to assign groups */
  enableManualClustering: boolean;
  /** C4: Manual cluster overrides (nodeId → groupKey) */
  manualClusterOverrides?: Record<string, string>;
  // --- Phase 6: ExcaliBrain-like features ---
  /** F2: Inline ontology editor — assign types via context menu */
  enableInlineOntologyEditor: boolean;
  /** F5: Relation matrix view */
  showRelationMatrix: boolean;
  // --- Phase 7: Advanced features ---
  /** E5: Presentation mode — step-through guided tour */
  presentationMode: boolean;
  /** E5: Presentation waypoints (ordered node IDs) */
  presentationWaypoints: string[];
  /** E5: Current presentation step index */
  presentationStep: number;
  /** Show frontmatter image as node thumbnail */
  showNodeThumbnails: boolean;
  /** Number of alternative shortest paths to display (1 = shortest only) */
  kShortestPaths: number;
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
  /** I1b: Surprise auto-trigger interval in seconds (0 = disabled) */
  surpriseInterval?: number;
  /** D1: Manually expanded nodes in local graph mode (IDs whose neighbors are shown beyond hop limit) */
  expandedNodes?: string[];
}

/** Create a fresh PanelState with all mutable values as new instances.
 *  Always use this instead of spreading a shared constant — prevents
 *  shared-reference bugs where mutations leak back into "defaults". */
export function createDefaultPanel(): PanelState {
  return {
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
    cableTrunkAlpha: 0,
    cableSpacing: 14,
    cableFanWidth: 2.5,
    cableFanAlpha: 0.9,
    syncWithEditor: true,
    localGraphCenter: null,
    localGraphHops: 2,
    edgeWeightThickness: true,
    edgeLayerMode: false,
    focusMode: false,
    visualLinkEditor: false,
    focusNodeId: null,
    syncViewId: null,
    annotations: [],
    bookmarkedNodes: [],
    showEdgeWeightLabels: false,
    showEdgeCardinalityLabels: false,
    edgeDirectionFilter: "all" as const,
    showBidirectionalIndicator: false,
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
    savedSearchQueries: [],
    savedViewports: [],
    presetZoomLevel: 0,
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
    gapDetectionMode: "within-tag" as const,
    highlightPatterns: false,
    showBridgeNodes: false,
    focusLayout: false,
    showHierarchyBreadcrumb: false,
    showSimilarSuggestions: false,
    showStructureQuestions: false,
    showEntropyOverlay: false,
    showClusterCompare: false,
    showRelationTypePicker: false,
    multiSelectNodeIds: [],
    enableInlineEdit: false,
    showRelationDrawer: false,
    enableManualClustering: false,
    enableInlineOntologyEditor: false,
    showRelationMatrix: false,
    presentationMode: false,
    presentationWaypoints: [],
    presentationStep: 0,
    showNodeThumbnails: false,
    nodeIconField: "",
    nodeIconMap: {},
    kShortestPaths: 1,
    focusConeEnabled: true,
    surpriseInterval: 0,
    expandedNodes: [],
    analysisOverlay: "off" as const,
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
  // Clamp hoverHops to 0-10
  if (panel.hoverHops < 0) panel.hoverHops = 0;
  if (panel.hoverHops > 10) panel.hoverHops = 10;
  // Clamp nodeSize to 1-100
  if (panel.nodeSize < 1) panel.nodeSize = 1;
  if (panel.nodeSize > 100) panel.nodeSize = 100;
  // Ensure arrays are arrays
  if (!Array.isArray(panel.multiSelectNodeIds)) panel.multiSelectNodeIds = [];
  if (!Array.isArray(panel.presentationWaypoints)) panel.presentationWaypoints = [];
  // Ensure collapsedGroups is a Set
  if (!(panel.collapsedGroups instanceof Set)) {
    panel.collapsedGroups = new Set(Array.isArray(panel.collapsedGroups) ? panel.collapsedGroups : []);
  }
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
  _cachedFieldSuggestions = cb.collectFieldSuggestions();

  // =========================================================================
  // Top bar: Search (always visible, outside sections)
  // =========================================================================
  const topBar = panelEl.createDiv({ cls: "gi-top-bar" });

  // --- Search bar with help icon ---
  const searchRow = topBar.createDiv({ cls: "gi-search-row" });
  const searchWrapper = searchRow.createDiv({ cls: "gi-search-wrapper" });
  const searchIcon = searchWrapper.createEl("span", { cls: "gi-search-icon" });
  setIcon(searchIcon, "search");
  const searchBar = searchWrapper.createEl("input", {
    cls: "gi-search gi-top-search",
    type: "text",
    placeholder: t("search.placeholder"),
    attr: { "aria-label": t("search.placeholder") },
  });
  const searchClearBtn = searchWrapper.createEl("span", { cls: "gi-search-clear" });
  searchClearBtn.textContent = "\u00d7";
  searchClearBtn.style.display = panel.searchQuery ? "flex" : "none";

  // Search hit count badge
  const searchCountBadge = searchWrapper.createEl("span", { cls: "gi-search-count" });
  searchCountBadge.style.cssText = "font-size:10px;color:var(--text-muted);margin-right:4px;display:none;";
  if (panel.searchQuery && ctx.nodeCount > 0) {
    searchCountBadge.textContent = String(ctx.pixiNodes.size);
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
  const historyDropdown = searchWrapper.createDiv({ cls: "gi-search-history" });
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
      return;
    }
    historyDropdown.empty();

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
      const item = historyDropdown.createDiv({ cls: "gi-search-history-item" });
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
      }, 400);
    });
  }
  // フォーカス時に履歴を表示
  searchBar.addEventListener("focus", () => { showHistory(); });
  searchBar.addEventListener("blur", () => {
    // 少し遅延させてクリックイベントが先に処理されるようにする
    setTimeout(() => { historyDropdown.style.display = "none"; }, 150);
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

  // Build each tab
  buildFilterTab(filterTab, panel, ctx, cb);
  buildDisplayTab(displayTab, panel, ctx, cb);
  buildLayoutTab(layoutTab, panel, ctx, cb);
  _buildNodesTab(nodesTab, panel, ctx, cb);
  buildSettingsTab(settingsTab, panel, ctx, cb);
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
    addToggle(body, t("filter.orphans"), panel.showOrphans, (v) => { panel.showOrphans = v; cb.invalidateDataKeepPanel(); }, t("desc.orphans"));
    // GK: Auto-fit on filter change
    addToggle(body, t("filter.autoFit") ?? "Auto-fit on filter", panel.autoFitOnFilter, (v) => { panel.autoFitOnFilter = v; });
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
      cb.doRenderKeepPanel();
    }, t("desc.nodeColorMode"));
    // EO+EQ: Field selector when mode is "field" (with autocomplete from frontmatter)
    if (currentColorMode === "field") {
      const fields = cb.collectFieldSuggestions();
      const options = [{ value: "", label: "-- select --" }, ...fields.map(f => ({ value: f, label: f }))];
      addSelect(body, t("display.nodeColorField") ?? "Color Field", options, panel.nodeColorField ?? "", (v) => {
        panel.nodeColorField = v;
        cb.doRenderKeepPanel();
      });
      // ET: Custom color palette input
      addTextInput(body, t("display.customPalette") ?? "Custom Palette", panel.customColorPalette ?? "", "#ff0000, #00ff00, #0000ff", (v) => {
        panel.customColorPalette = v;
        cb.doRenderKeepPanel();
      });
    }
    addSlider(body, t("display.nodeSize"), 5, 300, 1, panel.nodeSize, (v) => { panel.nodeSize = v; cb.resetZoomBaseNodeSize(); cb.recalcNodeRadii(); cb.markDirty(); }, t("desc.nodeSize"));
    addSlider(body, t("display.textFade"), 0, 1, 0.05, panel.textFadeThreshold, (v) => { panel.textFadeThreshold = v; cb.applyTextFade(); }, t("desc.textFade"));
    // Label density at zoom-out
    const rtDens = panel.renderThresholds ?? {};
    addSlider(body, t("display.labelDensity") ?? "Label Density", 0.2, 3.0, 0.1, rtDens.labelDensity ?? 1.0, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.labelDensity = v;
      cb.applyTextFade();
      cb.announceA11y?.(`${t("display.labelDensity") ?? "Label Density"}: ${v.toFixed(1)}`);
    }, t("desc.labelDensity") ?? "Controls how many labels are shown when zoomed out");
    // Label mode override (auto / initials / truncated / full)
    const rtMode = panel.renderThresholds ?? {};
    addSelect(body, t("display.labelMode") ?? "Label Mode", [
      { value: "auto", label: "Auto (zoom)" },
      { value: "initials", label: "Initials (2 chars)" },
      { value: "truncated", label: "Truncated (5-12)" },
      { value: "full", label: "Full name" },
    ], rtMode.labelModeOverride ?? "auto", (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      (panel.renderThresholds as any).labelModeOverride = v;
      cb.applyTextFade();
      cb.announceA11y?.(`${t("display.labelMode") ?? "Label Mode"}: ${v}`);
    });

    // GD: Label max characters
    const rtLabel = panel.renderThresholds ?? {};
    addSlider(body, t("display.labelMaxChars") ?? "Label Max Chars", 0, 60, 1, rtLabel.labelMaxChars ?? 0, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.labelMaxChars = v;
      cb.doRenderKeepPanel();
    });
    // --- Advanced (hidden by default) ---
    addAdvancedGroup(body, (adv) => {
      const rtNode = panel.renderThresholds ?? {};
      addToggle(adv, t("display.nodeSizeByDegree"), rtNode.nodeSizeByDegree ?? false, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.nodeSizeByDegree = v;
        cb.recalcNodeRadii();
        cb.markDirty();
      }, t("desc.nodeSizeByDegree"));
      addTextInput(adv, t("display.nodeSubLabelFields"), panel.nodeSubLabelFields ?? "", "e.g. category, date, degree", (v) => {
        panel.nodeSubLabelFields = v;
        cb.doRenderKeepPanel();
      });
      addTextInput(adv, t("display.hoverTooltipFields"), panel.hoverTooltipFields ?? "", "e.g. date, story_order", (v) => {
        panel.hoverTooltipFields = v;
        cb.markDirty();
      });
      // A3: Node icon prefix
      addTextInput(adv, t("display.nodeIconField"), panel.nodeIconField ?? "", "e.g. node_type", (v) => {
        panel.nodeIconField = v;
        cb.doRenderKeepPanel();
      });
      addTextInput(adv, t("display.nodeIconMap"), JSON.stringify(panel.nodeIconMap ?? {}), '{"character":"👤","episode":"📖"}', (v) => {
        try { panel.nodeIconMap = JSON.parse(v); } catch { /* ignore invalid JSON */ }
        cb.doRenderKeepPanel();
      });
      addSlider(adv, t("display.hoverHops"), 1, 5, 1, panel.hoverHops, (v) => { panel.hoverHops = v; cb.applyHover(); cb.markDirty(); }, t("desc.hoverHops"));
      // HR: Max hover neighbor labels
      const rtHover = panel.renderThresholds ?? {};
      addSlider(adv, t("display.maxHoverLabels") ?? "Max Hover Labels", 5, 100, 5, rtHover.maxHoverNeighborLabels ?? 30, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.maxHoverNeighborLabels = v;
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
      // ビジュアルリンクエディタ: Alt+ドラッグでリンク作成
      addToggle(adv, t("display.visualLinkEditor"), panel.visualLinkEditor, (v) => {
        panel.visualLinkEditor = v;
        cb.markDirty();
      }, t("desc.visualLinkEditor"));
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
          cb.doRenderKeepPanel();
        }, t("desc.tagNodeShape"));
      }
      addSelect(adv, t("display.defaultNodeShape"), shapeOptions, defaultRule?.shape ?? "circle", (v) => {
        const rule = panel.nodeShapeRules.find(r => r.match === "default");
        if (rule) rule.shape = v as NodeShape;
        else panel.nodeShapeRules.push({ match: "default", shape: v as NodeShape });
        cb.doRenderKeepPanel();
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
      // FT: Card body max lines
      const rtCard = panel.renderThresholds ?? {};
      addSlider(body, t("display.cardBodyLines") ?? "Body Lines", 0, 10, 1, rtCard.cardBodyMaxLines ?? 3, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.cardBodyMaxLines = v;
        cb.doRenderKeepPanel();
      });
      // GE: Card background opacity
      const crcGE = panel.cardRenderConfig ?? {};
      addSlider(body, t("display.cardBgOpacity") ?? "Card Opacity", 0.1, 1.0, 0.05, (crcGE as any).plainCardFillAlpha ?? 0.8, (v) => {
        if (!panel.cardRenderConfig) panel.cardRenderConfig = {} as any;
        (panel.cardRenderConfig as any).plainCardFillAlpha = v;
        cb.doRenderKeepPanel();
      });
      // FX: Card body font size
      addSlider(body, t("display.cardBodyFontSize") ?? "Body Font Size", 4, 16, 1, rtCard.cardBodyFontSize ?? 8, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.cardBodyFontSize = v;
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
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.autoLOD = v;
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
        { value: "pagerank", label: t("display.metricPagerank") },
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
        cb.doRenderKeepPanel();
      });
  }, tHelp("help.nodeDecorations"), false, "sparkles");
}

function _buildStructureAnalysisSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.structureAnalysis"), (body) => {
    addToggle(body, t("display.ontologyBackbone"), panel.showOntologyBackbone ?? false, (v) => {
      panel.showOntologyBackbone = v;
      cb.markDirty();
    }, t("desc.ontologyBackbone"));
    addSelect(body, t("display.clusterLabelDetail"), [
      { value: "minimal", label: t("display.clusterLabelMinimal") },
      { value: "standard", label: t("display.clusterLabelStandard") },
      { value: "detailed", label: t("display.clusterLabelDetailed") },
      { value: "rich", label: t("display.clusterLabelRich") },
    ], panel.clusterLabelDetail, (v) => {
      panel.clusterLabelDetail = v as "minimal" | "standard" | "detailed" | "rich";
      cb.markDirty();
    }, t("desc.clusterLabelDetail"));
    addToggle(body, t("display.highlightPatterns"), panel.highlightPatterns, (v) => {
      panel.highlightPatterns = v;
      cb.markDirty();
    }, t("desc.highlightPatterns"));
    // R2: showBridgeNodes toggle removed — now controlled via analysisOverlay dropdown
    addToggle(body, t("display.focusLayout"), panel.focusLayout, (v) => {
      panel.focusLayout = v;
      if (v && panel.localGraphCenter) {
        panel.clusterArrangement = "ego";
      }
      cb.doRender();
    }, t("desc.focusLayout"));
    addToggle(body, t("display.showHierarchyBreadcrumb"), panel.showHierarchyBreadcrumb, (v) => {
      panel.showHierarchyBreadcrumb = v;
      cb.markDirty();
    }, t("desc.showHierarchyBreadcrumb"));
    // M2: Apply Ego Layout button
    const egoBtn = body.createEl("button", { cls: "mod-cta", text: t("action.applyEgoLayout") });
    egoBtn.style.marginTop = "6px";
    egoBtn.style.width = "100%";
    egoBtn.addEventListener("click", () => {
      cb.applyEgoToVisible?.();
    });
    // F2: Inline ontology editor
    addToggle(body, t("display.inlineOntologyEditor"), panel.enableInlineOntologyEditor, (v) => {
      panel.enableInlineOntologyEditor = v;
      cb.markDirty();
    }, t("desc.inlineOntologyEditor"));
    // F5: Relation matrix
    addToggle(body, t("display.relationMatrix"), panel.showRelationMatrix, (v) => {
      panel.showRelationMatrix = v;
      cb.markDirty();
    }, t("desc.relationMatrix"));
  }, tHelp("help.structureAnalysis"), true, "git-branch");
}

function _buildDiscoverySection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.discovery"), (body) => {
    addToggle(body, t("display.showSimilarSuggestions"), panel.showSimilarSuggestions, (v) => {
      panel.showSimilarSuggestions = v;
      cb.markDirty();
    }, t("desc.showSimilarSuggestions"));
    addToggle(body, t("display.showStructureQuestions"), panel.showStructureQuestions, (v) => {
      panel.showStructureQuestions = v;
      cb.markDirty();
    }, t("desc.showStructureQuestions"));
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
      cb.markDirty();
    });
    // D5: Cluster Compare
    addToggle(body, t("display.clusterCompare"), panel.showClusterCompare, (v) => {
      panel.showClusterCompare = v;
      cb.markDirty();
    }, t("desc.clusterCompare"));
    // S1: Hierarchy Tree Overlay
    addToggle(body, t("display.hierarchyTree"), panel.showHierarchyTree ?? false, (v) => {
      panel.showHierarchyTree = v;
      cb.markDirty();
    }, t("desc.hierarchyTree"));
    // S6: Ontology Backbone — toggle is in _buildStructureAnalysisSection (no duplicate)
  }, tHelp("help.discovery"), true, "lightbulb");
}

function _buildInteractionSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, "Interaction", (body) => {
    addToggle(body, t("display.relationTypePicker"), panel.showRelationTypePicker, (v) => {
      panel.showRelationTypePicker = v;
      cb.markDirty();
    }, t("desc.relationTypePicker"));
    // Multi-select: show status label instead of misleading toggle
    // Selection is managed via Ctrl+click in node list / Shift+click on canvas
    if (panel.multiSelectNodeIds.length > 0) {
      addToggle(body, t("display.multiSelect"), true, (v) => {
        if (!v) { panel.multiSelectNodeIds = []; cb.rebuildPanel(); }
        cb.markDirty();
      }, t("desc.multiSelect"));
    }
    addToggle(body, t("display.inlineEdit"), panel.enableInlineEdit, (v) => {
      panel.enableInlineEdit = v;
      cb.markDirty();
    }, t("desc.inlineEdit"));
    // HW: showRelationDrawer removed — ghost control with no rendering effect
    addToggle(body, t("display.manualClustering"), panel.enableManualClustering, (v) => {
      panel.enableManualClustering = v;
      cb.markDirty();
    }, t("desc.manualClustering"));

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

function _buildAdvancedSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, "Advanced", (body) => {
    addToggle(body, t("display.presentationMode"), panel.presentationMode, (v) => {
      panel.presentationMode = v;
      if (!v) { panel.presentationStep = 0; }
      cb.markDirty();
    }, t("desc.presentationMode"));
    if (panel.presentationMode) {
      const navRow = body.createDiv({ cls: "setting-item" });
      const prevBtn = navRow.createEl("button", { text: t("action.prevStep") });
      prevBtn.addEventListener("click", () => {
        if (panel.presentationStep > 0) {
          panel.presentationStep--;
          const wId = panel.presentationWaypoints[panel.presentationStep];
          if (wId) cb.jumpToNode(wId);
        }
      });
      const nextBtn = navRow.createEl("button", { text: t("action.nextStep") });
      nextBtn.style.marginLeft = "4px";
      nextBtn.addEventListener("click", () => {
        if (panel.presentationStep < panel.presentationWaypoints.length - 1) {
          panel.presentationStep++;
          const wId = panel.presentationWaypoints[panel.presentationStep];
          if (wId) cb.jumpToNode(wId);
        }
      });
      const addBtn = navRow.createEl("button", { text: t("action.addWaypoint") });
      addBtn.style.marginLeft = "4px";
      addBtn.addEventListener("click", () => {
        // Add the currently focused node as a waypoint
        if (panel.focusNodeId && !panel.presentationWaypoints.includes(panel.focusNodeId)) {
          panel.presentationWaypoints.push(panel.focusNodeId);
          cb.rebuildPanel();
        }
      });
      const info = navRow.createEl("span", {
        text: ` ${panel.presentationStep + 1}/${panel.presentationWaypoints.length}`,
      });
      info.style.marginLeft = "8px";
      info.style.fontSize = "11px";
      info.style.color = "var(--text-muted)";
    }
  }, tHelp("help.advanced"), true, "presentation");

  // I1b: Surprise guided mode — auto-trigger interval
  buildSection(tabEl, t("section.surprise"), (body) => {
    addSlider(body, t("display.surpriseInterval"), 0, 120, 5,
      panel.surpriseInterval ?? 0, (v) => {
        panel.surpriseInterval = v;
        cb.markDirty();
      }, t("desc.surpriseInterval"));
  }, tHelp("help.surprise"), false, "surprise");
}

function _buildEdgeDisplaySection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.displayEdges"), (body) => {
    // --- Basic (always visible) ---
    addToggle(body, t("display.arrows"), panel.showArrows, (v) => { panel.showArrows = v; cb.doRenderKeepPanel(); }, t("desc.arrows"));
    addToggle(body, t("display.fadeEdges"), panel.fadeEdgesByDegree, (v) => { panel.fadeEdgesByDegree = v; cb.markDirty(); }, t("desc.fadeEdges"));
    // GG: Global edge opacity
    const rtEdge = panel.renderThresholds ?? {};
    addSlider(body, t("display.edgeOpacity") ?? "Edge Opacity", 0.05, 1.0, 0.05, rtEdge.globalEdgeAlpha ?? 1.0, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.globalEdgeAlpha = v;
      cb.markDirty();
    });
    // GW: Edge label font size
    addSlider(body, t("display.edgeLabelFontSize") ?? "Edge Label Size", 6, 18, 1, rtEdge.edgeLabelFontSize ?? 10, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.edgeLabelFontSize = v;
      cb.markDirty();
    });
    // --- Advanced (hidden by default) ---
    addAdvancedGroup(body, (adv) => {
      addToggle(adv, t("display.edgeColor"), panel.colorEdgesByRelation, (v) => { panel.colorEdgesByRelation = v; cb.markDirty(); cb.rebuildPanel(); }, t("desc.edgeColor"));
      // Unified edge label mode dropdown (replaces 3 separate toggles)
      const edgeLabelMode = panel.showEdgeWeightLabels ? "weight"
        : panel.showEdgeCardinalityLabels ? "cardinality"
        : panel.showEdgeLabels ? "relation" : "none";
      addSelect(adv, t("display.edgeLabelMode"), [
        { value: "none", label: t("display.edgeLabelMode.none") },
        { value: "relation", label: t("display.edgeLabelMode.relation") },
        { value: "weight", label: t("display.edgeLabelMode.weight") },
        { value: "cardinality", label: t("display.edgeLabelMode.cardinality") },
      ], edgeLabelMode, (v) => {
        panel.showEdgeLabels = v === "relation";
        panel.showEdgeWeightLabels = v === "weight";
        panel.showEdgeCardinalityLabels = v === "cardinality";
        cb.markDirty();
      }, t("desc.edgeLabelMode"));
      addSelect(adv, t("display.edgeLabelPlacement"), [
        { value: "center", label: t("display.edgeLabelCenter") },
        { value: "offset", label: t("display.edgeLabelOffset") },
        { value: "smart", label: t("display.edgeLabelSmart") },
      ], panel.edgeLabelPlacement ?? "center", (v) => {
        panel.edgeLabelPlacement = v as "center" | "offset" | "smart";
        cb.markDirty();
      });
      addToggle(adv, t("display.edgeLayerMode"), panel.edgeLayerMode, (v) => { panel.edgeLayerMode = v; cb.markDirty(); }, t("desc.edgeLayerMode"));
      addSelect(adv, t("display.edgeDirectionFilter"), [
        { value: "all", label: t("display.edgeDirAll") },
        { value: "bidirectional", label: t("display.edgeDirBidirectional") },
        { value: "unidirectional", label: t("display.edgeDirUnidirectional") },
      ], panel.edgeDirectionFilter, (v) => {
        panel.edgeDirectionFilter = v as "all" | "bidirectional" | "unidirectional";
        cb.markDirty();
      }, t("desc.edgeDirectionFilter"));
      addToggle(adv, t("display.bidirectionalIndicator"), panel.showBidirectionalIndicator, (v) => { panel.showBidirectionalIndicator = v; cb.markDirty(); }, t("desc.bidirectionalIndicator"));
      const rt = panel.renderThresholds ?? {};
      addToggle(adv, t("display.edgeStrengthGlow"), rt.edgeStrengthGlow ?? DEFAULT_RENDER_THRESHOLDS.edgeStrengthGlow, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.edgeStrengthGlow = v;
        cb.markDirty();
      }, t("desc.edgeStrengthGlow"));
      addSlider(adv, t("display.degreeEdgeWidth"), 0, 2, 0.1,
        panel.degreeEdgeWidth ?? 0, (v) => {
          panel.degreeEdgeWidth = v;
          cb.markDirty();
        }, t("desc.degreeEdgeWidth"));
      addToggle(adv, t("display.showPathfinderOverlay"), panel.showPathfinderOverlay, (v) => { panel.showPathfinderOverlay = v; cb.markDirty(); }, t("desc.showPathfinderOverlay"));
      addToggle(adv, t("display.edgeWeightThickness"), panel.edgeWeightThickness, (v) => { panel.edgeWeightThickness = v; cb.markDirty(); }, t("desc.edgeWeightThickness"));
      // GN: Edge toggle with a11y announcements
      const _edgeToggle = (label: string, key: keyof PanelState, cb2: () => void) => (v: boolean) => {
        (panel as any)[key] = v;
        cb2();
        cb.announceA11y?.(`${label}: ${v ? "on" : "off"}`);
      };
      addToggle(adv, t("display.links"), panel.showLinks, _edgeToggle(t("display.links"), "showLinks", () => cb.markDirty()), t("desc.links"));
      addToggle(adv, t("display.sharedTags"), panel.showTagEdges, _edgeToggle(t("display.sharedTags"), "showTagEdges", () => cb.markDirty()), t("desc.sharedTags"));
      addToggle(adv, t("display.sharedCategory"), panel.showCategoryEdges, _edgeToggle(t("display.sharedCategory"), "showCategoryEdges", () => cb.markDirty()), t("desc.sharedCategory"));
      addToggle(adv, t("display.semantic"), panel.showSemanticEdges, _edgeToggle(t("display.semantic"), "showSemanticEdges", () => cb.markDirty()), t("desc.semantic"));
      addToggle(adv, t("display.inheritance"), panel.showInheritance, _edgeToggle(t("display.inheritance"), "showInheritance", () => cb.markDirty()), t("desc.inheritance"));
      addToggle(adv, t("display.aggregation"), panel.showAggregation, _edgeToggle(t("display.aggregation"), "showAggregation", () => cb.markDirty()), t("desc.aggregation"));
      addToggle(adv, t("display.similar"), panel.showSimilar, _edgeToggle(t("display.similar"), "showSimilar", () => cb.invalidateDataKeepPanel()), t("desc.similar"));
      addToggle(adv, t("display.sibling"), panel.showSibling, _edgeToggle(t("display.sibling"), "showSibling", () => cb.markDirty()), t("desc.sibling"));
      addToggle(adv, t("display.sequence"), panel.showSequence, _edgeToggle(t("display.sequence"), "showSequence", () => cb.markDirty()), t("desc.sequence"));

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

      // Cardinality markers (crow's foot)
      addSelect(adv, t("display.edgeCardinality"), [
        { value: "none", label: t("display.cardinalityNone") },
        { value: "crowsfoot", label: t("display.cardinalityCrowsfoot") },
      ], panel.edgeCardinalityMode, (v) => {
        panel.edgeCardinalityMode = v as EdgeCardinalityMode;
        cb.markDirty();
      }, t("desc.edgeCardinality"));
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
    const rt = panel.renderThresholds ?? {};
    addToggle(body, t("display.showRoadNetwork"), rt.showRoadNetwork ?? DEFAULT_RENDER_THRESHOLDS.showRoadNetwork, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.showRoadNetwork = v;
      cb.doRenderKeepPanel();
      cb.rebuildPanel(); // Progressive disclosure: show/hide road sub-settings
    }, t("desc.showRoadNetwork"));
    // Progressive disclosure: show sub-settings only when road network is active
    if (rt.showRoadNetwork ?? DEFAULT_RENDER_THRESHOLDS.showRoadNetwork) {
      addToggle(body, t("display.roadRouteEdges"), rt.roadRouteEdges ?? DEFAULT_RENDER_THRESHOLDS.roadRouteEdges, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.roadRouteEdges = v;
        cb.doRenderKeepPanel();
      }, t("desc.roadRouteEdges"));
      addSlider(body, t("display.roadAlpha"), 0.05, 0.8, 0.05, rt.roadAlpha ?? DEFAULT_RENDER_THRESHOLDS.roadAlpha, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.roadAlpha = v;
        cb.doRenderKeepPanel();
      }, t("desc.roadAlpha"));
      addSlider(body, t("display.roadWidth"), 2, 20, 1, rt.roadWidth ?? DEFAULT_RENDER_THRESHOLDS.roadWidth, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.roadWidth = v;
        cb.doRenderKeepPanel();
      }, t("desc.roadWidth"));
    }
  }, tHelp("help.roadNetwork"), true, "map");
}

function _buildMinimapSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.displayOther"), (body) => {
    addToggle(body, t("display.minimap"), panel.showMinimap, (v) => { panel.showMinimap = v; cb.markDirty(); cb.wakeRenderLoop(); }, t("desc.minimap"));
    addToggle(body, t("display.showLegend"), panel.showLegend, (v) => { panel.showLegend = v; cb.invalidateDataKeepPanel(); }, t("desc.showLegend"));
    addToggle(body, t("display.oobIndicator"), panel.showOutOfBoundsIndicator ?? false, (v) => { panel.showOutOfBoundsIndicator = v; cb.markDirty(); cb.wakeRenderLoop(); }, t("desc.oobIndicator"));
    addToggle(body, t("display.graphStats"), panel.showGraphStats ?? false, (v) => { panel.showGraphStats = v; cb.invalidateDataKeepPanel(); }, t("desc.graphStats"));
    addToggle(body, t("display.ancestryBreadcrumb"), panel.showAncestryBreadcrumb ?? false, (v) => { panel.showAncestryBreadcrumb = v; cb.invalidateDataKeepPanel(); }, t("desc.ancestryBreadcrumb"));
    addToggle(body, t("display.highContrast") ?? "High Contrast", panel.highContrastMode, (v) => { panel.highContrastMode = v; cb.doRenderKeepPanel(); }, t("desc.highContrast") ?? "Thicker edges and stronger outlines for better visibility");
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
    const rt = panel.renderThresholds ?? {};
    addSlider(body, t("render.cardTextNodeCount"), 50, 1000, 50,
      rt.cardTextNodeCount ?? DEFAULT_RENDER_THRESHOLDS.cardTextNodeCount, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.cardTextNodeCount = v;
        cb.markDirty();
      }, t("render.cardTextNodeCountDesc"));
    addSlider(body, t("render.gradientNodeCount"), 100, 2000, 100,
      rt.gradientNodeCount ?? DEFAULT_RENDER_THRESHOLDS.gradientNodeCount, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.gradientNodeCount = v;
        cb.markDirty();
      }, t("render.gradientNodeCountDesc"));
    addSlider(body, t("render.glowNodeCount"), 100, 2000, 100,
      rt.glowNodeCount ?? DEFAULT_RENDER_THRESHOLDS.glowNodeCount, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.glowNodeCount = v;
        cb.markDirty();
      }, t("render.glowNodeCountDesc"));
    addSlider(body, t("render.gridLabelOffset"), 0, 40, 1,
      rt.gridLabelOffset ?? DEFAULT_RENDER_THRESHOLDS.gridLabelOffset, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.gridLabelOffset = v;
        cb.markDirty();
      }, t("render.gridLabelOffsetDesc"));
    addToggle(body, t("render.showFpsMonitor"), rt.showFpsMonitor ?? false, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.showFpsMonitor = v;
      cb.markDirty();
      cb.wakeRenderLoop();
    }, t("render.showFpsMonitorDesc"));
    addSlider(body, t("render.highlightDimAlpha"), 0, 0.5, 0.01,
      rt.highlightEdgeNonMatchAlpha ?? DEFAULT_RENDER_THRESHOLDS.highlightEdgeNonMatchAlpha, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.highlightEdgeNonMatchAlpha = v;
        cb.markDirty();
      }, t("render.highlightDimAlphaDesc"));
    addToggle(body, t("render.showRecentVisitHalo"), rt.showRecentVisitHalo ?? false, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.showRecentVisitHalo = v;
      cb.markDirty();
    }, t("render.showRecentVisitHaloDesc"));
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
  _buildNodeDisplaySection(displayTab, panel, ctx, cb);
  _buildNodeDisplayModeSection(displayTab, panel, ctx, cb);
  _buildNodeDecorationSection(displayTab, panel, ctx, cb);
  _buildStructureAnalysisSection(displayTab, panel, ctx, cb);
  _buildDiscoverySection(displayTab, panel, ctx, cb);
  _buildInteractionSection(displayTab, panel, ctx, cb);
  _buildAdvancedSection(displayTab, panel, ctx, cb);
  _buildEdgeDisplaySection(displayTab, panel, ctx, cb);
  _buildCableDisplaySection(displayTab, panel, ctx, cb);
  _buildRoadNetworkSection(displayTab, panel, ctx, cb);
  _buildMinimapSection(displayTab, panel, ctx, cb);
  _buildRenderThresholdsSection(displayTab, panel, ctx, cb);
  _buildRelationColorSection(displayTab, panel, ctx, cb);
}

function buildLayoutTab(
  layoutTab: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  // --- Grouping (in Layout tab) ---
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
      });
      const collapseBtn = groupBtnRow.createEl("button", { cls: "gi-btn-sm", text: t("groups.collapseAll") });
      collapseBtn.addEventListener("click", () => {
        panel.collapsedGroups.clear();
        // Empty set triggers auto-collapse of all groups
        cb.doRenderKeepPanel();
        cb.rebuildPanel();
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

  // Cluster arrangement
  buildSection(layoutTab, t("section.clusterArrangement"), (body) => {
    const sctx: ClusterSectionCtx = { body, panel, cb, ctx, spacingSliders: [] };
    _buildArrangementPatternSelect(sctx);
    _buildConcentricOptions(sctx);
    _buildCoordinateControls(sctx);
    _buildTimelineControls(sctx);
    _buildSpacingAndGroupArrangement(sctx);  // Must come before autoFit (populates spacingSliders)
    _buildAutoFitAndGuides(sctx);
    _buildForceParameters(sctx);
    _buildClusterGroupRules(sctx);
    _buildDirectionalGravityRules(sctx);
    _buildSortRules(sctx);
  }, tHelp("help.clusterArrangement"), true, "layout-grid");

  // Node rules
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

    addMultiValueInput(body, t("settings.metadataFields"), [...s.metadataFields], "tags, category...", getUnifiedFieldSuggestions(ctx), (v) => {
      s.metadataFields = v;
      ctx.saveSettings();
      cb.invalidateDataKeepPanel();
    });

    if (panel.showTagNodes && panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
      addSlider(body, t("settings.enclosureMinRatio"), 0, 0.3, 0.02, s.enclosureMinRatio, (v) => {
        s.enclosureMinRatio = v;
        ctx.saveSettings();
        cb.doRenderKeepPanel();
      }, t("desc.enclosureSpacing"));
      // FY: Enclosure fill opacity override
      const rtEnc = panel.renderThresholds ?? {};
      addSlider(body, t("display.enclosureFillOpacity") ?? "Enclosure Fill", 0, 1, 0.05, rtEnc.enclosureFillOpacity ?? 0, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.enclosureFillOpacity = v;
        cb.doRenderKeepPanel();
      });
      // GC: Enclosure stroke width override
      addSlider(body, t("display.enclosureStrokeWidth") ?? "Enclosure Stroke", 0, 10, 0.5, rtEnc.enclosureStrokeWidth ?? 0, (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        panel.renderThresholds.enclosureStrokeWidth = v;
        cb.doRenderKeepPanel();
      });
      // FU: Enclosure label position
      addSelect(body, t("display.enclosureLabelPos") ?? "Label Position", [
        { value: "top", label: t("display.enclosureLabelPos.top") ?? "Top" },
        { value: "center", label: t("display.enclosureLabelPos.center") ?? "Center" },
        { value: "bottom", label: t("display.enclosureLabelPos.bottom") ?? "Bottom" },
      ], rtEnc.enclosureLabelPosition ?? "top", (v) => {
        if (!panel.renderThresholds) panel.renderThresholds = {};
        (panel.renderThresholds as any).enclosureLabelPosition = v;
        cb.doRenderKeepPanel();
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
  // EY: Multi-select group assign button
  if (panel.multiSelectNodeIds.length > 0) {
    const selSpan = statsBar.createEl("span", { text: `${panel.multiSelectNodeIds.length} selected` });
    selSpan.style.cssText = "color:var(--interactive-accent);cursor:pointer;";
    selSpan.addEventListener("click", () => {
      const groupName = prompt("Assign selected nodes to group:");
      if (!groupName) return;
      if (!panel.manualClusterOverrides) panel.manualClusterOverrides = {};
      for (const id of panel.multiSelectNodeIds) {
        panel.manualClusterOverrides[id] = groupName;
      }
      panel.multiSelectNodeIds = [];
      cb.applyClusterForce();
      cb.invalidateDataKeepPanel();
    });
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
    cb.doRenderKeepPanel();
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
        cb.doRenderKeepPanel();
      }, t("guide.gridShowHeadersDesc"));

      addSelect(body, t("guide.labelPlacement"), [
        { value: "on-line", label: t("guide.labelOnLine") },
        { value: "between", label: t("guide.labelBetween") },
      ], panel.gridLabelPlacement, (v) => {
        panel.gridLabelPlacement = v as "on-line" | "between";
        cb.doRenderKeepPanel();
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

  // Axis titles — independent of gridTableMode (also affects timeline axis)
  addToggle(body, t("guide.showAxisTitles"), panel.showAxisTitles, (v) => {
    panel.showAxisTitles = v;
    cb.doRenderKeepPanel();
  }, t("guide.showAxisTitlesDesc"));
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
  const rt = panel.renderThresholds ?? {};
  addSlider(body, t("render.clusterChargeForce"), -50, 0, 1,
    rt.clusterChargeForce ?? DEFAULT_RENDER_THRESHOLDS.clusterChargeForce, (v) => {
      if (!panel.renderThresholds) panel.renderThresholds = {};
      panel.renderThresholds.clusterChargeForce = v;
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

  const body = section.createDiv({ cls: "tree-item-children" });
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
    btn.setAttribute("aria-label", t(m.descKey));
    btn.title = t(m.descKey);
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
    btn.setAttribute("aria-label", t(p.descKey));
    btn.title = t(p.descKey);
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
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...panel.renderThresholds };
    const waitMs = (rt.autoOptMaxPasses ?? 3) * 1500 + 500;
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

/** Update --progress CSS variable on a range input for track fill */
function updateSliderProgress(el: HTMLInputElement) {
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const val = parseFloat(el.value);
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty('--progress', pct + '%');
}

/** Dual-range slider for selecting a min/max range (0–1) */
function buildDualRangeSlider(container: HTMLElement, label: string, initialMin: number, initialMax: number, onChange: (min: number, max: number) => void, description?: string) {
  const row = container.createDiv({ cls: "setting-item gi-dual-range" });
  const info = row.createDiv({ cls: "setting-item-info" });
  const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
  nameEl.title = description || label;
  const rangeLabel = info.createEl("span", { cls: "gi-slider-value", text: `${Math.round(initialMin * 100)}% – ${Math.round(initialMax * 100)}%` });
  const control = row.createDiv({ cls: "setting-item-control gi-dual-range-control" });

  const minInput = control.createEl("input", { type: "range", cls: "gi-range-min", attr: { "aria-label": label + " (min)" } });
  minInput.min = "0"; minInput.max = "100"; minInput.step = "1"; minInput.value = String(Math.round(initialMin * 100));
  const maxInput = control.createEl("input", { type: "range", cls: "gi-range-max", attr: { "aria-label": label + " (max)" } });
  maxInput.min = "0"; maxInput.max = "100"; maxInput.step = "1"; maxInput.value = String(Math.round(initialMax * 100));

  updateSliderProgress(minInput);
  updateSliderProgress(maxInput);
  const update = () => {
    let lo = parseInt(minInput.value);
    let hi = parseInt(maxInput.value);
    if (lo > hi) { const tmp = lo; lo = hi; hi = tmp; }
    rangeLabel.textContent = `${lo}% – ${hi}%`;
    updateSliderProgress(minInput);
    updateSliderProgress(maxInput);
    onChange(lo / 100, hi / 100);
  };
  minInput.addEventListener("input", update);
  maxInput.addEventListener("input", update);
}

function addSlider(container: HTMLElement, label: string, min: number, max: number, step: number, initial: number, onChange: (v: number) => void, description?: string): HTMLElement {
  const row = container.createDiv({ cls: "setting-item mod-slider" });
  const info = row.createDiv({ cls: "setting-item-info" });
  const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
  nameEl.title = description || label;
  const valueSpan = info.createEl("span", { cls: "gi-slider-value", text: String(initial) });
  const control = row.createDiv({ cls: "setting-item-control" });
  const input = control.createEl("input", { type: "range", attr: { "aria-label": label } });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  updateSliderProgress(input);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valueSpan.textContent = String(v);
    updateSliderProgress(input);
    // Debounce the heavy callback (applyClusterForce, restartSimulation, etc.)
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onChange(v), 120);
  });
  input.addEventListener("dblclick", () => {
    input.value = String(initial);
    valueSpan.textContent = String(initial);
    updateSliderProgress(input);
    clearTimeout(debounceTimer);
    onChange(initial);
  });
  return row;
}

function addToggle(container: HTMLElement, label: string, initial: boolean, onChange: (v: boolean) => void, description?: string): HTMLElement {
  const row = container.createDiv({ cls: "setting-item mod-toggle" });
  const info = row.createDiv({ cls: "setting-item-info" });
  const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
  nameEl.title = description || label;
  const control = row.createDiv({ cls: "setting-item-control" });
  const toggle = control.createDiv({ cls: "checkbox-container" + (initial ? " is-enabled" : ""), attr: { role: "switch", "aria-label": label, "aria-checked": String(initial), tabindex: "0" } });
  const activate = () => {
    const on = toggle.hasClass("is-enabled");
    toggle.toggleClass("is-enabled", !on);
    toggle.setAttribute("aria-checked", String(!on));
    onChange(!on);
  };
  toggle.addEventListener("click", activate);
  toggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
  });
  return row;
}

function addTextInput(container: HTMLElement, label: string, initial: string, placeholder: string, onChange: (v: string) => void) {
  const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
  const info = row.createDiv({ cls: "setting-item-info" });
  const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
  nameEl.title = label;
  const control = row.createDiv({ cls: "setting-item-control" });
  const input = control.createEl("input", { type: "text", placeholder, attr: { "aria-label": label } });
  input.value = initial;
  input.addEventListener("change", () => onChange(input.value));
}

/** Custom filtered autocomplete popup (replaces native datalist) */
function attachAutocomplete(input: HTMLInputElement, suggestions: string[]) {
  const popup = document.createElement("div");
  popup.className = "gi-ac-popup";
  popup.style.display = "none";
  // Append to the flow/pair container (has position:relative)
  const anchor = input.closest(".gi-ont-flow") ?? input.closest(".gi-ont-pair") ?? input.parentElement!;
  anchor.appendChild(popup);

  let selected = -1;

  function show() {
    const q = input.value.toLowerCase();
    const filtered = suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 12);
    popup.empty();
    if (filtered.length === 0) { popup.style.display = "none"; return; }
    for (let i = 0; i < filtered.length; i++) {
      const item = popup.createDiv({ cls: "gi-ac-item", text: filtered[i] });
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = filtered[i];
        input.dispatchEvent(new Event("change"));
        popup.style.display = "none";
      });
    }
    // Position below the input
    const anchorRect = anchor.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    popup.style.left = (inputRect.left - anchorRect.left) + "px";
    popup.style.top = (inputRect.bottom - anchorRect.top + 2) + "px";
    popup.style.display = "";
    selected = -1;
  }

  input.addEventListener("focus", show);
  input.addEventListener("input", show);
  input.addEventListener("blur", () => { setTimeout(() => popup.style.display = "none", 150); });
  input.addEventListener("keydown", (e) => {
    const items = popup.querySelectorAll(".gi-ac-item");
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); selected = Math.min(selected + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selected = Math.max(selected - 1, 0); }
    else if (e.key === "Enter" && selected >= 0) {
      e.preventDefault();
      input.value = (items[selected] as HTMLElement).textContent ?? "";
      input.dispatchEvent(new Event("change"));
      popup.style.display = "none";
      return;
    } else return;
    items.forEach((it, i) => it.toggleClass("is-selected", i === selected));
  });
}

/** Legacy alias — other inputs still call this */
function attachDatalist(input: HTMLInputElement, suggestions: string[]) {
  attachAutocomplete(input, suggestions);
}

/** Unified field suggestion list: built-in fields + all frontmatter keys (including nested) */
function getUnifiedFieldSuggestions(ctx: PanelContext): string[] {
  const builtIn = ["path", "file", "tag", "category", "folder", "id", "isTag"];
  return [...new Set([...builtIn, ...ctx.frontmatterKeys])];
}

/** GroupBy suggestion list: returns {value, label} options in "field:?" format */
function getGroupByOptions(ctx: PanelContext): { value: string; label: string }[] {
  const builtIn = ["tag", "category", "folder", "path", "file", "id", "isTag"];
  const allFields = [...new Set([...builtIn, ...ctx.frontmatterKeys])];
  const opts = allFields.map(f => ({ value: `${f}:?`, label: `${f}:?` }));
  // Louvain コミュニティ自動検出オプション
  opts.unshift({ value: "louvain:?", label: t("groupBy.louvain") });
  return opts;
}

// ---------------------------------------------------------------------------
// Ontology rule row: [input] [▼ relation] [input] [×]
// ---------------------------------------------------------------------------

const RELATION_OPTIONS: { value: OntologyRelation; label: string }[] = [
  { value: "is-a", label: "is-a" },
  { value: "has-a", label: "has-a" },
  { value: "is-from", label: "is-from" },
  { value: "is-alike", label: "is-alike" },
  { value: "sibling", label: "sibling" },
];

function renderOntologyRule(
  container: HTMLElement,
  rules: OntologyRule[],
  idx: number,
  cb: PanelCallbacks,
  save: () => void,
  rerender: () => void,
) {
  const rule = rules[idx];
  const row = container.createDiv({ cls: "gi-ont-rule" });

  // Forward input
  const fwdInput = row.createEl("input", {
    cls: "gi-search gi-ont-input",
    type: "text",
    placeholder: "parent, extends...",
    attr: { "aria-label": "Forward relation label" },
  });
  fwdInput.value = rule.forward;
  fwdInput.addEventListener("change", () => { rule.forward = fwdInput.value; save(); });
  attachQueryHint(fwdInput, (field) => cb.collectValueSuggestions(field));

  // Relation dropdown
  const relBtn = row.createEl("button", { cls: "gi-ont-rel-btn" });
  relBtn.textContent = rule.relation;
  relBtn.addEventListener("click", () => {
    // Cycle through options or show popup
    const popup = row.querySelector(".gi-ont-rel-popup");
    if (popup) { popup.remove(); return; }
    const menu = row.createDiv({ cls: "gi-ont-rel-popup" });
    for (const opt of RELATION_OPTIONS) {
      const item = menu.createDiv({
        cls: `gi-ont-rel-item${opt.value === rule.relation ? " is-active" : ""}`,
        text: opt.label,
      });
      item.addEventListener("click", () => {
        rule.relation = opt.value;
        relBtn.textContent = opt.label;
        menu.remove();
        save();
        rerender(); // Update reverse input disabled state for bidirectional relations
      });
    }
  });

  // Reverse input (hidden for bidirectional relations)
  const isBidir = rule.relation === "is-alike" || rule.relation === "sibling";
  const revInput = row.createEl("input", {
    cls: "gi-search gi-ont-input",
    type: "text",
    placeholder: isBidir ? "(双方向)" : "child, down...",
    attr: { "aria-label": "Reverse relation label" },
  });
  revInput.value = rule.reverse;
  revInput.disabled = isBidir;
  if (isBidir) revInput.classList.add("is-disabled");
  revInput.addEventListener("change", () => { rule.reverse = revInput.value; save(); });
  attachQueryHint(revInput, (field) => cb.collectValueSuggestions(field));

  // Delete button
  const delBtn = row.createEl("button", { cls: "gi-ont-del-btn", attr: { "aria-label": "Delete" } });
  setIcon(delBtn, "x");
  delBtn.addEventListener("click", () => {
    rules.splice(idx, 1);
    save();
    rerender();
  });
}

/**
 * Multi-value input: renders a list of values as individual rows with add/delete buttons
 * and autocomplete suggestions. Replaces comma-separated text inputs for list-type fields.
 */
function addMultiValueInput(
  container: HTMLElement,
  label: string,
  values: string[],
  placeholder: string,
  suggestions: string[],
  onChange: (values: string[]) => void,
) {
  const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
  const info = row.createDiv({ cls: "setting-item-info" });
  const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
  nameEl.title = label;
  const control = row.createDiv({ cls: "setting-item-control gi-multivalue-control" });

  const listEl = control.createDiv({ cls: "gi-multivalue-list" });

  function rebuild() {
    listEl.empty();
    values.forEach((val, i) => {
      const itemRow = listEl.createDiv({ cls: "gi-multivalue-row" });
      const input = itemRow.createEl("input", { type: "text", placeholder, cls: "gi-multivalue-field" });
      input.value = val;
      attachDatalist(input, suggestions);
      input.addEventListener("change", () => {
        values[i] = input.value.trim();
        onChange(values.filter(Boolean));
      });
      const rmBtn = itemRow.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00d7" });
      rmBtn.addEventListener("click", () => {
        values.splice(i, 1);
        onChange(values.filter(Boolean));
        rebuild();
      });
    });

    const addBtn = listEl.createEl("button", { cls: "gi-add-group gi-multivalue-add", text: "+" });
    addBtn.addEventListener("click", () => {
      values.push("");
      rebuild();
      // Focus the newly added input
      const inputs = listEl.querySelectorAll<HTMLInputElement>(".gi-multivalue-field");
      inputs[inputs.length - 1]?.focus();
    });
  }

  rebuild();
}

// ---------------------------------------------------------------------------
// GroupBy multi-rule editor
// ---------------------------------------------------------------------------

/** Parse groupBy string into individual rules: "tag AND category" → [{field:"tag",op:"AND"},{field:"category"}] */
function parseGroupByRules(groupBy: string): GroupByRule[] {
  if (!groupBy || groupBy === "none") return [];
  // Split by known operators while preserving them
  const parts = groupBy.split(/\s+(AND|OR|XOR|NOR|NAND|NOT)\s+/i);
  const rules: GroupByRule[] = [];
  for (let i = 0; i < parts.length; i++) {
    const trimmed = parts[i].trim();
    if (!trimmed) continue;
    if (["AND", "OR", "XOR", "NOR", "NAND", "NOT"].includes(trimmed.toUpperCase())) {
      // Attach operator to previous rule
      if (rules.length > 0) rules[rules.length - 1].op = trimmed.toUpperCase();
    } else {
      // Could be comma-separated
      for (const field of trimmed.split(",")) {
        const f = field.trim();
        if (f) rules.push({ field: f, indent: 0 });
      }
    }
  }
  return rules.length > 0 ? rules : [];
}

/** Derive clusterGroupRules from groupByRules (used in follow mode). */
function deriveClusterRulesFromGroupBy(rules: GroupByRule[]): ClusterGroupRule[] {
  return rules
    .filter(r => r.field.trim() !== "")
    .map(r => ({
      groupBy: (r.field.endsWith(":?") ? r.field : r.field + ":?") as ClusterGroupBy,
      recursive: r.recursive ?? false,
    }));
}

function serializeGroupByRules(rules: GroupByRule[]): string {
  if (rules.length === 0) return "none";
  return rules.map((r, i) => {
    const op = i < rules.length - 1 ? ` ${r.op || "AND"} ` : "";
    return r.field + op;
  }).join("");
}

function renderGroupByRules(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();

  // Use panel.groupByRules as the authoritative source.
  // Initialize from the groupBy string only on first render.
  if (!panel.groupByRules) {
    panel.groupByRules = parseGroupByRules(panel.groupBy);
  }
  const rules = panel.groupByRules;
  const groupByOpts = getGroupByOptions(ctx);

  /** Sync panel.groupBy from rules (only filled fields) and re-render graph. */
  function syncAndRender() {
    const filled = rules.filter(r => r.field.trim() !== "");
    panel.groupBy = filled.length > 0 ? serializeGroupByRules(filled) : "none";
    panel.collapsedGroups.clear();

    // Follow mode: auto-sync clusterGroupRules from groupByRules
    if (panel.clusterFollowsGroupBy) {
      panel.clusterGroupRules = deriveClusterRulesFromGroupBy(filled);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    }

    cb.doRenderKeepPanel();
    cb.rebuildPanel(); // Progressive disclosure: groupMinSize/groupFilter/clusterGravity
  }

  /** Re-render the rows UI from the rules array. */
  function rebuildUI() {
    container.empty();
    renderRows();
  }

  /** Full rebuild: update UI + sync to graph. */
  function rebuild() {
    rebuildUI();
    syncAndRender();
  }

  function renderRows() {
    rules.forEach((rule, i) => {
      // Operator dropdown between rows
      if (i > 0) {
        const opRow = container.createDiv({ cls: "gi-expr-op-row" });
        opRow.style.paddingLeft = `${(rule.indent ?? 0) * 20}px`;
        const opSel = opRow.createEl("select", { cls: "dropdown gi-expr-op" });
        for (const op of ["AND", "OR", "XOR", "NOR", "NAND", "NOT"]) {
          const el = opSel.createEl("option", { text: op, value: op });
          if (op === (rules[i - 1].op ?? "AND")) el.selected = true;
        }
        opSel.addEventListener("change", () => { rules[i - 1].op = opSel.value; rebuild(); });
      }

      const rowEl = container.createDiv({ cls: "gi-expr-row" });
      rowEl.style.paddingLeft = `${(rule.indent ?? 0) * 20}px`;

      // Field input with field:? suggestions (similar to search query UI)
      const fieldInput = rowEl.createEl("input", { cls: "gi-expr-field", type: "text", placeholder: "tag:?, category:?, folder:?..." });
      fieldInput.value = rule.field;
      attachFixedHint(fieldInput, groupByOpts, (val) => {
        rule.field = val;
        rebuild();
      });
      fieldInput.addEventListener("change", () => {
        rule.field = fieldInput.value.trim();
        rebuild();
      });

      // Indent/dedent
      const indentBtn = rowEl.createEl("span", { cls: "gi-expr-btn gi-indent-btn", text: "\u2192" });
      indentBtn.addEventListener("click", () => { rule.indent = (rule.indent ?? 0) + 1; rebuild(); });
      const dedentBtn = rowEl.createEl("span", { cls: "gi-expr-btn gi-indent-btn", text: "\u2190" });
      dedentBtn.addEventListener("click", () => { rule.indent = Math.max(0, (rule.indent ?? 0) - 1); rebuild(); });

      // Delete
      const rmBtn = rowEl.createEl("span", { cls: "gi-group-remove", text: "\u00d7" });
      rmBtn.addEventListener("click", () => {
        rules.splice(i, 1);
        rebuild();
      });
    });

    // Add rule button
    const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("expr.addCondition") });
    addBtn.addEventListener("click", () => {
      rules.push({ field: "", indent: 0 });
      // Only rebuild UI — don't sync to graph or trigger doRenderKeepPanel.
      // The empty rule lives in panel.groupByRules and survives buildPanel() calls.
      rebuildUI();
    });
  }

  renderRows();
}

/** Checkbox group — shows items as individually toggleable checkboxes */
function addCheckboxGroup(
  container: HTMLElement,
  label: string,
  items: string[],
  selected: Set<string>,
  onChange: (selected: Set<string>) => void,
) {
  const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
  const info = row.createDiv({ cls: "setting-item-info" });
  const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
  nameEl.title = label;
  const control = row.createDiv({ cls: "setting-item-control gi-checkbox-group" });
  if (items.length === 0) {
    control.createEl("span", { cls: "gi-checkbox-empty", text: "—" });
    return;
  }
  for (const item of items) {
    const lbl = control.createEl("label", { cls: "gi-checkbox-item" });
    const cb = lbl.createEl("input", { type: "checkbox" });
    cb.checked = selected.has(item);
    lbl.createEl("span", { text: item });
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(item);
      else selected.delete(item);
      onChange(selected);
    });
  }
}

// ---------------------------------------------------------------------------
// Custom Mappings UI (ExcaliBrain compat)
// ---------------------------------------------------------------------------
function renderCustomMappings(
  container: HTMLElement,
  s: GraphViewsSettings,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  if (!s.ontology.customMappings) s.ontology.customMappings = {};
  const entries = Object.entries(s.ontology.customMappings);

  for (const [field, type] of entries) {
    const row = container.createDiv({ cls: "gi-mapping-row" });

    const fieldInput = row.createEl("input", { type: "text", cls: "gi-mapping-field", placeholder: t("settings.mappingFieldPlaceholder") });
    fieldInput.value = field;
    attachDatalist(fieldInput, ctx.frontmatterKeys);

    const typeSelect = row.createEl("select", { cls: "gi-mapping-type dropdown" });
    for (const opt of ["inheritance", "aggregation", "similar", "sibling", "sequence"] as const) {
      const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.mappingType.${opt}`) });
      if (opt === type) optEl.selected = true;
    }

    const removeBtn = row.createEl("button", { cls: "gi-mapping-remove clickable-icon", text: "\u00d7" });

    const update = () => {
      const oldField = field;
      const newField = fieldInput.value.trim();
      const newType = typeSelect.value as "inheritance" | "aggregation" | "similar" | "sibling" | "sequence";
      if (oldField !== newField) delete s.ontology.customMappings[oldField];
      if (newField) s.ontology.customMappings[newField] = newType;
      ctx.saveSettings();
      cb.invalidateDataKeepPanel();
    };
    fieldInput.addEventListener("change", update);
    typeSelect.addEventListener("change", update);
    removeBtn.addEventListener("click", () => {
      delete s.ontology.customMappings[field];
      ctx.saveSettings();
      cb.invalidateDataKeepPanel();
      renderCustomMappings(container, s, ctx, cb);
    });
  }

  const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addMapping") });
  addBtn.addEventListener("click", () => {
    s.ontology.customMappings[""] = EDGE_TYPE_INHERITANCE;
    renderCustomMappings(container, s, ctx, cb);
  });
}

// ---------------------------------------------------------------------------
// Tag Relations UI (explicit tag-to-tag relationships)
// ---------------------------------------------------------------------------
function renderTagRelations(
  container: HTMLElement,
  s: GraphViewsSettings,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  if (!s.ontology.tagRelations) s.ontology.tagRelations = [];

  for (let i = 0; i < s.ontology.tagRelations.length; i++) {
    const rel = s.ontology.tagRelations[i];
    const row = container.createDiv({ cls: "gi-tag-rel-row" });

    const srcInput = row.createEl("input", { type: "text", cls: "gi-tag-rel-src", placeholder: t("settings.tagRelSourcePlaceholder") });
    srcInput.value = rel.source;
    attachDatalist(srcInput, ctx.availableTags);

    const typeSelect = row.createEl("select", { cls: "gi-tag-rel-type dropdown" });
    for (const opt of ["inheritance", "aggregation"] as const) {
      const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.tagRelType.${opt}`) });
      if (opt === rel.type) optEl.selected = true;
    }

    const tgtInput = row.createEl("input", { type: "text", cls: "gi-tag-rel-tgt", placeholder: t("settings.tagRelTargetPlaceholder") });
    tgtInput.value = rel.target;
    attachDatalist(tgtInput, ctx.availableTags);

    const removeBtn = row.createEl("button", { cls: "gi-tag-rel-remove clickable-icon", text: "\u00d7" });

    const update = () => {
      rel.source = srcInput.value.trim().replace(/^#/, "");
      rel.target = tgtInput.value.trim().replace(/^#/, "");
      rel.type = typeSelect.value as "inheritance" | "aggregation";
      ctx.saveSettings();
      cb.invalidateDataKeepPanel();
    };
    srcInput.addEventListener("change", update);
    tgtInput.addEventListener("change", update);
    typeSelect.addEventListener("change", update);
    removeBtn.addEventListener("click", () => {
      s.ontology.tagRelations.splice(i, 1);
      ctx.saveSettings();
      cb.invalidateDataKeepPanel();
      renderTagRelations(container, s, ctx, cb);
    });
  }

  const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addTagRelation") });
  addBtn.addEventListener("click", () => {
    s.ontology.tagRelations.push({ source: "", target: "", type: EDGE_TYPE_INHERITANCE });
    renderTagRelations(container, s, ctx, cb);
  });
}

// ---------------------------------------------------------------------------
// Search options hint — shown below query inputs on focus, like core graph view
// ---------------------------------------------------------------------------
function getQueryOptions(): { prefix: string; desc: string }[] {
  const base = [
    { prefix: "path:", desc: t("query.pathMatch") },
    { prefix: "file:", desc: t("query.fileMatch") },
    { prefix: "tag:", desc: t("query.tagSearch") },
    { prefix: "category:", desc: t("query.categoryMatch") },
    { prefix: "id:", desc: t("query.idMatch") },
    { prefix: "isTag", desc: t("query.isTag") },
    { prefix: "hop:name:N", desc: t("query.hop") },
    { prefix: "AND / OR", desc: t("query.boolOps") },
    { prefix: "*", desc: t("query.all") },
  ];
  // Add dynamic frontmatter fields from the cached field suggestion context
  if (_cachedFieldSuggestions.length > 0) {
    for (const field of _cachedFieldSuggestions.slice(0, 15)) {
      if (!base.some(b => b.prefix === `${field}:`)) {
        base.push({ prefix: `${field}:`, desc: `Frontmatter: ${field}` });
      }
    }
  }
  return base;
}

/** Cached field suggestions (populated by buildPanel) */
let _cachedFieldSuggestions: string[] = [];

/** Maps a search prefix to the field name used by collectValueSuggestions.
 *  Known prefixes are listed here; any unknown `xxx:` prefix is also accepted
 *  dynamically (forwarded as-is to getSuggestions). */
const KNOWN_PREFIXES: Record<string, string> = {
  "path:": "path",
  "file:": "file",
  "tag:": "tag",
  "category:": "category",
  "id:": "id",
};

/** Resolve a prefix like "status:" to a field name. Known prefixes are mapped
 *  explicitly; any other "xxx:" prefix returns the xxx portion, enabling
 *  frontmatter property value suggestions. */
function resolvePrefix(prefix: string): string {
  if (prefix in KNOWN_PREFIXES) return KNOWN_PREFIXES[prefix];
  // Accept any "field:" pattern — strip trailing colon to get field name
  if (prefix.endsWith(":") && prefix.length > 1) return prefix.slice(0, -1);
  return "";
}

/**
 * Parse the current input to detect if cursor is inside a `prefix:value` token.
 * Returns { prefix, partial } if found, null otherwise.
 */
function parseActiveToken(value: string, cursorPos: number): { prefix: string; partial: string; tokenStart: number } | null {
  // Walk backwards from cursor to find the token start
  const before = value.slice(0, cursorPos);
  // Find the last space before cursor (or start of string)
  const lastSpace = before.lastIndexOf(" ");
  const token = before.slice(lastSpace + 1);
  const colonIdx = token.indexOf(":");
  if (colonIdx < 0) return null;
  const prefix = token.slice(0, colonIdx + 1); // e.g. "path:"
  if (!resolvePrefix(prefix)) return null;
  const partial = token.slice(colonIdx + 1); // e.g. "bibl"
  return { prefix, partial, tokenStart: lastSpace + 1 + colonIdx + 1 };
}

function attachQueryHint(input: HTMLInputElement, getSuggestions: (field: string) => string[]) {
  let hintEl: HTMLElement | null = null;
  let selectedIdx = -1;
  let currentItems: { text: string; onSelect: () => void }[] = [];

  // Create anchor wrapper immediately (not during focus, which would steal focus)
  const anchor = document.createElement("div");
  anchor.className = "gi-suggest-anchor";
  input.parentNode!.insertBefore(anchor, input);
  anchor.appendChild(input);

  const insertText = (text: string) => {
    _insertTextAtCursor(input, text);
  };

  const replaceTokenValue = (tokenStart: number, value: string) => {
    _replaceTokenAtPosition(input, tokenStart, value);
  };

  const updateSelection = (container: HTMLElement) => {
    _updateHintSelection(container, selectedIdx);
  };

  const buildOptionsList = () => {
    currentItems = getQueryOptions().map(opt => ({
      text: opt.prefix,
      onSelect: () => {
        insertText(opt.prefix.endsWith(":") ? opt.prefix : opt.prefix + " ");
        // After inserting prefix, rebuild to show value suggestions
        rebuildHint();
      },
    }));
  };

  const buildValueList = (prefix: string, partial: string, tokenStart: number) => {
    const field = resolvePrefix(prefix);
    if (!field) return false;
    const allValues = getSuggestions(field);
    const lowerPartial = partial.toLowerCase();
    const filtered = partial
      ? allValues.filter(v => v.toLowerCase().includes(lowerPartial))
      : allValues;
    if (filtered.length === 0) return false;
    currentItems = filtered.slice(0, 30).map(v => ({
      text: v,
      onSelect: () => {
        replaceTokenValue(tokenStart, v);
        dismissHint();
      },
    }));
    return true;
  };

  const renderHint = (headerText: string) => {
    if (hintEl) hintEl.remove();
    hintEl = _buildQueryHintContainer(headerText, currentItems, (i) => {
      selectedIdx = i;
      updateSelection(hintEl!);
    });
    selectedIdx = 0;
    updateSelection(hintEl);
    anchor.appendChild(hintEl);
  };

  const rebuildHint = () => {
    const pos = input.selectionStart ?? input.value.length;
    const token = parseActiveToken(input.value, pos);
    if (token && buildValueList(token.prefix, token.partial, token.tokenStart)) {
      renderHint(token.prefix.slice(0, -1) + " " + t("query.candidates"));
    } else {
      buildOptionsList();
      renderHint(t("query.searchOptions"));
    }
  };

  const dismissHint = () => {
    hintEl?.remove();
    hintEl = null;
    selectedIdx = -1;
    currentItems = [];
  };

  _setupQueryHintListeners(input, {
    show: () => rebuildHint(),
    hide: () => {
      if (!hintEl) return;
      setTimeout(() => {
        if (input === document.activeElement) return;
        dismissHint();
      }, 150);
    },
    rebuildHint,
    getHintEl: () => hintEl,
    getItems: () => currentItems,
    getSelectedIdx: () => selectedIdx,
    setSelectedIdx: (i: number) => { selectedIdx = i; },
    updateSelection: () => { if (hintEl) updateSelection(hintEl); },
    dismissHint,
  });
}

/** Insert text at cursor position in an input element. */
function _insertTextAtCursor(input: HTMLInputElement, text: string) {
  const cur = input.value;
  const pos = input.selectionStart ?? cur.length;
  const before = cur.slice(0, pos);
  const after = cur.slice(pos);
  const needSpace = before.length > 0 && !before.endsWith(" ") ? " " : "";
  input.value = before + needSpace + text + after;
  input.focus();
  const newPos = (before + needSpace + text).length;
  input.setSelectionRange(newPos, newPos);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Replace the token at a given position with a new value. */
function _replaceTokenAtPosition(input: HTMLInputElement, tokenStart: number, value: string) {
  const cur = input.value;
  // Find end of current token (next space or end)
  let end = cur.indexOf(" ", tokenStart);
  if (end < 0) end = cur.length;
  input.value = cur.slice(0, tokenStart) + value + cur.slice(end);
  input.focus();
  const newPos = tokenStart + value.length;
  input.setSelectionRange(newPos, newPos);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Update the is-selected class on hint suggestion items. */
function _updateHintSelection(container: HTMLElement, selectedIdx: number) {
  const rows = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
  rows.forEach((r, i) => {
    r.classList.toggle("is-selected", i === selectedIdx);
  });
}

/** Build the DOM container for query hint suggestions. */
function _buildQueryHintContainer(
  headerText: string,
  items: { text: string; onSelect: () => void }[],
  onHover: (index: number) => void,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "suggestion-container mod-search-suggestion";

  // Header
  const headerItem = el.createDiv({ cls: "suggestion-item mod-complex search-suggest-item mod-group" });
  const headerContent = headerItem.createDiv({ cls: "suggestion-content" });
  const headerTitle = headerContent.createDiv({ cls: "suggestion-title list-item-part mod-extended" });
  headerTitle.createEl("span", { text: headerText });
  const headerAux = headerItem.createDiv({ cls: "suggestion-aux" });
  const infoBtn = headerAux.createDiv({ cls: "list-item-part search-suggest-icon clickable-icon" });
  infoBtn.setAttribute("aria-label", t("query.viewDetails"));
  setIcon(infoBtn, "info");

  // Items
  for (let i = 0; i < items.length; i++) {
    const ci = items[i];
    const item = el.createDiv({ cls: "suggestion-item mod-complex search-suggest-item" });
    const content = item.createDiv({ cls: "suggestion-content" });
    const title = content.createDiv({ cls: "suggestion-title" });
    // For options list, show description; for value list, just the value
    const opt = getQueryOptions().find(o => o.prefix === ci.text);
    if (opt) {
      title.createEl("span", { text: opt.prefix });
      title.createEl("span", { cls: "search-suggest-info-text", text: opt.desc });
    } else {
      title.createEl("span", { text: ci.text });
    }
    item.addEventListener("click", () => ci.onSelect());
    item.addEventListener("mouseenter", () => onHover(i));
  }

  return el;
}

/** Wire up focus/blur/input/keydown listeners for query hint. */
function _setupQueryHintListeners(input: HTMLInputElement, ctx: {
  show: () => void;
  hide: () => void;
  rebuildHint: () => void;
  getHintEl: () => HTMLElement | null;
  getItems: () => { text: string; onSelect: () => void }[];
  getSelectedIdx: () => number;
  setSelectedIdx: (i: number) => void;
  updateSelection: () => void;
  dismissHint: () => void;
}) {
  input.addEventListener("focus", ctx.show);
  input.addEventListener("blur", ctx.hide);
  // Rebuild on input to switch between options/values as user types
  input.addEventListener("input", () => {
    if (input === document.activeElement) ctx.rebuildHint();
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    const hintEl = ctx.getHintEl();
    const items = ctx.getItems();
    if (!hintEl || items.length === 0) return;
    const idx = ctx.getSelectedIdx();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      ctx.setSelectedIdx((idx + 1) % items.length);
      ctx.updateSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      ctx.setSelectedIdx((idx - 1 + items.length) % items.length);
      ctx.updateSelection();
    } else if (e.key === "Enter" && idx >= 0 && idx < items.length) {
      e.preventDefault();
      items[idx].onSelect();
    } else if (e.key === "Escape") {
      ctx.dismissHint();
    }
  });
}

// ---------------------------------------------------------------------------
// Fixed-option hint (lightweight autocomplete for a small set of choices)
// ---------------------------------------------------------------------------
function attachFixedHint(
  input: HTMLInputElement,
  options: { value: string; label: string }[],
  onSelect: (value: string) => void,
) {
  let hintEl: HTMLElement | null = null;
  let selectedIdx = -1;
  let filteredOpts = options;

  const anchor = document.createElement("div");
  anchor.className = "gi-suggest-anchor";
  input.parentNode!.insertBefore(anchor, input);
  anchor.appendChild(input);

  const updateSelection = (container: HTMLElement) => {
    const rows = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    rows.forEach((r, idx) => r.classList.toggle("is-selected", idx === selectedIdx));
  };

  const renderHint = () => {
    if (hintEl) hintEl.remove();
    if (filteredOpts.length === 0) { hintEl = null; return; }
    hintEl = document.createElement("div");
    hintEl.className = "suggestion-container mod-search-suggestion";
    for (let i = 0; i < filteredOpts.length; i++) {
      const opt = filteredOpts[i];
      const item = hintEl.createDiv({ cls: "suggestion-item mod-complex search-suggest-item" });
      const content = item.createDiv({ cls: "suggestion-content" });
      const title = content.createDiv({ cls: "suggestion-title" });
      title.createEl("span", { text: opt.label });
      if (opt.value !== opt.label) {
        title.createEl("span", { cls: "search-suggest-info-text", text: opt.value });
      }
      item.addEventListener("click", () => {
        input.value = opt.label;
        onSelect(opt.value);
        dismissHint();
      });
      item.addEventListener("mouseenter", () => {
        selectedIdx = i;
        updateSelection(hintEl!);
      });
    }
    selectedIdx = 0;
    updateSelection(hintEl);
    anchor.appendChild(hintEl);
  };

  const dismissHint = () => {
    hintEl?.remove();
    hintEl = null;
    selectedIdx = -1;
  };

  const rebuild = () => {
    const q = input.value.toLowerCase().trim();
    filteredOpts = q ? options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;
    renderHint();
  };

  input.addEventListener("focus", rebuild);
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (input === document.activeElement) return;
      dismissHint();
    }, 150);
  });
  input.addEventListener("input", () => {
    if (input === document.activeElement) rebuild();
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!hintEl || filteredOpts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % filteredOpts.length;
      updateSelection(hintEl);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + filteredOpts.length) % filteredOpts.length;
      updateSelection(hintEl);
    } else if (e.key === "Enter" && selectedIdx >= 0 && selectedIdx < filteredOpts.length) {
      e.preventDefault();
      const opt = filteredOpts[selectedIdx];
      input.value = opt.label;
      onSelect(opt.value);
      dismissHint();
    } else if (e.key === "Escape") {
      dismissHint();
    }
  });
}

// ---------------------------------------------------------------------------
// Search-jump dropdown: shows matching node IDs and jumps to selected node
// ---------------------------------------------------------------------------
function attachSearchJump(input: HTMLInputElement, cb: PanelCallbacks) {
  let dropdownEl: HTMLElement | null = null;
  let selectedIdx = 0;
  let filteredIds: string[] = [];

  // The input is already inside an ngp-suggest-anchor wrapper (from attachQueryHint).
  // We attach our dropdown to the same anchor so it stacks correctly.
  const getAnchor = (): HTMLElement => input.closest(".ngp-suggest-anchor") ?? input.parentElement!;

  const dismiss = () => {
    dropdownEl?.remove();
    dropdownEl = null;
    filteredIds = [];
    selectedIdx = 0;
  };

  const updateSelection = () => {
    if (!dropdownEl) return;
    const items = dropdownEl.querySelectorAll(".gi-search-result-item");
    items.forEach((el, i) => el.classList.toggle("is-selected", i === selectedIdx));
  };

  const jumpToSelected = () => {
    if (filteredIds.length > 0 && selectedIdx >= 0 && selectedIdx < filteredIds.length) {
      cb.jumpToNode(filteredIds[selectedIdx]);
      dismiss();
    }
  };

  const rebuild = () => {
    const query = input.value.trim().toLowerCase();
    // Don't show the jump dropdown for structured queries (field:value, hop:, etc.)
    if (!query || /^[a-z]+:/i.test(query)) {
      dismiss();
      return;
    }

    const allIds = cb.getNodeIds();
    filteredIds = allIds.filter(id => id.toLowerCase().includes(query)).slice(0, 10);

    if (filteredIds.length === 0) {
      dismiss();
      return;
    }

    dropdownEl = _rebuildSearchDropdown(dropdownEl, getAnchor(), filteredIds, cb, dismiss, (i) => {
      selectedIdx = i;
      updateSelection();
    });
    selectedIdx = 0;
    updateSelection();
  };

  _setupSearchJumpListeners(input, {
    rebuild,
    dismiss,
    getAnchor,
    getDropdownEl: () => dropdownEl,
    getFilteredIds: () => filteredIds,
    getSelectedIdx: () => selectedIdx,
    setSelectedIdx: (i: number) => { selectedIdx = i; },
    updateSelection,
    jumpToSelected,
  });
}

/** Build or rebuild the search jump dropdown DOM. Returns the dropdown element. */
function _rebuildSearchDropdown(
  existing: HTMLElement | null,
  anchor: HTMLElement,
  ids: string[],
  cb: PanelCallbacks,
  dismiss: () => void,
  onHover: (index: number) => void,
): HTMLElement {
  const dropdownEl = existing ?? (() => {
    const el = document.createElement("div");
    el.className = "gi-search-results";
    anchor.appendChild(el);
    return el;
  })();

  // Clear and rebuild items
  dropdownEl.empty();

  // Hint header
  const hint = dropdownEl.createDiv({ cls: "gi-search-result-hint" });
  hint.textContent = t("search.jumpHint");

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const item = dropdownEl.createDiv({ cls: "gi-search-result-item" });
    item.textContent = id;
    item.addEventListener("click", () => {
      cb.jumpToNode(id);
      dismiss();
    });
    item.addEventListener("mouseenter", () => onHover(i));
  }

  return dropdownEl;
}

/** Wire up input/keydown/blur listeners for search jump. */
function _setupSearchJumpListeners(input: HTMLInputElement, ctx: {
  rebuild: () => void;
  dismiss: () => void;
  getAnchor: () => HTMLElement;
  getDropdownEl: () => HTMLElement | null;
  getFilteredIds: () => string[];
  getSelectedIdx: () => number;
  setSelectedIdx: (i: number) => void;
  updateSelection: () => void;
  jumpToSelected: () => void;
}) {
  input.addEventListener("input", () => {
    // Defer slightly so attachQueryHint processes first
    setTimeout(ctx.rebuild, 50);
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    const dropdownEl = ctx.getDropdownEl();
    const ids = ctx.getFilteredIds();
    if (!dropdownEl || ids.length === 0) return;
    if (e.key === "Enter") {
      // Only handle Enter for jump when the query hint dropdown is NOT visible.
      const anchor = ctx.getAnchor();
      const queryHint = anchor.querySelector(".suggestion-container.mod-search-suggestion");
      if (queryHint) return; // let attachQueryHint handle it
      e.preventDefault();
      ctx.jumpToSelected();
    } else if (e.key === "Escape") {
      ctx.dismiss();
    } else if (e.key === "ArrowDown") {
      if (!ctx.getAnchor().querySelector(".suggestion-container.mod-search-suggestion")) {
        e.preventDefault();
        const idx = ctx.getSelectedIdx();
        ctx.setSelectedIdx((idx + 1) % ids.length);
        ctx.updateSelection();
      }
    } else if (e.key === "ArrowUp") {
      if (!ctx.getAnchor().querySelector(".suggestion-container.mod-search-suggestion")) {
        e.preventDefault();
        const idx = ctx.getSelectedIdx();
        ctx.setSelectedIdx((idx - 1 + ids.length) % ids.length);
        ctx.updateSelection();
      }
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(ctx.dismiss, 200);
  });
}

function addSelect(container: HTMLElement, label: string, options: { value: string; label: string }[], initial: string, onChange: (v: string) => void, description?: string) {
  const row = container.createDiv({ cls: "setting-item" });
  const info = row.createDiv({ cls: "setting-item-info" });
  const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
  nameEl.title = description || label;
  const control = row.createDiv({ cls: "setting-item-control" });
  const sel = control.createEl("select", { cls: "dropdown", attr: { "aria-label": label } });
  for (const opt of options) {
    const el = sel.createEl("option", { text: opt.label, value: opt.value });
    if (opt.value === initial) el.selected = true;
  }
  sel.addEventListener("change", () => onChange(sel.value));
}

function renderGroupList(container: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks) {
  container.empty();
  panel.groups.forEach((g, i) => {
    const row = container.createDiv({ cls: "gi-group-rule-row" });

    // Color dot (click to cycle)
    const colorDot = row.createDiv({ cls: "gi-group-color gi-color-dot" });
    colorDot.style.background = g.color;
    colorDot.addEventListener("click", () => {
      const next = DEFAULT_COLORS[(DEFAULT_COLORS.indexOf(g.color as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length];
      g.color = next;
      colorDot.style.background = next;
      cb.recolorNodes();
    });

    // Search-bar style input (same as top search)
    const input = row.createEl("input", {
      cls: "gi-search gi-group-search",
      type: "text",
      placeholder: t("search.placeholder"),
      attr: { "aria-label": t("search.placeholder") },
    });
    input.value = g.expression ? serializeExpr(g.expression) : "";
    input.addEventListener("input", () => {
      g.expression = parseQueryExpr(input.value);
      cb.recolorNodes();
    });
    attachQueryHint(input, (field) => cb.collectValueSuggestions(field));

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "×" });
    rm.addEventListener("click", () => {
      panel.groups.splice(i, 1);
      renderGroupList(container, panel, ctx, cb);
      cb.recolorNodes();
    });
  });
}

function getSortKeyOptions(): { value: SortKey; label: string }[] {
  return [
    { value: "degree", label: t("sort.degree") },
    { value: "in-degree", label: t("sort.inDegree") },
    { value: "tag", label: t("sort.tag") },
    { value: "category", label: t("sort.category") },
    { value: "label", label: t("sort.label") },
    { value: "importance", label: t("sort.importance") },
  ];
}

function renderSortRuleList(
  container: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.sortRules;
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "gi-group-item" });

    // Sort key dropdown
    const keySel = row.createEl("select", { cls: "dropdown" });
    keySel.addClass("gi-flex-fill");
    for (const opt of getSortKeyOptions()) {
      const el = keySel.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === rule.key) el.selected = true;
    }
    keySel.addEventListener("change", () => {
      rule.key = keySel.value as SortKey;
      cb.applyClusterForce();
      cb.doRenderKeepPanel();
    });

    // Order toggle button
    const orderBtn = row.createEl("button", {
      cls: "gi-direction-btn",
      text: rule.order === "asc" ? t("sort.asc") : t("sort.desc"),
    });
    orderBtn.addClass("gi-order-btn");
    orderBtn.addEventListener("click", () => {
      rule.order = rule.order === "asc" ? "desc" : "asc";
      orderBtn.textContent = rule.order === "asc" ? t("sort.asc") : t("sort.desc");
      cb.applyClusterForce();
      cb.doRenderKeepPanel();
    });

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove gi-ml-4", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderSortRuleList(container, panel, cb);
      cb.applyClusterForce();
      cb.doRenderKeepPanel();
    });
  });
}

// ---------------------------------------------------------------------------
// Cluster group rule list
// ---------------------------------------------------------------------------

function renderClusterRuleList(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.clusterGroupRules;
  const groupByOpts = getGroupByOptions(ctx);
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "gi-expr-row" });

    // Field input with field:? suggestions (same UI as グルーピング)
    const input = row.createEl("input", {
      cls: "gi-expr-field",
      type: "text",
      placeholder: "tag:?, category:?, folder:?...",
    });
    input.value = rule.groupBy;
    attachFixedHint(input, groupByOpts, (val) => {
      rule.groupBy = val;
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });
    input.addEventListener("change", () => {
      rule.groupBy = input.value.trim();
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    // Recursive toggle (compact checkbox + label)
    const recWrap = row.createEl("label");
    recWrap.addClass("gi-rec-wrap");
    const recToggle = recWrap.createDiv({
      cls: "checkbox-container" + (rule.recursive ? " is-enabled" : ""),
    });
    recWrap.createEl("span", { text: t("clusterGroup.recursive"), cls: "gi-hint" });
    recToggle.addEventListener("click", () => {
      rule.recursive = !rule.recursive;
      recToggle.toggleClass("is-enabled", rule.recursive);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderClusterRuleList(container, panel, ctx, cb);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });
  });
}

// ---------------------------------------------------------------------------
// Directional gravity rule list
// ---------------------------------------------------------------------------

function renderDirectionalGravityList(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.directionalGravityRules;
  const dirOptions: { value: string; label: string }[] = [
    { value: "top", label: t("gravDir.top") },
    { value: "bottom", label: t("gravDir.bottom") },
    { value: "left", label: t("gravDir.left") },
    { value: "right", label: t("gravDir.right") },
    { value: "custom", label: t("gravDir.custom") },
  ];
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "gi-group-rule-row gi-gravity-row" });

    // Filter search-bar input (with query hint)
    const filterInput = row.createEl("input", {
      cls: "gi-search",
      type: "text",
      placeholder: "tag:character, category:*, *",
      attr: { "aria-label": "Gravity rule filter" },
    });
    filterInput.value = rule.filter;
    filterInput.addEventListener("input", () => {
      rule.filter = filterInput.value;
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });
    attachQueryHint(filterInput, (field) => cb.collectValueSuggestions(field));

    // Direction search-bar input (with fixed-option hint)
    const isCustom = typeof rule.direction === "number";
    const dirInput = row.createEl("input", {
      cls: "gi-search gi-dir-input",
      type: "text",
      placeholder: t("gravDir.top"),
      attr: { "aria-label": "Gravity direction" },
    });
    if (isCustom) {
      dirInput.value = t("gravDir.custom");
    } else {
      const curDir = dirOptions.find(o => o.value === rule.direction);
      dirInput.value = curDir ? curDir.label : String(rule.direction);
    }

    // Custom radian input (shown only in custom mode)
    const radInput = row.createEl("input", { cls: "gi-search gi-rad-input", type: "number", attr: { "aria-label": "Gravity custom angle (radians)" } });
    radInput.step = "0.1";
    radInput.placeholder = "rad";
    radInput.value = isCustom ? String(rule.direction) : "0";
    radInput.style.display = isCustom ? "" : "none";

    attachFixedHint(dirInput, dirOptions, (val) => {
      if (val === "custom") {
        rule.direction = parseFloat(radInput.value) || 0;
        radInput.style.display = "";
      } else {
        rule.direction = val as "top" | "bottom" | "left" | "right";
        radInput.style.display = "none";
      }
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    radInput.addEventListener("input", () => {
      rule.direction = parseFloat(radInput.value) || 0;
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    // Strength slider
    const strSlider = row.createEl("input", { type: "range" });
    strSlider.min = "0.01";
    strSlider.max = "1";
    strSlider.step = "0.01";
    strSlider.value = String(rule.strength);
    strSlider.addClass("gi-str-slider");
    updateSliderProgress(strSlider);
    strSlider.addEventListener("input", () => {
      rule.strength = parseFloat(strSlider.value);
      updateSliderProgress(strSlider);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderDirectionalGravityList(container, panel, ctx, cb);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });
  });
}

// ---------------------------------------------------------------------------
// Node Rule list (unified spacing + gravity per query)
// ---------------------------------------------------------------------------

/** Direction presets for gravity dropdown. Angle in degrees. */
function getGravityDirOptions(): { value: string; label: string; angle: number }[] {
  return [
    { value: "none", label: t("gravDir.none"), angle: -1 },
    { value: "up", label: t("gravDir.up"), angle: 270 },
    { value: "down", label: t("gravDir.down"), angle: 90 },
    { value: "left", label: t("gravDir.left"), angle: 180 },
    { value: "right", label: t("gravDir.right"), angle: 0 },
    { value: "custom", label: t("gravDir.custom"), angle: -1 },
  ];
}

function angleToPreset(angle: number): string {
  if (angle < 0) return "none";
  if (angle === 270) return "up";
  if (angle === 90) return "down";
  if (angle === 180) return "left";
  if (angle === 0) return "right";
  return "custom";
}

function renderNodeRuleList(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.nodeRules;
  rules.forEach((rule, i) => {
    const wrapper = container.createDiv({ cls: "gi-noderule-item" });

    // Row 1: Query input + delete button
    const row1 = wrapper.createDiv({ cls: "gi-group-item" });
    row1.addClass("gi-noderule-row");

    const queryInput = row1.createEl("input", { cls: "gi-search", type: "text", placeholder: "tag:character, *, degree>5", attr: { "aria-label": "Node rule query" } });
    queryInput.addClass("gi-query-input");
    queryInput.value = rule.query;
    queryInput.addEventListener("input", () => {
      rule.query = queryInput.value;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
    attachQueryHint(queryInput, (field) => cb.collectValueSuggestions(field));

    const rm = row1.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderNodeRuleList(container, panel, ctx, cb);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Row 2: spacing slider + gravity controls (indented)
    const row2 = wrapper.createDiv();
    row2.addClass("gi-noderule-detail");

    // Spacing slider
    const spacingRow = row2.createDiv({ cls: "setting-item mod-slider" });
    spacingRow.addClass("gi-spacing-row");
    const spacingInfo = spacingRow.createDiv({ cls: "setting-item-info" });
    spacingInfo.createDiv({ cls: "setting-item-name", text: t("nodeRules.spacing") });
    const spacingControl = spacingRow.createDiv({ cls: "setting-item-control" });
    const spacingSlider = spacingControl.createEl("input", { type: "range", attr: { "aria-label": t("nodeRules.spacing") } });
    spacingSlider.min = "0.1";
    spacingSlider.max = "5.0";
    spacingSlider.step = "0.1";
    spacingSlider.value = String(rule.spacingMultiplier);
    updateSliderProgress(spacingSlider);
    const spacingLabel = spacingControl.createEl("span", { text: String(rule.spacingMultiplier) });
    spacingLabel.addClass("gi-slider-label");
    spacingSlider.addEventListener("input", () => {
      rule.spacingMultiplier = parseFloat(spacingSlider.value);
      spacingLabel.textContent = spacingSlider.value;
      updateSliderProgress(spacingSlider);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // カラーオーバーライド (color picker)
    const colorRow = row2.createDiv({ cls: "setting-item" });
    colorRow.addClass("gi-spacing-row");
    const colorInfo = colorRow.createDiv({ cls: "setting-item-info" });
    colorInfo.createDiv({ cls: "setting-item-name", text: t("nodeRules.color") });
    const colorControl = colorRow.createDiv({ cls: "setting-item-control" });
    const colorPicker = colorControl.createEl("input", { type: "color", attr: { "aria-label": t("nodeRules.color") } });
    colorPicker.value = rule.color || "#ffffff";
    colorPicker.addClass("gi-color-picker");
    const colorClear = colorControl.createEl("button", { cls: "gi-color-clear", text: "\u00D7", attr: { "aria-label": "Clear color" } });
    colorClear.style.display = rule.color ? "" : "none";
    // カラー有効/無効を示すチェックボックス
    const colorEnabled = colorControl.createEl("input", { type: "checkbox", attr: { "aria-label": "Enable color override" } });
    colorEnabled.checked = !!rule.color;
    colorEnabled.addClass("gi-color-enable");
    colorPicker.style.opacity = rule.color ? "1" : "0.4";
    colorPicker.addEventListener("input", () => {
      rule.color = colorPicker.value;
      colorPicker.style.opacity = "1";
      colorEnabled.checked = true;
      colorClear.style.display = "";
      cb.doRenderKeepPanel();
    });
    colorClear.addEventListener("click", () => {
      rule.color = undefined;
      colorPicker.style.opacity = "0.4";
      colorEnabled.checked = false;
      colorClear.style.display = "none";
      cb.doRenderKeepPanel();
    });
    colorEnabled.addEventListener("change", () => {
      if (colorEnabled.checked) {
        rule.color = colorPicker.value;
        colorPicker.style.opacity = "1";
        colorClear.style.display = "";
      } else {
        rule.color = undefined;
        colorPicker.style.opacity = "0.4";
        colorClear.style.display = "none";
      }
      cb.doRenderKeepPanel();
    });

    // Gravity direction dropdown
    const gravRow = row2.createDiv({ cls: "gi-group-item" });
    gravRow.addClass("gi-gravity-row");

    const gravLabel = gravRow.createEl("span", { cls: "setting-item-name", text: t("nodeRules.gravity") });
    gravLabel.addClass("gi-gravity-label");

    const dirSelect = gravRow.createEl("select", { cls: "dropdown", attr: { "aria-label": t("nodeRules.gravity") } });
    dirSelect.addClass("gi-gravity-dir-select");
    const currentPreset = angleToPreset(rule.gravityAngle);
    for (const opt of getGravityDirOptions()) {
      const el = dirSelect.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === currentPreset) el.selected = true;
    }

    // Custom angle input (hidden unless custom)
    const angleInput = gravRow.createEl("input", { cls: "gi-search", type: "number", attr: { "aria-label": "Gravity custom angle (degrees)" } });
    angleInput.addClass("gi-angle-input");
    angleInput.step = "1";
    angleInput.min = "0";
    angleInput.max = "360";
    angleInput.placeholder = "°";
    angleInput.value = currentPreset === "custom" ? String(rule.gravityAngle) : "0";
    angleInput.style.display = currentPreset === "custom" ? "" : "none";

    // Strength slider (hidden if direction=none)
    const strSlider = gravRow.createEl("input", { type: "range", attr: { "aria-label": "Gravity strength" } });
    strSlider.min = "0.01";
    strSlider.max = "1";
    strSlider.step = "0.01";
    strSlider.value = String(rule.gravityStrength);
    strSlider.addClass("gi-str-slider");
    updateSliderProgress(strSlider);
    strSlider.style.display = currentPreset === "none" ? "none" : "";

    dirSelect.addEventListener("change", () => {
      const val = dirSelect.value;
      if (val === "none") {
        rule.gravityAngle = -1;
        angleInput.style.display = "none";
        strSlider.style.display = "none";
      } else if (val === "custom") {
        rule.gravityAngle = parseFloat(angleInput.value) || 0;
        angleInput.style.display = "";
        strSlider.style.display = "";
      } else {
        const preset = getGravityDirOptions().find(o => o.value === val);
        rule.gravityAngle = preset?.angle ?? -1;
        angleInput.style.display = "none";
        strSlider.style.display = "";
      }
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    angleInput.addEventListener("input", () => {
      rule.gravityAngle = parseFloat(angleInput.value) || 0;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    strSlider.addEventListener("input", () => {
      rule.gravityStrength = parseFloat(strSlider.value);
      updateSliderProgress(strSlider);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Center gravity slider (Force layout per-node center pull)
    const cgRow = row2.createDiv({ cls: "setting-item mod-slider" });
    cgRow.addClass("gi-spacing-row");
    const cgInfo = cgRow.createDiv({ cls: "setting-item-info" });
    cgInfo.createDiv({ cls: "setting-item-name", text: t("gravity.centerGravity") });
    const cgControl = cgRow.createDiv({ cls: "setting-item-control" });
    const cgSlider = cgControl.createEl("input", { type: "range" });
    cgSlider.min = "0";
    cgSlider.max = "2";
    cgSlider.step = "0.1";
    cgSlider.value = String(rule.centerGravity ?? 1.0);
    updateSliderProgress(cgSlider);
    const cgLabel = cgControl.createEl("span", { text: String(rule.centerGravity ?? 1.0) });
    cgLabel.addClass("gi-slider-label");
    cgSlider.addEventListener("input", () => {
      rule.centerGravity = parseFloat(cgSlider.value);
      cgLabel.textContent = cgSlider.value;
      updateSliderProgress(cgSlider);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Repel multiplier slider (Force layout per-node repulsion)
    const rmRow = row2.createDiv({ cls: "setting-item mod-slider" });
    rmRow.addClass("gi-spacing-row");
    const rmInfo = rmRow.createDiv({ cls: "setting-item-info" });
    rmInfo.createDiv({ cls: "setting-item-name", text: t("gravity.repelMultiplier") });
    const rmControl = rmRow.createDiv({ cls: "setting-item-control" });
    const rmSlider = rmControl.createEl("input", { type: "range" });
    rmSlider.min = "0";
    rmSlider.max = "3";
    rmSlider.step = "0.1";
    rmSlider.value = String(rule.repelMultiplier ?? 1.0);
    updateSliderProgress(rmSlider);
    const rmLabel = rmControl.createEl("span", { text: String(rule.repelMultiplier ?? 1.0) });
    rmLabel.addClass("gi-slider-label");
    rmSlider.addEventListener("input", () => {
      rule.repelMultiplier = parseFloat(rmSlider.value);
      rmLabel.textContent = rmSlider.value;
      updateSliderProgress(rmSlider);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
  });
}
