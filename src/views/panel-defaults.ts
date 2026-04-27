/**
 * panel-defaults.ts
 *
 * Pure default-value factories for PanelState, extracted from
 * PanelBuilder.createDefaultPanel() to reduce god-object line count.
 *
 * Each DEFAULT_*_STATE is a factory function (not a shared constant) so
 * every call produces fresh instances of arrays, sets, and objects.
 * This preserves the invariant noted in PanelBuilder: spreading a shared
 * default would leak mutations back into "defaults".
 *
 * No side effects. No Obsidian API dependencies.
 */
import { TAG_DISPLAY_ENCLOSURE } from "../constants";
import type { PanelState } from "./PanelBuilder";

// Typed empty-container factories. The return-type annotation supplies
// contextual typing so the inline `{}` literal is inferred as the matching
// PanelState property type rather than the loose top `{}` shape (which is
// not assignable to `Record<…>` under strict mode without an `as` cast).
const createEmptyNodeIconMap = (): PanelState["nodeIconMap"] => ({});
const createEmptyPinnedPositions = (): PanelState["pinnedPositions"] => ({});

/** Filter-related defaults: search, degree bounds, subgraph scoping,
 *  timeline range, local graph, saved queries, and data inclusion flags. */
export const DEFAULT_FILTER_STATE = () => ({
	excludeNodes: [] as string[],
	autoFitOnFilter: false,
	minDegreeFilter: 0,
	maxDegreeFilter: 0,
	includeTagsInData: true,
	showAttachments: false,
	existingOnly: false,
	showOrphans: true,
	searchQuery: "",
	searchMode: "filter" as const,
	commonQueries: [] as { query: string; recursive: boolean }[],
	dataviewQuery: "",
	groupFilter: "",
	timelineRangeMin: 0,
	timelineRangeMax: 1,
	localGraphCenter: null as string | null,
	localGraphHops: 2,
	edgeDirectionFilter: "all" as const,
	searchHistory: [] as string[],
	orphanClusterField: "",
	highlightMissingNeighbors: false,
	savedSearchQueries: [] as { name: string; query: string }[],
	multiSelectNodeIds: [] as string[],
	subgraphNodeIds: [] as string[],
	subgraphStack: [],
	expandedNodes: [] as string[],
});

/** Display-related defaults: colors, shapes, edge visibility,
 *  hover behavior, labels, cards, grids, overlays, and thresholds. */
export const DEFAULT_DISPLAY_STATE = () => ({
	textFadeThreshold: 0.5,
	nodeSize: 20,
	showArrows: false,
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
	fadeEdgesByDegree: false,
	edgeBundleStrength: 0.65,
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
	nodeShapeRules: [
		{ match: "isTag" as const, shape: "triangle" as const },
		{ match: "default" as const, shape: "circle" as const },
	],
	showEdgeLabels: false,
	edgeLabelPlacement: "center" as const,
	showMinimap: true,
	showDotGrid: true,
	showDurationBars: true,
	showTimelineRoutes: true,
	timelineKey: "date",
	timelineEndKey: "end-date",
	timelineOrderFields: "",
	ringChartMode: false,
	gridShowHeaders: false,
	showAxisTitles: true,
	showTimelineTickLabels: true,
	gridCellShading: false,
	gridStyle: "lines" as const,
	gridLabelPlacement: "on-line" as const,
	nodeDisplayMode: "node" as const,
	cardDisplayConfig: { fields: [] as string[], maxWidth: 120, showIcon: false },
	donutDisplayConfig: { innerRadius: 0.6 },
	edgeCardinalityMode: "none" as const,
	cardinalityRules: [],
	cableBundleMode: "auto" as const,
	cableTrunkWidth: 12,
	cableTrunkAlpha: 0.25,
	cableSpacing: 14,
	cableFanWidth: 2.5,
	cableFanAlpha: 0.9,
	edgeWeightThickness: true,
	edgeLayerMode: false,
	showPathfinderOverlay: true,
	showLegend: true,
	showOutOfBoundsIndicator: false,
	showGraphStats: false,
	showAncestryBreadcrumb: false,
	nodeSubLabelFields: "",
	hoverTooltipFields: "",
	hoverShowTitle: true,
	hoverShowMeta: true,
	hoverShowBody: false,
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
	showHierarchyBreadcrumb: false,
	showSimilarSuggestions: false,
	showStructureQuestions: false,
	showEntropyOverlay: false,
	showClusterCompare: false,
	showRelationMatrix: false,
	showNodeThumbnails: false,
	nodeIconField: "",
	nodeIconMap: createEmptyNodeIconMap(),
	focusConeEnabled: true,
	analysisOverlay: "off" as const,
	showOntologyBackbone: false,
});

/** Layout-related defaults: forces, arrangement, clustering, groups,
 *  pinned positions, and view-mode-bound sort rules. */
export const DEFAULT_LAYOUT_STATE = () => ({
	viewMode: "graph" as const,
	matrixSortMode: "degree" as const,
	centerForce: 0.03,
	repelForce: 500,
	linkForce: 0.01,
	linkDistance: 150,
	concentricMinRadius: 50,
	concentricRadiusStep: 60,
	showOrbitRings: true,
	orbitAutoRotate: true,
	enclosureSpacing: 1.5,
	directionalGravityRules: [],
	clusterGroupRules: [],
	clusterArrangement: "inherit" as const,
	clusterGroupArrangement: "auto" as const,
	clusterNodeSpacing: 3.0,
	clusterGroupScale: 3.0,
	clusterGroupSpacing: 2.0,
	clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
	clusterFollowsGroupBy: true,
	coordinateLayout: null,
	sortRules: [{ key: "degree" as const, order: "desc" as const }],
	nodeRules: [],
	groups: [],
	groupBy: "none",
	groupByRules: null,
	groupMinSize: 2,
	collapsedGroups: new Set<string>(),
	pinnedPositions: createEmptyPinnedPositions(),
	focusLayout: false,
	autoFit: false,
});

/** Toolbar / UI chrome state: active tab, navigation history, saved
 *  viewports, editor sync, annotations, bookmarks, focus & presentation. */
export const DEFAULT_TOOLBAR_STATE = () => ({
	activeTab: "filter" as const,
	savedViewports: [],
	presetZoomLevel: 0,
	zoomSensitivity: 1.0,
	navHistory: [] as string[],
	navHistoryCursor: -1,
	syncWithEditor: true,
	syncViewId: null as string | null,
	annotations: [],
	bookmarkedNodes: [] as string[],
	presentationMode: false,
	focusMode: false,
	focusNodeId: null as string | null,
});

/** Build a fresh PanelState by spreading all four default buckets.
 *  Equivalent to PanelBuilder.createDefaultPanel() — every invocation
 *  returns a new object graph with no shared mutable references. */
export function createDefaultPanelState(): PanelState {
	return {
		...DEFAULT_FILTER_STATE(),
		...DEFAULT_DISPLAY_STATE(),
		...DEFAULT_LAYOUT_STATE(),
		...DEFAULT_TOOLBAR_STATE(),
	};
}
