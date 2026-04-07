import type {
	LayoutType,
	ViewMode,
	GraphNode,
	ShellInfo,
	DirectionalGravityRule,
	ClusterArrangement,
	ClusterGroupArrangement,
	ClusterGroupRule,
	GroupRule,
	SortRule,
	SortKey,
	SortOrder,
	NodeRule,
	GraphViewsSettings,
	NodeDisplayMode,
	CardDisplayConfig,
	DonutDisplayConfig,
	CoordinateLayout,
	ClusterGravityConfig,
	EdgeCardinalityMode,
	CardinalityRule,
	CardRenderConfig,
	CardinalityRenderConfig,
	RenderThresholds,
} from "../types";
import { setIcon, Menu } from "obsidian";
import type { App } from "obsidian";
import { t, tHelp } from "../i18n";
import type { ShapeRule } from "../utils/node-shapes";
import { exportPreset, exportPresetDiff, importPreset, applyPreset, type PresetMigrationInfo } from "../utils/presets";
import { showToast } from "../utils/toast";
import {
	buildAxisTextInput as coordBuildAxisTextInput,
	buildCoordPreview as coordBuildCoordPreview,
	buildExprLibrary as coordBuildExprLibrary,
	buildConstantsUI as coordBuildConstantsUI,
	getAxisSourceSuggestions as coordGetAxisSourceSuggestions,
} from "./coord-panel";
import {
	TAG_DISPLAY_ENCLOSURE,
	TAG_DISPLAY_NODE,
} from "../constants";
import { asInternalApp, asObsidianWindow } from "../obsidian-internals";
import { isSectionVisible } from "../utils/view-mode-sections";
import type { PanelSectionId } from "../utils/view-mode-sections";
import {
	_buildQueryHintContainer,
	addSlider,
	addToggle,
	addSelect,
	addTextInput,
	addCheckboxGroup,
	renderGroupByRules,
	attachQueryHint,
	setCachedFieldSuggestions,
	attachSearchJump,
} from "./panel-widgets";
import {
	buildHoverBehaviorSection,
	buildNodeDisplayModeSection,
	buildCableDisplaySection,
	buildRoadNetworkSection,
	buildMinimapSection,
	buildRelationColorSection,
} from "./panel-sections-filter";
import {
	buildOntologySection,
	buildTagRelationsSection,
	buildSamplePresetSelector,
	buildArrangementPatternSelect,
	buildConcentricOptions,
	buildCoordinateControls,
	buildAutoFitAndGuides,
	buildSpacingAndGroupArrangement,
	buildDirectionalGravityRules,
	buildSortRules,
	type ClusterSectionCtx,
} from "./panel-sections-layout";
import {
	buildEdgeDisplaySection,
	buildNodeDisplaySection,
} from "./panel-sections-display";

// ---------------------------------------------------------------------------
// Panel state (shared with GraphViewContainer)
// ---------------------------------------------------------------------------
export interface GroupByRule {
	field: string;
	op?: string;
	indent?: number;
	recursive?: boolean;
}

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
	showInlineRelation: boolean;
	showNamedRelation: boolean;
	showLinks: boolean;
	showTagEdges: boolean;
	showCategoryEdges: boolean;
	showSemanticEdges: boolean;
	enclosureSpacing: number;
	directionalGravityRules: DirectionalGravityRule[];
	hoverHops: number;
	/** Which node categories to highlight on hover (multi-select). */
	hoverHighlightTypes: {
		forwardLinks: boolean;
		backlinks: boolean;
		sharedTags: boolean;
		sameFolder: boolean;
	};
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
		nodeSize: 20,
		centerForce: 0.03,
		repelForce: 500,
		linkForce: 0.01,
		linkDistance: 150,
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
		showInlineRelation: false,
		showNamedRelation: false,
		showLinks: true,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		enclosureSpacing: 1.5,
		directionalGravityRules: [],
		hoverHops: 1,
		hoverHighlightTypes: {
			forwardLinks: true,
			backlinks: true,
			sharedTags: false,
			sameFolder: false,
		},
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
		clusterArrangement: "inherit" as ClusterArrangement,
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
		gridShowHeaders: false,
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
		showOntologyBackbone: false,
	};
}

/** B2: Validate and sanitize panel state — fix NaN, undefined, out-of-range values */
export function validatePanelState(panel: PanelState): void {
	const defaults = createDefaultPanel();
	// Numeric fields: replace NaN/Infinity with defaults
	const numericKeys: (keyof PanelState)[] = [
		"nodeSize",
		"centerForce",
		"repelForce",
		"linkForce",
		"linkDistance",
		"textFadeThreshold",
		"concentricMinRadius",
		"concentricRadiusStep",
		"hoverHops",
		"enclosureSpacing",
		"edgeBundleStrength",
		"clusterNodeSpacing",
		"clusterGroupScale",
		"clusterGroupSpacing",
	];
	for (const key of numericKeys) {
		const val = panel[key] as number;
		if (typeof val !== "number" || !isFinite(val)) {
			// Safe: numericKeys is constrained to keyof PanelState with number values
			(panel as unknown as Record<string, unknown>)[key] = (defaults as unknown as Record<string, unknown>)[key];
		}
	}
	// ViewMode validation
	const validViewModes = new Set(["graph", "sunburst", "timeline", "matrix"]);
	if (!validViewModes.has(panel.viewMode)) {
		panel.viewMode = "graph";
	}
	// ClusterArrangement validation — reject unknown values (e.g. "force" from old configs)
	const validArrangements = new Set([
		"inherit",
		"concentric",
		"radial",
		"phyllotaxis",
		"grid",
		"triangle",
		"random",
		"timeline",
		"custom",
		"ego",
	]);
	if (!validArrangements.has(panel.clusterArrangement)) {
		panel.clusterArrangement = "inherit";
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
		if (
			panel.renderThresholds.nodeSizeByDegree === false ||
			panel.renderThresholds.nodeSizeByDegree === undefined
		) {
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
	invalidateData(): void; // sets rawData = null then doRender
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
	/** Clear cached hover tooltips so they are recreated with current settings */
	clearHoverTooltips(): void;
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
	simulation: unknown | null; // only used for null-check
	settings: GraphViewsSettings;
	saveSettings(): void;
	nodeCount: number;
	edgeCount: number;
	app: App;
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
	/** Plugin directory path relative to vault (e.g. ".obsidian/plugins/graph-island") */
	pluginDir?: string;
}

export function buildPanel(panelEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks): void {
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
	const searchCountBadge = searchWrapper.createEl("span", {
		cls: "gi-search-count",
		attr: { "aria-live": "polite" },
	});
	searchCountBadge.style.cssText = "font-size:10px;color:var(--text-muted);margin-right:4px;display:none;";
	if (panel.searchQuery && ctx.nodeCount > 0) {
		searchCountBadge.textContent = `${ctx.pixiNodes.size}/${ctx.nodeCount}`;
		searchCountBadge.style.display = "";
	}
	searchBar.value = panel.searchQuery;

	// --- 検索構文ハイライトプレビュー ---
	const syntaxPreview = searchWrapper.createDiv({ cls: "gi-search-syntax" });
	syntaxPreview.style.cssText =
		"font-size:10px;padding:2px 4px;color:var(--text-muted);display:none;white-space:nowrap;overflow:hidden;";
	const KNOWN_QUERY_FIELDS = new Set([
		"path",
		"tag",
		"category",
		"file",
		"id",
		"label",
		"folder",
		"node_type",
		"prop-category",
		"story_order",
		"start-date",
		"date",
		"hop",
		"degree",
		"connected",
		...cb.collectFieldSuggestions(),
	]);
	const updateSyntaxPreview = () => {
		const q = searchBar.value.trim();
		if (!q) {
			syntaxPreview.style.display = "none";
			return;
		}
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
			? panel.searchHistory.filter((q) => q.toLowerCase().includes(filter))
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
					panel.savedSearchQueries = panel.savedSearchQueries.filter((s) => s !== sq);
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
		panel.searchHistory = panel.searchHistory.filter((q) => q !== query);
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
	searchBar.addEventListener("focus", () => {
		showHistory();
	});
	searchBar.addEventListener("blur", () => {
		// 少し遅延させてクリックイベントが先に処理されるようにする
		setTimeout(() => {
			historyDropdown.style.display = "none";
			searchBar.setAttribute("aria-expanded", "false");
		}, 150);
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
		if (existing) {
			existing.remove();
			return;
		}
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

	buildTabBar(
		panelEl,
		panel.activeTab,
		tabContainers,
		(tab) => {
			panel.activeTab = tab;
			// Clear settings filter when switching tabs
			if (settingsFilterInput) {
				settingsFilterInput.value = "";
				applySettingsFilter("");
			}
		},
		panel,
	);

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
				const anyVisible = Array.from(children).some((c) => (c as HTMLElement).style.display !== "none");
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

	// 統計ダッシュボード（プリセットバーの下に配置）
	_buildStatsBar(panelEl, panel, ctx);

	// Lazy tab construction — only build the active tab initially.
	// Other tabs are built on first activation or when settings filter is used.
	const tabBuilders: Record<TabId, () => void> = {
		filter: () => buildFilterTab(filterTab, panel, ctx, cb),
		display: () => buildDisplayTab(displayTab, panel, ctx, cb),
		layout: () => buildLayoutTab(layoutTab, panel, ctx, cb),
		nodes: () => _buildNodesTab(nodesTab, panel, ctx, cb),
		settings: () => buildSettingsTab(settingsTab, panel, ctx, cb),
	};
	const builtTabs = new Set<TabId>();

	function ensureTabBuilt(tabId: TabId) {
		if (builtTabs.has(tabId)) return;
		// Guard against removed/invalid tab IDs stored in old presets (e.g. "edges").
		// Fall back to "display" so the panel still renders without crashing.
		const builder = tabBuilders[tabId];
		if (!builder) {
			panel.activeTab = "display";
			ensureTabBuilt("display");
			return;
		}
		builtTabs.add(tabId);
		builder();
	}

	function ensureAllTabsBuilt() {
		for (const def of TAB_DEFS) ensureTabBuilt(def.id);
	}

	// Build active tab immediately
	ensureTabBuilt(panel.activeTab);

	// Patch tab switch to lazily build on first visit
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

function buildFilterTab(filterTab: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks): void {
	buildSection(
		filterTab,
		t("section.filter"),
		(body) => {
			// --- Basic (always visible) ---
			addToggle(
				body,
				t("filter.includeTagsInData"),
				panel.includeTagsInData,
				(v) => {
					panel.includeTagsInData = v;
					cb.invalidateDataKeepPanel();
				},
				t("desc.includeTagsInData"),
			);
			addToggle(
				body,
				t("filter.orphans"),
				panel.showOrphans,
				(v) => {
					panel.showOrphans = v;
					cb.invalidateDataKeepPanel();
					cb.rebuildPanel();
				},
				t("desc.orphans"),
			);
			// GK: Auto-fit on filter change
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
			addSelect(
				body,
				t("filter.tagDisplay"),
				[
					{ value: "off", label: t("filter.tagDisplay.off") },
					{ value: "node", label: t("filter.tagDisplay.node") },
					{ value: "enclosure", label: t("filter.tagDisplay.enclosure") },
				],
				!panel.showTagNodes ? "off" : panel.tagDisplay,
				(v) => {
					panel.showTagNodes = v !== "off";
					panel.tagDisplay = v === TAG_DISPLAY_ENCLOSURE ? TAG_DISPLAY_ENCLOSURE : TAG_DISPLAY_NODE;
					cb.invalidateDataKeepPanel();
					cb.rebuildPanel(); // Progressive disclosure: tag shape / enclosure settings
				},
				t("desc.tagDisplay"),
			);
			// --- Advanced (hidden by default) ---
			addAdvancedGroup(body, (adv) => {
				addToggle(
					adv,
					t("filter.attachments"),
					panel.showAttachments,
					(v) => {
						panel.showAttachments = v;
						cb.invalidateDataKeepPanel();
					},
					t("desc.attachments"),
				);
				addToggle(
					adv,
					t("filter.existingOnly"),
					panel.existingOnly,
					(v) => {
						panel.existingOnly = v;
						cb.invalidateDataKeepPanel();
					},
					t("desc.existingOnly"),
				);
				if (panel.showOrphans) {
					addTextInput(
						adv,
						t("filter.orphanClusterField"),
						panel.orphanClusterField ?? "",
						"category, folder, tag",
						(v) => {
							panel.orphanClusterField = v;
							cb.invalidateDataKeepPanel();
						},
					);
				}
				// Dataview query filter
				const dvRow = adv.createDiv({ cls: "gi-setting-row" });
				dvRow.createEl("span", { cls: "gi-setting-label", text: t("filter.dataviewQuery") });
				const dvInput = dvRow.createEl("input", { cls: "gi-setting-input", type: "text" });
				dvInput.value = panel.dataviewQuery;
				dvInput.placeholder = '#tag, "folder"';
				dvInput.setAttribute("aria-label", t("filter.dataviewHint"));
				// Check if Dataview plugin is available
				const dvApi = asInternalApp(ctx.app)?.plugins?.plugins?.dataview?.api;
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
		},
		tHelp("help.filter"),
		false,
		"filter",
	);
}

// ---------------------------------------------------------------------------
// Bookmark section builder (Feature L)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Display tab section builders (file-private)
// ---------------------------------------------------------------------------

function buildDisplayTab(displayTab: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks): void {
	const v = (id: PanelSectionId) => isSectionVisible(panel.viewMode, id);

	if (v("nodeDisplay")) buildNodeDisplaySection(displayTab, panel, ctx, cb);
	if (v("nodeDisplay")) buildHoverBehaviorSection(displayTab, panel, ctx, cb);
	if (v("nodeDisplayMode")) buildNodeDisplayModeSection(displayTab, panel, ctx, cb);
	if (v("edgeDisplay")) buildEdgeDisplaySection(displayTab, panel, ctx, cb);
	if (v("cableDisplay")) buildCableDisplaySection(displayTab, panel, ctx, cb);
	if (v("roadNetwork")) buildRoadNetworkSection(displayTab, panel, ctx, cb);
	if (v("minimap")) buildMinimapSection(displayTab, panel, ctx, cb);
	if (v("relationColors")) buildRelationColorSection(displayTab, panel, ctx, cb);
}

function buildLayoutTab(layoutTab: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks): void {
	const v = (id: PanelSectionId) => isSectionVisible(panel.viewMode, id);

	// --- Unified Grouping & Layout section ---
	if (v("grouping") || v("clusterArrangement") || v("coordinateControls")) {
		buildSection(
			layoutTab,
			t("section.displayGrouping"),
			(body) => {
				// --- GroupBy rules ---
				if (v("grouping")) {
					body.createDiv({ cls: "setting-item-name", text: t("display.groupBy") });
					const groupByListEl = body.createDiv({ cls: "gi-multirule-list" });
					renderGroupByRules(groupByListEl, panel, ctx, cb);

					if (panel.groupBy && panel.groupBy !== "none") {
						const groupBtnRow = body.createDiv({ cls: "gi-setting-row gi-group-btn-row" });
						const expandBtn = groupBtnRow.createEl("button", {
							cls: "gi-btn-sm",
							text: t("groups.expandAll"),
						});
						expandBtn.addEventListener("click", () => {
							panel.collapsedGroups.clear();
							panel.collapsedGroups.add("__gi_expand_all__");
							cb.doRenderKeepPanel();
							cb.rebuildPanel();
							cb.announceA11y?.(`${t("groups.expandAll") ?? "Expand All"}: groups expanded`);
						});
						const collapseBtn = groupBtnRow.createEl("button", {
							cls: "gi-btn-sm",
							text: t("groups.collapseAll"),
						});
						collapseBtn.addEventListener("click", () => {
							panel.collapsedGroups.clear();
							cb.doRenderKeepPanel();
							cb.rebuildPanel();
							cb.announceA11y?.(`${t("groups.collapseAll") ?? "Collapse All"}: groups collapsed`);
						});

						addSlider(
							body,
							t("display.groupMinSize"),
							1,
							20,
							1,
							panel.groupMinSize,
							(v) => {
								panel.groupMinSize = v;
								panel.collapsedGroups.clear();
								cb.doRenderKeepPanel();
							},
							t("desc.groupMinSize"),
						);
						if (ctx.availableGroups.length > 0) {
							const currentFilter = panel.groupFilter
								? new Set(
										panel.groupFilter
											.split(",")
											.map((s) => s.trim())
											.filter(Boolean),
									)
								: new Set(ctx.availableGroups);
							addCheckboxGroup(
								body,
								t("display.groupFilter"),
								ctx.availableGroups,
								currentFilter,
								(sel) => {
									panel.groupFilter =
										sel.size === ctx.availableGroups.length ? "" : [...sel].join(", ");
									panel.collapsedGroups.clear();
									cb.doRenderKeepPanel();
								},
							);
						}
					}
				}

				// --- Cluster arrangement ---
				if (v("clusterArrangement")) {
					const sctx: ClusterSectionCtx = { body, panel, cb, ctx, spacingSliders: [] };
					buildArrangementPatternSelect(sctx);
					buildConcentricOptions(sctx);
					buildSpacingAndGroupArrangement(sctx);
					buildAutoFitAndGuides(sctx);
					buildDirectionalGravityRules(sctx);
					buildSortRules(sctx);
				}

				// --- 3. Coordinate controls ---
				if (v("coordinateControls")) {
					const sctx: ClusterSectionCtx = { body, panel, cb, ctx, spacingSliders: [] };
					buildCoordinateControls(sctx, coordBuildAxisTextInput, coordBuildCoordPreview, coordBuildExprLibrary, coordBuildConstantsUI, coordGetAxisSourceSuggestions);
				}
			},
			tHelp("help.displayGrouping"),
			false,
			"layers",
		);
	}
}

function _buildSettingsActionButtons(
	tabEl: HTMLElement,
	panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
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
			setTimeout(() => {
				exportBtn.textContent = t("preset.export");
			}, 2000);
		} catch (_e) {
			/* clipboard not available */
		}
	});

	const diffExportBtn = presetRow.createEl("button", { text: t("preset.exportDiff") });
	diffExportBtn.title = t("preset.exportDiffDesc");
	diffExportBtn.addEventListener("click", async () => {
		const defaults = createDefaultPanel();
		const json = exportPresetDiff(panel, defaults);
		try {
			await navigator.clipboard.writeText(json);
			diffExportBtn.textContent = t("preset.exported");
			setTimeout(() => {
				diffExportBtn.textContent = t("preset.exportDiff");
			}, 2000);
		} catch (_e) {
			/* clipboard not available */
		}
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
					new (asObsidianWindow()).Notice(lines.join("\n"), 5000);
				}
				modal.remove();
				cb.invalidateData();
				// Restore preset zoom level if specified
				if (panel.presetZoomLevel > 0) {
					setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500);
				}
				cb.rebuildPanel();
			} catch (_e) {
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
function _buildNodesTab(tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks): void {
	const entries = cb.getNodeTreeData();
	const hoveredId = cb.getHoveredNodeId();
	const excludeSet = new Set(panel.excludeNodes ?? []);

	// Derive forward/backlinks for hovered node
	const fwdLinks = hoveredId ? new Set(cb.getForwardLinks(hoveredId)) : new Set<string>();
	const bkLinks = hoveredId ? new Set(cb.getBacklinks(hoveredId)) : new Set<string>();

	// Build directory tree structure
	interface DirNode {
		children: Map<string, DirNode>;
		files: NodeTreeEntry[];
	}
	const root: DirNode = { children: new Map(), files: [] };
	for (const entry of entries) {
		const parts = entry.path.split("/");
		parts.pop();
		let cur = root;
		for (const dir of parts) {
			if (!cur.children.has(dir)) cur.children.set(dir, { children: new Map(), files: [] });
			cur = cur.children.get(dir)!;
		}
		cur.files.push(entry);
	}

	// EP: Stats summary bar
	const visibleCount = entries.filter((e) => e.isVisible).length;
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
	filterInput.style.cssText =
		"flex:1;padding:4px 6px;font-size:11px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);";
	const sortSelect = filterWrap.createEl("select", { cls: "gi-node-sort" });
	sortSelect.style.cssText =
		"font-size:10px;padding:2px;border-radius:3px;background:var(--background-primary);border:1px solid var(--background-modifier-border);";
	// GL: Added "Degree" sort option for importance ranking
	for (const [val, label] of [
		["name", "A-Z"],
		["path", "Path"],
		["visible", "Visible"],
		["degree", "Degree"],
	]) {
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
			const allExcluded = dirIds.length > 0 && dirIds.every((id) => excludeSet.has(id));
			const dirCb = header.createEl("input", { type: "checkbox" });
			dirCb.checked = !allExcluded;
			dirCb.style.cssText = "width:11px;height:11px;margin:0;cursor:pointer;";
			dirCb.addEventListener("click", (e) => {
				e.stopPropagation();
				const ids = collectDirIds(child);
				if (dirCb.checked) {
					// Show all: remove from excludeNodes
					panel.excludeNodes = (panel.excludeNodes ?? []).filter((id) => !ids.includes(id));
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
				if (open) delete states[dirPath];
				else states[dirPath] = true;
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
				menu.addItem((item) =>
					item
						.setTitle("Jump to Node")
						.setIcon("locate")
						.onClick(() => cb.jumpToNode(entry.id)),
				);
				menu.addItem((item) =>
					item
						.setTitle(excludeSet.has(entry.id) ? "Show" : "Hide")
						.setIcon("eye-off")
						.onClick(() => cb.toggleNodeVisibility(entry.id)),
				);
				const isBm = (panel.bookmarkedNodes ?? []).includes(entry.id);
				menu.addItem((item) =>
					item
						.setTitle(isBm ? "Remove Bookmark" : "Bookmark")
						.setIcon("bookmark")
						.onClick(() => {
							if (isBm) panel.bookmarkedNodes = panel.bookmarkedNodes.filter((id) => id !== entry.id);
							else {
								if (!panel.bookmarkedNodes) panel.bookmarkedNodes = [];
								panel.bookmarkedNodes.push(entry.id);
							}
							cb.invalidateDataKeepPanel();
						}),
				);
				menu.addItem((item) =>
					item
						.setTitle("Open File")
						.setIcon("file-text")
						.onClick(() => {
							const file = asObsidianWindow().app?.vault?.getAbstractFileByPath(entry.id);
							if (file) asObsidianWindow().app?.workspace?.getLeaf(false)?.openFile(file as import("obsidian").TFile);
						}),
				);
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
		const ids: string[] = dir.files.map((f) => f.id);
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
	legend.style.cssText =
		"padding:4px 8px;font-size:10px;color:var(--text-muted);display:flex;gap:8px;flex-wrap:wrap;";
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
	const exportBtn = legend.createEl("button", { text: t("export.csvBtn"), cls: "gi-node-export-btn" });
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

function buildSettingsTab(settingsTab: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks): void {
	buildSamplePresetSelector(settingsTab, panel, ctx, cb);
	buildOntologySection(settingsTab, panel, ctx, cb);
	buildTagRelationsSection(settingsTab, panel, ctx, cb);
	_buildSettingsActionButtons(settingsTab, panel, ctx, cb);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const SECTION_STATE_KEY = "graph-island-section-state";
let _sectionIdCounter = 0;
function loadSectionStates(): Record<string, boolean> {
	try {
		return JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || "{}");
	} catch (_e) {
		return {};
	}
}
function saveSectionState(title: string, collapsed: boolean) {
	const states = loadSectionStates();
	states[title] = collapsed;
	localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(states));
}

// EW: Node directory folder collapse state persistence
const NODE_DIR_STATE_KEY = "graph-island-node-dir-state";
export function _getNodeDirStates(): Record<string, boolean> {
	try {
		return JSON.parse(localStorage.getItem(NODE_DIR_STATE_KEY) || "{}");
	} catch (_e) {
		return {};
	}
}
export function _saveNodeDirStates(states: Record<string, boolean>) {
	localStorage.setItem(NODE_DIR_STATE_KEY, JSON.stringify(states));
}

// ---------------------------------------------------------------------------
// P2: Progressive disclosure — Advanced settings group
// ---------------------------------------------------------------------------
export function addAdvancedGroup(parent: HTMLElement, callback: (container: HTMLElement) => void): void {
	const details = parent.createEl("details", { cls: "gi-advanced-group" });
	details.createEl("summary", { cls: "gi-advanced-summary", text: t("panel.advanced") });
	const inner = details.createDiv({ cls: "gi-advanced-inner" });
	callback(inner);
}

export function buildSection(
	container: HTMLElement,
	title: string,
	build: (body: HTMLElement) => void,
	helpText?: string,
	collapsed = false,
	icon?: string,
) {
	const section = container.createDiv({ cls: "graph-control-section tree-item" });
	const saved = loadSectionStates();
	const isCollapsed = title in saved ? saved[title] : collapsed;
	if (isCollapsed) section.addClass("is-collapsed");
	const header = section.createDiv({
		cls: "tree-item-self graph-control-section-header is-clickable",
		attr: { role: "button", "aria-expanded": String(!isCollapsed), tabindex: "0" },
	});
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
		const helpBtn = header.createEl("span", {
			cls: "clickable-icon gi-section-help",
			attr: { "aria-label": t("help.ariaLabel") },
		});
		helpBtn.addClass("gi-help-btn");
		setIcon(helpBtn, "help-circle");
		helpBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const existing = section.querySelector(".gi-help-popup");
			if (existing) {
				existing.remove();
				return;
			}
			const popup = section.createDiv({
				cls: "gi-help-popup",
				attr: { role: "tooltip", "aria-label": t("help.ariaLabel") },
			});
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
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			header.click();
		}
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
	{ id: "filter", labelKey: "tab.filter", icon: "filter" },
	{ id: "display", labelKey: "tab.display", icon: "eye" },
	{ id: "layout", labelKey: "tab.layout", icon: "layout-grid" },
	{ id: "nodes", labelKey: "tab.nodes", icon: "list-tree" },
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
			bar.querySelectorAll(".gi-tab-btn").forEach((b) => b.removeClass("is-active"));
			btn.addClass("is-active");
			for (const [id, el] of tabContainers) {
				el.toggleClass("is-active", id === def.id);
			}
			onSwitch(def.id);
		});
	}
	// Show badge with total changed field count
	if (changedCount > 0) {
		const badge = bar.createEl("span", {
			cls: "gi-diff-badge",
			text: String(changedCount),
			attr: { title: `${changedCount} settings changed from defaults` },
		});
		badge.style.cssText =
			"font-size:10px;background:var(--interactive-accent);color:var(--text-on-accent);border-radius:8px;padding:1px 5px;margin-left:4px;vertical-align:top;";
	}
}

// ---------------------------------------------------------------------------
// Statistics dashboard bar (Feature M)
// ---------------------------------------------------------------------------
function _buildStatsBar(container: HTMLElement, panel: PanelState, ctx: PanelContext): void {
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
	const copyBtn = summary.createEl("span", {
		cls: "gi-stats-copy clickable-icon",
		attr: { title: t("stats.copyMarkdown") },
	});
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
		} catch (_e) {
			/* clipboard not available */
		}
	});
}
// ---------------------------------------------------------------------------
// Axis source string ↔ AxisSource conversion (extracted to utils/axis-source.ts)
// ---------------------------------------------------------------------------
export { parseAxisSourceString, axisSourceToString } from "../utils/axis-source";
