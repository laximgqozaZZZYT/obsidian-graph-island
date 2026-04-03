import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { GraphEdge, EdgeCardinalityMode, Cardinality, CardinalityRule, CardinalityRenderConfig } from "../types";
import { DEFAULT_CARDINALITY_RENDER_CONFIG } from "../types";
import { cssColorToHex, edgeSourceId, edgeTargetId, incCounter } from "../utils/graph-helpers";
import { wcagContrastRatio, contrastColor } from "../utils/color";
import type { RoadNetwork } from "../layouts/cable-tray";
import {
	routeEdge,
	findNearestIntersection,
	cachedFindShortestPath,
	pathToWaypoints,
	invalidatePathCache,
} from "../layouts/cable-tray";
import {
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_SEQUENCE,
	EDGE_TYPE_SIMILAR,
	EDGE_TYPE_SIBLING,
	EDGE_TYPE_HAS_TAG,
	EDGE_TYPE_LINK,
	EDGE_TYPE_TAG,
} from "../constants";
import {
	type GroupPort,
	type Trunk,
	type TrunkCable,
	type NodePort,
	type IntraGroupCable,
	type CableRouteOpts,
	type GroupPerimInfo,
	type PolarJunctionGrid,
	type PortLaneInfo,
	type PortColorLanes,
	type CablePrepResult,
	HIGHLIGHT_CABLE_TRUNK_WIDTH,
	CABLE_FAN_CROWD_THRESHOLD,
	CABLE_FAN_CROWD_MIN_FRACTION,
	CABLE_FAN_CONNECTED_FACTOR,
	CABLE_FAN_NON_MATCH_DAMPEN,
	CABLE_LANE_SPACING,
	CABLE_LAYOUT_MARGIN,
	CABLE_OVERLAP_FRAC,
	TRUNK_CONDUIT_ALPHA,
	CABLE_CONDUIT_ALPHA,
	WIRE_BASE_ALPHA,
	STUB_WIRE_SPACING,
	MAX_CONDUIT_WIDTH,
	TRUNK_SCREEN_WIDTH,
	CABLE_SCREEN_WIDTH,
	WIRE_SCREEN_WIDTH,
	DEFAULT_CLUSTER_RADIUS,
	NODE_PORT_OFFSET_RATIO,
	NODE_PORT_MIN_OFFSET,
	zoomFadeAlpha as _zoomFadeAlpha,
	buildManhattanPath,
	buildHorizontalTrunkPath,
	buildVerticalTrunkPath,
	buildPolarTrunkPath,
	computeCablePath,
	computePolarCenter,
	computePolarJunctionGrid,
	filterPolarGridForPort,
	routeViaPolarGrid,
	computeGroupPorts,
	buildTrunks,
	buildIntraGroupCables,
	routeSingleIntraCable as _routeSingleIntraCable,
	routeExternalOnlyNode as _routeExternalOnlyNode,
	cableFadeByDegree,
	cableWeightThickness,
	buildPortColorLanes,
	getPortLaneEndpoint,
} from "./CableTrayRenderer";
// Re-export cable-tray types for external consumers
export type {
	GroupPort,
	Trunk,
	TrunkCable,
	NodePort,
	IntraGroupCable,
	CableRouteOpts,
	GroupPerimInfo,
	PolarJunctionGrid,
	PortLaneInfo,
	PortColorLanes,
	CablePrepResult,
};

// ---------------------------------------------------------------------------
// Edge drawing configuration
// ---------------------------------------------------------------------------
export interface EdgeDrawConfig {
	showLinks: boolean;
	showTagEdges: boolean;
	showCategoryEdges: boolean;
	showSemanticEdges: boolean;
	showInheritance: boolean;
	showAggregation: boolean;
	showTagNodes: boolean;
	showSimilar: boolean;
	showSibling: boolean;
	showSequence: boolean;
	colorEdgesByRelation: boolean;
	isArcLayout: boolean;
	highlightedNodeId: string | null;
	/** Set of node IDs in the hover highlight (BFS n-hop) */
	highlightSet: Set<string>;
	/** DS: Distance map from hovered node (nodeId → hop count) for edge alpha gradient */
	hoverDistMap?: Map<string, number>;
	/** HT: Hover edge alpha falloff per hop (0-1, default 0.6). Higher = less fade per hop. */
	hoverEdgeFalloff?: number;
	bgColor: number;
	relationColors: Map<string, string>;
	/** Fade edges based on source node degree — low-degree nodes produce fainter edges */
	fadeByDegree: boolean;
	/** Node degree map (id → degree count). Required when fadeByDegree is true. */
	degrees: Map<string, number>;
	/** Maximum degree across all nodes (pre-computed for normalization) */
	maxDegree: number;
	/** Total visible edge count (used to auto-scale alpha for dense graphs) */
	totalEdgeCount?: number;
	/** GG: Global edge alpha multiplier (0-1, default 1.0) */
	globalEdgeAlpha?: number;
	/** Node ID → cluster group key (null = no clustering / bundling disabled) */
	nodeClusterMap: Map<string, string> | null;
	/** Cluster group key → live centroid position */
	clusterCentroids: Map<string, { x: number; y: number }> | null;
	/** Cluster group key → estimated visual radius (for cable boundary clipping) */
	clusterRadii: Map<string, number> | null;
	/** Edge bundling strength: 0 = straight lines, 1 = full routing through centroids */
	bundleStrength: number;
	/** Whether the current Obsidian theme is dark (affects edge color defaults) */
	isDark: boolean;
	/** A11y: High contrast mode — double edge line width */
	highContrast?: boolean;
	/** Show relation/type labels on edges */
	showEdgeLabels: boolean;
	/** GW: Edge label font size override (default 10) */
	edgeLabelFontSize?: number;
	/** Edge label placement mode: center (midpoint), offset (perpendicular above), smart (collision-avoiding) */
	edgeLabelPlacement?: "center" | "offset" | "smart";
	/** Show directional arrows on all edges */
	showArrows: boolean;
	/** Node ID → radius (for positioning arrows at node edge) */
	nodeRadii: Map<string, number> | null;
	/** Current world container scale (for zoom-dependent rendering) */
	worldScale?: number;
	/** Viewport transform for edge culling */
	viewportX?: number;
	viewportY?: number;
	viewportW?: number;
	viewportH?: number;
	/** Edge cardinality marker mode */
	edgeCardinalityMode?: EdgeCardinalityMode;
	/** Custom cardinality rules */
	cardinalityRules?: CardinalityRule[];
	/** Cardinality marker render config (sizes, offsets, line widths) */
	cardinalityRenderConfig?: CardinalityRenderConfig;
	/** Cable bundling mode: auto (when clusters exist), always, never */
	cableBundleMode?: "auto" | "always" | "never";
	/** Minimum edge count per group pair to create a trunk (default 2).
	 *  Lower values bundle more aggressively; set to 1 to bundle all inter-group edges. */
	trunkMinEdges?: number;
	/** Cable trunk line width (px) */
	cableTrunkWidth?: number;
	/** Cable trunk opacity (0-1) */
	cableTrunkAlpha?: number;
	/** Spacing between parallel cables (px) */
	cableSpacing?: number;
	/** Fan wire width (px) */
	cableFanWidth?: number;
	/** Fan wire opacity (0-1) */
	cableFanAlpha?: number;
	/** Minimum density scale floor — prevents edges vanishing at high count + low zoom */
	edgeDensityFloor?: number;
	/** Alpha for edges directly connected to the hovered node (default 1.0). Overrides densityScale. */
	highlightEdgeAlpha?: number;
	/** Alpha for edges NOT connected to the hovered node while hover is active (default 0.15). */
	highlightEdgeNonMatchAlpha?: number;
	/** Show edge weight via line thickness (same source-target pair count) */
	edgeWeightThickness?: boolean;
	/** Road network for edge routing (edges follow roads when available) */
	roadNetwork?: RoadNetwork | null;
	/** Group arrangement pattern — used for trunk routing direction */
	clusterArrangement?: string;
	/** Coordinate system: "cartesian" or "polar" — determines cable routing mode */
	coordinateSystem?: "cartesian" | "polar";
	/** エッジ種別ごとにレイヤー分離描画 — 種別別に描画パスを分けて z-order を制御 */
	edgeLayerMode?: boolean;
	/** Filter edges by directionality: "all" | "bidirectional" | "unidirectional" */
	edgeDirectionFilter?: "all" | "bidirectional" | "unidirectional";
	/** Pre-computed set of bidirectional edge keys ("source→target") */
	_bidirectionalSet?: Set<string>;
	/** S6: Ontology backbone — thicken inheritance edges */
	showOntologyBackbone?: boolean;
	/** Scale edge width by target node in-degree */
	edgeStrengthGlow?: boolean;
	/** Minimum width multiplier for edge strength glow (default 0.5) */
	edgeStrengthGlowMin?: number;
	/** Maximum width multiplier for edge strength glow (default 3.0) */
	edgeStrengthGlowMax?: number;
	/** Minimum zoom level to draw edges (default 0). Below this, edges are hidden for performance. */
	edgeMinZoom?: number;
	/** Zoom threshold below which edge thickness/alpha are gradually reduced (default 0.5).
	 *  Below this zoom, edges thin & fade proportionally to reduce visual clutter. */
	edgeZoomFadeThreshold?: number;
	/** Zoom level below which edge labels are completely hidden (default 0.15). */
	edgeLabelZoomHide?: number;
	/** Zoom level below which edge labels fade in (default 0.3).
	 *  Between edgeLabelZoomHide and this value, labels fade from 0→1. */
	edgeLabelZoomFade?: number;
	/** Minimum alpha floor for edges at extreme zoom-out (default 0.1).
	 *  Thickness floor = 3×this, breadcrumb floor = 2×this. */
	edgeFadeMinAlpha?: number;
	/** Alpha boost for bidirectional edges (default 0.2). */
	edgeBidirectionalBoost?: number;
	/** Alpha reduction for unidirectional edges when indicator is active (default 0.15). */
	edgeUnidirectionalDim?: number;
	/** Alpha boost for inheritance/hierarchy edges (default 0.3). */
	edgeHierarchyBoost?: number;
	/** Thickness multiplier for bidirectional edges (default 1.5). */
	edgeBidirectionalThickFactor?: number;
	/** Thickness multiplier for inheritance/hierarchy edges (default 2.5). */
	edgeHierarchyThickFactor?: number;
	/** Maximum edge count for arc (quadratic curve) layout (default 500).
	 *  Above this, arcs fall back to straight lines to avoid vertex buffer explosion. */
	arcMaxEdgeCount?: number;
	/** Minimum alpha floor for distance-based hover falloff (default 0.08). */
	edgeHoverFalloffMinAlpha?: number;
}

// Minimal position data needed for source/target
interface Pos {
	x: number;
	y: number;
	id?: string;
}

/** Returns true if the edge should be skipped based on type visibility toggles. */
export function shouldSkipEdge(e: GraphEdge, cfg: EdgeDrawConfig): boolean {
	const spec = EDGE_TYPE_SPECS.get(e.type ?? "");
	if (spec) return !cfg[spec.visibilityField];
	return !cfg.showLinks; // untyped edges treated as links
}

// ---------------------------------------------------------------------------
// Bidirectional edge detection
// ---------------------------------------------------------------------------

/**
 * Build a set of edge keys ("source→target") that participate in bidirectional
 * pairs. An edge A→B is bidirectional if B→A also exists in the edge list.
 */
const _bidirForwardBuf = new Set<string>();
const _bidirResultBuf = new Set<string>();
export function buildBidirectionalSet(edges: GraphEdge[]): Set<string> {
	_bidirForwardBuf.clear();
	_bidirResultBuf.clear();
	for (const e of edges) {
		const fwd = `${e.source}→${e.target}`;
		const rev = `${e.target}→${e.source}`;
		if (_bidirForwardBuf.has(rev)) {
			_bidirResultBuf.add(rev);
			_bidirResultBuf.add(fwd);
		}
		_bidirForwardBuf.add(fwd);
	}
	return _bidirResultBuf;
}

/** Check if an edge should be skipped based on the direction filter. */
export function shouldSkipByDirection(
	e: GraphEdge,
	cfg: Pick<EdgeDrawConfig, "edgeDirectionFilter" | "_bidirectionalSet">,
): boolean {
	const filter = cfg.edgeDirectionFilter;
	if (!filter || filter === "all") return false;
	const bidirSet = cfg._bidirectionalSet;
	if (!bidirSet) return false;
	const key = `${e.source}→${e.target}`;
	const isBidir = bidirSet.has(key);
	if (filter === "bidirectional") return !isBidir;
	if (filter === "unidirectional") return isBidir;
	return false;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Theme-aware edge colors
export function defaultColor(isDark: boolean) {
	return isDark ? 0x666666 : 0x999999;
}
// C4: Intuitive edge color palette — distinct, accessible, memorable
const LINK_COLOR = 0x60a5fa; // blue-400 — wikilink (primary relationship)
const TAG_EDGE_COLOR = 0x22d3ee; // cyan-400 — shared-tag co-occurrence
const CATEGORY_EDGE_COLOR = 0xa78bfa; // violet-400 — shared-category
const SEMANTIC_EDGE_COLOR = 0xfb923c; // orange-400 — semantic/related
const INHERITANCE_COLOR = 0x8b5cf6; // purple-500 — hierarchy/inheritance
const AGGREGATION_COLOR = 0x3b82f6; // blue-500 — composition/aggregation
const SIMILAR_COLOR = 0xf59e0b; // amber-500 — similarity/semantic
const HAS_TAG_COLOR = 0x6b7280; // gray-500 — tag membership (subtle)
const SIBLING_COLOR = 0x10b981; // emerald-500 — peer relationship
const SEQUENCE_COLOR = 0xef4444; // red-500 — sequential order (directional)

// ---------------------------------------------------------------------------
// Edge type specification map — single source of truth for per-type behavior
// ---------------------------------------------------------------------------
export interface EdgeTypeSpec {
	/** Which EdgeDrawConfig field controls visibility */
	visibilityField: keyof EdgeDrawConfig;
	/** Fixed color for this edge type, or null to use relation/default color */
	color: number | null;
}

export const EDGE_TYPE_SPECS: ReadonlyMap<string, EdgeTypeSpec> = new Map<string, EdgeTypeSpec>([
	[EDGE_TYPE_LINK, { visibilityField: "showLinks", color: null }],
	[EDGE_TYPE_TAG, { visibilityField: "showTagEdges", color: null }],
	["category", { visibilityField: "showCategoryEdges", color: null }],
	["semantic", { visibilityField: "showSemanticEdges", color: null }],
	[EDGE_TYPE_INHERITANCE, { visibilityField: "showInheritance", color: INHERITANCE_COLOR }],
	[EDGE_TYPE_AGGREGATION, { visibilityField: "showAggregation", color: AGGREGATION_COLOR }],
	[EDGE_TYPE_HAS_TAG, { visibilityField: "showTagNodes", color: HAS_TAG_COLOR }],
	[EDGE_TYPE_SIMILAR, { visibilityField: "showSimilar", color: SIMILAR_COLOR }],
	[EDGE_TYPE_SIBLING, { visibilityField: "showSibling", color: SIBLING_COLOR }],
	[EDGE_TYPE_SEQUENCE, { visibilityField: "showSequence", color: SEQUENCE_COLOR }],
]);

/** Number of angular bins over [0, π). 6 bins = 30° each. */
const ANGLE_BINS = 6;
const BIN_WIDTH = Math.PI / ANGLE_BINS;
/** Spatial grid cell size in pixels for locality-aware bundling */
const GRID_CELL = 200;
/** Minimum edges in a direction-color-cell group to activate bundling */
const MIN_BUNDLE_SIZE = 4;

/** Edge alpha for structural edge types */
export const STRUCTURAL_EDGE_ALPHA = 0.7;
/** Edge alpha for non-structural edge types */
export const NON_STRUCTURAL_EDGE_ALPHA = 0.65;
/** Default line thickness for edges */
export const DEFAULT_LINE_THICKNESS = 2;
/** Edge weight additional thickness per log2 step */
export const WEIGHT_THICKNESS_FACTOR = 0.6;
/** Fade-by-degree minimum alpha fraction */
export const FADE_BY_DEGREE_MIN_ALPHA = 0.3;
/** Alpha for relation-colored edges */
export const RELATION_COLOR_ALPHA = 0.8;
/** Highlighted edge line thickness */
/** Multiplier applied to edge thickness when highlighted (hover/focus). */
export const HIGHLIGHT_THICKNESS_MULTIPLIER = 2.5;
// Cable-tray constants, types, and pure functions are in CableTrayRenderer.ts
/** Arc layout control point height factor */
const ARC_CP_HEIGHT_FACTOR = 0.3;
/** Arc layout control point vertical offset */
const ARC_CP_VERTICAL_OFFSET = 20;
/** Arc layout max edge count before disabling curves */
const ARC_MAX_EDGE_COUNT = 500;
/** Edge marker size for ontology markers */
const EDGE_MARKER_SIZE = 8;
/** Sequence arrow marker size */
const SEQUENCE_ARROW_SIZE = 7;
/** Generic arrow minimum size */
const GENERIC_ARROW_MIN_SIZE = 10;
/** Generic arrow radius proportion */
const GENERIC_ARROW_RADIUS_FACTOR = 0.35;
/** Generic arrow half-width proportion */
const GENERIC_ARROW_HALF_WIDTH = 0.45;
/** Generic arrow tip offset from node boundary */
const GENERIC_ARROW_TIP_OFFSET = 2;
/** Sequence/ontology arrow half-width factor */
const ARROW_HALF_WIDTH_FACTOR = 0.4;
/** Edge marker stroke width */
const MARKER_STROKE_WIDTH = 1.5;
/** Edge marker fill alpha ratio (relative to line alpha) */
const MARKER_FILL_ALPHA_RATIO = 0.9;
/** Edge marker half-width ratio (for inheritance triangle and aggregation diamond) */
const MARKER_HALF_WIDTH = 0.5;
/** Density scale: edge count threshold for full alpha */
export const DENSITY_FULL_ALPHA_THRESHOLD = 100;
/** Density scale: gentle fade upper bound */
export const DENSITY_GENTLE_THRESHOLD = 500;
/** Density scale: aggressive fade upper bound */
export const DENSITY_AGGRESSIVE_THRESHOLD = 2000;
/** Density scale: gentle fade reduction factor */
export const DENSITY_GENTLE_REDUCTION = 0.35;
/** Density scale: aggressive fade mid-alpha */
export const DENSITY_AGGRESSIVE_MID_ALPHA = 0.65;
/** Density scale: aggressive fade reduction */
export const DENSITY_AGGRESSIVE_REDUCTION = 0.35;
/** Density scale: floor alpha */
export const DENSITY_MIN_ALPHA = 0.4;
/** Zoom fade threshold for extreme zoom-out */
export const ZOOM_FADE_THRESHOLD = 0.05;
/** Zoom fade minimum alpha */
export const ZOOM_FADE_MIN_ALPHA = 0.4;
/** Default density floor */
export const DEFAULT_DENSITY_FLOOR = 0.25;
/** Edge label font size */
const EDGE_LABEL_FONT_SIZE_DEFAULT = 10;
/** A11y: edge label background for contrast (WCAG 1.4.3) */
const EDGE_LABEL_BG_ALPHA = 0.75;

/** A11y: ensure edge label text meets WCAG 4.5:1 contrast against its bg pill */
function a11yEdgeLabelFill(isDark: boolean): number {
	const bg = isDark ? 0x1a1a2e : 0xf0f0f4;
	const candidate = isDark ? 0xcccccc : 0x444444;
	return wcagContrastRatio(candidate, bg) >= 4.5 ? candidate : contrastColor(bg);
}
/** Edge label alpha */
const EDGE_LABEL_ALPHA = 0.7;
/** Edge label resolution */
const EDGE_LABEL_RESOLUTION = 2;
/** Maximum number of edge labels rendered */
const MAX_EDGE_LABELS = 200;

// ---------------------------------------------------------------------------
// Edge color helper (shared between pre-computation and draw loop)
// ---------------------------------------------------------------------------
/** Edge type fallback colors used when colorEdgesByRelation is on but e.relation is unset */
export const EDGE_TYPE_FALLBACK_COLORS: ReadonlyMap<string, number> = new Map([
	["link", LINK_COLOR],
	["tag", TAG_EDGE_COLOR],
	["category", CATEGORY_EDGE_COLOR],
	["semantic", SEMANTIC_EDGE_COLOR],
]);

export function resolveEdgeColor(
	e: GraphEdge,
	useRelColor: boolean,
	relationColors: Map<string, string>,
	isDark: boolean,
): number {
	const spec = EDGE_TYPE_SPECS.get(e.type ?? "");
	if (spec?.color != null) return spec.color;
	if (useRelColor) {
		// 1. Try relation-specific color (e.g. "related.0" → user-configured color)
		if (e.relation) {
			const css = relationColors.get(e.relation);
			if (css) return cssColorToHex(css);
		}
		// 2. Fall back to edge-type color (link=slate, tag=cyan, semantic=orange, etc.)
		const typeFallback = EDGE_TYPE_FALLBACK_COLORS.get(e.type ?? "");
		if (typeFallback != null) return typeFallback;
	}
	return defaultColor(isDark);
}

// ---------------------------------------------------------------------------
// Direction-color bundle pre-computation
// ---------------------------------------------------------------------------

/** Accumulated data for a (angleBin, color) group */
interface BundleAccum {
	sumMx: number; // sum of midpoint x
	sumMy: number; // sum of midpoint y
	count: number;
}

/** Resolved bundle group: centroid of midpoints */
interface BundleGroup {
	cx: number;
	cy: number;
	count: number;
}

/**
 * Normalize an angle to [0, π) — treating opposite directions as the same
 * "highway" since an edge A→B and B→A share the same visual band.
 */
export function normalizeAngle(a: number): number {
	if (a < 0) a += Math.PI;
	if (a >= Math.PI) a -= Math.PI;
	return a;
}

/**
 * Group edges by (grid cell, direction angle bin, line color) and compute the
 * centroid of each group's midpoints. Only spatially proximate, same-direction,
 * same-color edges share a group — producing local "highway" bundles.
 */
// Module-level reusable Maps for direction bundle computation — avoids per-call Map allocation
const _bundleAccumPool = new Map<string, BundleAccum>();
const _bundleResultPool = new Map<string, BundleGroup>();

function buildDirectionBundles(
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
): Map<string, BundleGroup> {
	const accum = _bundleAccumPool;
	accum.clear();

	for (const e of edges) {
		const src = resolvePos(e.source);
		const tgt = resolvePos(e.target);
		if (!src || !tgt) continue;

		const dx = tgt.x - src.x;
		const dy = tgt.y - src.y;
		if (dx * dx + dy * dy < 1) continue;

		const angle = normalizeAngle(Math.atan2(dy, dx));
		const bin = Math.min(Math.floor(angle / BIN_WIDTH), ANGLE_BINS - 1);
		const color = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);

		// Spatial grid cell based on midpoint
		const mx = (src.x + tgt.x) / 2;
		const my = (src.y + tgt.y) / 2;
		const gx = Math.floor(mx / GRID_CELL);
		const gy = Math.floor(my / GRID_CELL);
		const key = `${gx},${gy}|${bin}|${color}`;

		let acc = accum.get(key);
		if (!acc) {
			acc = { sumMx: 0, sumMy: 0, count: 0 };
			accum.set(key, acc);
		}
		acc.sumMx += mx;
		acc.sumMy += my;
		acc.count++;
	}

	const result = _bundleResultPool;
	result.clear();
	for (const [key, acc] of accum) {
		if (acc.count >= MIN_BUNDLE_SIZE) {
			result.set(key, {
				cx: acc.sumMx / acc.count,
				cy: acc.sumMy / acc.count,
				count: acc.count,
			});
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// 3-Layer Wiring Model: 幹線 (Trunk) → Port (引き込み口) → ケーブル (Cable) → 電線 (Wire)
// Types and pure layout functions are in CableTrayRenderer.ts
// ---------------------------------------------------------------------------

/** 引込口の方向 (将来のグループ内ルーティング用に残す) */
export type PortDirection = "N" | "S" | "E" | "W";

/** オントロジー型エッジかどうか */
export function isOntologyEdge(e: GraphEdge): boolean {
	return e.type === EDGE_TYPE_INHERITANCE || e.type === EDGE_TYPE_AGGREGATION || e.type === EDGE_TYPE_SEQUENCE;
}

/**
 * エッジが自ノード(nodeId)から見てどの方向のポートを使うか判定。
 * - N: 自分が source かつ 非オントロジー（リンク先）
 * - S: 自分が target かつ 非オントロジー（バックリンク）
 * - E: 自分が source かつ オントロジー（矢印出る）
 * - W: 自分が target かつ オントロジー（矢印入る）
 */
export function classifyEdgePort(e: GraphEdge, nodeId: string): PortDirection {
	const isSrc = edgeSourceId(e) === nodeId;
	const onto = isOntologyEdge(e);
	if (onto) return isSrc ? "E" : "W";
	return isSrc ? "N" : "S";
}

/** PortColorLanes キー生成ヘルパー: "groupKey|dir" */
export function portLaneKey(groupKey: string, dir: PortDirection): string {
	return `${groupKey}|${dir}`;
}

// ---------------------------------------------------------------------------
// Group BBox & Perimeter routing helpers
// ---------------------------------------------------------------------------

/** Face of a bounding box */
export type BBoxFace = "N" | "S" | "E" | "W";

/** Bounding box with margin */
export interface GroupBBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Compute the graph-wide center from all cluster centroids */
export function computeGraphCenter(centroids: Map<string, { x: number; y: number }>): { x: number; y: number } {
	let sx = 0,
		sy = 0,
		n = 0;
	for (const c of centroids.values()) {
		sx += c.x;
		sy += c.y;
		n++;
	}
	if (n === 0) return { x: 0, y: 0 };
	return { x: sx / n, y: sy / n };
}

/**
 * Compute the bounding box of all nodes belonging to a group, with margin.
 * Returns null if no nodes found.
 */
export function computeGroupBBox(
	groupKey: string,
	resolvePos: (ref: string | object) => Pos | undefined,
	nodeClusterMap: Map<string, string>,
	margin: number,
): GroupBBox | null {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	let found = false;
	for (const [nid, gk] of nodeClusterMap) {
		if (gk !== groupKey) continue;
		const p = resolvePos(nid);
		if (!p) continue;
		found = true;
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	if (!found) return null;
	return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

/** Determine which face of the bbox is closest to the graph center */
export function computePortFace(bbox: GroupBBox, graphCenter: { x: number; y: number }): BBoxFace {
	const cx = (bbox.minX + bbox.maxX) / 2;
	const cy = (bbox.minY + bbox.maxY) / 2;
	// Face center candidates
	const faces: { face: BBoxFace; x: number; y: number }[] = [
		{ face: "N", x: cx, y: bbox.minY },
		{ face: "S", x: cx, y: bbox.maxY },
		{ face: "W", x: bbox.minX, y: cy },
		{ face: "E", x: bbox.maxX, y: cy },
	];
	let best = faces[0];
	let bestDist = (best.x - graphCenter.x) ** 2 + (best.y - graphCenter.y) ** 2;
	for (let i = 1; i < faces.length; i++) {
		const d = (faces[i].x - graphCenter.x) ** 2 + (faces[i].y - graphCenter.y) ** 2;
		if (d < bestDist) {
			bestDist = d;
			best = faces[i];
		}
	}
	return best.face;
}

/** Get the port position (center of the chosen face) */
export function faceCenter(bbox: GroupBBox, face: BBoxFace): { x: number; y: number } {
	const cx = (bbox.minX + bbox.maxX) / 2;
	const cy = (bbox.minY + bbox.maxY) / 2;
	switch (face) {
		case "N":
			return { x: cx, y: bbox.minY };
		case "S":
			return { x: cx, y: bbox.maxY };
		case "W":
			return { x: bbox.minX, y: cy };
		case "E":
			return { x: bbox.maxX, y: cy };
	}
}

/** Get the perpendicular (tangent) direction at a face */
export function facePerpendicular(face: BBoxFace): { perpX: number; perpY: number } {
	// Tangent along the face edge
	switch (face) {
		case "N":
		case "S":
			return { perpX: 1, perpY: 0 }; // horizontal face
		case "E":
		case "W":
			return { perpX: 0, perpY: 1 }; // vertical face
	}
}

/**
 * Build the counter-clockwise perimeter path starting from the port position.
 * Screen coordinates: Y-axis points down.
 *
 * Counter-clockwise (screen coords, Y-down):
 *   S face: port → right(SE) → up(NE) → left(NW) → down(SW) → back
 *   N face: port → left(NW) → down(SW) → right(SE) → up(NE) → back
 *   E face: port → up(NE) → left(NW) → down(SW) → right(SE) → back
 *   W face: port → down(SW) → right(SE) → up(NE) → left(NW) → back
 */
export function buildPerimeterPath(
	bbox: GroupBBox,
	portFace: BBoxFace,
	port: { x: number; y: number },
): { x: number; y: number }[] {
	// Corners: NW, NE, SE, SW (screen coords, Y-down)
	const NW = { x: bbox.minX, y: bbox.minY };
	const NE = { x: bbox.maxX, y: bbox.minY };
	const SE = { x: bbox.maxX, y: bbox.maxY };
	const SW = { x: bbox.minX, y: bbox.maxY };

	// CCW traversal limited to 2 faces: the port face + the next CCW-adjacent face.
	// Screen coords (Y-down): CCW rotation order of faces is S→E→N→W→S
	// So "next CCW face" from S is E, from E is N, from N is W, from W is S.
	switch (portFace) {
		case "S": // port face = bottom → next CCW = east face
			// Port → SE corner → NE corner (end of 2nd face)
			return [port, SE, NE];
		case "N": // port face = top → next CCW = west face
			// Port → NW corner → SW corner
			return [port, NW, SW];
		case "E": // port face = right → next CCW = north face
			// Port → NE corner → NW corner
			return [port, NE, NW];
		case "W": // port face = left → next CCW = south face
			// Port → SW corner → SE corner
			return [port, SW, SE];
	}
}

/**
 * Find the point on the perimeter path closest to the target position.
 * Returns the segment index and the projected point on that segment.
 */
export function findPerimeterBranchPoint(
	perimeterPath: { x: number; y: number }[],
	targetX: number,
	targetY: number,
): { index: number; point: { x: number; y: number } } {
	let bestDist = Infinity;
	let bestIdx = 0;
	let bestPt = perimeterPath[0];

	for (let i = 0; i < perimeterPath.length - 1; i++) {
		const a = perimeterPath[i];
		const b = perimeterPath[i + 1];
		// Project target onto segment a→b
		const abx = b.x - a.x,
			aby = b.y - a.y;
		const apx = targetX - a.x,
			apy = targetY - a.y;
		const ab2 = abx * abx + aby * aby;
		if (ab2 < 0.01) continue;
		let t = (apx * abx + apy * aby) / ab2;
		t = Math.max(0, Math.min(1, t));
		const px = a.x + abx * t;
		const py = a.y + aby * t;
		const d = (px - targetX) ** 2 + (py - targetY) ** 2;
		if (d < bestDist) {
			bestDist = d;
			bestIdx = i;
			bestPt = { x: px, y: py };
		}
	}
	return { index: bestIdx, point: bestPt };
}

/** Junction grid: row gap midpoints (Y) and column gap midpoints (X) between nodes */
export interface JunctionGrid {
	/** Sorted unique row Y values of nodes */
	rows: number[];
	/** Sorted unique column X values of nodes */
	cols: number[];
	/** Y midpoints between adjacent rows */
	rowGaps: number[];
	/** X midpoints between adjacent columns */
	colGaps: number[];
}

/**
 * Merge nearby values into clusters. Values within `minSpacing` of each other
 * are merged into one representative (average of cluster).
 */
export function mergeNearbyValues(sorted: number[], minSpacing: number): number[] {
	if (sorted.length === 0) return [];
	const result: number[] = [];
	let clusterStart = 0;
	for (let i = 1; i <= sorted.length; i++) {
		if (i === sorted.length || sorted[i] - sorted[i - 1] > minSpacing) {
			// End of cluster: compute average of cluster
			let sum = 0;
			for (let j = clusterStart; j < i; j++) sum += sorted[j];
			result.push(sum / (i - clusterStart));
			clusterStart = i;
		}
	}
	return result;
}

/** Compute junction grid from node positions within a group.
 *  Nearby rows/columns are merged to form a clean grid even when
 *  tag/category nodes are at irregular positions. */
export function computeJunctionGrid(
	groupKey: string,
	resolvePos: (ref: string | object) => Pos | undefined,
	nodeClusterMap: Map<string, string>,
): JunctionGrid {
	const xs: number[] = [];
	const ys: number[] = [];
	for (const [nid, gk] of nodeClusterMap) {
		if (gk !== groupKey) continue;
		const p = resolvePos(nid);
		if (p) {
			xs.push(Math.round(p.x));
			ys.push(Math.round(p.y));
		}
	}
	xs.sort((a, b) => a - b);
	ys.sort((a, b) => a - b);

	// Estimate minimum node spacing from the most common gap
	let minSpacing = 20; // fallback
	if (ys.length >= 2) {
		const gaps: number[] = [];
		for (let i = 1; i < ys.length; i++) {
			const g = ys[i] - ys[i - 1];
			if (g > 1) gaps.push(g);
		}
		if (gaps.length > 0) {
			gaps.sort((a, b) => a - b);
			// Use the median gap as the "normal" spacing
			minSpacing = gaps[Math.floor(gaps.length / 2)] * 0.4;
		}
	}

	// Merge nearby rows/columns to form a clean grid
	const rows = mergeNearbyValues(ys, minSpacing);
	const cols = mergeNearbyValues(xs, minSpacing);

	// Only create gaps between rows/columns that have sufficient spacing
	// (gaps narrower than minSpacing are likely between nodes that shouldn't have a gap)
	const rowGaps: number[] = [];
	for (let i = 0; i < rows.length - 1; i++) {
		if (rows[i + 1] - rows[i] > minSpacing) {
			rowGaps.push((rows[i] + rows[i + 1]) / 2);
		}
	}
	const colGaps: number[] = [];
	for (let i = 0; i < cols.length - 1; i++) {
		if (cols[i + 1] - cols[i] > minSpacing) {
			colGaps.push((cols[i] + cols[i + 1]) / 2);
		}
	}
	return { rows, cols, rowGaps, colGaps };
}

/**
 * Filter a JunctionGrid to exclude gaps adjacent to the port face.
 * Intra-group branch wires should avoid the port-face corridor so they
 * don't visually clash with external trunk / groupPortBranch wires.
 *
 * - Port on N → exclude the topmost rowGap (smallest Y)
 * - Port on S → exclude the bottommost rowGap (largest Y)
 * - Port on E → exclude the rightmost colGap (largest X)
 * - Port on W → exclude the leftmost colGap (smallest X)
 */
export function filterGridForPortFace(grid: JunctionGrid, face: BBoxFace): JunctionGrid {
	let { rowGaps, colGaps } = grid;
	switch (face) {
		case "N":
			// Drop the topmost rowGap (smallest Y) — it sits on the port face
			rowGaps = rowGaps.length > 0 ? rowGaps.slice(1) : [];
			break;
		case "S":
			// Drop the bottommost rowGap (largest Y) — it sits on the port face
			rowGaps = rowGaps.length > 0 ? rowGaps.slice(0, -1) : [];
			break;
		case "E":
			// Drop the rightmost colGap (largest X) — it sits on the port face
			colGaps = colGaps.length > 0 ? colGaps.slice(0, -1) : [];
			break;
		case "W":
			// Drop the leftmost colGap (smallest X) — it sits on the port face
			colGaps = colGaps.length > 0 ? colGaps.slice(1) : [];
			break;
	}
	return { rows: grid.rows, cols: grid.cols, rowGaps, colGaps };
}

/** Find the gap value nearest to the target coordinate */
export function findNearestGap(gaps: number[], target: number): number | null {
	if (gaps.length === 0) return null;
	let best = gaps[0];
	let bestDist = Math.abs(gaps[0] - target);
	for (let i = 1; i < gaps.length; i++) {
		const d = Math.abs(gaps[i] - target);
		if (d < bestDist) {
			bestDist = d;
			best = gaps[i];
		}
	}
	return best;
}

/**
 * Find a gap BETWEEN two coordinates (strictly between minV and maxV).
 * If none found strictly between, fall back to nearest gap overall.
 */
export function findGapBetween(gaps: number[], a: number, b: number): number | null {
	if (gaps.length === 0) return null;
	const lo = Math.min(a, b),
		hi = Math.max(a, b);
	// Prefer a gap strictly between a and b
	let best: number | null = null;
	let bestDist = Infinity;
	const mid = (a + b) / 2;
	for (const g of gaps) {
		if (g > lo + 1 && g < hi - 1) {
			const d = Math.abs(g - mid);
			if (d < bestDist) {
				bestDist = d;
				best = g;
			}
		}
	}
	if (best !== null) return best;
	// Same row/col: pick the gap just below or above
	return findNearestGap(gaps, mid);
}

/**
 * Route between two points within a group using the junction grid (碁盤).
 * Wires run EXCLUSIVELY through column gaps (vertical runs) and row gaps (horizontal runs).
 * Every segment is axis-aligned and passes through junction midpoints.
 *
 * Path: from → srcColGap → rowGap → tgtColGap → to
 */
export function routeViaJunctionGrid(
	from: { x: number; y: number },
	to: { x: number; y: number },
	grid: JunctionGrid,
): { x: number; y: number }[] {
	if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1) {
		return [from, to];
	}

	const path: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
	const addPt = (x: number, y: number) => {
		const last = path[path.length - 1];
		if (Math.abs(x - last.x) > 1 || Math.abs(y - last.y) > 1) {
			path.push({ x, y });
		}
	};

	// Find colGap nearest to source X (the "aisle" to exit the source node)
	const srcColGap = findNearestGap(grid.colGaps, from.x);
	// Find colGap nearest to target X (the "aisle" to enter the target node)
	const tgtColGap = findNearestGap(grid.colGaps, to.x);
	// Find rowGap between the two Y positions
	const rowGap = findGapBetween(grid.rowGaps, from.y, to.y);

	// Find rowGap nearest to source (to avoid running along a node row)
	const srcRowGap = findNearestGap(grid.rowGaps, from.y);
	// Find rowGap nearest to target
	const tgtRowGap = findNearestGap(grid.rowGaps, to.y);
	// Find rowGap between the two Y positions (for horizontal traverse)
	const midRowGap = findGapBetween(grid.rowGaps, from.y, to.y);

	if (srcColGap !== null && tgtColGap !== null && midRowGap !== null) {
		// Full 碁盤 routing: all segments through junction points
		// 1. from → (from.x, srcRowGap) — vertical to nearest row gap
		if (srcRowGap !== null) addPt(from.x, srcRowGap);
		// 2. → (srcColGap, srcRowGap) — horizontal to source col gap
		addPt(srcColGap, srcRowGap ?? from.y);
		// 3. → (srcColGap, midRowGap) — vertical to traverse row gap
		addPt(srcColGap, midRowGap);
		// 4. → (tgtColGap, midRowGap) — horizontal along traverse row gap
		addPt(tgtColGap, midRowGap);
		// 5. → (tgtColGap, tgtRowGap) — vertical to target's row gap
		if (tgtRowGap !== null) addPt(tgtColGap, tgtRowGap);
		// 6. → (to.x, tgtRowGap) — horizontal to target X
		addPt(to.x, tgtRowGap ?? to.y);
	} else if (srcColGap !== null && midRowGap !== null) {
		if (srcRowGap !== null) addPt(from.x, srcRowGap);
		addPt(srcColGap, srcRowGap ?? from.y);
		addPt(srcColGap, midRowGap);
		addPt(to.x, midRowGap);
	} else if (tgtColGap !== null && midRowGap !== null) {
		addPt(from.x, midRowGap);
		addPt(tgtColGap, midRowGap);
		if (tgtRowGap !== null) addPt(tgtColGap, tgtRowGap);
		addPt(to.x, tgtRowGap ?? to.y);
	} else if (midRowGap !== null && srcRowGap !== null) {
		addPt(from.x, srcRowGap);
		addPt(from.x, midRowGap);
		addPt(to.x, midRowGap);
	} else if (srcColGap !== null) {
		if (srcRowGap !== null) addPt(from.x, srcRowGap);
		addPt(srcColGap, srcRowGap ?? from.y);
		addPt(srcColGap, to.y);
	} else {
		// No grid — route through nearest available gaps
		if (srcRowGap !== null) {
			addPt(from.x, srcRowGap);
			addPt(to.x, srcRowGap);
		} else {
			const midY = (from.y + to.y) / 2;
			addPt(from.x, midY);
			addPt(to.x, midY);
		}
	}

	addPt(to.x, to.y);
	return path;
}

// Polar junction grid functions moved to CableTrayRenderer.ts

/** Shortest unsigned angle distance */
export function angleDist(a: number, b: number): number {
	let d = Math.abs(a - b);
	if (d > Math.PI) d = 2 * Math.PI - d;
	return d;
}

/** Shortest signed angle delta from a to b */
export function shortestAngleDelta(a: number, b: number): number {
	let d = b - a;
	if (d > Math.PI) d -= 2 * Math.PI;
	if (d < -Math.PI) d += 2 * Math.PI;
	return d;
}

// ---------------------------------------------------------------------------
// Consolidated edge render cache — replaces scattered module-level let vars
// ---------------------------------------------------------------------------
export class EdgeRenderCache {
	groupBBox = new Map<string, GroupBBox | null>();
	graphCenter: { x: number; y: number } | null = null;
	intraCable: { cables: IntraGroupCable[]; handledEdgeIds: Set<string> } | null = null;
	intraCableDirty = true;
	cachedGroupPorts: Map<string, GroupPort> | null = null;
	portColorLanes: PortColorLanes | null = null;
	bundle: Map<string, BundleGroup> | null = null;
	bundleDirty = true;
	roadRoute = new Map<string, { x: number; y: number }[]>();
	roadRouteNetwork: RoadNetwork | null = null;
	bundleFrameCount = 0;
	cable: { trunks: Trunk[]; cabledEdgeIds: Set<string> } | null = null;
	cableDirty = true;
	cableCentroidCount = 0;

	/** Invalidate all caches */
	invalidateAll(): void {
		this.bundle = null;
		this.bundleDirty = true;
		this.bundleFrameCount = 0;
		this.cable = null;
		this.cableDirty = true;
		this.intraCable = null;
		this.intraCableDirty = true;
		this.cachedGroupPorts = null;
		this.portColorLanes = null;
		this.groupBBox.clear();
		this.graphCenter = null;
		this.roadRoute.clear();
		this.roadRouteNetwork = null;
		this.cableCentroidCount = 0;
	}

	/** Invalidate bundle-related caches (equivalent to old invalidateBundleCache) */
	invalidateBundles(): void {
		this.bundleDirty = true;
		this.cableDirty = true;
		this.intraCableDirty = true;
		this.portColorLanes = null;
		this.cachedGroupPorts = null;
		this.groupBBox.clear();
		this.graphCenter = null;
		this.roadRoute.clear();
		this.roadRouteNetwork = null;
	}
}

const _cache = new EdgeRenderCache();

// computeGroupPorts, buildManhattanPath, buildHorizontalTrunkPath,
// buildVerticalTrunkPath, buildPolarTrunkPath, buildTrunks
// moved to CableTrayRenderer.ts

// Intra-group cable wiring types and functions moved to CableTrayRenderer.ts

/** Remove consecutive near-identical points from a path */
export function deduplicatePath(path: { x: number; y: number }[]): { x: number; y: number }[] {
	if (path.length <= 1) return path;
	const result = [path[0]];
	for (let i = 1; i < path.length; i++) {
		const prev = result[result.length - 1];
		if (Math.abs(path[i].x - prev.x) > 0.5 || Math.abs(path[i].y - prev.y) > 0.5) {
			result.push(path[i]);
		}
	}
	return result;
}

// cableFadeByDegree, cableWeightThickness moved to CableTrayRenderer.ts

/**
 * Draw a single cable's branch wires (node-to-node within group).
 * Deduplicates by color so multiple edges of the same color draw as one wire.
 */
function _drawSingleIntraCableBranches(
	g: CanvasGraphics,
	cable: IntraGroupCable,
	cfg: EdgeDrawConfig,
	densityScale: number,
	filterHighlight: "normal" | "bright" | "dim" | null,
	getBranchHighlight: (edges: GraphEdge[]) => "normal" | "bright" | "dim",
	zoomFade = 1,
): void {
	for (const branch of cable.branches) {
		const colorMap = new Map<number, GraphEdge[]>();
		for (const e of branch.edges) {
			const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
			const ex = colorMap.get(c);
			if (ex) ex.push(e);
			else colorMap.set(c, [e]);
		}

		const nColors = colorMap.size;
		const p0 = branch.path[0],
			pN = branch.path[branch.path.length - 1];
		const tdx = pN.x - p0.x,
			tdy = pN.y - p0.y;
		const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
		const perpX = tlen > 0 ? -tdy / tlen : 0;
		const perpY = tlen > 0 ? tdx / tlen : 1;

		let ci = 0;
		for (const [color, edges] of colorMap) {
			const highlight = getBranchHighlight(edges);
			// If filtering, only draw wires matching the filter
			if (filterHighlight !== null && highlight !== filterHighlight) {
				ci++;
				continue;
			}

			let wireAlpha = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;
			if (highlight === "bright") wireAlpha = cfg.highlightEdgeAlpha ?? 1.0;
			else if (highlight === "dim") wireAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;

			// Apply degree-based fade to cable wires (mirrors resolveEdgeStyle)
			wireAlpha *= cableFadeByDegree(edges, cfg);

			const off = nColors > 1 ? (ci - (nColors - 1) / 2) * STUB_WIRE_SPACING : 0;
			const wirePath =
				off === 0 ? branch.path : branch.path.map((p) => ({ x: p.x + perpX * off, y: p.y + perpY * off }));

			const baseAlpha =
				highlight === "bright"
					? wireAlpha
					: Math.max(wireAlpha * densityScale, highlight === "dim" ? 0.05 : 0.1);
			const finalAlpha = baseAlpha * zoomFade;
			const wireWidth = (cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH) + cableWeightThickness(edges, cfg);
			_drawSmoothPath(g, wirePath, wireWidth, color, finalAlpha);
			ci++;
		}
	}
}

/**
 * Draw a single cable's group-port-branch wires.
 * Handles both highlighting and normal modes.
 */
function _drawSingleIntraCableGpb(
	g: CanvasGraphics,
	cable: IntraGroupCable,
	cfg: EdgeDrawConfig,
	densityScale: number,
	portColorLanes: PortColorLanes | undefined,
	filterHighlight: "dim" | "bright" | null,
	getBranchHighlight: (edges: GraphEdge[]) => "normal" | "bright" | "dim",
	zoomFade = 1,
): void {
	const gpb = cable.groupPortBranch;
	if (!gpb || gpb.edges.length === 0) return;

	const gpColorMap = new Map<number, GraphEdge[]>();
	for (const e of gpb.edges) {
		const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
		const ex = gpColorMap.get(c);
		if (ex) ex.push(e);
		else gpColorMap.set(c, [e]);
	}

	for (const [color, edges] of gpColorMap) {
		// Build wire path with port endpoint shifted to lane position
		const wirePath = gpb.path.map((p) => ({ x: p.x, y: p.y }));
		if (portColorLanes && wirePath.length >= 2) {
			const laneInfo = portColorLanes.get(cable.groupKey);
			if (laneInfo) {
				const ep = getPortLaneEndpoint(laneInfo, color, CABLE_LANE_SPACING);
				if (ep) wirePath[wirePath.length - 1] = ep;
			}
		}

		const fadeMul = cableFadeByDegree(edges, cfg);
		const wireWidth = (cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH) + cableWeightThickness(edges, cfg);
		const baseA = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;

		if (filterHighlight !== null) {
			// Highlighting mode — filter by highlight state
			const gpHighlight = getBranchHighlight(edges);
			if (gpHighlight !== filterHighlight) continue;

			let wireAlpha = baseA;
			if (gpHighlight === "bright") wireAlpha = cfg.highlightEdgeAlpha ?? 1.0;
			else wireAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;
			wireAlpha *= fadeMul;

			const gpFinalAlpha =
				(gpHighlight === "bright" ? wireAlpha : Math.max(wireAlpha * densityScale, 0.05)) * zoomFade;
			_drawSmoothPath(g, wirePath, wireWidth, color, gpFinalAlpha);
		} else {
			// Normal mode — draw all at base alpha
			const gpFinalAlpha = Math.max(baseA * fadeMul * densityScale, 0.1) * zoomFade;
			_drawSmoothPath(g, wirePath, wireWidth, color, gpFinalAlpha);
		}
	}
}

/**
 * Draw intra-group cables in 2 passes: conduits then wires.
 */
function drawIntraGroupCables(
	g: CanvasGraphics,
	cables: IntraGroupCable[],
	cfg: EdgeDrawConfig,
	densityScale: number,
	portColorLanes?: PortColorLanes,
): void {
	if (cables.length === 0) return;

	// Zoom-out fade: reduce intra-group cable alpha at extreme zoom.
	// Trunks (inter-group) are NOT affected — only intra-group wires fade.
	const ws = cfg.worldScale ?? 1;
	const zoomFade = _zoomFadeAlpha(ws);
	if (zoomFade < 0.02) return; // Fully faded: skip drawing entirely

	// Highlight helper: an edge is "bright" only when the HOVERED node itself
	// is one of its endpoints (not just any highlight-set member).
	const hovId = cfg.highlightedNodeId;
	const getBranchHighlight = (branchEdges: GraphEdge[]): "normal" | "bright" | "dim" => {
		if (!hovId) return "normal";
		for (const e of branchEdges) {
			const sid = edgeSourceId(e);
			const tid = edgeTargetId(e);
			// Both endpoints must be in highlight set for the edge to be "bright".
			// This prevents trunk/branch lines unrelated to the hovered node from
			// being highlighted just because they share a group port.
			if (cfg.highlightSet.has(sid) && cfg.highlightSet.has(tid)) return "bright";
		}
		return "dim";
	};

	// Internal groupPortBranch wires and external trunk wires both terminate
	// at the group port coordinates, so they visually connect without markers.

	// No conduit layer — wires are drawn directly inside trunks.

	// PASS 1: Intra-group branch wires (node-to-node within group)
	// Within each branch (same source→target), deduplicate by color so that
	// multiple edges of the same color (e.g., link + semantic) draw as one wire.
	// When highlighting, draw in 2 sub-passes: dim first, then bright on top.
	const _drawBranchWires = (filterHighlight: "normal" | "bright" | "dim" | null) => {
		for (const cable of cables) {
			_drawSingleIntraCableBranches(g, cable, cfg, densityScale, filterHighlight, getBranchHighlight, zoomFade);
		}
	};

	if (cfg.highlightedNodeId) {
		// During hover: draw dim wires first (faint background), then bright on top.
		_drawBranchWires("dim");
		_drawBranchWires("bright");
	} else {
		_drawBranchWires(null);
	}

	// PASS 2: Single group port branch wires (1 port per group).
	// When highlighting: draw per-cable for accurate path-specific highlighting.
	// When idle: draw all wires at normal alpha.
	if (cfg.highlightedNodeId) {
		// Per-cable drawing with 2 sub-passes: dim first, bright on top.
		const _drawGpbWires = (filterHL: "dim" | "bright") => {
			for (const cable of cables) {
				_drawSingleIntraCableGpb(
					g,
					cable,
					cfg,
					densityScale,
					portColorLanes,
					filterHL,
					getBranchHighlight,
					zoomFade,
				);
			}
		};
		_drawGpbWires("dim");
		_drawGpbWires("bright");
	} else {
		for (const cable of cables) {
			_drawSingleIntraCableGpb(g, cable, cfg, densityScale, portColorLanes, null, getBranchHighlight, zoomFade);
		}
	}
}

// Intra-group cable cache — now stored in _cache

// PortLaneInfo, PortColorLanes, buildPortColorLanes, getPortLaneEndpoint
// moved to CableTrayRenderer.ts

/**
 * Draw a single trunk's wires with lane offsets and port coupling.
 * Merges same-colored cables into a single wire lane.
 */
function _drawSingleTrunk(
	g: CanvasGraphics,
	trunk: Trunk,
	cfg: EdgeDrawConfig,
	densityScale: number,
	laneSpacing: number,
	portColorLanes: PortColorLanes | undefined,
	filterHighlight: "bright" | "dim" | "normal" | null,
): void {
	const p0 = trunk.path[0],
		pN = trunk.path[trunk.path.length - 1];
	const tdx = pN.x - p0.x,
		tdy = pN.y - p0.y;
	const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
	const perpX = tlen > 0 ? -tdy / tlen : 0;
	const perpY = tlen > 0 ? tdx / tlen : 1;

	const colorMap = new Map<number, GraphEdge[]>();
	for (const cable of trunk.cables) {
		const existing = colorMap.get(cable.color);
		if (existing) {
			existing.push(...cable.edges);
		} else {
			colorMap.set(cable.color, [...cable.edges]);
		}
	}

	// When highlighting, check per-EDGE (not per-color) to avoid lighting up
	// unrelated wires that happen to share the same color.
	const uniqueColors = [...colorMap.keys()];
	const nUnique = uniqueColors.length;

	// Look up port lane endpoints for coupling with groupPortBranch wires
	const srcLane = portColorLanes?.get(trunk.srcGroup);
	const tgtLane = portColorLanes?.get(trunk.tgtGroup);

	// When colorEdgesByRelation is off, flatten all wires to a single neutral color
	const neutralColor = cfg.isDark ? 0x888888 : 0x666666;
	const useRelColor = cfg.colorEdgesByRelation;
	// High contrast: thicken wires
	const hcMul = cfg.highContrast ? 2 : 1;

	for (let ci = 0; ci < nUnique; ci++) {
		const rawColor = uniqueColors[ci];
		const color = useRelColor ? rawColor : neutralColor;
		const wireEdges = colorMap.get(rawColor)!;

		const off = (ci - (nUnique - 1) / 2) * laneSpacing;
		const ox = perpX * off,
			oy = perpY * off;

		// Build wire path: uniform perp offset, but snap first/last to
		// PortColorLanes endpoints so trunk and groupPortBranch couple.
		const _buildTrunkWirePath = (): { x: number; y: number }[] => {
			const wp = trunk.path.map((p) => ({ x: p.x + ox, y: p.y + oy }));
			const srcEp = srcLane ? getPortLaneEndpoint(srcLane, color, laneSpacing) : null;
			const tgtEp = tgtLane ? getPortLaneEndpoint(tgtLane, color, laneSpacing) : null;
			if (srcEp) wp[0] = srcEp;
			if (tgtEp) wp[wp.length - 1] = tgtEp;
			return wp;
		};

		const fadeMul = cableFadeByDegree(wireEdges, cfg);
		const baseWireW = cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH;
		const baseWireA = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;
		// Zoom-adaptive wire thickness: thicken at zoom-out for color visibility
		const ws = cfg.worldScale ?? 1;
		const zoomThicken = ws < 0.5 ? Math.min(2.5, 1 / (ws * 2)) : 1;
		const wireWidth = (baseWireW + cableWeightThickness(wireEdges, cfg)) * zoomThicken * hcMul;

		if (cfg.highlightedNodeId) {
			// An edge is "bright" when either endpoint is in the highlight set (BFS neighbors).
			const brightEdges: GraphEdge[] = [];
			const dimEdges: GraphEdge[] = [];
			for (const e of wireEdges) {
				const sid = edgeSourceId(e);
				const tid = edgeTargetId(e);
				if (cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid)) {
					brightEdges.push(e);
				} else {
					dimEdges.push(e);
				}
			}

			if (dimEdges.length > 0 && (filterHighlight === null || filterHighlight === "dim")) {
				const dimAlpha = Math.max(
					(cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA) * fadeMul * densityScale,
					0.05,
				);
				_drawSmoothPath(g, _buildTrunkWirePath(), wireWidth, color, dimAlpha);
			}
			if (brightEdges.length > 0 && (filterHighlight === null || filterHighlight === "bright")) {
				const brightAlpha = (cfg.highlightEdgeAlpha ?? 1.0) * fadeMul;
				_drawSmoothPath(g, _buildTrunkWirePath(), wireWidth, color, brightAlpha);
			}
		} else {
			if (filterHighlight !== null && filterHighlight !== "normal") continue;
			// Cable-tray wires need higher minimum alpha than regular edges
			// to maintain color differentiation at high edge counts
			const wireAlpha = Math.max(baseWireA * fadeMul * densityScale, 0.35);
			_drawSmoothPath(g, _buildTrunkWirePath(), wireWidth, color, wireAlpha);
		}
	}
}

/**
 * Draw trunks in 3 passes: conduit background, cable conduits, then wires.
 * Uses existing _drawSmoothPath for all rendering.
 */
function drawTrunks(
	g: CanvasGraphics,
	trunks: Trunk[],
	cfg: EdgeDrawConfig,
	densityScale: number,
	portColorLanes?: PortColorLanes,
	onlyHighlight?: "bright",
): void {
	if (trunks.length === 0) return;

	// All layers use native=true (screen pixels) for consistent visibility at any zoom.
	// Layer widths: Trunk(12px) > Cable(6px) > Wire(1.5px) — clearly distinguishable.

	// Highlight helper
	const getTrunkHighlight = (trunk: Trunk): "normal" | "bright" | "dim" => {
		if (!cfg.highlightedNodeId) return "normal";
		for (const cable of trunk.cables) {
			for (const e of cable.edges) {
				if (cfg.highlightSet.has(edgeSourceId(e)) || cfg.highlightSet.has(edgeTargetId(e))) return "bright";
			}
		}
		return "dim";
	};

	// Configurable cable rendering parameters (from panel sliders, fallback to constants)
	const cfgTrunkWidth = cfg.cableTrunkWidth ?? TRUNK_SCREEN_WIDTH;
	const cfgTrunkAlpha = cfg.cableTrunkAlpha ?? TRUNK_CONDUIT_ALPHA;
	const cfgLaneSpacing = cfg.cableSpacing ?? CABLE_LANE_SPACING;
	const cfgWireWidth = cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH;
	const cfgWireAlpha = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;
	const laneSpacing = cfgLaneSpacing;

	// PASS 1: Trunk conduits — width adapts to cable count so all lanes fit inside.
	// Alpha scales inversely with trunk count to prevent overdrawn white bands
	// where many trunks overlap (e.g., through dense node rows).
	const trunkCountAlpha = trunks.length <= 5 ? 1.0 : trunks.length <= 20 ? 0.5 : trunks.length <= 100 ? 0.25 : 0.12;
	for (const trunk of trunks) {
		// Use unique color count for width (merged same-color cables share a lane)
		const trunkColorSet = new Set<number>();
		for (const c of trunk.cables) trunkColorSet.add(c.color);
		const trunkWidth = Math.max(trunkColorSet.size * laneSpacing + CABLE_SCREEN_WIDTH, cfgTrunkWidth);
		if (cfgTrunkAlpha > 0) {
			const highlight = getTrunkHighlight(trunk);
			const trunkAlpha = highlight === "dim" ? 0.02 : highlight === "bright" ? 0.2 : cfgTrunkAlpha;
			// Use dominant cable color instead of hardcoded gray for trunk conduit
			let dominantColor = 0x888888;
			let maxEdgeCount = 0;
			for (const c of trunk.cables) {
				if (c.edges.length > maxEdgeCount) {
					maxEdgeCount = c.edges.length;
					dominantColor = c.color;
				}
			}
			_drawSmoothPath(g, trunk.path, trunkWidth, dominantColor, trunkAlpha * densityScale * trunkCountAlpha);
		}
	}

	// PASS 2: Wires — colored, directly inside trunk conduit (no cable sub-conduits).
	// Merge same-colored cables into a single wire lane to avoid duplicates.
	// When highlighting, draw dim first then bright on top for z-order.
	const _drawTrunkWires = (filterHighlight: "bright" | "dim" | "normal" | null) => {
		for (const trunk of trunks) {
			_drawSingleTrunk(g, trunk, cfg, densityScale, laneSpacing, portColorLanes, filterHighlight);
		}
	};

	if (onlyHighlight === "bright") {
		// Called as final pass — only draw bright wires
		_drawTrunkWires("bright");
	} else if (cfg.highlightedNodeId) {
		// During hover: draw dim wires first (faint background), then bright on top
		_drawTrunkWires("dim");
		_drawTrunkWires("bright");
	} else {
		_drawTrunkWires(null);
	}
}

// ---------------------------------------------------------------------------
// (legacy cable bundling removed — replaced by trunk model above)
// ---------------------------------------------------------------------------

/**
 * Draw a smooth path with quadratic curves at direction changes.
 * Returns without drawing if path has fewer than 2 points.
 */
function _drawSmoothPath(
	g: CanvasGraphics,
	path: { x: number; y: number }[],
	width: number,
	color: number,
	alpha: number,
	native = true,
): void {
	if (path.length < 2) return;
	g.lineStyle({ width, color, alpha, native });
	g.moveTo(path[0].x, path[0].y);
	for (let i = 1; i < path.length; i++) {
		const prev = path[i - 1];
		const cur = path[i];
		const next = i < path.length - 1 ? path[i + 1] : null;
		if (next) {
			const dx1 = cur.x - prev.x,
				dy1 = cur.y - prev.y;
			const dx2 = next.x - cur.x,
				dy2 = next.y - cur.y;
			const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
			const dot = Math.abs(dx1 * dx2 + dy1 * dy2);
			if (cross > 0.1 * (dot + 1)) {
				const mx = (cur.x + next.x) / 2,
					my = (cur.y + next.y) / 2;
				g.quadraticCurveTo(cur.x, cur.y, mx, my);
			} else {
				g.lineTo(cur.x, cur.y);
			}
		} else {
			g.lineTo(cur.x, cur.y);
		}
	}
}

// ---------------------------------------------------------------------------
// Direction bundle cache — now stored in _cache
// ---------------------------------------------------------------------------
/** Recompute bundles every Nth frame during animation (reduces cost by ~66%) */
const BUNDLE_SKIP = 3;

// Trunk bundling cache — now stored in _cache

/** Mark the direction bundle cache as stale (call when edges, visibility, or
 *  layout change significantly — e.g. toggling edge types, loading new data). */
export function invalidateBundleCache(cache?: EdgeRenderCache): void {
	(cache ?? _cache).invalidateBundles();
	invalidatePathCache();
}

// ---------------------------------------------------------------------------
// Edge style resolution — alpha and line thickness per edge
// ---------------------------------------------------------------------------

/** Resolved visual style for a single edge */
export interface EdgeStyle {
	alpha: number;
	lineThick: number;
	isHighlighted?: boolean;
}

/**
 * Compute alpha and line thickness for a single edge based on type,
 * relation coloring, degree fading, edge weight, and hover highlight.
 */
export function resolveEdgeStyle(
	e: GraphEdge,
	src: Pos,
	tgt: Pos,
	cfg: EdgeDrawConfig,
	densityScale: number,
	pairCount: Map<string, number> | null,
): EdgeStyle {
	const isOnto = e.type === EDGE_TYPE_INHERITANCE || e.type === EDGE_TYPE_AGGREGATION;
	const isSimilar = e.type === EDGE_TYPE_SIMILAR;
	const isBreadcrumbs = e.type === EDGE_TYPE_SIBLING || e.type === EDGE_TYPE_SEQUENCE;
	const isStructural = isOnto || e.type === EDGE_TYPE_HAS_TAG || isSimilar || isBreadcrumbs;
	let alpha = (isStructural ? STRUCTURAL_EDGE_ALPHA : NON_STRUCTURAL_EDGE_ALPHA) * densityScale;
	let lineThick = DEFAULT_LINE_THICKNESS;

	// Edge weight: thicken based on same source-target pair count
	if (pairCount) {
		const pairKey = [e.source, e.target].sort().join(":");
		const weight = pairCount.get(pairKey) ?? 1;
		lineThick = DEFAULT_LINE_THICKNESS + Math.log2(weight) * WEIGHT_THICKNESS_FACTOR;
		// Slightly increase alpha for heavy edges
		if (weight > 2) alpha *= Math.min(1.3, 1 + (weight - 2) * 0.05);
	}

	if (!isOnto && e.relation && cfg.colorEdgesByRelation) alpha = RELATION_COLOR_ALPHA * densityScale;

	// Fade by source node degree: low-degree -> faint, high-degree -> opaque
	if (cfg.fadeByDegree && cfg.maxDegree > 0) {
		const sid = src.id ?? (e.source as string);
		const tid = tgt.id ?? (e.target as string);
		const srcDeg = cfg.degrees.get(sid) ?? 0;
		const tgtDeg = cfg.degrees.get(tid) ?? 0;
		const minDeg = Math.min(srcDeg, tgtDeg);
		// sqrt normalization: 0->MIN_ALPHA, maxDegree->base alpha
		const t = Math.sqrt(minDeg / cfg.maxDegree);
		alpha *= FADE_BY_DEGREE_MIN_ALPHA + (1 - FADE_BY_DEGREE_MIN_ALPHA) * t;
	}

	// Edge strength glow: scale width by target node in-degree
	if (cfg.edgeStrengthGlow && cfg.maxDegree > 0) {
		const tid = tgt.id ?? (e.target as string);
		const targetDeg = cfg.degrees.get(tid) ?? 0;
		const t = Math.min(1, targetDeg / cfg.maxDegree);
		const glowMin = cfg.edgeStrengthGlowMin ?? 0.5;
		const glowMax = cfg.edgeStrengthGlowMax ?? 3.0;
		lineThick *= glowMin + t * (glowMax - glowMin);
	}

	// Track whether this edge is actively highlighted (hovered node's connection)
	let isHighlighted = false;

	if (cfg.highlightedNodeId) {
		const sid = src.id ?? (e.source as string);
		const tid = tgt.id ?? (e.target as string);
		// An edge is highlighted when at least one endpoint is in the highlight set
		const highlighted = cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid);
		if (highlighted) {
			lineThick *= HIGHLIGHT_THICKNESS_MULTIPLIER;
			alpha = cfg.highlightEdgeAlpha ?? 1.0;
			isHighlighted = true;
		} else if (cfg.hoverDistMap && cfg.hoverDistMap.size > 0) {
			// DS: Distance-based edge alpha — use minimum distance of endpoints
			const dS = cfg.hoverDistMap.get(sid);
			const dT = cfg.hoverDistMap.get(tid);
			if (dS !== undefined || dT !== undefined) {
				const minDist = Math.min(dS ?? 99, dT ?? 99);
				// HT: configurable hover edge falloff (default 0.6)
				const falloff = cfg.hoverEdgeFalloff ?? 0.6;
				alpha = Math.max(cfg.edgeHoverFalloffMinAlpha ?? 0.08, Math.pow(falloff, minDist));
			} else {
				alpha = cfg.highlightEdgeNonMatchAlpha ?? 0.04;
			}
		} else {
			alpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;
		}
	}

	// A11y: High contrast mode — double line thickness for visibility
	if (cfg.highContrast) {
		lineThick *= 2;
		alpha = Math.min(1, alpha * 1.3);
	}

	// Zoom-adaptive edge thickness: maintain minimum visible thickness at zoom-out.
	// Old behavior thinned edges → color indistinguishable. New: floor at 60% of base.
	// Skip zoom fade for highlighted edges — they should stay prominent at any zoom.
	const ws = cfg.worldScale ?? 1;
	const fadeZ = cfg.edgeZoomFadeThreshold ?? 0.5;
	const fadeFloor = cfg.edgeFadeMinAlpha ?? 0.25;
	if (ws < fadeZ && !isHighlighted) {
		lineThick *= Math.max(0.6, ws / fadeZ);
	}

	// Zoom-adaptive edge type fade: non-structural edges fade earlier at zoom-out
	// Skip for highlighted edges — hover emphasis overrides zoom fade.
	if (!isHighlighted) {
		if (ws < fadeZ && (isSimilar || e.type === EDGE_TYPE_HAS_TAG)) {
			alpha *= Math.max(fadeFloor, ws / fadeZ);
		} else if (ws < fadeZ * 0.6 && isBreadcrumbs) {
			alpha *= Math.max(fadeFloor * 2, ws / (fadeZ * 0.6));
		}
	}

	// GG: Apply global edge alpha multiplier (skip for highlighted — hover takes priority)
	if (cfg.globalEdgeAlpha != null && cfg.globalEdgeAlpha < 1 && !isHighlighted) {
		alpha *= cfg.globalEdgeAlpha;
	}
	return { alpha, lineThick, isHighlighted };
}

// ---------------------------------------------------------------------------
// Dash pattern helpers
// ---------------------------------------------------------------------------

/** Apply a dash pattern based on edge type. Returns true if a dash was set. */
/** Get the dash pattern multipliers for an edge type. Returns null for solid lines. */
export function getDashPattern(edgeType: string): number[] | null {
	switch (edgeType) {
		case "semantic":
			return [4, 4]; // .... even dots
		case EDGE_TYPE_TAG:
		case EDGE_TYPE_HAS_TAG:
			return [8, 3]; // ─── ─── long dash
		case EDGE_TYPE_SIMILAR:
			return [3, 5]; // ·· ·· short dash
		case EDGE_TYPE_SEQUENCE:
			return [6, 2, 2, 2]; // ──·──· dash-dot (A11y: colorblind-friendly)
		case EDGE_TYPE_SIBLING:
			return [2, 2]; // ·· ·· fine dots (A11y: colorblind-friendly)
		default:
			return null; // link, inheritance, aggregation = solid line
	}
}

function applyDashPattern(g: CanvasGraphics, e: GraphEdge, lineThick: number): boolean {
	const pattern = getDashPattern(e.type ?? "");
	if (!pattern) return false;
	g.setLineDash(pattern.map((m) => m * lineThick));
	return true;
}

// ---------------------------------------------------------------------------
// Edge segment drawing — geometry path per layout mode
// ---------------------------------------------------------------------------

/**
 * Draw the edge path (line or curve) based on the active layout mode.
 * Chooses between straight lines, direction-bundle curves, and arc curves.
 */
function drawEdgeSegment(
	g: CanvasGraphics,
	src: Pos,
	tgt: Pos,
	e: GraphEdge,
	lineColor: number,
	isArcLayout: boolean,
	bundles: Map<string, BundleGroup> | null,
	bundleStrength: number,
	roadNetwork?: RoadNetwork | null,
	cache: EdgeRenderCache = _cache,
): void {
	// Road routing: all edge types follow roads when available.
	// Waypoints are connected with smooth quadratic curves (not straight segments)
	// to avoid ugly L-shaped paths from Dijkstra routing on grids.
	if (roadNetwork && roadNetwork.intersections.length > 0 && !isArcLayout) {
		const srcId = edgeSourceId(e);
		const tgtId = edgeTargetId(e);
		// Cache route lookups (invalidate when network reference changes)
		if (roadNetwork !== cache.roadRouteNetwork) {
			cache.roadRoute.clear();
			cache.roadRouteNetwork = roadNetwork;
		}
		const cacheKey = srcId < tgtId ? `${srcId}|${tgtId}` : `${tgtId}|${srcId}`;
		let waypoints = cache.roadRoute.get(cacheKey);
		if (!waypoints) {
			waypoints = routeEdge(roadNetwork, srcId, tgtId);
			cache.roadRoute.set(cacheKey, waypoints);
		}
		if (waypoints.length >= 2) {
			// Build full point sequence: source → waypoints → target
			const pts = [src, ...waypoints, tgt];
			g.moveTo(pts[0].x, pts[0].y);
			// Draw smooth curve through waypoints using Catmull-Rom → quadratic conversion
			for (let i = 1; i < pts.length - 1; i++) {
				const cpx = pts[i].x;
				const cpy = pts[i].y;
				const nx = (pts[i].x + pts[i + 1].x) / 2;
				const ny = (pts[i].y + pts[i + 1].y) / 2;
				g.quadraticCurveTo(cpx, cpy, nx, ny);
			}
			// Final segment to target
			const last = pts[pts.length - 1];
			g.lineTo(last.x, last.y);
			return;
		}
		// Fallback if no route found: straight line
	}

	const isSimilar = e.type === EDGE_TYPE_SIMILAR;

	if (isSimilar) {
		g.moveTo(src.x, src.y);
		g.lineTo(tgt.x, tgt.y);
	} else if (bundles && !isArcLayout) {
		drawBundledSegment(g, src, tgt, lineColor, bundles, bundleStrength);
	} else if (isArcLayout) {
		const mx = (src.x + tgt.x) / 2;
		const minY = Math.min(src.y, tgt.y);
		const dist = Math.abs(tgt.x - src.x);
		const cpY = minY - dist * ARC_CP_HEIGHT_FACTOR - ARC_CP_VERTICAL_OFFSET;
		g.moveTo(src.x, src.y);
		g.quadraticCurveTo(mx, cpY, tgt.x, tgt.y);
	} else {
		// Slight curve instead of straight line — perpendicular offset at midpoint
		const edx = tgt.x - src.x,
			edy = tgt.y - src.y;
		const elen = Math.sqrt(edx * edx + edy * edy);
		if (elen < 1) {
			g.moveTo(src.x, src.y);
			g.lineTo(tgt.x, tgt.y);
		} else {
			const sag = elen * 0.08; // 8% of length
			const perpX = -edy / elen;
			const perpY = edx / elen;
			const cpx = (src.x + tgt.x) / 2 + perpX * sag;
			const cpy = (src.y + tgt.y) / 2 + perpY * sag;
			g.moveTo(src.x, src.y);
			g.quadraticCurveTo(cpx, cpy, tgt.x, tgt.y);
		}
	}
}

/**
 * Draw a direction-bundled edge segment. Computes the bundle group key
 * from angle bin + grid cell and curves toward the group centroid.
 */
function drawBundledSegment(
	g: CanvasGraphics,
	src: Pos,
	tgt: Pos,
	lineColor: number,
	bundles: Map<string, BundleGroup>,
	bundleStrength: number,
): void {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const len2 = dx * dx + dy * dy;
	if (len2 < 1) {
		g.moveTo(src.x, src.y);
		g.lineTo(tgt.x, tgt.y);
		return;
	}

	const angle = normalizeAngle(Math.atan2(dy, dx));
	const bin = Math.min(Math.floor(angle / BIN_WIDTH), ANGLE_BINS - 1);
	const mx = (src.x + tgt.x) / 2;
	const my = (src.y + tgt.y) / 2;
	const gx = Math.floor(mx / GRID_CELL);
	const gy = Math.floor(my / GRID_CELL);
	const key = `${gx},${gy}|${bin}|${lineColor}`;
	const group = bundles.get(key);

	if (group) {
		const cx = mx + (group.cx - mx) * bundleStrength;
		const cy = my + (group.cy - my) * bundleStrength;
		g.moveTo(src.x, src.y);
		g.quadraticCurveTo(cx, cy, tgt.x, tgt.y);
	} else {
		g.moveTo(src.x, src.y);
		g.lineTo(tgt.x, tgt.y);
	}
}

// ---------------------------------------------------------------------------
// Edge markers and arrows — post-segment decorations
// ---------------------------------------------------------------------------

/**
 * Draw all post-segment decorations for a single edge: ontology markers,
 * sequence arrows, generic arrows, and cardinality markers.
 */
function drawEdgeDecorations(
	g: CanvasGraphics,
	e: GraphEdge,
	src: Pos,
	tgt: Pos,
	lineColor: number,
	alpha: number,
	cfg: EdgeDrawConfig,
	arrowGfx?: CanvasGraphics | null,
): void {
	const isOnto = e.type === EDGE_TYPE_INHERITANCE || e.type === EDGE_TYPE_AGGREGATION;

	// Ontology markers (inheritance triangle / aggregation diamond)
	if (isOnto) {
		drawEdgeMarker(
			g,
			src,
			tgt,
			e.type as typeof EDGE_TYPE_INHERITANCE | typeof EDGE_TYPE_AGGREGATION,
			lineColor,
			alpha,
			cfg.bgColor,
		);
	}

	// Sequence arrow (next/prev direction)
	if (e.type === EDGE_TYPE_SEQUENCE) {
		drawSequenceArrow(g, src, tgt, lineColor, alpha);
	}

	// Generic directional arrow (skip edges that already have their own markers)
	if (cfg.showArrows && e.type !== EDGE_TYPE_SEQUENCE && !isOnto && arrowGfx) {
		const tgtR = cfg.nodeRadii?.get(e.target) ?? 4;
		drawGenericArrow(arrowGfx, src, tgt, lineColor, Math.max(alpha, 0.5), tgtR, cfg.worldScale ?? 1);
	}

	// Cardinality markers (crow's foot notation)
	if (cfg.edgeCardinalityMode === "crowsfoot") {
		const rule = resolveCardinality(e, cfg.cardinalityRules ?? []);
		if (rule) {
			const srcR = cfg.nodeRadii?.get(edgeSourceId(e)) ?? 4;
			const tgtR = cfg.nodeRadii?.get(edgeTargetId(e)) ?? 4;
			const cardCfg = { ...DEFAULT_CARDINALITY_RENDER_CONFIG, ...(cfg.cardinalityRenderConfig ?? {}) };
			drawCardinalityMarker(g, src, tgt, rule.sourceCardinality, lineColor, alpha, srcR, cardCfg);
			drawCardinalityMarker(g, tgt, src, rule.targetCardinality, lineColor, alpha, tgtR, cardCfg);
		}
	}
}

// ---------------------------------------------------------------------------
// Density scale computation
// ---------------------------------------------------------------------------

/**
 * Compute the density-based alpha scale factor.
 * Reduces edge opacity as edge count grows to keep the graph readable.
 * Also applies zoom-out fade at extreme zoom levels.
 */
export function computeDensityScale(
	cfg: Pick<EdgeDrawConfig, "worldScale" | "edgeDensityFloor">,
	edgeCount: number,
): number {
	const densityScaleBase =
		edgeCount <= DENSITY_FULL_ALPHA_THRESHOLD
			? 1
			: edgeCount <= DENSITY_GENTLE_THRESHOLD
				? 1 -
					DENSITY_GENTLE_REDUCTION *
						((edgeCount - DENSITY_FULL_ALPHA_THRESHOLD) /
							(DENSITY_GENTLE_THRESHOLD - DENSITY_FULL_ALPHA_THRESHOLD))
				: edgeCount <= DENSITY_AGGRESSIVE_THRESHOLD
					? DENSITY_AGGRESSIVE_MID_ALPHA -
						DENSITY_AGGRESSIVE_REDUCTION *
							((edgeCount - DENSITY_GENTLE_THRESHOLD) /
								(DENSITY_AGGRESSIVE_THRESHOLD - DENSITY_GENTLE_THRESHOLD))
					: DENSITY_MIN_ALPHA;
	// At extreme zoom-out (scale < ZOOM_FADE_THRESHOLD), further reduce alpha so edges don't
	// obscure nodes rendered with min-radius inflation.
	const ws = cfg.worldScale ?? 1;
	const zoomFade = ws >= ZOOM_FADE_THRESHOLD ? 1 : Math.max(ZOOM_FADE_MIN_ALPHA, ws / ZOOM_FADE_THRESHOLD);
	return Math.max(cfg.edgeDensityFloor ?? DEFAULT_DENSITY_FLOOR, densityScaleBase * zoomFade);
}

// ---------------------------------------------------------------------------
// Pre-computation helpers (extracted from drawEdges for readability)
// ---------------------------------------------------------------------------

/** Build edge pair counts for weight-based thickness rendering. */
export function buildPairCounts(edges: GraphEdge[]): Map<string, number> {
	const pairCount = new Map<string, number>();
	for (const e of edges) {
		const key = [e.source, e.target].sort().join(":");
		incCounter(pairCount, key);
	}
	return pairCount;
}

/** Compute direction x color bundles for highway-style edge merging (cached). */
function prepareBundles(
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
	cache: EdgeRenderCache = _cache,
): Map<string, BundleGroup> | null {
	const bundleStrength = cfg.bundleStrength;
	if (bundleStrength <= 0) return null;

	cache.bundleFrameCount++;
	if (cache.bundleDirty || !cache.bundle || cache.bundleFrameCount >= BUNDLE_SKIP) {
		cache.bundle = buildDirectionBundles(edges, resolvePos, cfg);
		cache.bundleDirty = false;
		cache.bundleFrameCount = 0;
	}
	return cache.bundle;
}

// computePolarCenter, CablePrepResult moved to CableTrayRenderer.ts

/**
 * Prepare cable trunks and intra-group cables (cached).
 * Updates cache.cable, cache.intraCable, cache.portColorLanes as needed.
 */
function prepareCables(
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
	cache: EdgeRenderCache = _cache,
): CablePrepResult {
	const clustersAvailable = !!(cfg.nodeClusterMap && cfg.clusterCentroids && cfg.clusterRadii);
	const cableMode = cfg.cableBundleMode ?? "auto";
	const hasClusters = cableMode === "never" ? false : cableMode === "always" ? true : clustersAvailable;

	if (!hasClusters) {
		return { hasClusters: false, cabledEdgeIds: new Set<string>(), intraHandledIds: new Set<string>() };
	}

	// Auto-invalidate when centroid count changes or on bundle skip cycle
	// (ensures cable paths update as nodes spread during simulation)
	const curCentroidCount = cfg.clusterCentroids?.size ?? 0;
	if (curCentroidCount !== cache.cableCentroidCount) {
		cache.cableDirty = true;
		cache.intraCableDirty = true;
		cache.portColorLanes = null;
		cache.cableCentroidCount = curCentroidCount;
	}
	if (cache.bundleFrameCount === 0) {
		cache.cableDirty = true;
		cache.intraCableDirty = true;
		cache.portColorLanes = null;
	}

	const polarCenter = computePolarCenter(cfg);

	if (cache.cableDirty || !cache.cable) {
		// Pre-compute group ports for buildTrunks
		const centroids = cfg.clusterCentroids!;
		const radii = cfg.clusterRadii!;
		const groupKeys = new Set(cfg.nodeClusterMap!.values());
		// Build connection map from edges (which groups connect to which)
		const connections = new Map<string, Set<string>>();
		for (const e of edges) {
			const sg = cfg.nodeClusterMap!.get(edgeSourceId(e));
			const tg = cfg.nodeClusterMap!.get(edgeTargetId(e));
			if (!sg || !tg || sg === tg) continue;
			if (!connections.has(sg)) connections.set(sg, new Set());
			if (!connections.has(tg)) connections.set(tg, new Set());
			connections.get(sg)!.add(tg);
			connections.get(tg)!.add(sg);
		}
		cache.groupBBox.clear(); // clear bbox cache when recomputing ports
		const allGroupPorts = computeGroupPorts(
			groupKeys,
			centroids,
			radii,
			connections,
			cfg.coordinateSystem,
			polarCenter,
			resolvePos,
			cfg.nodeClusterMap ?? undefined,
			cache,
		);
		cache.cachedGroupPorts = allGroupPorts;
		cache.cable = buildTrunks(edges, resolvePos, cfg, allGroupPorts);
		cache.cableDirty = false;
	}

	const cabledEdgeIds = cache.cable.cabledEdgeIds;

	// Intra-group cable wiring
	let intraHandledIds = new Set<string>();
	if (cache.cable) {
		if (cache.intraCableDirty || !cache.intraCable) {
			// Compute group ports for intra-group cables
			if (!cache.cachedGroupPorts) {
				const centroids = cfg.clusterCentroids!;
				const radii = cfg.clusterRadii!;
				const connections = new Map<string, Set<string>>();
				for (const trunk of cache.cable.trunks) {
					if (!connections.has(trunk.srcGroup)) connections.set(trunk.srcGroup, new Set());
					if (!connections.has(trunk.tgtGroup)) connections.set(trunk.tgtGroup, new Set());
					connections.get(trunk.srcGroup)!.add(trunk.tgtGroup);
					connections.get(trunk.tgtGroup)!.add(trunk.srcGroup);
				}
				const groupKeys = new Set(cfg.nodeClusterMap!.values());
				const pc = computePolarCenter(cfg);
				cache.cachedGroupPorts = computeGroupPorts(
					groupKeys,
					centroids,
					radii,
					connections,
					cfg.coordinateSystem,
					pc,
					resolvePos,
					cfg.nodeClusterMap ?? undefined,
					cache,
				);
			}
			cache.intraCable = buildIntraGroupCables(edges, resolvePos, cfg, cache.cachedGroupPorts, cache);
			cache.intraCableDirty = false;
			cache.portColorLanes = null; // invalidate shared mapping
		}

		// Build shared port color lane mapping (after both caches are ready)
		if (!cache.portColorLanes && cache.cachedGroupPorts) {
			cache.portColorLanes = buildPortColorLanes(
				cache.cable.trunks,
				cache.intraCable.cables,
				cfg,
				cache.cachedGroupPorts,
			);
		}

		intraHandledIds = cache.intraCable.handledEdgeIds;
	}

	return { hasClusters, cabledEdgeIds, intraHandledIds };
}

/**
 * Draw cable trunks and intra-group cables into the graphics context.
 * Separated from prepareCables so that cache computation and drawing are distinct phases.
 */
function drawCables(
	g: CanvasGraphics,
	cfg: EdgeDrawConfig,
	densityScale: number,
	cablePrep: CablePrepResult,
	cache: EdgeRenderCache = _cache,
): void {
	if (cablePrep.hasClusters && cache.cable) {
		// Draw all cable wires. When highlighting, drawTrunks and drawIntraGroupCables
		// internally do 2-pass (dim first, bright on top) for z-order.
		if (cache.cable.trunks.length > 0) {
			drawTrunks(g, cache.cable.trunks, cfg, densityScale, cache.portColorLanes ?? undefined);
		}
		if (cache.intraCable && cache.intraCable.cables.length > 0) {
			drawIntraGroupCables(g, cache.intraCable.cables, cfg, densityScale, cache.portColorLanes ?? undefined);
		}
		// Final bright pass: redraw bright trunk wires on top of everything
		if (cfg.highlightedNodeId && cache.cable.trunks.length > 0) {
			drawTrunks(g, cache.cable.trunks, cfg, densityScale, cache.portColorLanes ?? undefined, "bright");
		}
	} else if (cache.cable && cache.cable.trunks.length > 0) {
		drawTrunks(g, cache.cable.trunks, cfg, densityScale);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw all edges into a single CanvasGraphics batch.
 *
 * @param g          - The CanvasGraphics to draw into (will be cleared first)
 * @param edges      - The graph edges to draw
 * @param resolvePos - Resolves a source/target reference to a position
 * @param cfg        - Drawing configuration
 */
export function drawEdges(
	g: CanvasGraphics,
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
	arrowGfx?: CanvasGraphics | null,
	cache?: EdgeRenderCache,
): void {
	const c = cache ?? _cache;
	// Skip edge drawing at extreme zoom-out for performance.
	// Use visibility toggle instead of clear() to preserve draw commands
	// for instant recovery when zooming back in.
	const ws = cfg.worldScale ?? 1;
	const edgeMinZoom = cfg.edgeMinZoom ?? 0;
	if (edgeMinZoom > 0 && ws < edgeMinZoom) {
		g.visible = false;
		if (arrowGfx) arrowGfx.visible = false;
		return;
	}
	g.visible = true;
	if (arrowGfx) arrowGfx.visible = true;

	g.clear();
	if (arrowGfx) arrowGfx.clear();

	// Pre-compute bidirectional set if direction filter or indicator is active
	const needsBidir = cfg.edgeDirectionFilter && cfg.edgeDirectionFilter !== "all";
	cfg._bidirectionalSet = needsBidir ? buildBidirectionalSet(edges) : undefined;

	// Pre-filter edges once — all downstream functions use this filtered list,
	// avoiding 9 redundant shouldSkipEdge/shouldSkipByDirection iterations.
	const filtered = edges.filter((e) => !shouldSkipEdge(e, cfg) && !shouldSkipByDirection(e, cfg));

	const { colorEdgesByRelation: useRelColor } = cfg;
	// Disable arc curves when edge count is high to avoid vertex buffer explosion.
	// quadraticCurveTo generates ~20 vertices per edge vs 4 for lineTo.
	const isArcLayout = cfg.isArcLayout && filtered.length < (cfg.arcMaxEdgeCount ?? ARC_MAX_EDGE_COUNT);

	const edgeCount = cfg.totalEdgeCount ?? edges.length;
	const densityScale = computeDensityScale(cfg, edgeCount);

	// Pre-compute edge pair counts for weight-based thickness
	const pairCount = cfg.edgeWeightThickness ? buildPairCounts(filtered) : null;

	// Pre-compute direction x color bundles for highway-style edge merging
	const bundles = prepareBundles(filtered, resolvePos, cfg, c);
	// Zoom-adaptive bundling: increase strength at zoom-out for visual tidiness
	const edgeFadeZ = cfg.edgeZoomFadeThreshold ?? 0.5;
	const zoomBoost = ws < edgeFadeZ ? Math.min(0.3, (edgeFadeZ - ws) * 0.6) : 0;
	const bundleStrength = Math.min(1, cfg.bundleStrength + zoomBoost);

	// Cable trunks and intra-group cables
	const cablePrep = prepareCables(filtered, resolvePos, cfg, c);
	drawCables(g, cfg, densityScale, cablePrep, c);

	// レイヤー分離モード: 種別ごとに描画パスを分けて z-order を制御
	if (cfg.edgeLayerMode) {
		_drawEdgesLayered(
			g,
			filtered,
			resolvePos,
			cfg,
			useRelColor,
			isArcLayout,
			densityScale,
			pairCount,
			bundles,
			bundleStrength,
			cablePrep,
			arrowGfx,
			c,
		);
	} else {
		_drawEdgesSinglePass(
			g,
			filtered,
			resolvePos,
			cfg,
			useRelColor,
			isArcLayout,
			densityScale,
			pairCount,
			bundles,
			bundleStrength,
			cablePrep,
			arrowGfx,
			c,
		);
	}
}

/** 単一パス描画 (従来動作) */
function _drawEdgesSinglePass(
	g: CanvasGraphics,
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
	useRelColor: boolean,
	isArcLayout: boolean,
	densityScale: number,
	pairCount: Map<string, number> | null,
	bundles: Map<string, BundleGroup> | null,
	bundleStrength: number,
	cablePrep: CablePrepResult,
	arrowGfx?: CanvasGraphics | null,
	cache: EdgeRenderCache = _cache,
): void {
	// Viewport culling bounds (world coords) — skip edges where BOTH endpoints are off-screen
	const ws = cfg.worldScale ?? 1;
	const vx = cfg.viewportX ?? 0;
	const vy = cfg.viewportY ?? 0;
	const vw = cfg.viewportW ?? 10000;
	const vh = cfg.viewportH ?? 10000;
	const vpLeft = -vx / ws - 200;
	const vpRight = (vw - vx) / ws + 200;
	const vpTop = -vy / ws - 200;
	const vpBottom = (vh - vy) / ws + 200;

	for (const e of edges) {
		const isCabled = cablePrep.cabledEdgeIds.has(e.id) || cablePrep.intraHandledIds.has(e.id);

		const src = resolvePos(e.source);
		const tgt = resolvePos(e.target);
		if (!src || !tgt) continue;

		// Skip edges where both endpoints are outside the viewport
		const srcOut = src.x < vpLeft || src.x > vpRight || src.y < vpTop || src.y > vpBottom;
		const tgtOut = tgt.x < vpLeft || tgt.x > vpRight || tgt.y < vpTop || tgt.y > vpBottom;
		if (srcOut && tgtOut) continue;

		// When cable-tray handles this edge, skip the line segment but still draw decorations (arrows etc.)
		if (isCabled || cablePrep.hasClusters) {
			const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
			const { alpha } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);
			drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);
			continue;
		}

		let lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
		const { alpha: _alpha, lineThick: _lineThick, isHighlighted: edgeHL } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);
		let alpha = _alpha;
		let lineThick = _lineThick;

		// Zoom-out: desaturate edge colors toward gray for visual calm
		// Skip for highlighted edges — they should stay vivid.
		const edgeWs = cfg.worldScale ?? 1;
		if (edgeWs < 0.3 && !edgeHL) {
			const gray = cfg.isDark ? 0x666666 : 0x999999;
			const blend = Math.min(1, (0.3 - edgeWs) / 0.2); // 0→1 as zoom 0.3→0.1
			const r1 = (lineColor >> 16) & 0xff,
				g1 = (lineColor >> 8) & 0xff,
				b1 = lineColor & 0xff;
			const r2 = (gray >> 16) & 0xff,
				g2 = (gray >> 8) & 0xff,
				b2 = gray & 0xff;
			lineColor =
				(Math.round(r1 + (r2 - r1) * blend * 0.5) << 16) |
				(Math.round(g1 + (g2 - g1) * blend * 0.5) << 8) |
				Math.round(b1 + (b2 - b1) * blend * 0.5);
		}
		// Brighten highlighted edges for visual emphasis
		if (edgeHL) {
			const rr = Math.min(255, ((lineColor >> 16) & 0xff) + 60);
			const gg = Math.min(255, ((lineColor >> 8) & 0xff) + 60);
			const bb = Math.min(255, (lineColor & 0xff) + 60);
			lineColor = (rr << 16) | (gg << 8) | bb;
		}

		// S6: Ontology backbone — thicken inheritance edges (merged from showHierarchyOverlay)
		if (cfg.showOntologyBackbone && e.type === EDGE_TYPE_INHERITANCE) {
			lineThick *= cfg.edgeHierarchyThickFactor ?? 2.5;
			alpha = Math.min(1.0, alpha + (cfg.edgeHierarchyBoost ?? 0.3));
		}

		g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
		const hasDash = applyDashPattern(g, e, lineThick);

		drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength, cfg.roadNetwork, cache);
		drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);

		if (hasDash) g.setLineDash([]);
	}
}

// ---------------------------------------------------------------------------
// レイヤー分離描画 — 種別ごとに描画パスを分け、alpha/width を微調整
// ---------------------------------------------------------------------------

/** レイヤー描画順序 (下層 → 上層): 薄いものを先に、重要なものを後に描画 */
const EDGE_LAYER_ORDER: readonly (string | undefined)[] = [
	EDGE_TYPE_SIMILAR, // 最下層: 類似エッジ (最も薄い)
	EDGE_TYPE_TAG, // 共有タグ
	EDGE_TYPE_HAS_TAG, // has-tag
	"category", // 共有カテゴリ
	"semantic", // 意味関係
	EDGE_TYPE_SIBLING, // 兄弟
	EDGE_TYPE_SEQUENCE, // 順序
	EDGE_TYPE_AGGREGATION, // 集約
	EDGE_TYPE_INHERITANCE, // 継承
	EDGE_TYPE_LINK, // 最上層: wikilink (最も重要)
	undefined, // type未設定のフォールバック
];

/** レイヤーごとの alpha 乗数 (下層ほど薄い) */
const LAYER_ALPHA_MULTIPLIERS: readonly number[] = [
	0.5, // similar
	0.6, // tag
	0.6, // has-tag
	0.65, // category
	0.7, // semantic
	0.75, // sibling
	0.8, // sequence
	0.85, // aggregation
	0.9, // inheritance
	1.0, // link
	0.7, // undefined/other
];

/** レイヤーごとの width 加算 (上層ほど太い — 重なりで区別可能に) */
const LAYER_WIDTH_OFFSETS: readonly number[] = [
	-0.3, // similar
	-0.2, // tag
	-0.2, // has-tag
	-0.1, // category
	0.0, // semantic
	0.0, // sibling
	0.1, // sequence
	0.1, // aggregation
	0.2, // inheritance
	0.3, // link
	0.0, // undefined/other
];

/** レイヤー分離モードでエッジを種別ごとに複数パスで描画 */
function _drawEdgesLayered(
	g: CanvasGraphics,
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
	useRelColor: boolean,
	isArcLayout: boolean,
	densityScale: number,
	pairCount: Map<string, number> | null,
	bundles: Map<string, BundleGroup> | null,
	bundleStrength: number,
	cablePrep: CablePrepResult,
	arrowGfx?: CanvasGraphics | null,
	cache: EdgeRenderCache = _cache,
): void {
	// レイヤー順にエッジを描画
	for (let li = 0; li < EDGE_LAYER_ORDER.length; li++) {
		const layerType = EDGE_LAYER_ORDER[li];
		const alphaMul = LAYER_ALPHA_MULTIPLIERS[li];
		const widthOff = LAYER_WIDTH_OFFSETS[li];

		for (const e of edges) {
			// このレイヤーに属さないエッジはスキップ
			if ((e.type ?? undefined) !== layerType) continue;

			const isCabledL = cablePrep.cabledEdgeIds.has(e.id) || cablePrep.intraHandledIds.has(e.id);

			const src = resolvePos(e.source);
			const tgt = resolvePos(e.target);
			if (!src || !tgt) continue;

			// When cable-tray handles this edge, skip the line segment but still draw decorations (arrows etc.)
			if (isCabledL || cablePrep.hasClusters) {
				const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
				const { alpha } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);
				drawEdgeDecorations(g, e, src, tgt, lineColor, alpha * alphaMul, cfg, arrowGfx);
				continue;
			}

			let lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
			const {
				alpha: _alpha2,
				lineThick: _lineThick2,
				isHighlighted: edgeHLL,
			} = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);
			let alpha = _alpha2;
			let lineThick = _lineThick2;

			// Brighten highlighted edges for visual emphasis
			if (edgeHLL) {
				const rr = Math.min(255, ((lineColor >> 16) & 0xff) + 60);
				const gg = Math.min(255, ((lineColor >> 8) & 0xff) + 60);
				const bb = Math.min(255, (lineColor & 0xff) + 60);
				lineColor = (rr << 16) | (gg << 8) | bb;
			}

			// S6: Ontology backbone — thicken inheritance edges (merged from showHierarchyOverlay)
			if (cfg.showOntologyBackbone && e.type === EDGE_TYPE_INHERITANCE) {
				lineThick *= cfg.edgeHierarchyThickFactor ?? 2.5;
				alpha = Math.min(1.0, alpha + (cfg.edgeHierarchyBoost ?? 0.3));
			}

			// レイヤーごとに alpha と width を微調整
			const layerAlpha = alpha * alphaMul;
			const layerWidth = Math.max(0.5, lineThick + widthOff);

			g.lineStyle({ width: layerWidth, color: lineColor, alpha: layerAlpha, native: true });
			const hasDash = applyDashPattern(g, e, layerWidth);

			drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength, cfg.roadNetwork, cache);
			drawEdgeDecorations(g, e, src, tgt, lineColor, layerAlpha, cfg, arrowGfx);

			if (hasDash) g.setLineDash([]);
		}
	}
}

// ---------------------------------------------------------------------------
// Marker drawing
// ---------------------------------------------------------------------------

/**
 * Draw a marker at the end of an ontology edge.
 * - inheritance: hollow triangle at target (UML generalization)
 * - aggregation: hollow diamond at source (UML aggregation)
 */
function drawEdgeMarker(
	g: CanvasGraphics,
	src: Pos,
	tgt: Pos,
	type: typeof EDGE_TYPE_INHERITANCE | typeof EDGE_TYPE_AGGREGATION,
	color: number,
	alpha: number,
	bgColor: number,
) {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	const sz = EDGE_MARKER_SIZE;

	if (type === EDGE_TYPE_INHERITANCE) {
		const bx = tgt.x - ux * sz;
		const by = tgt.y - uy * sz;
		g.lineStyle({ width: MARKER_STROKE_WIDTH, color, alpha, native: true });
		g.beginFill(bgColor, alpha * MARKER_FILL_ALPHA_RATIO);
		g.moveTo(tgt.x, tgt.y);
		g.lineTo(bx + px * sz * MARKER_HALF_WIDTH, by + py * sz * MARKER_HALF_WIDTH);
		g.lineTo(bx - px * sz * MARKER_HALF_WIDTH, by - py * sz * MARKER_HALF_WIDTH);
		g.closePath();
		g.endFill();
	} else {
		const mx = src.x + ux * sz;
		const my = src.y + uy * sz;
		const fx = src.x + ux * sz * 2;
		const fy = src.y + uy * sz * 2;
		g.lineStyle({ width: MARKER_STROKE_WIDTH, color, alpha, native: true });
		g.beginFill(bgColor, alpha * MARKER_FILL_ALPHA_RATIO);
		g.moveTo(src.x, src.y);
		g.lineTo(mx + px * sz * ARROW_HALF_WIDTH_FACTOR, my + py * sz * ARROW_HALF_WIDTH_FACTOR);
		g.lineTo(fx, fy);
		g.lineTo(mx - px * sz * ARROW_HALF_WIDTH_FACTOR, my - py * sz * ARROW_HALF_WIDTH_FACTOR);
		g.closePath();
		g.endFill();
	}
}

/**
 * Draw a filled arrow at the target end of a sequence edge (→ direction).
 */
function drawSequenceArrow(g: CanvasGraphics, src: Pos, tgt: Pos, color: number, alpha: number) {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	const sz = SEQUENCE_ARROW_SIZE;

	const bx = tgt.x - ux * sz;
	const by = tgt.y - uy * sz;
	g.lineStyle({ width: 1, color, alpha, native: true });
	g.beginFill(color, alpha);
	g.moveTo(tgt.x, tgt.y);
	g.lineTo(bx + px * sz * ARROW_HALF_WIDTH_FACTOR, by + py * sz * ARROW_HALF_WIDTH_FACTOR);
	g.lineTo(bx - px * sz * ARROW_HALF_WIDTH_FACTOR, by - py * sz * ARROW_HALF_WIDTH_FACTOR);
	g.closePath();
	g.endFill();
}

/**
 * Draw a small filled arrow at the target end of any edge (generic direction indicator).
 * Smaller than the sequence arrow to avoid visual clutter.
 */
function drawGenericArrow(
	g: CanvasGraphics,
	src: Pos,
	tgt: Pos,
	color: number,
	alpha: number,
	targetRadius: number,
	worldScale = 1,
) {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	// Scale arrow size: ensure minimum screen-pixel visibility at any zoom
	const minScreenPx = 6;
	const minWorldSize = worldScale > 0 ? minScreenPx / worldScale : GENERIC_ARROW_MIN_SIZE;
	const sz = Math.max(minWorldSize, targetRadius * GENERIC_ARROW_RADIUS_FACTOR);
	const hw = sz * GENERIC_ARROW_HALF_WIDTH;

	// Place arrow tip at the edge of the target node circle
	const tipX = tgt.x - ux * (targetRadius + GENERIC_ARROW_TIP_OFFSET);
	const tipY = tgt.y - uy * (targetRadius + GENERIC_ARROW_TIP_OFFSET);
	const bx = tipX - ux * sz;
	const by = tipY - uy * sz;
	g.lineStyle({ width: 0 });
	g.beginFill(color, alpha);
	g.moveTo(tipX, tipY);
	g.lineTo(bx + px * hw, by + py * hw);
	g.lineTo(bx - px * hw, by - py * hw);
	g.closePath();
	g.endFill();
}

// ---------------------------------------------------------------------------
// Cardinality (crow's foot) helpers
// ---------------------------------------------------------------------------

/**
 * Resolve which cardinality rule applies to an edge.
 * Checks user-defined rules first (first match wins), then falls back
 * to default cardinality based on edge type.
 */
function resolveCardinality(edge: GraphEdge, rules: CardinalityRule[]): CardinalityRule | null {
	for (const rule of rules) {
		if (rule.edgeType && rule.edgeType !== edge.type) continue;
		if (rule.relation && !edge.relation?.includes(rule.relation)) continue;
		return rule;
	}
	return getDefaultCardinality(edge);
}

/**
 * Default cardinality inference based on edge type.
 * Returns null for unknown types (no markers drawn).
 */
function getDefaultCardinality(edge: GraphEdge): CardinalityRule | null {
	switch (edge.type) {
		case EDGE_TYPE_INHERITANCE:
			return { sourceCardinality: "1", targetCardinality: "0..N" };
		case EDGE_TYPE_AGGREGATION:
			return { sourceCardinality: "1", targetCardinality: "0..N" };
		case EDGE_TYPE_HAS_TAG:
			return { sourceCardinality: "N", targetCardinality: "1" };
		case EDGE_TYPE_LINK:
			return { sourceCardinality: "1", targetCardinality: "0..1" };
		case EDGE_TYPE_SEQUENCE:
			return { sourceCardinality: "1", targetCardinality: "1" };
		default:
			return null;
	}
}

/**
 * Draw a cardinality symbol near a node endpoint.
 *
 * @param g         - Graphics context
 * @param nearNode  - The node this symbol is drawn next to
 * @param farNode   - The node on the opposite end
 * @param cardinality - Which symbol to draw
 * @param color     - Line color
 * @param alpha     - Line alpha
 * @param nodeRadius - Radius of the near node
 */
function drawCardinalityMarker(
	g: CanvasGraphics,
	nearNode: Pos,
	farNode: Pos,
	cardinality: Cardinality,
	color: number,
	alpha: number,
	nodeRadius: number,
	cfg: Required<CardinalityRenderConfig>,
) {
	const dx = farNode.x - nearNode.x;
	const dy = farNode.y - nearNode.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	// Unit vector from nearNode toward farNode
	const ux = dx / len;
	const uy = dy / len;
	// Perpendicular vector
	const px = -uy;
	const py = ux;

	const sz = Math.max(cfg.markerSizeMin, nodeRadius * cfg.markerSizeRatio);
	const offset = nodeRadius + cfg.markerOffset;

	// Base point: just outside the node boundary
	const bx = nearNode.x + ux * offset;
	const by = nearNode.y + uy * offset;

	g.lineStyle({ width: cfg.lineWidth, color, alpha: alpha * cfg.alpha, native: true });

	switch (cardinality) {
		case "1":
			// Single perpendicular bar
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			break;

		case "0..1":
			// Perpendicular bar + small circle further out
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			g.drawCircle(
				bx + ux * sz * cfg.circleOffsetFactor01,
				by + uy * sz * cfg.circleOffsetFactor01,
				sz * cfg.circleRadiusFactor,
			);
			break;

		case "N": {
			// Crow's foot (three lines converging) + perpendicular bar
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			const forkX = bx + ux * sz * cfg.crowsFootForkFactor;
			const forkY = by + uy * sz * cfg.crowsFootForkFactor;
			g.moveTo(forkX, forkY);
			g.lineTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.moveTo(forkX, forkY);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			g.moveTo(forkX, forkY);
			g.lineTo(bx, by);
			break;
		}

		case "0..N":
			// Crow's foot + small circle
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx + ux * sz * cfg.crowsFootForkFactor, by + uy * sz * cfg.crowsFootForkFactor);
			g.moveTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			g.lineTo(bx + ux * sz * cfg.crowsFootForkFactor, by + uy * sz * cfg.crowsFootForkFactor);
			g.moveTo(bx, by);
			g.lineTo(bx + ux * sz * cfg.crowsFootForkFactor, by + uy * sz * cfg.crowsFootForkFactor);
			g.drawCircle(
				bx + ux * sz * cfg.circleOffsetFactor0N,
				by + uy * sz * cfg.circleOffsetFactor0N,
				sz * cfg.circleRadiusFactor,
			);
			break;

		case "1..N": {
			// Crow's foot + perpendicular bar
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			const forkX2 = bx + ux * sz * cfg.crowsFootForkFactor;
			const forkY2 = by + uy * sz * cfg.crowsFootForkFactor;
			g.moveTo(forkX2, forkY2);
			g.lineTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.moveTo(forkX2, forkY2);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// Edge label helpers
// ---------------------------------------------------------------------------

/**
 * Determine the display label for an edge.
 * Returns the custom relation name if set, otherwise a short type label.
 * Returns null for edge types that should not display a label (links, has-tag).
 */
export function getEdgeLabel(e: GraphEdge): string | null {
	if (e.relation) return e.relation;
	switch (e.type) {
		case EDGE_TYPE_INHERITANCE:
			return "is-a";
		case EDGE_TYPE_AGGREGATION:
			return "has-a";
		case EDGE_TYPE_SIMILAR:
			return "\u2248"; // ≈
		case EDGE_TYPE_SIBLING:
			return "sibling";
		case EDGE_TYPE_SEQUENCE:
			return "seq";
		case EDGE_TYPE_HAS_TAG:
			return null;
		default:
			return null; // plain links — no label
	}
}

/**
 * Draw text labels on edges into a dedicated CanvasContainer.
 *
 * Labels are placed at the midpoint of each edge.  When the total number of
 * labelable edges exceeds MAX_EDGE_LABELS the labels are skipped entirely to
 * avoid performance degradation from excessive CanvasText objects.
 */
export function drawEdgeLabels(
	container: CanvasContainer,
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
): void {
	// Remove all previous labels
	while (container.children.length > 0) {
		const child = container.children[container.children.length - 1];
		container.removeChild(child);
		child.destroy();
	}

	if (!cfg.showEdgeLabels) return;

	// Auto-hide edge labels at low zoom with gradual fade
	const zoom = cfg.worldScale ?? 1;
	const labelHideZ = cfg.edgeLabelZoomHide ?? 0.15;
	const labelFadeZ = cfg.edgeLabelZoomFade ?? 0.3;
	if (zoom < labelHideZ) return;
	const edgeLabelAlpha = zoom < labelFadeZ ? (zoom - labelHideZ) / (labelFadeZ - labelHideZ) : 1;

	// --- 通常のエッジラベル（関係名/種別名） ---

	// Collect labelable edges (skip hidden types and those without a label)
	const labelable: { edge: GraphEdge; label: string }[] = [];
	for (const e of edges) {
		if (shouldSkipEdge(e, cfg)) continue;
		if (shouldSkipByDirection(e, cfg)) continue;
		const label = getEdgeLabel(e);
		if (!label) continue;
		labelable.push({ edge: e, label });
	}

	// LOD: Zoom-based label thinning — at low zoom, show fewer labels.
	// At zoom ≥ 1.0 show MAX_EDGE_LABELS, at zoom 0.1 show ~20% of max.
	const zoomScale = Math.min(1, Math.max(0.2, cfg.worldScale ?? 1));
	const effectiveMax = Math.max(10, Math.floor(MAX_EDGE_LABELS * zoomScale));

	// Performance guard: show only the most important labels when count exceeds limit.
	// Prioritize edges whose endpoints have higher combined degree (more connected = more visible).
	if (labelable.length > effectiveMax) {
		if (cfg.degrees && cfg.degrees.size > 0) {
			labelable.sort((a, b) => {
				const da =
					(cfg.degrees.get(a.edge.source as string) ?? 0) + (cfg.degrees.get(a.edge.target as string) ?? 0);
				const db =
					(cfg.degrees.get(b.edge.source as string) ?? 0) + (cfg.degrees.get(b.edge.target as string) ?? 0);
				return db - da;
			});
		}
		labelable.length = effectiveMax;
	}

	const fillColor = a11yEdgeLabelFill(cfg.isDark);
	const placement = cfg.edgeLabelPlacement ?? "center";
	const PERPENDICULAR_OFFSET = 8;
	// For "smart" mode: track placed label bounding boxes to avoid collisions
	const placedRects: { x: number; y: number; hw: number; hh: number }[] = [];
	const SMART_LABEL_HW = 25; // estimated half-width of a label
	const SMART_LABEL_HH = 7; // estimated half-height of a label
	const SMART_SHIFT_STEP = 12; // shift distance per collision attempt
	const SMART_MAX_SHIFTS = 4; // maximum shift attempts

	// IF: Seed placedRects with node positions to prevent edge labels from overlapping nodes
	if (placement === "smart") {
		const seenNodes = new Set<string>();
		for (const { edge: e } of labelable) {
			for (const ref of [e.source, e.target]) {
				const id = typeof ref === "string" ? ref : (ref as any)?.id;
				if (!id || seenNodes.has(id)) continue;
				seenNodes.add(id);
				const pos = resolvePos(ref);
				if (pos) {
					const nr = cfg.nodeRadii?.get(id) ?? 15;
					placedRects.push({ x: pos.x, y: pos.y, hw: nr, hh: nr });
				}
			}
		}
	}

	for (const { edge: e, label } of labelable) {
		const sp = resolvePos(e.source);
		const tp = resolvePos(e.target);
		if (!sp || !tp) continue;

		// Base position: edge midpoint
		const mx = (sp.x + tp.x) / 2;
		const my = (sp.y + tp.y) / 2;

		let labelX = mx;
		let labelY = my;

		if (placement === "offset" || placement === "smart") {
			// Compute perpendicular offset (above edge)
			const dx = tp.x - sp.x;
			const dy = tp.y - sp.y;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const nx = -dy / len; // perpendicular normal
			const ny = dx / len;
			labelX = mx + nx * PERPENDICULAR_OFFSET;
			labelY = my + ny * PERPENDICULAR_OFFSET;
		}

		if (placement === "smart") {
			// Simple collision avoidance: check against previously placed labels
			// and shift along perpendicular if overlapping
			const dx = tp.x - sp.x;
			const dy = tp.y - sp.y;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const nx = -dy / len;
			const ny = dx / len;

			for (let attempt = 0; attempt < SMART_MAX_SHIFTS; attempt++) {
				let collides = false;
				for (const rect of placedRects) {
					if (
						Math.abs(labelX - rect.x) < SMART_LABEL_HW + rect.hw &&
						Math.abs(labelY - rect.y) < SMART_LABEL_HH + rect.hh
					) {
						collides = true;
						break;
					}
				}
				if (!collides) break;
				// Shift further along perpendicular
				labelX += nx * SMART_SHIFT_STEP;
				labelY += ny * SMART_SHIFT_STEP;
			}
			placedRects.push({ x: labelX, y: labelY, hw: SMART_LABEL_HW, hh: SMART_LABEL_HH });
		}

		const text = new CanvasText(label, {
			fontSize: cfg.edgeLabelFontSize ?? EDGE_LABEL_FONT_SIZE_DEFAULT,
			fill: fillColor,
			fontFamily: "sans-serif",
		});
		text.anchor.set(0.5, 0.5);
		text.x = labelX;
		text.y = labelY;
		text.alpha = EDGE_LABEL_ALPHA * edgeLabelAlpha;
		text.resolution = EDGE_LABEL_RESOLUTION;
		// A11y: background pill for edge label contrast
		text.bgColor = cfg.isDark ? 0x1a1a2e : 0xf0f0f4;
		text.bgAlpha = EDGE_LABEL_BG_ALPHA;
		text.bgPadX = 3;
		text.bgPadY = 1;

		container.addChild(text);
	}
}
