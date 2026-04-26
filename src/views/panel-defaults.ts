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

/** Identity helper: gives `Partial<PanelState>` as contextual type to the
 *  argument literal, so each property's type is inferred from PanelState
 *  via the generic constraint. Lets us drop `[] as PanelState["xxx"]`,
 *  `"x" as SomeUnion`, and `as const` casts on initialization values. */
function panelDefaults<T extends Partial<PanelState>>(obj: T): T {
	return obj;
}

/** Filter-related defaults: search, degree bounds, subgraph scoping,
 *  timeline range, local graph, saved queries, and data inclusion flags. */
export const DEFAULT_FILTER_STATE = () =>
	panelDefaults({
		excludeNodes: [],
		autoFitOnFilter: false,
		minDegreeFilter: 0,
		maxDegreeFilter: 0,
		includeTagsInData: true,
		showAttachments: false,
		existingOnly: false,
		showOrphans: true,
		searchQuery: "",
		searchMode: "filter",
		commonQueries: [],
		dataviewQuery: "",
		groupFilter: "",
		timelineRangeMin: 0,
		timelineRangeMax: 1,
		localGraphCenter: null,
		localGraphHops: 2,
		edgeDirectionFilter: "all",
		searchHistory: [],
		orphanClusterField: "",
		highlightMissingNeighbors: false,
		savedSearchQueries: [],
		multiSelectNodeIds: [],
		subgraphNodeIds: [],
		subgraphStack: [],
		expandedNodes: [],
	});

/** Display-related defaults: colors, shapes, edge visibility,
 *  hover behavior, labels, cards, grids, overlays, and thresholds. */
export const DEFAULT_DISPLAY_STATE = () =>
	panelDefaults({
		textFadeThreshold: 0.5,
		nodeSize: 20,
		showArrows: false,
		colorEdgesByRelation: true,
		nodeColorMode: "category",
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
			{ match: "isTag", shape: "triangle" },
			{ match: "default", shape: "circle" },
		],
		showEdgeLabels: false,
		edgeLabelPlacement: "center",
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
		gridStyle: "lines",
		gridLabelPlacement: "on-line",
		nodeDisplayMode: "node",
		cardDisplayConfig: { fields: [], maxWidth: 120, showIcon: false },
		donutDisplayConfig: { innerRadius: 0.6 },
		edgeCardinalityMode: "none",
		cardinalityRules: [],
		cableBundleMode: "auto",
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
		importanceMetric: "degree",
		showRecencyMarker: false,
		recencyDays: 7,
		definitionField: "",
		clusterLabelDetail: "standard",
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
		nodeIconMap: {},
		focusConeEnabled: true,
		analysisOverlay: "off",
		showOntologyBackbone: false,
	});

/** Layout-related defaults: forces, arrangement, clustering, groups,
 *  pinned positions, and view-mode-bound sort rules. */
export const DEFAULT_LAYOUT_STATE = () =>
	panelDefaults({
		viewMode: "graph",
		matrixSortMode: "degree",
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
		clusterArrangement: "inherit",
		clusterGroupArrangement: "auto",
		clusterNodeSpacing: 3.0,
		clusterGroupScale: 3.0,
		clusterGroupSpacing: 2.0,
		clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		clusterFollowsGroupBy: true,
		coordinateLayout: null,
		sortRules: [{ key: "degree", order: "desc" }],
		nodeRules: [],
		groups: [],
		groupBy: "none",
		groupByRules: null,
		groupMinSize: 2,
		collapsedGroups: new Set<string>(),
		pinnedPositions: {},
		focusLayout: false,
		autoFit: false,
	});

/** Toolbar / UI chrome state: active tab, navigation history, saved
 *  viewports, editor sync, annotations, bookmarks, focus & presentation. */
export const DEFAULT_TOOLBAR_STATE = () =>
	panelDefaults({
		activeTab: "filter",
		savedViewports: [],
		presetZoomLevel: 0,
		zoomSensitivity: 1.0,
		navHistory: [],
		navHistoryCursor: -1,
		syncWithEditor: true,
		syncViewId: null,
		annotations: [],
		bookmarkedNodes: [],
		presentationMode: false,
		focusMode: false,
		focusNodeId: null,
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
