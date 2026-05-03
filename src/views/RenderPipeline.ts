import { CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { IApp } from "./canvas2d/interfaces";
import type {
	GraphNode,
	NodeDisplayMode,
	CardDisplayConfig,
	DonutDisplayConfig,
	CardRenderConfig,
	RenderThresholds,
} from "../types";
import { DEFAULT_CARD_RENDER_CONFIG, mergeRenderThresholds } from "../types";
import type { PixiNode } from "./InteractionManager";
import { getNodeShape, drawShape, drawShapeAt, type ShapeRule } from "../utils/node-shapes";
import type { ManagedTimers } from "../utils/managed-timers";
import { effectiveRadius } from "../layouts/cluster-force";
import { Platform } from "obsidian";
import {
	EDGE_REDRAW_SKIP,
	IDLE_FRAME_DETACH_THRESHOLD,
	NODE_SCREEN_PX_BASE,
	MIN_WORLD_RADIUS_PX,
	VIEWPORT_CULL_MARGIN_PX,
	IMMEDIATE_BATCH_SIZE,
	DEFERRED_BATCH_SIZE,
	HOLD_RING_LINE_WIDTH,
	HOLD_RING_PADDING,
	INDICATOR_RING_ALPHA,
	ZONE_MAX_PROXIMITY_CANDIDATES,
	SUPER_NODE_FILL_ALPHA,
	OVERLAP_GRID_CELL_SIZE,
	KB_FOCUS,
	LABEL_LAYOUT,
	LABEL_PAD,
	SUB_LABEL,
} from "../constants";
export { MIN_WORLD_RADIUS_PX } from "../constants"; // Re-export for public API
import {
	darkenColor,
	lightenColor,
	blendColors,
	desaturateColor,
	computeGlowParams,
	computeLabelColors,
	isDensityTooClose,
	computeZonePlacementFromAngles,
	GLOW_P90_FRACTION,
	LABEL_Y_OFFSET_FACTOR,
} from "./render-pipeline-utils";
export { darkenColor, lightenColor, blendColors, desaturateColor };
import {
	computeZoomNodeBoost,
	computeBaseStrokeWidth,
	computeNodeAlpha,
	resolveNodeDrawColor,
} from "./node-render-helpers";
import type { DenseStrokeConfig } from "./node-render-helpers";
import { SpatialHashGrid } from "../utils/spatial-grid";
import { computeViewportBounds, collectVisibleNodes } from "./batch-context";
import { cleanupCardText, cleanupCardTextAll, renderCardMode, CARD_FONT_FAMILY } from "./card-renderer";
import { renderDonutMode, renderSunburstSegmentMode } from "./donut-renderer";
import { renderSemanticZoomMode } from "./semantic-zoom-renderer";
import {
	renderPathfinderMarkers,
	renderCompareRings,
	renderBookmarkStars,
	renderMissingNeighborRings,
	renderTagBadges,
	renderImportanceRings,
	renderRecencyMarkers,
	renderBridgeNodes,
	renderArticulationPoints,
	renderEntropyOverlay,
	renderMultiSelectRings,
	renderHierarchyOverlay,
	renderOntologyBackbone,
	renderGapEdges,
} from "./node-decorations";
import {
	collectLabelRects,
	tryDisplaceLabel,
	guaranteePlacementFloor,
	drawCounterScaleLeaderLines,
	type CullLabelRect,
	type LeaderLineState,
} from "./render-pipeline-helpers/label-culling";

// ---------------------------------------------------------------------------
// Shared render context type for node rendering methods
// ---------------------------------------------------------------------------
interface NormalZoomCtx {
	visible: PixiNode[];
	pixiNodes: Map<string, PixiNode>;
	tlFilteredOut: Set<string> | null;
	alpha: number;
	nodeCount: number;
	shapeRules: ShapeRule[];
	worldScale: number;
	minWorldRadius: number;
	lodLevel: number;
}

// ---------------------------------------------------------------------------
// Constants — consolidated in constants.ts (Render Constants section)
// ---------------------------------------------------------------------------

/** Convert a screen-pixel size to world units, floored at `floor`. */
export function screenToWorld(screenPx: number, ws: number, floor: number): number {
	return Math.max(floor, ws > 0 ? screenPx / ws : floor);
}

/**
 * Compute a fade-out alpha for individual nodes/intra-group cables at extreme zoom-out.
 * Returns 1.0 at zoom >= fadeStart, linearly fading to fadeFloor at zoom <= fadeEnd.
 * Does NOT affect trunks (inter-group cables).
 */
export function computeZoomFadeAlpha(zoom: number, fadeStart = 0.7, fadeEnd = 0.15, fadeFloor = 0.03): number {
	if (zoom >= fadeStart) return 1;
	if (zoom <= fadeEnd) return fadeFloor;
	return fadeFloor + ((1 - fadeFloor) * (zoom - fadeEnd)) / (fadeStart - fadeEnd);
}

// Render pipeline numeric/object constants (IMMEDIATE_BATCH_SIZE, KB_FOCUS,
// LABEL_LAYOUT, LABEL_PAD, SUB_LABEL, etc.) now live in constants.ts.

/**
 * Compute the LOD (Level of Detail) tier based on node screen-space pixel size.
 * Pure function — no DOM/Canvas dependency.
 *
 * @param nodeScreenPx  Screen-space pixel size of a node (NODE_SCREEN_PX_BASE * worldScale)
 * @param thresholds    LOD threshold values from render settings
 * @returns LOD level 0–5 (0 = extreme zoom-out dots, 5 = full card mode)
 */
export function computeLodLevel(
	nodeScreenPx: number,
	thresholds: {
		cardLODExtremePx: number;
		cardLODMidLabelPx: number;
		cardLODNormalPx: number;
		cardLODCompactPx: number;
		cardLODFullCardPx: number;
	},
): number {
	if (nodeScreenPx < thresholds.cardLODExtremePx) return 0;
	if (nodeScreenPx < thresholds.cardLODMidLabelPx) return 1;
	if (nodeScreenPx < thresholds.cardLODNormalPx) return 2;
	if (nodeScreenPx < thresholds.cardLODCompactPx) return 3;
	if (nodeScreenPx < thresholds.cardLODFullCardPx) return 4;
	return 5;
}

/**
 * Compute density-adaptive culling scale factor for label spacing.
 * At low zoom: aggressive spacing (sqrt scaling). At high zoom: mild spacing.
 *
 * @param zoom  Current zoom level (worldContainer.scale.x)
 * @param threshold  Zoom level that separates "low" from "high" (labelDensityZoomThreshold)
 * @returns Scale factor (>1 = more aggressive, <1 = more lenient)
 */
export function computeDensityScale(zoom: number, threshold: number): number {
	if (zoom < threshold) {
		return 1 + Math.sqrt((threshold - zoom) / threshold) * 1.5;
	}
	return Math.max(0.3, 1 - (zoom - threshold) * 0.5);
}

/**
 * Compute minimum distance for density culling.
 *
 * @param baseDist  Base screen-space distance (labelDensityMinScreenDist)
 * @param maxDist   Maximum allowed distance (labelDensityMaxDist)
 * @param zoom      Current zoom level
 * @param threshold Zoom threshold for density scaling
 * @returns Minimum distance in screen pixels
 */
export function computeDensityMinDist(baseDist: number, maxDist: number, zoom: number, threshold: number): number {
	return Math.min(baseDist * computeDensityScale(zoom, threshold), maxDist);
}

/**
 * Generate label displacement offset candidates for overlap avoidance.
 * Returns 12 offsets sorted by distance from label center (farthest first by default).
 *
 * @param labelW  Label width in screen pixels
 * @param labelH  Label height in screen pixels
 * @param nodeScreenR  Node radius in screen pixels
 * @returns Array of {dx, dy} offsets in screen coordinates
 */
export function generateDisplacementOffsets(
	labelW: number,
	labelH: number,
	nodeScreenR: number,
): Array<{ dx: number; dy: number }> {
	const hw = labelW * 0.5;
	const pad = nodeScreenR + 2;
	return [
		{ dx: hw + pad, dy: pad + labelH }, // bottom-right
		{ dx: -(labelW + pad), dy: 0 }, // left
		{ dx: 0, dy: pad + labelH * 1.2 }, // below
		{ dx: hw + pad, dy: -(pad + labelH) }, // top-right
		{ dx: -(labelW + pad), dy: -(pad + labelH) }, // top-left
		{ dx: -(labelW + pad), dy: pad + labelH }, // bottom-left
		{ dx: hw + pad, dy: -(pad + labelH * 1.2) }, // above-right
		{ dx: -(hw + pad), dy: -(pad + labelH * 1.2) }, // above-left
		{ dx: labelW + pad * 2, dy: 0 }, // far right
		{ dx: 0, dy: -(pad + labelH * 1.5) }, // far above
		{ dx: -(labelW + pad * 2), dy: pad + labelH * 0.5 }, // far bottom-left
		{ dx: hw + pad, dy: pad + labelH * 1.5 }, // far below-right
	];
}

/** Simple deterministic hash of a string to a hue value (0–360). */
export function hashStringToHue(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
	}
	return ((hash % 360) + 360) % 360;
}

/** Truncate a label to maxChars, appending "…" if truncated. 0 or negative maxChars means no truncation. */
export function truncateLabel(label: string, maxChars: number): string {
	return maxChars > 0 && label.length > maxChars ? label.slice(0, maxChars) + "…" : label;
}

// ---------------------------------------------------------------------------
// RenderHost — the interface the RenderPipeline needs from its parent
// ---------------------------------------------------------------------------
export interface RenderHost {
	timers: ManagedTimers; // Shared timer registry — auto-cleared on view close to prevent leaks
	/** Get the renderer app instance */
	getPixiApp(): IApp | null;
	/** Get the PIXI node map */
	getPixiNodes(): Map<string, PixiNode>;
	/** Get the world container */
	getWorldContainer(): CanvasContainer | null;
	/** HR: Get current world scale (zoom level) */
	getWorldScale(): number;
	/** HR: Re-evaluate labels after zoom change (LOD + cull) */
	updateLabelsForZoom?(): void;
	/**
	 * Optional callback fired when the progressive node-creation queue drains
	 * (all deferred batches have finished creating sprites). Used by the host
	 * to kick off expensive post-creation work (e.g. force simulation restart)
	 * without contending with in-flight sprite creation.
	 */
	onAllPixiNodesCreated?(): void;
	/** IK: High contrast mode active */
	isHighContrastMode?(): boolean;
	/** Get the batch graphics layer for non-highlighted node circles */
	getNodeCircleBatch(): CanvasGraphics | null;
	/** Get the degrees map */
	getDegrees(): Map<string, number>;
	/** Get the label color for PIXI text */
	getLabelColor(): number;
	/** Whether the current theme is dark */
	isDarkTheme(): boolean;
	/** Get the highlighted node ID */
	getHighlightedNodeId(): string | null;
	/** Get the previous highlight set (for diff tracking) */
	getPrevHighlightSet(): Set<string>;
	/** Get the ephemeral highlight set */
	getEphemeralHighlight(): Set<string> | null;
	/** Rebuild the spatial hash grid */
	rebuildSpatialGrid(): void;
	/** Draw coordinate guides (grid lines, axis titles, tick labels) */
	drawGuides(): void;
	/** Draw orbit rings */
	drawOrbitRings(): void;
	/** Draw enclosures */
	drawEnclosures(): void;
	/** HL: Get enclosure label positions for overlap avoidance */
	getEnclosureLabels?(): Map<string, CanvasText>;
	/** Draw sunburst arcs */
	drawSunburstArcs(): void;
	/** Draw edges */
	drawEdges(): void;
	/** Get the node shape rules */
	getNodeShapeRules(): ShapeRule[];
	/** Get the set of node IDs hidden by search filter */
	getSearchHiddenNodes(): Set<string>;
	/** Draw timeline duration bars */
	drawTimelineBars(): void;
	/** Draw per-group route lines (transit map style) */
	drawRouteLines(): void;
	drawRoadNetwork(): void;
	/** Tick layout transition animation; returns true if still running */
	tickLayoutTransition(): boolean;
	/** Get the canvas viewport dimensions (CSS pixels) */
	getCanvasDimensions(): { width: number; height: number };
	/** Whether ring chart mode is active (sunburst + ringChartMode) */
	isRingChartMode(): boolean;
	/** Get the current node display mode */
	getNodeDisplayMode(): NodeDisplayMode;
	/** Get the card display configuration */
	getCardDisplayConfig(): CardDisplayConfig;
	/** Get the donut display configuration */
	getDonutDisplayConfig(): DonutDisplayConfig;
	/** Get the card render config (visual tuning) */
	getCardRenderConfig?(): CardRenderConfig;
	/** Get the render thresholds (LOD tuning) */
	getRenderThresholds?(): RenderThresholds;
	/** IE: Get panel state for content visibility flags */
	getPanel?(): { hoverShowBody?: boolean; hoverShowMeta?: boolean; hoverShowTitle?: boolean } | null;
	/** Get current node size */
	getNodeSize?(): number;
	/** Get the adjacency map for zone-based label placement */
	getAdjacency?(): Map<string, Set<string>>;
	/** Get the accent color for tag labels */
	getAccentColor?(): number;
	/** Whether the highlighted node was focused via keyboard (Tab) */
	getIsKeyboardFocused?(): boolean;
	/** Get the active timeline range for filtering */
	getTimelineRange?(): { min: number; max: number; active: boolean };
	/** Get the set of node IDs on the pathfinder route */
	getPathfinderNodeSet?(): Set<string> | null;
	/** Get the pathfinder start/end state */
	getPathfinderState?(): { startId: string | null; endId: string | null };
	/** 比較選択中のノードIDリストを取得 */
	getCompareNodeIds?(): string[];
	/** ブックマーク済みノードIDセットを取得 */
	getBookmarkedNodeIds?(): Set<string>;
	/** 未接続同タグノードIDセットを取得 */
	getMissingNeighborNodeIds?(): Set<string> | null;
	/** Update the density-culled label count badge */
	updateDensityCulledBadge?(count: number): void;
	/** Resolve a frontmatter property value for a node */
	getNodeProperty?(nodeId: string, key: string): string | undefined;
	/** Get the configured sub-label field names (comma-separated string) */
	getNodeSubLabelFields?(): string;
	/** A3: Get the icon field name and icon map */
	getNodeIconConfig?(): { field: string; map: Record<string, string> } | null;
	/** Whether tag badges should be shown */
	getShowTagBadges?(): boolean;
	/** Whether importance ring should be shown, and with which metric */
	getShowImportanceRing?(): { metric: "degree" | "betweenness" | "pagerank" } | null;
	/** Recency configuration (null = disabled) */
	getRecencyConfig?(): { days: number } | null;
	/** Get betweenness centrality cache */
	getBetweennessCache?(): Map<string, number> | undefined;
	/** Get bridge node IDs (top betweenness) — null if disabled */
	getBridgeNodeIds?(): Set<string> | null;
	/** Get articulation point IDs — null if disabled */
	getArticulationPointIds?(): Set<string> | null;
	/** M4: Get the definition field name for card rendering */
	getDefinitionField?(): string;
	/** M1: Whether semantic zoom is enabled */
	getSemanticZoom?(): boolean;
	/** D6: Whether entropy overlay is enabled */
	getShowEntropyOverlay?(): boolean;
	/** D6: Precomputed entropy scores (nodeId → 0..1) */
	getEntropyScores?(): Map<string, number> | null;
	/** C6: Multi-select node IDs */
	getMultiSelectNodeIds?(): string[];
	/** S1: Hierarchy tree from focused node (childId → parentId) */
	getHierarchyTree?(): Map<string, string> | null;
	/** S6: Ontology backbone edges (is-a hierarchy) */
	getOntologyBackbone?(): { from: string; to: string }[] | null;
	/** S4: Structural gap edges (should-be-connected pairs) */
	getStructuralGaps?(): { from: string; to: string }[] | null;
}

// ---------------------------------------------------------------------------
// RenderPipeline — owns the PIXI render loop, node creation, and batch drawing
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// quickSelect — O(n) average k-th smallest element (Hoare's selection algorithm)
// ---------------------------------------------------------------------------
export function quickSelect(arr: number[], k: number): number {
	if (arr.length <= 1) return arr[0] ?? 0;
	let lo = 0,
		hi = arr.length - 1;
	while (lo < hi) {
		const pivot = arr[(lo + hi) >> 1];
		let i = lo,
			j = hi;
		while (i <= j) {
			while (arr[i] < pivot) i++;
			while (arr[j] > pivot) j--;
			if (i <= j) {
				const tmp = arr[i];
				arr[i] = arr[j];
				arr[j] = tmp;
				i++;
				j--;
			}
		}
		if (j < k) lo = i;
		if (i > k) hi = j;
	}
	return k >= 0 && k < arr.length ? arr[k] : 0;
}

/** Shared context built once per redrawNodeBatch call and passed to sub-passes. */
interface BatchCtx {
	visible: PixiNode[];
	pixiNodes: Map<string, PixiNode>;
	tlFilteredOut: Set<string> | null;
	alpha: number;
	nodeCount: number;
	shapeRules: ShapeRule[];
	worldScale: number;
	isExtremeZoom: boolean;
	isMidZoom: boolean;
	minWorldRadius: number;
	lodLevel: number;
}

/** Render pass function operating on a CanvasGraphics with BatchCtx. */
type PassFn = (g: CanvasGraphics, ctx: BatchCtx) => void;

export class RenderPipeline {
	private host: RenderHost;

	/** When true, individual non-super nodes are hidden by redrawNodeBatch */
	aggregateMode = false;

	/** When true, disables zoomFade and aggregateMode for screenshot capture */
	screenshotMode = false;

	// Render loop state
	private needsRedraw = true;
	private needsFullRedraw = false;
	private _transformOnlyDirty = false;
	private idleFrames = 0;

	/**
	 * Progressive fade-in state for nodes created via the deferred batch path.
	 * Each new sprite starts at scale=0/alpha=0 and is registered here with
	 * its creation timestamp; tickProgressiveFadeIn() interpolates to full
	 * visibility over ~250 ms using easeOutCubic. The natural per-sprite
	 * creation time spread (3-5 ms between nodes, 16-50 ms between batches)
	 * gives the graph a soft "sprinkle-in" look rather than a single
	 * end-of-batch pop. Null when no progressive fade is active.
	 */
	private _progressiveFade: Map<string, number> | null = null;
	private static readonly PROGRESSIVE_FADE_DURATION_MS = 260;
	private _tickerBound = false;
	private edgeRedrawCounter = 0;
	// HR: Track zoom for label re-evaluation on zoom change
	private _prevWorldScale = 1;
	private _labelCullCooldown = 0;

	/** Count of active leader lines (avoids O(N) clear loop when 0) — mutable state for label-culling helpers */
	private _leaderState: LeaderLineState = { count: 0 };
	/** Reusable buffer for timeline range filter */
	private _timelineFilterBuf = new Set<string>();

	// Array pools for redrawNodeBatch() — reuse across frames to reduce GC
	private _visiblePool: PixiNode[] = [];
	private _degreesPool: number[] = [];

	/** Last computed LOD level (0-5) from autoLOD. Exposed for LabelManager. */
	private _lastLodLevel = 3;

	/** When true, skip per-node rendering (viewMode uses dedicated renderer). */
	private _skipNodeRendering = false;

	/** Called after every render tick (used by minimap) */
	onPostRender: (() => void) | null = null;

	// Deferred node creation
	private pendingNodes: GraphNode[] = [];
	private pendingNodeR: ((n: GraphNode) => number) | null = null;
	private pendingNodeColor: ((n: GraphNode) => number) | null = null;
	private pendingLabelThreshold = 3;
	private _cachedMaxDeg = 1;
	private _cachedMaxBodyLength = 0;
	private deferredBatchId: ReturnType<typeof setTimeout> | null = null;
	/** FPS tracking */
	private _fpsFrames = 0;
	private _fpsLastTime = 0;
	currentFps = 0;
	/** Last frame render duration in milliseconds */
	lastFrameMs = 0;

	// Cached render thresholds — recomputed only when dirty, not every frame
	private _cachedRT: Required<import("../types").RenderThresholds> | null = null;
	private _cachedRTSource: Partial<import("../types").RenderThresholds> | undefined = undefined;

	constructor(host: RenderHost) {
		this.host = host;
	}

	/** Return cached merged render thresholds, recomputing only when source changes. */
	private getCachedRT(): Required<import("../types").RenderThresholds> {
		const src = this.host.getRenderThresholds?.();
		if (this._cachedRT === null || src !== this._cachedRTSource) {
			this._cachedRTSource = src;
			this._cachedRT = mergeRenderThresholds(src);
		}
		return this._cachedRT;
	}

	/** Invalidate the cached render thresholds (call when settings change). */
	invalidateRTCache(): void {
		this._cachedRT = null;
	}

	// =========================================================================
	// Dirty flag management
	// =========================================================================
	markDirty(forceFullRedraw = false) {
		this.needsRedraw = true;
		if (forceFullRedraw) {
			this.needsFullRedraw = true;
			this._cachedRT = null; // Invalidate RT cache on full redraw
		}
		this.idleFrames = 0;
		this.wakeRenderLoop();
	}

	/**
	 * Lightweight dirty signal for pan/zoom: only the world transform
	 * (world.x/y/scale) has changed; node data, graphics commands, and edge
	 * paths are all unchanged. Skips the entire updatePositions pipeline
	 * (syncGfx, rebuildSpatialGrid, redrawNodeBatch, drawEdges, ...) and
	 * just asks the canvas renderer to repaint the existing scene at the
	 * new transform. This is the single biggest pan/zoom speedup since
	 * each full updatePositions costs 30-70ms on a 2,400-node graph.
	 */
	markTransformDirty(): void {
		this._transformOnlyDirty = true;
		this.idleFrames = 0;
		this.wakeRenderLoop();
	}

	// =========================================================================
	// Render loop
	// =========================================================================
	private renderTick = () => {
		// Layout transition always ticks (even when needsRedraw is false)
		const transitioning = this.host.tickLayoutTransition();
		if (transitioning) {
			this.needsRedraw = true;
			this.idleFrames = 0;
		}

		// Progressive fade-in runs on the cheap transform-only path: scales
		// + alpha change but the scene graph otherwise stays the same, so
		// we don't want to trigger a full updatePositions every frame.
		const progressive = this.tickProgressiveFadeIn();
		if (progressive) {
			this._transformOnlyDirty = true;
			this.idleFrames = 0;
		}

		if (this.needsRedraw) {
			const t0 = performance.now();
			this.updatePositions(this.needsFullRedraw);
			this.lastFrameMs = Math.round((performance.now() - t0) * 10) / 10;
			this.needsRedraw = false;
			this.needsFullRedraw = false;
			this._transformOnlyDirty = false;
			this.idleFrames = 0;
		} else if (this._transformOnlyDirty) {
			// Pan/zoom fast path: world transform changed but scene graph
			// is unchanged. Skip updatePositions entirely and just ask the
			// canvas renderer to repaint at the new transform.
			this.host.getPixiApp()?.markNeedsRender();
			this._transformOnlyDirty = false;
			this.idleFrames = 0;
		} else {
			this.idleFrames++;
			const app = this.host.getPixiApp();
			if (this.idleFrames > IDLE_FRAME_DETACH_THRESHOLD && app) {
				app.ticker.remove(this.renderTick, this);
				this._tickerBound = false;
			}
		}
		// FPS measurement
		this._fpsFrames++;
		const now = performance.now();
		if (now - this._fpsLastTime >= 1000) {
			this.currentFps = this._fpsFrames;
			this._fpsFrames = 0;
			this._fpsLastTime = now;
		}
		// Update minimap viewport rect every tick (pan/zoom changes world transform without needsRedraw)
		this.onPostRender?.();
	};

	startRenderLoop() {
		const app = this.host.getPixiApp();
		if (!app) return;
		if (this._tickerBound) return;
		this.needsRedraw = true;
		this.idleFrames = 0;
		app.ticker.add(this.renderTick, this);
		this._tickerBound = true;
	}

	wakeRenderLoop() {
		const app = this.host.getPixiApp();
		if (!this._tickerBound && app) {
			this.startRenderLoop();
		}
	}

	/** Force a synchronous render tick — used when rAF is throttled (background tabs). */
	forceRender() {
		this.needsRedraw = true;
		this.needsFullRedraw = true;
		this.renderTick();
		this.host.getPixiApp()?.markNeedsRender();
	}

	/** Detach the ticker callback. Call during cleanup. */
	detach() {
		this.cancelDeferredBatch();
		const app = this.host.getPixiApp();
		if (this._tickerBound && app) {
			app.ticker.remove(this.renderTick, this);
			this._tickerBound = false;
		}
	}

	get isTickerBound(): boolean {
		return this._tickerBound;
	}

	// =========================================================================
	// Update positions (called each render tick when dirty)
	// =========================================================================
	private updatePositions(forceFullRedraw = false) {
		const pixiNodes = this.host.getPixiNodes();
		for (const pn of pixiNodes.values()) {
			pn.gfx.x = pn.data.x;
			pn.gfx.y = pn.data.y;
		}
		this.host.rebuildSpatialGrid();
		this.redrawNodeBatch();
		this.host.drawOrbitRings();

		// HR: Re-evaluate label LOD + overlap when zoom changes significantly.
		// InteractionManager.afterZoomStep already debounces updateLabelsForZoom
		// for wheel zoom. This path used to also fire on every frame during
		// simulation drift, but profiling showed that during pan (no scale
		// change at all) the condition still triggered on every updatePositions
		// call and cost 71 ms per invocation — 1420 ms total over a 20-step pan.
		// We now require both a meaningful scale delta AND a forceFullRedraw
		// signal from the caller, so the expensive label cull only runs when
		// the host explicitly requests a full refresh.
		const curScale = this.host.getWorldScale();
		const zoomRatio = curScale > 0 ? Math.abs(curScale - this._prevWorldScale) / curScale : 0;
		this._labelCullCooldown--;
		if (forceFullRedraw && zoomRatio > 0.05 && this._labelCullCooldown <= 0) {
			this._prevWorldScale = curScale;
			const rt = this.getCachedRT();
			this._labelCullCooldown = rt.labelCullCooldown;
			this.host.updateLabelsForZoom?.();
		}

		// Throttle expensive edge + enclosure redraws during simulation.
		this.edgeRedrawCounter++;
		if (forceFullRedraw || this.edgeRedrawCounter >= EDGE_REDRAW_SKIP) {
			this.edgeRedrawCounter = 0;
			this.host.drawGuides(); // Grid lines, axis titles, tick labels (background layer)
			this.host.drawEnclosures();
			this.host.drawSunburstArcs();
			this.host.drawRouteLines();
			this.host.drawRoadNetwork();
			this.host.drawTimelineBars();
			this.host.drawEdges();
		}
		// Signal CanvasApp that content changed and needs re-rendering
		this.host.getPixiApp()?.markNeedsRender();
	}

	// =========================================================================
	// Node circle drawing
	// =========================================================================
	/** Draw an individual node circle (highlighted or hidden for batch) */
	drawNodeCircle(pn: PixiNode, highlight: boolean) {
		pn.circle.clear();
		if (highlight) {
			pn.circle.visible = true;
			const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...this.host.getCardRenderConfig?.() };
			const shape = getNodeShape(pn.data, this.host.getNodeShapeRules());
			const isKbFocused = this.host.getIsKeyboardFocused?.() ?? false;

			// Match batch rendering's LOD-aware minWorldRadius so highlighted nodes
			// don't jump in size compared to their batch-rendered appearance.
			const worldScale = this.host.getWorldContainer()?.scale?.x ?? 1;
			const rt = this.getCachedRT();
			const nodeScreenPx = pn.radius * worldScale;
			const isExtremeZoom = nodeScreenPx < rt.cardLODExtremePx;
			const minWorldRadius = isExtremeZoom
				? Math.max(0.5 / worldScale, 1)
				: Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);
			const effR = Math.max(pn.radius, minWorldRadius);

			if (isKbFocused) {
				const focusRadius = effR * KB_FOCUS.RADIUS_FACTOR;
				const segments = KB_FOCUS.SEGMENTS;
				const gap = KB_FOCUS.GAP_FRACTION;
				// A11y: ensure focus ring visible at any zoom (min 2px screen-space width)
				// JH: high contrast mode doubles focus ring width for §0.3 compliance
				const hcFocus = this.host.isHighContrastMode?.() ? 2 : 1;
				const focusLineW = Math.max(KB_FOCUS.LINE_WIDTH * hcFocus, 2 / worldScale);
				const focusColor = this.host.isDarkTheme() ? 0x00ccff : 0x0066cc; // high-contrast cyan/blue
				pn.circle.lineStyle(focusLineW, focusColor, KB_FOCUS.LINE_ALPHA);
				for (let i = 0; i < segments; i++) {
					const startAngle = (i / segments) * Math.PI * 2;
					const endAngle = startAngle + ((1 - gap) / segments) * Math.PI * 2;
					pn.circle.arc(0, 0, focusRadius, startAngle, endAngle);
					pn.circle.moveTo(Math.cos(endAngle) * focusRadius, Math.sin(endAngle) * focusRadius);
				}
			} else {
				// At extreme zoom-out, skip halo entirely to avoid perceived size jump.
				// The filled node + stroke is enough to indicate hover state.
				if (!isExtremeZoom) {
					drawShape(pn.circle, shape, effR * crc.highlightHaloRadius, pn.color, crc.highlightHaloAlpha);
				}
			}

			const strokeCol = darkenColor(pn.color, crc.strokeDarken);
			// At extreme zoom, use brighter stroke instead of halo for hover feedback
			const strokeAlpha = isExtremeZoom ? 1.0 : 0.85;
			pn.circle.lineStyle(
				crc.highlightStrokeWidth,
				isExtremeZoom ? lightenColor(pn.color, 0.3) : strokeCol,
				strokeAlpha,
			);
			// Fill node interior with a bright, opaque version of the node color
			// so highlighted nodes are clearly distinguishable from dimmed ones
			drawShape(pn.circle, shape, effR, lightenColor(pn.color, 0.2), 1);
		} else {
			pn.circle.visible = false;
		}
	}

	/**
	 * Redraw all non-highlighted node circles in a single batch Graphics.
	 * Reduces GPU draw calls from 1000+ to 1.
	 *
	 * Optimizations:
	 *  - Viewport culling: off-screen nodes are skipped entirely
	 *  - LOD tiers: extreme zoom → dots, mid zoom → all circles (no shape lookup),
	 *    normal zoom → full shape + gradient rendering
	 *  - Array pooling: visible[] and degrees[] reused across frames
	 *  - quickSelect: O(n) p90 calculation instead of sort O(n log n)
	 */
	redrawNodeBatch() {
		const g = this.host.getNodeCircleBatch();
		if (!g) return;
		g.clear();

		// Resolve config with defaults
		const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...this.host.getCardRenderConfig?.() };
		const rt = this.getCachedRT();

		// Ring chart mode or non-graph viewMode: hide all node graphics
		if (this.host.isRingChartMode() || this._skipNodeRendering) {
			for (const pn of this.host.getPixiNodes().values()) pn.gfx.visible = false;
			return;
		}

		// Build shared render context for sub-methods
		const ctx = this._buildBatchContext(crc, rt);

		// Store lodLevel for LabelManager access
		this._lastLodLevel = ctx.lodLevel;

		// P1: Build active pass list — only active passes enter the loop
		const passes: PassFn[] = [];

		// Pass 1: Glow halos (enhanced for hub nodes) — skip at extreme/mid zoom
		if (ctx.nodeCount < rt.glowNodeCount && !ctx.isExtremeZoom && !ctx.isMidZoom) {
			const rtRef = rt;
			passes.push((g, c) => this._renderGlowPass(g, c, rtRef));
		}

		// Pass 2: Nodes — always active (LOD-tiered rendering)
		{
			const crcRef = crc;
			const rtRef = rt;
			passes.push((g, c) => this._renderNodesPass(g, c, crcRef, rtRef));
		}

		// Pass 3: Hold indicator ring for pinned nodes
		passes.push((g, c) => this._renderHoldRings(g, c));

		// Pass 4: Pathfinder start/end node markers
		passes.push((g, c) => renderPathfinderMarkers(this.host, g, c));

		// Pass 5: Compare selection rings
		passes.push((g, c) => renderCompareRings(this.host, g, c));

		// Pass 6: Bookmark star overlay
		passes.push((g, c) => renderBookmarkStars(this.host, g, c));

		// Pass 7: Missing neighbor orange rings
		passes.push((g, c) => renderMissingNeighborRings(this.host, g, c));

		// Pass 8-13: Conditional overlay passes
		this._registerConditionalPasses(passes);

		// Pass 14: Multi-select rings
		const msIds = this.host.getMultiSelectNodeIds?.();
		if (msIds && msIds.length > 0) {
			const ids = msIds;
			passes.push((g, c) => renderMultiSelectRings(this.host, g, c, ids));
		}

		// Pass 15: S1 Hierarchy tree overlay
		passes.push((g) => renderHierarchyOverlay(this.host, g));

		// Pass 16: S6 Ontology backbone
		passes.push((g) => renderOntologyBackbone(this.host, g));

		// Pass 17: S4 Gap detection dotted edges
		passes.push((g) => renderGapEdges(this.host, g));

		// Execute all active passes
		for (const pass of passes) pass(g, ctx);
	}

	/** Register conditional overlay passes (tag badges, importance rings, etc.) */
	private _registerConditionalPasses(passes: PassFn[]): void {
		// Pass 8: Tag badges on node circumference
		if (this.host.getShowTagBadges?.()) {
			passes.push((g: CanvasGraphics, c: BatchCtx) => renderTagBadges(this.host, g, c));
		}
		// Pass 9: Importance ring
		if (this.host.getShowImportanceRing?.()) {
			passes.push((g: CanvasGraphics, c: BatchCtx) => renderImportanceRings(this.host, g, c));
		}
		// Pass 10: Recency marker
		if (this.host.getRecencyConfig?.()) {
			passes.push((g: CanvasGraphics, c: BatchCtx) => renderRecencyMarkers(this.host, g, c));
		}
		// Pass 11: Bridge nodes — gold ring for high betweenness
		if (this.host.getBridgeNodeIds?.()) {
			passes.push((g: CanvasGraphics, c: BatchCtx) => renderBridgeNodes(this.host, g, c));
		}
		// Pass 12: Articulation point warning ring
		if (this.host.getArticulationPointIds?.()) {
			passes.push((g: CanvasGraphics, c: BatchCtx) => renderArticulationPoints(this.host, g, c));
		}
		// Pass 13: Entropy overlay — knowledge diversity heatmap
		if (this.host.getShowEntropyOverlay?.()) {
			passes.push((g: CanvasGraphics, c: BatchCtx) => renderEntropyOverlay(this.host, g, c));
		}
	}

	// =========================================================================
	// Batch render context — shared state for all sub-passes
	// =========================================================================
	/** Shared state computed once per redrawNodeBatch call and passed to sub-methods. */
	private _buildBatchContext(crc: ReturnType<typeof Object.assign>, rt: ReturnType<typeof Object.assign>) {
		const hId = this.host.getHighlightedNodeId();
		const hlSet = this.host.getPrevHighlightSet();
		const eph = this.host.getEphemeralHighlight();
		const hasHighlight = !!(hId || (eph && eph.size > 0));
		const activeSet = eph && eph.size > 0 ? eph : hlSet;

		// Viewport culling bounds (world coordinates)
		const world = this.host.getWorldContainer();
		const worldScale = world?.scale?.x ?? 1;
		const { width: cw, height: ch } = this.host.getCanvasDimensions();
		const viewport = computeViewportBounds(
			world?.x ?? 0,
			world?.y ?? 0,
			worldScale,
			cw,
			ch,
			VIEWPORT_CULL_MARGIN_PX,
		);

		// Collect visible nodes (reuse pooled array)
		const visible = this._visiblePool;
		const pixiNodes = this.host.getPixiNodes();
		collectVisibleNodes(pixiNodes, visible, {
			hiddenBySearch: this.host.getSearchHiddenNodes(),
			hasHighlight,
			activeSet,
			aggregateMode: this.aggregateMode,
			screenshotMode: this.screenshotMode,
			viewport,
		});

		// Timeline range filtering
		const tlFilteredOut = this._computeTimelineFilter(visible, pixiNodes);

		// Zoom-out fade: gradually reduce node/label/intra-cable alpha at extreme zoom
		// In screenshot mode, disable fade so all nodes are fully visible
		const zoomFade = this.screenshotMode ? 1 : computeZoomFadeAlpha(worldScale);
		const alpha = (hasHighlight ? crc.highlightDimAlpha : 1) * zoomFade;
		const nodeCount = visible.length;
		const shapeRules = this.host.getNodeShapeRules();

		// LOD tiers
		const nodeScreenPx = NODE_SCREEN_PX_BASE * worldScale;
		const isExtremeZoom = nodeScreenPx < rt.cardLODExtremePx;
		const isMidZoom = !isExtremeZoom && nodeScreenPx < rt.cardLODNormalPx;
		// A11y: even at extreme zoom-out, guarantee minimum 1px screen-space radius
		const minWorldRadius = isExtremeZoom
			? Math.max(0.5 / worldScale, 1) // at least 1px on screen
			: Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);

		// 5-level LOD (used when autoLOD is enabled)
		let lodLevel = computeLodLevel(nodeScreenPx, rt as Parameters<typeof computeLodLevel>[1]);

		// Mobile lightweight mode: force simplified rendering (no gradients/glow/complex shapes)
		if (Platform.isMobile && lodLevel < 3) {
			lodLevel = 3;
		}

		return {
			visible,
			pixiNodes,
			tlFilteredOut,
			alpha,
			nodeCount,
			shapeRules,
			worldScale,
			isExtremeZoom,
			isMidZoom,
			minWorldRadius,
			lodLevel,
		};
	}

	/** Compute the set of node IDs outside the active timeline range. */
	private _computeTimelineFilter(visible: PixiNode[], pixiNodes: Map<string, PixiNode>): Set<string> | null {
		const tlRange = this.host.getTimelineRange?.();
		if (!tlRange?.active) return null;

		let globalMinX = Infinity,
			globalMaxX = -Infinity;
		for (const pn of pixiNodes.values()) {
			if (pn.data.x < globalMinX) globalMinX = pn.data.x;
			if (pn.data.x > globalMaxX) globalMaxX = pn.data.x;
		}
		const xSpan = globalMaxX - globalMinX;
		const tlMinX = globalMinX + xSpan * tlRange.min;
		const tlMaxX = globalMinX + xSpan * tlRange.max;
		this._timelineFilterBuf.clear();
		for (const pn of visible) {
			if (pn.data.x < tlMinX || pn.data.x > tlMaxX) {
				this._timelineFilterBuf.add(pn.data.id);
			}
		}
		return this._timelineFilterBuf;
	}

	// =========================================================================
	// Pass 1: Glow halos
	// =========================================================================
	/** Render glow halos behind nodes (enhanced for hub nodes). */
	private _renderGlowPass(
		g: CanvasGraphics,
		ctx: { visible: PixiNode[]; shapeRules: ShapeRule[]; alpha: number; nodeCount: number; minWorldRadius: number },
		rt: ReturnType<typeof Object.assign>,
	) {
		const { visible, shapeRules, alpha, nodeCount, minWorldRadius } = ctx;
		const { glowAlpha: baseGlowAlpha, glowRadius: baseGlowRadius } = computeGlowParams(
			nodeCount,
			rt.glowBaseAlpha,
			rt.glowBaseRadius,
		);

		// Reuse degree buffer + O(n) quickSelect instead of sort O(n log n)
		const degArr = this._degreesPool;
		degArr.length = visible.length;
		for (let i = 0; i < visible.length; i++) degArr[i] = visible[i].data.degree ?? 0;
		const targetIdx = Math.floor(visible.length * GLOW_P90_FRACTION);
		const p90 = quickSelect(degArr, targetIdx) || 1;

		g.lineStyle(0);
		for (let i = 0; i < visible.length; i++) {
			const pn = visible[i];
			const shape = getNodeShape(pn.data, shapeRules);
			const deg = pn.data.degree ?? 0;
			const hubFactor = deg >= p90 ? rt.glowHubFactor : 1;
			const glowAlpha = baseGlowAlpha * hubFactor;
			const glowRadius = baseGlowRadius * (deg >= p90 ? rt.glowHubRadiusFactor : 1);
			const effR = Math.max(pn.radius, minWorldRadius);
			g.beginFill(pn.color, alpha * glowAlpha);
			drawShapeAt(g, shape, pn.data.x, pn.data.y, effR * glowRadius);
			g.endFill();
		}
	}

	// =========================================================================
	// Pass 2: Node rendering (LOD-tiered)
	// =========================================================================
	/** Main node rendering pass with LOD tiers. */
	private _renderNodesPass(
		g: CanvasGraphics,
		ctx: {
			visible: PixiNode[];
			pixiNodes: Map<string, PixiNode>;
			tlFilteredOut: Set<string> | null;
			alpha: number;
			nodeCount: number;
			shapeRules: ShapeRule[];
			worldScale: number;
			isExtremeZoom: boolean;
			isMidZoom: boolean;
			minWorldRadius: number;
			lodLevel: number;
		},
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		const {
			visible,
			pixiNodes,
			tlFilteredOut,
			alpha,
			nodeCount: _nodeCount,
			worldScale,
			isExtremeZoom,
			isMidZoom,
			minWorldRadius,
		} = ctx;

		// Pre-pass: clean up table-card text at extreme/mid zoom
		if (isExtremeZoom || isMidZoom) {
			this._cleanupCardTextAll(pixiNodes);
		}

		if (isExtremeZoom) {
			this._renderExtremeZoom(g, visible, tlFilteredOut, alpha, worldScale, crc);
		} else if (isMidZoom) {
			this._renderMidZoom(g, visible, tlFilteredOut, alpha, minWorldRadius, crc);
		} else {
			this._renderNormalZoom(g, ctx, crc, rt);
		}
	}

	/** Remove CardText children from a single node's gfx container. */
	private _cleanupCardText(gfx: CanvasContainer) {
		cleanupCardText(gfx);
	}

	/** Remove all CardText children from every node's gfx container. */
	private _cleanupCardTextAll(pixiNodes: Map<string, PixiNode>) {
		cleanupCardTextAll(pixiNodes);
	}

	/** Extreme zoom-out: draw fixed-size dots with stroke for visibility. */
	private _renderExtremeZoom(
		g: CanvasGraphics,
		visible: PixiNode[],
		tlFilteredOut: Set<string> | null,
		alpha: number,
		worldScale: number,
		crc: ReturnType<typeof Object.assign>,
	) {
		// At extreme zoom, hide individual (non-super) nodes — cluster summary bars
		// rendered by _updateGroupByLabels replace them for a cleaner overview.
		// Super-nodes (collapsed groups) still render as dots since they already
		// represent aggregated clusters.
		const dotRadius = Math.max(1.5, 2 / worldScale);
		const strokeW = Math.max(0.5, 0.8 / worldScale);
		for (const pn of visible) {
			const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
			if (!isSuperNode) {
				pn.gfx.visible = false;
				continue;
			}
			const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
			g.lineStyle(strokeW, 0x000000, nodeAlpha * 0.4);
			g.beginFill(pn.color, nodeAlpha);
			g.drawCircle(pn.data.x, pn.data.y, dotRadius);
			g.endFill();
		}
		g.lineStyle(0);
	}

	/** Mid zoom: all circles (skip shape lookup + gradient for speed).
	 *  SuperNodes (collapsed groups) render at full alpha; individual nodes fade out. */
	private _renderMidZoom(
		g: CanvasGraphics,
		visible: PixiNode[],
		tlFilteredOut: Set<string> | null,
		alpha: number,
		minWorldRadius: number,
		crc: ReturnType<typeof Object.assign>,
	) {
		g.lineStyle(0);
		for (const pn of visible) {
			const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
			const effR = Math.max(pn.radius, minWorldRadius);
			let nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
			// Individual (non-super) nodes get extra fade at mid-zoom to reduce clumping
			if (!isSuperNode) nodeAlpha *= 0.4;
			g.beginFill(pn.color, nodeAlpha);
			g.drawCircle(pn.data.x, pn.data.y, effR);
			g.endFill();
		}
	}

	/** Normal zoom: full shape + optional gradient, with display mode support. */
	private _renderNormalZoom(
		g: CanvasGraphics,
		ctx: NormalZoomCtx,
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		const displayMode = this.host.getNodeDisplayMode();

		if (displayMode !== "card" || (this.host.getCardDisplayConfig().headerStyle ?? "plain") !== "table") {
			this._cleanupCardTextAll(ctx.pixiNodes);
		}

		if (rt.autoLOD && displayMode === "node") {
			this._renderAutoLODNode(g, ctx, crc, rt);
			return;
		}

		switch (displayMode) {
			case "node":
				this._renderNodeOrSemantic(g, ctx, crc, rt);
				break;
			case "card":
				this._renderCardWithDensityFallback(g, ctx, crc, rt);
				break;
			case "donut":
				this._renderDonutMode(g, ctx, crc);
				break;
			case "sunburst-segment":
				this._renderSunburstSegmentMode(g, ctx, crc);
				break;
		}
	}

	/** Auto-LOD node rendering: selects card/compact/semantic/node based on lodLevel. */
	private _renderAutoLODNode(
		g: CanvasGraphics,
		ctx: NormalZoomCtx,
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		if (ctx.lodLevel >= 5) {
			this._renderCardMode(g, ctx, crc, rt);
		} else if (ctx.lodLevel >= 4) {
			this._renderNodeModeAutoLOD(g, ctx, crc, rt);
		} else {
			this._renderNodeOrSemantic(g, ctx, crc, rt);
		}
	}

	/** Delegates to semantic zoom or standard node rendering. */
	private _renderNodeOrSemantic(
		g: CanvasGraphics,
		ctx: NormalZoomCtx,
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		if (this.host.getSemanticZoom?.()) {
			this._renderSemanticZoomMode(g, ctx, crc, rt);
		} else {
			this._renderNodeMode(g, ctx, crc, rt);
		}
	}

	/** Card mode with tiered density fallback to prevent overlap at low zoom/high density. */
	private _renderCardWithDensityFallback(
		g: CanvasGraphics,
		ctx: NormalZoomCtx,
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		const tLow = rt.cardDensityFallbackCount;
		const tHigh = rt.cardDensityFallbackCountHigh;
		if (
			ctx.lodLevel < 3 ||
			(ctx.lodLevel === 3 && ctx.visible.length > tLow) ||
			(ctx.lodLevel === 4 && ctx.visible.length > tHigh)
		) {
			this._renderNodeMode(g, ctx, crc, rt);
		} else {
			this._renderCardMode(g, ctx, crc, rt);
		}
	}

	/** Render compact card background (rounded rect) behind a node for LOD 4.
	 *  A1: Height expands to accommodate sub-labels when present. */
	private _renderCompactCardBg(
		g: CanvasGraphics,
		pn: PixiNode,
		crc: Required<import("../types").CardRenderConfig>,
	): void {
		const w = pn.radius * crc.compactCardWidthRatio;
		// Expand height if sub-labels exist (to house metadata text)
		const subCount = pn.subLabels?.length ?? 0;
		const h = pn.radius * crc.compactCardHeightRatio + subCount * (SUB_LABEL.FONT_SIZE + SUB_LABEL.GAP) * 0.06;
		const x = pn.data.x - w / 2;
		const y = pn.data.y - h / 2;
		g.lineStyle(1, pn.color, crc.compactCardStrokeAlpha);
		g.beginFill(pn.color, crc.compactCardFillAlpha);
		g.drawRoundedRect(x, y, w, h, crc.cardCornerRadius);
		g.endFill();
		g.lineStyle(0);
	}

	/** Node mode with autoLOD level 4 compact card backgrounds. */
	private _renderNodeModeAutoLOD(
		g: CanvasGraphics,
		ctx: {
			visible: PixiNode[];
			pixiNodes: Map<string, PixiNode>;
			tlFilteredOut: Set<string> | null;
			alpha: number;
			nodeCount: number;
			shapeRules: ShapeRule[];
			worldScale: number;
			minWorldRadius: number;
			lodLevel: number;
		},
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		// Render compact card backgrounds first, then normal node shapes on top
		for (const pn of ctx.visible) {
			this._renderCompactCardBg(g, pn, crc);
		}
		// Render nodes on top using standard node mode
		if (this.host.getSemanticZoom?.()) {
			this._renderSemanticZoomMode(g, ctx, crc, rt);
		} else {
			this._renderNodeMode(g, ctx, crc, rt);
		}
	}

	/** Node display mode: shape rendering with gradient and prominence. */
	private _renderNodeMode(
		g: CanvasGraphics,
		ctx: {
			visible: PixiNode[];
			tlFilteredOut: Set<string> | null;
			alpha: number;
			nodeCount: number;
			shapeRules: ShapeRule[];
			worldScale: number;
			minWorldRadius: number;
		},
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		const { visible, tlFilteredOut, alpha, nodeCount, shapeRules, worldScale, minWorldRadius } = ctx;
		const prominentN = rt.prominentTopN;
		const nonPromSat = rt.nonProminentSaturation;
		const useGradient = nodeCount < rt.gradientNodeCount;

		const zoomBoost = computeZoomNodeBoost(worldScale);
		const hc = this.host.isHighContrastMode?.() ?? false;
		const ds: DenseStrokeConfig = {
			zoomLow: rt.denseStrokeZoomLow,
			zoomMid: rt.denseStrokeZoomMid,
			maxWidth: rt.denseStrokeMaxWidth,
			midWidth: rt.denseStrokeMidWidth,
		};
		const baseStrokeW = computeBaseStrokeWidth(worldScale, hc, ds);

		for (const pn of visible) {
			const shape = getNodeShape(pn.data, shapeRules);
			const effR = Math.max(pn.radius * zoomBoost, minWorldRadius);
			const filteredOut = !!(tlFilteredOut && tlFilteredOut.has(pn.data.id));
			const nodeAlpha = computeNodeAlpha(
				alpha,
				filteredOut,
				crc.filteredNodeAlpha,
				worldScale,
				pn.sortRank,
				prominentN,
				rt.fadeLowDegreeFloor,
			);
			const drawColor = resolveNodeDrawColor(pn.color, pn.sortRank, prominentN, nonPromSat, desaturateColor);
			const strokeColor = darkenColor(drawColor, crc.strokeDarken);
			g.lineStyle(baseStrokeW, strokeColor, nodeAlpha * crc.strokeAlpha);
			if (useGradient && shape === "circle") {
				g.beginRadialFill(
					pn.data.x,
					pn.data.y,
					effR,
					lightenColor(drawColor, crc.gradientHighlight),
					darkenColor(drawColor, crc.gradientShadow),
					nodeAlpha,
					nodeAlpha,
				);
			} else {
				g.beginFill(drawColor, nodeAlpha);
			}
			drawShapeAt(g, shape, pn.data.x, pn.data.y, effR);
			g.endFill();

			// Double outline for super nodes (collapsed groups) or top-N prominent nodes
			const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
			const isProminent = pn.sortRank >= 0 && pn.sortRank < prominentN;
			if (isSuper || isProminent) {
				const innerR = effR * rt.superNodeInnerRatio;
				g.lineStyle(rt.superNodeInnerStroke / worldScale, strokeColor, nodeAlpha * rt.superNodeInnerAlpha);
				g.drawCircle(pn.data.x, pn.data.y, innerR);
				g.lineStyle(0);
			}
		}
	}

	/** M1: Semantic zoom — delegates to semantic-zoom-renderer.ts */
	private _renderSemanticZoomMode(
		g: CanvasGraphics,
		ctx: {
			visible: PixiNode[];
			pixiNodes: Map<string, PixiNode>;
			tlFilteredOut: Set<string> | null;
			alpha: number;
			nodeCount: number;
			shapeRules: ShapeRule[];
			worldScale: number;
			minWorldRadius: number;
		},
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		renderSemanticZoomMode(this.host, g, ctx, crc, rt);
	}

	/** Card display mode: delegates to card-renderer.ts */
	private _renderCardMode(
		g: CanvasGraphics,
		ctx: {
			visible: PixiNode[];
			pixiNodes: Map<string, PixiNode>;
			tlFilteredOut: Set<string> | null;
			alpha: number;
			nodeCount: number;
			worldScale: number;
			minWorldRadius: number;
		},
		crc: ReturnType<typeof Object.assign>,
		rt: ReturnType<typeof Object.assign>,
	) {
		renderCardMode(this.host, g, ctx, crc, rt);
	}

	/** Donut mode: delegates to donut-renderer.ts */
	private _renderDonutMode(
		g: CanvasGraphics,
		ctx: {
			visible: PixiNode[];
			tlFilteredOut: Set<string> | null;
			alpha: number;
			minWorldRadius: number;
		},
		crc: ReturnType<typeof Object.assign>,
	) {
		renderDonutMode(this.host, g, ctx, crc);
	}

	/** Sunburst segment mode: delegates to donut-renderer.ts */
	private _renderSunburstSegmentMode(
		g: CanvasGraphics,
		ctx: {
			visible: PixiNode[];
			tlFilteredOut: Set<string> | null;
			alpha: number;
			minWorldRadius: number;
		},
		crc: ReturnType<typeof Object.assign>,
	) {
		renderSunburstSegmentMode(g, ctx, crc);
	}

	// =========================================================================
	// Pass 3: Hold indicator rings
	// =========================================================================
	/** Render hold indicator ring for pinned nodes. */
	private _renderHoldRings(
		g: CanvasGraphics,
		ctx: { visible: PixiNode[]; shapeRules: ShapeRule[]; isMidZoom: boolean },
	) {
		const { visible, shapeRules, isMidZoom } = ctx;
		for (const pn of visible) {
			if (!pn.held) continue;
			const shape = isMidZoom ? ("circle" as const) : getNodeShape(pn.data, shapeRules);
			g.lineStyle(HOLD_RING_LINE_WIDTH, this.host.isDarkTheme() ? 0xffffff : 0x333333, INDICATOR_RING_ALPHA);
			g.beginFill(0, 0);
			drawShapeAt(g, shape, pn.data.x, pn.data.y, pn.radius + HOLD_RING_PADDING);
			g.endFill();
		}
	}

	// =========================================================================
	// PIXI node creation (batched/deferred)
	// =========================================================================
	/**
	 * Create PIXI nodes in batches via a deferred stack.
	 * First batch is created synchronously so the graph is immediately visible,
	 * remaining nodes are pushed onto a stack and processed in idle frames.
	 */
	createPixiNodes(nodes: GraphNode[], nodeR: (n: GraphNode) => number, nodeColor: (n: GraphNode) => number) {
		// Activate progressive fade-in only for large initial loads (> 500
		// nodes). Smaller populates (group expand, filter changes) rely on
		// GraphViewContainer._fadeInTween for their own ripple animation —
		// running both would fight each other for the same sprite.scale.
		if (nodes.length > 500) {
			this._progressiveFade = new Map();
		} else {
			this._progressiveFade = null;
		}
		const pixiNodes = this.host.getPixiNodes();
		// Clean up leader lines, tag labels, and sub-labels before clearing
		for (const pn of pixiNodes.values()) {
			if (pn.leaderLine) {
				pn.leaderLine.destroy();
				pn.leaderLine = null;
			}
			if (pn.tagLabel) {
				pn.tagLabel.destroy();
				pn.tagLabel = null;
			}
			if (pn.subLabels) {
				for (const sl of pn.subLabels) sl.destroy();
				pn.subLabels = [];
			}
		}
		pixiNodes.clear();
		this.cancelDeferredBatch();

		const degrees = this.host.getDegrees();

		// LABEL-LAZY: during the initial sprite populate we only create labels
		// for a high-degree subset (top ~15% by degree). The rest are filled in
		// by enrichLabelsDeferred() after the layout settles. Creating a
		// Canvas text + measureText call for each of 2,400 nodes was dominant
		// in first-load profiling (~3 ms/node × 40 batches ≈ 4-5 s of pure
		// label work, most of which was then hidden by the overlap culler).
		//
		// Nodes that get interacted with before enrichment (hover, focus) fall
		// back to lazy label creation in LabelManager — no functional loss.
		const degValues = nodes.map((n) => degrees.get(n.id) || 0).sort((a, b) => b - a);
		const topIdx = Math.max(0, Math.floor(degValues.length * 0.15) - 1);
		this.pendingLabelThreshold = Math.max(2, degValues[topIdx] ?? 2);

		// Cache maxDeg once — avoids O(n²) recomputation inside createSinglePixiNode
		this._cachedMaxDeg = degValues.length > 0 ? degValues[0] : 1;
		// HM: Cache maxBodyLength for content-proportional card sizing
		let mbl = 0;
		for (const n of nodes) {
			const bl = n.bodyLength ?? 0;
			if (bl > mbl) mbl = bl;
		}
		this._cachedMaxBodyLength = mbl;

		// Sort by degree descending — high-degree nodes render first (most important)
		const sorted = [...nodes].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));

		// Immediate batch: create enough nodes for an initial visible graph.
		// For small graphs (e.g. a group-expand revealing ~100 members) it is
		// faster to build all sprites synchronously than to pay deferred-batch
		// scheduling overhead — the per-batch setTimeout round-trip costs
		// several frames of idle time per chunk.
		const SYNC_ALL_THRESHOLD = 500;
		const IMMEDIATE_BATCH =
			sorted.length <= SYNC_ALL_THRESHOLD ? sorted.length : Math.min(IMMEDIATE_BATCH_SIZE, sorted.length);
		const world = this.host.getWorldContainer()!;

		for (let i = 0; i < IMMEDIATE_BATCH; i++) {
			this.createSinglePixiNode(sorted[i], nodeR, nodeColor, world);
		}
		// Push remaining nodes onto the deferred stack
		if (sorted.length > IMMEDIATE_BATCH) {
			this.pendingNodes = sorted.slice(IMMEDIATE_BATCH);
			this.pendingNodeR = nodeR;
			this.pendingNodeColor = nodeColor;
			this.scheduleDeferredBatch();
		} else {
			this.cullOverlappingLabels();
			// Defer onAllPixiNodesCreated so any post-createPixiNodes setup
			// in the host (alpha(0).stop(), force application) completes before
			// the callback restarts the simulation. Without this, the sync path
			// would restart the sim before the host has finished configuring it.
			this.host.timers.setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0);
		}
	}

	private createSinglePixiNode(
		n: GraphNode,
		nodeR: (n: GraphNode) => number,
		nodeColor: (n: GraphNode) => number,
		world: CanvasContainer,
	) {
		const container = new CanvasContainer();
		container.x = n.x;
		container.y = n.y;

		const isSuperNode = !!(n.collapsedMembers && n.collapsedMembers.length > 0);
		const rtNode = this.getCachedRT();
		const maxR = rtNode.maxNodeRadius > 0 ? rtNode.maxNodeRadius : Infinity;
		const ns = this.host.getNodeSize?.() ?? nodeR(n);
		const nodeDeg = this.host.getDegrees().get(n.id) || 0;
		const r = effectiveRadius(
			n,
			ns,
			nodeDeg,
			maxR,
			rtNode.minNodeRadius,
			this._cachedMaxDeg,
			rtNode.nodeSizeByDegree,
			n.bodyLength ?? 0,
			this._cachedMaxBodyLength ?? 0,
			rtNode.cardContentScale,
		);
		const color = nodeColor(n);
		const circle = new CanvasGraphics();
		if (isSuperNode) {
			this._drawSuperNodeCircle(circle, color, r);
		} else {
			circle.visible = false;
		}
		container.addChild(circle);

		const deg = this.host.getDegrees().get(n.id) || 0;
		let label: CanvasText | null = null;
		let tagLabel: CanvasText | null = null;
		if (isSuperNode || deg > this.pendingLabelThreshold) {
			const rt = this.getCachedRT();
			label = this._createNodeLabel(n, rt, isSuperNode, color, deg, r);
			container.addChild(label);
			if (rt.tagLabelShow && n.tags && n.tags.length > 0 && !isSuperNode) {
				tagLabel = this._createTagLabel(n, rt, r);
				container.addChild(tagLabel);
			}
		}

		const subLabels = this._createSubLabels(n, isSuperNode, label, tagLabel, r);
		for (const sl of subLabels) container.addChild(sl);

		if (!this._skipNodeRendering) world.addChild(container);

		// Progressive fade-in: each new sprite starts invisible and tween'd
		// up by tickProgressiveFadeIn (hooked into renderTick). Creation-time
		// stagger gives a natural trickle effect across the 2-second populate
		// window without us having to manage per-node delays.
		if (this._progressiveFade) {
			container.scale.set(0);
			container.alpha = 0;
			this._progressiveFade.set(n.id, performance.now());
		}

		this.host.getPixiNodes().set(n.id, {
			data: n,
			gfx: container,
			circle,
			label,
			tagLabel,
			subLabels,
			hoverLabel: null,
			leaderLine: null,
			radius: r,
			color,
			held: false,
			sortRank: -1,
			priorityScore: -1,
			minShowZoom: 1.0,
			labelWasVisible: false,
			hoverForcedLabel: false,
		});
	}

	/**
	 * Advance the progressive fade-in one frame. Called from renderTick every
	 * tick while _progressiveFade has entries. Each sprite uses easeOutCubic
	 * over PROGRESSIVE_FADE_DURATION_MS; completed sprites are removed from
	 * the map and when the map drains we nil it out so the hot path skips
	 * the Map lookup entirely.
	 */
	private tickProgressiveFadeIn(): boolean {
		const fade = this._progressiveFade;
		if (!fade || fade.size === 0) return false;
		const now = performance.now();
		const dur = RenderPipeline.PROGRESSIVE_FADE_DURATION_MS;
		const pixiNodes = this.host.getPixiNodes();
		// Iterate via snapshot so we can delete inside the loop
		for (const [id, startMs] of fade) {
			const pn = pixiNodes.get(id);
			if (!pn) {
				fade.delete(id);
				continue;
			}
			const t = Math.min((now - startMs) / dur, 1);
			const eased = 1 - Math.pow(1 - t, 3);
			const alpha = Math.min(1, t * 1.4);
			pn.gfx.scale.set(eased);
			pn.gfx.alpha = alpha;
			if (t >= 1) {
				pn.gfx.scale.set(1);
				pn.gfx.alpha = 1;
				fade.delete(id);
			}
		}
		if (fade.size === 0) {
			this._progressiveFade = null;
			return false;
		}
		return true;
	}

	private _drawSuperNodeCircle(circle: CanvasGraphics, color: number, r: number) {
		const rt = this.getCachedRT();
		circle.lineStyle(rt.superNodeOuterStroke, color, 1);
		circle.drawCircle(0, 0, r);
		circle.lineStyle(rt.superNodeInnerStroke, color, rt.superNodeInnerAlpha);
		circle.drawCircle(0, 0, r * rt.superNodeInnerRatio);
		circle.beginFill(color, SUPER_NODE_FILL_ALPHA);
		circle.drawCircle(0, 0, r);
		circle.endFill();
		circle.visible = true;
	}

	private _computeLabelColors(
		rt: Required<RenderThresholds>,
		isSuperNode: boolean,
		color: number,
	): { labelBg: number; labelFill: number } {
		return computeLabelColors(this.host.isDarkTheme(), rt, isSuperNode, color);
	}

	private _createNodeLabel(
		n: GraphNode,
		rt: Required<RenderThresholds>,
		isSuperNode: boolean,
		color: number,
		deg: number,
		r: number,
	): CanvasText {
		const maxDeg = this._cachedMaxDeg || 1;
		const importance = maxDeg > 0 ? Math.min(1, deg / maxDeg) : 0;
		const scaledFontSize = isSuperNode
			? rt.superNodeFontSize
			: Math.round(rt.nodeLabelFontSizeMin + importance * (rt.nodeLabelFontSizeMax - rt.nodeLabelFontSizeMin));
		const { labelBg, labelFill } = this._computeLabelColors(rt, isSuperNode, color);
		let displayLabel = truncateLabel(n.label, rt.labelMaxChars);
		const iconCfg = this.host.getNodeIconConfig?.();
		if (iconCfg && iconCfg.field && n.meta) {
			const icon = iconCfg.map[String(n.meta[iconCfg.field] ?? "")];
			if (icon) displayLabel = `${icon} ${displayLabel}`;
		}
		const label = new CanvasText(displayLabel, {
			fontSize: scaledFontSize,
			fill: labelFill,
			fontWeight: isSuperNode ? "bold" : "500",
			fontFamily: CARD_FONT_FAMILY,
		});
		label.bgColor = labelBg;
		const baseBgAlpha = isSuperNode ? rt.superNodeLabelBgAlpha : rt.labelBgAlpha;
		label.bgAlpha = this.host.isDarkTheme() ? baseBgAlpha : Math.min(1.0, baseBgAlpha + 0.1);
		label.bgPadX = isSuperNode ? LABEL_PAD.SUPER_X : LABEL_PAD.REGULAR_X;
		label.bgPadY = isSuperNode ? LABEL_PAD.SUPER_Y : LABEL_PAD.REGULAR_Y;
		label.cornerRadius = rt.labelHaloCornerRadius;
		label.strokeColor = rt.labelStrokeColor;
		label.strokeWidth = rt.labelStrokeWidth;
		if (rt.labelZonePlacement) {
			const placement = this.computeZonePlacement(n, r, rt.labelZoneOffset);
			label.x = placement.x;
			label.y = placement.y;
			label.anchor.set(placement.anchorX, 0);
		} else {
			label.x = r + LABEL_LAYOUT.EDGE_OFFSET;
			label.y = -(r * LABEL_Y_OFFSET_FACTOR + LABEL_LAYOUT.EDGE_OFFSET);
		}
		return label;
	}

	private _createTagLabel(n: GraphNode, rt: Required<RenderThresholds>, r: number): CanvasText {
		const tagText = n
			.tags!.slice(0, rt.tagLabelMaxTags)
			.map((t) => `#${t}`)
			.join(" ");
		const accentColor = this.host.getAccentColor?.() ?? 0x818cf8;
		const tagLabel = new CanvasText(tagText, {
			fontSize: rt.tagLabelFontSize,
			fill: accentColor,
			fontWeight: "400",
			fontFamily: CARD_FONT_FAMILY,
		});
		tagLabel.alpha = rt.tagLabelAlpha;
		tagLabel.bgColor = rt.labelBgColor;
		tagLabel.bgAlpha = rt.labelBgAlpha * LABEL_LAYOUT.TAG_BG_ALPHA_DAMPEN;
		tagLabel.bgPadX = LABEL_PAD.TAG_X;
		tagLabel.bgPadY = LABEL_PAD.TAG_Y;
		tagLabel.cornerRadius = rt.labelHaloCornerRadius;
		tagLabel.anchor.set(0.5, 0);
		tagLabel.x = 0;
		tagLabel.y = r + rt.tagLabelOffset;
		tagLabel.visible = false;
		return tagLabel;
	}

	private _createSubLabels(
		n: GraphNode,
		isSuperNode: boolean,
		label: CanvasText | null,
		tagLabel: CanvasText | null,
		r: number,
	): CanvasText[] {
		const subLabels: CanvasText[] = [];
		const subFieldsRaw = this.host.getNodeSubLabelFields?.() ?? "";
		if (!subFieldsRaw || !label || isSuperNode) return subLabels;
		const srt = this.getCachedRT();
		const fields = subFieldsRaw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		let yOffset = tagLabel ? r + srt.tagLabelOffset + srt.tagLabelFontSize + SUB_LABEL.GAP : r + srt.tagLabelOffset;
		for (const field of fields) {
			const val = this.host.getNodeProperty
				? this.host.getNodeProperty(n.id, field)
				: n.meta?.[field] !== undefined && n.meta?.[field] !== null
					? String(n.meta[field])
					: undefined;
			if (!val) continue;
			const subLabel = new CanvasText(val, {
				fontSize: SUB_LABEL.FONT_SIZE,
				fill: this.host.isDarkTheme() ? 0xbbbbbb : 0x555555,
				fontWeight: "400",
				fontFamily: CARD_FONT_FAMILY,
			});
			subLabel.alpha = SUB_LABEL.ALPHA;
			subLabel.bgColor = srt.labelBgColor;
			subLabel.bgAlpha = srt.labelBgAlpha * LABEL_LAYOUT.TAG_BG_ALPHA_DAMPEN;
			subLabel.bgPadX = LABEL_PAD.TAG_X;
			subLabel.bgPadY = LABEL_PAD.TAG_Y;
			subLabel.cornerRadius = srt.labelHaloCornerRadius;
			subLabel.anchor.set(0.5, 0);
			subLabel.x = 0;
			subLabel.y = yOffset;
			subLabel.visible = false;
			subLabels.push(subLabel);
			yOffset += SUB_LABEL.FONT_SIZE + SUB_LABEL.GAP;
		}
		return subLabels;
	}

	/** Process the next batch of deferred nodes from the stack */
	private processDeferredBatch = () => {
		this.deferredBatchId = null;
		const world = this.host.getWorldContainer();
		if (!world || !this.pendingNodeR || !this.pendingNodeColor) return;
		if (this.pendingNodes.length === 0) return;

		const BATCH_SIZE = DEFERRED_BATCH_SIZE;
		const batch = this.pendingNodes.splice(0, BATCH_SIZE);

		for (const n of batch) {
			this.createSinglePixiNode(n, this.pendingNodeR, this.pendingNodeColor, world);
		}

		if (this.pendingNodes.length > 0) {
			// Present the canvas so newly-created sprites become visible and
			// the progressive fade-in animation has something to animate each
			// frame. This is the cheap transform-only repaint (no scene
			// rebuild) — calling markDirty(true) per batch used to trigger
			// a full 100-200 ms re-render each time, bloating total
			// populate to 20+ seconds.
			this._transformOnlyDirty = true;
			this.idleFrames = 0;
			this.wakeRenderLoop();
			this.scheduleDeferredBatch();
		} else {
			this.pendingNodeR = null;
			this.pendingNodeColor = null;
			this.cullOverlappingLabels();
			this.markDirty(true); // single full redraw when all nodes are in
			this.host.onAllPixiNodesCreated?.();
			// Kick the label-enrichment pass after the simulation has had a
			// chance to settle. 2.5 s is long enough for a typical large-
			// graph force simulation to reach alphaMin; if the user hovers
			// a labelless node before then, LabelManager's hoverForcedLabel
			// path still works via null-label-tolerant checks.
			this.host.timers.setTimeout(() => this.enrichLabelsDeferred(), 2500);
		}
	};

	/**
	 * Fill in labels for nodes that were skipped during the initial sprite
	 * populate (createPixiNodes uses a high pendingLabelThreshold to cut
	 * first-load time). Runs as a setTimeout-scheduled chunked pass so UI
	 * stays responsive while the remaining ~80% of labels are created in
	 * the background. No-op if all nodes already have labels.
	 */
	private _enrichmentCancelId: ReturnType<typeof setTimeout> | null = null;
	private enrichLabelsDeferred(): void {
		if (this._enrichmentCancelId !== null) {
			clearTimeout(this._enrichmentCancelId);
			this._enrichmentCancelId = null;
		}
		const pixiNodes = this.host.getPixiNodes();
		const todo: Array<string> = [];
		for (const [id, pn] of pixiNodes) if (!pn.label) todo.push(id);
		if (todo.length === 0) return;

		this.pendingLabelThreshold = 0; // enrichment pass wants everything
		const rt = this.getCachedRT();
		const ENRICH_BATCH = 80;

		const processNext = () => {
			this._enrichmentCancelId = null;
			const batch = todo.splice(0, ENRICH_BATCH);
			for (const id of batch) {
				const pn = pixiNodes.get(id);
				if (!pn || pn.label) continue;
				const deg = this.host.getDegrees().get(pn.data.id) || 0;
				const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
				pn.label = this._createNodeLabel(pn.data, rt, isSuperNode, pn.color, deg, pn.radius);
				pn.gfx.addChild(pn.label);
				if (rt.tagLabelShow && pn.data.tags && pn.data.tags.length > 0 && !isSuperNode && !pn.tagLabel) {
					pn.tagLabel = this._createTagLabel(pn.data, rt, pn.radius);
					pn.gfx.addChild(pn.tagLabel);
				}
			}
			if (todo.length > 0) {
				this._enrichmentCancelId = setTimeout(processNext, 0);
			} else {
				this.cullOverlappingLabels();
				this.markDirty(true);
			}
		};
		this._enrichmentCancelId = setTimeout(processNext, 0);
	}

	private scheduleDeferredBatch() {
		if (this.deferredBatchId !== null) return;
		// Use setTimeout(0) rather than requestAnimationFrame: d3-force's timer
		// also runs on rAF, so both compete for each 16ms frame slot. On a
		// 2,400-node graph that contention stretched full population from an
		// expected ~2s to >2 minutes. setTimeout(0) runs as a macrotask between
		// rAF ticks, breaking the contention and also yielding to input events
		// between batches.
		this.deferredBatchId = setTimeout(this.processDeferredBatch, 0) as unknown as ReturnType<typeof setTimeout>;
	}

	cancelDeferredBatch() {
		if (this.deferredBatchId !== null) {
			clearTimeout(this.deferredBatchId as unknown as ReturnType<typeof setTimeout>);
			this.deferredBatchId = null;
		}
		this.pendingNodes = [];
		this.pendingNodeR = null;
		this.pendingNodeColor = null;
	}

	// =========================================================================
	// Zone-based label placement — place label in the largest angular gap
	// among adjacent nodes to maximize readability.
	// =========================================================================
	/** Return the last computed autoLOD level (0-5). Used by LabelManager for LOD 2 filtering. */
	getLastLodLevel(): number {
		return this._lastLodLevel;
	}

	/** Set whether to skip per-node rendering (for non-graph viewModes). */
	setSkipNodeRendering(skip: boolean): void {
		this._skipNodeRendering = skip;
	}

	/** Whether autoLOD is currently active. */
	isAutoLODActive(): boolean {
		const rt = this.getCachedRT();
		return rt.autoLOD;
	}

	computeZonePlacement(
		node: GraphNode,
		nodeRadius: number,
		offset: number,
	): { x: number; y: number; anchorX: number } {
		const adj = this.host.getAdjacency?.();
		const pixiNodes = this.host.getPixiNodes();
		const neighbors = adj?.get(node.id);

		// Default: place to the right if no adjacency info
		if (!neighbors || neighbors.size === 0) {
			return { x: nodeRadius + offset, y: -(nodeRadius * LABEL_Y_OFFSET_FACTOR), anchorX: 0 };
		}

		// Collect angles to all neighboring nodes AND positionally proximate nodes.
		const angles: number[] = [];
		const rtZone = this.getCachedRT();
		const proximityR = (nodeRadius + offset) * rtZone.labelZoneProximityFactor;
		for (const nid of neighbors) {
			const pn = pixiNodes.get(nid);
			if (!pn) continue;
			const dx = pn.data.x - node.x;
			const dy = pn.data.y - node.y;
			if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
			angles.push(Math.atan2(dy, dx));
		}
		// Also include nearby non-linked nodes within proximity radius.
		const proxCandidates: { angle: number; dist: number }[] = [];
		for (const [nid, pn] of pixiNodes) {
			if (nid === node.id || neighbors.has(nid)) continue;
			const dx = pn.data.x - node.x;
			const dy = pn.data.y - node.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < proximityR && dist > 0.01) {
				proxCandidates.push({ angle: Math.atan2(dy, dx), dist });
			}
		}
		proxCandidates.sort((a, b) => a.dist - b.dist);
		for (let i = 0; i < Math.min(ZONE_MAX_PROXIMITY_CANDIDATES, proxCandidates.length); i++) {
			angles.push(proxCandidates[i].angle);
		}

		return computeZonePlacementFromAngles(angles, nodeRadius, offset, {
			narrowThreshold: rtZone.labelGapScaleNarrowThreshold,
			mediumThreshold: rtZone.labelGapScaleMediumThreshold,
			narrowFactor: rtZone.labelGapScaleNarrow,
			mediumFactor: rtZone.labelGapScaleMedium,
		});
	}

	// =========================================================================
	// Label overlap culling — hide labels that overlap higher-priority ones
	// =========================================================================
	cullOverlappingLabels() {
		const rt = this.getCachedRT();
		if (!rt.labelOverlapCulling) {
			this.host.updateDensityCulledBadge?.(0);
			this._lastCullStats = { totalLabels: 0, visibleLabels: 0, culledLabels: 0, collisionRate: 0 };
			return;
		}

		const zoom = this.host.getWorldContainer()?.scale.x ?? 1;
		const zoomMarginScale = zoom < 0.5 ? Math.min(4, 1 + (0.5 - zoom) * 6) : 1;
		const margin = rt.labelOverlapMargin * zoomMarginScale;
		const pixiNodes = this.host.getPixiNodes();
		const degrees = this.host.getDegrees();

		const dims = this.host.getCanvasDimensions();
		const world = this.host.getWorldContainer();
		const clip = world
			? { canvasWidth: dims.width, canvasHeight: dims.height, worldX: world.x, worldY: world.y }
			: null;
		const rects = collectLabelRects(
			pixiNodes,
			degrees,
			zoom,
			rt.labelOverlapMaxScreenW,
			rt.labelOverlapMaxScreenH,
			clip,
		);
		const grid = new SpatialHashGrid<CullLabelRect>(OVERLAP_GRID_CELL_SIZE, margin);

		this._reserveDomExclusionZones(grid);
		this._reserveEnclosureLabelZones(grid);

		rects.sort((a, b) => {
			const aBoost = a.pn.hoverForcedLabel ? 80 : 0;
			const bBoost = b.pn.hoverForcedLabel ? 80 : 0;
			return b.pn.priorityScore + bBoost - (a.pn.priorityScore + aBoost);
		});

		const placed: CullLabelRect[] = [];
		const drawLeader = rt.labelLeaderLines;
		const llAlpha = rt.labelLeaderLineAlpha;
		const llWidth = rt.labelLeaderLineWidth;

		if (this._leaderState.count > 0) {
			for (const pn of pixiNodes.values()) {
				if (pn.leaderLine) {
					pn.leaderLine.clear();
					pn.leaderLine.visible = false;
				}
			}
			this._leaderState.count = 0;
		}

		for (const r of rects) {
			if (!grid.checkOverlap(r)) {
				placed.push(r);
				grid.insert(r);
				continue;
			}
			const found = tryDisplaceLabel(
				r,
				zoom,
				rt.labelMaxDisplacementRatio,
				grid,
				drawLeader,
				llWidth,
				llAlpha,
				this._leaderState,
			);
			if (found) {
				placed.push(found);
				grid.insert(found);
			} else {
				this._fadeOutLabel(r.label, rt.labelFadeRate);
			}
		}

		this._runDensityCulling(rt, placed, zoom);

		guaranteePlacementFloor(
			rt,
			rects,
			placed,
			grid,
			zoom,
			margin,
			rt.labelMinNonSuper,
			drawLeader,
			llWidth,
			llAlpha,
			this._leaderState,
		);
		drawCounterScaleLeaderLines(rt, placed, zoom, drawLeader, llWidth, llAlpha, this._leaderState);

		const totalVisible = rects.filter((r) => r.label.visible).length;
		const densityCulled = rects.length - totalVisible;
		this.host.updateDensityCulledBadge?.(densityCulled);
		this._lastCullStats = {
			totalLabels: rects.length,
			visibleLabels: totalVisible,
			culledLabels: densityCulled,
			collisionRate: rects.length > 0 ? densityCulled / rects.length : 0,
		};
	}

	private _fadeOutLabel(label: CanvasText, fadeRate?: number) {
		label.alpha = Math.max(0, (label.alpha ?? 1) - (fadeRate ?? 0.15));
		if (label.alpha <= 0.05) label.visible = false;
	}

	private _reserveDomExclusionZones(grid: SpatialHashGrid<CullLabelRect>) {
		const app = this.host.getPixiApp();
		if (!app?.view) return;
		const canvasRect = app.view.getBoundingClientRect();
		const panels = [".gi-graph-stats", ".gi-legend", ".gi-minimap-wrap", ".gi-node-info"];
		for (const sel of panels) {
			const el = app.view.parentElement?.querySelector<HTMLElement>(sel);
			if (!el || el.style.display === "none" || !el.offsetParent) continue;
			const r = el.getBoundingClientRect();
			grid.insert({
				x: r.left - canvasRect.left,
				y: r.top - canvasRect.top,
				w: r.width,
				h: r.height,
				label: null as unknown as CanvasText,
				pn: null as unknown as PixiNode,
				degree: 999,
				isSuper: false,
			});
		}
	}

	private _reserveEnclosureLabelZones(grid: SpatialHashGrid<CullLabelRect>) {
		const encLabels = this.host.getEnclosureLabels?.();
		if (!encLabels || encLabels.size === 0) return;
		const world = this.host.getWorldContainer();
		if (!world) return;
		for (const lbl of encLabels.values()) {
			if (!lbl.visible) continue;
			const sx = lbl.x * world.scale.x + world.x;
			const sy = lbl.y * world.scale.y + world.y;
			const sw = (lbl.width ?? 60) * lbl.scale.x;
			const sh = (lbl.height ?? 14) * lbl.scale.y;
			grid.insert({
				x: sx - sw / 2,
				y: sy - sh / 2,
				w: sw,
				h: sh,
				label: null as unknown as CanvasText,
				pn: null as unknown as PixiNode,
				degree: 500,
				isSuper: false,
			});
		}
	}

	private _runDensityCulling(rt: Required<RenderThresholds>, placed: CullLabelRect[], zoom: number) {
		if (placed.length <= 10) return;
		const densityMinDist = computeDensityMinDist(
			rt.labelDensityMinScreenDist,
			rt.labelDensityMaxDist,
			zoom,
			rt.labelDensityZoomThreshold,
		);
		const densityMinDist2 = densityMinDist * densityMinDist;
		placed.sort(
			(a, b) =>
				b.pn.priorityScore +
				(b.pn.hoverForcedLabel ? 80 : 0) -
				(a.pn.priorityScore + (a.pn.hoverForcedLabel ? 80 : 0)),
		);
		const kept: CullLabelRect[] = [];
		const bucketSize = Math.max(densityMinDist, 50);
		const densityGrid = new Map<string, { cx: number; cy: number }[]>();
		for (const r of placed) {
			const cx = r.x + r.w / 2;
			const cy = r.y + r.h / 2;
			if (this._isDensityTooClose(cx, cy, bucketSize, densityMinDist2, densityGrid)) {
				this._fadeOutLabel(r.label, rt.labelFadeRate);
			} else {
				kept.push(r);
				const key = `${Math.floor(cx / bucketSize)},${Math.floor(cy / bucketSize)}`;
				const arr = densityGrid.get(key);
				if (arr) arr.push({ cx, cy });
				else densityGrid.set(key, [{ cx, cy }]);
			}
		}
		placed.length = 0;
		placed.push(...kept);
	}

	private _isDensityTooClose(
		cx: number,
		cy: number,
		bucketSize: number,
		minDist2: number,
		grid: Map<string, { cx: number; cy: number }[]>,
	): boolean {
		return isDensityTooClose(cx, cy, bucketSize, minDist2, grid);
	}

	/** §0.1 Quality stats from last cullOverlappingLabels run */
	get cullStats() {
		return this._lastCullStats;
	}
	private _lastCullStats = { totalLabels: 0, visibleLabels: 0, culledLabels: 0, collisionRate: 0 };
}

// CullOverlapGrid interface removed — using SpatialHashGrid<CullLabelRect> directly
