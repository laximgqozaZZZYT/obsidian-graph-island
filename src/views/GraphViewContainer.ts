import {
	ItemView,
	WorkspaceLeaf,
	Platform,
	TFile,
	FileView,
	setIcon,
	MarkdownView,
	Notice,
	type ViewStateResult,
} from "obsidian";
import { CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { IApp } from "./canvas2d/interfaces";
import { createApp } from "./renderer-factory";
import type { Simulation } from "d3-force";
import type GraphViewsPlugin from "../main";
import type {
	GraphData,
	GraphNode,
	GraphEdge,
	LayoutType,
	ViewMode,
	ShellInfo,
	DirectionalGravityRule,
	GroupPreset,
	ClusterGroupRule,
	ClusterArrangement,
	GraphTemplate,
} from "../types";
import { DEFAULT_COLORS, DEFAULT_CARD_RENDER_CONFIG, DEFAULT_ONTOLOGY, mergeRenderThresholds } from "../types";
import { evaluateExpr, parseQueryExpr, serializeExpr } from "../utils/query-expr";
import {
	buildGraphFromVault,
	assignNodeColors,
	buildRelationColorMap,
	applyMonochromeFallback,
} from "../parsers/metadata-parser";
import { repositionShell } from "../layouts/concentric";
import { type SunburstArc as LayoutSunburstArc } from "../layouts/sunburst";
import {
	computeNodeDegrees,
	computeBetweennessCentrality,
	detectArticulationPoints,
	type SimilarNode,
} from "../analysis/graph-analysis";
import type { RoadNetwork } from "../layouts/cable-tray";
import { RoadNetworkBuilder, getBestRoadNetwork, type RoadNetworkHost } from "../layouts/RoadNetworkBuilder";
import { downloadFile } from "./ExportManager";
import {
	yieldFrame,
	buildAdj,
	buildAdjFiltered,
	cssColorToHex,
	edgeSourceId,
	edgeTargetId,
	bfsNeighborSet,
	collectSubgraph,
	exportSubgraphJSON,
	exportFullGraphJSON,
	exportGraphCSV,
	exportGraphMermaid,
	incCounter,
	computeGaps,
	hitTestTimelineBars,
	computeNodeBBox,
	buildTagMembership,
	buildMissingNeighborSet,
	parseGroupByFields,
	computeAutoFitTransform,
	computeVisibleFraction,
	computeCompareVenn,
	computePathfinderResult,
	buildSimEndA11yMessage,
	resolveViewportSize,
} from "../utils/graph-helpers";
import { pushToMapArray, addToMapSet } from "../utils/map-helpers";
import {
	applyVisibilityFilters,
	filterByDegree,
	filterExcludedNodes,
	filterEdgesByNodeSet,
	filterBySubgraph,
	filterByLocalGraph,
} from "../utils/graph-filter";
import { pointInPolygon, hitTestAggregateRegions, computeGroupMemberBounds } from "../utils/geometry";
import type { AggregateHitRegion } from "../utils/geometry";
import {
	AGGREGATE_ZOOM_THRESHOLD,
	collectGroupCentroids,
	drawClusterBoundaries,
	computeGroupLabelPlacements,
	applyGroupLabelPlacements,
	computeAggregateGroups,
	drawAggregateGroups,
	computeGroupLabelAlpha,
	type GroupNodeInfo,
	type GroupCentroid,
} from "./group-label-manager";
import { expandSuperNodeIds } from "../utils/node-grouping";
import { hexToRgb } from "../utils/color";
import { computeNodeDisplayColor } from "./node-coloring";
import {
	buildPanel as buildPanelUI,
	type PanelState,
	type PanelCallbacks,
	type PanelContext,
	DEFAULT_PANEL,
	createDefaultPanel,
	validatePanelState,
	ensureRT,
} from "./PanelBuilder";
import {
	drawEdges as drawEdgesImpl,
	drawEdgeLabels as drawEdgeLabelsImpl,
	invalidateBundleCache,
	EdgeRenderCache,
	type EdgeDrawConfig,
} from "./EdgeRenderer";
import { t } from "../i18n";
import { showToast } from "../utils/toast";
import { drawEnclosures as drawEnclosuresImpl, type OverlapCache, type EnclosureConfig } from "./EnclosureRenderer";
import type { ClusterMetadata, TimelineRoute } from "../layouts/cluster-force";
import { analyzeOverlap, computeAutoOptimize, effectiveRadius, nodeRadius } from "../layouts/cluster-force";
import { matchesFilter } from "../layouts/force";
import { InteractionManager, type PixiNode, type InteractionHost } from "./InteractionManager";
import { RenderPipeline, MIN_WORLD_RADIUS_PX, type RenderHost } from "./RenderPipeline";
import { LayoutController, type LayoutHost } from "./LayoutController";
import { LabelManager } from "./LabelManager";
import { Minimap, type MinimapHost } from "./Minimap";
import { DiffOverlay } from "./DiffOverlay";
import { captureSnapshot } from "../utils/snapshot";
import { GuideRenderer, type GuideRendererHost } from "./GuideRenderer";
import { LayoutTransition } from "./LayoutTransition";
import { renderGraphStats, renderBreadcrumb, renderRelationMatrix } from "./StatsRenderer";
import { buildPanelCallbacks, type PanelCallbackHost } from "./panel-callbacks";
import { renderLegend, type LegendHost, type LegendPanel } from "./LegendRenderer";
import { renderTimelineBars } from "./timeline-bar-renderer";
import { asInternalWorkspace, type ObsidianVaultInternal } from "../obsidian-internals";
import { generatePhantomNodes } from "./phantom-node-generator";
import { adjustTooltipPosition, type PanelRect } from "../utils/tooltip-position";
import { handleShortcutKey, type KeyboardHost } from "./KeyboardHandler";
import {
	groupNodesByField,
	collapseGroup,
	type GroupSpec,
	type GroupOptions,
} from "../utils/node-grouping";
import { louvainCommunities } from "../utils/louvain";
import { queryDataviewPages, filterNodesByDataview } from "../utils/dataview-source";
import { addFrontmatterTag, setFrontmatterField } from "../utils/frontmatter-helper";
import { getNodeShape, drawShape } from "../utils/node-shapes";
import {
	LAYOUT_FORCE,
	LAYOUT_CONCENTRIC,
	LAYOUT_TREE,
	LAYOUT_ARC,
	LAYOUT_SUNBURST,
	LAYOUT_TIMELINE,
	TAG_DISPLAY_ENCLOSURE,
	ARRANGEMENT_TIMELINE,
	ARRANGEMENT_CONCENTRIC,
	ARRANGEMENT_GRID,
	EVENT_HOVER_NODE,
	EVENT_HIGHLIGHT_NODES,
	EVENT_COMPARE_NODES,
	EVENT_SYNC_PANEL,
} from "../constants";
import {
	viewModeToLayout,
	viewModeSkipsNodeRendering,
	viewModeSkipsEdges,
	viewModeUsesDom,
} from "../utils/view-mode-map";
import {
	buildSunburstTooltipContent,
	drawSunburstLayoutArcs as drawSunburstLayoutArcsImpl,
	drawSunburstLabels as drawSunburstLabelsImpl,
	clearSunburstLabels as clearSunburstLabelsImpl,
} from "./sunburst-renderer";
import { renderMatrixViewMode as renderMatrixViewModeImpl, type MatrixSortMode } from "./matrix-renderer";
import { computeStaticLayout, type StaticLayoutResult } from "./layout-compute";
import {
	labelModeChar,
	buildLabelInfo,
	modeDescription,
	buildZoomTooltip,
	parseCulledCount,
	buildZoomA11yMessage,
} from "./zoom-indicator";
import {
	createDefaultEdgeDrawConfig,
	computeEffectiveHighlight,
	computeMaxDegree,
	resolveCableClusters,
	populateEdgeDrawConfig,
} from "./edge-draw-config";
import {
	buildHoverTooltipText,
	groupOffScreenNeighbors,
	computeTooltipEdgePosition,
	findSharedTagNodes,
	findSameFolderNodes,
	resolveInheritArrangement,
	clearNonGraphLayers,
	computeCardBBox,
	buildTransitionData,
	computeTimelineFit,
} from "./hover-helpers";

// ---------------------------------------------------------------------------
// File-local constants — no hardcoded magic numbers in method bodies
// ---------------------------------------------------------------------------

// ---- Timing (ms) ----
const SAVE_DEBOUNCE_MS = 500;
const ONBOARDING_HELP_DELAY_MS = 500;
const ONBOARDING_HINT_DELAY_MS = 3000;
const HOVER_PREVIEW_DELAY_MS = 800;
const AUTOFIT_DELAY_MS = 600;
const ANIMATE_TO_NODE_MS = 500;
const FADE_ALPHA_MS = 300;
const SEARCH_PULSE_MS = 300;

// ---- Toast / Notice durations (ms) ----
const TOAST_SHORT_MS = 2000;
const TOAST_MEDIUM_MS = 3000;
const TOAST_LONG_MS = 5000;

// ---- Cache TTL (ms) ----
const FM_KEYS_CACHE_TTL_MS = 5000;

// ---- Thresholds ----
const EXTREME_ZOOM_THRESHOLD = 0.15;
const MOBILE_NODE_CAP = 200;
const LARGE_GRAPH_LOCAL_THRESHOLD = 500;
const TRANSITION_SKIP_THRESHOLD = 500;
// ---- Rendering constants ----
const BLEND_LABEL_FACTOR = 0.15;
const GOLDEN_RATIO_FALLBACK = 1.618;
const BODY_PREVIEW_MAX_CHARS = 200;
const COLLISION_RATE_OK = 0.05;
const DIMMED_NODE_ALPHA = 0.12;
const SEARCH_HALO_STROKE_WIDTH = 2;
const SEARCH_HALO_STROKE_ALPHA = 0.85;
const HOVER_TOOLTIP_BG_ALPHA = 0.92;
const SEARCH_PULSE_SCALE = 1.3;
const ALPHA_EPSILON = 0.01;
const ARC_ANGLE_EPSILON = 0.001;
const HEATMAP_MIN_VALUE = 0.05;
const ZOOM_TO_LABEL_RECT = 400;

// ---- Sunburst fill alpha (ring chart mode) ----
const RING_FILL_ALPHA_FLOOR = 0.3;
const RING_FILL_ALPHA_BASE = 0.7;
const RING_FILL_ALPHA_DEPTH_DECAY = 0.08;

// ---- Pathfinder overlay ----
const PATHFINDER_COLOR = 0x00ced1;
const PATHFINDER_COLOR_CSS = "#00CED1";
const PATHFINDER_PULSE_SPEED = 0.06;
const PATHFINDER_PULSE_AMPLITUDE = 0.1;
const PATHFINDER_GLOW_ALPHA_BASE = 0.45;
const PATHFINDER_SOLID_ALPHA_BASE = 0.85;
const PATHFINDER_GLOW_STROKE_WIDTH = 8;
const PATHFINDER_SOLID_STROKE_WIDTH = 3;
const PATHFINDER_DOT_RADIUS = 5;
const PATHFINDER_LABEL_FONT_SIZE = 11;
const PATHFINDER_LABEL_OFFSET_X = 6;
const PATHFINDER_LABEL_OFFSET_Y = -14;

// ---- Link preview ----
const LINK_PREVIEW_COLOR = 0x00cccc;
const LINK_PREVIEW_DASH = [8, 6];
const LINK_PREVIEW_LINE_WIDTH = 2;
const LINK_PREVIEW_LINE_ALPHA = 0.9;
const LINK_PREVIEW_SNAP_LINE_WIDTH = 1.5;
const LINK_PREVIEW_SNAP_ALPHA = 0.7;
const LINK_PREVIEW_SNAP_RADIUS = 8;

// ---- Sunburst fill alpha (normal mode) ----
const SUNBURST_FILL_ALPHA_FLOOR = 0.02;
const SUNBURST_FILL_ALPHA_BASE = 0.1;
const SUNBURST_FILL_ALPHA_DEPTH_DECAY = 0.015;
const SUNBURST_STROKE_ALPHA_FLOOR = 0.15;
const SUNBURST_STROKE_ALPHA_BASE = 0.4;
const SUNBURST_STROKE_ALPHA_DEPTH_DECAY = 0.05;

// ---------------------------------------------------------------------------
// StatsHost — interface for future StatsRenderer extraction (Phase 0)
// Defines the minimal GVC surface that updateGraphStats/updateLegend require.
// Phase 1 will create StatsRenderer class consuming this interface.
// ---------------------------------------------------------------------------
export interface StatsHost {
	/** Node degree map (id → degree count) */
	getDegrees(): Map<string, number>;
	/** Get display label for a node ID */
	getNodeLabel(id: string): string;
	/** Label overlap culling statistics */
	getLabelCullStats(): { totalLabels: number; visibleLabels: number; culledLabels: number; collisionRate: number };
	/** Label quality score (collision + visibility + priority) */
	getLabelQualityScore(): { score: number; collision: number; visibility: number; priority: number };
	/** Current FPS from render pipeline (0 = idle) */
	getCurrentFps(): number;
	/** Pan camera to center on a node */
	panToNode(id: string): void;
	/** Set hovered/highlighted node */
	setHighlightedNodeId(id: string | null): void;
	/** Apply hover highlight visuals */
	applyHover(): void;
	/** Invalidate graph data and rebuild panel (for degree filter clicks) */
	invalidateAndRebuild(): void;
	/** A11y announcement via aria-live */
	announceA11y(msg: string): void;
	/** Betweenness centrality cache (may be undefined) */
	getBetweennessCache(): Map<string, number> | undefined;
	/** Node spatial overlap ratio (0-1, sampled from current positions) */
	getNodeOverlapRatio(): number;
	/** Last render frame time in ms (0 = not measured) */
	getLastRenderTime(): number;
}

/**
 * Derive a single ClusterGroupRule from a query string + recursive flag.
 * Supports wildcard patterns like "tag:*" → groupBy: "tag".
 */
export function deriveOneRule(queryText: string, recursive: boolean): ClusterGroupRule | null {
	if (!queryText.trim()) return null;
	const expr = parseQueryExpr(queryText.trim());
	if (!expr) return null;
	if (expr.type === "leaf" && expr.value === "*") {
		// Use field:? format (e.g. "tag:?", "category:?")
		return { groupBy: `${expr.field}:?`, recursive };
	}
	return { groupBy: `${expr.type === "leaf" ? expr.field : "tag"}:?`, recursive };
}

/** Derive ClusterGroupRule[] from multiple common queries (pipeline). */
export function deriveClusterRulesFromQueries(queries: { query: string; recursive: boolean }[]): ClusterGroupRule[] {
	const rules: ClusterGroupRule[] = [];
	for (const q of queries) {
		const rule = deriveOneRule(q.query, q.recursive);
		if (rule) rules.push(rule);
	}
	return rules;
}

export function deriveClusterRules(preset: GroupPreset): ClusterGroupRule[] {
	if (preset.commonQueries?.length) {
		return deriveClusterRulesFromQueries(preset.commonQueries);
	}
	// Legacy: single commonQuery field
	const cq = preset.commonQuery;
	if (!cq?.expression) return [];
	const queryText = serializeExpr(cq.expression);
	const rule = deriveOneRule(queryText, preset.recursive ?? false);
	return rule ? [rule] : [];
}

/** Blend bg toward nodeColor at 15% — used for label tinting. */
export function blendThemeLabel(bg: number, nodeColor: number): number {
	const r1 = (bg >> 16) & 0xff,
		g1 = (bg >> 8) & 0xff,
		b1 = bg & 0xff;
	const r2 = (nodeColor >> 16) & 0xff,
		g2 = (nodeColor >> 8) & 0xff,
		b2 = nodeColor & 0xff;
	return (
		(Math.round(r1 + (r2 - r1) * BLEND_LABEL_FACTOR) << 16) |
		(Math.round(g1 + (g2 - g1) * BLEND_LABEL_FACTOR) << 8) |
		Math.round(b1 + (b2 - b1) * BLEND_LABEL_FACTOR)
	);
}

/** Lighten a hex color by a factor (0-1). factor=0.2 means 20% lighter. */
/** Clean sunburst arc name: strip redundant path prefix (e.g. "bible-apocrypha/bible-apocrypha" → "bible-apocrypha") */
export function cleanArcName(name: string): string {
	if (!name.includes("/")) return name;
	const segments = name.split("/");
	if (segments.length >= 2 && segments[segments.length - 1] === segments[segments.length - 2]) {
		return segments[segments.length - 1];
	}
	return segments[segments.length - 1] || name;
}

/** Check if saved positions are within a reasonable coordinate range for force layout reuse. */
export function areSavedPositionsValid(
	positions: Map<string, { x: number; y: number }>,
	canvasW: number,
	canvasH: number,
): boolean {
	if (positions.size === 0) return false;
	const maxCoord = Math.max(canvasW, canvasH) * 5;
	for (const p of positions.values()) {
		if (!isFinite(p.x) || !isFinite(p.y) || Math.abs(p.x) > maxCoord || Math.abs(p.y) > maxCoord) {
			return false;
		}
	}
	return true;
}

export function lightenHex(hex: number, factor: number): number {
	const { r, g, b } = hexToRgb(hex);
	const lr = Math.min(255, r + Math.round(255 * factor));
	const lg = Math.min(255, g + Math.round(255 * factor));
	const lb = Math.min(255, b + Math.round(255 * factor));
	return (lr << 16) | (lg << 8) | lb;
}

/**
 * Heatmap color ramp: cold (blue 0x3b82f6) → warm (red 0xef4444).
 * @param degree - node degree
 * @param maxDegree - maximum degree in the graph (for normalization)
 */
export function heatmapColor(degree: number, maxDegree: number): number {
	const t = Math.min(1, degree / Math.max(1, maxDegree));
	const r = Math.round(59 + t * (239 - 59)); // 0x3b -> 0xef
	const g = Math.round(130 - t * (130 - 68)); // 0x82 -> 0x44
	const b = Math.round(246 - t * (246 - 68)); // 0xf6 -> 0x44
	return (r << 16) | (g << 8) | b;
}

/** 20-color deterministic palette for community coloring (Tableau 20-inspired). */
export const COMMUNITY_PALETTE: readonly number[] = [
	0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd, 0x8c564b, 0xe377c2, 0x7f7f7f, 0xbcbd22, 0x17becf, 0xaec7e8,
	0xffbb78, 0x98df8a, 0xff9896, 0xc5b0d5, 0xc49c94, 0xf7b6d2, 0xc7c7c7, 0xdbdb8d, 0x9edae5,
];

/**
 * Find the first GroupPreset whose condition matches the current layout + tagDisplay.
 * Returns the matching preset or null.
 */
export function findMatchingGroupPreset(
	presets: GroupPreset[],
	currentLayout: string,
	tagDisplay: string,
): GroupPreset | null {
	for (const preset of presets) {
		const cond = preset.condition;
		if (cond.layout && cond.layout !== currentLayout) continue;
		if (cond.tagDisplay && cond.tagDisplay !== tagDisplay) continue;
		return preset;
	}
	return null;
}

/**
 * Resolve node color from a colorMap + node data.
 * Pure lookup: category → tag fallback → default.
 */
export function resolveNodeColor(
	node: { category?: string; tags?: string[] },
	colorMap: Map<string, string>,
	defaultColor: string,
): string {
	if (node.category) {
		const css = colorMap.get(node.category);
		if (css) return css;
	}
	if (node.tags && node.tags.length > 0) {
		const tagKey = `tag:${node.tags[0]}`;
		const css = colorMap.get(tagKey);
		if (css) return css;
	}
	return defaultColor;
}

export const VIEW_TYPE_GRAPH = "graph-view";

/** Fallback canvas dimensions when DOM element is not yet measured */
const DEFAULT_CANVAS_WIDTH = 600;
const DEFAULT_CANVAS_HEIGHT = 400;

/** All preset definitions — single source of truth for applyPreset, applyPresetByKey, getPresetSummary */
const ALL_PRESETS: Record<string, Record<string, unknown>> = {
	// Quick presets
	simple: {
		showLinks: true,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		showInheritance: false,
		showAggregation: false,
		showSimilar: false,
		showSibling: false,
		showSequence: false,
		colorEdgesByRelation: false,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		showEdgeLabels: false,
		showArrows: false,
	},
	analysis: {
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: true,
		showSemanticEdges: true,
		showInheritance: true,
		showAggregation: true,
		showSimilar: true,
		showSibling: true,
		showSequence: true,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		nodeColorMode: "category",
		showEdgeLabels: false,
		showArrows: true,
	},
	creative: {
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: false,
		showSemanticEdges: true,
		showInheritance: false,
		showAggregation: false,
		showSimilar: false,
		showSibling: false,
		showSequence: false,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		tagDisplay: "enclosure",
		showTagNodes: true,
	},
	"active-focus": {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 2,
		focusLayout: true,
		hoverHops: 1,
		showArrows: true,
		fadeEdgesByDegree: true,
	},
	"semantic-shapes": {
		nodeShapeRules: [
			{ match: "category" as const, category: "character", shape: "circle" as const },
			{ match: "category" as const, category: "place", shape: "hexagon" as const },
			{ match: "category" as const, category: "event", shape: "diamond" as const },
			{ match: "category" as const, category: "concept", shape: "triangle" as const },
			{ match: "default" as const, shape: "square" as const },
		],
	},
	"full-analysis": {
		showLinks: true,
		showTagEdges: true,
		showInheritance: true,
		showAggregation: true,
		showSimilar: true,
		showSequence: true,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		showArrows: true,
		showGraphStats: true,
		showBridgeNodes: true,
		showImportanceRing: true,
		nodeColorMode: "community",
		showEntropyOverlay: true,
		highlightMissingNeighbors: true,
	},
	// Thinking modes (M1)
	explore: {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 3,
		focusLayout: true,
		focusConeEnabled: true,
		hoverHops: 2,
		showGapEdges: true,
		showSimilarSuggestions: true,
		fadeEdgesByDegree: true,
		showArrows: false,
		nodeColorMode: "category",
	},
	analyze: {
		syncWithEditor: false,
		localGraphCenter: null,
		showGraphStats: true,
		showBridgeNodes: true,
		showEntropyOverlay: true,
		highlightMissingNeighbors: true,
		nodeColorMode: "community",
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		showArrows: true,
		showOntologyBackbone: true,
		showHierarchyTree: true,
		directionalGravityRules: [{ filter: "type:inheritance", direction: "bottom", strength: 0.08 }],
	},
	write: {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 1,
		focusLayout: true,
		presentationMode: true,
		hoverHops: 1,
		showArrows: false,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		nodeSize: 25,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		showSimilar: false,
		focusConeEnabled: true,
	},
};

// Re-export PixiNode so other modules can import from either location
export type { PixiNode } from "./InteractionManager";

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------
export class GraphViewContainer extends ItemView implements InteractionHost, RenderHost, LayoutHost {
	/* StatsHost: Phase 1 */ plugin: GraphViewsPlugin;
	private currentLayout: LayoutType;
	private rawData: GraphData | null = null;
	/** Original (pre-grouping) graph data, used for expand operations */
	private originalGraphData: GraphData | null = null;
	/** Louvain コミュニティ検出キャッシュ（rawData 変更時に無効化） */
	private louvainCache: { dataRef: GraphData; groups: GroupSpec[] } | null = null;
	/** Louvain community map キャッシュ (originalGraphData 参照で無効化) */
	private _communityMapCache: { ref: GraphData | null; map: Map<string, number> } | null = null;
	/** Betweenness centrality cache — recomputed when rawData changes */
	private _betweennessCache: Map<string, number> | null = null;
	private _betweennessCacheRef: GraphData | null = null;
	/** Articulation point cache — recomputed when rawData changes */
	private _articulationCache: Set<string> | null = null;
	private _articulationCacheRef: GraphData | null = null;
	private ac: AbortController | null = null;
	private statusEl: HTMLElement | null = null;
	private zoomIndicatorEl: HTMLElement | null = null;
	private fpsEl: HTMLElement | null = null;
	private panel: PanelState = createDefaultPanel();
	private panelEl: HTMLElement | null = null;
	private simulation: Simulation<GraphNode, GraphEdge> | null = null;
	private highlightedNodeId: string | null = null;
	/** True when the current highlight was set via keyboard (Tab), false when via mouse hover. */
	private _isKeyboardFocused = false;
	/** aria-live element for screen reader announcements (zoom, focus changes). */
	private _ariaLiveEl: HTMLElement | null = null;

	// Canvas 2D
	private pixiApp: IApp | null = null;
	private worldContainer: CanvasContainer | null = null;
	private edgeGraphics: CanvasGraphics | null = null;
	private edgeCache = new EdgeRenderCache();
	private orbitGraphics: CanvasGraphics | null = null;
	private guideGraphics: CanvasGraphics | null = null;
	private enclosureGraphics: CanvasGraphics | null = null;
	private enclosureLabelContainer: CanvasContainer | null = null;
	private sunburstGraphics: CanvasGraphics | null = null;
	private edgeLabelContainer: CanvasContainer | null = null;
	private nodeCircleBatch: CanvasGraphics | null = null;
	private arrowGraphics: CanvasGraphics | null = null;
	private routeGraphics: CanvasGraphics | null = null;
	private routeData: TimelineRoute[] | null = null;
	private roadBuilder: RoadNetworkBuilder | null = null;
	private trayGraphics: CanvasGraphics | null = null;
	private barGraphics: CanvasGraphics | null = null;
	private barLabelContainer: CanvasContainer | null = null;
	/** ビジュアルリンクエディタ: プレビュー線描画用 */
	private linkPreviewGfx: CanvasGraphics | null = null;
	/** Pathfinder overlay graphics (drawn on top of arrows) */
	private pathfinderGraphics: CanvasGraphics | null = null;
	/** Pathfinder path-length label */
	private pathfinderLabel: CanvasText | null = null;
	/** Frame counter for pathfinder pulse animation */
	private _pathfinderFrame = 0;
	private pixiNodes: Map<string, PixiNode> = new Map();
	private canvasWrap: HTMLElement | null = null;
	private graphEdges: GraphEdge[] = [];
	private degrees: Map<string, number> = new Map();
	private adj: Map<string, Set<string>> = new Map();
	/** Adjacency list filtered by hoverEdgeTypes — used exclusively for hover BFS. */
	private hoverAdj: Map<string, Set<string>> = new Map();
	/** N2: In highlight mode, stores the set of node IDs that match the search query (null = no highlight active) */
	private _searchHighlightSet: Set<string> | null = null;
	private relationColors: Map<string, string> = new Map();
	private nodeColorMap: Map<string, string> = new Map();
	/** Counter: when > 0, doRender() skips the final buildPanel() call.
	 *  Uses a counter instead of a boolean to avoid race conditions when
	 *  multiple doRenderKeepPanel() calls overlap (previous .finally()
	 *  callbacks would reset a boolean prematurely). */
	private skipPanelRebuildCount = 0;
	/** tag name → set of file node IDs that have this tag */
	private tagMembership: Map<string, Set<string>> = new Map();
	private enclosureLabels: Map<string, CanvasText> = new Map();
	/** GroupBy group labels shown at zoom-out (key → CanvasText) */
	private groupByLabels: Map<string, CanvasText> = new Map();
	/** GroupBy group member IDs (key → Set<nodeId>) for hover highlight */
	private groupByMembers: Map<string, Set<string>> = new Map();
	/** Currently hovered group label key (for highlight) */
	private _hoveredGroupLabel: string | null = null;
	/** Suppress autoFitView after user-initiated zoom (group label click, fit-all, etc.) */
	private _suppressAutoFit = false;
	/** Dedicated container for groupBy labels (rendered above nodes/edges) */
	private groupByLabelContainer: CanvasContainer | null = null;
	/** Zoom-aggregate: folder summary circles when groupBy=none at extreme zoom-out */
	private _aggregateGraphics: CanvasGraphics | null = null;
	/** Zoom-aggregate: folder summary labels */
	private _aggregateLabels: CanvasText[] = [];
	/** Zoom-aggregate: label hit regions for click-to-zoom */
	private _aggregateHitRegions: AggregateHitRegion[] = [];
	/** Graphics for cluster boundary outlines */
	private clusterBoundaryGraphics: CanvasGraphics | null = null;
	/** Viewport dirty flag — set by markDirty, consumed by onPostRender */
	private _viewportDirty = true;
	/** Cached hull data for cluster boundaries (avoid per-frame convexHull) */
	private _cachedHulls: Map<string, { cx: number; cy: number; hull: { x: number; y: number }[] }> = new Map();
	/** Throttle: last time _updateGroupByLabels ran full computation */
	private _groupLabelLastUpdate = 0;
	/** Off-screen link tooltip elements (directional) */
	private _offScreenTooltips: HTMLElement[] = [];
	private overlapCache: OverlapCache = { frame: 0, counts: new Map() };
	/** Cluster metadata for edge bundling (updated when cluster force is applied) */
	private clusterMeta: ClusterMetadata | null = null;
	/** Cached tag relationship pairs for fast lookup */
	private tagRelPairsCache: Set<string> = new Set();
	/** Currently hovered enclosure tag (for label highlight) */
	private hoveredTag: string | null = null;

	// Interaction manager (owns pointer events, drag, pan, hover, marquee, shell rotation)
	private interactionManager: InteractionManager | null = null;

	// Render pipeline (owns render loop, Canvas 2D node creation, batch drawing)
	private renderPipeline: RenderPipeline | null = null;

	// Label LOD, truncation, scaling pipeline
	private labelManager: LabelManager | null = null;

	// Guide / grid / axis renderer (coordinate guides, grids, triangles, etc.)
	private guideRenderer: GuideRenderer | null = null;

	// スナップショット差分オーバーレイ
	private diffOverlay: DiffOverlay = new DiffOverlay();

	// Minimap overlay
	private minimap: Minimap | null = null;

	// Layout controller (owns force simulation setup, force management, cluster arrangement)
	private layoutController: LayoutController = new LayoutController(this);

	// Layout transition animation
	private layoutTransition = new LayoutTransition();
	/** Saved node positions from before a layout switch (id → {x, y}) */
	private savedPositions: Map<string, { x: number; y: number }> = new Map();

	// Theme caches
	private cachedBgColor: number | null = null;
	private _centroidCache: Map<string, { x: number; y: number }> | null = null;
	private _centroidCacheFrame = -1;
	private _nodeRadiiCache: Map<string, number> | null = null;
	private _nodeRadiiCacheFrame = -1;
	private _frameCounter = 0;
	private cachedLabelColor: number | null = null;
	private cachedIsDark: boolean | null = null;
	/** Ephemeral highlight set from side-panel hover (null = not active) */
	private ephemeralHighlight: Set<string> | null = null;

	// Pathfinder state
	private pathfinderStartId: string | null = null;
	private pathfinderEndId: string | null = null;
	/** Set of node IDs on the shortest path (null = no path) */
	private pathfinderPath: string[] | null = null;
	/** Cached Set of node IDs on the path (avoid per-frame allocation) */
	private pathfinderNodeSet: Set<string> | null = null;
	/** Set of edge keys on the shortest path for highlight */
	private pathfinderEdgeSet: Set<string> | null = null;

	// 比較選択ノードID (最大2件)
	private compareNodeIds: string[] = [];

	/** Cached set of node IDs that share a tag but have no direct edge */
	private missingNeighborNodeIds: Set<string> | null = null;
	/** D6: Cached entropy scores (nodeId → 0..1) */
	private _entropyScores: Map<string, number> | null = null;
	/** D6: rawData ref for entropy cache invalidation */
	private _entropyCacheRef: GraphData | null = null;

	// Reusable EdgeDrawConfig — mutated in-place each frame to avoid per-frame allocation
	private _edgeDrawCfg: EdgeDrawConfig | null = null;

	// Resize observer
	private resizeObserver: ResizeObserver | null = null;

	// Concentric shells (for rotation & radius adjustment)
	private shells: ShellInfo[] = [];
	private nodeShellIndex: Map<string, number> = new Map();

	// Orbit auto-rotation animation
	private orbitAnimId: number | null = null;
	private orbitLastTime = 0;

	// Hover diff tracking
	private prevHighlightSet: Set<string> = new Set();
	/** DS: Distance map from hovered node for edge alpha gradient */
	private _hoverDistMap: Map<string, number> = new Map();

	// Spatial hash for hit testing
	private spatialGrid: Map<string, PixiNode[]> = new Map();
	private spatialCellSize = 50;

	// Node info panel (hover details)
	private nodeInfoEl: HTMLElement | null = null;
	private oobBadgeEl: HTMLElement | null = null;
	private densityCulledBadgeEl: HTMLElement | null = null;
	private graphStatsEl: HTMLElement | null = null;
	/** F5: Relation matrix floating panel */
	private relationMatrixEl: HTMLElement | null = null;
	/** A3: Thumbnail layer container */
	private thumbnailLayer: HTMLElement | null = null;
	/** A3: Cached thumbnail images (nodeId → img element or null) */
	private thumbnailCache: Map<string, HTMLImageElement | null> = new Map();
	private legendEl: HTMLElement | null = null;
	/** O3: Full-screen help overlay element */
	private _helpOverlayEl: HTMLElement | null = null;
	private hierarchyBreadcrumbEl: HTMLElement | null = null;
	private _similarCache: Map<string, SimilarNode[]> = new Map();

	private lassoBtnEl: HTMLElement | null = null;
	private subgraphBackBtnEl: HTMLElement | null = null;

	// Sunburst layout arc data for Canvas 2D rendering
	private sunburstLayoutArcs: LayoutSunburstArc[] = [];
	private sunburstCenter = { x: 0, y: 0 };

	// ビュー同期: 再帰イベントを防止するフラグ
	private _syncReceiving = false;

	// 注釈オーバーレイ管理
	private annotationLayer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: GraphViewsPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentLayout = LAYOUT_FORCE; // Always use force layout; arrangement patterns handle visual layout
		this.panel.nodeSize = plugin.settings.nodeSize;
		this.panel.showSimilar = plugin.settings.showSimilar ?? false;
		this.panel.sortRules = [...(plugin.settings.defaultSortRules ?? [{ key: "degree", order: "desc" }])].map(
			(r) => ({ ...r }),
		);
		this.panel.nodeRules = [...(plugin.settings.defaultNodeRules ?? [])].map((r) => ({ ...r }));
		this.applyGroupPresets();
		// Apply AFTER presets so user's explicit rules take priority over preset-derived ones
		this.panel.clusterGroupRules = [...(plugin.settings.defaultClusterGroupRules ?? [])].map((r) => ({ ...r }));
		this.panel.directionalGravityRules = [...(plugin.settings.directionalGravityRules ?? [])].map((r) => ({
			...r,
		}));
		// Cluster arrangement/spacing from settings (optional — falls back to DEFAULT_PANEL)
		if (plugin.settings.defaultClusterArrangement)
			this.panel.clusterArrangement = plugin.settings.defaultClusterArrangement;
		if (plugin.settings.defaultClusterNodeSpacing != null)
			this.panel.clusterNodeSpacing = plugin.settings.defaultClusterNodeSpacing;
		if (plugin.settings.defaultClusterGroupScale != null)
			this.panel.clusterGroupScale = plugin.settings.defaultClusterGroupScale;
		if (plugin.settings.defaultClusterGroupSpacing != null)
			this.panel.clusterGroupSpacing = plugin.settings.defaultClusterGroupSpacing;
		if (plugin.settings.defaultEdgeBundleStrength != null)
			this.panel.edgeBundleStrength = plugin.settings.defaultEdgeBundleStrength;
	}

	private applyGroupPresets() {
		const presets = this.plugin.settings.groupPresets ?? [];
		for (const preset of presets) {
			const cond = preset.condition;
			if (cond.layout && cond.layout !== this.currentLayout) continue;
			if (cond.tagDisplay && cond.tagDisplay !== this.panel.tagDisplay) continue;
			// Match found — apply preset
			this.panel.groups = preset.groups.map((g) => ({
				...g,
				expression: g.expression ? { ...g.expression } : null,
			}));
			// Restore commonQueries from preset
			if (preset.commonQueries?.length) {
				this.panel.commonQueries = preset.commonQueries.map((q) => ({ ...q }));
			} else if (preset.commonQuery?.expression) {
				// Legacy single commonQuery → convert to array
				this.panel.commonQueries = [
					{
						query: serializeExpr(preset.commonQuery.expression),
						recursive: preset.recursive ?? false,
					},
				];
			}
			this.panel.clusterGroupRules = deriveClusterRules(preset);
			break;
		}
		// Fallback: enclosure mode should always have a commonQuery
		if (this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE && this.panel.commonQueries.length === 0) {
			this.panel.commonQueries = [{ query: "tag:*", recursive: false }];
			this.panel.clusterGroupRules = deriveClusterRulesFromQueries(this.panel.commonQueries);
		}
	}

	getViewType() {
		return VIEW_TYPE_GRAPH;
	}
	getDisplayText() {
		return "Graph Island";
	}
	getIcon() {
		return "git-fork";
	}

	// -------------------------------------------------------------------------
	// State persistence — Obsidian calls these to save/restore workspace.json
	// -------------------------------------------------------------------------
	private _saveTimer: ReturnType<typeof setTimeout> | null = null;
	private _resizeOnMove: ((ev: PointerEvent) => void) | null = null;
	private _resizeOnUp: (() => void) | null = null;
	private _expansionKeyHandler: ((ev: KeyboardEvent) => void) | null = null;

	/** B3: doRender debounce — prevents rapid re-renders from slider drags */
	private _doRenderDebounceTimer = 0;
	/** Animation frame ID for zoom animations (prevents competing animations) */
	private _zoomAnimId = 0;
	private _lastDoRenderTime = 0;

	/** Tracked one-shot timers — cleared on close to prevent leaks */
	private _pendingTimers = new Set<ReturnType<typeof setTimeout>>();

	/** Schedule a one-shot timer that is auto-tracked and cleared on close. */
	private _scheduleTimer(cb: () => void, ms: number): ReturnType<typeof setTimeout> {
		const id = setTimeout(() => {
			this._pendingTimers.delete(id);
			cb();
		}, ms);
		this._pendingTimers.add(id);
		return id;
	}

	/** C1: Hover preview toast state */
	private _hoverPreviewTimer = 0;
	private _hoverPreviewEl: HTMLElement | null = null;

	/** Debounced workspace save — call after any panel state mutation */
	private requestSave() {
		// ビュー同期ブロードキャスト
		this._broadcastPanelSync();
		if (this._saveTimer) clearTimeout(this._saveTimer);
		this._saveTimer = setTimeout(() => {
			this.app.workspace.requestSaveLayout();
			this._saveTimer = null;
		}, SAVE_DEBOUNCE_MS);
	}

	getState() {
		// Restore "inherit" before serialization if it was resolved during render
		if (this._inheritResolved) {
			this.panel.clusterArrangement = "inherit";
			this._inheritResolved = false;
		}
		const sup = super.getState();
		// Serialize panel with special handling for Set (collapsedGroups) and transient fields
		const panelClone: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(this.panel)) {
			if (k === "collapsedGroups") {
				panelClone[k] = Array.from(v as Set<string>);
			} else if (k === "groupByRules") {
				// Transient editing state — don't persist empty-field rules
				panelClone[k] = null;
			} else {
				try {
					panelClone[k] = JSON.parse(JSON.stringify(v));
				} catch (_e) {
					panelClone[k] = v;
				}
			}
		}
		return {
			...sup,
			layout: this.currentLayout,
			panel: panelClone,
		};
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		// Layout is always "force"; legacy state values are migrated to cluster arrangement
		if (state.layout && typeof state.layout === "string" && state.layout !== LAYOUT_FORCE) {
			// Migrate legacy layout type to cluster arrangement pattern where applicable
			const legacyMap: Record<string, string> = {
				[LAYOUT_TREE]: ARRANGEMENT_GRID,
				[LAYOUT_CONCENTRIC]: ARRANGEMENT_CONCENTRIC,
				[LAYOUT_SUNBURST]: ARRANGEMENT_GRID,
				[LAYOUT_TIMELINE]: ARRANGEMENT_TIMELINE,
				[LAYOUT_ARC]: ARRANGEMENT_CONCENTRIC,
			};
			const mapped = legacyMap[state.layout];
			if (mapped && state.panel && typeof state.panel === "object") {
				(state.panel as Record<string, unknown>).clusterArrangement = mapped;
			}
		}
		this.currentLayout = LAYOUT_FORCE;
		if (state.panel && typeof state.panel === "object") {
			const saved = JSON.parse(JSON.stringify(state.panel)) as Record<string, unknown>;
			for (const key of Object.keys(DEFAULT_PANEL) as (keyof PanelState)[]) {
				if (!(key in saved) || saved[key] === undefined) continue;
				if (key === "collapsedGroups") {
					// Restore Set from serialized array
					const arr = Array.isArray(saved[key]) ? saved[key] : [];
					this.panel.collapsedGroups = new Set<string>(arr);
				} else if (key === "groupByRules") {
					// Transient — always re-parse from groupBy string
					this.panel.groupByRules = null;
				} else {
					// Safe: key is validated against DEFAULT_PANEL keys above
					(this.panel as unknown as Record<string, unknown>)[key] = saved[key];
				}
			}
		}
		// Sync clusterGroupRules from groupBy when follow-mode is active.
		// This ensures cable-tray and cluster force use the correct field
		// after session restore (the sync otherwise only runs on UI interaction).
		if (this.panel.clusterFollowsGroupBy && this.panel.groupBy && this.panel.groupBy !== "none") {
			const groupBy = this.panel.groupBy;
			const withoutOps = groupBy.replace(/\b(AND|OR|XOR|NOR|NAND|NOT)\b/gi, ",");
			const fields = withoutOps
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			this.panel.clusterGroupRules = fields.map((f) => ({
				groupBy: f.endsWith(":?") ? f : f + ":?",
				recursive: false,
			}));
		}

		// Settings migration: ensure new defaults are applied to old saved state
		if (this.panel.renderThresholds) {
			// nodeSizeByDegree was added later — old saves have it as false/undefined
			if (
				this.panel.renderThresholds.nodeSizeByDegree === undefined ||
				this.panel.renderThresholds.nodeSizeByDegree === false
			) {
				this.panel.renderThresholds.nodeSizeByDegree = true;
			}
			// autoLOD was added later
			if (this.panel.renderThresholds.autoLOD === undefined) {
				this.panel.renderThresholds.autoLOD = true;
			}
		}
		// If already rendered (onOpen completed), rebuild with restored state
		if (this.panelEl) {
			this.buildPanel();
			this.applyClusterForce();
			this.doRender();
		}
	}

	async onOpen() {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass("graph-container");
		if (Platform.isMobile) {
			root.addClass("is-mobile");
			// A11y WCAG 2.5.5: ensure minimum 44px touch target (22px radius)
			const rt = ensureRT(this.panel);
			if ((rt.minNodeRadius ?? 0) < 22) {
				rt.minNodeRadius = 22;
			}
		}

		// --- Toolbar ---
		this._initToolbar(root);

		// --- Main area ---
		const main = root.createDiv({ cls: "graph-main" });
		const canvasArea = this._initCanvasArea(main);

		// --- Keyboard shortcuts ---
		this._registerKeyboardShortcuts();

		// --- Overlays (legend, shortcut help) ---
		this._initOverlays(canvasArea);

		// --- Panel resize handle + control panel ---
		this._initPanelWithResize(main);

		// --- Resize observer for Canvas 2D ---
		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(canvasArea);

		// --- Workspace event subscriptions ---
		this._registerWorkspaceEvents();

		this.doRender();

		// Onboarding: show help overlay on first launch
		const ONBOARDING_KEY = "graph-island-onboarding-shown";
		if (!localStorage.getItem(ONBOARDING_KEY)) {
			localStorage.setItem(ONBOARDING_KEY, "1");
			this._scheduleTimer(() => this._toggleHelpOverlay(), ONBOARDING_HELP_DELAY_MS);
			// Contextual hint after help overlay auto-dismisses
			this._scheduleTimer(() => showToast(t("toast.contextMenuHint"), TOAST_LONG_MS), ONBOARDING_HINT_DELAY_MS);
		}
	}

	/** Create the toolbar with view-mode, zoom, marquee, and settings buttons. */
	private _initToolbar(root: HTMLElement): void {
		const toolbar = root.createDiv({
			cls: "graph-toolbar",
			attr: { role: "toolbar", "aria-label": "Graph controls" },
		});
		this.statusEl = toolbar.createEl("span", { cls: "graph-status", attr: { "aria-live": "polite" } });

		// View mode selector (always visible in toolbar)
		this._buildViewModeButtons(toolbar);

		const zoomGroup = toolbar.createDiv({ cls: "graph-toolbar-zoom" });
		this._initZoomButtons(zoomGroup);
		this._initSettingsButtons(toolbar);
	}

	/** Build the view mode radio group in the toolbar. */
	private _buildViewModeButtons(toolbar: HTMLElement): void {
		const group = toolbar.createDiv({
			cls: "gi-view-mode-group",
			attr: { role: "radiogroup", "aria-label": t("viewMode.switched") },
		});
		const modes: { mode: ViewMode; icon: string; labelKey: string }[] = [
			{ mode: "graph", icon: "git-branch", labelKey: "viewMode.graph" },
			{ mode: "sunburst", icon: "sun", labelKey: "viewMode.sunburst" },
			{ mode: "timeline", icon: "calendar", labelKey: "viewMode.timeline" },
			{ mode: "matrix", icon: "table-2", labelKey: "viewMode.matrix" },
		];
		for (const m of modes) {
			const btn = group.createEl("button", {
				cls: `gi-view-mode-btn${this.panel.viewMode === m.mode ? " is-active" : ""}`,
				attr: {
					"aria-label": t(m.labelKey),
					"aria-pressed": String(this.panel.viewMode === m.mode),
					"data-mode": m.mode,
					role: "radio",
				},
			});
			const iconSpan = btn.createSpan({ cls: "gi-vm-icon" });
			setIcon(iconSpan, m.icon);
			btn.createSpan({ cls: "gi-vm-label", text: t(m.labelKey) });
			btn.addEventListener("click", () => {
				if (this.panel.viewMode === m.mode) return;
				this.panel.viewMode = m.mode;
				this.currentLayout = viewModeToLayout(m.mode);
				group.querySelectorAll(".gi-view-mode-btn").forEach((b) => {
					b.removeClass("is-active");
					b.setAttribute("aria-pressed", "false");
				});
				btn.addClass("is-active");
				btn.setAttribute("aria-pressed", "true");
				this._syncGraphOnlyButtons(m.mode);
				this.doRender();
				this._announceA11y(`${t("viewMode.switched")}: ${t(m.labelKey)}`);
			});
		}
	}

	/** Show/hide buttons that only apply to graph viewMode. */
	private _syncGraphOnlyButtons(mode: ViewMode): void {
		const isGraph = mode === "graph";
		this.containerEl.querySelectorAll<HTMLElement>(".gi-graph-only").forEach((el) => {
			el.style.display = isGraph ? "" : "none";
		});
	}

	/** Create zoom in/out and marquee buttons. */
	private _initZoomButtons(zoomGroup: HTMLElement): void {
		const zoomInBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
		setIcon(zoomInBtn, "zoom-in");
		zoomInBtn.setAttribute("aria-label", `${t("toolbar.zoomIn")} [+]`);
		zoomInBtn.title = `${t("toolbar.zoomIn")} [+]`;
		zoomInBtn.addEventListener("click", () => {
			this.zoomBy(1.3);
		});

		const zoomOutBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
		setIcon(zoomOutBtn, "zoom-out");
		zoomOutBtn.setAttribute("aria-label", `${t("toolbar.zoomOut")} [−]`);
		zoomOutBtn.title = `${t("toolbar.zoomOut")} [−]`;
		zoomOutBtn.addEventListener("click", () => {
			this.zoomBy(1 / 1.3);
		});

		// Fit-all button (全体表示)
		const fitAllBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
		setIcon(fitAllBtn, "maximize");
		fitAllBtn.setAttribute("aria-label", t("toolbar.fitAll"));
		fitAllBtn.title = t("toolbar.fitAll");
		fitAllBtn.addEventListener("click", () => {
			// Temporarily remove minScale so autoFitView can zoom out fully
			const rt = mergeRenderThresholds(this.panel.renderThresholds);
			const saved = rt.autoFitMinScale;
			rt.autoFitMinScale = 0;
			this.autoFitOnce();
			rt.autoFitMinScale = saved;
		});

		// Zoom percentage indicator (hidden, kept for internal API)
		this.zoomIndicatorEl = zoomGroup.createEl("span", { cls: "gi-zoom-indicator", text: "100%" });
		this.zoomIndicatorEl.style.display = "none";

		// FPS monitor (debug, hidden by default)
		this.fpsEl = zoomGroup.createEl("span", { cls: "gi-fps-indicator", text: "" });
		this.fpsEl.title = "Render FPS";

		const marqueeBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn gi-graph-only" });
		setIcon(marqueeBtn, "box-select");
		marqueeBtn.setAttribute("aria-label", t("toolbar.marquee"));
		marqueeBtn.title = `${t("toolbar.marquee")}`;
		marqueeBtn.addEventListener("click", () => {
			if (this.interactionManager) {
				this.interactionManager.marqueeMode = !this.interactionManager.marqueeMode;
				marqueeBtn.toggleClass("is-active", this.interactionManager.marqueeMode);
				if (this.interactionManager.marqueeMode) {
					this.interactionManager.lassoMode = false;
					this.lassoBtnEl?.removeClass("is-active");
				}
			}
		});
	}

	// _initActionButtons removed — export, local graph, snapshot moved to command palette

	// =========================================================================
	// スナップショット操作
	// =========================================================================

	/** 現在のグラフ状態をスナップショットとして保存する */
	/** 差分オーバーレイを解除する */
	private _clearDiffOverlay(): void {
		this.diffOverlay.deactivate();
		const canvasArea = this.containerEl.querySelector<HTMLElement>(".gi-canvas-area");
		if (canvasArea) this.diffOverlay.removeDiffList(canvasArea);
		this.pixiApp?.markNeedsRender();
		this.wakeRenderLoop();
	}

	/** Create fullscreen toggle and settings panel toggle buttons. */
	private _initSettingsButtons(toolbar: HTMLElement): void {
		const panelToggle = toolbar.createEl("button", { cls: "graph-settings-btn" });
		setIcon(panelToggle, "settings");
		panelToggle.setAttribute("aria-label", `${t("toolbar.graphSettings")} [P]`);
		panelToggle.title = `${t("toolbar.graphSettings")} [P]`;
		panelToggle.addEventListener("click", () => {
			const hidden = this.panelEl?.hasClass("is-hidden");
			this.panelEl?.toggleClass("is-hidden", !hidden);
			if (Platform.isMobile) {
				this.panelEl?.toggleClass("is-overlay", !!hidden);
			}
			panelToggle.toggleClass("is-active", !!hidden);
		});
	}

	/** Create the canvas area with the canvas wrap and node info overlay. */
	private _initCanvasArea(main: HTMLElement): HTMLElement {
		// canvasWrap is emptied by initPixi, so nodeInfoEl
		// lives in a sibling wrapper that won't be cleared.
		const canvasArea = main.createDiv({
			cls: "gi-canvas-area",
			attr: { role: "main", "aria-label": "Graph canvas" },
		});
		this.canvasWrap = canvasArea.createDiv({
			cls: "graph-svg-wrap",
			attr: {
				role: "application",
				"aria-label": t("a11y.graphCanvas") ?? "Interactive graph canvas",
				"aria-roledescription": "graph",
			},
		});

		// 注釈オーバーレイレイヤー（キャンバスの上に配置、ポインターイベント透過）
		this.annotationLayer = canvasArea.createDiv({ cls: "gi-annotation-layer" });

		// --- Node Info Overlay (floating, survives canvas rebuilds) ---
		this.nodeInfoEl = canvasArea.createDiv({
			cls: "gi-node-info",
			attr: { "aria-live": "polite", "aria-atomic": "true" },
		});
		this.nodeInfoEl.style.display = "none";

		// --- Off-screen node count badge (a11y: aria-live for screen readers) ---
		this.oobBadgeEl = canvasArea.createDiv({
			cls: "gi-oob-badge",
			attr: { "aria-live": "polite", "aria-atomic": "true", "aria-label": "Off-screen nodes" },
		});
		this.oobBadgeEl.style.display = "none";

		// --- Density-culled label count badge ---
		this.densityCulledBadgeEl = canvasArea.createDiv({ cls: "gi-density-badge" });
		this.densityCulledBadgeEl.setAttribute("aria-live", "polite");
		this.densityCulledBadgeEl.setAttribute("aria-atomic", "true");
		this.densityCulledBadgeEl.style.display = "none";

		// --- Graph Statistics Overlay (Feature CX) ---
		this.graphStatsEl = canvasArea.createDiv({
			cls: "gi-graph-stats",
			attr: { role: "status", "aria-label": "Graph statistics", tabindex: "0" },
		});
		this.graphStatsEl.style.display = "none";

		// --- F5: Relation Matrix Overlay ---
		this.relationMatrixEl = canvasArea.createDiv({ cls: "gi-relation-matrix" });
		this.relationMatrixEl.style.display = "none";

		// --- A3: Node Thumbnail Layer ---
		this.thumbnailLayer = canvasArea.createDiv({ cls: "gi-thumbnail-layer" });

		// --- S1: Hierarchy Breadcrumb ---
		this.hierarchyBreadcrumbEl = canvasArea.createDiv({ cls: "gi-hierarchy-breadcrumb" });
		this.hierarchyBreadcrumbEl.style.display = "none";

		return canvasArea;
	}

	/** Register all keyboard shortcuts for the graph view. */
	private _registerKeyboardShortcuts(): void {
		this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
			const activeLeaf = this.app.workspace.activeLeaf;
			if (activeLeaf?.view !== this) return;
			if (e.key === "Escape") {
				this._handleEscapeKey();
				return;
			}
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			// Timeline keyboard navigation: arrow keys move between bars
			if (this.panel.viewMode === "timeline") {
				if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
					e.preventDefault();
					this._handleTimelineArrowKey(e.key);
					return;
				}
				if (e.key === "Enter" && this.highlightedNodeId) {
					e.preventDefault();
					this._openTimelineBarNote(this.highlightedNodeId);
					return;
				}
			}

			this._handleShortcutKey(e.key, e);
		});
	}

	/** Handle Escape key: close overlays or clear keyboard focus. */
	/** Open the note corresponding to a timeline bar. */
	private _openTimelineBarNote(nodeId: string): void {
		const pn = this.pixiNodes.get(nodeId);
		const fp = pn?.data?.filePath;
		if (!fp) return;
		const tf = this.app.vault.getAbstractFileByPath(fp);
		if (tf instanceof TFile) {
			const leaf = this.app.workspace.getLeaf("tab");
			leaf.openFile(tf);
		}
	}

	/** Timeline arrow key navigation: move selection between bars. */
	private _handleTimelineArrowKey(key: string): void {
		const bars = this.clusterMeta?.timelineBars;
		if (!bars || bars.length === 0) return;

		// Find current selection index
		const currentId = this.highlightedNodeId;
		const currentIdx = currentId ? bars.findIndex((b) => b.nodeId === currentId) : -1;

		// Sort bars by Y then X for navigation order
		const sorted = bars
			.map((b, i) => ({ ...b, origIdx: i }))
			.sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);

		let sortedIdx = currentIdx >= 0 ? sorted.findIndex((b) => b.origIdx === currentIdx) : -1;

		switch (key) {
			case "ArrowRight":
				// Next bar in time order (same Y, next X; or next row)
				sortedIdx = Math.min(sortedIdx + 1, sorted.length - 1);
				if (sortedIdx < 0) sortedIdx = 0;
				break;
			case "ArrowLeft":
				sortedIdx = Math.max(sortedIdx - 1, 0);
				break;
			case "ArrowDown": {
				// Jump to next work group (find bar with significantly different Y)
				const curY = sortedIdx >= 0 ? sorted[sortedIdx].yCenter : 0;
				const next = sorted.find((b, i) => i > sortedIdx && b.yCenter > curY + 10);
				if (next) sortedIdx = sorted.indexOf(next);
				break;
			}
			case "ArrowUp": {
				const curY = sortedIdx >= 0 ? sorted[sortedIdx].yCenter : Infinity;
				// Find last bar with Y significantly above current
				for (let i = sortedIdx - 1; i >= 0; i--) {
					if (sorted[i].yCenter < curY - 10) {
						sortedIdx = i;
						break;
					}
				}
				break;
			}
		}

		if (sortedIdx >= 0 && sortedIdx < sorted.length) {
			const target = sorted[sortedIdx];
			this.setHighlightedNodeId(target.nodeId);
			// Pan to center the selected bar
			const world = this.worldContainer;
			const wrap = this.canvasWrap;
			if (world && wrap) {
				const ws = world.scale.x;
				world.x = wrap.clientWidth / 2 - target.xStart * ws;
				world.y = wrap.clientHeight / 2 - target.yCenter * ws;
			}
			this.applyHover();
			this.drawTimelineBars();
			this.wakeRenderLoop();
		}
	}

	private _handleEscapeKey(): void {
		// HY: Each Escape step announces what was cleared via aria-live
		if (this.diffOverlay.isActive()) {
			this._clearDiffOverlay();
			this._announceA11y("Diff overlay closed");
			return;
		}
		if (this.nodeInfoEl && this.nodeInfoEl.style.display !== "none") {
			this.nodeInfoEl.style.display = "none";
			this.nodeInfoEl.classList.remove("is-visible");
			this._announceA11y("Node info closed");
			return;
		}
		// IP: Close stats panel via Escape
		if (this.graphStatsEl && this.graphStatsEl.style.display !== "none" && this.panel.showGraphStats) {
			this.panel.showGraphStats = false;
			this.graphStatsEl.style.display = "none";
			this._announceA11y("Stats panel closed");
			return;
		}
		if (this.legendEl && this.legendEl.style.display !== "none") {
			this.legendEl.style.display = "none";
			this._announceA11y("Legend closed");
			return;
		}
		if (this._helpOverlayEl) {
			this._helpOverlayEl.remove();
			this._helpOverlayEl = null;
			this._announceA11y("Help closed");
			return;
		}
		// Clear compare selection (Escape)
		if (this.compareNodeIds.length > 0) {
			this.clearCompareSelection();
			this._announceA11y(t("a11y.compareCleared") ?? "Compare selection cleared");
			return;
		}
		// Clear multi-select (Escape)
		if (this.panel.multiSelectNodeIds?.length > 0) {
			this.panel.multiSelectNodeIds = [];
			this._announceA11y(t("a11y.deselected") ?? "Deselected all");
			this.markDirty(true);
			return;
		}
		// Exit subgraph mode (Escape)
		if (this.panel.subgraphNodeIds?.length > 0) {
			this.exitSubgraph();
			return;
		}
		// フォーカスモードのクリア (Escape)
		if (this.panel.focusNodeId) {
			this.clearFocus();
			this._announceA11y("Focus mode cleared");
			return;
		}
		// HS: Clear search query (Escape)
		if (this.panel.searchQuery) {
			this.panel.searchQuery = "";
			this._searchHighlightSet = null;
			this.applySearch();
			this._announceA11y(t("a11y.filterCleared") ?? "Search cleared");
			this.buildPanel();
			return;
		}
		if (this._isKeyboardFocused) {
			this._isKeyboardFocused = false;
			this.setHighlightedNodeId(null);
			this.applyHover();
			this.markDirty(true);
			this._announceA11y("Keyboard focus cleared");
		}
	}

	/** Build KeyboardHost bridge for handleShortcutKey delegation */
	private _getKeyboardHost(): KeyboardHost {
		return {
			panelEl: this.panelEl,
			containerEl: this.containerEl,
			worldContainer: this.worldContainer as KeyboardHost["worldContainer"],
			highlightedNodeId: this.highlightedNodeId,
			isKeyboardFocused: this._isKeyboardFocused,
			panel: this.panel as KeyboardHost["panel"],
			compareNodeIds: this.compareNodeIds,
			pixiNodes: this.pixiNodes as KeyboardHost["pixiNodes"],
			app: this.app,
			autoFitView: (w, h) => this.autoFitView(w, h),
			zoomBy: (f) => this.zoomBy(f),
			setZoom: (l) => this.setZoom(l),
			markDirty: (f) => this.markDirty(f),
			applyHover: () => this.applyHover(),
			updateLegend: () => this.updateLegend(),
			requestSave: () => this.requestSave(),
			copyGraphToClipboard: () => this.copyGraphToClipboard(),
			cycleFocusNode: (d) => this.cycleFocusNode(d),
			focusZoomToNode: (id) => this.focusZoomToNode(id),
			navigateNeighbor: (d) => this._navigateNeighbor(d),
			announceA11y: (m) => this._announceA11y(m),
			announceZoomLevel: () => this._announceZoomLevel(),
			toggleHelpOverlay: () => this._toggleHelpOverlay(),
			toggleMultiSelect: (id) => this.toggleMultiSelect?.(id),
			addCompareNode: (id) => this.addCompareNode(id),
			setPathfinderNode: (id, ep) => this.setPathfinderNode(id, ep),
			openFile: (fp) => {
				const file = this.app.vault.getAbstractFileByPath(fp);
				if (file instanceof TFile) this.app.workspace.getLeaf(false).openFile(file);
			},
		};
	}

	/** Dispatch a non-Escape keyboard shortcut (delegated to KeyboardHandler). */
	private _handleShortcutKey(key: string, e: KeyboardEvent): void {
		handleShortcutKey(this._getKeyboardHost(), key, e);
	}

	/** @deprecated Preserved for reference — original method moved to KeyboardHandler.ts */

	/** Create legend and keyboard shortcut help overlays. */
	private _initOverlays(canvasArea: HTMLElement): void {
		// --- Legend Overlay ---
		this.legendEl = canvasArea.createDiv({
			cls: "gi-legend",
			attr: { role: "complementary", "aria-label": "Graph legend" },
		});
		this.legendEl.style.display = "none";

		// --- Keyboard Shortcut Help Overlay (O3: full-screen help overlay) ---
		// Created lazily via _toggleHelpOverlay()
	}

	/** O3: Toggle the full-screen help overlay with keyboard shortcuts and mode descriptions. */
	_toggleHelpOverlay(): void {
		if (this._helpOverlayEl) {
			this._helpOverlayEl.remove();
			this._helpOverlayEl = null;
			return;
		}
		const canvasArea = this.canvasWrap;
		if (!canvasArea) return;

		// JJ: role=dialog + aria-label for screen readers
		const overlay = canvasArea.createDiv({
			cls: "gi-help-overlay",
			attr: { role: "dialog", "aria-label": "Keyboard shortcuts", "aria-modal": "true" },
		});
		this._helpOverlayEl = overlay;

		overlay.createEl("h3", { text: t("help.title") });

		const sections: { title: string; items: [string, string][] }[] = [
			{
				title: t("help.sectionNavigation"),
				items: [
					["Tab / Shift+Tab", t("help.nav.tabCycle")],
					["\u2190\u2191\u2192\u2193", t("help.nav.arrowKeys")],
					["+/= / \u2212", t("help.nav.zoomInOut")],
					["0\u20139", t("help.nav.zoomDigits")],
					["Z", t("help.nav.focusZoom")],
					["Space / F", t("help.nav.fitView")],
					["Scroll", t("help.nav.scroll")],
				],
			},
			{
				title: t("help.sectionSelection"),
				items: [
					["Click / Hover", t("help.sel.clickHover")],
					["Shift+Click / Shift+Enter", t("help.sel.shiftClick")],
					["Ctrl+A", t("help.sel.ctrlA")],
					["Ctrl+D", t("help.sel.ctrlD")],
					["Ctrl+E", t("help.sel.ctrlE")],
					["Ctrl+Click / Ctrl+Enter", t("help.sel.ctrlClick")],
					["S (focused)", t("help.sel.pathStart")],
					["E (focused)", t("help.sel.pathEnd")],
					["Enter", t("help.sel.enter")],
					["Double-click", t("help.sel.dblClick")],
				],
			},
			{
				title: t("help.sectionDisplay"),
				items: [
					["P", t("help.disp.panel")],
					["L", t("help.disp.legend")],
					["M", t("help.disp.minimap")],
					["G", t("help.disp.grid")],
					["[ / ]", t("help.disp.hops")],
					["1\u20134", t("help.disp.tabSwitch")],
				],
			},
			{
				title: t("help.sectionActions"),
				items: [
					["Ctrl+F", t("help.act.search")],
					["Ctrl+Shift+C", t("help.act.copyPng")],
					["Right-click", t("help.act.contextMenu")],
					["Drag node", t("help.act.dragNode")],
					["Drag canvas", t("help.act.dragCanvas")],
					["Escape", t("help.act.escape")],
					["?", t("help.act.helpToggle")],
				],
			},
		];

		for (const sec of sections) {
			overlay.createEl("h4", { text: sec.title, cls: "gi-help-section-title" });
			// JJ: accessible table with role + aria-label
			const table = overlay.createEl("table", {
				cls: "gi-help-table",
				attr: { role: "table", "aria-label": `${sec.title} shortcuts` },
			});
			for (const [key, desc] of sec.items) {
				const tr = table.createEl("tr");
				tr.createEl("td", { cls: "gi-help-key", text: key, attr: { "aria-label": `Key: ${key}` } });
				tr.createEl("td", { text: desc });
			}
		}

		overlay.createEl("h3", { text: t("help.sectionModes"), cls: "gi-help-section" });
		const modes: [string, string][] = [
			[t("mode.explore"), t("help.mode.explore")],
			[t("mode.analyze"), t("help.mode.analyze")],
			[t("mode.write"), t("help.mode.write")],
		];
		for (const [name, desc] of modes) {
			const row = overlay.createDiv({ cls: "gi-help-mode" });
			row.createEl("strong", { text: name });
			row.createEl("span", { text: ` \u2014 ${desc}` });
		}

		// Click overlay to close
		overlay.addEventListener("click", () => {
			overlay.remove();
			this._helpOverlayEl = null;
			this._announceA11y("Help closed");
		});
		// JJ: a11y announce
		this._announceA11y("Keyboard shortcuts help opened. Press Escape or click to close.");
	}

	/** Create panel resize handle and control panel element. */
	private _initPanelWithResize(main: HTMLElement): void {
		// --- Panel resize handle (sibling of panelEl so panelEl.empty() won't destroy it) ---
		const resizeHandle = main.createDiv({ cls: "gi-panel-resize-handle" });
		let startX = 0,
			startW = 0;
		this._resizeOnMove = (ev: PointerEvent) => {
			const delta = startX - ev.clientX;
			const newW = Math.max(180, Math.min(500, startW + delta));
			this.panelEl!.style.width = `${newW}px`;
		};
		this._resizeOnUp = () => {
			document.removeEventListener("pointermove", this._resizeOnMove!);
			document.removeEventListener("pointerup", this._resizeOnUp!);
			resizeHandle.removeClass("is-dragging");
		};
		resizeHandle.addEventListener("pointerdown", (ev: PointerEvent) => {
			ev.preventDefault();
			startX = ev.clientX;
			startW = this.panelEl!.offsetWidth;
			resizeHandle.addClass("is-dragging");
			document.addEventListener("pointermove", this._resizeOnMove!);
			document.addEventListener("pointerup", this._resizeOnUp!);
		});

		// --- Control Panel ---
		this.panelEl = main.createDiv({
			cls: "graph-panel is-hidden",
			attr: { role: "complementary", "aria-label": "Graph settings" },
		});
		this.buildPanel();
	}

	/** Subscribe to workspace events (active-leaf-change, css-change, ephemeral highlight). */
	private _registerWorkspaceEvents(): void {
		// Wake render loop when this leaf becomes active again (e.g. tab switch)
		// Also sync graph highlight with active editor file (A-2 editor↔graph sync)
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view === this) {
					// Our leaf became active — just wake render loop
					if (this.pixiApp) this.markDirty();
					return;
				}
				// Another leaf is active — sync if enabled
				if (!this.panel.syncWithEditor) return;
				const file = leaf?.view instanceof FileView ? leaf.view.file : undefined;
				if (!file || !this.pixiNodes.size) return;
				const nodeId = this.findNodeIdByPath(file.path);
				if (!nodeId) return;
				this.setHighlightedNodeId(nodeId);
				this.applyHover();
				this.panToNode(nodeId);
				// If local graph mode is on, update the center
				if (this.panel.localGraphCenter !== null) {
					this.panel.localGraphCenter = file.path;
					this.doRender();
					this.requestSave();
				}
			}),
		);

		// Theme / CSS snippet change — invalidate color caches and update canvas background
		this.registerEvent(
			// "css-change" is an undocumented Obsidian workspace event
			asInternalWorkspace(this.app.workspace).on("css-change", () => {
				this.invalidateThemeCache();
			}),
		);

		// Auto-snapshot: capture graph state when vault metadata changes (configurable debounce)
		{
			let autoSnapTimer = 0;
			const getDebounceMs = () => {
				const mins = this.plugin.settings.autoSnapshotIntervalMin ?? 5;
				return mins * 60 * 1000;
			};
			const AUTO_SNAP_MAX = 10;
			const AUTO_SNAP_PREFIX = "[auto] ";
			this.registerEvent(
				this.app.metadataCache.on("changed", () => {
					const debounceMs = getDebounceMs();
					if (debounceMs <= 0) return; // auto-snapshot disabled
					if (autoSnapTimer) window.clearTimeout(autoSnapTimer);
					autoSnapTimer = window.setTimeout(() => {
						autoSnapTimer = 0;
						if (!this.pixiNodes.size) return; // no graph data yet
						const snapshots = this.plugin.settings.snapshots ?? [];
						// Remove oldest auto-snapshots if at limit
						const autoSnaps = snapshots.filter((s) => s.name.startsWith(AUTO_SNAP_PREFIX));
						while (autoSnaps.length >= AUTO_SNAP_MAX) {
							const oldest = autoSnaps.shift()!;
							const idx = snapshots.indexOf(oldest);
							if (idx >= 0) snapshots.splice(idx, 1);
						}
						// Capture
						const data = this.getGraphData();
						const name = AUTO_SNAP_PREFIX + new Date().toISOString().replace("T", " ").slice(0, 16);
						const snap = captureSnapshot(data, name, {
							layout: this.currentLayout ?? "force",
							searchQuery: this.panel.searchQuery ?? "",
							groupBy: this.panel.clusterGroupRules?.[0]?.groupBy ?? "",
						});
						snapshots.push(snap);
						this.plugin.settings.snapshots = snapshots;
						this.plugin.saveSettings();
					}, debounceMs) as unknown as number;
				}),
			);
		}

		// Ephemeral highlight from side-panel (property value hover, backlink hover)
		this.registerEvent(
			asInternalWorkspace(this.app.workspace).on(EVENT_HIGHLIGHT_NODES, (...args: unknown[]) => {
				this.applyEphemeralHighlight(args[0] as Set<string> | null);
			}),
		);

		// O2: Link creation from NodeDetailView suggestion
		this.registerEvent(
			asInternalWorkspace(this.app.workspace).on("graph-island:create-link", (...args: unknown[]) => {
				this.createLink(args[0] as string, args[1] as string);
			}),
		);

		// ビュー同期: 他の Graph Island ビューからのパネル状態変更を受信
		this.registerEvent(
			asInternalWorkspace(this.app.workspace).on(
				EVENT_SYNC_PANEL,
				(...args: unknown[]) => {
					const data = args[0] as { senderId: string; panel: Record<string, unknown> } | null;
					if (!data || !this.panel.syncViewId) return;
					// 自分自身が送信元の場合は無視
					if (data.senderId === (this.leaf as unknown as { id: string }).id) return;
					this._syncReceiving = true;
					try {
						this._applySyncedPanel(data.panel);
					} finally {
						this._syncReceiving = false;
					}
				},
			),
		);
	}

	// ---------------------------------------------------------------------------
	// ビュー同期: パネル状態のブロードキャストと受信
	// ---------------------------------------------------------------------------

	/** 同期対象フィールド — 検索クエリやローカルグラフは除外 */
	private static readonly SYNC_FIELDS: (keyof PanelState)[] = [
		"includeTagsInData",
		"showAttachments",
		"existingOnly",
		"showOrphans",
		"showArrows",
		"showOrbitRings",
		"colorEdgesByRelation",
		"nodeColorMode",
		"showInheritance",
		"showAggregation",
		"showTagNodes",
		"tagDisplay",
		"showSimilar",
		"showSibling",
		"showSequence",
		"showLinks",
		"showTagEdges",
		"showCategoryEdges",
		"showSemanticEdges",
		"showEdgeLabels",
		"showMinimap",
		"showDotGrid",
		"showDurationBars",
		"clusterArrangement",
		"clusterGroupArrangement",
		"nodeSize",
		"textFadeThreshold",
		"hoverHops",
		"fadeEdgesByDegree",
		"edgeBundleStrength",
		"nodeDisplayMode",
		"focusMode",
	];

	/** 同期を他のビューにブロードキャスト */
	private _broadcastPanelSync(): void {
		if (!this.panel.syncViewId || this._syncReceiving) return;
		const payload: Record<string, unknown> = {};
		for (const key of GraphViewContainer.SYNC_FIELDS) {
			payload[key] = (this.panel as unknown as Record<string, unknown>)[key];
		}
		// workspace.trigger でカスタムイベントを発火
		asInternalWorkspace(this.app.workspace).trigger(EVENT_SYNC_PANEL, {
			senderId: (this.leaf as unknown as { id: string }).id,
			panel: payload,
		});
	}

	/** 受信した同期データをパネルに適用 */
	private _applySyncedPanel(incoming: Record<string, unknown>): void {
		let needsRender = false;
		for (const key of GraphViewContainer.SYNC_FIELDS) {
			if (!(key in incoming)) continue;
			const cur = (this.panel as unknown as Record<string, unknown>)[key];
			const next = incoming[key];
			if (cur !== next) {
				(this.panel as unknown as Record<string, unknown>)[key] = next;
				needsRender = true;
			}
		}
		if (needsRender) {
			this.buildPanel();
			this.doRender();
		}
	}

	// ---------------------------------------------------------------------------
	// Feature P: ノード注釈 — キャンバス上のフローティングテキストボックス
	// ---------------------------------------------------------------------------

	/** 空白ダブルクリック時に呼ばれる: 注釈を追加 (W4: with default color) */
	addAnnotationAt(wx: number, wy: number): void {
		const id = crypto.randomUUID();
		const annotation = { nodeId: id, text: "", x: wx, y: wy, color: "yellow" };
		this.panel.annotations.push(annotation);
		this._renderAnnotation(annotation);
		this.requestSave();
	}

	/** 全注釈を再描画（レンダー後に呼ぶ） */
	private _renderAllAnnotations(): void {
		if (!this.annotationLayer) return;
		this.annotationLayer.empty();
		for (const ann of this.panel.annotations) {
			this._renderAnnotation(ann);
		}
	}

	/** 個別の注釈 DOM 要素を生成 (W4: sticky note with color support) */
	private _renderAnnotation(ann: { nodeId: string; text: string; x: number; y: number; color?: string }): void {
		if (!this.annotationLayer || !this.worldContainer || !this.pixiApp) return;

		const colorClass = ann.color ? `gi-sticky-${ann.color}` : "gi-sticky-yellow";
		const el = this.annotationLayer.createDiv({ cls: `gi-annotation ${colorClass}` });

		// テキスト入力エリア
		const textEl = el.createEl("textarea", {
			cls: "gi-annotation-text",
			attr: { placeholder: t("annotation.placeholder"), rows: "2" },
		});
		textEl.value = ann.text;
		textEl.addEventListener("input", () => {
			ann.text = textEl.value;
			this.requestSave();
		});
		// テキストエリアのフォーカス時はドラッグ無効
		textEl.addEventListener("pointerdown", (e) => e.stopPropagation());

		// W4: Color picker bar
		const colorBar = el.createDiv({ cls: "gi-annotation-color-bar" });
		const stickyColors = [
			{ name: "yellow", bg: "#eab308" },
			{ name: "blue", bg: "#3b82f6" },
			{ name: "green", bg: "#22c55e" },
			{ name: "pink", bg: "#ec4899" },
		];
		for (const sc of stickyColors) {
			const dot = colorBar.createDiv({ cls: "gi-annotation-color-dot" });
			dot.style.background = sc.bg;
			dot.addEventListener("click", (e) => {
				e.stopPropagation();
				ann.color = sc.name;
				// Update class
				el.className = `gi-annotation gi-sticky-${sc.name}`;
				this.requestSave();
			});
		}
		// Prevent color bar clicks from starting drag
		colorBar.addEventListener("pointerdown", (e) => e.stopPropagation());

		// 削除ボタン
		const deleteBtn = el.createEl("button", {
			cls: "gi-annotation-delete",
			attr: { "aria-label": t("annotation.delete"), title: t("annotation.delete") },
		});
		deleteBtn.textContent = "\u00d7";
		deleteBtn.addEventListener("click", () => {
			const idx = this.panel.annotations.indexOf(ann);
			if (idx >= 0) this.panel.annotations.splice(idx, 1);
			el.remove();
			this.requestSave();
		});

		// ドラッグ処理: スクリーン座標のデルタをワールド座標に変換
		let dragging = false;
		let lastScreenX = 0;
		let lastScreenY = 0;

		el.addEventListener("pointerdown", (e) => {
			if (e.target === textEl) return; // テキスト編集中はドラッグしない
			dragging = true;
			lastScreenX = e.clientX;
			lastScreenY = e.clientY;
			el.setPointerCapture(e.pointerId);
			e.preventDefault();
		});
		el.addEventListener("pointermove", (e) => {
			if (!dragging || !this.worldContainer) return;
			const scale = this.worldContainer.scale.x || 1;
			const dx = (e.clientX - lastScreenX) / scale;
			const dy = (e.clientY - lastScreenY) / scale;
			ann.x += dx;
			ann.y += dy;
			lastScreenX = e.clientX;
			lastScreenY = e.clientY;
			this._positionAnnotationEl(el, ann);
		});
		el.addEventListener("pointerup", (e) => {
			if (dragging) {
				dragging = false;
				el.releasePointerCapture(e.pointerId);
				this.requestSave();
			}
		});

		this._positionAnnotationEl(el, ann);
	}

	/** 注釈 DOM 要素をワールド座標→スクリーン座標に変換して配置 */
	private _positionAnnotationEl(el: HTMLElement, ann: { x: number; y: number }): void {
		if (!this.worldContainer || !this.pixiApp) return;
		const screen = this.worldContainer.toGlobal({ x: ann.x, y: ann.y });
		const parentRect = this.annotationLayer?.parentElement?.getBoundingClientRect();
		if (!parentRect) return;
		el.style.left = `${screen.x - parentRect.left}px`;
		el.style.top = `${screen.y - parentRect.top}px`;
	}

	/** 全注釈位置を更新（ズーム/パン時に呼ぶ） */
	private _updateAnnotationPositions(): void {
		if (!this.annotationLayer) return;
		const children = this.annotationLayer.children;
		for (let i = 0; i < children.length && i < this.panel.annotations.length; i++) {
			this._positionAnnotationEl(children[i] as HTMLElement, this.panel.annotations[i]);
		}
	}

	async onClose() {
		clearTimeout(this._autoFitTimer);
		// B3: Clear doRender debounce timer
		clearTimeout(this._doRenderDebounceTimer);
		// Clear all tracked one-shot timers
		for (const id of this._pendingTimers) clearTimeout(id);
		this._pendingTimers.clear();
		// C1: Clear hover preview
		this._cancelHoverPreview();
		// Clean up panel resize listeners (may persist if destroyed mid-drag)
		if (this._resizeOnMove) document.removeEventListener("pointermove", this._resizeOnMove);
		if (this._resizeOnUp) document.removeEventListener("pointerup", this._resizeOnUp);
		if (this._expansionKeyHandler) {
			document.removeEventListener("keydown", this._expansionKeyHandler);
			this._expansionKeyHandler = null;
		}
		this.stopOrbitAnimation();
		this.stopSim();
		this.ac?.abort();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.interactionManager?.detach();
		this.interactionManager = null;
		this.destroyPixi();
		this.statusEl = null;
		this.panelEl = null;
		this.nodeInfoEl = null;
		this.densityCulledBadgeEl = null;
		this.oobBadgeEl = null;
		this.graphStatsEl = null;
		this.relationMatrixEl = null;
		this.thumbnailLayer = null;
		this.thumbnailCache.clear();
		this.hierarchyBreadcrumbEl = null;
		this._helpOverlayEl?.remove();
		this._helpOverlayEl = null;
		this.canvasWrap = null;
		this.annotationLayer = null;
	}

	// =========================================================================
	// Orbit auto-rotation animation
	// =========================================================================
	private startOrbitAnimation() {
		if (this.orbitAnimId !== null) return;
		this.orbitLastTime = performance.now();
		const tick = (now: number) => {
			const dt = (now - this.orbitLastTime) / 1000; // seconds
			this.orbitLastTime = now;
			if (this.shells.length > 0 && this.panel.orbitAutoRotate) {
				const nodeMap = new Map<string, GraphNode>();
				for (const pn of this.pixiNodes.values()) nodeMap.set(pn.data.id, pn.data);
				for (const shell of this.shells) {
					if (shell.radius <= 0 || shell.rotationSpeed === 0) continue;
					shell.angleOffset += shell.rotationDirection * shell.rotationSpeed * dt;
					repositionShell(shell, nodeMap);
				}
				this.markDirty();
			}
			this.orbitAnimId = requestAnimationFrame(tick);
		};
		this.orbitAnimId = requestAnimationFrame(tick);
	}

	private stopOrbitAnimation() {
		if (this.orbitAnimId !== null) {
			cancelAnimationFrame(this.orbitAnimId);
			this.orbitAnimId = null;
		}
	}

	// =========================================================================
	// Canvas 2D lifecycle
	// =========================================================================
	private destroyPixi() {
		if (this.renderPipeline) {
			this.renderPipeline.onPostRender = null;
			this.renderPipeline.detach();
		}
		if (this.minimap) {
			this.minimap.destroy();
			this.minimap = null;
		}
		// Clean up enclosure labels before canvas destroy
		for (const lbl of this.enclosureLabels.values()) {
			try {
				lbl.destroy();
			} catch (_e) {
				/* already destroyed */
			}
		}
		this.enclosureLabels.clear();
		// Clean up groupBy labels
		for (const lbl of this.groupByLabels.values()) {
			try {
				lbl.destroy();
			} catch (_e) {
				/* already destroyed */
			}
		}
		this.groupByLabels.clear();
		this.groupByLabelContainer = null;
		// Clean up zoom-aggregate labels
		for (const lbl of this._aggregateLabels) {
			try {
				lbl.destroy();
			} catch (_e) {
				/* already destroyed */
			}
		}
		this._aggregateLabels = [];
		this._aggregateGraphics = null;
		// Clean up sunburst labels
		for (const lbl of this.sunburstLabels.values()) {
			try {
				lbl.destroy();
			} catch (_e) {
				/* already destroyed */
			}
		}
		this.sunburstLabels.clear();
		for (const lbl of this.clusterSunburstLabels.values()) {
			try {
				lbl.destroy();
			} catch (_e) {
				/* already destroyed */
			}
		}
		this.clusterSunburstLabels.clear();
		this.clusterSunburstLabelContainer = null;
		this.sunburstLayoutArcs = [];
		this.guideRenderer?.clearAll();
		this.pixiNodes.clear();
		this.worldContainer = null;
		this.edgeGraphics = null;
		this.orbitGraphics = null;
		this.guideGraphics = null;
		this.enclosureGraphics = null;
		this.enclosureLabelContainer = null;
		this.sunburstGraphics = null;
		this.sunburstLabelContainer = null;
		this.edgeLabelContainer = null;
		this.nodeCircleBatch = null;
		this.arrowGraphics = null;
		this.routeGraphics = null;
		this.routeData = null;
		this.trayGraphics = null;
		// Keep roadBuilder.trayData across destroyPixi — only rebuild via simulation end handler
		if (this.roadBuilder) this.roadBuilder.reset();
		this.barGraphics = null;
		this.barLabelContainer = null;
		this.linkPreviewGfx = null;
		this.spatialGrid.clear();
		if (this.pixiApp) {
			try {
				this.pixiApp.destroy();
			} catch (_e) {
				// Canvas app state may already be partially torn down
			}
			this.pixiApp = null;
		}
	}

	private handleResize() {
		if (!this.pixiApp || !this.canvasWrap) return;
		const rect = this.canvasWrap.getBoundingClientRect();
		const w = rect.width || DEFAULT_CANVAS_WIDTH;
		const h = rect.height || DEFAULT_CANVAS_HEIGHT;
		this.pixiApp.resize(w, h);
		this.markDirty();
	}

	private initPixi(width: number, height: number): IApp | null {
		try {
			this.destroyPixi();
			if (this.canvasWrap) this.canvasWrap.empty();

			const app = this._createCanvasApp(width, height);
			const canvas = app.view;
			this.pixiApp = app;

			const world = this._setupGraphicsLayers(app);
			this._wireCanvasManagers(canvas, world);

			return app;
		} catch (_e) {
			if (this.canvasWrap) {
				this.canvasWrap.empty();
				this.canvasWrap.createEl("div", {
					cls: "gi-error-fallback",
					text: t("error.pixiInitFailed"),
				});
			}
			return null;
		}
	}

	/** Create the renderer app, attach it to the DOM, and set up accessibility attributes. */
	private _createCanvasApp(width: number, height: number): IApp {
		// Read CSS background
		let bgColor = 0x1e1e1e;
		const style = getComputedStyle(this.canvasWrap!);
		const bgStr =
			style.getPropertyValue("--graph-background").trim() ||
			style.getPropertyValue("--background-primary").trim();
		if (bgStr) {
			try {
				bgColor = cssColorToHex(bgStr);
			} catch (_e) {
				/* keep default */
			}
		}

		const app = createApp({
			width,
			height,
			backgroundColor: bgColor,
			resolution: window.devicePixelRatio || 1,
		});

		// Insert the outermost DOM element (single canvas or wrapper div)
		this.canvasWrap!.appendChild(app.viewContainer);
		const canvas = app.view;
		canvas.style.width = "100%";
		canvas.style.height = "100%";

		// Accessibility: make canvas focusable and identifiable to assistive technology
		canvas.setAttribute("tabindex", "0");
		canvas.setAttribute("role", "application");
		canvas.setAttribute(
			"aria-label",
			t("a11y.canvasLabel") ?? "Interactive graph visualization. Use Tab to cycle nodes, +/- to zoom.",
		);

		// aria-live region for screen reader announcements (focus, zoom changes)
		if (!this._ariaLiveEl) {
			this._ariaLiveEl = this.canvasWrap!.createEl("span", {
				attr: { "aria-live": "polite", "aria-atomic": "true" },
			});
			this._ariaLiveEl.addClass("sr-only");
		}

		return app;
	}

	/** Create the world container and all graphics layers in correct z-order.
	 *  Uses app.createGraphics()/createContainer() so WebGL backend gets GPU-accelerated objects. */
	private _setupGraphicsLayers(app: IApp): CanvasContainer {
		// World container (for zoom/pan)
		const world = new CanvasContainer();
		app.stage.addChild(world);
		this.worldContainer = world;

		// Guide layer (grid lines, axis titles, tick labels — drawn first, behind everything)
		const guideGfx = new CanvasGraphics();
		world.addChild(guideGfx);
		this.guideGraphics = guideGfx;

		// Orbit ring layer (drawn behind edges)
		const orbitGfx = new CanvasGraphics();
		world.addChild(orbitGfx);
		this.orbitGraphics = orbitGfx;

		// Sunburst arc guide lines (drawn behind enclosures)
		const sunburstGfx = new CanvasGraphics();
		world.addChild(sunburstGfx);
		this.sunburstGraphics = sunburstGfx;

		// Route line layer (transit map style — per-group colored paths)
		const routeGfx = new CanvasGraphics();
		world.addChild(routeGfx);
		this.routeGraphics = routeGfx;

		// Road network layer (auto-generated roads from coordinate grid)
		const roadGfx = new CanvasGraphics();
		world.addChild(roadGfx);
		this.trayGraphics = roadGfx;

		// Cluster boundary graphics — behind edges and nodes
		const clusterBoundaryGfx = new CanvasGraphics();
		world.addChild(clusterBoundaryGfx);
		this.clusterBoundaryGraphics = clusterBoundaryGfx;

		// Enclosure layer (tag enclosures, drawn behind edges)
		const enclosureGfx = new CanvasGraphics();
		world.addChild(enclosureGfx);
		this.enclosureGraphics = enclosureGfx;

		// Edge layer (single Graphics object — batch drawn)
		const edgeGfx = new CanvasGraphics();
		world.addChild(edgeGfx);
		this.edgeGraphics = edgeGfx;

		// Edge label layer (CanvasText objects — must be CanvasContainer, not WebGL)
		const edgeLabelCont = new CanvasContainer();
		world.addChild(edgeLabelCont);
		this.edgeLabelContainer = edgeLabelCont;

		// Timeline duration bar layer (drawn behind node circles)
		const barGfx = new CanvasGraphics();
		world.addChild(barGfx);
		this.barGraphics = barGfx;

		// Batch node circle layer — draws all non-highlighted circles in one draw call
		const batchGfx = new CanvasGraphics();
		world.addChild(batchGfx);
		this.nodeCircleBatch = batchGfx;

		// Arrow layer — drawn ON TOP of nodes so directional arrows are visible
		const arrowGfx = new CanvasGraphics();
		world.addChild(arrowGfx);
		this.arrowGraphics = arrowGfx;

		// Pathfinder overlay layer — ON TOP of arrows for maximum visibility
		const pfGfx = new CanvasGraphics();
		world.addChild(pfGfx);
		this.pathfinderGraphics = pfGfx;

		// Bar label container — must be CanvasContainer (children are CanvasText)
		const barLabelCont = new CanvasContainer();
		world.addChild(barLabelCont);
		this.barLabelContainer = barLabelCont;

		// Enclosure label container — must be CanvasContainer (children are CanvasText)
		const labelContainer = new CanvasContainer();
		world.addChild(labelContainer);
		this.enclosureLabelContainer = labelContainer;

		// GroupBy label container — must be CanvasContainer (children are CanvasText)
		const groupLabelContainer = new CanvasContainer();
		world.addChild(groupLabelContainer);
		this.groupByLabelContainer = groupLabelContainer;

		return world;
	}

	/** Wire up InteractionManager, RenderPipeline, and Minimap to the canvas. */
	private _wireCanvasManagers(canvas: HTMLCanvasElement, world: CanvasContainer): void {
		// Set up interaction handling (pointer events, drag, pan, hover, marquee)
		this.interactionManager?.detach();
		this.interactionManager = new InteractionManager(this as unknown as InteractionHost, canvas, world);

		// Group label hover: highlight group members on pointermove
		canvas.addEventListener("pointermove", (e) => {
			if (!this.groupByLabels.size || !this.worldContainer) return;
			const rect = canvas.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			const ws = this.worldContainer.scale.x;
			if (!isFinite(ws) || ws <= 0) return;
			const worldX = this.worldContainer.x;
			const worldY = this.worldContainer.y;

			let hitKey: string | null = null;
			for (const [key, txt] of this.groupByLabels) {
				if (!txt.visible) continue;
				// Screen position of label center
				const sx = txt.x * ws + worldX;
				const sy = txt.y * ws + worldY;
				// Screen-space hit area (target 14px font, ~7px char width)
				const textLen = txt.text?.length ?? 10;
				const hw = textLen * 7 * 0.5 + 10; // half-width + padding
				const hh = 14 + 5; // half-height + padding
				if (mx >= sx - hw && mx <= sx + hw && my >= sy - hh && my <= sy + hh) {
					hitKey = key;
					break;
				}
			}

			if (hitKey !== this._hoveredGroupLabel) {
				this._hoveredGroupLabel = hitKey;
				if (hitKey) {
					const memberIds = this.groupByMembers.get(hitKey);
					if (memberIds && memberIds.size > 0) {
						this.applyEphemeralHighlight(memberIds);
					}
				} else {
					this.applyEphemeralHighlight(null);
				}
			}
		});

		// Group label click: zoom to group members
		canvas.addEventListener("click", (e) => {
			if (!this._hoveredGroupLabel || !this.worldContainer) return;
			const memberIds = this.groupByMembers.get(this._hoveredGroupLabel);
			if (!memberIds || memberIds.size === 0) return;
			e.stopPropagation();
			// Compute bounding box of group members
			let minX = Infinity,
				maxX = -Infinity,
				minY = Infinity,
				maxY = -Infinity;
			for (const id of memberIds) {
				const pn = this.pixiNodes.get(id);
				if (!pn) continue;
				minX = Math.min(minX, pn.gfx.x);
				maxX = Math.max(maxX, pn.gfx.x);
				minY = Math.min(minY, pn.gfx.y);
				maxY = Math.max(maxY, pn.gfx.y);
			}
			if (!isFinite(minX)) return;
			const pad = 100;
			const canvasW = this.canvasWrap?.clientWidth ?? 800;
			const canvasH = this.canvasWrap?.clientHeight ?? 600;
			const scaleX = canvasW / (maxX - minX + pad * 2);
			const scaleY = canvasH / (maxY - minY + pad * 2);
			const scale = Math.min(scaleX, scaleY, 2.0);
			const cx = (minX + maxX) / 2;
			const cy = (minY + maxY) / 2;
			this.worldContainer.scale.set(scale);
			this.worldContainer.x = canvasW / 2 - cx * scale;
			this.worldContainer.y = canvasH / 2 - cy * scale;
			this.applyEphemeralHighlight(null);
			this._hoveredGroupLabel = null;
			this.markDirty(true);
		});

		// Set up render pipeline (render loop, Canvas 2D node creation, batch drawing)
		this.renderPipeline = new RenderPipeline(this);

		// Set up label manager (LOD, truncation, scaling pipeline)
		this.labelManager = new LabelManager(this);

		// Set up guide / grid renderer
		this.guideRenderer = new GuideRenderer(this as unknown as GuideRendererHost);

		// Set up minimap overlay
		this.minimap?.destroy();
		const minimapHost: MinimapHost = {
			getNodePositions: () => {
				const positions: { x: number; y: number; id: string }[] = [];
				for (const pn of this.pixiNodes.values()) {
					positions.push({ x: pn.data.x, y: pn.data.y, id: pn.data.id });
				}
				return positions;
			},
			getWorldTransform: () => ({
				x: world.x,
				y: world.y,
				scaleX: world.scale.x,
				scaleY: world.scale.y,
			}),
			getViewportSize: () => ({
				width: this.canvasWrap?.clientWidth ?? DEFAULT_CANVAS_WIDTH,
				height: this.canvasWrap?.clientHeight ?? DEFAULT_CANVAS_HEIGHT,
			}),
			setWorldPosition: (x: number, y: number) => {
				world.x = x;
				world.y = y;
			},
			wakeRenderLoop: () => this.wakeRenderLoop(),
			announceViewportChange: () => {
				const zoom = this.worldContainer?.scale.x ?? 1;
				this._announceA11y(`Viewport moved — zoom ${Math.round(zoom * 100)}%`);
			},
		};
		this.minimap = new Minimap(minimapHost, this.canvasWrap!);
		this.minimap.setVisible(this.panel.showMinimap);
		this.renderPipeline.onPostRender = () => {
			if (this.pixiApp) {
				this.pixiApp.showDotGrid = this.panel.showDotGrid;
			}
			// FPS monitor (lightweight, always update)
			if (this.fpsEl && this.renderPipeline) {
				const rt = this.panel.renderThresholds ?? {};
				if (rt.showFpsMonitor) {
					this.fpsEl.style.display = "";
					this.fpsEl.textContent = `${this.renderPipeline.currentFps} fps · ${this.renderPipeline.lastFrameMs}ms`;
				} else {
					this.fpsEl.style.display = "none";
				}
			}
			// Skip heavy operations when viewport hasn't changed
			if (!this._viewportDirty) return;
			this._viewportDirty = false;
			if (this.minimap) {
				this.minimap.setRenderThresholds(this.panel.renderThresholds ?? {});
				this.minimap.setVisible(this.panel.showMinimap);
				this.minimap.draw();
			}
			this._updateOobBadge();
			this._updateBookmarkMarkers();
			this._updatePinMarkers();
			this._updateGroupByLabels();
			this._drawZoomAggregates();
		};

		// 密度ヒートマップ + 差分オーバーレイのフック設定
		const pixiApp = this.pixiApp;
		if (pixiApp) {
			pixiApp.onPreFlush = (ctx: CanvasRenderingContext2D, _dpr: number) => {
				if (!this._showDensityHeatmap || !this.pixiNodes || this.pixiNodes.size === 0) return;
				this._renderDensityHeatmap(ctx);
			};
			pixiApp.onPostFlush = (ctx: CanvasRenderingContext2D, _dpr: number) => {
				if (!this.diffOverlay.isActive()) return;
				const w = world;
				this.diffOverlay.render(
					ctx,
					this.pixiNodes,
					{ x: w.x, y: w.y, scale: w.scale.x },
					{
						width: this.canvasWrap?.clientWidth ?? DEFAULT_CANVAS_WIDTH,
						height: this.canvasWrap?.clientHeight ?? DEFAULT_CANVAS_HEIGHT,
					},
				);
			};
		}
	}

	// =========================================================================
	// InteractionHost + RenderHost implementation
	// =========================================================================
	getHighlightedNodeId(): string | null {
		return this.highlightedNodeId;
	}
	setHighlightedNodeId(id: string | null) {
		this.highlightedNodeId = id;
		// Mouse hover clears keyboard focus flag (cycleFocusNode sets it back to true)
		this._isKeyboardFocused = false;
		// C1: Schedule/cancel hover preview
		if (id) {
			this._scheduleHoverPreview(id);
		} else {
			this._cancelHoverPreview();
		}
	}
	// ---- C1: Hover preview toast helpers ----
	private _scheduleHoverPreview(nodeId: string): void {
		this._cancelHoverPreview();
		this._hoverPreviewTimer = window.setTimeout(() => {
			this._showHoverPreview(nodeId);
		}, HOVER_PREVIEW_DELAY_MS) as unknown as number;
	}

	private _cancelHoverPreview(): void {
		if (this._hoverPreviewTimer) {
			clearTimeout(this._hoverPreviewTimer);
			this._hoverPreviewTimer = 0;
		}
		if (this._hoverPreviewEl) {
			this._hoverPreviewEl.remove();
			this._hoverPreviewEl = null;
		}
	}

	private async _showHoverPreview(nodeId: string): Promise<void> {
		const pn = this.pixiNodes.get(nodeId);
		if (!pn?.data.filePath) return;
		const canvasArea = this.canvasWrap;
		const world = this.worldContainer;
		if (!canvasArea || !world) return;

		const tf = this.app.vault.getAbstractFileByPath(pn.data.filePath);
		if (!(tf instanceof TFile)) return;

		let content: string;
		try {
			content = await this.app.vault.cachedRead(tf);
		} catch (_e) {
			return;
		}

		// Strip frontmatter and take first 2 lines
		const stripped = content.replace(/^---[\s\S]*?---\n?/, "").trim();
		const lines = stripped.split("\n").slice(0, 2).join("\n");
		if (!lines) return;

		// If hover target changed while we were reading, abort
		if (this.highlightedNodeId !== nodeId) return;

		// Position at node's screen location
		const sx = pn.data.x * world.scale.x + world.x;
		const sy = pn.data.y * world.scale.y + world.y;

		const el = canvasArea.createDiv({ cls: "gi-hover-preview" });
		el.style.left = `${sx + 15}px`;
		el.style.top = `${sy - 10}px`;
		el.textContent = lines.slice(0, 120) + (lines.length > 120 ? "..." : "");
		this._hoverPreviewEl = el;
	}

	/** Whether the current highlight was set via keyboard (Tab cycling). */
	getIsKeyboardFocused(): boolean {
		return this._isKeyboardFocused;
	}
	getCurrentLayout(): LayoutType {
		return this.currentLayout;
	}
	getShells(): ShellInfo[] {
		return this.shells;
	}
	getNodeShellIndex(): Map<string, number> {
		return this.nodeShellIndex;
	}
	getPixiNodes(): Map<string, PixiNode> {
		return this.pixiNodes;
	}
	getSimulation(): Simulation<GraphNode, GraphEdge> | null {
		return this.simulation;
	}
	getPixiApp(): IApp | null {
		return this.pixiApp;
	}
	openFile(filePath: string) {
		this.app.workspace.openLinkText(filePath, "", false);
	}

	/** ビジュアルリンクエディタが有効かどうか */
	isVisualLinkEditorEnabled(): boolean {
		return false;
	}

	/** Alt+ドラッグでソースファイルに [[target]] wikilink を挿入 */
	async createLink(sourceId: string, targetId: string): Promise<void> {
		try {
			const srcNode = this.pixiNodes.get(sourceId);
			const tgtNode = this.pixiNodes.get(targetId);
			if (!srcNode?.data.filePath || !tgtNode?.data.filePath) {
				showToast(t("toast.linkFailed"));
				return;
			}
			const srcFile = this.app.vault.getAbstractFileByPath(srcNode.data.filePath);
			if (!(srcFile instanceof TFile)) {
				showToast(t("toast.linkFailed"));
				return;
			}
			// ターゲットのベースネーム（拡張子なし）
			const tgtBasename = tgtNode.data.filePath.replace(/^.*\//, "").replace(/\.md$/, "");
			const content = await this.app.vault.read(srcFile);
			// 末尾の空白を保持しつつ、最後の非空白行の後に wikilink を追加
			const trimmed = content.replace(/\s+$/, "");
			const newContent = trimmed + "\n[[" + tgtBasename + "]]\n";
			await this.app.vault.modify(srcFile, newContent);
			// グラフを更新
			this.rawData = null;
			this.doRender();
			// トースト通知
			const srcLabel = srcNode.data.label || sourceId;
			const tgtLabel = tgtNode.data.label || targetId;
			showToast(t("toast.linkCreated").replace("{source}", srcLabel).replace("{target}", tgtLabel));
		} catch (_e) {
			showToast(t("toast.linkFailed"));
		}
	}

	/** リンクプレビュー線を描画（破線シアン） */
	drawLinkPreview(srcX: number, srcY: number, dstX: number, dstY: number): void {
		if (!this.worldContainer) return;
		if (!this.linkPreviewGfx) {
			this.linkPreviewGfx = new CanvasGraphics();
			this.worldContainer.addChild(this.linkPreviewGfx);
		}
		const gfx = this.linkPreviewGfx;
		gfx.clear();
		gfx.setLineDash(LINK_PREVIEW_DASH);
		gfx.lineStyle(LINK_PREVIEW_LINE_WIDTH, LINK_PREVIEW_COLOR, LINK_PREVIEW_LINE_ALPHA);
		gfx.moveTo(srcX, srcY);
		gfx.lineTo(dstX, dstY);
		// ターゲット付近に小円を描画（スナップ表示）
		gfx.setLineDash([]);
		gfx.lineStyle(LINK_PREVIEW_SNAP_LINE_WIDTH, LINK_PREVIEW_COLOR, LINK_PREVIEW_SNAP_ALPHA);
		gfx.drawCircle(dstX, dstY, LINK_PREVIEW_SNAP_RADIUS);
	}

	/** リンクプレビュー線をクリア */
	clearLinkPreview(): void {
		if (this.linkPreviewGfx) {
			this.linkPreviewGfx.clear();
		}
	}

	handleSuperNodeDblClick(pn: import("./InteractionManager").PixiNode): boolean {
		// Expand collapsed super node
		if (pn.data.collapsedMembers && pn.data.id.startsWith("__super__")) {
			const groupKey = pn.data.id.replace("__super__", "");
			this.panel.collapsedGroups.delete(groupKey);
			this.rawData = null;
			this.doRender();
			this.requestSave();
			return true;
		}
		// Collapse node back into its group
		if (this.panel.groupBy && this.panel.groupBy !== "none" && this.originalGraphData) {
			const groupOpts: GroupOptions = { minSize: this.panel.groupMinSize, filter: this.panel.groupFilter };
			const groups = this.resolveGroupByField(this.originalGraphData.nodes, groupOpts);
			const parentGroup = groups.find((g) => g.memberIds.includes(pn.data.id));
			if (parentGroup && !this.panel.collapsedGroups.has(parentGroup.key)) {
				this.panel.collapsedGroups.add(parentGroup.key);
				this.rawData = null;
				this.doRender();
				this.requestSave();
				return true;
			}
		}
		return false;
	}
	/** Resolve groupBy string to GroupSpec[] using the generic field grouping.
	 *  Supports both legacy format ("tag, category") and new format ("tag:? AND category:?").
	 *  Operators (AND/OR/XOR/...) are stripped; each field is grouped independently. */
	private resolveGroupByField(nodes: GraphNode[], opts: GroupOptions): GroupSpec[] {
		const fields = parseGroupByFields(this.panel.groupBy);
		const allGroups: GroupSpec[] = [];
		for (const raw of fields) {
			if (raw === "louvain") {
				allGroups.push(...this.resolveLouvainGroups(nodes, opts));
				continue;
			}
			allGroups.push(...groupNodesByField(nodes, raw, opts));
		}
		return allGroups;
	}

	/** Louvain アルゴリズムでコミュニティを検出し GroupSpec[] を返す。
	 *  結果は rawData が変わるまでキャッシュする。 */
	private resolveLouvainGroups(nodes: GraphNode[], opts: GroupOptions): GroupSpec[] {
		// キャッシュが有効ならそのまま返す（rawData の参照一致で判定）
		if (this.louvainCache && this.louvainCache.dataRef === this.rawData) {
			return this.louvainCache.groups;
		}

		// 現在のグラフデータからエッジ情報を取得
		const graphData = this.rawData ?? this.originalGraphData;
		if (!graphData) return [];

		const nodeIds = nodes.filter((n) => !n.isTag).map((n) => n.id);
		const edges = graphData.edges.map((e) => ({
			source: e.source,
			target: e.target,
			weight: 1,
		}));

		const communityMap = louvainCommunities(nodeIds, edges);

		// コミュニティIDごとにノードを集約
		const minSize = opts?.minSize ?? 2;
		const commGroups = new Map<number, string[]>();
		for (const [nodeId, commId] of communityMap) {
			pushToMapArray(commGroups, commId, nodeId);
		}

		const groups: GroupSpec[] = [];
		for (const [commId, memberIds] of commGroups) {
			if (memberIds.length < minSize) continue;
			groups.push({
				key: `louvain:${commId}`,
				label: `Community ${commId + 1}`,
				memberIds,
			});
		}

		// キャッシュに保存
		if (this.rawData) {
			this.louvainCache = { dataRef: this.rawData, groups };
		}

		return groups;
	}

	/** Cached Louvain community map — recomputed only when graph data changes */
	private _getCommunityMap(gd: GraphData): Map<string, number> {
		if (this._communityMapCache && this._communityMapCache.ref === this.originalGraphData) {
			return this._communityMapCache.map;
		}
		const nodeIds = gd.nodes.map((n) => n.id);
		const edges = gd.edges.map((e) => ({ source: e.source, target: e.target }));
		const map = louvainCommunities(nodeIds, edges);
		this._communityMapCache = { ref: this.originalGraphData, map };
		return map;
	}

	getWorldContainer(): CanvasContainer | null {
		return this.worldContainer;
	}
	getNodeCircleBatch(): CanvasGraphics | null {
		return this.nodeCircleBatch;
	}
	getDegrees(): Map<string, number> {
		return this.degrees;
	}
	getEnclosureLabels(): Map<string, CanvasText> {
		return this.enclosureLabels;
	}
	getPrevHighlightSet(): Set<string> {
		return this.prevHighlightSet;
	}
	getSearchQuery(): string {
		return this.panel.searchQuery ?? "";
	}
	getEphemeralHighlight(): Set<string> | null {
		return this.ephemeralHighlight;
	}
	getPanel(): PanelState {
		return this.panel;
	}
	setSimulation(sim: Simulation<GraphNode, GraphEdge> | null) {
		this.simulation = sim;
	}
	getGraphEdges(): GraphEdge[] {
		return this.graphEdges;
	}
	getTagMembership(): Map<string, Set<string>> {
		return this.tagMembership;
	}
	getTagRelPairsCache(): Set<string> {
		return this.tagRelPairsCache;
	}
	getCanvasSize(): { width: number; height: number } {
		const rect = this.canvasWrap?.getBoundingClientRect();
		return { width: rect?.width || DEFAULT_CANVAS_WIDTH, height: rect?.height || DEFAULT_CANVAS_HEIGHT };
	}
	getSettingsDirectionalGravityRules(): DirectionalGravityRule[] {
		return this.plugin.settings.directionalGravityRules ?? [];
	}
	setClusterMeta(meta: ClusterMetadata | null) {
		this.clusterMeta = meta;
		this.routeData = meta?.timelineRoutes ?? null;
		// Road network is rebuilt in the simulation "end" handler when node positions are final
		// Merge/remove synthetic sequence edges from graphEdges
		// First remove any existing synthetic sequence edges
		this.graphEdges = this.graphEdges.filter((e) => !e.id.startsWith("__seq__"));
		// Then add new ones from the cluster metadata
		if (meta?.sequenceEdges && meta.sequenceEdges.length > 0) {
			this.graphEdges = [...this.graphEdges, ...meta.sequenceEdges];
		}
		invalidateBundleCache(this.edgeCache);
	}
	getNodeProperty(nodeId: string, key: string): string | undefined {
		// Virtual properties (computed, not from frontmatter)
		if (key === "degree") return String(this.degrees.get(nodeId) ?? 0);
		if (key === "radius") {
			const pn = this.pixiNodes.get(nodeId);
			return pn ? String(Math.round(pn.radius)) : undefined;
		}
		const pn = this.pixiNodes.get(nodeId);
		const fp = pn?.data.filePath;
		if (!fp) return undefined;
		const tf = this.app.vault.getAbstractFileByPath(fp);
		if (!(tf instanceof TFile)) return undefined;
		const cache = this.app.metadataCache.getFileCache(tf);
		const val = cache?.frontmatter?.[key];
		return val !== undefined && val !== null ? String(val) : undefined;
	}
	getSequenceFields(): string[] {
		const fields = this.plugin.settings.ontology?.sequenceFields;
		return fields && fields.length > 0 ? fields : DEFAULT_ONTOLOGY.sequenceFields;
	}
	getReverseSequenceFields(): string[] {
		const fields = this.plugin.settings.ontology?.reverseSequenceFields;
		return fields && fields.length > 0 ? fields : DEFAULT_ONTOLOGY.reverseSequenceFields;
	}
	getNodeShapeRules() {
		return this.panel.nodeShapeRules;
	}
	private static readonly _EMPTY_STRING_SET = new Set<string>();
	getSearchHiddenNodes() {
		return GraphViewContainer._EMPTY_STRING_SET;
	}
	getDefinitionField() {
		return this.panel.definitionField ?? "";
	}
	updateDensityCulledBadge(count: number) {
		if (!this.densityCulledBadgeEl) return;
		if (count > 0) {
			// Show culled count + top folder summary at extreme zoom-out
			let text = t("density.moreHidden").replace("{count}", String(count));
			const zoom = this.worldContainer?.scale?.x ?? 1;
			if (zoom < EXTREME_ZOOM_THRESHOLD && this.pixiNodes.size > 0) {
				const folders = new Map<string, number>();
				for (const pn of this.pixiNodes.values()) {
					if (!pn.label?.visible) continue;
					const parts = pn.data.id.split("/");
					if (parts.length > 1) {
						const folder = parts[0];
						incCounter(folders, folder);
					}
				}
				if (folders.size > 0) {
					const top = [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
					text += ` · ${top.map(([f]) => f.replace(/^classic-/, "")).join(", ")}`;
				}
			}
			this.densityCulledBadgeEl.textContent = text;
			this.densityCulledBadgeEl.style.display = "";
		} else {
			this.densityCulledBadgeEl.style.display = "none";
		}
	}
	getSemanticZoom() {
		return this.panel.semanticZoom ?? false;
	}
	getShowEntropyOverlay() {
		return this.panel.showEntropyOverlay;
	}
	getEntropyScores(): Map<string, number> | null {
		// Lazy compute: if enabled but not yet computed, compute now
		if (this.panel.showEntropyOverlay && !this._entropyScores) {
			this.updateEntropyScores();
		}
		return this._entropyScores;
	}
	getMultiSelectNodeIds(): string[] {
		return this.panel.multiSelectNodeIds;
	}

	/** S1: Build hierarchy tree from focused node via is-a/parent edges */
	getHierarchyTree(): Map<string, string> | null {
		if (!this.panel.showHierarchyTree) return null;
		const rootId = this.panel.focusNodeId || this.highlightedNodeId;
		if (!rootId) return null;
		const relTypes = new Set(this.panel.hierarchyRelations ?? ["inheritance", "is-a", "has-a"]);
		const tree = new Map<string, string>();
		const visited = new Set<string>([rootId]);
		let frontier = [rootId];
		for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
			const next: string[] = [];
			for (const parentId of frontier) {
				for (const e of this.graphEdges) {
					const src = edgeSourceId(e);
					const tgt = edgeTargetId(e);
					if (!relTypes.has(e.type ?? "") && !relTypes.has(e.relation ?? "")) continue;
					const childId = src === parentId ? tgt : tgt === parentId ? src : null;
					if (childId && !visited.has(childId)) {
						visited.add(childId);
						tree.set(childId, parentId);
						next.push(childId);
					}
				}
			}
			frontier = next;
		}
		return tree.size > 0 ? tree : null;
	}

	/** S6: Get ontology backbone (is-a hierarchy edges) */
	getOntologyBackbone(): { from: string; to: string }[] | null {
		if (!this.panel.showOntologyBackbone) return null;
		const result: { from: string; to: string }[] = [];
		for (const e of this.graphEdges) {
			const t = e.type ?? "";
			const r = e.relation ?? "";
			if (t === "inheritance" || r === "is-a" || r === "parent") {
				const src = edgeSourceId(e);
				const tgt = edgeTargetId(e);
				result.push({ from: src, to: tgt });
			}
		}
		return result.length > 0 ? result : null;
	}

	/** S4: Detect structural gaps — nodes that should be connected but aren't */
	getStructuralGaps(): { from: string; to: string }[] | null {
		if (!this.panel.showGapEdges) return null;
		if (!this._gapCache) {
			this._gapCache = this._computeGaps();
		}
		return this._gapCache;
	}

	private _gapCache: { from: string; to: string }[] | null = null;
	private _computeGaps(): { from: string; to: string }[] {
		const nodes = Array.from(this.pixiNodes.values(), (pn) => pn.data);
		return computeGaps(nodes, this.adj);
	}

	getCanvasDimensions() {
		return {
			width: this.canvasWrap?.clientWidth ?? DEFAULT_CANVAS_WIDTH,
			height: this.canvasWrap?.clientHeight ?? DEFAULT_CANVAS_HEIGHT,
		};
	}

	/** Return current graph nodes (for cell-shading density heatmap). */
	getCurrentNodes(): GraphNode[] | undefined {
		if (this.pixiNodes.size === 0) return undefined;
		const nodes: GraphNode[] = [];
		for (const pn of this.pixiNodes.values()) nodes.push(pn.data);
		return nodes;
	}

	isRingChartMode(): boolean {
		return this.panel.ringChartMode;
	}

	getNodeSubLabelFields(): string {
		return this.panel.nodeSubLabelFields ?? "";
	}
	getNodeIconConfig(): { field: string; map: Record<string, string> } | null {
		const field = this.panel.nodeIconField ?? "";
		if (!field) return null;
		return { field, map: this.panel.nodeIconMap ?? {} };
	}
	getNodeDisplayMode() {
		return this.panel.nodeDisplayMode ?? "node";
	}
	getCardDisplayConfig() {
		return this.panel.cardDisplayConfig ?? { fields: [], maxWidth: 120, showIcon: false };
	}
	getDonutDisplayConfig() {
		return this.panel.donutDisplayConfig ?? { innerRadius: 0.6 };
	}
	getRenderThresholds() {
		const rt = this.panel.renderThresholds ?? {};
		// Suppress per-node tag labels when enclosure mode shows tags via hull labels
		if (this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
			return { ...rt, tagLabelShow: false };
		}
		return rt;
	}
	getTextFadeThreshold(): number {
		return this.panel.textFadeThreshold;
	}
	getWorldScale(): number {
		return this.worldContainer?.scale.x ?? 1;
	}
	isHighContrastMode(): boolean {
		return this.panel.highContrastMode;
	}
	getZoomSensitivity(): number {
		return this.panel.zoomSensitivity ?? 1.0;
	}
	getRenderPipeline(): RenderPipeline | null {
		return this.renderPipeline;
	}
	getSunburstLabels(): Map<string, CanvasText> {
		return this.sunburstLabels;
	}
	getClusterSunburstLabels(): Map<string, CanvasText> {
		return this.clusterSunburstLabels;
	}
	getNodeSize() {
		return this.panel.nodeSize;
	}
	getAdjacency() {
		return this.adj;
	}

	// =========================================================================
	// Zoom & Hit testing
	// =========================================================================

	/** Rebuild the spatial hash grid from current node positions.
	 *  Reuses existing cell arrays to reduce GC pressure. */
	rebuildSpatialGrid() {
		// Clear cell arrays without deallocating them
		for (const cell of this.spatialGrid.values()) cell.length = 0;
		const cs = this.spatialCellSize;
		for (const pn of this.pixiNodes.values()) {
			const key = `${Math.floor(pn.data.x / cs)},${Math.floor(pn.data.y / cs)}`;
			let cell = this.spatialGrid.get(key);
			if (!cell) {
				cell = [];
				this.spatialGrid.set(key, cell);
			}
			cell.push(pn);
		}
	}

	hitTestNode(wx: number, wy: number): PixiNode | null {
		const cs = this.spatialCellSize;
		const cx = Math.floor(wx / cs);
		const cy = Math.floor(wy / cs);

		let closest: PixiNode | null = null;
		let closestDist = Infinity;

		const cfg = this._prepareHitTestConfig();

		// Determine if grid search can cover the hit radius, otherwise brute-force
		const maxHitWorld =
			cfg.displayMode === "card" ? Math.max(cfg.hitCardMaxHalfW, cfg.hitCardHalfH) + cfg.pad : cfg.hitWorldR;
		const gridSearchLimit = 20;
		const neededCells = Math.ceil(maxHitWorld / cs);
		const useGrid = neededCells <= gridSearchLimit;

		const hitTest = (pn: PixiNode) => {
			const ddx = pn.data.x - wx;
			const ddy = pn.data.y - wy;
			const dist = ddx * ddx + ddy * ddy;
			if (cfg.displayMode === "card") {
				const effR = Math.max(pn.radius, cfg.minWorldRadius);
				const halfW = Math.min(
					cfg.hitCardMaxHalfW,
					cfg.hitCardAspectRatio > 0 ? cfg.hitCardHalfH * cfg.hitCardAR : effR * cfg.hitCardWidthFactor,
				);
				if (
					Math.abs(ddx) <= halfW + cfg.pad &&
					Math.abs(ddy) <= cfg.hitCardHalfH + cfg.pad &&
					dist < closestDist
				) {
					closestDist = dist;
					closest = pn;
				}
			} else {
				const effR = Math.max(pn.radius, cfg.minWorldRadius);
				const r = Math.max(effR * cfg.glowRadius, cfg.hitScreenPx / cfg.zoom) + cfg.pad;
				if (dist < r * r && dist < closestDist) {
					closestDist = dist;
					closest = pn;
				}
			}
		};

		if (useGrid) {
			const searchCells = Math.max(1, neededCells);
			for (let dx = -searchCells; dx <= searchCells; dx++) {
				for (let dy = -searchCells; dy <= searchCells; dy++) {
					const cell = this.spatialGrid.get(`${cx + dx},${cy + dy}`);
					if (!cell) continue;
					for (const pn of cell) hitTest(pn);
				}
			}
		} else {
			for (const pn of this.pixiNodes.values()) hitTest(pn);
		}

		if (!closest) {
			closest = this._hitTestTimelineBars(wx, wy);
		}

		return closest;
	}

	/** Pre-compute all configuration values needed for hit testing. */
	private _prepareHitTestConfig() {
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const minScreenPx = rt.minHoverScreenPx;
		const zoom = this.worldContainer?.scale?.x ?? 1;
		const minWorldRadius = Math.max(0, MIN_WORLD_RADIUS_PX / zoom);
		const pad = rt.collisionPadding;
		const displayMode = this.panel.nodeDisplayMode ?? "node";
		const glowRadius = rt.glowBaseRadius;
		const hitScreenPx = Math.max(MIN_WORLD_RADIUS_PX * glowRadius, minScreenPx);
		const hitWorldR = hitScreenPx / zoom + pad;

		let hitCardMaxHalfW = 0;
		let hitCardAR = 0;
		let hitCardWidthFactor = 0;
		let hitCardAspectRatio = 0;
		let hitCardHalfH = 0;
		if (displayMode === "card") {
			const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };
			const cardConfig = this.panel.cardDisplayConfig ?? { fields: [], maxWidth: 120, showIcon: false };
			const headerStyle = cardConfig.headerStyle ?? "plain";
			const fieldLineH = crc.fieldLineHeight / zoom;
			hitCardMaxHalfW = (cardConfig.maxWidth ?? 120) / zoom / 2;
			hitCardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : GOLDEN_RATIO_FALLBACK;
			hitCardWidthFactor = crc.cardWidthFactor;
			hitCardAspectRatio = crc.cardAspectRatio;
			if (headerStyle === "table") {
				const headerH = crc.tableHeaderHeight / zoom;
				const cardPad = crc.cardPadding / zoom;
				const hasDefField = (this.panel.definitionField ?? "").length > 0 ? 1 : 0;
				const hasPreview = 1; // bodyPreview row
				const fieldCount = (cardConfig.fields?.length ?? 0) + hasDefField + hasPreview;
				hitCardHalfH = (headerH + fieldCount * fieldLineH + cardPad * 2) / 2;
			} else {
				// HM: Plain card uses base height (golden ratio width derived from this)
				const plainH = crc.plainCardHeight / zoom;
				const metaH = (cardConfig.fields?.length ?? 0) > 0 ? (cardConfig.fields?.length ?? 0) * fieldLineH : 0;
				hitCardHalfH = (plainH + metaH) / 2;
			}
		}

		return {
			zoom,
			minWorldRadius,
			pad,
			displayMode,
			glowRadius,
			hitScreenPx,
			hitWorldR,
			hitCardMaxHalfW,
			hitCardAR,
			hitCardWidthFactor,
			hitCardAspectRatio,
			hitCardHalfH,
		};
	}

	/** Hit-test timeline duration bars (rectangles). */
	private _hitTestTimelineBars(wx: number, wy: number): PixiNode | null {
		const bars = this.clusterMeta?.timelineBars;
		if (!bars || bars.length === 0) return null;
		const nodeId = hitTestTimelineBars(bars, wx, wy);
		return nodeId ? (this.pixiNodes.get(nodeId) ?? null) : null;
	}

	/** Toggle hold (pin) state for a node and persist to pinnedPositions */
	toggleHold(pn: PixiNode) {
		pn.held = !pn.held;
		if (pn.held) {
			pn.data.fx = pn.data.x;
			pn.data.fy = pn.data.y;
			// Persist pinned position
			this.panel.pinnedPositions[pn.data.id] = { x: pn.data.x, y: pn.data.y };
		} else {
			pn.data.fx = null;
			pn.data.fy = null;
			// Remove from persisted positions
			delete this.panel.pinnedPositions[pn.data.id];
		}
	}

	/** フォーカスモード: 通常クリック時のみハイライトを固定 (Ctrl+clickでは呼ばない) */
	applyFocusOnClick(nodeId: string): void {
		// D2: Show in-canvas node expansion panel on click
		this._showNodeExpansion(nodeId);
		if (!this.panel.focusMode) return;
		if (this.panel.focusNodeId === nodeId) {
			this.panel.focusNodeId = null;
		} else {
			this.panel.focusNodeId = nodeId;
		}
		// M2: focusLayout → switch to ego arrangement and re-render
		if (this.panel.focusLayout && this.panel.focusNodeId) {
			this.panel.localGraphCenter = this.panel.focusNodeId;
			this.panel.clusterArrangement = "ego";
			this.doRender();
			return;
		}
		this._applyFocusHighlight();
	}

	// D2: Show in-canvas node expansion panel
	private _showNodeExpansion(nodeId: string): void {
		const pn = this.pixiNodes.get(nodeId);
		if (!pn?.data.filePath) return;
		const canvasArea = this.canvasWrap;
		const world = this.worldContainer;
		if (!canvasArea || !world) return;

		// Remove existing expansion
		const existing = canvasArea.querySelector(".gi-node-expand");
		if (existing) existing.remove();

		// Screen coordinates
		const sx = pn.data.x * world.scale.x + world.x;
		const sy = pn.data.y * world.scale.y + world.y;

		const panel = canvasArea.createDiv({ cls: "gi-node-expand" });
		panel.style.left = `${sx + 20}px`;
		panel.style.top = `${sy - 20}px`;

		// Title
		panel.createEl("div", { cls: "gi-node-expand-title", text: pn.data.label });

		// Meta
		const metaLine: string[] = [];
		if (pn.data.category) metaLine.push(pn.data.category);
		if (pn.data.tags?.length) metaLine.push(pn.data.tags.map((tg: string) => `#${tg}`).join(" "));
		if (metaLine.length) panel.createEl("div", { cls: "gi-node-expand-meta", text: metaLine.join(" \u00b7 ") });

		// Body preview — read file content async
		const bodyEl = panel.createEl("div", { cls: "gi-node-expand-body", text: t("hover.loading") });
		const tf = this.app.vault.getAbstractFileByPath(pn.data.filePath);
		if (tf instanceof TFile) {
			this.app.vault
				.cachedRead(tf)
				.then((content) => {
					const stripped = content.replace(/^---[\s\S]*?---\n?/, "").trim();
					bodyEl.textContent = stripped.slice(0, BODY_PREVIEW_MAX_CHARS) + (stripped.length > BODY_PREVIEW_MAX_CHARS ? "..." : "");
				})
				.catch(() => {
					bodyEl.textContent = t("hover.couldNotRead");
				});
		}

		// Actions
		const actions = panel.createDiv({ cls: "gi-node-expand-actions" });
		const closePanel = () => {
			panel.remove();
			if (this._expansionKeyHandler) {
				document.removeEventListener("keydown", this._expansionKeyHandler);
				this._expansionKeyHandler = null;
			}
		};

		const openBtn = actions.createEl("button", { text: t("detail.openFile"), cls: "mod-cta" });
		openBtn.addEventListener("click", () => {
			this.openFile(pn.data.filePath!);
			closePanel();
		});
		const closeBtn = actions.createEl("button", { text: t("action.cancel") });
		closeBtn.addEventListener("click", closePanel);

		// ESC to close
		this._expansionKeyHandler = (ev: KeyboardEvent) => {
			if (ev.key === "Escape") closePanel();
		};
		document.addEventListener("keydown", this._expansionKeyHandler);
	}

	/** Clear all held nodes */
	clearAllHolds() {
		for (const pn of this.pixiNodes.values()) {
			if (pn.held) {
				pn.held = false;
				pn.data.fx = null;
				pn.data.fy = null;
			}
		}
	}

	// =========================================================================
	// Pathfinder (shortest path between two nodes)
	// =========================================================================
	setPathfinderNode(nodeId: string, role: "start" | "end") {
		if (role === "start") this.pathfinderStartId = nodeId;
		else this.pathfinderEndId = nodeId;
		this.computePathfinderPath();
		this.markDirty(true);
	}

	clearPathfinder() {
		this.pathfinderStartId = null;
		this.pathfinderEndId = null;
		this.pathfinderPath = null;
		this.pathfinderNodeSet = null;
		this.pathfinderEdgeSet = null;
		if (this.pathfinderGraphics) this.pathfinderGraphics.clear();
		if (this.pathfinderLabel) {
			this.pathfinderLabel.destroy();
			this.pathfinderLabel = null;
		}
		this._pathfinderFrame = 0;
		this.markDirty(true);
	}

	getPathfinderState() {
		return { startId: this.pathfinderStartId, endId: this.pathfinderEndId };
	}

	// =========================================================================
	// 比較選択 (Ctrl+click で最大2ノード選択 → 比較パネルに通知)
	// =========================================================================
	addCompareNode(nodeId: string) {
		// 既に選択済みならトグル解除
		const idx = this.compareNodeIds.indexOf(nodeId);
		if (idx >= 0) {
			this.compareNodeIds.splice(idx, 1);
		} else {
			// W3: FIFO: 4件を超えたら最も古いものを除去 (expanded from 2)
			if (this.compareNodeIds.length >= 4) {
				this.compareNodeIds.shift();
			}
			this.compareNodeIds.push(nodeId);
		}
		this.notifyCompare();
		this.markDirty(true);
	}

	clearCompareSelection() {
		if (this.compareNodeIds.length === 0) return;
		this.compareNodeIds = [];
		this.notifyCompare();
		this.markDirty(true);
	}

	getCompareNodeIds(): string[] {
		return this.compareNodeIds;
	}

	/** W3: Compute Venn-like exclusive/shared neighbor sets for compare nodes */
	computeCompareVenn(): { exclusive: Map<string, Set<string>>; shared: Set<string> } | null {
		if (!this.adj) return null;
		return computeCompareVenn(this.compareNodeIds, this.adj);
	}

	// =========================================================================
	// ブックマーク (Feature L)
	// =========================================================================
	/** ノードのブックマークをトグル */
	toggleBookmark(nodeId: string) {
		const idx = this.panel.bookmarkedNodes.indexOf(nodeId);
		if (idx >= 0) {
			this.panel.bookmarkedNodes.splice(idx, 1);
		} else {
			this.panel.bookmarkedNodes.push(nodeId);
		}
		this.requestSave();
		this.markDirty(true);
		this.buildPanel();
	}

	/** ノードがブックマーク済みかどうか */
	isBookmarked(nodeId: string): boolean {
		return this.panel.bookmarkedNodes.includes(nodeId);
	}

	// =========================================================================
	// D1: Expandable nodes (ExcaliBrain-style)
	// =========================================================================
	/** Toggle expand/collapse of a node's neighbors in local graph mode */
	toggleExpandNode(nodeId: string): void {
		const expanded = this.panel.expandedNodes ?? [];
		const idx = expanded.indexOf(nodeId);
		if (idx >= 0) {
			expanded.splice(idx, 1);
		} else {
			expanded.push(nodeId);
		}
		this.panel.expandedNodes = expanded;
		this.rawData = null;
		this.doRender();
	}

	/** Check if a node is expanded */
	isNodeExpanded(nodeId: string): boolean {
		return this.panel.expandedNodes?.includes(nodeId) ?? false;
	}

	/** ブックマーク済みノードIDセットを取得（RenderHost用） */
	getBookmarkedNodeIds(): Set<string> {
		if (!this._cachedBookmarkSet) {
			this._cachedBookmarkSet = new Set(this.panel.bookmarkedNodes ?? []);
		}
		return this._cachedBookmarkSet;
	}

	// =========================================================================
	// Subgraph Export (Feature CY)
	// =========================================================================
	/** Export an N-hop subgraph around a node as a JSON download. */
	exportSubgraph(nodeId: string): void {
		if (!this.adj || !this.graphEdges) return;
		const nodes = [...this.pixiNodes.values()].map((pn) => pn.data);
		const edges = this.graphEdges;
		const hops = this.panel.hoverHops || 2;
		const sub = collectSubgraph(this.adj, nodeId, hops, nodes, edges);
		const json = exportSubgraphJSON(sub);

		// Download as file
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		const pn = this.pixiNodes.get(nodeId);
		const label = pn?.data?.label ?? nodeId;
		a.download = `subgraph-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		// Toast notification
		const msg = t("toast.subgraphExported")
			.replace("{nodes}", String(sub.nodes.length))
			.replace("{edges}", String(sub.edges.length));
		new Notice(msg, TOAST_MEDIUM_MS);
	}

	setSearchQuery(query: string): void {
		this.panel.searchQuery = query;
		this.rawData = null;
		this.doRender();
		this.requestSave();
		// A11y: announce filter change result
		const visibleCount = this.pixiNodes.size;
		this._announceA11y(
			query ? `Filter: "${query}" — ${visibleCount} nodes` : `Filter cleared — ${visibleCount} nodes`,
		);
	}

	// ED: Viewport bookmark
	saveViewport(name: string): void {
		const world = this.worldContainer;
		if (!world) return;
		if (!this.panel.savedViewports) this.panel.savedViewports = [];
		this.panel.savedViewports = this.panel.savedViewports.filter((v) => v.name !== name);
		this.panel.savedViewports.push({ name, x: world.x, y: world.y, scale: world.scale.x });
		this.requestSave();
		new Notice(`Viewport saved: ${name}`, TOAST_SHORT_MS);
	}
	restoreViewport(name: string): void {
		const world = this.worldContainer;
		if (!world) return;
		const vp = (this.panel.savedViewports ?? []).find((v) => v.name === name);
		if (!vp) return;
		world.x = vp.x;
		world.y = vp.y;
		world.scale.set(vp.scale);
		this.updateLabelsForZoom();
		this.updateZoomIndicator(vp.scale);
		this.markDirty();
	}
	getSavedViewportNames(): string[] {
		return (this.panel.savedViewports ?? []).map((v) => v.name);
	}

	// Nodes tab helpers
	private _getNodeTreeData(): import("./PanelBuilder").NodeTreeEntry[] {
		const visibleIds = new Set(this.pixiNodes.keys());
		const allFiles = this.app.vault.getMarkdownFiles();
		return allFiles.map((f) => ({
			id: f.path,
			label: f.basename,
			path: f.path,
			isVisible: visibleIds.has(f.path),
		}));
	}

	private _getForwardLinks(nodeId: string): string[] {
		if (!this.graphEdges) return [];
		return this.graphEdges.filter((e) => e.source === nodeId).map((e) => e.target);
	}

	private _getBacklinks(nodeId: string): string[] {
		if (!this.graphEdges) return [];
		return this.graphEdges.filter((e) => e.target === nodeId).map((e) => e.source);
	}

	private _toggleNodeVisibility(nodeId: string): void {
		if (!this.panel.excludeNodes) this.panel.excludeNodes = [];
		const idx = this.panel.excludeNodes.indexOf(nodeId);
		if (idx >= 0) {
			this.panel.excludeNodes.splice(idx, 1);
		} else {
			this.panel.excludeNodes.push(nodeId);
		}
		this.rawData = null;
		this.doRender();
		this.requestSave();
	}

	// FC: Export graph canvas as PNG
	exportPng(): void {
		const canvas = this.pixiApp?.view;
		if (!canvas) return;
		canvas.toBlob((blob: Blob | null) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `graph-island-${new Date().toISOString().slice(0, 10)}.png`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			new Notice("Graph exported as PNG", TOAST_SHORT_MS);
		}, "image/png");
	}

	exportFullGraph(): void {
		const gd = this.getGraphData();
		const json = exportFullGraphJSON(gd.nodes, gd.edges);
		downloadFile(
			json,
			"application/json",
			`graph-island-export-${new Date().toISOString().slice(0, 10)}.json`,
		);
		new Notice(`Graph exported: ${gd.nodes.length} nodes, ${gd.edges.length} edges`, TOAST_MEDIUM_MS);
	}

	exportGraphAsCSV(): void {
		const gd = this.getGraphData();
		const csv = exportGraphCSV(gd.nodes, gd.edges);
		downloadFile(csv, "text/csv", `graph-island-${new Date().toISOString().slice(0, 10)}.csv`);
		new Notice(`CSV exported: ${gd.nodes.length} nodes, ${gd.edges.length} edges`, TOAST_MEDIUM_MS);
	}

	exportGraphAsMermaid(): void {
		const gd = this.getGraphData();
		const mmd = exportGraphMermaid(gd.nodes, gd.edges);
		navigator.clipboard
			.writeText(mmd)
			.then(() => {
				new Notice(`Mermaid diagram copied to clipboard (${Math.min(MOBILE_NODE_CAP, gd.nodes.length)} nodes)`, TOAST_MEDIUM_MS);
			})
			.catch(() => {
				downloadFile(mmd, "text/plain", `graph-island-${new Date().toISOString().slice(0, 10)}.mmd`);
			});
	}


	// =========================================================================
	// C3+F2: Ontology type picker & relation type picker
	// =========================================================================

	isInlineOntologyEnabled(): boolean {
		return false;
	}
	isRelationTypePickerEnabled(): boolean {
		return false;
	}

	getNeighborIds(nodeId: string): string[] {
		const nb = this.adj.get(nodeId);
		return nb ? [...nb] : [];
	}

	/** F2: Set node_type in frontmatter */
	async setNodeOntologyType(nodeId: string, type: string): Promise<void> {
		const pn = this.pixiNodes.get(nodeId);
		if (!pn?.data.filePath) return;
		try {
			const tf = this.app.vault.getAbstractFileByPath(pn.data.filePath);
			if (!(tf instanceof TFile)) return;
			const content = await this.app.vault.read(tf);
			const newContent = setFrontmatterField(content, "node_type", type);
			await this.app.vault.modify(tf, newContent);
			this.rawData = null;
			this.doRender();
			showToast(t("toast.ontologySet").replace("{type}", type));
		} catch (_e) {
			showToast(t("toast.ontologyFailed"));
		}
	}

	/** C3: Add a relation entry to frontmatter */
	async addRelationToNode(nodeId: string, targetId: string, relType: string): Promise<void> {
		const srcPn = this.pixiNodes.get(nodeId);
		const tgtPn = this.pixiNodes.get(targetId);
		if (!srcPn?.data.filePath || !tgtPn?.data.filePath) return;
		try {
			const tf = this.app.vault.getAbstractFileByPath(srcPn.data.filePath);
			if (!(tf instanceof TFile)) return;
			const tgtBasename = tgtPn.data.filePath.replace(/^.*\//, "").replace(/\.md$/, "");
			const content = await this.app.vault.read(tf);
			const entry = `${relType}::[[${tgtBasename}]]`;
			const trimmed = content.replace(/\s+$/, "");
			const newContent = trimmed + "\n" + entry + "\n";
			await this.app.vault.modify(tf, newContent);
			this.rawData = null;
			this.doRender();
			showToast(t("toast.relationAdded").replace("{type}", relType));
		} catch (_e) {
			showToast(t("toast.relationFailed"));
		}
	}

	// =========================================================================
	// C6: Multi-select
	// =========================================================================

	toggleMultiSelect(nodeId: string): void {
		const idx = this.panel.multiSelectNodeIds.indexOf(nodeId);
		if (idx >= 0) {
			this.panel.multiSelectNodeIds.splice(idx, 1);
		} else {
			this.panel.multiSelectNodeIds.push(nodeId);
		}
		// A11y: announce selection count for screen readers
		const count = this.panel.multiSelectNodeIds.length;
		const label = this.pixiNodes.get(nodeId)?.data.label ?? nodeId;
		this._announceA11y(
			idx >= 0
				? `${t("a11y.deselected") ?? "Deselected"}: ${label} (${count} ${t("a11y.nodesSelected") ?? "selected"})`
				: `${t("a11y.selected") ?? "Selected"}: ${label} (${count} ${t("a11y.nodesSelected") ?? "selected"})`,
		);
		this.markDirty(true);
	}

	/** Lasso selection: find all visible nodes inside the screen-space polygon */
	lassoSelectNodes(screenPolygon: { x: number; y: number }[], additive: boolean): void {
		if (!additive) this.panel.multiSelectNodeIds = [];
		const app = this.pixiApp;
		if (!app) return;
		const selectedSet = new Set(this.panel.multiSelectNodeIds);
		for (const [id, pn] of this.pixiNodes) {
			if (!pn.gfx.visible) continue;
			const screenPt = app.stage.toLocal({ x: pn.data.x ?? 0, y: pn.data.y ?? 0 }, this.worldContainer!);
			if (pointInPolygon(screenPt, screenPolygon)) selectedSet.add(id);
		}
		this.panel.multiSelectNodeIds = [...selectedSet];
		this._announceA11y(`${t("a11y.selected") ?? "Selected"}: ${this.panel.multiSelectNodeIds.length} nodes`);
		this.markDirty(true);
	}

	/** Enter subgraph mode: push current state to stack, filter to selected nodes */
	enterSubgraph(nodeIds: string[], viewMode: ViewMode): void {
		const app = this.pixiApp;
		this.panel.subgraphStack.push({
			nodeIds: [...this.panel.subgraphNodeIds],
			viewMode: this.panel.viewMode,
			panX: this.worldContainer?.x ?? 0,
			panY: this.worldContainer?.y ?? 0,
			zoom: app?.stage.scale.x ?? 1,
		});
		this.panel.subgraphNodeIds = [...nodeIds];
		this.panel.viewMode = viewMode;
		this.panel.multiSelectNodeIds = [];
		this.rawData = null;
		this.doRender();
		this.requestSave();
		this._announceA11y(`Subgraph: ${nodeIds.length} nodes`);
	}

	/** Exit subgraph mode: pop stack and restore previous state */
	exitSubgraph(): void {
		const prev = this.panel.subgraphStack.pop();
		if (prev) {
			this.panel.subgraphNodeIds = prev.nodeIds;
			this.panel.viewMode = prev.viewMode;
		} else {
			this.panel.subgraphNodeIds = [];
		}
		this.panel.multiSelectNodeIds = [];
		this.rawData = null;
		this.doRender();
		this.requestSave();
		this._announceA11y(t("toolbar.backToFullGraph") ?? "Back to full graph");
	}

	/** Open subgraph in a new tab */
	openSubgraphNewTab(nodeIds: string[], viewMode: string): void {
		this.plugin.openSubgraphInNewTab(nodeIds, viewMode);
	}

	// =========================================================================
	// C7: Inline edit
	// =========================================================================

	isInlineEditEnabled(): boolean {
		return false;
	}

	/** I1: Auto-persist drag position to pinnedPositions */
	saveDragPosition(nodeId: string, x: number, y: number): void {
		this.panel.pinnedPositions[nodeId] = { x, y };
		this.requestSave();
	}

	showInlineEditor(pn: PixiNode): void {
		if (!pn.data.filePath) return;
		const canvasArea = this.canvasWrap;
		if (!canvasArea || !this.worldContainer) return;

		// Remove existing editor
		const existing = canvasArea.querySelector(".gi-inline-editor");
		if (existing) existing.remove();

		const tf = this.app.vault.getAbstractFileByPath(pn.data.filePath);
		if (!(tf instanceof TFile)) return;

		const cache = this.app.metadataCache.getFileCache(tf);
		const fm = cache?.frontmatter;

		// Screen coordinates
		const world = this.worldContainer;
		const sx = pn.data.x * world.scale.x + world.x;
		const sy = pn.data.y * world.scale.y + world.y;

		const editorDiv = canvasArea.createDiv({ cls: "gi-inline-editor" });
		editorDiv.style.left = `${sx}px`;
		editorDiv.style.top = `${sy + 20}px`;

		editorDiv.createEl("div", { cls: "gi-inline-editor-title", text: pn.data.label });

		// Show top 5 frontmatter fields as inputs
		const fields = fm
			? Object.entries(fm)
					.filter(([k]) => !k.startsWith("_") && k !== "position")
					.slice(0, 5)
			: [];
		const inputs: { key: string; input: HTMLInputElement }[] = [];

		for (const [key, value] of fields) {
			const row = editorDiv.createDiv({ cls: "gi-inline-editor-row" });
			row.createEl("label", { text: key });
			const input = row.createEl("input", { type: "text", value: String(value ?? "") });
			inputs.push({ key, input });
		}

		// Save button
		const btnRow = editorDiv.createDiv({ cls: "gi-inline-editor-buttons" });
		const saveBtn = btnRow.createEl("button", { text: t("action.save"), cls: "mod-cta" });
		saveBtn.addEventListener("click", async () => {
			try {
				let content = await this.app.vault.read(tf);
				for (const { key, input } of inputs) {
					content = setFrontmatterField(content, key, input.value);
				}
				await this.app.vault.modify(tf, content);
				this.rawData = null;
				this.doRender();
			} catch (_e) {
				/* ignore */
			}
			editorDiv.remove();
		});
		const cancelBtn = btnRow.createEl("button", { text: t("action.cancel") });
		cancelBtn.addEventListener("click", () => editorDiv.remove());

		// Escape to close
		editorDiv.addEventListener("keydown", (ev) => {
			if (ev.key === "Escape") editorDiv.remove();
		});

		// Focus first input
		if (inputs.length > 0) inputs[0].input.focus();
	}

	// =========================================================================
	// D5: Cluster compare
	// =========================================================================

	/** Cluster compare keys: [clusterA, clusterB] */
	private compareClusterKeys: [string | null, string | null] = [null, null];

	isClusterCompareEnabled(): boolean {
		return this.panel.showClusterCompare;
	}

	toggleClusterCompare(nodeId: string): void {
		// Determine which cluster this node belongs to
		const pn = this.pixiNodes.get(nodeId);
		if (!pn) return;
		const groupKey = pn.data.category || pn.data.tags?.[0] || "unknown";

		if (this.compareClusterKeys[0] === null) {
			this.compareClusterKeys[0] = groupKey;
			this._announceA11y(`Cluster compare: selected ${groupKey}`);
		} else if (this.compareClusterKeys[1] === null && this.compareClusterKeys[0] !== groupKey) {
			this.compareClusterKeys[1] = groupKey;
			this.updateClusterCompare();
		} else {
			// Reset
			this.compareClusterKeys = [groupKey, null];
			this._announceA11y(`Cluster compare: reset to ${groupKey}`);
		}
		this.markDirty(true);
	}

	private updateClusterCompare(): void {
		const [keyA, keyB] = this.compareClusterKeys;
		if (!keyA || !keyB || !this.graphStatsEl) return;

		// Find members of each cluster
		const membersA: string[] = [];
		const membersB: string[] = [];
		for (const [id, pn] of this.pixiNodes) {
			const gk = pn.data.category || pn.data.tags?.[0] || "unknown";
			if (gk === keyA) membersA.push(id);
			else if (gk === keyB) membersB.push(id);
		}

		// Count inter-cluster edges and find bridge nodes
		const setA = new Set(membersA);
		const setB = new Set(membersB);
		const { interEdges, bridgeNodes } = this._countInterClusterEdges(setA, setB);

		// Shared tags
		const tagsA = this._collectMemberTags(membersA);
		const tagsB = this._collectMemberTags(membersB);
		const sharedTags = [...tagsA].filter((t) => tagsB.has(t));

		this.applyEphemeralHighlight(bridgeNodes.size > 0 ? bridgeNodes : null);

		const msg = `Cluster compare: ${keyA} (${membersA.length}) vs ${keyB} (${membersB.length}) — ${interEdges} edges, ${bridgeNodes.size} bridges, ${sharedTags.length} shared tags`;
		showToast(msg);
		this._announceA11y(msg);
	}

	/** Count edges between two cluster sets and collect bridge node IDs. */
	private _countInterClusterEdges(setA: Set<string>, setB: Set<string>): { interEdges: number; bridgeNodes: Set<string> } {
		let interEdges = 0;
		const bridgeNodes = new Set<string>();
		for (const e of this.graphEdges) {
			const src = edgeSourceId(e);
			const tgt = edgeTargetId(e);
			if ((setA.has(src) && setB.has(tgt)) || (setB.has(src) && setA.has(tgt))) {
				interEdges++;
				bridgeNodes.add(src);
				bridgeNodes.add(tgt);
			}
		}
		return { interEdges, bridgeNodes };
	}

	/** Collect all tags from a list of node IDs. */
	private _collectMemberTags(memberIds: string[]): Set<string> {
		const tags = new Set<string>();
		for (const id of memberIds) {
			const pn = this.pixiNodes.get(id);
			if (pn?.data.tags) pn.data.tags.forEach((t) => tags.add(t));
		}
		return tags;
	}

	// =========================================================================
	// C4: Manual clustering
	// =========================================================================

	isManualClusteringEnabled(): boolean {
		return false;
	}

	getClusterGroupKeys(): string[] {
		const keys = new Set<string>();
		for (const pn of this.pixiNodes.values()) {
			const gk = pn.data.category || pn.data.tags?.[0];
			if (gk) keys.add(gk);
		}
		return [...keys].sort();
	}

	setManualCluster(_nodeId: string, _groupKey: string): void {
		// Manual clustering feature removed — no-op
	}

	// =========================================================================
	// I2: Blank Node Insertion
	// =========================================================================
	/** Insert a blank placeholder node at the given world coordinates */
	insertBlankNode(wx: number, wy: number): void {
		const id = `__blank_${Date.now()}`;
		const blankNode: GraphNode = {
			id,
			label: "?",
			x: wx,
			y: wy,
			vx: 0,
			vy: 0,
			tags: [],
			meta: { _isBlank: true },
		};
		// Pin position so it stays where the user clicked after re-render
		this.panel.pinnedPositions[id] = { x: wx, y: wy };
		// Inject into rawData so getGraphData() includes it
		if (this.rawData) {
			this.rawData.nodes.push(blankNode);
		}
		this.doRender();
		showToast(t("toast.blankInserted"));
	}

	// =========================================================================
	// Graph Note Creation (Phase 4a)
	// =========================================================================
	/** Create a new note at the given world coordinates via prompt */
	async createNoteAtPosition(wx: number, wy: number): Promise<void> {
		const name = window.prompt(t("context.enterNoteName"), "");
		if (!name) return;
		const path = name.endsWith(".md") ? name : `${name}.md`;
		try {
			const file = await this.app.vault.create(path, "");
			// Invalidate data to include the new file, then pin at the clicked position
			this.panel.pinnedPositions[file.path] = { x: wx, y: wy };
			this.rawData = null;
			this.doRender();
			showToast(t("context.noteCreated").replace("{name}", file.basename));
		} catch (err) {
			showToast(`Failed to create note: ${err}`, TOAST_LONG_MS);
		}
	}

	/** 未接続同タグノードIDセットを取得（RenderHost用） */
	getMissingNeighborNodeIds(): Set<string> | null {
		return this.missingNeighborNodeIds;
	}

	/** RenderHost: tag badges enabled */
	getShowTagBadges(): boolean {
		return this.panel.showTagBadges;
	}

	/** RenderHost: importance ring config */
	getShowImportanceRing(): { metric: "degree" | "betweenness" | "pagerank" } | null {
		if (!this.panel.showImportanceRing) return null;
		return { metric: this.panel.importanceMetric };
	}

	/** RenderHost: recency config */
	getRecencyConfig(): { days: number } | null {
		if (!this.panel.showRecencyMarker) return null;
		return { days: this.panel.recencyDays };
	}

	/** RenderHost: bridge node IDs (top 10% betweenness) */
	getBridgeNodeIds(): Set<string> | null {
		if (!this.panel.showBridgeNodes) return null;
		const bc = this.getBetweennessCache();
		if (!bc || bc.size === 0) return null;
		// Top 10% by betweenness
		const sorted = [...bc.entries()].sort((a, b) => b[1] - a[1]);
		const cutoff = Math.max(1, Math.floor(sorted.length * 0.1));
		const result = new Set<string>();
		for (let i = 0; i < cutoff; i++) {
			if (sorted[i][1] > 0) result.add(sorted[i][0]);
		}
		return result;
	}

	/** RenderHost: articulation point IDs (cached per rawData) */
	getArticulationPointIds(): Set<string> | null {
		if (!this.panel.highlightPatterns) return null;
		if (this._articulationCacheRef === this.rawData && this._articulationCache) {
			return this._articulationCache;
		}
		const gd = this.getGraphData();
		if (!gd || gd.nodes.length === 0) return null;
		this._articulationCache = detectArticulationPoints(gd.nodes, gd.edges);
		this._articulationCacheRef = this.rawData;
		return this._articulationCache;
	}

	/** RenderHost + StatsHost: betweenness centrality cache (lazy computation) */
	getBetweennessCache(): Map<string, number> | undefined {
		if (this._betweennessCacheRef === this.rawData && this._betweennessCache) {
			return this._betweennessCache;
		}
		const gd = this.getGraphData();
		if (!gd || gd.nodes.length === 0) return undefined;
		this._betweennessCache = computeBetweennessCentrality(gd.nodes, gd.edges);
		this._betweennessCacheRef = this.rawData;
		return this._betweennessCache;
	}

	/** 比較イベントをワークスペースに発火。2+ノード揃ったらパスファインダーも連動。 */
	private notifyCompare() {
		if (this.compareNodeIds.length >= 2) {
			const a = this.pixiNodes.get(this.compareNodeIds[0]);
			const b = this.pixiNodes.get(this.compareNodeIds[1]);
			if (a && b) {
				const venn = this.computeCompareVenn();
				asInternalWorkspace(this.app.workspace).trigger(EVENT_COMPARE_NODES, {
					nodeA: a.data,
					nodeB: b.data,
					adj: this.adj,
					pixiNodes: this.pixiNodes,
					venn,
				});
				// パスファインダーも連動して最短経路を表示 (先頭2ノード)
				this.setPathfinderNode(this.compareNodeIds[0], "start");
				this.setPathfinderNode(this.compareNodeIds[1], "end");
			}
		} else {
			asInternalWorkspace(this.app.workspace).trigger(EVENT_COMPARE_NODES, null);
			this.clearPathfinder();
		}
	}

	// -- InteractionHost: Obsidian App access (for hover-link preview) --
	getApp() {
		return this.app;
	}
	getContainerEl(): HTMLElement {
		return this.containerEl;
	}
	/** §0.1: Label collision stats for quality monitoring (E2E accessible).
	 *  JC: Auto-refreshes cull pass if stats are stale (totalLabels=0). */
	getLabelCullStats() {
		const rp = this.renderPipeline;
		if (!rp) return { totalLabels: 0, visibleLabels: 0, culledLabels: 0, collisionRate: 0 };
		// JC: If stats are empty but pixiNodes exist, force a cull pass
		if (rp.cullStats.totalLabels === 0 && this.pixiNodes.size > 0) {
			rp.cullOverlappingLabels();
		}
		return rp.cullStats;
	}

	/** JG: §0.1 Pairwise label collision detection for quality verification.
	 *  Returns { total, collisions, rate } based on actual visible label AABBs. */
	getVisibleLabelCollisions(): { total: number; collisions: number; rate: number } {
		const world = this.worldContainer;
		if (!world) return { total: 0, collisions: 0, rate: 0 };
		const ws = world.scale.x;
		const rects: { x: number; y: number; w: number; h: number }[] = [];
		for (const pn of this.pixiNodes.values()) {
			const label = pn.label;
			if (!label || !label.visible || !label.text) continue;
			const sx = (pn.data.x + (label.x ?? 0)) * ws + world.x;
			const sy = (pn.data.y + (label.y ?? 0)) * ws + world.y;
			const fontSize = (label.style?.fontSize as number) ?? 11;
			const charW = fontSize * 0.6 * label.scale.x * ws;
			const w = (label.text.length ?? 5) * charW;
			const h = fontSize * label.scale.x * ws * 1.3;
			rects.push({ x: sx, y: sy, w, h });
		}
		let collisions = 0;
		for (let i = 0; i < rects.length; i++) {
			for (let j = i + 1; j < rects.length; j++) {
				const a = rects[i],
					b = rects[j];
				if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
					collisions++;
					break;
				}
			}
		}
		return { total: rects.length, collisions, rate: rects.length > 0 ? collisions / rects.length : 0 };
	}

	/** JO: §0.1 Unified label quality score (0-100).
	 *  Combines collision rate, visibility, and degree-priority adherence. */
	getLabelQualityScore(): { score: number; collision: number; visibility: number; priority: number } {
		const coll = this.getVisibleLabelCollisions();
		const cullStats = this.getLabelCullStats();
		const collisionScore = Math.max(0, 40 * (1 - coll.rate / 0.1));
		const visRate = cullStats.totalLabels > 0 ? cullStats.visibleLabels / cullStats.totalLabels : 1;
		const visibilityScore = visRate * 30;
		let priorityScore = 30;
		if (this.degrees.size > 0 && this.pixiNodes.size > 20) {
			const sorted = [...this.pixiNodes.values()].sort(
				(a, b) => (this.degrees.get(b.data.id) ?? 0) - (this.degrees.get(a.data.id) ?? 0),
			);
			const top10pct = sorted.slice(0, Math.max(5, Math.ceil(sorted.length * 0.1)));
			const topVisible = top10pct.filter((pn) => pn.label?.visible).length;
			priorityScore = (topVisible / top10pct.length) * 30;
		}
		const score = Math.round(Math.min(100, collisionScore + visibilityScore + priorityScore));
		return {
			score,
			collision: Math.round(collisionScore),
			visibility: Math.round(visibilityScore),
			priority: Math.round(priorityScore),
		};
	}

	/** JI: §0.1 Auto-optimize label overlap margin if collision rate > 5%.
	 *  Increases labelOverlapMargin by 4px per retry, max 3 retries. */
	autoOptimizeLabelOverlap(): { optimized: boolean; finalMargin: number; finalRate: number } {
		const rt = this.panel.renderThresholds ?? {};
		let margin = rt.labelOverlapMargin ?? 12;
		const maxRetries = 3;
		const step = 4;

		for (let i = 0; i < maxRetries; i++) {
			// Re-cull with current margin
			this.renderPipeline?.cullOverlappingLabels();
			const stats = this.getVisibleLabelCollisions();
			if (stats.total === 0 || stats.rate <= COLLISION_RATE_OK) {
				return { optimized: i > 0, finalMargin: margin, finalRate: stats.rate };
			}
			// Increase margin
			margin += step;
			ensureRT(this.panel).labelOverlapMargin = margin;
		}
		// Final check
		this.renderPipeline?.cullOverlappingLabels();
		const final = this.getVisibleLabelCollisions();
		return { optimized: true, finalMargin: margin, finalRate: final.rate };
	}

	/** JK: Run auto-optimize once after layout settles (debounced, no-op if already optimized). */
	private _labelOptimized = false;
	/** Whether clusterArrangement was resolved from "inherit" during this render */
	private _inheritResolved = false;
	private _autoOptimizeLabelOverlapOnce(): void {
		if (this._labelOptimized) return;
		this._labelOptimized = true;
		// Defer to next frame so labels are fully constructed
		requestAnimationFrame(() => {
			const result = this.autoOptimizeLabelOverlap();
			if (result.optimized) {
				this._announceA11y(`Label overlap optimized: margin ${result.finalMargin}px`);
			}
		});
	}

	/** BFS shortest path using adj map (delegates to pure function) */
	private computePathfinderPath() {
		this.pathfinderPath = null;
		this.pathfinderNodeSet = null;
		this.pathfinderEdgeSet = null;
		const result = computePathfinderResult(this.adj, this.pathfinderStartId, this.pathfinderEndId);
		if (!result) return;
		this.pathfinderPath = result.path;
		this.pathfinderNodeSet = result.nodeSet;
		this.pathfinderEdgeSet = result.edgeSet;
		showToast(`Path: ${result.path.length} nodes, ${result.path.length - 1} hops`);
	}

	/** Get the pathfinder node set (for render pipeline highlight) */
	getPathfinderNodeSet(): Set<string> | null {
		return this.pathfinderNodeSet;
	}

	/** Get the pathfinder edge set (for edge highlight) */
	getPathfinderEdgeSet(): Set<string> | null {
		return this.pathfinderEdgeSet;
	}

	/** Get timeline range filter state for RenderPipeline */
	getTimelineRange(): { min: number; max: number; active: boolean } {
		const min = this.panel.timelineRangeMin;
		const max = this.panel.timelineRangeMax;
		const active = (min > 0.001 || max < 0.999) && this.panel.clusterArrangement === ARRANGEMENT_TIMELINE;
		return { min, max, active };
	}

	// =========================================================================
	// Hover highlight (Canvas 2D)
	// =========================================================================
	applyHover() {
		const hId = this.highlightedNodeId;

		// Build current highlight set via BFS up to hoverHops
		let curSet = this._buildHoverHighlightSet(hId);

		// フォーカスモード: ホバーなしでフォーカスが有効なら、フォーカスセットを使用
		const focusActive = this.panel.focusMode && this.panel.focusNodeId && !hId;
		if (focusActive) {
			curSet = this._buildHoverHighlightSet(this.panel.focusNodeId);
		}

		// Determine which nodes actually changed state
		const prev = this.prevHighlightSet;
		const changed = new Set<string>();
		// Nodes entering or leaving the highlight set
		for (const id of curSet) {
			if (!prev.has(id)) changed.add(id);
		}
		for (const id of prev) {
			if (!curSet.has(id)) changed.add(id);
		}
		// If transitioning from "no highlight" to "has highlight" (or vice-versa),
		// all non-highlighted nodes need alpha update too
		const wasEmpty = prev.size === 0;
		const isNowEmpty = curSet.size === 0;
		const fullSweepNeeded = wasEmpty !== isNowEmpty;

		const nodesToUpdate = fullSweepNeeded
			? this.pixiNodes.values()
			: (function* (pnMap: Map<string, PixiNode>, ids: Set<string>) {
					for (const id of ids) {
						const pn = pnMap.get(id);
						if (pn) yield pn;
					}
				})(this.pixiNodes, changed);

		const isCardMode = (this.panel.nodeDisplayMode ?? "node") === "card";
		const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };
		const hoverRt = mergeRenderThresholds(this.panel.renderThresholds);

		// フォーカスモード時はフォーカスノードIDを実効ハイライトIDとして使用
		const effectiveHId = hId || (focusActive ? this.panel.focusNodeId : null);

		// R2: Build distance map for focus cone + DS: edge alpha gradient
		const distMap = new Map<string, number>();
		this._hoverDistMap = distMap;
		if (this.panel.focusConeEnabled && effectiveHId) {
			distMap.set(effectiveHId, 0);
			let frontier = [effectiveHId];
			const hoverHops = this.panel.hoverHops;
			for (let depth = 1; depth <= hoverHops; depth++) {
				const next: string[] = [];
				for (const fid of frontier) {
					for (const nb of this.adj.get(fid) ?? []) {
						if (!distMap.has(nb)) {
							distMap.set(nb, depth);
							next.push(nb);
						}
					}
				}
				frontier = next;
			}
		}

		for (const pn of nodesToUpdate) {
			if (!effectiveHId) {
				this._hoverResetNode(pn, isCardMode);
			} else if (curSet.has(pn.data.id)) {
				this._hoverHighlightNode(pn, effectiveHId, isCardMode, crc, hoverRt);
			} else {
				this._hoverDimNode(pn, isCardMode, distMap, hoverRt);
			}
		}

		this.prevHighlightSet = curSet;
		// Re-run overlap culling so hover-forced labels get displacement + leader lines
		this.renderPipeline?.cullOverlappingLabels();
		this.redrawNodeBatch();
		this.drawEdges(); // Redraw edges with hover dimming
		this.drawTimelineBars(); // Redraw bars with hover highlight
		this.updateNodeInfo();
		// EM: Sync Nodes tab hover highlight
		this._syncNodesTabHover(effectiveHId, curSet);
		// Off-screen linked nodes directional tooltips
		this._updateOffScreenLinkTooltips(effectiveHId);
	}

	/** Show directional tooltips for off-screen linked nodes grouped by cluster direction. */
	private _updateOffScreenLinkTooltips(hoveredId: string | null): void {
		// Clear existing tooltips
		for (const el of this._offScreenTooltips) el.remove();
		this._offScreenTooltips = [];
		if (!hoveredId || !this.worldContainer || !this.canvasWrap) return;

		const pn = this.pixiNodes.get(hoveredId);
		if (!pn) return;
		const ws = this.worldContainer.scale.x;
		if (!isFinite(ws) || ws <= 0) return;
		const worldX = this.worldContainer.x;
		const worldY = this.worldContainer.y;
		const canvasW = this.canvasWrap.clientWidth;
		const canvasH = this.canvasWrap.clientHeight;
		const margin = 10;

		// Screen position of hovered node
		const hovSx = pn.gfx.x * ws + worldX;
		const hovSy = pn.gfx.y * ws + worldY;
		const neighbors = this.adj.get(hoveredId);
		if (!neighbors || neighbors.size === 0) return;

		// Group off-screen neighbors by cluster (delegated to pure function)
		const clusterMetaRef = this.clusterMeta;
		const dirGroups = groupOffScreenNeighbors(
			[...neighbors],
			(id) => {
				const nb = this.pixiNodes.get(id);
				return nb ? { id, gfxX: nb.gfx.x, gfxY: nb.gfx.y, filePath: nb.data.filePath, label: nb.data.label } : null;
			},
			ws, worldX, worldY, canvasW, canvasH, margin,
			(id, folder) => clusterMetaRef?.nodeClusterMap?.get(id) ?? folder,
		);
		if (dirGroups.size === 0) return;

		this._createOffScreenTooltipElements(dirGroups, hovSx, hovSy, canvasW, canvasH, margin);
	}

	/** Create DOM elements for off-screen link tooltips at canvas edges. */
	private _createOffScreenTooltipElements(
		dirGroups: Map<string, { names: string[]; avgSx: number; avgSy: number }>,
		hovSx: number, hovSy: number, canvasW: number, canvasH: number, margin: number,
	): void {
		const canvasArea = this.canvasWrap!;
		for (const [clusterKey, grp] of dirGroups) {
			const { tipX, tipY } = computeTooltipEdgePosition(hovSx, hovSy, grp.avgSx, grp.avgSy, canvasW, canvasH, margin);
			const clusterName = clusterKey.replace(/^folder:/, "").replace(/^[^:]+:/, "");
			const displayNames = grp.names.slice(0, 5);
			const extra = grp.names.length > 5 ? `\n+${grp.names.length - 5} more` : "";

			const tip = document.createElement("div");
			tip.className = "gi-offscreen-tooltip";
			tip.style.cssText = `
        position:absolute; left:${tipX}px; top:${tipY}px; transform:translate(-50%,-50%);
        background:var(--background-secondary, #2a2a3e); color:var(--text-normal, #ddd);
        padding:4px 8px; border-radius:6px; font-size:11px; line-height:1.4;
        pointer-events:none; z-index:100; max-width:200px; white-space:pre-line;
        border:1px solid var(--background-modifier-border, #444);
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
      `;
			tip.textContent = `→ ${clusterName}\n${displayNames.join("\n")}${extra}`;
			canvasArea.appendChild(tip);
			this._offScreenTooltips.push(tip);
		}
	}

	/** EM: Highlight rows in the Nodes tab that match hovered node + neighbors */
	private _syncNodesTabHover(hoveredId: string | null, highlightSet: Set<string>) {
		if (!this.panelEl) return;
		const rows = this.panelEl.querySelectorAll(".gi-node-row");
		for (const row of Array.from(rows)) {
			const el = row as HTMLElement;
			const id = el.dataset.nodeId;
			el.classList.remove("gi-node-hovered", "gi-node-linked");
			if (!id || !hoveredId) continue;
			if (id === hoveredId) {
				el.classList.add("gi-node-hovered");
				// ER: Auto-scroll to hovered row
				el.scrollIntoView({ block: "nearest", behavior: "smooth" });
			} else if (highlightSet.has(id)) el.classList.add("gi-node-linked");
		}
	}

	/** Reset a node to non-highlighted state (no hover active). */
	private _hoverResetNode(pn: PixiNode, isCardMode: boolean): void {
		pn.gfx.alpha = 1;
		if (isCardMode) pn.gfx.scale.set(1);
		this.drawNodeCircle(pn, false);
		if (pn.hoverLabel) {
			pn.gfx.removeChild(pn.hoverLabel);
			pn.hoverLabel.destroy();
			pn.hoverLabel = null;
			pn.hoverForcedLabel = false;
		}
	}

	/** Apply highlight styling to a node within the hover set. */
	private _hoverHighlightNode(
		pn: PixiNode, effectiveHId: string, isCardMode: boolean,
		crc: import("../types").CardRenderConfig, hoverRt: Required<import("../types").RenderThresholds>,
	): void {
		pn.gfx.visible = true;
		pn.gfx.alpha = 1;
		if (isCardMode && pn.data.id === effectiveHId) {
			pn.gfx.scale.set(crc.cardHoverScale ?? 1.08);
		} else if (isCardMode) {
			pn.gfx.scale.set(1);
		}
		this.drawNodeCircle(pn, true);
		// HK: Re-apply search halo after hover redraw so it's not lost
		if (this._searchHighlightSet?.has(pn.data.id)) {
			this._drawSearchHalo(pn, isCardMode, hoverRt);
		}
		if (!pn.hoverLabel) {
			this._createHoverTooltip(pn);
		}
		if (pn.label && !pn.label.visible) {
			pn.label.visible = true;
			pn.label.alpha = 1;
			pn.hoverForcedLabel = true;
		}
		if (pn.tagLabel && !pn.tagLabel.visible && this.panel.tagDisplay !== TAG_DISPLAY_ENCLOSURE) {
			pn.tagLabel.visible = true;
		}
	}

	/** Dim a node outside the hover highlight set, respecting focus cone & search. */
	private _hoverDimNode(
		pn: PixiNode, isCardMode: boolean, distMap: Map<string, number>,
		hoverRt: Required<import("../types").RenderThresholds>,
	): void {
		const searchActive = this._searchHighlightSet !== null;
		const searchMatch = !this._searchHighlightSet || this._searchHighlightSet.has(pn.data.id);
		if (this.panel.focusConeEnabled && distMap.size > 0) {
			const dist = distMap.get(pn.data.id);
			const coneAlpha =
				dist === undefined
					? hoverRt.focusConeMinAlpha
					: Math.max(hoverRt.focusConeMinAlpha, Math.pow(hoverRt.focusConeFalloff, dist));
			pn.gfx.alpha =
				searchActive && !searchMatch ? Math.max(coneAlpha * 0.5, hoverRt.focusConeDimFloor) : coneAlpha;
		} else {
			pn.gfx.alpha = searchActive && !searchMatch ? hoverRt.searchDimAlpha : hoverRt.focusConeDimFloor;
		}
		if (isCardMode) pn.gfx.scale.set(1);
		if (pn.hoverLabel) {
			pn.gfx.removeChild(pn.hoverLabel);
			pn.hoverLabel.destroy();
			pn.hoverLabel = null;
			pn.hoverForcedLabel = false;
		}
	}

	/** Draw search halo ring/rect on a highlighted node. */
	 
	private _drawSearchHalo(pn: PixiNode, isCardMode: boolean, hoverRt: Required<import("../types").RenderThresholds>): void {
		const searchHitColor = this.getAccentColor();
		pn.circle.lineStyle(SEARCH_HALO_STROKE_WIDTH, searchHitColor, SEARCH_HALO_STROKE_ALPHA);
		if (isCardMode) {
			const crc2 = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };
			const cardAR2 = crc2.cardAspectRatio > 0 ? crc2.cardAspectRatio : GOLDEN_RATIO_FALLBACK;
			const baseH2 = pn.radius * 2;
			const halfW = Math.max(20, (baseH2 * cardAR2) / 2);
			const halfH = baseH2;
			pn.circle.drawRoundedRect(-halfW, -halfH, halfW * 2, halfH * 2, crc2.cardCornerRadius ?? 6);
		} else {
			const shape = getNodeShape(pn.data, this.panel.nodeShapeRules);
			drawShape(pn.circle, shape, pn.radius * 1.5, searchHitColor, hoverRt.searchHaloAlpha);
		}
	}

	/** Build the set of node IDs within hoverHops of the given node via BFS.
	 *  Uses hoverAdj (edge-type-filtered) so only user-selected edge types are traversed. */
	private _buildHoverHighlightSet(hId: string | null): Set<string> {
		if (!hId) return new Set<string>();
		const result = new Set<string>([hId]);
		const hht = this.panel.hoverHighlightTypes ?? {
			forwardLinks: true,
			backlinks: true,
			sharedTags: false,
			sameFolder: false,
		};
		const hoveredNode = this.pixiNodes.get(hId);

		// Forward links + backlinks via BFS on hoverAdj
		if (hht.forwardLinks || hht.backlinks) {
			this._addLinkNeighbors(result, hId, hht);
		}

		// Shared tags: nodes that share at least one tag with hovered node
		if (hht.sharedTags && hoveredNode?.data.tags?.length) {
			const nodes = [...this.pixiNodes.values()].map((pn) => ({ id: pn.data.id, tags: pn.data.tags, filePath: pn.data.filePath }));
			for (const id of findSharedTagNodes(hoveredNode.data.tags, hId, nodes)) result.add(id);
		}

		// Same folder: nodes in the same top-level folder
		if (hht.sameFolder && hoveredNode?.data.filePath) {
			const nodes = [...this.pixiNodes.values()].map((pn) => ({ id: pn.data.id, tags: pn.data.tags, filePath: pn.data.filePath }));
			for (const id of findSameFolderNodes(hoveredNode.data.filePath, hId, nodes)) result.add(id);
		}

		return this._capHoverLabels(result, hId);
	}

	/** Add link neighbors (forward/back) to the result set via BFS. */
	private _addLinkNeighbors(
		result: Set<string>,
		hId: string,
		hht: { forwardLinks: boolean; backlinks: boolean },
	): void {
		const bfsResult = bfsNeighborSet(this.hoverAdj, hId, this.panel.hoverHops);
		if (hht.forwardLinks && hht.backlinks) {
			for (const id of bfsResult) result.add(id);
			return;
		}
		// Directional filter
		const forwardIds = new Set<string>();
		const backlinkIds = new Set<string>();
		for (const e of this.graphEdges) {
			const src = edgeSourceId(e);
			const tgt = edgeTargetId(e);
			if (src === hId && bfsResult.has(tgt)) forwardIds.add(tgt);
			if (tgt === hId && bfsResult.has(src)) backlinkIds.add(src);
		}
		if (hht.forwardLinks) for (const id of forwardIds) result.add(id);
		if (hht.backlinks) for (const id of backlinkIds) result.add(id);
	}

	/** Cap the hover highlight set to maxHoverNeighborLabels, keeping highest-degree nodes. */
	private _capHoverLabels(result: Set<string>, hId: string): Set<string> {
		const maxNeighborLabels = this.panel.renderThresholds?.maxHoverNeighborLabels ?? 30;
		if (result.size <= maxNeighborLabels + 1) return result;
		const sorted = [...result]
			.filter((id) => id !== hId)
			.sort((a, b) => (this.degrees.get(b) ?? 0) - (this.degrees.get(a) ?? 0))
			.slice(0, maxNeighborLabels);
		return new Set([hId, ...sorted]);
	}

	/** フォーカスモードのハイライトを適用 (クリック時に呼ばれる) */
	private _applyFocusHighlight(): void {
		// ホバーが無い状態でフォーカスを再適用
		if (!this.highlightedNodeId) {
			this.applyHover();
		}
		this.markDirty(true);
	}

	/** フォーカスをクリア */
	clearFocus(): void {
		this.panel.focusNodeId = null;
		this.applyHover();
		this.markDirty(true);
	}

	/** Create and attach a hover tooltip label to the given PixiNode. */
	private _createHoverTooltip(pn: PixiNode) {
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const showTooltip = rt.hoverTooltipShow;
		const zoom = this.worldContainer?.scale.x ?? 1;

		// Build tooltip text via extracted pure function
		const tooltipText = buildHoverTooltipText(
			{
				label: pn.data.label,
				tags: pn.data.tags,
				category: pn.data.category,
				collapsedMembers: pn.data.collapsedMembers,
				bodyPreview: pn.data.bodyPreview,
				id: pn.data.id,
			},
			{
				showTitle: this.panel.hoverShowTitle ?? true,
				showMeta: this.panel.hoverShowMeta ?? true,
				showBody: this.panel.hoverShowBody ?? false,
				showTooltip,
				isKeyboardFocused: this._isKeyboardFocused,
				showSimilarSuggestions: this.panel.showSimilarSuggestions,
				tagDisplayEnclosure: this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE,
				hasVisibleTagLabel: !!(pn.tagLabel && pn.tagLabel.visible),
				tooltipFields: this.panel.hoverTooltipFields,
				degree: this.degrees.get(pn.data.id) ?? 0,
				graphEdges: this.graphEdges,
				getNodeProperty: (id, field) => this.getNodeProperty(id, field),
				similarCache: this._similarCache,
				allNodes: [...this.pixiNodes.values()].map((p) => p.data),
			},
		);

		// Guard: skip tooltip if all content is disabled
		if (!tooltipText.trim()) return;

		this._attachHoverTooltipLabel(pn, tooltipText, rt, zoom);
	}

	/** Create, position, and attach the CanvasText hover tooltip to a PixiNode. */
	private _attachHoverTooltipLabel(
		pn: PixiNode,
		tooltipText: string,
		rt: ReturnType<typeof mergeRenderThresholds>,
		zoom: number,
	): void {
		const counterScale = Math.max(0.5, 1 / zoom);
		const hl = new CanvasText(tooltipText, {
			fontSize: rt.hoverTooltipFontSize,
			fill: this.getLabelColor(),
			fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
			fontWeight: "600",
		});
		hl.bgColor = rt.labelBgColor;
		hl.bgAlpha = HOVER_TOOLTIP_BG_ALPHA;
		hl.bgPadX = 8;
		hl.bgPadY = 4;
		hl.cornerRadius = rt.labelHaloCornerRadius;
		hl.scale.set(counterScale);

		// Position: right of node (account for card-mode scale-up)
		const gfxScale = pn.gfx.scale?.x ?? 1;
		const isCardMode = (this.panel.nodeDisplayMode ?? "node") === "card";
		const crc = isCardMode ? { ...(this.panel.cardRenderConfig ?? {}) } : null;
		const cardAR = crc ? (crc.cardAspectRatio ?? GOLDEN_RATIO_FALLBACK) : 0;
		const cardHalfW = isCardMode ? Math.max(pn.radius * 2, (pn.radius * 2 * cardAR) / 2) : 0;
		const offsetX = isCardMode ? cardHalfW + 8 : pn.radius + 4;
		hl.x = offsetX * gfxScale;
		hl.y = -(pn.radius * 0.4 + 2) * gfxScale;
		hl.resolution = 2;
		pn.hoverForcedLabel = true;
		pn.gfx.addChild(hl);
		pn.hoverLabel = hl;

		this._adjustTooltipForOverlap(pn, hl, counterScale, gfxScale);
	}

	/** HM: Reposition hover tooltip if it overlaps DOM panels (legend, stats, minimap, node-info). */
	private _adjustTooltipForOverlap(pn: PixiNode, hl: CanvasText, counterScale: number, gfxScale: number) {
		const world = this.worldContainer;
		if (!world) return;
		const canvas = this.containerEl as HTMLElement | null;
		if (!canvas) return;
		const canvasRect = canvas.getBoundingClientRect();
		if (!canvasRect || canvasRect.width === 0) return;

		// Collect panel rects from DOM
		const selectors = [".gi-graph-stats", ".gi-legend", ".gi-minimap-wrap", ".gi-node-info"];
		const panelRects: PanelRect[] = [];
		for (const sel of selectors) {
			const el = canvas.querySelector(sel) as HTMLElement | null;
			if (!el || el.style.display === "none" || !el.offsetParent) continue;
			const r = el.getBoundingClientRect();
			panelRects.push({ x: r.left - canvasRect.left, y: r.top - canvasRect.top, w: r.width, h: r.height });
		}

		const isCardFlip = (this.panel.nodeDisplayMode ?? "node") === "card";
		const crcFlip = isCardFlip ? (this.panel.cardRenderConfig ?? {}) : null;
		const arFlip = crcFlip ? (crcFlip.cardAspectRatio ?? GOLDEN_RATIO_FALLBACK) : 0;

		const result = adjustTooltipPosition({
			nodeX: pn.data.x,
			nodeY: pn.data.y,
			nodeRadius: pn.radius,
			tipOffsetX: hl.x,
			tipOffsetY: hl.y,
			tipWidth: hl.width ?? 100,
			tipHeight: hl.height ?? 30,
			worldScale: world.scale.x,
			worldX: world.x,
			worldY: world.y,
			gfxScale,
			counterScale,
			canvasWidth: canvasRect.width,
			canvasHeight: canvasRect.height,
			panelRects,
			isCard: isCardFlip,
			cardAspectRatio: arFlip,
		});

		if (result) {
			hl.x = result.x;
			hl.y = result.y;
		}
	}

	/**
	 * Apply ephemeral (temporary) highlight from the side-panel.
	 * When nodeIds is null, the ephemeral highlight is cleared.
	 */
	private applyEphemeralHighlight(nodeIds: Set<string> | null) {
		this.ephemeralHighlight = nodeIds;

		// If there's a normal hover active, ephemeral highlight overlays on top
		// If no hover and no ephemeral, reset all nodes
		const activeSet = nodeIds ?? this.prevHighlightSet;
		const hasAny = activeSet.size > 0;

		for (const pn of this.pixiNodes.values()) {
			if (!hasAny) {
				pn.gfx.alpha = 1;
				this.drawNodeCircle(pn, false);
			} else if (nodeIds && nodeIds.has(pn.data.id)) {
				pn.gfx.alpha = 1;
				this.drawNodeCircle(pn, true);
			} else if (!nodeIds && this.prevHighlightSet.has(pn.data.id)) {
				// Restore normal hover highlight
				pn.gfx.alpha = 1;
				this.drawNodeCircle(pn, true);
			} else {
				pn.gfx.alpha = DIMMED_NODE_ALPHA;
			}
		}
		this.redrawNodeBatch();
		this.drawEdges();
		this.markDirty();
	}

	/**
	 * Notify the dedicated NodeDetailView side-pane about the hovered node.
	 */
	private notifyDetailPane(node: GraphNode | null) {
		// Emit a custom event that NodeDetailView listens for
		this.app.workspace.trigger(EVENT_HOVER_NODE, node, this.adj, this.pixiNodes, this.degrees, this.graphEdges);
	}

	/**
	 * Update the floating node-info overlay with hovered node details + linked nodes.
	 */
	private updateNodeInfo() {
		// Hide the floating overlay — all detail is shown in the NodeDetailView side pane
		if (this.nodeInfoEl) this.nodeInfoEl.style.display = "none";

		const hId = this.highlightedNodeId;
		const pn = hId ? this.pixiNodes.get(hId) : undefined;
		this.notifyDetailPane(pn?.data ?? null);
	}

	isDarkTheme(): boolean {
		if (this.cachedIsDark === null) {
			this.cachedIsDark = document.body.classList.contains("theme-dark");
		}
		return this.cachedIsDark;
	}

	private cachedAccentColor: number | null = null;

	getAccentColor(): number {
		if (this.cachedAccentColor === null) {
			const el = this.canvasWrap ?? this.containerEl;
			const css = getComputedStyle(el).getPropertyValue("--interactive-accent").trim();
			this.cachedAccentColor = css ? cssColorToHex(css) : 0x6366f1;
		}
		return this.cachedAccentColor;
	}

	/** Called on css-change event (theme switch, snippet toggle) */
	private invalidateThemeCache() {
		this.cachedBgColor = null;
		this.cachedLabelColor = null;
		this.cachedIsDark = null;
		this.cachedAccentColor = null;

		// Update canvas background color
		if (this.pixiApp) {
			const el = this.canvasWrap ?? this.containerEl;
			const bgStr =
				getComputedStyle(el).getPropertyValue("--graph-background").trim() ||
				getComputedStyle(el).getPropertyValue("--background-primary").trim();
			if (bgStr) {
				try {
					this.pixiApp.setBackgroundColor(cssColorToHex(bgStr));
				} catch (_e) {
					/* ignore */
				}
			}
		}

		// Refresh label background colors for new theme
		if (this.pixiNodes.size > 0) {
			const rt = mergeRenderThresholds(this.panel.renderThresholds);
			const isDark = this.isDarkTheme();
			const themeBg = isDark ? rt.labelBgColor : rt.labelBgColorLight;
			const syncBg = rt.labelBgColorSync;
			for (const pn of this.pixiNodes.values()) {
				if (pn.label && pn.label.bgColor != null) {
					pn.label.bgColor = syncBg && pn.color != null ? this._blendThemeLabel(themeBg, pn.color) : themeBg;
				}
			}
		}

		this.markDirty();
	}

	private _blendThemeLabel(bg: number, nodeColor: number): number {
		return blendThemeLabel(bg, nodeColor);
	}

	// =========================================================================
	// Draw guides (grid lines, axis titles, tick labels)
	// =========================================================================
	drawGuides() {
		if (!this.guideRenderer || !this.guideGraphics) return;
		const g = this.guideGraphics;
		g.clear();
		// clusterMeta may not exist if no cluster force is active
		const guides = this.clusterMeta?.groupGuides;
		if (!guides || guides.length === 0) {
			// No guides available — canvas cleared above, nothing more to draw.
			// All valid arrangements (grid, timeline, concentric, etc.) produce
			// groupGuides in clusterMeta when buildClusterForce succeeds.
			return;
		}
		const isDark = this.isDarkTheme();
		const lineW = 1;
		const color = isDark ? 0x555555 : 0xcccccc;
		const worldScale = this.worldContainer?.scale?.x ?? 1;
		for (const entry of guides) {
			const { guide, centerX, centerY } = entry;
			if (guide.type === "coordinate") {
				this.guideRenderer.drawCoordinateGuide(g, centerX, centerY, guide, lineW, color);
			} else if (guide.type === "grid") {
				this.guideRenderer.drawGridLines(g, centerX, centerY, guide, lineW, color);
			} else if (guide.type === "triangle") {
				this.guideRenderer.drawTriangleOutline(g, centerX, centerY, guide, lineW, color);
			} else if (guide.type === "concentric") {
				this.guideRenderer.drawConcentricGuide(g, centerX, centerY, guide, lineW, color);
			} else if (guide.type === "timeline") {
				this.guideRenderer.drawTimelineAxis(g, centerX, centerY, guide, lineW, color, worldScale);
			}
		}
	}

	// Draw orbit rings (concentric circles)
	// =========================================================================
	drawOrbitRings() {
		const g = this.orbitGraphics;
		if (!g) return;
		g.clear();
		if (!this.panel.showOrbitRings || this.currentLayout !== LAYOUT_CONCENTRIC || this.shells.length === 0) return;

		const ringColor = this.isDarkTheme() ? 0x888888 : 0xaaaaaa;
		const n = this.shells.length;

		for (let i = 0; i < n; i++) {
			const shell = this.shells[i];
			if (shell.radius <= 0) continue;
			// Inner rings slightly more visible, outer rings fade
			const t = n > 1 ? i / (n - 1) : 0;
			const ringAlpha = 0.3 - t * 0.15; // 0.30 → 0.15
			const lineWidth = 1.5 - t * 0.5; // 1.5 → 1.0
			g.lineStyle(lineWidth, ringColor, ringAlpha);
			g.drawCircle(shell.centerX, shell.centerY, shell.radius);
		}
	}

	getLabelColor(): number {
		if (this.cachedLabelColor === null) {
			const el = this.canvasWrap ?? this.containerEl;
			const css = getComputedStyle(el).getPropertyValue("--text-muted").trim();
			this.cachedLabelColor = css ? cssColorToHex(css) : 0x999999;
		}
		return this.cachedLabelColor;
	}

	// =========================================================================
	// Draw edges (delegated to EdgeRenderer)
	// =========================================================================
	/** Resolve an edge source/target reference to a position object.
	 *  Bound method — avoids per-frame closure allocation. */
	private _resolveEdgePos = (ref: string | object): { x: number; y: number; id?: string } | undefined =>
		typeof ref === "object" ? (ref as { x: number; y: number; id?: string }) : this.pixiNodes.get(ref)?.data;

	/** Resolve an enclosure member node ID to position + radius.
	 *  Bound method — avoids per-frame closure allocation. */
	private _resolveEnclosurePos = (id: string) => {
		const pn = this.pixiNodes.get(id);
		return pn ? { x: pn.data.x, y: pn.data.y, radius: pn.radius } : undefined;
	};

	drawEdges() {
		if (!this.edgeGraphics) return;
		// Ring chart mode or edge-skipping viewMode: hide all edges
		if (this.isRingChartMode() || viewModeSkipsEdges(this.panel.viewMode)) {
			this.edgeGraphics.clear();
			return;
		}
		this._frameCounter++;
		// Cache background color to avoid getComputedStyle on every frame
		if (this.cachedBgColor === null) {
			const el = this.canvasWrap ?? this.containerEl;
			const bg = getComputedStyle(el).getPropertyValue("--background-primary").trim();
			this.cachedBgColor = bg ? cssColorToHex(bg) : 0x1e1e2e;
		}

		const cfg = this._buildEdgeDrawConfig();

		drawEdgesImpl(
			this.edgeGraphics,
			this.graphEdges,
			this._resolveEdgePos,
			cfg,
			this.arrowGraphics,
			this.edgeCache,
		);
		// Draw edge labels into dedicated container (on top of edges, below nodes)
		if (this.edgeLabelContainer) {
			drawEdgeLabelsImpl(this.edgeLabelContainer, this.graphEdges, this._resolveEdgePos, cfg);
		}
		this._drawPathfinderOverlay();

		// Ensure arrow layer stays on top of all node containers
		if (this.arrowGraphics && this.worldContainer) {
			this.worldContainer.addChild(this.arrowGraphics);
		}
	}

	/** Assemble the EdgeDrawConfig from current panel state (reuses object to avoid allocation). */
	private _buildEdgeDrawConfig(): EdgeDrawConfig {
		const maxDeg = computeMaxDegree(this.degrees, this.panel.fadeEdgesByDegree);
		const { effectiveId, effectiveSet } = computeEffectiveHighlight(
			this.ephemeralHighlight,
			this.highlightedNodeId,
			this.panel.focusMode,
			this.panel.focusNodeId,
			this.prevHighlightSet,
		);

		// Reuse EdgeDrawConfig object — mutate in place to avoid per-frame allocation
		if (!this._edgeDrawCfg) {
			this._edgeDrawCfg = createDefaultEdgeDrawConfig();
		}
		const cfg = this._edgeDrawCfg;

		const cluster = resolveCableClusters(
			this.clusterMeta,
			() => this.getCachedCentroids(),
		);

		populateEdgeDrawConfig(
			cfg,
			this.panel,
			this.currentLayout,
			effectiveId,
			effectiveSet,
			this._hoverDistMap,
			this.cachedBgColor!,
			this.relationColors,
			this.degrees,
			maxDeg,
			this.graphEdges.length,
			this.pixiNodes.size,
			cluster,
			this.isDarkTheme(),
			{
				scale: this.worldContainer?.scale?.x ?? 1,
				x: this.worldContainer?.x ?? 0,
				y: this.worldContainer?.y ?? 0,
				w: this.canvasWrap?.clientWidth ?? 10000,
				h: this.canvasWrap?.clientHeight ?? 10000,
			},
			() => this.getCachedNodeRadii(),
			() => this.getRoadNetwork(),
		);
		return cfg;
	}

	/** Draw the pathfinder path overlay on a dedicated graphics layer.
	 *  Renders a double-stroke glow (wide translucent + narrow solid) in cyan,
	 *  with a gentle alpha pulse animation and a hop-count label at midpoint. */
	private _drawPathfinderOverlay() {
		const g = this.pathfinderGraphics;
		if (g) g.clear();
		// Remove old label
		if (this.pathfinderLabel) {
			this.pathfinderLabel.destroy();
			this.pathfinderLabel = null;
		}

		if (!(this.panel.showPathfinderOverlay ?? true)) return;
		if (!this.pathfinderPath || this.pathfinderPath.length < 2) return;
		if (!g) return;

		this._pathfinderFrame++;
		const pulse = Math.sin(this._pathfinderFrame * PATHFINDER_PULSE_SPEED) * PATHFINDER_PULSE_AMPLITUDE;
		const glowAlpha = PATHFINDER_GLOW_ALPHA_BASE + pulse;
		const solidAlpha = PATHFINDER_SOLID_ALPHA_BASE + pulse;

		// Collect segment positions
		const segments: { ax: number; ay: number; bx: number; by: number }[] = [];
		for (let i = 0; i < this.pathfinderPath.length - 1; i++) {
			const a = this.pixiNodes.get(this.pathfinderPath[i]);
			const b = this.pixiNodes.get(this.pathfinderPath[i + 1]);
			if (a && b) {
				segments.push({ ax: a.data.x, ay: a.data.y, bx: b.data.x, by: b.data.y });
			}
		}
		if (segments.length === 0) return;

		// Pass 1: wide glow stroke
		g.lineStyle(PATHFINDER_GLOW_STROKE_WIDTH, PATHFINDER_COLOR, glowAlpha);
		for (const s of segments) {
			g.moveTo(s.ax, s.ay);
			g.lineTo(s.bx, s.by);
		}

		// Pass 2: narrow solid stroke on top
		g.lineStyle(PATHFINDER_SOLID_STROKE_WIDTH, PATHFINDER_COLOR, solidAlpha);
		for (const s of segments) {
			g.moveTo(s.ax, s.ay);
			g.lineTo(s.bx, s.by);
		}

		// Draw node dots along the path
		g.lineStyle(0);
		for (const nodeId of this.pathfinderPath) {
			const pn = this.pixiNodes.get(nodeId);
			if (pn) {
				g.beginFill(PATHFINDER_COLOR, solidAlpha);
				g.drawCircle(pn.data.x, pn.data.y, PATHFINDER_DOT_RADIUS);
				g.endFill();
			}
		}

		// Path length label at the midpoint segment
		const midIdx = Math.floor(segments.length / 2);
		const mid = segments[midIdx];
		const mx = (mid.ax + mid.bx) / 2;
		const my = (mid.ay + mid.by) / 2;
		const hops = this.pathfinderPath.length - 1;
		const label = new CanvasText(`${hops} hop${hops !== 1 ? "s" : ""}`, {
			fontFamily: "Inter, sans-serif",
			fontSize: PATHFINDER_LABEL_FONT_SIZE,
			fontWeight: "600",
			fill: PATHFINDER_COLOR_CSS,
		});
		label.x = mx + PATHFINDER_LABEL_OFFSET_X;
		label.y = my + PATHFINDER_LABEL_OFFSET_Y;
		// Counter-scale so label stays readable at any zoom
		const ws = this.worldContainer?.scale.x ?? 1;
		if (ws > 0) {
			label.scale.x = 1 / ws;
			label.scale.y = 1 / ws;
		}
		if (this.pathfinderGraphics?.parent) {
			this.pathfinderGraphics.parent.addChild(label);
		}
		this.pathfinderLabel = label;
	}

	// =========================================================================
	// Tag enclosures (delegated to EnclosureRenderer)
	// =========================================================================
	drawEnclosures() {
		if (!this.enclosureGraphics) return;
		// Ring chart mode or non-graph viewMode: hide enclosures
		if (this.isRingChartMode() || viewModeSkipsNodeRendering(this.panel.viewMode)) {
			this.enclosureGraphics.clear();
			return;
		}
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const cfg: EnclosureConfig = {
			tagDisplay: this.panel.tagDisplay,
			tagMembership: this.tagMembership,
			nodeColorMap: this.nodeColorMap,
			tagRelPairsCache: this.tagRelPairsCache,
			resolvePos: this._resolveEnclosurePos,
			worldScale: this.worldContainer?.scale.x ?? 1,
			totalNodeCount: this.pixiNodes.size,
			enclosureMinRatio: this.plugin.settings.enclosureMinRatio,
			onTagHover: (tag) => {
				this.hoveredTag = tag;
				if (tag) {
					const members = this.tagMembership.get(tag);
					if (members) this.applyEphemeralHighlight(new Set(members));
				} else {
					this.applyEphemeralHighlight(null);
				}
			},
			// FJ: Click enclosure label to filter by tag
			onTagClick: (tag) => {
				this.panel.searchQuery = `tag:${tag}`;
				this.rawData = null;
				this.doRender();
				this.requestSave();
			},
			enclosureLabelPosition: rt.enclosureLabelPosition,
			enclosureFillOpacity: rt.enclosureFillOpacity,
			enclosureStrokeWidth: rt.enclosureStrokeWidth,
			enclosureZoomOutThreshold: rt.enclosureZoomOutThreshold,
			hoveredTag: this.hoveredTag,
			labelContainer: this.enclosureLabelContainer ?? undefined,
			groupLabelFontSize: rt.groupLabelFontSize,
			groupLabelFontWeight: rt.groupLabelFontWeight,
			groupLabelLetterSpacing: rt.groupLabelLetterSpacing,
			groupLabelAlpha: rt.groupLabelAlpha,
			groupLabelHullOffset: rt.groupLabelHullOffset,
			groupLabelBgAlpha: rt.groupLabelBgAlpha,
			enclosureOutlierFactor: rt.enclosureOutlierFactor,
			highContrast: this.panel.highContrastMode,
			clusterLabelDetail: this.panel.clusterLabelDetail,
			getClusterSummary: (tag, count) => {
				// S3: Cluster summary — detail level determines content
				const members = this.tagMembership.get(tag);
				if (!members) return `#${tag} (${count})`;
				const tagCounts = new Map<string, number>();
				for (const id of members) {
					const pn = this.pixiNodes.get(id);
					if (pn?.data.tags) {
						for (const t of pn.data.tags) {
							if (t !== tag) incCounter(tagCounts, t);
						}
					}
				}
				const topTags = [...tagCounts.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 3)
					.map(([t]) => t);
				const tagSuffix = topTags.length > 0 ? ` · ${topTags.join(", ")}` : "";
				// "detailed" level: count + top tags (no health score)
				if (this.panel.clusterLabelDetail === "detailed") {
					return `#${tag} (${count})${tagSuffix}`;
				}
				// "rich" level: count + health score + top tags
				const memberSet = new Set(members);
				let internalEdges = 0;
				if (this.graphEdges && memberSet.size >= 2) {
					for (const e of this.graphEdges) {
						if (memberSet.has(e.source) && memberSet.has(e.target)) internalEdges++;
					}
				}
				const maxEdges = (memberSet.size * (memberSet.size - 1)) / 2;
				const density = maxEdges > 0 ? ((internalEdges / maxEdges) * 100).toFixed(0) : "0";
				const healthSuffix = memberSet.size >= 3 ? ` [${density}%]` : "";
				return `#${tag} (${count})${healthSuffix}${tagSuffix}`;
			},
		};
		drawEnclosuresImpl(this.enclosureGraphics, this.enclosureLabels, this.overlapCache, cfg);
	}

	/** Show group name labels when zoomed out past the text fade threshold.
	 *  Labels appear at each group's centroid (super-node position or member average).
	 *  Heavy logic delegated to group-label-manager.ts. */
	private _updateGroupByLabels(): void {
		const rawWs = this.worldContainer?.scale.x ?? 1;
		const ws = isFinite(rawWs) && rawWs > 0 ? rawWs : 1;
		const fadeThreshold = Math.max(this.panel.textFadeThreshold, 0.4);
		const groupBy = this.panel.groupBy;
		const hasGroupBy = !!(groupBy && groupBy !== "none");
		const hasTagEnclosures =
			this.panel.showTagNodes && this.panel.tagDisplay === "enclosure" && this.tagMembership.size > 0;
		const hasGroups = hasGroupBy || hasTagEnclosures;
		const autoFolderGroups = !hasGroups && ws < fadeThreshold && this.panel.viewMode === "graph";

		// Hide all labels when zoomed in enough or in non-graph viewMode
		if ((!hasGroups && !autoFolderGroups) || ws >= fadeThreshold || this.panel.viewMode !== "graph") {
			for (const lbl of this.groupByLabels.values()) lbl.visible = false;
			if (this.clusterBoundaryGraphics) this.clusterBoundaryGraphics.clear();
			return;
		}

		// Throttle: skip full recomputation if < 100ms since last update (10fps cap)
		const now = performance.now();
		if (now - this._groupLabelLastUpdate < 100 && this.groupByLabels.size > 0) return;
		this._groupLabelLastUpdate = now;

		const { groups, members } = this._collectGroupData(hasGroupBy, groupBy, hasTagEnclosures, autoFolderGroups);
		this.groupByMembers = members;

		this._drawGroupBoundaries(members, autoFolderGroups);
		this._placeGroupLabels(groups, ws, fadeThreshold);
	}

	/** Collect group centroids and member IDs from pixiNodes. */
	private _collectGroupData(hasGroupBy: boolean, groupBy: string | undefined, hasTagEnclosures: boolean, autoFolderGroups: boolean): ReturnType<typeof collectGroupCentroids> {
		const nodeInfos: GroupNodeInfo[] = [];
		for (const pn of this.pixiNodes.values()) {
			nodeInfos.push({
				id: pn.data.id, filePath: pn.data.filePath, tags: pn.data.tags,
				meta: pn.data.meta,
				x: pn.data.x, y: pn.data.y, gfxX: pn.gfx.x, gfxY: pn.gfx.y,
				collapsedMembers: pn.data.collapsedMembers,
			});
		}
		return collectGroupCentroids(nodeInfos, {
			hasGroupBy,
			groupByFields: hasGroupBy ? parseGroupByFields(groupBy!) : [],
			hasTagEnclosures,
			autoFolderGroups,
		});
	}

	/** Draw cluster boundary outlines (only for explicit groupBy, not auto-folder). */
	private _drawGroupBoundaries(members: Map<string, Set<string>>, autoFolderGroups: boolean): void {
		const gfx = this.clusterBoundaryGraphics;
		if (!gfx) return;
		if (autoFolderGroups) { gfx.clear(); return; }
		const nodePositions = new Map<string, { x: number; y: number }>();
		for (const pn of this.pixiNodes.values()) {
			nodePositions.set(pn.data.id, { x: pn.gfx.x, y: pn.gfx.y });
		}
		drawClusterBoundaries(gfx, members, nodePositions, this.pixiNodes.size, this._hoveredGroupLabel, this._cachedHulls);
	}

	/** Compute and apply group label placements. */
	private _placeGroupLabels(
		groups: Map<string, GroupCentroid>,
		ws: number, fadeThreshold: number,
	): void {
		const labelContainer = this.groupByLabelContainer;
		if (!labelContainer) return;
		const world = this.worldContainer;
		if (world && world.children[world.children.length - 1] !== labelContainer) {
			world.removeChild(labelContainer);
			world.addChild(labelContainer);
		}

		const canvasW = this.canvasWrap?.clientWidth ?? 800;
		const canvasH = this.canvasWrap?.clientHeight ?? 600;
		const alpha = computeGroupLabelAlpha(ws, fadeThreshold);

		const { placements, visibleKeys } = computeGroupLabelPlacements(
			groups, this.pixiNodes.size, ws, world?.x ?? 0, world?.y ?? 0, canvasW, canvasH,
		);
		applyGroupLabelPlacements(placements, visibleKeys, this.groupByLabels, labelContainer, ws, alpha, this._hoveredGroupLabel);
	}

	/**
	 * At extreme zoom-out with groupBy="none", draw folder-based aggregate
	 * summaries so the canvas is not empty. Heavy logic in group-label-manager.ts.
	 */
	private _drawZoomAggregates(): void {
		const ws = this.worldContainer?.scale?.x ?? 1;
		const aggregateMode =
			ws < AGGREGATE_ZOOM_THRESHOLD &&
			(!this.panel.groupBy || this.panel.groupBy === "none") &&
			this.panel.viewMode === "graph";

		// Clear previous aggregates
		if (this._aggregateGraphics) this._aggregateGraphics.clear();
		for (const lbl of this._aggregateLabels) lbl.visible = false;

		// Set aggregate flag on RenderPipeline so redrawNodeBatch skips individual nodes
		if (this.renderPipeline) {
			this.renderPipeline.aggregateMode = aggregateMode;
		}

		this._aggregateHitRegions = [];

		if (!aggregateMode || this.pixiNodes.size === 0) return;

		// Lazily create the graphics layer
		if (!this._aggregateGraphics && this.worldContainer) {
			this._aggregateGraphics = new CanvasGraphics();
			this.worldContainer.addChild(this._aggregateGraphics);
		}
		const g = this._aggregateGraphics;
		if (!g || !this.worldContainer) return;

		const nodeData = Array.from(this.pixiNodes.values(), (pn) => ({
			filePath: pn.data.filePath,
			x: pn.data.x,
			y: pn.data.y,
		}));
		const aggregateGroups = computeAggregateGroups(nodeData);
		const { hitRegions } = drawAggregateGroups(aggregateGroups, g, this.worldContainer, this._aggregateLabels, ws);
		this._aggregateHitRegions = hitRegions;
	}

	/** Hit-test group/aggregate labels and zoom to the matching cluster. */
	hitTestAndZoomGroupLabel(wx: number, wy: number): boolean {
		// Check aggregate hit regions (zoom-out folder summaries)
		const hitRegion = hitTestAggregateRegions(wx, wy, this._aggregateHitRegions);
		if (hitRegion) {
			this._zoomToWorldRect(hitRegion.cx - hitRegion.r, hitRegion.cy - hitRegion.r, hitRegion.r * 2, hitRegion.r * 2);
			return true;
		}
		// Check groupBy labels
		for (const [, txt] of this.groupByLabels) {
			if (!txt.visible) continue;
			const cs = txt.scale?.x ?? 1;
			const tw = (txt.width ?? 100) * cs;
			const th = 20 * cs;
			const lx = txt.x - tw / 2;
			const ly = txt.y - th / 2;
			if (wx >= lx && wx <= lx + tw && wy >= ly && wy <= ly + th) {
				 
				const memberKey = (txt as CanvasText & { _groupKey?: string })._groupKey;
				if (memberKey) {
					const bounds = computeGroupMemberBounds(this.pixiNodes.values(), memberKey, 50);
					if (bounds) {
						this._zoomToWorldRect(bounds.x, bounds.y, bounds.w, bounds.h);
						return true;
					}
				}
				// Fallback: zoom to label position
				this._zoomToWorldRect(txt.x - ZOOM_TO_LABEL_RECT / 2, txt.y - ZOOM_TO_LABEL_RECT / 2, ZOOM_TO_LABEL_RECT, ZOOM_TO_LABEL_RECT);
				return true;
			}
		}
		return false;
	}

	/** Animate zoom to a world-coordinate rectangle. */
	private _zoomToWorldRect(wx: number, wy: number, ww: number, wh: number): void {
		const world = this.worldContainer;
		const canvas = this.pixiApp?.view;
		if (!world || !canvas) return;
		const cw = canvas.width;
		const ch = canvas.height;
		const newScale = Math.min(cw / Math.max(ww, 1), ch / Math.max(wh, 1), 2.0) * 0.85;
		const cx = wx + ww / 2;
		const cy = wy + wh / 2;
		world.scale.set(newScale);
		world.x = cw / 2 - cx * newScale;
		world.y = ch / 2 - cy * newScale;
		// Suppress autoFitView from simulation end — user explicitly zoomed to a region
		this._suppressAutoFit = true;
		this.markDirty(true);
		if (this.updateLabelsForZoom) this.updateLabelsForZoom();
	}

	drawSunburstArcs() {
		const gfx = this.sunburstGraphics;
		if (!gfx) return;
		gfx.clear();

		// LAYOUT_SUNBURST viewMode: delegate to layout-based arc renderer
		if (this.currentLayout === LAYOUT_SUNBURST) {
			this.drawSunburstLayoutArcs();
			return;
		}

		const sunburstArcs = this.clusterMeta?.sunburstArcs;
		if (!sunburstArcs || sunburstArcs.length === 0) return;

		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const depthLighten = rt.sunburstDepthLighten;
		const borderWidth = rt.sunburstBorderWidth;
		const borderAlpha = rt.sunburstBorderAlpha;

		// Build root-level group → color index map
		// depth=0 arcs are root level; deeper arcs inherit via parentKey
		const rootColorIdx = new Map<string, number>();
		let colorIdx = 0;
		for (const arc of sunburstArcs) {
			if (arc.depth === 0 && !rootColorIdx.has(arc.groupKey)) {
				rootColorIdx.set(arc.groupKey, colorIdx++);
			}
		}
		// Resolve color index for any arc (via parentKey for deeper arcs)
		const getColorIdx = (arc: (typeof sunburstArcs)[0]) => {
			if (arc.depth === 0) return rootColorIdx.get(arc.groupKey) ?? 0;
			if (arc.parentKey) return rootColorIdx.get(arc.parentKey) ?? 0;
			// Fallback: strip "::" and look up
			const parent = arc.groupKey.replace(/::.*$/, "");
			return rootColorIdx.get(parent) ?? 0;
		};

		const worldScale = this.worldContainer?.scale.x ?? 1;
		const lineW = Math.max(0.8, 1.5 / worldScale);
		const thinW = Math.max(0.4, 0.8 / worldScale);
		const bdrW = Math.max(0.5, borderWidth / worldScale);

		const isRingChart = this.panel.ringChartMode;

		if (isRingChart) {
			// === Ring Chart Mode: opaque filled sectors with depth gradient ===
			for (const arc of sunburstArcs) {
				const { cx, cy, rInner, rOuter, startAngle, endAngle, depth } = arc;
				if (rOuter <= 0 || endAngle - startAngle < ARC_ANGLE_EPSILON) continue;

				const ci = getColorIdx(arc);
				const css = DEFAULT_COLORS[ci % DEFAULT_COLORS.length];
				const baseColor = cssColorToHex(css);
				const color = this.lightenHexColor(baseColor, depth * depthLighten);
				const fillAlpha = Math.max(RING_FILL_ALPHA_FLOOR, RING_FILL_ALPHA_BASE - depth * RING_FILL_ALPHA_DEPTH_DECAY);

				gfx.lineStyle(bdrW, 0xffffff, borderAlpha);
				gfx.beginFill(color, fillAlpha);
				this.drawArcPath(gfx, cx, cy, rInner, rOuter, startAngle, endAngle);
				gfx.endFill();
			}
		} else {
			// === Normal Mode: light fill + outlines with depth gradient ===
			for (const arc of sunburstArcs) {
				const { cx, cy, rInner, rOuter, startAngle, endAngle, depth } = arc;
				if (rOuter <= 0 || endAngle - startAngle < ARC_ANGLE_EPSILON) continue;

				const ci = getColorIdx(arc);
				const css = DEFAULT_COLORS[ci % DEFAULT_COLORS.length];
				const baseColor = cssColorToHex(css);
				const color = this.lightenHexColor(baseColor, depth * depthLighten);
				const fillAlpha = Math.max(SUNBURST_FILL_ALPHA_FLOOR, SUNBURST_FILL_ALPHA_BASE - depth * SUNBURST_FILL_ALPHA_DEPTH_DECAY);
				const strokeAlpha = Math.max(SUNBURST_STROKE_ALPHA_FLOOR, SUNBURST_STROKE_ALPHA_BASE - depth * SUNBURST_STROKE_ALPHA_DEPTH_DECAY);

				// Light fill
				gfx.beginFill(color, fillAlpha);
				this.drawArcPath(gfx, cx, cy, rInner, rOuter, startAngle, endAngle);
				gfx.endFill();

				// Outlines
				const w = depth > 0 ? thinW : lineW;
				gfx.lineStyle(w, color, strokeAlpha);
				this.drawArcLine(gfx, cx, cy, rOuter, startAngle, endAngle);
				this.drawArcLine(gfx, cx, cy, rInner, startAngle, endAngle);

				// Radial separators
				gfx.lineStyle(w, color, strokeAlpha * 0.7);
				gfx.moveTo(cx + rInner * Math.cos(startAngle), cy + rInner * Math.sin(startAngle));
				gfx.lineTo(cx + rOuter * Math.cos(startAngle), cy + rOuter * Math.sin(startAngle));
				gfx.moveTo(cx + rInner * Math.cos(endAngle), cy + rInner * Math.sin(endAngle));
				gfx.lineTo(cx + rOuter * Math.cos(endAngle), cy + rOuter * Math.sin(endAngle));
			}
		}
	}

	/** Lighten a hex color by a factor (0-1). factor=0.2 means 20% lighter. */
	private lightenHexColor(hex: number, factor: number): number {
		return lightenHex(hex, factor);
	}

	/** Draw labels on cluster sunburst arcs (depth ≤ 1 only, wide arcs) */
	private drawClusterSunburstLabels() {
		const sunburstArcs = this.clusterMeta?.sunburstArcs;
		if (!sunburstArcs || sunburstArcs.length === 0) {
			// Clear existing labels
			for (const lbl of this.clusterSunburstLabels.values()) {
				lbl.parent?.removeChild(lbl);
				lbl.destroy();
			}
			this.clusterSunburstLabels.clear();
			return;
		}

		if (!this.clusterSunburstLabelContainer && this.worldContainer) {
			this.clusterSunburstLabelContainer = new CanvasContainer();
			this.worldContainer.addChild(this.clusterSunburstLabelContainer);
		}
		const container = this.clusterSunburstLabelContainer;
		if (!container) return;

		// Clear old labels
		for (const lbl of this.clusterSunburstLabels.values()) {
			lbl.parent?.removeChild(lbl);
			lbl.destroy();
		}
		this.clusterSunburstLabels.clear();

		const rtSb = mergeRenderThresholds(this.panel.renderThresholds);
		const worldScale = this.worldContainer?.scale.x ?? 1;
		const sbFontBase = rtSb.groupLabelFontSize ?? 12;
		const sbFontMin = rtSb.groupLabelScaleMin ?? 0.6;
		const fontSize = Math.max(sbFontBase * sbFontMin, sbFontBase / worldScale);
		const isDark = this.cachedIsDark ?? true;
		const textColor = isDark ? 0xdddddd : 0x333333;

		const minSweep = rtSb.sunburstMinArcSweep ?? 0.005;

		for (const arc of sunburstArcs) {
			if (arc.depth > 1) continue;
			if (arc.endAngle - arc.startAngle < minSweep) continue;

			const text = this._createSunburstArcLabel(arc, fontSize, textColor);
			container.addChild(text);
			this.clusterSunburstLabels.set(`${arc.groupKey}:${arc.depth}`, text);
		}

		// --- Label collision avoidance for rotated labels ---
		this.cullOverlappingRotatedLabels(this.clusterSunburstLabels);
	}

	/** Create a positioned and rotated label for a sunburst arc. */
	 
	private _createSunburstArcLabel(arc: import("../layouts/sunburst").SunburstArcEnriched, fontSize: number, textColor: number): CanvasText {
		const midAngle = (arc.startAngle + arc.endAngle) / 2;
		const midR = (arc.rInner + arc.rOuter) / 2;
		const displayName = arc.groupKey.replace(/::.*$/, "").split("/").pop() || arc.groupKey;
		const text = new CanvasText(displayName, {
			fontSize: arc.depth === 0 ? fontSize * 1.2 : fontSize,
			fill: textColor,
			fontWeight: arc.depth === 0 ? "bold" : "600",
			align: "center",
		});
		text.anchor.set(0.5, 0.5);
		text.strokeColor = 0x000000;
		text.strokeWidth = arc.depth === 0 ? 3 : 2;
		text.x = arc.cx + midR * Math.cos(midAngle);
		text.y = arc.cy + midR * Math.sin(midAngle);
		let rotation = midAngle + Math.PI / 2;
		if (rotation > Math.PI / 2 && rotation < (3 * Math.PI) / 2) {
			rotation += Math.PI;
		}
		text.rotation = rotation;
		return text;
	}

	/** Draw an arc line (stroke only, no fill) */
	private drawArcLine(gfx: CanvasGraphics, cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
		const steps = Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 20));
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const a = startAngle + t * (endAngle - startAngle);
			const x = cx + r * Math.cos(a);
			const y = cy + r * Math.sin(a);
			if (i === 0) gfx.moveTo(x, y);
			else gfx.lineTo(x, y);
		}
	}

	/** Draw a baumkuchen-shaped arc path (annular sector) for fills */
	private drawArcPath(
		gfx: CanvasGraphics,
		cx: number,
		cy: number,
		rInner: number,
		rOuter: number,
		startAngle: number,
		endAngle: number,
	) {
		const steps = Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 20));

		// Outer arc (clockwise)
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const a = startAngle + t * (endAngle - startAngle);
			const x = cx + rOuter * Math.cos(a);
			const y = cy + rOuter * Math.sin(a);
			if (i === 0) gfx.moveTo(x, y);
			else gfx.lineTo(x, y);
		}

		// Inner arc (counter-clockwise)
		for (let i = steps; i >= 0; i--) {
			const t = i / steps;
			const a = startAngle + t * (endAngle - startAngle);
			const x = cx + rInner * Math.cos(a);
			const y = cy + rInner * Math.sin(a);
			gfx.lineTo(x, y);
		}

		gfx.closePath();
	}

	// =========================================================================
	// Timeline duration bars
	// =========================================================================
	drawTimelineBars() {
		renderTimelineBars(this as unknown as import("./timeline-bar-renderer").TimelineBarHost);
	}

	drawRouteLines() {
		const g = this.routeGraphics;
		if (!g) return;
		g.clear();

		const routes = this.routeData;
		if (!routes || routes.length === 0) return;
		if (!this.panel.showTimelineRoutes) return;

		const worldScale = this.worldContainer?.scale.x ?? 1;
		// Route line width: ensure at least 2px on screen
		const baseWidth = Math.max(3, 6 / Math.max(worldScale, 0.1));
		const alpha = 0.55;

		const centroids = this.clusterMeta?.clusterCentroids;
		if (!centroids) return;
		const sortedKeys = [...centroids.keys()].sort();

		// Set round line caps and joins for smooth curves
		g.setLineCap("round");
		g.setLineJoin("round");

		for (const route of routes) {
			if (route.waypoints.length < 2) continue;

			// Get group color from DEFAULT_COLORS palette
			const colorIdx = sortedKeys.indexOf(route.groupKey);
			const colorHex = DEFAULT_COLORS[(colorIdx >= 0 ? colorIdx : 0) % DEFAULT_COLORS.length];
			const color = cssColorToHex(colorHex);

			g.lineStyle(baseWidth, color, alpha);

			// Resolve live node positions instead of frozen target positions
			const pts = route.waypoints.map((wp) => {
				const pn = wp.nodeId ? this.pixiNodes.get(wp.nodeId) : null;
				return pn ? { x: pn.data.x, y: pn.data.y } : wp;
			});
			if (pts.length < 2) continue;
			g.moveTo(pts[0].x, pts[0].y);

			// Straight line segments connecting timeline nodes
			for (let i = 1; i < pts.length; i++) {
				g.lineTo(pts[i].x, pts[i].y);
			}
		}
	}

	// Phantom node generation extracted to phantom-node-generator.ts

	// =========================================================================
	// Road Network — auto-generated roads from coordinate grid lines
	// =========================================================================

	/** Ensure the road builder is initialized and return it. */
	private _ensureRoadBuilder(): RoadNetworkBuilder {
		if (!this.roadBuilder) {
			this.roadBuilder = new RoadNetworkBuilder(this as unknown as RoadNetworkHost);
		}
		return this.roadBuilder;
	}

	private _rebuildRoadNetwork(final = false) {
		this._ensureRoadBuilder().rebuild(final);
	}

	/** Compute axis-aligned bounding box from node positions */
	computeNodeBounds(nodes: GraphNode[]): { xMin: number; yMin: number; xMax: number; yMax: number } {
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;
		for (const n of nodes) {
			if (n.x < minX) minX = n.x;
			if (n.x > maxX) maxX = n.x;
			if (n.y < minY) minY = n.y;
			if (n.y > maxY) maxY = n.y;
		}
		return { xMin: minX, yMin: minY, xMax: maxX, yMax: maxY };
	}

	drawRoadNetwork() {
		// Non-graph viewModes: skip road network
		if (this.panel.viewMode !== "graph") {
			if (this.trayGraphics) this.trayGraphics.clear();
			return;
		}
		const rb = this._ensureRoadBuilder();
		// Build road network if not finalized and not yet built
		if (!rb.finalized && !rb.trayData && this._hasPositionedNodes()) {
			rb.rebuild();
		}

		const g = this.trayGraphics;
		if (!g) return;

		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const worldScale = this.worldContainer?.scale.x ?? 1;

		// LOD: toggle visibility without clearing draw commands.
		// Roads are expensive to redraw (~120K cmds), so we keep them cached
		// and only toggle g.visible for zoom-based LOD.
		if (!rt.showRoadNetwork || worldScale < rt.roadMinZoom) {
			g.visible = false;
			return;
		}
		g.visible = true;

		// Road width adapts to zoom: ensure minimum screen-space visibility.
		// We must redraw when zoom changes significantly because lineStyle
		// width is baked into the draw commands.
		const roadColor = rt.roadColor;
		const baseRoadWidth = rt.roadWidth;
		// Minimum 1px on screen → minWorldWidth = 1/worldScale
		const minScreenPx = rt.roadMinScreenWidth;
		const effectiveWidth = Math.max(baseRoadWidth, minScreenPx / worldScale);

		// Skip redraw if road commands are up-to-date AND zoom hasn't changed
		// enough to require width recalculation
		if (rb.roadDrawn && g.commandCount > 0) {
			const widthRatio = rb._lastRoadWidth > 0 ? effectiveWidth / rb._lastRoadWidth : 999;
			if (widthRatio > 0.8 && widthRatio < 1.25) return; // within 20% tolerance
		}

		g.clear();

		// Use instance-level network for drawing (sparse, ~200 segments).
		const network = rb.trayData;
		if (!network || network.intersections.length === 0) return;

		const baseAlpha = rt.roadAlpha;

		g.setLineCap("round");
		g.setLineJoin("round");

		// --- Single pass: semi-transparent band (the "road surface") ---
		g.lineStyle(effectiveWidth, roadColor, baseAlpha);
		for (const seg of network.segments) {
			const from = network.intersections[seg.from];
			const to = network.intersections[seg.to];
			if (!from || !to) continue;
			g.moveTo(from.x, from.y);
			for (const wp of seg.waypoints) g.lineTo(wp.x, wp.y);
			g.lineTo(to.x, to.y);
		}

		rb.roadDrawn = true;
		rb._lastRoadWidth = effectiveWidth;
	}

	/** Check if any node has a non-origin position. */
	private _hasPositionedNodes(): boolean {
		if (this.pixiNodes.size === 0) return false;
		for (const pn of this.pixiNodes.values()) {
			if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) return true;
		}
		return false;
	}

	/** Get road network for edge routing */
	getRoadNetwork(): RoadNetwork | null {
		return getBestRoadNetwork(this.roadBuilder);
	}

	// =========================================================================
	// Layout transition animation (called by RenderPipeline each frame)
	// =========================================================================
	tickLayoutTransition(): boolean {
		return this.layoutTransition.tick();
	}

	// =========================================================================
	// Update positions
	// =========================================================================
	// Delegated to RenderPipeline
	// =========================================================================
	markDirty(forceFullRedraw = false) {
		this._viewportDirty = true;
		this.renderPipeline?.markDirty(forceFullRedraw);
		// 注釈位置をワールド座標に同期
		this._updateAnnotationPositions();
	}

	private startRenderLoop() {
		this.renderPipeline?.startRenderLoop();
	}

	wakeRenderLoop() {
		this.renderPipeline?.wakeRenderLoop();
	}

	/** Update the off-screen node count badge overlay. */
	private _updateOobBadge() {
		const el = this.oobBadgeEl;
		if (!el) return;
		if (!this.panel.showOutOfBoundsIndicator) {
			el.style.display = "none";
			return;
		}
		const world = this.worldContainer;
		if (!world || this.pixiNodes.size === 0) {
			el.style.display = "none";
			return;
		}
		const zoom = world.scale.x || 1;
		const cw = this.canvasWrap?.clientWidth ?? DEFAULT_CANVAS_WIDTH;
		const ch = this.canvasWrap?.clientHeight ?? DEFAULT_CANVAS_HEIGHT;
		const vpMinX = -world.x / zoom;
		const vpMinY = -world.y / zoom;
		const vpMaxX = vpMinX + cw / zoom;
		const vpMaxY = vpMinY + ch / zoom;

		let offCount = 0;
		const hiddenBySearch = this.getSearchHiddenNodes();
		for (const pn of this.pixiNodes.values()) {
			if (hiddenBySearch.has(pn.data.id)) continue;
			const nx = pn.data.x,
				ny = pn.data.y;
			if (nx < vpMinX || nx > vpMaxX || ny < vpMinY || ny > vpMaxY) {
				offCount++;
			}
		}
		if (offCount === 0) {
			el.style.display = "none";
			return;
		}
		el.style.display = "";
		el.textContent = t("oob.offScreen").replace("{count}", String(offCount));
	}

	private createPixiNodes(nodes: GraphNode[], nodeR: (n: GraphNode) => number, nodeColor: (n: GraphNode) => number) {
		// Exclude phantom nodes (road-network routing junctions) from rendering
		const visible = nodes.filter((n) => !n.isPhantom);
		this.renderPipeline?.createPixiNodes(visible, nodeR, nodeColor);
	}

	/** Rebuild PixiJS node display objects in place (no simulation restart).
	 *  Used for settings that change labels/icons/shapes but not layout. */
	rebuildNodesInPlace() {
		// Save current positions
		const savedPos = new Map<string, { x: number; y: number }>();
		for (const [id, pn] of this.pixiNodes) {
			savedPos.set(id, { x: pn.data.x, y: pn.data.y });
		}
		// Get current graph data
		const nodes = [...this.pixiNodes.values()].map((pn) => pn.data);
		const nodeR = this._buildNodeRadiusFn();
		const gd: GraphData = { nodes, edges: this.graphEdges };
		const nodeColor = this._buildNodeColorFn(gd);
		// Recreate display objects
		this.createPixiNodes(nodes, nodeR, nodeColor);
		// Restore positions
		for (const [id, pn] of this.pixiNodes) {
			const pos = savedPos.get(id);
			if (pos) {
				pn.data.x = pos.x;
				pn.data.y = pos.y;
				pn.gfx.x = pos.x;
				pn.gfx.y = pos.y;
			}
		}
		this.applyTextFade();
		this.markDirty(true);
		this.requestSave();
	}

	private drawNodeCircle(pn: PixiNode, highlight: boolean) {
		this.renderPipeline?.drawNodeCircle(pn, highlight);
	}

	private redrawNodeBatch() {
		this.renderPipeline?.redrawNodeBatch();
	}

	private updatePositions(_forceFullRedraw = false) {
		// Delegate position sync to the pipeline; this method is still called
		// from doRender for the initial layout draw.
		for (const pn of this.pixiNodes.values()) {
			pn.gfx.x = pn.data.x;
			pn.gfx.y = pn.data.y;
		}
		this.rebuildSpatialGrid();
		this.redrawNodeBatch();
		this.drawOrbitRings();
		this.drawEnclosures();
		this._updateGroupByLabels();
		this._drawZoomAggregates();
		this.drawSunburstArcs();
		this.drawClusterSunburstLabels();
		this.drawSunburstLayoutArcs();
		this.drawEdges();
		this.drawTimelineBars();
		this.drawRouteLines();
	}

	// =========================================================================
	// Auto-fit view
	// =========================================================================

	/**
	 * Public entry point for triggering a one-shot auto-fit from outside the
	 * class (e.g. E2E tests, external toolbar buttons).  Reads the current
	 * canvas dimensions and delegates to the private autoFitView() helper,
	 * then wakes the render loop so the new transform is painted.
	 */
	autoFitOnce() {
		if (!this.canvasWrap) return;
		this.autoFitView(this.canvasWrap.clientWidth, this.canvasWrap.clientHeight);
		this.markDirty();
	}

	/**
	 * Scale node world positions outward so the graph fills at least
	 * minViewportUtilization of the viewport at z=1.0.
	 * Called after layout computation, before autoFitView/rendering.
	 */
	private ensureViewportUtilization(vpW: number, vpH: number): void {
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const minUtil = rt.minViewportUtilization;
		if (minUtil <= 0 || this.pixiNodes.size < 2) return;

		const bbox = this._computeNodeBBox();
		const bboxW = bbox.maxX - bbox.minX;
		const bboxH = bbox.maxY - bbox.minY;
		const bboxArea = bboxW * bboxH;
		const vpArea = vpW * vpH;
		if (vpArea <= 0) return;

		const util = bboxArea / vpArea;
		if (util >= minUtil) return;

		const cx = (bbox.minX + bbox.maxX) / 2;
		const cy = (bbox.minY + bbox.maxY) / 2;

		if (bboxArea < 1) {
			// All nodes at same position -- spread in a circle
			const defaultR = Math.sqrt(vpW * vpH * minUtil) / 2;
			const nodes = Array.from(this.pixiNodes.values());
			const n = nodes.length;
			nodes.forEach((pn, i) => {
				const angle = (2 * Math.PI * i) / n;
				pn.data.x = cx + defaultR * Math.cos(angle);
				pn.data.y = cy + defaultR * Math.sin(angle);
			});
			return;
		}

		// Detect and fix degenerate (line-like) distributions
		const avgNodeR = this._computeAvgNodeRadius();
		const degenerateThreshold = avgNodeR * 4;
		this._spreadDegenerateAxis(cx, cy, vpW, vpH, bboxW, bboxH, degenerateThreshold, minUtil, vpArea);

		// Recompute bbox after degenerate fix
		const bbox2 = this._computeNodeBBox();
		const bboxArea2 = (bbox2.maxX - bbox2.minX) * (bbox2.maxY - bbox2.minY);
		const util2 = bboxArea2 / vpArea;
		if (util2 >= minUtil) return;

		const cx2 = (bbox2.minX + bbox2.maxX) / 2;
		const cy2 = (bbox2.minY + bbox2.maxY) / 2;
		const scaleFactor = this._computeViewportScaleFactor(
			bbox2.maxX - bbox2.minX,
			bbox2.maxY - bbox2.minY,
			minUtil,
			vpArea,
			util2,
		);
		for (const pn of this.pixiNodes.values()) {
			pn.data.x = cx2 + (pn.data.x - cx2) * scaleFactor;
			pn.data.y = cy2 + (pn.data.y - cy2) * scaleFactor;
		}
	}

	/** Compute axis-aligned bounding box of all nodes (including radius). */
	private _computeNodeBBox(): { minX: number; minY: number; maxX: number; maxY: number } {
		return computeNodeBBox(
			Array.from(this.pixiNodes.values(), (pn) => ({ x: pn.data.x, y: pn.data.y, radius: pn.radius })),
		);
	}

	/** Compute average node radius across all pixiNodes. */
	private _computeAvgNodeRadius(): number {
		let sum = 0;
		for (const pn of this.pixiNodes.values()) sum += pn.radius ?? 12;
		return sum / this.pixiNodes.size;
	}

	/**
	 * Spread nodes along a degenerate (near-zero) axis so the bbox becomes
	 * roughly square before uniform scaling.
	 */
	private _spreadDegenerateAxis(
		cx: number,
		cy: number,
		vpW: number,
		vpH: number,
		bboxW: number,
		bboxH: number,
		degenerateThreshold: number,
		minUtil: number,
		vpArea: number,
	): void {
		if (bboxW > degenerateThreshold && bboxH < degenerateThreshold) {
			const targetH = Math.max(bboxW * 0.3, (minUtil * vpArea) / bboxW);
			const nodes = Array.from(this.pixiNodes.values());
			const n = nodes.length;
			nodes.forEach((pn, i) => {
				const t = n > 1 ? i / (n - 1) - 0.5 : 0;
				pn.data.y = cy + t * targetH;
			});
		} else if (bboxH > degenerateThreshold && bboxW < degenerateThreshold) {
			const targetW = Math.max(bboxH * 0.3, (minUtil * vpArea) / bboxH);
			const nodes = Array.from(this.pixiNodes.values());
			const n = nodes.length;
			nodes.forEach((pn, i) => {
				const t = n > 1 ? i / (n - 1) - 0.5 : 0;
				pn.data.x = cx + t * targetW;
			});
		}
	}

	/**
	 * Compute the uniform scale factor via quadratic equation so that
	 * scaled positions + constant radii meet the minUtil threshold exactly.
	 */
	private _computeViewportScaleFactor(
		bboxW: number,
		bboxH: number,
		minUtil: number,
		vpArea: number,
		util: number,
	): number {
		const avgR = this._computeAvgNodeRadius();
		const posSpanW = Math.max(bboxW - 2 * avgR, 1);
		const posSpanH = Math.max(bboxH - 2 * avgR, 1);
		const A = posSpanW * posSpanH;
		const B = 2 * avgR * (posSpanW + posSpanH);
		const C = 4 * avgR * avgR - minUtil * vpArea;
		const disc = B * B - 4 * A * C;
		return disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : Math.sqrt(minUtil / util); // fallback
	}

	private autoFitView(W: number, H: number) {
		const world = this.worldContainer;
		if (!world || this.pixiNodes.size === 0) return;
		// GY: Skip auto-fit when a preset zoom level is set (avoids race condition)
		if (this.panel.presetZoomLevel > 0) return;

		const isCardMode = (this.panel.nodeDisplayMode ?? "node") === "card";
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };
		const padding = isCardMode ? rt.autoFitCardPadding * 2 : rt.autoFitBasePadding;

		// Card mode: two-pass auto-fit with card dimensions
		if (isCardMode) {
			this._autoFitCardMode(W, H, rt, crc, padding);
			return;
		}

		// DQ-09: Expand bounding box when enclosures are active
		if (this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
			// Note: enclosure padding is handled inside computeAutoFitTransform via node radii
		}

		this._autoFitApply(W, H, rt, padding, isCardMode);
	}

	/** Card-mode two-pass auto-fit: estimate scale, compute card bbox, then fit. */
	private _autoFitCardMode(
		W: number, H: number,
		rt: ReturnType<typeof mergeRenderThresholds>,
		crc: Record<string, number>,
		padding: number,
	): void {
		// Pass 1: estimate scale from node positions
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const pn of this.pixiNodes.values()) {
			const r = pn.radius;
			if (pn.data.x - r < minX) minX = pn.data.x - r;
			if (pn.data.y - r < minY) minY = pn.data.y - r;
			if (pn.data.x + r > maxX) maxX = pn.data.x + r;
			if (pn.data.y + r > maxY) maxY = pn.data.y + r;
		}
		const bw0 = maxX - minX + padding;
		const bh0 = maxY - minY + padding;
		let sc0 = Math.min(W / bw0, H / bh0, 1.5);
		if (rt.autoFitMinScale > 0) sc0 = Math.max(sc0, rt.autoFitMinScale);
		if (this.pixiNodes.size > 0) {
			const sampleR = this.pixiNodes.values().next().value?.radius ?? 1;
			sc0 = Math.max(sc0, rt.cardLODNormalPx / Math.max(sampleR, 1));
		}

		// Pass 2: recompute bbox with card dimensions
		const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : GOLDEN_RATIO_FALLBACK;
		const numFields = (this.panel.cardDisplayConfig?.fields ?? []).length;
		const nodes = [...this.pixiNodes.values()].map((pn) => ({ x: pn.data.x, y: pn.data.y, radius: pn.radius }));
		computeCardBBox(nodes, sc0, cardAR, crc as { tableHeaderHeight: number; fieldLineHeight: number; cardPadding: number }, numFields);

		this._autoFitApply(W, H, rt, padding, true);
	}

	/** Core auto-fit logic: compute transform and apply to world container. */
	private _autoFitApply(W: number, H: number, rt: ReturnType<typeof mergeRenderThresholds>, padding: number, isCardMode: boolean): void {
		const world = this.worldContainer!;

		// Use fresh canvas dimensions if W/H look stale
		if (W <= 0 || H <= 0) {
			const wrap = this.canvasWrap;
			if (!wrap) return;
			W = wrap.clientWidth;
			H = wrap.clientHeight;
			if (W <= 0 || H <= 0) return;
		}

		const fitNodes: { x: number; y: number; r: number }[] = [];
		for (const pn of this.pixiNodes.values()) {
			fitNodes.push({ x: pn.data.x, y: pn.data.y, r: pn.radius });
		}

		const effectiveMinScale = this.panel.viewMode === "timeline" ? 0 : rt.autoFitMinScale;
		const fit = computeAutoFitTransform({
			nodes: fitNodes,
			canvasW: W,
			canvasH: H,
			padding,
			minScale: effectiveMinScale,
			maxScale: 1.5,
		});
		if (!fit) return;

		let sc = fit.scale;
		if (isCardMode && this.pixiNodes.size > 0) {
			const sampleRadius = this.pixiNodes.values().next().value?.radius ?? 1;
			sc = Math.max(sc, rt.cardLODNormalPx / Math.max(sampleRadius, 1));
		}

		world.scale.set(sc);
		world.x = W / 2 - fit.cx * sc;
		world.y = H / 2 - fit.cy * sc;

		// Validation: verify the bbox center maps to viewport center
		const mapped = world.toGlobal({ x: fit.cx, y: fit.cy });
		const dx = W / 2 - mapped.x;
		const dy = H / 2 - mapped.y;
		if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
			world.x += dx;
			world.y += dy;
		}

		// Coverage validation: if <80% of nodes are visible, retry with no padding
		const visFrac = computeVisibleFraction(fitNodes, fit.cx, fit.cy, sc, W, H);
		if (visFrac < 0.8) {
			// eslint-disable-next-line no-console -- dev-only: esbuild strips in prod
			console.warn(`[graph-island] autoFit coverage ${(visFrac * 100).toFixed(0)}% < 80%, retrying`);
			const retry = computeAutoFitTransform({ nodes: fitNodes, canvasW: W, canvasH: H, padding: 0, minScale: 0, maxScale: fit.scale * 1.5 });
			if (retry && retry.scale > 0) {
				world.scale.set(retry.scale);
				world.x = W / 2 - retry.cx * retry.scale;
				world.y = H / 2 - retry.cy * retry.scale;
				sc = retry.scale;
			}
		}

		this.updateLabelsForZoom();
		this.updateZoomIndicator(sc);
	}

	/**
	 * Zoom the view so that the given screen-space rectangle fills the viewport.
	 */
	zoomToScreenRect(sx: number, sy: number, sw: number, sh: number) {
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;

		const W = wrap.clientWidth;
		const H = wrap.clientHeight;
		const stage = this.pixiApp!.stage;

		// Convert screen-space rectangle corners to world coordinates
		const topLeft = world.toLocal({ x: sx, y: sy }, stage);
		const bottomRight = world.toLocal({ x: sx + sw, y: sy + sh }, stage);

		const worldW = bottomRight.x - topLeft.x;
		const worldH = bottomRight.y - topLeft.y;
		const cx = (topLeft.x + bottomRight.x) / 2;
		const cy = (topLeft.y + bottomRight.y) / 2;

		const sc = Math.min(W / worldW, H / worldH, 10);
		world.scale.set(sc);
		world.x = W / 2 - cx * sc;
		world.y = H / 2 - cy * sc;
		this.updateLabelsForZoom();
		this.updateZoomIndicator(sc);
	}

	private zoomBy(factor: number) {
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;
		const cx = wrap.clientWidth / 2;
		const cy = wrap.clientHeight / 2;
		const worldPos = world.toLocal({ x: cx, y: cy }, this.pixiApp!.stage);
		const s = Math.max(0.02, Math.min(10, world.scale.x * factor));
		world.scale.set(s);
		const newScreen = world.toGlobal(worldPos);
		world.x += cx - newScreen.x;
		world.y += cy - newScreen.y;
		this.updateZoomIndicator(s);
		this.updateLabelsForZoom();
		this.markDirty();
	}

	private setZoom(level: number) {
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;
		const target = Math.max(0.02, Math.min(10, level));
		const current = world.scale.x;

		// Skip animation for tiny changes, reduced-motion preference,
		// or Canvas2D backend (CPU-only rendering makes animation expensive)
		if (
			Math.abs(target - current) < ALPHA_EPSILON ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
			!this.pixiApp?.supportsAnimation
		) {
			this._applyZoomImmediate(target);
			return;
		}

		// Cancel any running zoom animation
		if (this._zoomAnimId) cancelAnimationFrame(this._zoomAnimId);

		// Animated zoom (150ms ease-out)
		const cx = wrap.clientWidth / 2;
		const cy = wrap.clientHeight / 2;
		const duration = 150;
		const startTime = performance.now();
		const startScale = current;
		const animate = (now: number) => {
			const t = Math.min((now - startTime) / duration, 1);
			const ease = 1 - (1 - t) * (1 - t);
			const s = startScale + (target - startScale) * ease;
			const worldPos = world.toLocal({ x: cx, y: cy }, this.pixiApp!.stage);
			world.scale.set(s);
			const newScreen = world.toGlobal(worldPos);
			world.x += cx - newScreen.x;
			world.y += cy - newScreen.y;
			this.updateZoomIndicator(s);
			this.markDirty();
			if (t < 1) {
				this._zoomAnimId = requestAnimationFrame(animate);
			} else {
				this._zoomAnimId = 0;
				this.updateLabelsForZoom();
			}
		};
		this._zoomAnimId = requestAnimationFrame(animate);
	}

	private _applyZoomImmediate(level: number) {
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;
		const cx = wrap.clientWidth / 2;
		const cy = wrap.clientHeight / 2;
		const worldPos = world.toLocal({ x: cx, y: cy }, this.pixiApp!.stage);
		world.scale.set(level);
		const newScreen = world.toGlobal(worldPos);
		world.x += cx - newScreen.x;
		world.y += cy - newScreen.y;
		this.updateZoomIndicator(level);
		this.updateLabelsForZoom();
		this.markDirty();
	}

	updateZoomIndicator(scale?: number) {
		if (!this.zoomIndicatorEl) return;
		const s = scale ?? this.worldContainer?.scale?.x ?? 1;
		const pct = `${Math.round(s * 100)}%`;
		let labelInfo = "";
		let mChar = "";
		if (s < 1.0 && this.pixiNodes) {
			let vis = 0;
			for (const pn of this.pixiNodes.values()) {
				if (pn.label?.visible && pn.label.alpha >= 0.1) vis++;
			}
			const rt = mergeRenderThresholds(this.panel.renderThresholds);
			mChar = labelModeChar(s, rt.labelModeOverride, rt.labelInitialsZoom, rt.labelTruncateZoom);
			labelInfo = buildLabelInfo(vis, mChar);
		}
		this.zoomIndicatorEl.textContent = pct + labelInfo;
		this.zoomIndicatorEl.title = buildZoomTooltip(modeDescription(mChar));
		const culled = parseCulledCount(
			this.densityCulledBadgeEl?.style.display !== "none",
			this.densityCulledBadgeEl?.textContent ?? null,
		);
		this._announceA11y(buildZoomA11yMessage(pct, labelInfo, culled));
	}

	// =========================================================================
	// Control Panel UI (delegated to PanelBuilder)
	// =========================================================================
	buildPanel() {
		if (!this.panelEl) return;
		const ctx = this._buildPanelContext();
		const cb = this._buildPanelCallbacks();
		buildPanelUI(this.panelEl, this.panel, ctx, cb);
	}

	/** Build the context object describing current graph state for the panel UI. */
	private _buildPanelContext(): PanelContext {
		return {
			currentLayout: this.currentLayout,
			setLayout: (l: LayoutType) => {
				this.currentLayout = l;
				this.requestSave();
			},
			shells: this.shells,
			pixiNodes: this.pixiNodes,
			relationColors: this.relationColors,
			simulation: this.simulation,
			settings: this.plugin.settings,
			saveSettings: () => {
				this.plugin.saveSettings();
			},
			nodeCount: this.pixiNodes.size,
			edgeCount: this.graphEdges.length,
			app: this.app,
			frontmatterKeys: this.collectFrontmatterKeys(),
			availableGroups: this.collectAvailableGroups(),
			availableTags: this.collectAvailableTags(),
			degrees: this.degrees,
			currentZoom: this.worldContainer?.scale?.x ?? 1,
			edgeTypeCounts: this._countEdgeTypes(),
			hasImageMetaNodes: this._hasImageMetaNodes(),
			hasInheritanceEdges: this.graphEdges.some((e) => e.type === "inheritance"),
			pluginDir: this.plugin.manifest?.dir ?? "",
		};
	}

	/** Count edges by type for progressive disclosure of edge toggles. */
	private _countEdgeTypes(): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const e of this.graphEdges) {
			const t = e.type || "link";
			counts[t] = (counts[t] || 0) + 1;
		}
		return counts;
	}

	/** Check if any nodes have image/thumbnail/cover frontmatter metadata. */
	private _hasImageMetaNodes(): boolean {
		for (const pn of this.pixiNodes.values()) {
			const m = pn.data?.meta;
			if (m && (m.image || m.thumbnail || m.cover)) return true;
		}
		return false;
	}

	/** Build the callbacks object wiring panel UI actions to graph view methods.
	 *  Delegates to panel-callbacks.ts for the actual construction. */
	private _buildPanelCallbacks(): PanelCallbacks {
		 
		const host = this as unknown as PanelCallbackHost;
		host.allPresets = ALL_PRESETS;
		return buildPanelCallbacks(host);
	}

	// =========================================================================
	// C6: Bulk operations on multi-selected nodes
	// =========================================================================

	private async bulkAddTag(nodeIds: string[], tag: string): Promise<void> {
		for (const id of nodeIds) {
			const pn = this.pixiNodes.get(id);
			if (!pn?.data.filePath) continue;
			const tf = this.app.vault.getAbstractFileByPath(pn.data.filePath);
			if (!(tf instanceof TFile)) continue;
			try {
				const content = await this.app.vault.read(tf);
				const newContent = addFrontmatterTag(content, tag);
				await this.app.vault.modify(tf, newContent);
			} catch (_e) {
				/* ignore individual failures */
			}
		}
		this.rawData = null;
		this.doRender();
		showToast(`Tag "${tag}" added to ${nodeIds.length} nodes`);
	}

	private async bulkSetField(nodeIds: string[], field: string, value: string): Promise<void> {
		for (const id of nodeIds) {
			const pn = this.pixiNodes.get(id);
			if (!pn?.data.filePath) continue;
			const tf = this.app.vault.getAbstractFileByPath(pn.data.filePath);
			if (!(tf instanceof TFile)) continue;
			try {
				const content = await this.app.vault.read(tf);
				const newContent = setFrontmatterField(content, field, value);
				await this.app.vault.modify(tf, newContent);
			} catch (_e) {
				/* ignore individual failures */
			}
		}
		this.rawData = null;
		this.doRender();
		showToast(`Field "${field}" set on ${nodeIds.length} nodes`);
	}

	/** Execute the reset-panel action: restore defaults and re-render. */
	private _buildResetPanelCallback(): void {
		const s = this.plugin.settings;
		// createDefaultPanel() returns fresh mutable instances — no shared-reference risk
		// Preserve personal/session state through reset
		const preserved = {
			bookmarkedNodes: this.panel.bookmarkedNodes,
			annotations: this.panel.annotations,
			searchHistory: this.panel.searchHistory,
			navHistory: this.panel.navHistory,
			navHistoryCursor: this.panel.navHistoryCursor,
			pinnedPositions: this.panel.pinnedPositions,
		};
		Object.assign(this.panel, {
			...createDefaultPanel(),
			...preserved,
			sortRules: [...(s.defaultSortRules ?? [{ key: "degree", order: "desc" }])].map((r) => ({ ...r })),
			clusterGroupRules: [...(s.defaultClusterGroupRules ?? [])].map((r) => ({ ...r })),
			nodeRules: [...(s.defaultNodeRules ?? [])].map((r) => ({ ...r })),
			...(s.defaultClusterArrangement ? { clusterArrangement: s.defaultClusterArrangement } : {}),
			...(s.defaultClusterNodeSpacing != null ? { clusterNodeSpacing: s.defaultClusterNodeSpacing } : {}),
			...(s.defaultClusterGroupScale != null ? { clusterGroupScale: s.defaultClusterGroupScale } : {}),
			...(s.defaultClusterGroupSpacing != null ? { clusterGroupSpacing: s.defaultClusterGroupSpacing } : {}),
			...(s.defaultEdgeBundleStrength != null ? { edgeBundleStrength: s.defaultEdgeBundleStrength } : {}),
		});
		this.applyGroupPresets();
		this.buildPanel();
		this.applyClusterForce();
		if (this.simulation) {
			this.simulation.alpha(0.8).restart();
			this.wakeRenderLoop();
		}
		this.requestSave();
	}

	// =========================================================================
	// テンプレート保存・読込・削除
	// =========================================================================

	/** テンプレートから除外する一時的なフィールド */
	private static readonly TEMPLATE_TRANSIENT_KEYS: Set<string> = new Set([
		"searchQuery",
		"localGraphCenter",
		"focusNodeId",
		"annotations",
		"searchHistory",
		"syncViewId",
		"bookmarkedNodes",
	]);

	/** 現在のパネル設定を名前付きテンプレートとして保存 */
	private _saveTemplate(name: string): boolean {
		const templates = this.plugin.settings.templates ?? [];
		if (templates.length >= 20) return false;

		// パネル状態からテンプレート用データを構築（一時的フィールドを除外）
		const panelData: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(this.panel)) {
			if (GraphViewContainer.TEMPLATE_TRANSIENT_KEYS.has(key)) continue;
			// Set → Array に変換（JSON シリアライズ対応）
			if (value instanceof Set) {
				panelData[key] = Array.from(value);
			} else {
				panelData[key] = value;
			}
		}

		const template: GraphTemplate = {
			name,
			createdAt: new Date().toISOString(),
			panel: panelData,
		};

		// 同名テンプレートがあれば上書き
		const idx = templates.findIndex((t) => t.name === name);
		if (idx >= 0) {
			templates[idx] = template;
		} else {
			templates.push(template);
		}
		this.plugin.settings.templates = templates;
		this.plugin.saveSettings();
		return true;
	}

	/** 保存済みテンプレートを現在のパネルに適用 */
	private _loadTemplate(name: string): void {
		const templates = this.plugin.settings.templates ?? [];
		const template = templates.find((t) => t.name === name);
		if (!template) return;

		// テンプレートのパネルデータを適用（Set フィールドの復元を含む）
		const src = this.panel as unknown as Record<string, unknown>;
		for (const [key, value] of Object.entries(template.panel)) {
			// 一時的フィールドはスキップ（念のため）
			if (GraphViewContainer.TEMPLATE_TRANSIENT_KEYS.has(key)) continue;
			// 現在値が Set で、テンプレート値が Array の場合は Set に変換
			if (src[key] instanceof Set && Array.isArray(value)) {
				src[key] = new Set(value as unknown[]);
			} else {
				src[key] = value;
			}
		}

		this.doRender();
		this.requestSave();
	}

	/** 保存済みテンプレートを削除 */
	private _deleteTemplate(name: string): void {
		const templates = this.plugin.settings.templates ?? [];
		this.plugin.settings.templates = templates.filter((t) => t.name !== name);
		this.plugin.saveSettings();
	}

	/** Execute the auto-optimize action: iterative overlap reduction loop. */
	private _buildAutoOptimizeCallback(): void {
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const maxPasses = rt.autoOptMaxPasses;
		const nodes: { id: string; x: number; y: number }[] = [];
		const radii = new Map<string, number>();
		for (const [id, pn] of this.pixiNodes) {
			nodes.push({ id, x: pn.data.x, y: pn.data.y });
			radii.set(id, pn.radius);
		}
		const runPass = (pass: number) => {
			if (pass >= maxPasses) {
				this.buildPanel();
				this.requestSave();
				return;
			}
			const result = analyzeOverlap(nodes, radii, rt.autoOptCloseThreshold);
			const constants = this.panel.coordinateLayout?.constants ?? {};
			const opt = computeAutoOptimize(
				result.overlapRatio,
				result.avgRadius,
				constants,
				this.panel.repelForce,
				this.panel.linkDistance,
				{
					overlapThreshold: rt.autoOptOverlapThreshold,
					padIncrement: rt.autoOptPadIncrement,
					padMax: rt.autoOptPadMax,
					repelScale: rt.autoOptRepelScale,
					linkScale: rt.autoOptLinkScale,
				},
			);
			if (!opt.needsMore) {
				this.buildPanel();
				this.requestSave();
				return;
			}
			if (this.panel.coordinateLayout) {
				this.panel.coordinateLayout.constants = { ...constants, ...opt.constants };
			}
			this.panel.repelForce = opt.repelForce;
			this.panel.linkDistance = opt.linkDistance;
			this.applyClusterForce();
			this.updateForces();
			if (this.simulation) {
				this.simulation.alpha(0.8).restart();
				this.wakeRenderLoop();
			}
			// Re-read positions after simulation settles
			this._scheduleTimer(() => {
				for (const [id, pn] of this.pixiNodes) {
					const n = nodes.find((nd) => nd.id === id);
					if (n) {
						n.x = pn.data.x;
						n.y = pn.data.y;
					}
				}
				runPass(pass + 1);
			}, 1500);
		};
		runPass(0);
	}

	// =========================================================================
	// Recolor nodes in-place (no graph/panel rebuild)
	// =========================================================================
	private recolorNodes() {
		const defaultNodeColor = cssColorToHex(DEFAULT_COLORS[0]);
		const colorMap = this.nodeColorMap ?? new Map<string, string>();
		const colorMode = this.panel.nodeColorMode ?? "category";
		let communityMap: Map<string, number> | null = null;
		if (colorMode === "community" && this.originalGraphData) {
			communityMap = this._getCommunityMap(this.originalGraphData);
		}
		const ctx = {
			groups: this.panel.groups,
			colorMode,
			colorField: this.panel.nodeColorField,
			customColorPalette: this.panel.customColorPalette,
			colorMap,
			communityMap,
			getNodeProperty: (id: string, field: string) => this.getNodeProperty(id, field),
		};
		for (const pn of this.pixiNodes.values()) {
			pn.color = computeNodeDisplayColor(pn.data, ctx, defaultNodeColor);
		}
		this.markDirty(true);
	}

	// =========================================================================
	// Status
	// =========================================================================
	private setStatus(t: string) {
		if (!this.statusEl) return;
		this.statusEl.textContent = t;
		// Restart CSS fade-out animation so the status is visible on each update
		this.statusEl.style.animation = "none";
		// Force reflow to reset the animation
		void this.statusEl.offsetWidth;
		this.statusEl.style.animation = "";
	}

	/** U2: Build rich status text with mode, counts, groups, layout, and filter info */
	private buildRichStatus(nodeCount: number, edgeCount: number, totalNodes?: number): string {
		const parts: string[] = [];
		if (this.panel.localGraphCenter) parts.push("Local");
		else if (this.panel.focusLayout) parts.push("Focus");
		// Show filtered ratio when applicable
		const total = totalNodes ?? this.rawData?.nodes.length ?? nodeCount;
		if (total !== nodeCount) {
			parts.push(`${nodeCount} / ${total} nodes`);
		} else {
			parts.push(`${nodeCount} nodes`);
		}
		if (edgeCount > 0) parts.push(`${edgeCount} edges`);
		// Show group count if groupBy is active
		const groupCount = this.panel.collapsedGroups?.size ?? 0;
		if (groupCount > 0) parts.push(`${groupCount} groups`);
		if (this.panel.searchQuery) {
			const mode = this.panel.searchMode === "highlight" ? "HL" : "F";
			parts.push(`[${mode}: ${this.panel.searchQuery.slice(0, 20)}]`);
		}
		// Show view mode if not default graph
		if (this.panel.viewMode && this.panel.viewMode !== "graph") {
			parts.push(this.panel.viewMode);
		}
		// Show groupBy field when active
		if (this.panel.groupBy && this.panel.groupBy !== "none") {
			parts.push(`by ${this.panel.groupBy}`);
		}
		return parts.join(" \u00B7 ");
	}

	/** D6: Compute per-node entropy scores (knowledge diversity).
	 *  entropy = uniqueTagCount(neighbors) / neighborCount */
	private updateEntropyScores(): void {
		const raw = this.rawData;
		if (!this.panel.showEntropyOverlay) {
			this._entropyScores = null;
			return;
		}
		if (raw && this._entropyCacheRef === raw && this._entropyScores) return;
		this._entropyCacheRef = raw;

		const scores = new Map<string, number>();
		const adj = this.adj;
		const pixiNodes = this.pixiNodes;

		for (const [nodeId, neighbors] of adj) {
			if (neighbors.size === 0) continue;
			const allTags = new Set<string>();
			for (const nbId of neighbors) {
				const nb = pixiNodes.get(nbId);
				if (nb?.data.tags) {
					for (const tag of nb.data.tags) allTags.add(tag);
				}
			}
			const entropy = allTags.size / neighbors.size;
			scores.set(nodeId, Math.min(1, entropy));
		}
		this._entropyScores = scores;
	}

	/** A3: Update thumbnail positions and visibility. */
	private updateThumbnails(): void {
		const layer = this.thumbnailLayer;
		if (!layer) return;
		if (!this.panel.showNodeThumbnails) {
			layer.style.display = "none";
			return;
		}
		layer.style.display = "";
		const world = this.worldContainer;
		if (!world) return;

		const scaleX = world.scale.x;
		const scaleY = world.scale.y;
		const offsetX = world.x;
		const offsetY = world.y;
		const wrap = this.canvasWrap;
		const vw = wrap?.clientWidth ?? 800;
		const vh = wrap?.clientHeight ?? 600;
		const MAX_THUMBNAILS = 50;

		// Remove all existing children first (simple approach)
		layer.empty();

		let count = 0;
		for (const [id, pn] of this.pixiNodes) {
			if (count >= MAX_THUMBNAILS) break;

			// Check if node has image/thumbnail in frontmatter
			const meta = pn.data.meta;
			const imgPath = meta?.image || meta?.thumbnail || meta?.cover;
			if (!imgPath || typeof imgPath !== "string") continue;

			// Screen coordinates
			const sx = pn.data.x * scaleX + offsetX;
			const sy = pn.data.y * scaleY + offsetY;

			// Culling: skip off-screen nodes
			const margin = 50;
			if (sx < -margin || sx > vw + margin || sy < -margin || sy > vh + margin) continue;

			// Get or load image
			let img = this.thumbnailCache.get(id);
			if (img === undefined) {
				// Try to resolve the path
				const resolved = this._resolveThumbnailUrl(imgPath);
				if (resolved) {
					img = document.createElement("img");
					img.src = resolved;
					img.className = "gi-node-thumbnail";
					img.addEventListener("error", () => {
						this.thumbnailCache.set(id, null);
					});
					this.thumbnailCache.set(id, img);
				} else {
					this.thumbnailCache.set(id, null);
					continue;
				}
			}
			if (!img) continue;

			// Clone for this frame
			const clone = img.cloneNode() as HTMLImageElement;
			clone.className = "gi-node-thumbnail";
			const size = pn.radius * scaleX * 2;
			clone.style.width = `${size}px`;
			clone.style.height = `${size}px`;
			clone.style.left = `${sx - size / 2}px`;
			clone.style.top = `${sy - size / 2}px`;
			layer.appendChild(clone);
			count++;
		}
	}

	/** Resolve a frontmatter image path to a usable URL. */
	private _resolveThumbnailUrl(path: string): string | null {
		// If it's already a URL, use directly
		if (path.startsWith("http://") || path.startsWith("https://")) return path;
		// Try vault resource path
		const tf = this.app.vault.getAbstractFileByPath(path);
		if (tf instanceof TFile) {
			return this.app.vault.getResourcePath(tf);
		}
		// Try without leading /
		const cleanPath = path.replace(/^\/+/, "");
		const tf2 = this.app.vault.getAbstractFileByPath(cleanPath);
		if (tf2 instanceof TFile) {
			return this.app.vault.getResourcePath(tf2);
		}
		return null;
	}

	/** F5: Update the relation matrix floating panel. */
	/** Update the relation matrix overlay — delegates to StatsRenderer. */
	private updateRelationMatrix(gd: GraphData): void {
		if (!this.relationMatrixEl) return;
		// Hide overlay in all non-graph viewModes
		const show = this.panel.showRelationMatrix && this.panel.viewMode === "graph";
		renderRelationMatrix(this.relationMatrixEl, show, gd.edges, this, (ids) => this.applyEphemeralHighlight(ids));
	}

	/** Update the floating graph statistics panel — delegates to StatsRenderer. */
	private updateGraphStats(gd: GraphData): void {
		if (!this.graphStatsEl) return;
		// Hide stats in non-graph viewModes
		if (this.panel.viewMode !== "graph") {
			this.graphStatsEl.style.display = "none";
			return;
		}
		renderGraphStats(this.graphStatsEl, gd, this.panel, this);
	}

	// --- StatsHost bridge methods (Phase 0: interface only, Phase 1: extract to StatsRenderer) ---
	getNodeLabel(id: string): string {
		return this.pixiNodes.get(id)?.data?.label ?? id.replace(/\.md$/, "").split("/").pop() ?? id;
	}
	getCurrentFps(): number {
		return this.renderPipeline?.currentFps ?? 0;
	}
	getLastRenderTime(): number {
		return this.renderPipeline?.lastFrameMs ?? 0;
	}
	announceA11y(msg: string): void {
		this._announceA11y(msg);
	}
	invalidateAndRebuild(): void {
		this.rawData = null;
		this.doRender();
		this.buildPanel();
	}

	getNodeOverlapRatio(): number {
		if (this.pixiNodes.size < 2) return 0;
		const nodes: { id: string; x: number; y: number }[] = [];
		const radii = new Map<string, number>();
		for (const [id, pn] of this.pixiNodes) {
			nodes.push({ id, x: pn.data.x, y: pn.data.y });
			radii.set(id, pn.radius);
		}
		return analyzeOverlap(nodes, radii, 3).overlapRatio;
	}

	// --- LegendHost bridge ---
	private _legendHost: LegendHost = {
		getNodeColorMap: () => this.nodeColorMap,
		getRelationColors: () => this.relationColors,
		getCategoryCounts: () => {
			const counts = new Map<string, number>();
			for (const pn of this.pixiNodes.values()) {
				const cat = pn.data.category ?? (pn.data.tags?.[0] ? `tag:${pn.data.tags[0]}` : "");
				if (cat) incCounter(counts, cat);
			}
			return counts;
		},
		getMaxDegree: () => Math.max(1, ...[...this.degrees.values()]),
		getCommunityMap: () => (this.originalGraphData ? this._getCommunityMap(this.originalGraphData) : new Map()),
		invalidateAndRebuild: () => this.invalidateAndRebuild(),
		markDirtyAndRebuildLegend: () => {
			this.markDirty(true);
			this.updateLegend();
			this.buildPanel();
		},
		requestSave: () => this.requestSave(),
	};

	/** S1: Update hierarchy breadcrumb bar above graph */
	/** S1: Update hierarchy breadcrumb — delegates to StatsRenderer. */
	private updateHierarchyBreadcrumb(): void {
		if (!this.hierarchyBreadcrumbEl) return;
		renderBreadcrumb(
			this.hierarchyBreadcrumbEl,
			this.panel.showHierarchyBreadcrumb,
			this.panel.localGraphCenter,
			this.graphEdges,
			this.panel,
			this,
		);
	}

	/** M2: Apply ego layout to visible nodes centered on highlighted/focused node */
	private applyEgoToVisible(): void {
		const centerId = this.highlightedNodeId || this.panel.focusNodeId || this.panel.localGraphCenter;
		if (!centerId) {
			// No node selected — show toast
			return;
		}

		const centerPn = this.pixiNodes.get(centerId);
		if (!centerPn) return;

		// Collect visible nodes in viewport
		const wc = this.worldContainer;
		if (!wc) return;
		const cx = centerPn.data.x;
		const cy = centerPn.data.y;

		// Classify neighbors by edge type
		const neighbors = new Map<string, string[]>(); // bucket → nodeIds
		neighbors.set("inheritParent", []);
		neighbors.set("inheritChild", []);
		neighbors.set("aggregation", []);
		neighbors.set("similar", []);
		neighbors.set("other", []);

		for (const e of this.graphEdges) {
			const isNeighbor = e.source === centerId || e.target === centerId;
			if (!isNeighbor) continue;
			const nbId = e.source === centerId ? e.target : e.source;
			if (!this.pixiNodes.has(nbId)) continue;
			if (e.type === "inheritance") {
				if (e.target === centerId) neighbors.get("inheritParent")!.push(nbId);
				else neighbors.get("inheritChild")!.push(nbId);
			} else if (e.type === "aggregation") {
				neighbors.get("aggregation")!.push(nbId);
			} else if (e.type === "similar" || e.type === "sibling") {
				neighbors.get("similar")!.push(nbId);
			} else {
				neighbors.get("other")!.push(nbId);
			}
		}

		const placed = new Set<string>([centerId]);
		const sectorDefs: { key: string; centerAngle: number; spread: number }[] = [
			{ key: "inheritParent", centerAngle: (3 * Math.PI) / 2, spread: Math.PI / 3 },
			{ key: "inheritChild", centerAngle: Math.PI / 2, spread: Math.PI / 3 },
			{ key: "aggregation", centerAngle: Math.PI, spread: Math.PI / 3 },
			{ key: "similar", centerAngle: 0, spread: Math.PI / 3 },
			{ key: "other", centerAngle: Math.PI / 4, spread: Math.PI / 2 },
		];

		const ringR = 150;

		for (const sector of sectorDefs) {
			const ids = (neighbors.get(sector.key) ?? []).filter((id) => !placed.has(id));
			if (ids.length === 0) continue;
			const startAngle = sector.centerAngle - sector.spread / 2;
			const step = ids.length > 1 ? sector.spread / (ids.length - 1) : 0;
			for (let i = 0; i < ids.length; i++) {
				const angle = startAngle + step * i;
				const pn = this.pixiNodes.get(ids[i]);
				if (pn) {
					pn.data.fx = cx + ringR * Math.cos(angle);
					pn.data.fy = cy + ringR * Math.sin(angle);
					pn.data.x = pn.data.fx;
					pn.data.y = pn.data.fy;
					placed.add(ids[i]);
				}
			}
		}

		this.renderPipeline?.markDirty();
		this.renderPipeline?.wakeRenderLoop();
	}

	/** インタラクティブ凡例オーバーレイを更新（ノードカラー＋エッジ属性カラー、クリックで表示切替） */
	/** Update the interactive legend overlay — delegates to LegendRenderer. */
	private updateLegend() {
		if (!this.legendEl) return;
		// Hide legend in non-graph/timeline viewModes
		if (this.panel.viewMode !== "graph" && this.panel.viewMode !== "timeline") {
			this.legendEl.style.display = "none";
			return;
		}
		renderLegend(this.legendEl, this.panel as unknown as LegendPanel, this._legendHost);
	}

	// =========================================================================
	// R2: Map analysisOverlay dropdown to individual flags
	// =========================================================================
	private _showDensityHeatmap = false;
	private _applyAnalysisOverlay(): void {
		const mode = this.panel.analysisOverlay ?? "off";
		this.panel.showBridgeNodes = mode === "bridges" || mode === "all";
		this.panel.showEntropyOverlay = mode === "entropy" || mode === "all";
		this.panel.highlightMissingNeighbors = mode === "missing" || mode === "all";
		this.panel.showGapEdges = mode === "gaps" || mode === "all";
		this._showDensityHeatmap = mode === "density" || mode === "all";
	}

	// =========================================================================
	// DF: Density heatmap background overlay
	// =========================================================================
	private _renderDensityHeatmap(ctx: CanvasRenderingContext2D): void {
		const world = this.pixiApp?.stage.children[0] as CanvasContainer | undefined;
		if (!world || !this.pixiNodes) return;
		const wx = world.x;
		const wy = world.y;
		const ws = world.scale?.x ?? 1;
		const cw = this.canvasWrap?.clientWidth ?? DEFAULT_CANVAS_WIDTH;
		const ch = this.canvasWrap?.clientHeight ?? DEFAULT_CANVAS_HEIGHT;

		const CELL = 40;
		const cols = Math.ceil(cw / CELL);
		const rows = Math.ceil(ch / CELL);
		const grid = this._accumulateDensityGrid(cols, rows, CELL, wx, wy, ws);

		let maxD = 0;
		for (let i = 0; i < grid.length; i++) {
			if (grid[i] > maxD) maxD = grid[i];
		}
		if (maxD === 0) return;

		// Draw heatmap cells with alpha-blended colors
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const v = grid[r * cols + c] / maxD;
				if (v < HEATMAP_MIN_VALUE) continue;
				const h = (1 - v) * 240;
				const a = v * 0.25;
				ctx.fillStyle = `hsla(${h}, 80%, 50%, ${a})`;
				ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
			}
		}
	}

	/** Accumulate Gaussian density contributions from visible nodes into a grid. */
	private _accumulateDensityGrid(cols: number, rows: number, cell: number, wx: number, wy: number, ws: number): Float32Array {
		const grid = new Float32Array(cols * rows);
		const RADIUS = 3;
		for (const [, pn] of this.pixiNodes) {
			 
			const gfx = (pn as unknown as { graphics?: CanvasContainer }).graphics ?? pn.gfx;
			if (!gfx || !gfx.visible) continue;
			const sx = gfx.x * ws + wx;
			const sy = gfx.y * ws + wy;
			const ci = Math.floor(sx / cell);
			const ri = Math.floor(sy / cell);
			for (let dr = -RADIUS; dr <= RADIUS; dr++) {
				for (let dc = -RADIUS; dc <= RADIUS; dc++) {
					const r = ri + dr;
					const c = ci + dc;
					if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
					grid[r * cols + c] += Math.exp(-(dr * dr + dc * dc) / (RADIUS * 0.8));
				}
			}
		}
		return grid;
	}

	// =========================================================================
	// Graph data
	// =========================================================================
	private getGraphData(): GraphData {
		if (!this.rawData) {
			this.rawData = buildGraphFromVault(this.app, this.plugin.settings);
		}
		let { nodes, edges } = this.rawData;

		edges = edges.map((e) => ({
			...e,
			source: edgeSourceId(e),
			target: edgeTargetId(e),
		}));

		({ nodes, edges } = this._filterLocalGraph(nodes, edges));
		({ nodes, edges } = this._filterNodeVisibility(nodes, edges));
		({ nodes, edges } = this._filterByQuery(nodes, edges));

		// Nodes tab: exclude manually hidden nodes
		({ nodes, edges } = filterExcludedNodes(nodes, edges, this.panel.excludeNodes ?? []));

		// Subgraph filter: show only selected subset of nodes
		if (this.panel.subgraphNodeIds.length > 0) {
			const expanded = expandSuperNodeIds(this.panel.subgraphNodeIds, nodes);
			({ nodes, edges } = filterBySubgraph(nodes, edges, [...expanded]));
		}

		// FZ: Degree filter
		nodes = filterByDegree(nodes, edges, this.panel.minDegreeFilter ?? 0, this.panel.maxDegreeFilter ?? 0);

		let nodeSet = new Set(nodes.map((n) => n.id));
		edges = filterEdgesByNodeSet(edges, nodeSet);

		// Mobile lightweight mode: cap node count to reduce rendering load
		if (Platform.isMobile && nodes.length > MOBILE_NODE_CAP) {
			const deg = this.degrees;
			nodes.sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0));
			nodes = nodes.slice(0, MOBILE_NODE_CAP);
			nodeSet = new Set(nodes.map((n) => n.id));
			edges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
		}

		// Skip group collapse for timeline/sunburst viewModes (they need individual nodes)
		if (this.panel.viewMode === "timeline" || this.panel.viewMode === "sunburst") {
			return { nodes, edges };
		}
		return this._applyGroupCollapse({ nodes, edges });
	}

	/** BFS N-hop filter for local graph mode. Delegates core BFS to pure function. */
	private _filterLocalGraph(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
		if (!this.panel.localGraphCenter) return { nodes, edges };

		// Core BFS hop filter (pure function)
		let result = filterByLocalGraph(nodes, edges, this.panel.localGraphCenter, this.panel.localGraphHops);

		// D1: Also include neighbors of manually expanded nodes
		if (this.panel.expandedNodes?.length) {
			const adj = new Map<string, Set<string>>();
			for (const e of edges) {
				addToMapSet(adj, e.source, e.target);
				addToMapSet(adj, e.target, e.source);
			}
			const reachable = new Set(result.nodes.map((n) => n.id));
			for (const expandedId of this.panel.expandedNodes) {
				if (!reachable.has(expandedId)) continue;
				const neighbors = adj.get(expandedId);
				if (neighbors) {
					for (const nbId of neighbors) reachable.add(nbId);
				}
			}
			result = {
				nodes: nodes.filter((n) => reachable.has(n.id)),
				edges: edges.filter((e) => reachable.has(e.source) && reachable.has(e.target)),
			};
		}

		return result;
	}

	/** Filter nodes by orphan/existing/attachment/tag visibility settings. */
	private _filterNodeVisibility(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
		// Pure filters delegated to graph-filter.ts
		({ nodes, edges } = applyVisibilityFilters(nodes, edges, {
			showOrphans: this.panel.showOrphans,
			showAttachments: this.panel.showAttachments ?? true,
			includeTagsInData: this.panel.includeTagsInData ?? true,
			showTagNodes: this.panel.showTagNodes ?? true,
			tagDisplay: this.panel.tagDisplay ?? "node",
			showSimilar: this.panel.showSimilar ?? true,
		}));

		// existingOnly requires vault access — kept in GVC
		if (this.panel.existingOnly) {
			const existing = new Set(this.app.vault.getMarkdownFiles().map((f) => f.path));
			nodes = nodes.filter((n) => n.isTag || existing.has(n.id));
		}

		return { nodes, edges };
	}

	/** Apply dataview and search query filters. */
	private _filterByQuery(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
		// Reset highlight set at start of each data build
		this._searchHighlightSet = null;

		if (this.panel.dataviewQuery.trim()) {
			const matchingPaths = queryDataviewPages(this.app, this.panel.dataviewQuery.trim());
			if (matchingPaths.size > 0) {
				nodes = filterNodesByDataview(nodes, matchingPaths, this.panel.showTagNodes);
			}
		}

		const raw = this.panel.searchQuery;
		const remaining = raw
			.replace(/hop:[^:,]+:\d+/gi, "")
			.replace(/,/g, " ")
			.trim();
		if (remaining) {
			const searchExpr = parseQueryExpr(remaining);
			if (searchExpr) {
				const matchedIds = new Set(nodes.filter((n) => evaluateExpr(searchExpr, n)).map((n) => n.id));
				if (this.panel.searchMode === "highlight") {
					// N2: Highlight mode — keep all nodes, store matched IDs for visual dimming
					this._searchHighlightSet = matchedIds;
				} else {
					// Default filter mode — remove non-matching nodes
					nodes = nodes.filter((n) => matchedIds.has(n.id));
				}
			}
		}

		return { nodes, edges };
	}

	/** Apply group collapse (fold groups into super nodes). */
	private _applyGroupCollapse(data: GraphData): GraphData {
		let result = data;
		if (this.panel.groupBy && this.panel.groupBy !== "none") {
			this.originalGraphData = { nodes: [...result.nodes], edges: [...result.edges] };
			const groupOpts: GroupOptions = {
				minSize: this.panel.groupMinSize,
				filter: this.panel.groupFilter,
			};
			const groups = this.resolveGroupByField(result.nodes, groupOpts);
			// Auto-collapse only when ≤20 groups to prevent freeze on large vaults
			if (this.panel.collapsedGroups.size === 0 && groups.length > 0 && groups.length <= 20) {
				for (const g of groups) this.panel.collapsedGroups.add(g.key);
			}
			for (const g of groups) {
				if (this.panel.collapsedGroups.has(g.key)) {
					result = collapseGroup(result, g);
				}
			}
		} else {
			this.originalGraphData = null;
		}
		return result;
	}

	// =========================================================================
	// Stop simulation
	// =========================================================================
	private stopSim() {
		if (this.simulation) {
			this.simulation.stop();
			this.simulation = null;
		}
	}

	// =========================================================================
	// Main render
	// =========================================================================
	async doRender() {
		if (!this.canvasWrap) return;
		this._invalidateRenderCaches();

		// B3: Debounce — first call passes through; subsequent calls within 50ms are deferred
		if (this._shouldDebounceRender()) return;

		validatePanelState(this.panel);
		this._resolveInheritArrangement();
		this.currentLayout = viewModeToLayout(this.panel.viewMode);

		this._prepareViewModeUI();

		this.ac?.abort();
		this.ac = new AbortController();
		const signal = this.ac.signal;
		this.layoutTransition.cancel();
		this._applyAnalysisOverlay();
		this._savePositionsForTransition();
		this.stopSim();
		this.stopOrbitAnimation();
		this.cachedBgColor = null;
		this.cachedLabelColor = null;
		if (this._zoomBaseNodeSize === null) {
			this._zoomBaseNodeSize = this.panel.nodeSize;
		}

		const rect = this.canvasWrap.getBoundingClientRect();
		const W = rect.width || DEFAULT_CANVAS_WIDTH;
		const H = rect.height || DEFAULT_CANVAS_HEIGHT;

		this.setStatus("Building...");
		await yieldFrame();
		if (signal.aborted) return;

		let gd: GraphData;
		try {
			gd = this.getGraphData();
		} catch (_e) {
			this.setStatus(t("error.graphBuildFailed"));
			return;
		}
		this.setStatus(`${gd.nodes.length} nodes, ${gd.edges.length} edges`);
		await yieldFrame();
		if (signal.aborted) return;

		if (viewModeUsesDom(this.panel.viewMode)) {
			this._renderMatrixViewMode(gd, W, H);
			return;
		}

		const pixiResult = this.initPixi(W, H);
		if (!pixiResult) return;
		if (signal.aborted) { this.destroyPixi(); return; }

		this._buildGraphMetadata(gd);
		this._buildTagMembership(gd);
		this._buildMissingNeighborSet(gd);

		const nodeR = this._buildNodeRadiusFn();
		const nodeColor = this._buildNodeColorFn(gd);
		const cx = W / 2;
		const cy = H / 2;

		if (this.currentLayout === LAYOUT_FORCE) {
			this._setupForceLayout(gd, nodeR, nodeColor, cx, cy, W, H);
			return;
		}

		this.setStatus("Computing layout...");
		await yieldFrame();
		if (signal.aborted) return;

		const ld = this._computeStaticLayout(gd, cx, cy, W, H);
		if (!ld || signal.aborted) return;

		await this._finalizeStaticLayout(ld, nodeR, nodeColor, W, H, signal);
	}

	/** Invalidate per-frame caches at the start of doRender. */
	private _invalidateRenderCaches(): void {
		this._cachedBookmarkSet = null;
		this._cachedPinSet = null;
		this._cachedHulls.clear();
		this._viewportDirty = true;
		if (this.subgraphBackBtnEl) {
			this.subgraphBackBtnEl.style.display = this.panel.subgraphNodeIds?.length > 0 ? "" : "none";
		}
		this._labelOptimized = false;
		if (!isFinite(this.panel.nodeSize) || this.panel.nodeSize <= 0) this.panel.nodeSize = 15;
	}

	/** Check if doRender should be debounced. Returns true if debounced (caller should return). */
	private _shouldDebounceRender(): boolean {
		const now = performance.now();
		if (this._lastDoRenderTime && now - this._lastDoRenderTime < 50) {
			clearTimeout(this._doRenderDebounceTimer);
			this._doRenderDebounceTimer = window.setTimeout(() => this.doRender(), 50) as unknown as number;
			return true;
		}
		if (this._doRenderDebounceTimer) {
			clearTimeout(this._doRenderDebounceTimer);
			this._doRenderDebounceTimer = 0;
		}
		this._lastDoRenderTime = now;
		return false;
	}

	/** Resolve "inherit" clusterArrangement to a concrete value. */
	private _resolveInheritArrangement(): void {
		if (this.panel.clusterArrangement !== "inherit") return;
		this.panel.clusterArrangement = resolveInheritArrangement(this.panel.clusterGroupArrangement) as ClusterArrangement;
		this._inheritResolved = true;
	}

	/** Prepare viewMode-specific UI state at the start of doRender. */
	private _prepareViewModeUI(): void {
		const matrixFs = this.containerEl.querySelector<HTMLElement>(".gi-matrix-fullscreen");
		if (matrixFs) matrixFs.style.display = "none";
		const canvasEl = this.canvasWrap?.querySelector("canvas");
		if (canvasEl) canvasEl.style.display = "";

		this.renderPipeline?.setSkipNodeRendering(viewModeSkipsNodeRendering(this.panel.viewMode));

		if (this.panel.viewMode !== "graph") {
			this._cleanupNonGraphArtifacts();
		}

		// Sync toolbar active button with restored viewMode
		const modeGroup = this.containerEl.querySelector(".gi-view-mode-group");
		if (modeGroup) {
			modeGroup.querySelectorAll(".gi-view-mode-btn").forEach((b) => {
				const isActive = (b as HTMLElement).dataset.mode === this.panel.viewMode;
				b.toggleClass("is-active", isActive);
				b.setAttribute("aria-pressed", String(isActive));
			});
		}
		this._syncGraphOnlyButtons(this.panel.viewMode);
	}

	/** Clean up graph-mode artifacts when switching to non-graph viewModes. */
	private _cleanupNonGraphArtifacts(): void {
		for (const pn of this.pixiNodes.values()) {
			pn.gfx.visible = false;
			if (pn.label) pn.label.visible = false;
		}
		for (const lbl of this.groupByLabels.values()) lbl.visible = false;
		if (this.clusterBoundaryGraphics) this.clusterBoundaryGraphics.clear();
		if (this.enclosureGraphics) this.enclosureGraphics.clear();
		if (this.edgeGraphics) this.edgeGraphics.clear();
		if (this.barGraphics) this.barGraphics.clear();
		if (this.arrowGraphics) this.arrowGraphics.clear();
		if (this.barLabelContainer) {
			for (const c of [...this.barLabelContainer.children]) c.visible = false;
		}
		this.markDirty(true);
	}

	/** Save current node positions for animated transition, including super node member spreading. */
	private _savePositionsForTransition(): void {
		this.savedPositions.clear();
		// Also track super node -> member mapping so expanded members get
		// positioned near their former super node instead of randomly
		const superNodeMembers = new Map<string, string[]>();
		for (const [id, pn] of this.pixiNodes) {
			this.savedPositions.set(id, { x: pn.data.x, y: pn.data.y });
			if (pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0) {
				superNodeMembers.set(id, pn.data.collapsedMembers);
			}
		}
		// Pre-populate savedPositions for members of super nodes: position them
		// in a circle around the super node's location so they don't scatter randomly
		for (const [superId, memberIds] of superNodeMembers) {
			const superPos = this.savedPositions.get(superId);
			if (!superPos) continue;
			const count = memberIds.length;
			const spreadR = Math.sqrt(count) * 20;
			for (let i = 0; i < count; i++) {
				if (this.savedPositions.has(memberIds[i])) continue;
				const angle = (2 * Math.PI * i) / count;
				this.savedPositions.set(memberIds[i], {
					x: superPos.x + Math.cos(angle) * spreadR,
					y: superPos.y + Math.sin(angle) * spreadR,
				});
			}
		}
	}

	/** Compute degrees, colors, relation colors, and adjacency from graph data. */
	private _buildGraphMetadata(gd: GraphData): void {
		this.degrees = computeNodeDegrees(gd.nodes, gd.edges);
		const colorMap = assignNodeColors(gd.nodes, this.plugin.settings.colorField);
		this.nodeColorMap = colorMap;
		this.relationColors = buildRelationColorMap(gd.edges);
		this.adj = buildAdj(gd);
		this._rebuildHoverAdj(gd);
	}

	/** Rebuild the edge-type-filtered adjacency list for hover BFS.
	 *  Called when hoverEdgeTypes or graph data changes. */
	private _rebuildHoverAdj(gd?: GraphData): void {
		const data = gd ?? this.getGraphData?.();
		if (!data) return;
		this.hoverAdj = buildAdjFiltered(
			data,
			this.panel.hoverEdgeTypes ?? {
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
		);
	}

	/** Build tag membership map for enclosure mode and clear stale enclosure labels. */
	private _buildTagMembership(gd: GraphData): void {
		this.tagMembership.clear();
		this.tagRelPairsCache.clear();
		this.overlapCache.counts.clear();
		this.overlapCache.frame = 0;
		if (this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
			const { tagMembership, tagRelPairs } = buildTagMembership(gd.nodes, gd.edges);
			for (const [tag, ids] of tagMembership) this.tagMembership.set(tag, ids);
			for (const pair of tagRelPairs) this.tagRelPairsCache.add(pair);
		}
		// Clear stale labels
		for (const lbl of this.enclosureLabels.values()) {
			lbl.parent?.removeChild(lbl);
			lbl.destroy();
		}
		this.enclosureLabels.clear();
	}

	/**
	 * Build the set of node IDs that share at least one tag with another node
	 * but have no direct edge between them (missing neighbor detection).
	 * Only computed when highlightMissingNeighbors is enabled.
	 */
	private _buildMissingNeighborSet(gd: GraphData): void {
		this.missingNeighborNodeIds = null;
		if (!this.panel.highlightMissingNeighbors) return;
		this.missingNeighborNodeIds = buildMissingNeighborSet(gd.nodes, gd.edges);
	}

	/** Build the node radius function based on current panel settings. */
	private _buildNodeRadiusFn(): (n: GraphNode) => number {
		const baseSize = this.panel.nodeSize;
		const degs = this.degrees;
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const minR = rt.minNodeRadius;
		const sizeByDeg = rt.nodeSizeByDegree;
		let maxDeg = 0;
		if (sizeByDeg) {
			for (const d of degs.values()) {
				if (d > maxDeg) maxDeg = d;
			}
		}
		return (n: GraphNode) => (n.isPhantom ? 0 : nodeRadius(baseSize, degs.get(n.id) || 0, minR, maxDeg, sizeByDeg));
	}

	/** Build the node color function considering groups, heatmap, and category coloring. */
	private _buildNodeColorFn(gd: GraphData): (n: GraphNode) => number {
		const colorMap = this.nodeColorMap;
		const defaultNodeColor = cssColorToHex(DEFAULT_COLORS[0]);

		const colorMode = this.panel.nodeColorMode ?? "category";

		// Heatmap: precompute max degree for normalization
		let maxDegree = 1;
		if (colorMode === "heatmap") {
			for (const n of gd.nodes) {
				const d = this.degrees.get(n.id) || 0;
				if (d > maxDegree) maxDegree = d;
			}
		}
		// Heatmap color ramp delegates to exported pure function

		// Community detection: Louvain algorithm (cached)
		let communityMap: Map<string, number> | null = null;
		if (colorMode === "community") {
			communityMap = this._getCommunityMap(gd);
		}
		// COMMUNITY_PALETTE is now a top-level exported constant

		// ノードルールのカラーオーバーライドをプリコンパイル
		const nodeRulesWithColor = (this.panel.nodeRules ?? []).filter((r) => r.color);

		const baseFn = (n: GraphNode): number => {
			// NodeRule カラーオーバーライドが最優先
			for (const rule of nodeRulesWithColor) {
				if (matchesFilter(n, rule.query)) return cssColorToHex(rule.color!);
			}
			// Manual group overrides take priority
			for (const grp of this.panel.groups) {
				if (grp.expression && evaluateExpr(grp.expression, n)) return cssColorToHex(grp.color);
			}
			// Heatmap mode: color by degree
			if (colorMode === "heatmap") {
				return heatmapColor(this.degrees.get(n.id) || 0, maxDegree);
			}
			// Community mode: color by Louvain community
			if (colorMode === "community" && communityMap) {
				const cid = communityMap.get(n.id) ?? 0;
				return COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length];
			}
			// EO: Field-based coloring (initial render path)
			if (colorMode === "field" && this.panel.nodeColorField) {
				const fieldVal = this.getNodeProperty(n.id, this.panel.nodeColorField);
				if (fieldVal !== undefined && fieldVal !== "") {
					const key = String(fieldVal);
					if (!colorMap.has(key)) {
						const customPalette = this.panel.customColorPalette
							? this.panel.customColorPalette
									.split(",")
									.map((s) => s.trim())
									.filter(Boolean)
							: [];
						const palette =
							customPalette.length > 0 ? customPalette : (DEFAULT_COLORS as unknown as string[]);
						colorMap.set(key, palette[colorMap.size % palette.length]);
					}
					return cssColorToHex(colorMap.get(key)!);
				}
				return defaultNodeColor;
			}
			if (colorMode !== "category") return defaultNodeColor;
			// Category-based coloring
			if (n.category) {
				const css = colorMap.get(n.category) || DEFAULT_COLORS[0];
				return cssColorToHex(css);
			}
			// Tag-based coloring: tag nodes use their own tag, file nodes use first tag
			if (n.tags && n.tags.length > 0) {
				const tagKey = `tag:${n.tags[0]}`;
				const css = colorMap.get(tagKey) || DEFAULT_COLORS[0];
				return cssColorToHex(css);
			}
			return defaultNodeColor;
		};

		// Monochrome fallback: when category/field coloring produces only 1 distinct
		// color for 5+ nodes, automatically diversify using hash-based coloring.
		if (colorMode === "category" || colorMode === "field") {
			const palette = DEFAULT_COLORS.map((c) => cssColorToHex(c));
			return applyMonochromeFallback(gd.nodes, baseFn, palette);
		}
		return baseFn;
	}

	/** Set up force-directed layout: create simulation, apply forces, and wire tick/end events. */
	private _setupForceLayout(
		gd: GraphData,
		nodeR: (n: GraphNode) => number,
		nodeColor: (n: GraphNode) => number,
		cx: number,
		cy: number,
		W: number,
		H: number,
	): void {
		const savedPositionsValid = areSavedPositionsValid(this.savedPositions, W, H);
		const maxReasonableCoord = Math.max(W, H) * 5;

		for (const n of gd.nodes) {
			// Use saved positions from previous layout as starting positions,
			// but only if they are within a reasonable range (prevents sunburst/concentric
			// polar coordinates from causing force layout divergence)
			const saved = savedPositionsValid ? this.savedPositions.get(n.id) : undefined;
			if (saved) {
				n.x = saved.x;
				n.y = saved.y;
			} else if (
				!isFinite(n.x) ||
				!isFinite(n.y) ||
				(n.x === 0 && n.y === 0) ||
				Math.abs(n.x) > maxReasonableCoord ||
				Math.abs(n.y) > maxReasonableCoord
			) {
				n.x = cx + (Math.random() - 0.5) * W * 0.8;
				n.y = cy + (Math.random() - 0.5) * H * 0.8;
			}
			// Restore pinned positions from persistent state
			const pinned = this.panel.pinnedPositions[n.id];
			if (pinned) {
				n.x = pinned.x;
				n.y = pinned.y;
				n.fx = pinned.x;
				n.fy = pinned.y;
			}
		}
		this.savedPositions.clear();

		this.graphEdges = gd.edges;
		invalidateBundleCache(this.edgeCache);

		// Generate phantom junction nodes for road network routing.
		// Phantom nodes participate in the same simulation as real nodes
		// but are excluded from rendering (isPhantom = true).
		const phantomNodes = generatePhantomNodes(gd.nodes, cx, cy, this.panel.clusterArrangement);
		if (phantomNodes.length > 0) {
			gd.nodes.push(...phantomNodes);
		}

		this.renderPipeline?.setSkipNodeRendering(viewModeSkipsNodeRendering(this.panel.viewMode));
		this.createPixiNodes(gd.nodes, nodeR, nodeColor);
		// Restore held state for pinned nodes
		for (const nodeId of Object.keys(this.panel.pinnedPositions)) {
			const pn = this.pixiNodes.get(nodeId);
			if (pn) pn.held = true;
		}
		this.computeSortRanks();

		let tickCount = 0;
		this.simulation = this.layoutController.createForceSimulation(gd.nodes, gd.edges, cx, cy);

		// Apply directional gravity rules from settings + panel + node rules
		this.applyNodeRulesForce();

		// Apply enclosure repulsion force (push tag groups apart)
		this.applyEnclosureRepulsionForce();

		// Apply cluster arrangement force if configured
		this.applyClusterForce();

		// Show world immediately so users see progressive layout forming.
		if (this.worldContainer) this.worldContainer.visible = true;

		// Progressive rendering: sync node positions every N ticks for live preview.
		// Only move sprites — heavy operations (edges, enclosures, autoFit) are
		// deferred to the "end" event to avoid cache corruption and layout interference.
		const PROGRESSIVE_INTERVAL = 10;

		this.simulation.on("tick", () => {
			tickCount++;
			if (tickCount === 1 || tickCount % PROGRESSIVE_INTERVAL === 0) {
				for (const pn of this.pixiNodes.values()) {
					pn.gfx.x = pn.data.x;
					pn.gfx.y = pn.data.y;
				}
				this.redrawNodeBatch();
				// First frame: fit viewport so nodes are visible immediately
				if (tickCount === 1 && this.canvasWrap) {
					const cw = this.canvasWrap.clientWidth || DEFAULT_CANVAS_WIDTH;
					const ch = this.canvasWrap.clientHeight || DEFAULT_CANVAS_HEIGHT;
					this.autoFitView(cw, ch);
				}
			}
		});

		this.setStatus(`${gd.nodes.length} nodes — simulating...`);
		this.simulation.on("end", () => {
			// 6-step pipeline complete — reveal world and render final positions
			if (this.worldContainer) this.worldContainer.visible = true;
			this.setStatus(this.buildRichStatus(gd.nodes.length, gd.edges.length));
			// A11y: announce graph summary for screen readers on load
			// JR: §0.3 First-launch guide for screen readers (one-time, stored in localStorage)
			const SR_GUIDE_KEY = "gi-sr-guide-shown";
			const isFirstLaunch = !localStorage.getItem(SR_GUIDE_KEY);
			if (isFirstLaunch) localStorage.setItem(SR_GUIDE_KEY, "1");
			this._announceA11y(buildSimEndA11yMessage(gd.nodes.length, gd.edges.length, isFirstLaunch, {
				graphLoaded: t("a11y.graphLoaded") ?? "Graph loaded",
				nodes: t("a11y.nodes") ?? "nodes",
				edges: t("a11y.edges") ?? "edges",
				srGuide: t("a11y.srGuide") ?? "Tab to cycle nodes, Enter to open, Shift+Enter to select, ? for keyboard shortcuts.",
			}));
			this.updateEntropyScores();
			this.updateGraphStats(gd);
			this.updateRelationMatrix(gd);
			this.updateThumbnails();
			this.updateHierarchyBreadcrumb();
			const wrap = this.canvasWrap;
			// Ensure minimum viewport utilization regardless of autoFit
			{
				const renderer = this.pixiApp?.renderer;
				const [evW, evH] = resolveViewportSize(
					wrap?.clientWidth ?? 0, wrap?.clientHeight ?? 0,
					renderer?.width ?? 0, renderer?.height ?? 0,
				);
				if (evW > 0 && evH > 0) this.ensureViewportUtilization(evW, evH);
			}
			// Rebuild road network now that final node positions are available
			this._rebuildRoadNetwork(true);
			// Card overlap is handled by forceCollide during the simulation itself.
			// No post-process needed — collide radius in LayoutController accounts
			// for card dimensions in world coordinates.
			// Force full redraw now that all positions are final
			this.updatePositions(true);
			// G1: AutoFit when simulation ends — single deferred fit so DOM
			// layout is guaranteed settled (consolidates prior two-call pattern)
			if (wrap && !this._suppressAutoFit) {
				requestAnimationFrame(() => {
					if (this.canvasWrap && !this._suppressAutoFit) {
						const rw = this.canvasWrap.clientWidth || DEFAULT_CANVAS_WIDTH;
						const rh = this.canvasWrap.clientHeight || DEFAULT_CANVAS_HEIGHT;
						if (rw > 0 && rh > 0) {
							this.autoFitView(rw, rh);
							this.markDirty();
						}
					}
				});
			}
			this.markDirty(true);
			// Re-cull labels after simulation settles to fix overlap
			// caused by node positions changing during simulation
			this.updateLabelsForZoom();
			// Recalc radii after simulation (ensures nodeSizeByDegree takes effect)
			this.recalcNodeRadii();
			// JK: §0.1 Auto-optimize label overlap margin after layout settles
			this._autoOptimizeLabelOverlapOnce();
			// F1: Zero-config start — auto-focus on active file after first render
			this._autoFocusActiveFile();
			// Clear suppress AFTER _autoFocusActiveFile so that its doRender()
			// can protect the next simulation-end autoFit via the flag
			this._suppressAutoFit = false;
			// P5: Persist all node positions after simulation settles
			this._persistAllPositions();
		});

		this.updateLegend();
		this.startRenderLoop();
		if (this.skipPanelRebuildCount === 0) this.buildPanel();
		// 注釈を再描画
		this._renderAllAnnotations();
	}

	/** Compute a static layout (delegates to layout-compute). */
	private _computeStaticLayout(gd: GraphData, cx: number, cy: number, W: number, H: number): GraphData | null {
		this.shells = [];
		this.nodeShellIndex.clear();
		const sortCmp = this.buildSortComparator(gd.nodes, gd.edges);
		const nsMap = this.computeNodeSpacingMap(gd.nodes);
		const result: StaticLayoutResult | null = computeStaticLayout(gd, {
			layout: this.currentLayout,
			cx, cy, W, H,
			sortComparator: sortCmp,
			nodeSpacingMap: nsMap,
			app: this.app,
			groupField: this.plugin.settings.groupField,
			concentricMinRadius: this.panel.concentricMinRadius,
			concentricRadiusStep: this.panel.concentricRadiusStep,
			timelineKey: this.panel.timelineKey,
			timelineEndKey: this.panel.timelineEndKey,
		});
		if (!result) {
			this.setStatus(t("error.layoutFailed"));
			return null;
		}
		// Apply result to GVC state
		this.shells = result.shells;
		for (const [id, idx] of result.nodeShellIndex) this.nodeShellIndex.set(id, idx);
		if (result.sunburstArcs) this.sunburstLayoutArcs = result.sunburstArcs;
		if (result.sunburstCenter) this.sunburstCenter = result.sunburstCenter;
		if (result.timelineBars) {
			if (!this.clusterMeta) this.clusterMeta = { nodeClusterMap: new Map(), clusterCentroids: new Map(), clusterRadii: new Map() };
			this.clusterMeta.timelineBars = result.timelineBars;
			this.clusterMeta.timelineSteps = result.timelineSteps;
			this.clusterMeta.timelineStepWidth = result.timelineStepWidth;
			this.clusterMeta.timelineLanes = result.timelineLanes;
			this.clusterMeta.timelineWorkGroups = result.timelineWorkGroups;
		}
		return result.data;
	}

	/** Create nodes, build transition animation, and finalize the static layout render. */
	private async _finalizeStaticLayout(
		ld: GraphData,
		nodeR: (n: GraphNode) => number,
		nodeColor: (n: GraphNode) => number,
		W: number,
		H: number,
		signal: AbortSignal,
	): Promise<void> {
		this.graphEdges = ld.edges;
		invalidateBundleCache(this.edgeCache);
		this.setStatus(`Creating ${ld.nodes.length} nodes...`);
		await yieldFrame();
		if (signal.aborted) return;

		this.renderPipeline?.setSkipNodeRendering(viewModeSkipsNodeRendering(this.panel.viewMode));
		this.createPixiNodes(ld.nodes, nodeR, nodeColor);
		this.computeSortRanks();
		await yieldFrame();
		if (signal.aborted) return;

		this.ensureViewportUtilization(W, H);

		// Non-graph viewModes: clear unused canvas layers
		if (this.panel.viewMode !== "graph") {
			this._clearNonGraphCanvasLayers();
		}

		this.updatePositions(true);
		this.autoFitView(W, H);
		this._applyTimelineFit(W, H);

		// Build and apply layout transition animation
		const transitionData = buildTransitionData(this.pixiNodes.values(), this.savedPositions);
		this.savedPositions.clear();
		this._applyLayoutTransition(transitionData);

		this.setStatus(`Drawing ${ld.edges.length} edges...`);
		await yieldFrame();
		if (signal.aborted) return;

		this._postRenderUpdate(ld);
	}

	/** Clear canvas layers not used by the current non-graph viewMode and hide DOM overlays. */
	private _clearNonGraphCanvasLayers(): void {
		clearNonGraphLayers(this.panel.viewMode, {
			edgeGraphics: this.edgeGraphics,
			orbitGraphics: this.orbitGraphics,
			enclosureGraphics: this.enclosureGraphics,
			arrowGraphics: this.arrowGraphics,
			trayGraphics: this.trayGraphics,
			linkPreviewGfx: this.linkPreviewGfx,
			pathfinderGraphics: this.pathfinderGraphics,
			nodeCircleBatch: this.nodeCircleBatch,
			sunburstGraphics: this.sunburstGraphics,
			barGraphics: this.barGraphics,
			routeGraphics: this.routeGraphics,
			guideGraphics: this.guideGraphics,
		});
		if (this.graphStatsEl) this.graphStatsEl.style.display = "none";
		if (this.legendEl) this.legendEl.style.display = "none";
		if (this.minimap) this.minimap.setVisible(false);
		if (this.relationMatrixEl) this.relationMatrixEl.style.display = "none";
	}

	/** Apply timeline viewport fit from bar data if in timeline viewMode. */
	private _applyTimelineFit(W: number, H: number): void {
		if (this.panel.viewMode !== "timeline" || !this.clusterMeta?.timelineBars?.length) return;
		const fit = computeTimelineFit(this.clusterMeta.timelineBars, W, H);
		if (!fit) return;
		const wc = this.worldContainer;
		if (wc) {
			wc.scale.set(fit.scale);
			wc.x = W / 2 - fit.cx * fit.scale;
			wc.y = H / 2 - fit.cy * fit.scale;
			this.updateLabelsForZoom();
			this.updateZoomIndicator(fit.scale);
		}
	}

	/** Apply layout transition animation or snap positions immediately. */
	private _applyLayoutTransition(
		transitionData: { data: { x: number; y: number }; fromX: number; fromY: number; toX: number; toY: number }[],
	): void {
		if (transitionData.length === 0) return;
		if (!this.pixiApp?.supportsAnimation && transitionData.length > TRANSITION_SKIP_THRESHOLD) {
			for (const td of transitionData) {
				td.data.x = td.toX;
				td.data.y = td.toY;
			}
			this.markDirty(true);
		} else {
			this.layoutTransition.start(transitionData, () => {
				this.markDirty(true);
			});
		}
	}

	/** Update status, legend, search, and panel after static layout render completes. */
	private _postRenderUpdate(ld: GraphData): void {
		const totalNodes = this.rawData?.nodes.length ?? ld.nodes.length;
		this.setStatus(this.buildRichStatus(ld.nodes.length, ld.edges.length, totalNodes));
		this.updateLegend();
		this.updateEntropyScores();
		this.updateGraphStats(ld);
		this.updateRelationMatrix(ld);
		this.updateThumbnails();
		this.updateHierarchyBreadcrumb();
		this.recalcNodeRadii(); // Ensure degree-proportional sizing after static layout
		this.startRenderLoop();
		this.applySearch();
		// updateLabelsForZoom is also called inside autoFitView above,
		// but we call it again here after applySearch so search-highlighted
		// labels respect semantic zoom visibility.
		this.updateLabelsForZoom();

		// Rebuild panel — relationColors and other data are now available
		this.stopOrbitAnimation();
		if (this.skipPanelRebuildCount === 0) this.buildPanel();
		if (this.currentLayout === LAYOUT_CONCENTRIC && this.shells.length > 0) {
			if (this.panel.orbitAutoRotate) this.startOrbitAnimation();
		}
		// 注釈を再描画
		this._renderAllAnnotations();
	}

	// =========================================================================
	// Live panel adjustments
	// =========================================================================
	// =========================================================================
	// Delegated to LayoutController
	// =========================================================================
	private updateForces() {
		this.layoutController.updateForces();
	}
	private applyNodeRulesForce() {
		this.layoutController.applyNodeRulesForce();
	}
	private applyEnclosureRepulsionForce() {
		this.layoutController.applyEnclosureRepulsionForce();
	}
	private applyClusterForce(resetPositions = true) {
		this.layoutController.applyClusterForce(resetPositions);
		// Schedule auto-fit after arrangement changes so layout fills the viewport
		if (resetPositions && this.canvasWrap) {
			const wrap = this.canvasWrap;
			clearTimeout(this._autoFitTimer);
			this._autoFitTimer = window.setTimeout(() => {
				if (!this._suppressAutoFit) {
					this.autoFitView(wrap.clientWidth, wrap.clientHeight);
					this.markDirty();
				}
			}, AUTOFIT_DELAY_MS);
		}
	}
	private _autoFitTimer: number = 0;
	private buildSortComparator(nodes: GraphNode[], edges: GraphEdge[]) {
		return this.layoutController.buildSortComparator(nodes, edges);
	}
	private computeNodeSpacingMap(nodes: GraphNode[]) {
		return this.layoutController.computeNodeSpacingMap(nodes);
	}
	private computeLiveCentroids() {
		return this.layoutController.computeLiveCentroids(this.clusterMeta);
	}

	/** Get positions of nodes belonging to a specific group (for convex hull placement). */
	/** Collect all frontmatter keys from the vault for field selects */
	private _fmKeysCache: string[] | null = null;
	private _fmKeysCacheTime = 0;

	private collectFrontmatterKeys(): string[] {
		// Cache for 5 seconds — vault metadata rarely changes mid-interaction
		const now = Date.now();
		if (this._fmKeysCache && now - this._fmKeysCacheTime < FM_KEYS_CACHE_TTL_MS) {
			return this._fmKeysCache;
		}
		const keys = new Set<string>();
		const files = this.app.vault.getMarkdownFiles();
		for (const f of files) {
			const cache = this.app.metadataCache.getFileCache(f);
			const fm = cache?.frontmatter;
			if (fm) {
				for (const k of Object.keys(fm)) {
					if (k !== "position") keys.add(k);
				}
			}
		}
		this._fmKeysCache = [...keys].sort();
		this._fmKeysCacheTime = now;
		return this._fmKeysCache;
	}

	/** Collect available group names based on current groupBy mode */
	private collectAvailableGroups(): string[] {
		if (!this.panel.groupBy || this.panel.groupBy === "none") return [];
		// Use original graph data if available, otherwise pixiNodes
		const nodes: GraphNode[] = this.originalGraphData
			? this.originalGraphData.nodes
			: [...this.pixiNodes.values()].map((pn) => pn.data);
		const groups = this.resolveGroupByField(nodes, { minSize: this.panel.groupMinSize });
		return groups.map((g) => g.label).sort();
	}

	// -- Tab focus navigation --
	private focusNodeIndex = -1;
	private focusNodeOrder: string[] = [];
	private _focusSearchGen = -1; // IR: track search set size for rebuild

	private cycleFocusNode(direction: 0 | 1 | -1) {
		if (direction === 0) {
			this.focusNodeIndex = -1;
			this._isKeyboardFocused = false;
			this.setHighlightedNodeId(null);
			this.applyHover();
			this._announceA11y(t("a11y.focusCleared"));
			return;
		}
		// IR: When search is active, cycle only through matching nodes
		const searchSet = this._searchHighlightSet;
		const targetSize = searchSet ? searchSet.size : this.pixiNodes.size;
		if (this.focusNodeOrder.length !== targetSize || this._focusSearchGen !== (searchSet?.size ?? -1)) {
			const ids = searchSet ? [...searchSet] : [...this.pixiNodes.keys()];
			this.focusNodeOrder = ids
				.filter((id) => this.pixiNodes.has(id))
				.sort((a, b) => {
					const pa = this.pixiNodes.get(a)!;
					const pb = this.pixiNodes.get(b)!;
					return pa.data.label.localeCompare(pb.data.label);
				});
			this.focusNodeIndex = -1;
			this._focusSearchGen = searchSet?.size ?? -1;
		}
		if (this.focusNodeOrder.length === 0) return;
		this.focusNodeIndex =
			(this.focusNodeIndex + direction + this.focusNodeOrder.length) % this.focusNodeOrder.length;
		const nodeId = this.focusNodeOrder[this.focusNodeIndex];
		this._isKeyboardFocused = true;
		this.setHighlightedNodeId(nodeId);
		this.applyHover();
		this.panToNode(nodeId);
		// Announce focused node to screen readers with rich context
		const focusPn = this.pixiNodes.get(nodeId);
		if (focusPn) {
			const deg = this.degrees.get(nodeId) ?? 0;
			const tags = focusPn.data.tags?.slice(0, 3).join(", ") ?? "";
			const cat = focusPn.data.category ?? "";
			const parts = [focusPn.data.label];
			if (deg > 0) parts.push(`${deg} connections`);
			if (cat) parts.push(cat);
			if (tags) parts.push(tags);
			this._announceA11y(parts.join(" — "));
		} else {
			this._announceA11y(nodeId);
		}
	}

	// -- Arrow key neighbor navigation for focused node --
	private _neighborIndex = -1;
	private _neighborList: string[] = [];

	private _navigateNeighbor(dir: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown") {
		if (!this.highlightedNodeId) return;

		// Build neighbor list for current node
		const gd = this.getGraphData();
		const edges = gd?.edges ?? [];
		const nodeId = this.highlightedNodeId;
		const neighborIds = new Set<string>();
		for (const e of edges) {
			if (e.source === nodeId) neighborIds.add(e.target);
			else if (e.target === nodeId) neighborIds.add(e.source);
		}
		// Filter to only nodes that exist in pixiNodes
		const neighbors = [...neighborIds].filter((id) => this.pixiNodes.has(id));
		if (neighbors.length === 0) {
			this._announceA11y("No connected nodes");
			return;
		}

		// Sort by label for Left/Right, by degree for Up/Down
		if (dir === "ArrowLeft" || dir === "ArrowRight") {
			neighbors.sort((a, b) => {
				const la = this.pixiNodes.get(a)?.data.label ?? a;
				const lb = this.pixiNodes.get(b)?.data.label ?? b;
				return la.localeCompare(lb);
			});
		} else {
			neighbors.sort((a, b) => (this.degrees.get(b) ?? 0) - (this.degrees.get(a) ?? 0));
		}

		// Reset index if neighbor list changed
		if (this._neighborList.length !== neighbors.length || this._neighborList.some((id, i) => neighbors[i] !== id)) {
			this._neighborList = neighbors;
			this._neighborIndex = -1;
		}

		const step = dir === "ArrowRight" || dir === "ArrowDown" ? 1 : -1;
		this._neighborIndex = (this._neighborIndex + step + neighbors.length) % neighbors.length;
		const targetId = neighbors[this._neighborIndex];

		this._isKeyboardFocused = true;
		this.setHighlightedNodeId(targetId);
		this.applyHover();
		this.panToNode(targetId);

		const pn = this.pixiNodes.get(targetId);
		const deg = this.degrees.get(targetId) ?? 0;
		const pos = `${this._neighborIndex + 1}/${neighbors.length}`;
		this._announceA11y(`${pn?.data.label ?? targetId} — ${deg} connections — neighbor ${pos}`);
	}

	/** Announce current zoom level for keyboard zoom changes. */
	private _announceZoomLevel() {
		const zoom = this.worldContainer?.scale.x ?? 1;
		const pct = Math.round(zoom * 100);
		const visibleCount = [...this.pixiNodes.values()].filter((pn) => pn.gfx.visible).length;
		const labelCount = [...this.pixiNodes.values()].filter((pn) => pn.label?.visible).length;
		const selCount = this.panel.multiSelectNodeIds?.length ?? 0;
		let msg = `Zoom ${pct}% — ${visibleCount} nodes, ${labelCount} labels visible`;
		if (selCount > 0) msg += ` — ${selCount} selected`;
		if (this.panel.subgraphNodeIds?.length > 0) {
			msg += ` — Subgraph (depth ${this.panel.subgraphStack.length + 1})`;
		}
		this._announceA11y(msg);
	}

	/** Push a short message into the aria-live region for screen reader users. */
	private _announceA11y(msg: string) {
		if (!this._ariaLiveEl) return;
		// Toggle text to force re-announcement even if same content
		this._ariaLiveEl.textContent = "";
		requestAnimationFrame(() => {
			if (this._ariaLiveEl) this._ariaLiveEl.textContent = msg;
		});
	}

	/** Copy the current graph view as PNG to clipboard */
	private async copyGraphToClipboard() {
		if (!this.pixiApp) return;
		try {
			const { exportGraphAsPng } = await import("../utils/export-png");
			const blob = await exportGraphAsPng(this.pixiApp);
			await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
			showToast(t("toast.copiedToClipboard"));
		} catch (_e) {
			showToast(t("toast.clipboardFailed"), TOAST_LONG_MS);
		}
	}

	/**
	 * 現在のグラフをPNGとしてキャプチャし、アクティブなノートに埋め込む。
	 * ツールバーボタンおよびコマンドパレットから呼び出される。
	 */
	public async embedGraphInNote(): Promise<void> {
		// アクティブなエディタを取得
		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView || !mdView.editor) {
			showToast(t("toast.embedNoEditor"), TOAST_LONG_MS);
			return;
		}
		if (!this.pixiApp) {
			showToast(t("toast.embedNoGraph"), TOAST_LONG_MS);
			return;
		}

		try {
			const { exportGraphAsPng } = await import("../utils/export-png");
			const blob = await exportGraphAsPng(this.pixiApp);

			// タイムスタンプ付きファイル名を生成
			const now = new Date();
			const ts = [
				now.getFullYear(),
				String(now.getMonth() + 1).padStart(2, "0"),
				String(now.getDate()).padStart(2, "0"),
				String(now.getHours()).padStart(2, "0"),
				String(now.getMinutes()).padStart(2, "0"),
				String(now.getSeconds()).padStart(2, "0"),
			].join("");
			const filename = `graph-island-${ts}.png`;

			// Obsidianの添付ファイルフォルダ設定を尊重してパスを決定
			const vault = this.app.vault as ObsidianVaultInternal;
			const attachPath = vault.getAvailablePath
				? vault.getAvailablePath(
						(vault.config?.attachmentFolderPath || "") +
							"/" +
							filename.replace(".png", ""),
						"png",
					)
				: filename;

			// バイナリデータとしてvaultに保存
			const buffer = await blob.arrayBuffer();
			await this.app.vault.createBinary(attachPath, buffer);

			// エディタのカーソル位置にwikilink画像を挿入
			const editor = mdView.editor;
			const basename = attachPath.replace(/^.*\//, "");
			editor.replaceSelection(`![[${basename}]]\n`);

			showToast(t("toast.embedSuccess"));
		} catch (_e) {
			showToast(t("toast.embedFailed"), TOAST_LONG_MS);
		}
	}

	/**
	 * キャンバスをPNG Blobとしてエクスポートする公開メソッド。
	 * コマンドパレットからの呼び出し用。
	 */
	public async exportCanvasAsBlob(): Promise<Blob | null> {
		if (!this.pixiApp) return null;
		const { exportGraphAsPng } = await import("../utils/export-png");
		return exportGraphAsPng(this.pixiApp);
	}

	/** Collect all unique tag names from graph nodes */
	private collectAvailableTags(): string[] {
		const tags = new Set<string>();
		const nodes = this.originalGraphData
			? this.originalGraphData.nodes
			: [...this.pixiNodes.values()].map((pn) => pn.data);
		for (const n of nodes) {
			if (n.tags) for (const tag of n.tags) tags.add(tag);
		}
		return [...tags].sort();
	}

	private buildNodeRadiiMap(): Map<string, number> {
		const m = new Map<string, number>();
		for (const [id, pn] of this.pixiNodes) m.set(id, pn.radius);
		return m;
	}

	/** Cached version of computeLiveCentroids — recomputes max once per frame */
	private getCachedCentroids(): Map<string, { x: number; y: number }> | null {
		if (this._centroidCacheFrame === this._frameCounter && this._centroidCache) {
			return this._centroidCache;
		}
		this._centroidCache = this.computeLiveCentroids();
		this._centroidCacheFrame = this._frameCounter;
		return this._centroidCache;
	}

	/** Cached version of buildNodeRadiiMap — recomputes max once per frame */
	private getCachedNodeRadii(): Map<string, number> {
		if (this._nodeRadiiCacheFrame === this._frameCounter && this._nodeRadiiCache) {
			return this._nodeRadiiCache;
		}
		this._nodeRadiiCache = this.buildNodeRadiiMap();
		this._nodeRadiiCacheFrame = this._frameCounter;
		return this._nodeRadiiCache;
	}

	/** F1: Auto-focus on the currently active file after first render.
	 *  Only runs once per view open to avoid overriding user navigation. */
	private _hasAutoFocused = false;
	private _autoFocusActiveFile(): void {
		if (this._hasAutoFocused) return;
		if (!this.panel.syncWithEditor) return;
		this._hasAutoFocused = true;

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// R16: Default to local graph centered on active file for better first impression
		// Only apply if large graph (>500) and no localGraphCenter set
		if (this.panel.localGraphCenter === null && this.pixiNodes.size > LARGE_GRAPH_LOCAL_THRESHOLD && this.panel.syncWithEditor) {
			this.panel.localGraphCenter = activeFile.path;
			this.panel.localGraphHops = 1;
			this.rawData = null;
			// Suppress autoFit in the next simulation-end so the local graph
			// zoom is computed from filtered (local) nodes, not overwritten
			// by a full-graph autoFit triggered before this re-render settles.
			this._suppressAutoFit = true;
			this.doRender();
			return;
		}

		const nodeId = this.findNodeIdByPath(activeFile.path);
		if (!nodeId) return;
		this.setHighlightedNodeId(nodeId);
		this.applyHover();
		this.panToNode(nodeId);
	}

	/** P5: Save all node positions to pinnedPositions after simulation completes.
	 *  This ensures the graph layout is reproducible on next open. */
	private _persistAllPositions(): void {
		const pp = this.panel.pinnedPositions;
		for (const [id, pn] of this.pixiNodes) {
			if (id.startsWith("tag:") || id.startsWith("__")) continue; // skip virtual nodes
			pp[id] = { x: pn.data.x, y: pn.data.y };
		}
		this.requestSave();
	}

	/**
	 * Find the node ID corresponding to a vault file path.
	 */
	private findNodeIdByPath(path: string): string | null {
		for (const [id, pn] of this.pixiNodes) {
			if (pn.data.filePath === path) return id;
		}
		return null;
	}

	/**
	 * Smoothly pan the camera so that the given node is centered on screen.
	 * Uses 200ms ease-out animation; skips animation when prefers-reduced-motion is set.
	 */
	panToNode(nodeId: string) {
		const pn = this.pixiNodes.get(nodeId);
		if (!pn) return;
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;

		const targetX = wrap.clientWidth / 2 - pn.data.x * world.scale.x;
		const targetY = wrap.clientHeight / 2 - pn.data.y * world.scale.y;

		// Skip animation: reduced motion or Canvas2D backend
		const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (prefersReduced || !this.pixiApp?.supportsAnimation) {
			world.x = targetX;
			world.y = targetY;
			this.markDirty(true);
			return;
		}

		// Animated pan (200ms ease-out)
		const startX = world.x;
		const startY = world.y;
		const duration = 200;
		const startTime = performance.now();
		const animate = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / duration, 1);
			const ease = 1 - (1 - t) * (1 - t); // ease-out quadratic
			world.x = startX + (targetX - startX) * ease;
			world.y = startY + (targetY - startY) * ease;
			this.markDirty();
			if (t < 1) requestAnimationFrame(animate);
		};
		requestAnimationFrame(animate);
	}

	/** Pan to node and zoom to a comfortable level (animated).
	 *  Used for focus-zoom on keyboard Tab or node list click. */
	focusZoomToNode(nodeId: string, targetZoom = 0.8) {
		const pn = this.pixiNodes.get(nodeId);
		if (!pn) return;
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;

		const currentZoom = world.scale.x;
		// Only zoom in if currently zoomed out beyond target
		const finalZoom = currentZoom < targetZoom ? targetZoom : currentZoom;
		const targetX = wrap.clientWidth / 2 - pn.data.x * finalZoom;
		const targetY = wrap.clientHeight / 2 - pn.data.y * finalZoom;

		const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (prefersReduced || !this.pixiApp?.supportsAnimation) {
			world.scale.set(finalZoom);
			world.x = targetX;
			world.y = targetY;
			this.updateZoomIndicator(finalZoom);
			this.updateLabelsForZoom();
			this.markDirty(true);
			return;
		}

		// Cancel any running zoom animation
		if (this._zoomAnimId) cancelAnimationFrame(this._zoomAnimId);

		const startX = world.x;
		const startY = world.y;
		const startZoom = currentZoom;
		const duration = 300;
		const startTime = performance.now();
		const animate = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / duration, 1);
			const ease = 1 - (1 - t) * (1 - t);
			const z = startZoom + (finalZoom - startZoom) * ease;
			world.scale.set(z);
			world.x = startX + (targetX - startX) * ease;
			world.y = startY + (targetY - startY) * ease;
			this.markDirty();
			if (t < 1) {
				this._zoomAnimId = requestAnimationFrame(animate);
			} else {
				this._zoomAnimId = 0;
				this.updateZoomIndicator(finalZoom);
				this.updateLabelsForZoom();
			}
		};
		this._zoomAnimId = requestAnimationFrame(animate);
	}

	/** Push a node visit to navigation history (max 20). */
	private pushNavHistory(nodeId: string): void {
		const hist = this.panel.navHistory;
		const cursor = this.panel.navHistoryCursor;
		// If we're not at the latest, truncate forward history
		if (cursor >= 0 && cursor < hist.length - 1) {
			hist.splice(cursor + 1);
		}
		// Avoid consecutive duplicates
		if (hist.length === 0 || hist[hist.length - 1] !== nodeId) {
			hist.push(nodeId);
			if (hist.length > 20) hist.shift();
		}
		this.panel.navHistoryCursor = hist.length - 1;
	}

	/** Navigate back in history */
	navBack(): void {
		const hist = this.panel.navHistory;
		if (hist.length === 0) return;
		const cursor = this.panel.navHistoryCursor < 0 ? hist.length - 1 : this.panel.navHistoryCursor;
		if (cursor > 0) {
			this.panel.navHistoryCursor = cursor - 1;
			this._jumpToNodeNoHistory(hist[cursor - 1]);
		}
	}

	/** Navigate forward in history */
	navForward(): void {
		const hist = this.panel.navHistory;
		if (hist.length === 0) return;
		const cursor = this.panel.navHistoryCursor;
		if (cursor >= 0 && cursor < hist.length - 1) {
			this.panel.navHistoryCursor = cursor + 1;
			this._jumpToNodeNoHistory(hist[cursor + 1]);
		}
	}

	/** Internal jump without recording history */
	private _jumpToNodeNoHistory(nodeId: string): void {
		const pn = this.pixiNodes.get(nodeId);
		if (!pn) return;
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;
		world.x = wrap.clientWidth / 2 - pn.data.x * world.scale.x;
		world.y = wrap.clientHeight / 2 - pn.data.y * world.scale.y;
		this.setHighlightedNodeId(nodeId);
		this.applyHover();
		this.wakeRenderLoop();
	}

	// =========================================================================
	// I5: Public preset application for keyboard shortcut commands
	// =========================================================================
	/** Apply a named preset by key (used by keyboard shortcut commands). */
	/** Get human-readable summary of a preset's settings for tooltip preview */
	private _getPresetSummary(key: string): string {
		const presetDefs: Record<string, Record<string, unknown>> = {
			simple: { edges: "links only", arrows: false, color: "category" },
			analysis: { edges: "all types", arrows: true, color: "category", fade: true },
			creative: { edges: "links+tags+semantic", tags: "enclosure", color: "category" },
			"active-focus": { mode: "local graph", hops: 2, focus: true, arrows: true },
			"full-analysis": { edges: "all types", arrows: true, stats: true, color: "community", bridges: true },
			explore: { mode: "local graph", hops: 3, focus: true, similar: true },
			analyze: { stats: true, bridges: true, entropy: true, color: "community", arrows: true },
			write: { mode: "local graph", hops: 1, focus: true, presentation: true },
		};
		const def = presetDefs[key];
		if (!def) return "";
		return Object.entries(def)
			.map(([k, v]) => `${k}: ${v}`)
			.join("\n");
	}

	applyPresetByKey(preset: string): void {
		const p = ALL_PRESETS[preset];
		if (p) {
			if ("groupBy" in p && !("groupByRules" in p)) {
				this.panel.groupByRules = null;
			}
			Object.assign(this.panel, p);
			if (this.panel.localGraphCenter === "__active__") {
				const af = this.app.workspace.getActiveFile();
				this.panel.localGraphCenter = af?.path ?? null;
			}
			this.doRender();
			this.requestSave();
			this._announceA11y(`Preset: ${preset}`);
		}
	}

	/**
	 * Pan the camera so that the given node is centered on screen, then highlight it.
	 */
	private jumpToNode(nodeId: string) {
		this.pushNavHistory(nodeId);
		const pn = this.pixiNodes.get(nodeId);
		if (!pn) return;

		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;

		// E5: Presentation mode — animate to node
		if (this.panel.presentationMode) {
			this._animateToNode(nodeId);
			return;
		}

		// Focus-zoom to node if zoomed out, otherwise just pan
		this.setHighlightedNodeId(nodeId);
		this.applyHover();
		if (world.scale.x < 0.5) {
			this.focusZoomToNode(nodeId, 0.6);
		} else {
			const worldX = pn.data.x;
			const worldY = pn.data.y;
			const screenCenterX = wrap.clientWidth / 2;
			const screenCenterY = wrap.clientHeight / 2;
			world.x = screenCenterX - worldX * world.scale.x;
			world.y = screenCenterY - worldY * world.scale.y;
		}
		this.wakeRenderLoop();
	}

	/** E5: Animated pan to a node with ease-out (presentation mode). */
	private _animateToNode(nodeId: string, durationMs = ANIMATE_TO_NODE_MS): void {
		const pn = this.pixiNodes.get(nodeId);
		if (!pn) return;
		const world = this.worldContainer;
		const wrap = this.canvasWrap;
		if (!world || !wrap) return;

		const startX = world.x;
		const startY = world.y;
		const targetX = wrap.clientWidth / 2 - pn.data.x * world.scale.x;
		const targetY = wrap.clientHeight / 2 - pn.data.y * world.scale.y;
		const startTime = performance.now();

		const animate = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / durationMs);
			const ease = t * (2 - t); // ease-out quadratic
			world!.x = startX + (targetX - startX) * ease;
			world!.y = startY + (targetY - startY) * ease;
			this.markDirty();
			if (t < 1) {
				requestAnimationFrame(animate);
			} else {
				this.setHighlightedNodeId(nodeId);
				this.applyHover();
			}
		};
		requestAnimationFrame(animate);
	}

	// V1: Smooth fade animation for search filter transitions
	private _fadeNodeAlpha(pn: PixiNode, targetAlpha: number, durationMs = FADE_ALPHA_MS): void {
		const startAlpha = pn.gfx.alpha;
		if (Math.abs(startAlpha - targetAlpha) < ALPHA_EPSILON) return;
		const startTime = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - startTime) / durationMs);
			pn.gfx.alpha = startAlpha + (targetAlpha - startAlpha) * t;
			if (t < 1) {
				requestAnimationFrame(tick);
			}
			this.markDirty();
		};
		requestAnimationFrame(tick);
	}

	private applySearch() {
		const raw = this.panel.searchQuery;
		const hopSet = this._buildSearchHopSet(raw);
		const hlSet = this._searchHighlightSet;
		const hasHighlight = hopSet !== null || hlSet !== null;

		for (const pn of this.pixiNodes.values()) {
			if (!hasHighlight) {
				this._fadeNodeAlpha(pn, 1);
				this.drawNodeCircle(pn, false);
				continue;
			}
			const hopMatch = hopSet === null || hopSet.has(pn.data.id);
			const textMatch = !hlSet || hlSet.has(pn.data.id);
			if (hopMatch && textMatch) {
				this._searchHighlightMatchedNode(pn, hlSet);
			} else {
				 
				pn._searchPulsed = false;
				this._fadeNodeAlpha(pn, DIMMED_NODE_ALPHA);
				this.drawNodeCircle(pn, false);
			}
		}
		this.markDirty();
		this._announceSearchResults(raw, hopSet, hlSet);

		// N1: Auto-fit view to search results after filtering
		if (raw.trim() && this.canvasWrap) {
			const wrap = this.canvasWrap;
			this._scheduleTimer(() => this.autoFitView(wrap.clientWidth, wrap.clientHeight), 100);
		}
	}

	/** Parse hop:name:n filters and BFS to build the hop highlight set. */
	private _buildSearchHopSet(raw: string): Set<string> | null {
		const hopMatches = [...raw.matchAll(/hop:([^:,]+):(\d+)/gi)];
		if (hopMatches.length === 0) return null;

		const hopSet = new Set<string>();
		for (const m of hopMatches) {
			const name = m[1].toLowerCase();
			const hops = parseInt(m[2], 10);
			const origins: string[] = [];
			for (const pn of this.pixiNodes.values()) {
				if (pn.data.label.toLowerCase().includes(name)) origins.push(pn.data.id);
			}
			for (const origin of origins) {
				hopSet.add(origin);
				let frontier = [origin];
				for (let h = 0; h < hops && frontier.length > 0; h++) {
					const next: string[] = [];
					for (const id of frontier) {
						const nb = this.adj.get(id);
						if (nb)
							for (const n of nb) {
								if (!hopSet.has(n)) {
									hopSet.add(n);
									next.push(n);
								}
							}
					}
					frontier = next;
				}
			}
		}
		return hopSet;
	}

	/** Apply search halo + pulse to a matched node. */
	private _searchHighlightMatchedNode(pn: PixiNode, hlSet: Set<string> | null): void {
		this._fadeNodeAlpha(pn, 1);
		pn.circle.visible = true;
		pn.circle.clear();
		const searchHitColor = this.getAccentColor();
		const shape = getNodeShape(pn.data, this.panel.nodeShapeRules);
		const isCardMode = (this.panel.nodeDisplayMode ?? "node") === "card";
		if (isCardMode) {
			this._drawSearchCardHalo(pn, searchHitColor);
		} else {
			drawShape(pn.circle, shape, pn.radius * 2.2, searchHitColor, 0.1);
			pn.circle.lineStyle(SEARCH_HALO_STROKE_WIDTH, searchHitColor, SEARCH_HALO_STROKE_ALPHA);
			drawShape(pn.circle, shape, pn.radius, pn.color, 1);
		}
		// HE: Tint card title text
		if (isCardMode && pn.gfx.children.length > 0) {
			for (const child of pn.gfx.children) {
				const ct = child as unknown as { _isCardText?: boolean; style?: { fill: string } };
				if (ct._isCardText && ct.style) {
					ct.style.fill = "#" + searchHitColor.toString(16).padStart(6, "0");
					break;
				}
			}
		}
		this._searchPulse(pn, hlSet);
	}

	/** Draw card-mode search halo rect. */
	private _drawSearchCardHalo(pn: PixiNode, searchHitColor: number): void {
		const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };
		const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : GOLDEN_RATIO_FALLBACK;
		const baseH = pn.radius * 2;
		const halfH = baseH;
		const halfW = Math.max(20, (baseH * cardAR) / 2);
		const outset = 4;
		const cr = crc.cardCornerRadius ?? 6;
		pn.circle.beginFill(searchHitColor, 0.1);
		pn.circle.drawRoundedRect(-halfW - outset, -halfH - outset, (halfW + outset) * 2, (halfH + outset) * 2, cr);
		pn.circle.endFill();
		pn.circle.lineStyle(SEARCH_HALO_STROKE_WIDTH, searchHitColor, SEARCH_HALO_STROKE_ALPHA);
		pn.circle.drawRoundedRect(-halfW, -halfH, halfW * 2, halfH * 2, cr);
	}

	/** EJ: Pulse animation — brief scale bounce on first search highlight. */
	private _searchPulse(pn: PixiNode, hlSet: Set<string> | null): void {
		const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
		 
		if (hlSet && !pn._searchPulsed && !reducedMotion) {
			 
			pn._searchPulsed = true;
			const sx = pn.gfx.scale.x;
			pn.gfx.scale.set(sx * SEARCH_PULSE_SCALE);
			this._scheduleTimer(() => {
				if (pn.gfx) pn.gfx.scale.set(sx);
			}, SEARCH_PULSE_MS);
		 
		} else if (hlSet && !pn._searchPulsed) {
			 
			pn._searchPulsed = true;
		}
	}

	/** A11y: announce search filter results for screen readers. */
	private _announceSearchResults(raw: string, hopSet: Set<string> | null, hlSet: Set<string> | null): void {
		const hasHighlight = hopSet !== null || hlSet !== null;
		if (hasHighlight) {
			let matchCount = 0;
			for (const pn of this.pixiNodes.values()) {
				const hopOk = hopSet === null || hopSet.has(pn.data.id);
				const textOk = !hlSet || hlSet.has(pn.data.id);
				if (hopOk && textOk) matchCount++;
			}
			this._announceA11y(
				`${t("a11y.filterResult") ?? "Filter"}: ${matchCount} / ${this.pixiNodes.size} ${t("a11y.nodesVisible") ?? "nodes"}`,
			);
		} else if (!raw.trim()) {
			this._announceA11y(t("a11y.filterCleared") ?? "Filter cleared");
		}
	}

	applyTextFade() {
		this.labelManager?.applyTextFade();
	}

	/** Called by InteractionManager after zoom changes to update label visibility */
	updateLabelsForZoom() {
		this.labelManager?.updateLabelsForZoom();
	}

	/** Delegate to LabelManager for rotated label culling (also called from drawSunburstLabels, drawClusterSunburstArcs) */
	cullOverlappingRotatedLabels(labels: Map<string, CanvasText>) {
		this.labelManager?.cullOverlappingRotatedLabels(labels);
	}

	/** Called by InteractionManager (debounced) when zoom changes.
	 *  Adjusts effective node size based on zoom level and recalculates layout. */
	onZoomLayoutUpdate(zoom: number) {
		if (!this.simulation) return;
		const t = mergeRenderThresholds(this.panel.renderThresholds);
		if (!t.zoomNodeSizeAdapt) return;

		// Effective node size: counter-scale to maintain consistent screen-space size.
		// At zoom=1 use panel.nodeSize as-is; at zoom<1 enlarge, at zoom>1 shrink.
		// Dampened by sqrt to avoid extreme size changes.
		const baseSize = this._zoomBaseNodeSize ?? this.panel.nodeSize;
		const factor = 1 / Math.sqrt(Math.max(0.02, zoom));
		this.panel.nodeSize = Math.max(t.minNodeRadius, Math.round(baseSize * factor * 10) / 10);

		// Update visual radii of all existing PixiNodes to reflect new nodeSize
		this.recalcNodeRadii();

		// Recalculate layout without position reset (smooth transition)
		this.applyClusterForce(false);
		this.markDirty();
	}

	/** Stores the original nodeSize before zoom-adaptation (set once on first render) */
	private _zoomBaseNodeSize: number | null = null;

	/** Recalculate and apply visual radii for all PixiNodes based on current panel.nodeSize. */
	private recalcNodeRadii() {
		// Sanitize nodeSize to prevent NaN propagation
		if (!isFinite(this.panel.nodeSize) || this.panel.nodeSize <= 0) {
			this.panel.nodeSize = 15;
		}
		const ns = this.panel.nodeSize;
		const rt = mergeRenderThresholds(this.panel.renderThresholds);
		const maxR = rt.maxNodeRadius > 0 ? rt.maxNodeRadius : Infinity;
		const minR = rt.minNodeRadius;
		const sizeByDeg = rt.nodeSizeByDegree;
		let maxDeg = 0;
		if (sizeByDeg) {
			for (const d of this.degrees.values()) {
				if (d > maxDeg) maxDeg = d;
			}
		}
		// HM: content-proportional sizing (card mode only)
		const isCard = (this.panel.nodeDisplayMode ?? "node") === "card";
		const cardContentScale = isCard ? rt.cardContentScale : 0;
		let maxBodyLength = 0;
		if (cardContentScale > 0) {
			for (const pn of this.pixiNodes.values()) {
				const bl = pn.data.bodyLength ?? 0;
				if (bl > maxBodyLength) maxBodyLength = bl;
			}
		}
		for (const pn of this.pixiNodes.values()) {
			pn.radius = effectiveRadius(
				pn.data,
				ns,
				this.degrees.get(pn.data.id) || 0,
				maxR,
				minR,
				maxDeg,
				sizeByDeg,
				pn.data.bodyLength ?? 0,
				maxBodyLength,
				cardContentScale,
			);
		}
	}

	// EA: Unified node marker system
	private _bookmarkMarkers = new Map<string, CanvasText>();
	private _pinMarkers = new Map<string, CanvasText>();

	/** EA: Generic marker sync — adds/removes CanvasText markers on nodes */
	private _syncNodeMarkers(
		activeIds: Set<string>,
		markerMap: Map<string, CanvasText>,
		text: string,
		style: { fontSize: number; fill: number; fontWeight?: string },
		anchorY: 0 | 1, // 0 = below node, 1 = above node
		offsetSign: 1 | -1,
		offsetExtra: number,
	) {
		const zoom = this.worldContainer?.scale.x ?? 1;
		const counterScale = Math.max(0.5, 1 / zoom);
		for (const [id, marker] of markerMap) {
			if (!activeIds.has(id) || !this.pixiNodes.has(id)) {
				const pn = this.pixiNodes.get(id);
				if (pn) {
					pn.gfx.removeChild(marker);
					marker.destroy();
				}
				markerMap.delete(id);
			}
		}
		for (const id of activeIds) {
			const pn = this.pixiNodes.get(id);
			if (!pn) continue;
			let marker = markerMap.get(id);
			if (!marker) {
				marker = new CanvasText(text, {
					fontSize: style.fontSize,
					fill: style.fill,
					fontWeight: style.fontWeight ?? "bold",
				});
				marker.anchor.set(0.5, anchorY);
				marker.resolution = 2;
				pn.gfx.addChild(marker);
				markerMap.set(id, marker);
			}
			marker.x = 0;
			marker.y = offsetSign * (pn.radius + offsetExtra);
			marker.scale.set(counterScale);
		}
	}

	private _cachedBookmarkSet: Set<string> | null = null;
	private _cachedPinSet: Set<string> | null = null;

	private _updateBookmarkMarkers() {
		if (!this._cachedBookmarkSet) {
			this._cachedBookmarkSet = new Set(this.panel.bookmarkedNodes ?? []);
		}
		this._syncNodeMarkers(
			this._cachedBookmarkSet,
			this._bookmarkMarkers,
			"★",
			{ fontSize: 10, fill: 0xfbbf24 },
			1,
			-1,
			2,
		);
	}

	private _updatePinMarkers() {
		if (!this._cachedPinSet) {
			this._cachedPinSet = new Set(Object.keys(this.panel.pinnedPositions ?? {}));
		}
		this._syncNodeMarkers(this._cachedPinSet, this._pinMarkers, "|", { fontSize: 8, fill: 0x94a3b8 }, 0, 1, 1);
	}

	/** Compute sort ranks for all PixiNodes. Rank 0 = most prominent. */
	private computeSortRanks() {
		const cmp = this.layoutController?.buildSortComparator(
			Array.from(this.pixiNodes.values()).map((pn) => pn.data),
			this.graphEdges,
		);
		if (!cmp) {
			// No sort rules -- rank by degree (default behavior)
			const sorted = Array.from(this.pixiNodes.values()).sort(
				(a, b) => (this.degrees.get(b.data.id) ?? 0) - (this.degrees.get(a.data.id) ?? 0),
			);
			sorted.forEach((pn, i) => {
				pn.sortRank = i;
			});
			return;
		}
		const sorted = Array.from(this.pixiNodes.values()).sort((a, b) => cmp(a.data, b.data));
		sorted.forEach((pn, i) => {
			pn.sortRank = i;
		});
	}

	// =========================================================================
	// Sunburst arc hover highlight
	// =========================================================================

	/** Currently hovered sunburst arc (depth 1 ancestor name), or null */
	private _hoveredSunburstGroup: string | null = null;

	/** Hit-test sunburst arcs at world coordinates. Returns depth-1 group name or null. */
	hitTestSunburstArc(wx: number, wy: number): string | null {
		if (this.currentLayout !== LAYOUT_SUNBURST || this.sunburstLayoutArcs.length === 0) return null;
		const { x: cx, y: cy } = this.sunburstCenter;
		const dx = wx - cx;
		const dy = wy - cy;
		const r = Math.sqrt(dx * dx + dy * dy);
		let angle = Math.atan2(dy, dx) + Math.PI / 2; // offset to match draw offset
		if (angle < 0) angle += 2 * Math.PI;
		if (angle > 2 * Math.PI) angle -= 2 * Math.PI;

		// Find deepest arc that contains the point
		let bestArc: (typeof this.sunburstLayoutArcs)[0] | null = null;
		for (const arc of this.sunburstLayoutArcs) {
			if (arc.depth === 0) continue;
			if (r >= arc.y0 && r <= arc.y1 && angle >= arc.x0 && angle <= arc.x1) {
				if (!bestArc || arc.depth > bestArc.depth) bestArc = arc;
			}
		}
		if (!bestArc) return null;

		// Find depth-1 ancestor
		if (bestArc.depth === 1) return bestArc.name;
		for (const arc of this.sunburstLayoutArcs) {
			if (arc.depth === 1 && arc.x0 <= bestArc.x0 && arc.x1 >= bestArc.x1) return arc.name;
		}
		return bestArc.name;
	}

	/** Sunburst tooltip element */
	private _sunburstTooltipEl: HTMLElement | null = null;

	/** Set hovered sunburst group and trigger re-render with highlight + tooltip */
	setSunburstHover(groupName: string | null): void {
		if (groupName === this._hoveredSunburstGroup) return;
		this._hoveredSunburstGroup = groupName;
		this._updateSunburstTooltip(groupName);
		this.markDirty();
	}

	/** Handle click on a sunburst arc: switch to graph mode with a path filter */
	onSunburstArcClick(groupName: string): void {
		const displayName = cleanArcName(groupName);
		// Set search query to filter by folder path
		this.panel.searchQuery = `path:${displayName}`;
		// Switch to graph mode
		this.panel.viewMode = "graph";
		 
		this.currentLayout = LAYOUT_FORCE;
		this.doRender();
		this._announceA11y(`Filtered: ${displayName}`);
	}

	/** Update or hide sunburst tooltip (delegates to sunburst-renderer) */
	private _updateSunburstTooltip(groupName: string | null): void {
		if (!groupName) {
			if (this._sunburstTooltipEl) this._sunburstTooltipEl.style.display = "none";
			return;
		}
		const { lines } = buildSunburstTooltipContent(this.sunburstLayoutArcs, groupName);
		if (!this._sunburstTooltipEl && this.canvasWrap) {
			this._sunburstTooltipEl = this.canvasWrap.createDiv({ cls: "gi-sunburst-tooltip" });
			Object.assign(this._sunburstTooltipEl.style, {
				position: "absolute",
				pointerEvents: "none",
				zIndex: "100",
				background: "var(--background-secondary)",
				color: "var(--text-normal)",
				padding: "4px 8px",
				borderRadius: "4px",
				fontSize: "12px",
				maxWidth: "250px",
				whiteSpace: "pre-line",
				lineHeight: "1.4",
				boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
				top: "8px",
				right: "8px",
			});
		}
		if (this._sunburstTooltipEl) {
			this._sunburstTooltipEl.textContent = lines.join("\n");
			this._sunburstTooltipEl.style.display = "";
		}
	}

	// =========================================================================
	// Sunburst layout arc rendering (Canvas 2D)
	// =========================================================================

	/** Draw sunburst layout arcs (delegates to sunburst-renderer). */
	private drawSunburstLayoutArcs() {
		const gfx = this.sunburstGraphics;
		if (!gfx) return;
		if (this.currentLayout !== LAYOUT_SUNBURST) {
			gfx.clear();
			this._clearSunburstLabels();
			return;
		}
		if (this.sunburstLayoutArcs.length === 0) return;

		const arcs = this.sunburstLayoutArcs;
		const { x: cx, y: cy } = this.sunburstCenter;
		drawSunburstLayoutArcsImpl({
			gfx,
			arcs,
			cx,
			cy,
			worldScale: this.worldContainer?.scale.x ?? 1,
			isSunburstView: this.panel.viewMode === "sunburst",
			hoveredGroup: this._hoveredSunburstGroup,
			drawArcPath: this.drawArcPath.bind(this),
		});
		this.drawSunburstLabels(arcs, cx, cy);
	}

	/** Remove all sunburst layout labels (delegates to sunburst-renderer). */
	private _clearSunburstLabels(): void {
		clearSunburstLabelsImpl(this.sunburstLabels, this.sunburstLabelContainer, this._sunburstTooltipEl);
		this._hoveredSunburstGroup = null;
	}

	/** Sunburst label container for category names */
	private sunburstLabelContainer: CanvasContainer | null = null;
	private sunburstLabels: Map<string, CanvasText> = new Map();
	private clusterSunburstLabelContainer: CanvasContainer | null = null;
	private clusterSunburstLabels: Map<string, CanvasText> = new Map();

	/** Draw sunburst labels (delegates to sunburst-renderer). */
	private drawSunburstLabels(arcs: LayoutSunburstArc[], cx: number, cy: number) {
		if (!this.sunburstLabelContainer && this.worldContainer) {
			this.sunburstLabelContainer = new CanvasContainer();
			this.worldContainer.addChild(this.sunburstLabelContainer);
		}
		const container = this.sunburstLabelContainer;
		if (!container) return;
		container.visible = true;
		this._clearSunburstLabels();

		this.sunburstLabels = drawSunburstLabelsImpl({
			arcs,
			cx,
			cy,
			container,
			gfx: this.sunburstGraphics,
			worldScale: this.worldContainer?.scale.x ?? 1,
			isSunburstView: this.panel.viewMode === "sunburst",
			isDark: this.cachedIsDark ?? true,
			cullOverlappingRotatedLabels: this.cullOverlappingRotatedLabels.bind(this),
		});
	}

	/** Render matrix viewMode (delegates to matrix-renderer). */
	private _renderMatrixViewMode(gd: GraphData, W: number, H: number): void {
		// Hide Canvas, show DOM matrix
		if (this.canvasWrap) {
			const canvas = this.canvasWrap.querySelector("canvas");
			if (canvas) canvas.style.display = "none";
		}
		renderMatrixViewModeImpl({
			containerEl: this.canvasWrap ?? this.containerEl,
			W,
			H,
			gd,
			sortMode: (this.panel.matrixSortMode ?? "degree") as MatrixSortMode,
			isDark: this.isDarkTheme(),
			onSortChange: (mode) => {
				this.panel.matrixSortMode = mode as PanelState["matrixSortMode"];
				this._renderMatrixViewMode(gd, W, H);
			},
			onCellClick: (nodeId, secondId) => this._switchToGraphAndFocus(nodeId, secondId),
			setStatus: (text) => this.setStatus(text),
		});
		// Hide all overlays (stats, legend, minimap, relation matrix overlay)
		if (this.graphStatsEl) this.graphStatsEl.style.display = "none";
		if (this.legendEl) this.legendEl.style.display = "none";
		if (this.minimap) this.minimap.setVisible(false);
		if (this.relationMatrixEl) this.relationMatrixEl.style.display = "none";
		if (this.skipPanelRebuildCount === 0) this.buildPanel();
	}

	/** Switch to graph viewMode and focus on a node (optionally highlight a pair). */
	private _switchToGraphAndFocus(nodeId: string, secondId?: string): void {
		this.panel.viewMode = "graph";
		this.currentLayout = viewModeToLayout("graph");
		const group = this.containerEl.querySelector(".gi-view-mode-group");
		if (group) {
			group.querySelectorAll(".gi-view-mode-btn").forEach((b) => {
				const isActive = (b as HTMLElement).dataset.mode === "graph";
				b.toggleClass("is-active", isActive);
				b.setAttribute("aria-pressed", String(isActive));
			});
		}
		this.doRender();
		// After render completes, jump to node
		this._scheduleTimer(() => {
			this.jumpToNode(nodeId);
			if (secondId) this.applyEphemeralHighlight(new Set([nodeId, secondId]));
		}, 1000);
	}
}
