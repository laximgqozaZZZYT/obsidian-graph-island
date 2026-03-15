import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { GraphNode, NodeDisplayMode, CardDisplayConfig, DonutDisplayConfig, CardRenderConfig, RenderThresholds } from "../types";
import { DEFAULT_CARD_RENDER_CONFIG, DEFAULT_RENDER_THRESHOLDS } from "../types";
import type { PixiNode } from "./InteractionManager";
import { getNodeShape, drawShape, drawShapeAt, getNodeDisplayConfig } from "../utils/node-shapes";
import type { ShapeRule } from "../utils/node-shapes";
import { effectiveRadius } from "../layouts/cluster-force";
import { clamp } from "../utils/geometry";

// ---------------------------------------------------------------------------
// CardText — CanvasText with a marker flag for card-mode text children
// ---------------------------------------------------------------------------
/** CanvasText child that belongs to a card-mode node (header or field row). */
interface CardText extends CanvasText {
  _isCardText: true;
}

/** Type guard: is the given canvas child a CardText? */
function isCardText(obj: unknown): obj is CardText {
  return obj instanceof CanvasText && (obj as CardText)._isCardText === true;
}

/** Mark a CanvasText as card text and return it typed as CardText. */
function markAsCardText(t: CanvasText): CardText {
  (t as CardText)._isCardText = true;
  return t as CardText;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EDGE_REDRAW_SKIP = 3;

/** Number of frames the render loop idles before detaching the ticker */
const IDLE_FRAME_DETACH_THRESHOLD = 60;

/** Screen-space node radius estimate used for LOD tier calculations (px) */
const NODE_SCREEN_PX_BASE = 30;

/** Minimum world radius applied at non-extreme zoom to keep nodes visible */
const MIN_WORLD_RADIUS_PX = 1.5;

/** Viewport culling margin in world units (divided by worldScale) */
const VIEWPORT_CULL_MARGIN_PX = 60;

/** Maximum number of labels created before dynamically raising degree threshold */
const MAX_LABEL_COUNT = 300;

/** Default minimum degree threshold for showing node labels */
const DEFAULT_LABEL_DEGREE_THRESHOLD = 3;

/** Number of nodes created synchronously before deferring the rest */
const IMMEDIATE_BATCH_SIZE = 200;

/** Number of nodes processed per deferred batch frame */
const DEFERRED_BATCH_SIZE = 100;

/** Sunburst segment default arc angle in degrees */
const SUNBURST_SEGMENT_ARC_DEG = 30;

/** Hold indicator ring line width */
const HOLD_RING_LINE_WIDTH = 2;
/** Hold indicator ring padding beyond node radius */
const HOLD_RING_PADDING = 4;

/** Zone placement text-anchor cosine thresholds */
const ZONE_ANCHOR_COS_POSITIVE = 0.3;
const ZONE_ANCHOR_COS_NEGATIVE = -0.3;

/** Maximum proximity candidates for zone placement to limit O(n^2) cost */
const ZONE_MAX_PROXIMITY_CANDIDATES = 20;

/** Keyboard focus ring dashed segments */
const KB_FOCUS_SEGMENTS = 12;
/** Keyboard focus ring gap fraction (0..1) */
const KB_FOCUS_GAP_FRACTION = 0.4;
/** Keyboard focus ring radius multiplier */
const KB_FOCUS_RADIUS_FACTOR = 1.6;

/** Super node fill alpha */
const SUPER_NODE_FILL_ALPHA = 0.3;

/** Donut/sunburst ring stroke darken factor (applied via darkenColor) */
const RING_STROKE_DARKEN = 0.4;
/** Donut/sunburst ring stroke alpha multiplier */
const RING_STROKE_ALPHA = 0.5;
/** Hold ring / pathfinder ring stroke alpha */
const INDICATOR_RING_ALPHA = 0.9;
/** Pathfinder line width for start/end nodes */
const PF_ENDPOINT_LINE_WIDTH = 3;
/** Pathfinder line width for intermediate path nodes */
const PF_INTERMEDIATE_LINE_WIDTH = 2;
/** Pathfinder radius padding for start/end nodes */
const PF_ENDPOINT_RADIUS_PAD = 6;
/** Pathfinder radius padding for intermediate path nodes */
const PF_INTERMEDIATE_RADIUS_PAD = 3;

/** Keyboard focus ring line width */
const KB_FOCUS_LINE_WIDTH = 2.5;
/** Keyboard focus ring line alpha */
const KB_FOCUS_LINE_ALPHA = 0.95;

/** Character width estimation factor relative to font size */
const LABEL_CHAR_WIDTH_FACTOR = 0.6;
/** Line height factor for label bounding box estimation */
const LABEL_LINE_HEIGHT_FACTOR = 1.3;
/** Label default Y offset factor (fraction of node radius) */
const LABEL_Y_OFFSET_FACTOR = 0.4;
/** Label default X/Y offset from node edge (px) */
const LABEL_EDGE_OFFSET = 2;

/** Super node label background pill padding (px) */
const SUPER_LABEL_PAD_X = 10;
const SUPER_LABEL_PAD_Y = 4;
/** Regular node label background pill padding (px) */
const REGULAR_LABEL_PAD_X = 8;
const REGULAR_LABEL_PAD_Y = 3;
/** Tag label background pill padding (px) */
const TAG_LABEL_PAD_X = 4;
const TAG_LABEL_PAD_Y = 1;
/** Tag label background alpha dampen relative to main label bg alpha */
const TAG_BG_ALPHA_DAMPEN = 0.7;

/** Card icon size ratio relative to header height */
const CARD_ICON_SIZE_RATIO = 0.55;
/** Card icon fold triangle ratio relative to icon size */
const CARD_ICON_FOLD_RATIO = 0.28;
/** Card icon outline stroke alpha */
const CARD_ICON_OUTLINE_ALPHA = 0.7;
/** Card icon body fill alpha */
const CARD_ICON_FILL_ALPHA = 0.25;
/** Card icon fold fill alpha */
const CARD_ICON_FOLD_ALPHA = 0.15;

/** Spatial hash grid cell size for label overlap detection (screen px) */
const OVERLAP_GRID_CELL_SIZE = 120;
/** Spatial hash grid prime for cell key computation */
const OVERLAP_GRID_HASH_PRIME = 100003;

/** Glow attenuation node count threshold (above this, glow starts fading) */
const GLOW_ATTENUATE_THRESHOLD = 300;
/** Glow attenuation range (from threshold to threshold+range, glow fades to zero) */
const GLOW_ATTENUATE_RANGE = 500;
/** Glow radius attenuation max factor */
const GLOW_RADIUS_ATTENUATE_FACTOR = 0.7;
/** P90 percentile fraction for hub node glow detection */
const GLOW_P90_FRACTION = 0.9;

// ---------------------------------------------------------------------------
// darkenColor utility (shared with GraphViewContainer)
// ---------------------------------------------------------------------------
/** Darken a hex color by mixing toward black. factor 0 = unchanged, 1 = black. */
export function darkenColor(hex: number, factor: number): number {
  const r = ((hex >> 16) & 0xff) * (1 - factor);
  const g = ((hex >> 8) & 0xff) * (1 - factor);
  const b = (hex & 0xff) * (1 - factor);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** Lighten a hex color by mixing toward white. factor 0 = unchanged, 1 = white. */
function lightenColor(hex: number, factor: number): number {
  const r = ((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * factor;
  const g = ((hex >> 8) & 0xff) + (255 - ((hex >> 8) & 0xff)) * factor;
  const b = (hex & 0xff) + (255 - (hex & 0xff)) * factor;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** Desaturate a 0xRRGGBB color toward gray. factor=1 is original, factor=0 is fully gray. */
function desaturateColor(color: number, factor: number): number {
  if (factor >= 1) return color;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  const nr = Math.round(gray + (r - gray) * factor);
  const ng = Math.round(gray + (g - gray) * factor);
  const nb = Math.round(gray + (b - gray) * factor);
  return (nr << 16) | (ng << 8) | nb;
}

// ---------------------------------------------------------------------------
// RenderHost — the interface the RenderPipeline needs from its parent
// ---------------------------------------------------------------------------
export interface RenderHost {
  /** Get the CanvasApp instance */
  getPixiApp(): CanvasApp | null;
  /** Get the PIXI node map */
  getPixiNodes(): Map<string, PixiNode>;
  /** Get the world container */
  getWorldContainer(): CanvasContainer | null;
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
  /** Draw orbit rings */
  drawOrbitRings(): void;
  /** Draw enclosures */
  drawEnclosures(): void;
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
  /** Draw arrangement guide lines */
  drawGuideLines(): void;
  /** Draw per-group route lines (transit map style) */
  drawRouteLines(): void;
  /** Draw group grid overlay */
  drawGroupGrid(): void;
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
}

// ---------------------------------------------------------------------------
// RenderPipeline — owns the PIXI render loop, node creation, and batch drawing
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// quickSelect — O(n) average k-th smallest element (Hoare's selection algorithm)
// ---------------------------------------------------------------------------
function quickSelect(arr: number[], k: number): number {
  if (arr.length <= 1) return arr[0] ?? 0;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const pivot = arr[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (arr[i] < pivot) i++;
      while (arr[j] > pivot) j--;
      if (i <= j) {
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        i++; j--;
      }
    }
    if (j < k) lo = i;
    if (i > k) hi = j;
  }
  return arr[k];
}

export class RenderPipeline {
  private host: RenderHost;

  // Render loop state
  private needsRedraw = true;
  private needsFullRedraw = false;
  private idleFrames = 0;
  private _tickerBound = false;
  private edgeRedrawCounter = 0;

  // Array pools for redrawNodeBatch() — reuse across frames to reduce GC
  private _visiblePool: PixiNode[] = [];
  private _degreesPool: number[] = [];

  /** Called after every render tick (used by minimap) */
  onPostRender: (() => void) | null = null;

  // Deferred node creation
  private pendingNodes: GraphNode[] = [];
  private pendingNodeR: ((n: GraphNode) => number) | null = null;
  private pendingNodeColor: ((n: GraphNode) => number) | null = null;
  private pendingLabelThreshold = 3;
  private _cachedMaxDeg = 1;
  private deferredBatchId: ReturnType<typeof setTimeout> | null = null;

  constructor(host: RenderHost) {
    this.host = host;
  }

  // =========================================================================
  // Dirty flag management
  // =========================================================================
  markDirty(forceFullRedraw = false) {
    this.needsRedraw = true;
    if (forceFullRedraw) this.needsFullRedraw = true;
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

    if (this.needsRedraw) {
      this.updatePositions(this.needsFullRedraw);
      this.needsRedraw = false;
      this.needsFullRedraw = false;
      this.idleFrames = 0;
    } else {
      this.idleFrames++;
      const app = this.host.getPixiApp();
      if (this.idleFrames > IDLE_FRAME_DETACH_THRESHOLD && app) {
        app.ticker.remove(this.renderTick, this);
        this._tickerBound = false;
      }
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

    // Throttle expensive edge + enclosure redraws during simulation.
    this.edgeRedrawCounter++;
    if (forceFullRedraw || this.edgeRedrawCounter >= EDGE_REDRAW_SKIP) {
      this.edgeRedrawCounter = 0;
      this.host.drawEnclosures();
      this.host.drawSunburstArcs();
      this.host.drawGuideLines();
      this.host.drawRouteLines();
      this.host.drawGroupGrid();
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

      if (isKbFocused) {
        // Keyboard focus: dashed ring instead of halo — high-contrast white outline
        const focusRadius = pn.radius * KB_FOCUS_RADIUS_FACTOR;
        const segments = KB_FOCUS_SEGMENTS;
        const gap = KB_FOCUS_GAP_FRACTION; // fraction of arc to skip (0..1)
        pn.circle.lineStyle(KB_FOCUS_LINE_WIDTH, 0xffffff, KB_FOCUS_LINE_ALPHA);
        for (let i = 0; i < segments; i++) {
          const startAngle = (i / segments) * Math.PI * 2;
          const endAngle = startAngle + ((1 - gap) / segments) * Math.PI * 2;
          pn.circle.arc(0, 0, focusRadius, startAngle, endAngle);
          pn.circle.moveTo(
            Math.cos(endAngle) * focusRadius,
            Math.sin(endAngle) * focusRadius,
          );
        }
      } else {
        drawShape(pn.circle, shape, pn.radius * crc.highlightHaloRadius, pn.color, crc.highlightHaloAlpha);
      }

      const strokeCol = darkenColor(pn.color, crc.strokeDarken);
      pn.circle.lineStyle(crc.highlightStrokeWidth, strokeCol, 0.85);
      drawShape(pn.circle, shape, pn.radius, pn.color, 1);
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
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };

    // Ring chart mode: hide all nodes
    if (this.host.isRingChartMode()) return;

    // Build shared render context for sub-methods
    const ctx = this._buildBatchContext(crc, rt);

    // Pass 1: Glow halos (enhanced for hub nodes) — skip at extreme/mid zoom
    if (ctx.nodeCount < rt.glowNodeCount && !ctx.isExtremeZoom && !ctx.isMidZoom) {
      this._renderGlowPass(g, ctx, rt);
    }

    // Pass 2: Nodes — LOD-tiered rendering
    this._renderNodesPass(g, ctx, crc, rt);

    // Pass 3: Hold indicator ring for pinned nodes
    this._renderHoldRings(g, ctx);

    // Pass 4: Pathfinder start/end node markers
    this._renderPathfinderMarkers(g, ctx);
  }

  // =========================================================================
  // Batch render context — shared state for all sub-passes
  // =========================================================================
  /** Shared state computed once per redrawNodeBatch call and passed to sub-methods. */
  private _buildBatchContext(
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const hId = this.host.getHighlightedNodeId();
    const hlSet = this.host.getPrevHighlightSet();
    const eph = this.host.getEphemeralHighlight();
    const hasHighlight = !!(hId || (eph && eph.size > 0));
    const activeSet = (eph && eph.size > 0) ? eph : hlSet;

    // Viewport culling bounds (world coordinates)
    const world = this.host.getWorldContainer();
    const worldScale = world?.scale?.x ?? 1;
    const { width: cw, height: ch } = this.host.getCanvasDimensions();
    const wx = world?.x ?? 0;
    const wy = world?.y ?? 0;
    const margin = VIEWPORT_CULL_MARGIN_PX / worldScale;
    const vpMinX = -wx / worldScale - margin;
    const vpMinY = -wy / worldScale - margin;
    const vpMaxX = vpMinX + cw / worldScale + margin * 2;
    const vpMaxY = vpMinY + ch / worldScale + margin * 2;

    // Collect visible nodes (reuse pooled array)
    const visible = this._visiblePool;
    visible.length = 0;
    const pixiNodes = this.host.getPixiNodes();
    const hiddenBySearch = this.host.getSearchHiddenNodes();
    for (const pn of pixiNodes.values()) {
      if (hiddenBySearch.has(pn.data.id)) continue;
      if (hasHighlight && activeSet.has(pn.data.id)) continue;
      const nx = pn.data.x, ny = pn.data.y;
      if (nx < vpMinX || nx > vpMaxX || ny < vpMinY || ny > vpMaxY) continue;
      visible.push(pn);
    }

    // Timeline range filtering
    const tlFilteredOut = this._computeTimelineFilter(visible, pixiNodes);

    const alpha = hasHighlight ? crc.highlightDimAlpha : 1;
    const nodeCount = visible.length;
    const shapeRules = this.host.getNodeShapeRules();

    // LOD tiers
    const nodeScreenPx = NODE_SCREEN_PX_BASE * worldScale;
    const isExtremeZoom = nodeScreenPx < rt.cardLODExtremePx;
    const isMidZoom = !isExtremeZoom && nodeScreenPx < rt.cardLODNormalPx;
    const minWorldRadius = isExtremeZoom ? 0 : Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);

    return {
      visible, pixiNodes, tlFilteredOut, alpha, nodeCount,
      shapeRules, worldScale, isExtremeZoom, isMidZoom, minWorldRadius,
    };
  }

  /** Compute the set of node IDs outside the active timeline range. */
  private _computeTimelineFilter(
    visible: PixiNode[],
    pixiNodes: Map<string, PixiNode>,
  ): Set<string> | null {
    const tlRange = this.host.getTimelineRange?.();
    if (!tlRange?.active) return null;

    let globalMinX = Infinity, globalMaxX = -Infinity;
    for (const pn of pixiNodes.values()) {
      if (pn.data.x < globalMinX) globalMinX = pn.data.x;
      if (pn.data.x > globalMaxX) globalMaxX = pn.data.x;
    }
    const xSpan = globalMaxX - globalMinX;
    const tlMinX = globalMinX + xSpan * tlRange.min;
    const tlMaxX = globalMinX + xSpan * tlRange.max;
    const filtered = new Set<string>();
    for (const pn of visible) {
      if (pn.data.x < tlMinX || pn.data.x > tlMaxX) {
        filtered.add(pn.data.id);
      }
    }
    return filtered;
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
    const baseGlowAlpha = nodeCount < GLOW_ATTENUATE_THRESHOLD
      ? rt.glowBaseAlpha
      : rt.glowBaseAlpha * (1 - (nodeCount - GLOW_ATTENUATE_THRESHOLD) / GLOW_ATTENUATE_RANGE);
    const baseGlowRadius = nodeCount < GLOW_ATTENUATE_THRESHOLD
      ? rt.glowBaseRadius
      : rt.glowBaseRadius - GLOW_RADIUS_ATTENUATE_FACTOR * ((nodeCount - GLOW_ATTENUATE_THRESHOLD) / GLOW_ATTENUATE_RANGE);

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
      visible: PixiNode[]; pixiNodes: Map<string, PixiNode>;
      tlFilteredOut: Set<string> | null; alpha: number; nodeCount: number;
      shapeRules: ShapeRule[]; worldScale: number;
      isExtremeZoom: boolean; isMidZoom: boolean; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const { visible, pixiNodes, tlFilteredOut, alpha, nodeCount,
            worldScale, isExtremeZoom, isMidZoom, minWorldRadius } = ctx;

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

  /** Remove all CardText children from every node's gfx container. */
  private _cleanupCardTextAll(pixiNodes: Map<string, PixiNode>) {
    for (const pn of pixiNodes.values()) {
      const gfx = pn.gfx;
      for (let ci = gfx.children.length - 1; ci >= 0; ci--) {
        if (isCardText(gfx.children[ci])) {
          const child = gfx.children[ci];
          gfx.removeChild(child);
          child.destroy();
        }
      }
    }
  }

  /** Extreme zoom-out: draw fixed-size rectangles (1x1 screen pixel). */
  private _renderExtremeZoom(
    g: CanvasGraphics,
    visible: PixiNode[],
    tlFilteredOut: Set<string> | null,
    alpha: number,
    worldScale: number,
    crc: ReturnType<typeof Object.assign>,
  ) {
    const dotSize = 1 / worldScale;
    g.lineStyle(0);
    for (const pn of visible) {
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      g.beginFill(pn.color, nodeAlpha);
      g.drawRect(pn.data.x - dotSize / 2, pn.data.y - dotSize / 2, dotSize, dotSize);
      g.endFill();
    }
  }

  /** Mid zoom: all circles (skip shape lookup + gradient for speed). */
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
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      g.beginFill(pn.color, nodeAlpha);
      g.drawCircle(pn.data.x, pn.data.y, effR);
      g.endFill();
    }
  }

  /** Normal zoom: full shape + optional gradient, with display mode support. */
  private _renderNormalZoom(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; pixiNodes: Map<string, PixiNode>;
      tlFilteredOut: Set<string> | null; alpha: number; nodeCount: number;
      shapeRules: ShapeRule[]; worldScale: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const { pixiNodes } = ctx;
    const displayMode = this.host.getNodeDisplayMode();

    // Clean up stale card text when NOT in table card mode
    if (displayMode !== "card" || (this.host.getCardDisplayConfig().headerStyle ?? "plain") !== "table") {
      this._cleanupCardTextAll(pixiNodes);
    }

    if (displayMode === "node") {
      this._renderNodeMode(g, ctx, crc, rt);
    } else if (displayMode === "card") {
      this._renderCardMode(g, ctx, crc, rt);
    } else if (displayMode === "donut") {
      this._renderDonutMode(g, ctx, crc, rt);
    } else if (displayMode === "sunburst-segment") {
      this._renderSunburstSegmentMode(g, ctx, crc);
    }
  }

  /** Node display mode: shape rendering with gradient and prominence. */
  private _renderNodeMode(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; tlFilteredOut: Set<string> | null;
      alpha: number; nodeCount: number; shapeRules: ShapeRule[];
      worldScale: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const { visible, tlFilteredOut, alpha, nodeCount, shapeRules, worldScale, minWorldRadius } = ctx;
    const prominentN = rt.prominentTopN ?? 5;
    const nonPromSat = rt.nonProminentSaturation ?? 0.4;
    const useGradient = nodeCount < rt.gradientNodeCount;

    for (const pn of visible) {
      const shape = getNodeShape(pn.data, shapeRules);
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;

      // Desaturate non-prominent nodes
      let drawColor = pn.color;
      if (pn.sortRank >= 0 && pn.sortRank >= prominentN) {
        drawColor = desaturateColor(pn.color, nonPromSat);
      }
      const strokeColor = darkenColor(drawColor, crc.strokeDarken);
      g.lineStyle(1, strokeColor, nodeAlpha * crc.strokeAlpha);
      if (useGradient && shape === "circle") {
        const innerCol = lightenColor(drawColor, crc.gradientHighlight);
        const outerCol = darkenColor(drawColor, crc.gradientShadow);
        g.beginRadialFill(pn.data.x, pn.data.y, effR, innerCol, outerCol, nodeAlpha, nodeAlpha);
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

  /** Card display mode: dispatch to table or plain card style. */
  private _renderCardMode(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; pixiNodes: Map<string, PixiNode>;
      tlFilteredOut: Set<string> | null; alpha: number; nodeCount: number;
      worldScale: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const { pixiNodes, worldScale } = ctx;
    const cardConfig = this.host.getCardDisplayConfig();
    const headerStyle = cardConfig.headerStyle ?? "plain";
    const cardMaxW = (cardConfig.maxWidth ?? 120) / worldScale;
    const showIcon = cardConfig.showIcon === true;

    // Clean up previous card text children from ALL nodes
    this._cleanupCardTextAll(pixiNodes);

    if (headerStyle === "table") {
      this._renderTableCard(g, ctx, crc, rt, cardConfig, cardMaxW, showIcon);
    } else {
      this._renderPlainCard(g, ctx, crc, rt, cardConfig, cardMaxW);
    }
  }

  /** Table (ER-diagram) card style rendering. */
  private _renderTableCard(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; tlFilteredOut: Set<string> | null;
      alpha: number; nodeCount: number; worldScale: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
    cardConfig: CardDisplayConfig,
    cardMaxW: number,
    showIcon: boolean,
  ) {
    const { visible, tlFilteredOut, alpha, nodeCount, worldScale, minWorldRadius } = ctx;
    const headerH = crc.tableHeaderHeight / worldScale;
    const fieldLineH = crc.fieldLineHeight / worldScale;
    const pad = crc.cardPadding / worldScale;
    const cornerR = crc.cardCornerRadius / worldScale;
    const showMeta = nodeCount < rt.cardTextNodeCount && cardConfig.fields.length > 0;
    const fieldCount = showMeta ? cardConfig.fields.length : 0;
    const totalH = headerH + fieldCount * fieldLineH + pad * 2;

    const tableCardNodes: PixiNode[] = [];

    // Card width: golden ratio (or custom aspect ratio) based on content height
    const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
    const arHalfW = (totalH * cardAR) / 2;

    for (const pn of visible) {
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      const halfW = Math.min(cardMaxW / 2, crc.cardAspectRatio > 0 ? arHalfW : effR * crc.cardWidthFactor);
      const cardW = halfW * 2;
      const cardX = pn.data.x - halfW;
      const cardY = pn.data.y - totalH / 2;

      // 0. Drop shadow (behind card)
      if (crc.cardShadowAlpha > 0) {
        const shadowOff = crc.cardShadowOffset / worldScale;
        g.lineStyle(0);
        g.beginFill(0x000000, nodeAlpha * crc.cardShadowAlpha);
        g.drawRoundedRect(cardX + shadowOff, cardY + shadowOff, cardW, totalH, cornerR);
        g.endFill();
      }

      // 1. Card background (thin fill)
      g.lineStyle(0);
      g.beginFill(pn.color, nodeAlpha * crc.cardBackgroundAlpha);
      g.drawRoundedRect(cardX, cardY, cardW, totalH, cornerR);
      g.endFill();

      // 2. Header region (colored bar at top)
      g.beginFill(pn.color, nodeAlpha * crc.cardHeaderAlpha);
      g.drawRoundedRect(cardX, cardY, cardW, headerH + cornerR, cornerR);
      g.endFill();
      g.beginFill(pn.color, nodeAlpha * crc.cardHeaderAlpha);
      g.drawRect(cardX, cardY + headerH, cardW, cornerR);
      g.endFill();

      // 2b. File icon in header (when showIcon enabled)
      if (showIcon) {
        this._renderCardIcon(g, cardX, cardY, headerH, pad, worldScale, nodeAlpha);
      }

      // 3. Divider line below header
      const divColor = darkenColor(pn.color, crc.cardDividerDarken);
      g.lineStyle(1 / worldScale, divColor, nodeAlpha * crc.cardDividerAlpha);
      g.moveTo(cardX, cardY + headerH);
      g.lineTo(cardX + cardW, cardY + headerH);

      // 4. Striped field rows
      if (fieldCount > 0) {
        g.lineStyle(0);
        for (let fi = 0; fi < fieldCount; fi++) {
          const rowY = cardY + headerH + fi * fieldLineH;
          const rowAlpha = fi % 2 === 0 ? crc.cardRowAlphaEven : crc.cardRowAlphaOdd;
          g.beginFill(pn.color, nodeAlpha * rowAlpha);
          g.drawRect(cardX, rowY, cardW, fieldLineH);
          g.endFill();
        }
      }

      // Outer border
      const strokeColor = darkenColor(pn.color, crc.strokeDarken);
      g.lineStyle(1, strokeColor, nodeAlpha * crc.strokeAlpha);
      g.beginFill(0, 0);
      g.drawRoundedRect(cardX, cardY, cardW, totalH, cornerR);
      g.endFill();

      if (nodeCount < rt.cardTextNodeCount) tableCardNodes.push(pn);
    }

    // Text pass for table cards (only when node count < threshold)
    if (tableCardNodes.length > 0) {
      this._renderTableCardText(tableCardNodes, crc, rt, cardConfig, cardMaxW,
        showIcon, headerH, fieldLineH, pad, totalH, arHalfW, worldScale, minWorldRadius);
    }
  }

  /** Render file icon inside a table card header. */
  private _renderCardIcon(
    g: CanvasGraphics,
    cardX: number, cardY: number,
    headerH: number, pad: number,
    worldScale: number, nodeAlpha: number,
  ) {
    const iconS = headerH * CARD_ICON_SIZE_RATIO;
    const foldS = iconS * CARD_ICON_FOLD_RATIO;
    const iconX = cardX + pad;
    const iconY = cardY + (headerH - iconS) / 2;
    // Page body outline
    g.lineStyle(0.5 / worldScale, 0xffffff, nodeAlpha * CARD_ICON_OUTLINE_ALPHA);
    g.beginFill(0xffffff, nodeAlpha * CARD_ICON_FILL_ALPHA);
    g.moveTo(iconX, iconY);
    g.lineTo(iconX + iconS - foldS, iconY);
    g.lineTo(iconX + iconS, iconY + foldS);
    g.lineTo(iconX + iconS, iconY + iconS);
    g.lineTo(iconX, iconY + iconS);
    g.closePath();
    g.endFill();
    // Fold triangle
    g.lineStyle(0);
    g.beginFill(0xffffff, nodeAlpha * CARD_ICON_FOLD_ALPHA);
    g.moveTo(iconX + iconS - foldS, iconY);
    g.lineTo(iconX + iconS - foldS, iconY + foldS);
    g.lineTo(iconX + iconS, iconY + foldS);
    g.closePath();
    g.endFill();
  }

  /** Render text labels for table (ER-diagram) cards. */
  private _renderTableCardText(
    tableCardNodes: PixiNode[],
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
    cardConfig: CardDisplayConfig,
    cardMaxW: number,
    showIcon: boolean,
    headerH: number, fieldLineH: number, pad: number,
    totalH: number, arHalfW: number,
    worldScale: number, minWorldRadius: number,
  ) {
    const labelColor = this.host.getLabelColor();

    for (const pn of tableCardNodes) {
      const effR = Math.max(pn.radius, minWorldRadius);
      const halfW = Math.min(cardMaxW / 2, crc.cardAspectRatio > 0 ? arHalfW : effR * crc.cardWidthFactor);
      const cardY = -totalH / 2;  // relative to pn.gfx
      const textPadX = pad;
      const fontSize = Math.max(crc.headerFontSizeMin, crc.headerFontSizeBase / worldScale);
      const smallFontSize = Math.max(crc.fieldFontSizeMin, crc.fieldFontSizeBase / worldScale);
      const fieldCount2 = cardConfig.fields.length;
      const gfx = pn.gfx;

      // Icon offset for header text
      const iconOffset = showIcon ? (headerH * CARD_ICON_SIZE_RATIO + pad) : 0;
      const availableTextW = halfW * 2 - textPadX * 2 - iconOffset;

      // Header text (bold, white)
      const headerText = new CanvasText(pn.data.label, {
        fontSize,
        fontWeight: "bold",
        fill: 0xffffff,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      markAsCardText(headerText);
      headerText.x = -halfW + textPadX + iconOffset;
      headerText.y = cardY + headerH / 2 + fontSize * crc.fontBaselineOffset;
      if (rt.cardTextTruncation !== false) headerText.maxWidth = availableTextW;
      gfx.addChild(headerText);

      // Field rows
      const meta = pn.data.meta ?? {};
      const fieldValueOnly = cardConfig.fieldFormat === "value-only";
      for (let fi = 0; fi < fieldCount2; fi++) {
        const fieldName = cardConfig.fields[fi];
        const rawVal = meta[fieldName];
        const valStr = rawVal == null ? "" : String(rawVal);
        const displayText = fieldValueOnly ? valStr : `${fieldName}: ${valStr}`;
        const fieldText = new CanvasText(displayText, {
          fontSize: smallFontSize,
          fill: labelColor,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        });
        markAsCardText(fieldText);
        fieldText.x = -halfW + textPadX;
        fieldText.y = cardY + headerH + fi * fieldLineH + fieldLineH / 2 + smallFontSize * crc.fontBaselineOffset;
        if (rt.cardTextTruncation !== false) fieldText.maxWidth = availableTextW;
        gfx.addChild(fieldText);
      }
    }
  }

  /** Plain card style rendering. */
  private _renderPlainCard(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; tlFilteredOut: Set<string> | null;
      alpha: number; nodeCount: number; worldScale: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
    cardConfig: CardDisplayConfig,
    cardMaxW: number,
  ) {
    const { visible, tlFilteredOut, alpha, nodeCount, worldScale, minWorldRadius } = ctx;
    const cardH = crc.plainCardHeight / worldScale;
    const showMeta = nodeCount < rt.cardTextNodeCount && cardConfig.fields.length > 0;
    const fieldLineH = crc.fieldLineHeight / worldScale;

    for (const pn of visible) {
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      const halfW = Math.min(cardMaxW / 2, effR * crc.plainCardWidthFactor);
      const totalH = showMeta ? cardH + cardConfig.fields.length * fieldLineH : cardH;
      const halfH = totalH / 2;

      // Card background
      const strokeColor = darkenColor(pn.color, crc.strokeDarken);
      g.lineStyle(1, strokeColor, nodeAlpha * crc.plainCardStrokeAlpha);
      g.beginFill(pn.color, nodeAlpha * crc.plainCardFillAlpha);
      g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, halfW * 2, totalH, crc.cardCornerRadius / worldScale);
      g.endFill();
    }
  }

  /** Donut mode: draw ring (outer circle with inner cutout). */
  private _renderDonutMode(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; tlFilteredOut: Set<string> | null;
      alpha: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    _rt: ReturnType<typeof Object.assign>,
  ) {
    const { visible, tlFilteredOut, alpha, minWorldRadius } = ctx;
    const donutConfig = this.host.getDonutDisplayConfig();
    const innerR = donutConfig.innerRadius ?? 0.6;
    const bgColor = this.host.isDarkTheme() ? 0x1e1e1e : 0xffffff;

    for (const pn of visible) {
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;

      const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
      if (isSuperNode && donutConfig.breakdownField) {
        this._renderDonutBreakdown(g, pn, effR, nodeAlpha, innerR, bgColor, donutConfig.breakdownField);
      } else {
        // Single-color ring for individual nodes
        const strokeColor = darkenColor(pn.color, RING_STROKE_DARKEN);
        g.lineStyle(1, strokeColor, nodeAlpha * RING_STROKE_ALPHA);
        g.beginFill(pn.color, nodeAlpha);
        g.drawCircle(pn.data.x, pn.data.y, effR);
        g.endFill();
        // Inner cutout
        g.lineStyle(0);
        g.beginFill(bgColor, 1);
        g.drawCircle(pn.data.x, pn.data.y, effR * innerR);
        g.endFill();
      }
    }
  }

  /** Draw sector breakdown donut for a super node. */
  private _renderDonutBreakdown(
    g: CanvasGraphics,
    pn: PixiNode,
    effR: number, nodeAlpha: number,
    innerR: number, bgColor: number,
    breakdownField: string,
  ) {
    const members = pn.data.collapsedMembers!;
    const valueCounts = new Map<string, number>();
    for (const memberId of members) {
      const memberPn = this.host.getPixiNodes().get(memberId);
      const val = memberPn?.data?.meta?.[breakdownField] as string ?? "other";
      valueCounts.set(val, (valueCounts.get(val) ?? 0) + 1);
    }

    let startAngle = -Math.PI / 2;
    const total = members.length;
    let colorIdx = 0;
    const sectorColors = [0x818cf8, 0xf472b6, 0xfbbf24, 0x34d399, 0x60a5fa, 0xf87171, 0xb4a0ff, 0x2dd4bf];
    g.lineStyle(0);
    for (const [, count] of valueCounts) {
      const sliceAngle = (count / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const sColor = sectorColors[colorIdx % sectorColors.length];
      g.beginFill(sColor, nodeAlpha);
      g.moveTo(pn.data.x, pn.data.y);
      g.arc(pn.data.x, pn.data.y, effR, startAngle, endAngle);
      g.lineTo(pn.data.x, pn.data.y);
      g.endFill();
      startAngle = endAngle;
      colorIdx++;
    }
    // Inner circle cutout
    g.beginFill(bgColor, 1);
    g.drawCircle(pn.data.x, pn.data.y, effR * innerR);
    g.endFill();
  }

  /** Sunburst segment mode: draw arc segments. */
  private _renderSunburstSegmentMode(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; tlFilteredOut: Set<string> | null;
      alpha: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
  ) {
    const { visible, tlFilteredOut, alpha, minWorldRadius } = ctx;
    const arcAngle = (SUNBURST_SEGMENT_ARC_DEG * Math.PI) / 180;

    for (let i = 0; i < visible.length; i++) {
      const pn = visible[i];
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      const angleOffset = (i / Math.max(visible.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const startAngle = angleOffset - arcAngle / 2;
      const endAngle = angleOffset + arcAngle / 2;

      const strokeColor = darkenColor(pn.color, RING_STROKE_DARKEN);
      g.lineStyle(1, strokeColor, nodeAlpha * RING_STROKE_ALPHA);
      g.beginFill(pn.color, nodeAlpha);
      g.moveTo(pn.data.x, pn.data.y);
      g.arc(pn.data.x, pn.data.y, effR, startAngle, endAngle);
      g.lineTo(pn.data.x, pn.data.y);
      g.endFill();
    }
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
      const shape = isMidZoom ? "circle" as const : getNodeShape(pn.data, shapeRules);
      g.lineStyle(HOLD_RING_LINE_WIDTH, this.host.isDarkTheme() ? 0xffffff : 0x333333, INDICATOR_RING_ALPHA);
      g.beginFill(0, 0);
      drawShapeAt(g, shape, pn.data.x, pn.data.y, pn.radius + HOLD_RING_PADDING);
      g.endFill();
    }
  }

  // =========================================================================
  // Pass 4: Pathfinder markers
  // =========================================================================
  /** Render pathfinder start/end node markers. */
  private _renderPathfinderMarkers(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[]; shapeRules: ShapeRule[] },
  ) {
    const pfNodes = this.host.getPathfinderNodeSet?.() ?? null;
    const pfState = this.host.getPathfinderState?.();
    if (!pfNodes || pfNodes.size === 0) return;

    const { visible, shapeRules } = ctx;
    for (const pn of visible) {
      if (!pfNodes.has(pn.data.id)) continue;
      const shape = getNodeShape(pn.data, shapeRules);
      const isStart = pfState?.startId === pn.data.id;
      const isEnd = pfState?.endId === pn.data.id;
      const ringColor = isStart ? 0x22d3ee : isEnd ? 0xf97316 : 0x22d3ee;
      g.lineStyle(isStart || isEnd ? PF_ENDPOINT_LINE_WIDTH : PF_INTERMEDIATE_LINE_WIDTH, ringColor, INDICATOR_RING_ALPHA);
      g.beginFill(0, 0);
      drawShapeAt(g, shape, pn.data.x, pn.data.y, pn.radius + (isStart || isEnd ? PF_ENDPOINT_RADIUS_PAD : PF_INTERMEDIATE_RADIUS_PAD));
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
  createPixiNodes(
    nodes: GraphNode[],
    nodeR: (n: GraphNode) => number,
    nodeColor: (n: GraphNode) => number
  ) {
    const pixiNodes = this.host.getPixiNodes();
    // Clean up leader lines and tag labels before clearing
    for (const pn of pixiNodes.values()) {
      if (pn.leaderLine) { pn.leaderLine.destroy(); pn.leaderLine = null; }
      if (pn.tagLabel) { pn.tagLabel.destroy(); pn.tagLabel = null; }
    }
    pixiNodes.clear();
    this.cancelDeferredBatch();

    const degrees = this.host.getDegrees();

    // Dynamically raise label threshold for large graphs to limit GPU texture memory.
    const degValues = nodes.map(n => degrees.get(n.id) || 0).sort((a, b) => b - a);
    this.pendingLabelThreshold = degValues.length > MAX_LABEL_COUNT
      ? Math.max(DEFAULT_LABEL_DEGREE_THRESHOLD, degValues[MAX_LABEL_COUNT - 1])
      : DEFAULT_LABEL_DEGREE_THRESHOLD;

    // Cache maxDeg once — avoids O(n²) recomputation inside createSinglePixiNode
    this._cachedMaxDeg = degValues.length > 0 ? degValues[0] : 1;

    // Sort by degree descending — high-degree nodes render first (most important)
    const sorted = [...nodes].sort((a, b) =>
      (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0)
    );

    // Immediate batch: create enough nodes for an initial visible graph
    const IMMEDIATE_BATCH = Math.min(IMMEDIATE_BATCH_SIZE, sorted.length);
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
    const rtNode = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };
    const maxR = rtNode.maxNodeRadius > 0 ? rtNode.maxNodeRadius : Infinity;
    const ns = this.host.getNodeSize?.() ?? nodeR(n);
    const nodeDeg = this.host.getDegrees().get(n.id) || 0;
    const r = effectiveRadius(n, ns, nodeDeg, maxR, rtNode.minNodeRadius);
    const color = nodeColor(n);
    const circle = new CanvasGraphics();
    if (isSuperNode) {
      const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };
      circle.lineStyle(rt.superNodeOuterStroke, color, 1);
      circle.drawCircle(0, 0, r);
      circle.lineStyle(rt.superNodeInnerStroke, color, rt.superNodeInnerAlpha);
      circle.drawCircle(0, 0, r * rt.superNodeInnerRatio);
      circle.beginFill(color, SUPER_NODE_FILL_ALPHA);
      circle.drawCircle(0, 0, r);
      circle.endFill();
      circle.visible = true;
    } else {
      circle.visible = false;
    }
    container.addChild(circle);

    let label: CanvasText | null = null;
    let tagLabel: CanvasText | null = null;
    const degrees = this.host.getDegrees();
    const deg = degrees.get(n.id) || 0;
    if (isSuperNode || deg > this.pendingLabelThreshold) {
      const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };

      // --- Importance-based font size: scale between min and max based on degree ---
      const maxDeg = this._cachedMaxDeg || 1;
      const importance = maxDeg > 0 ? Math.min(1, deg / maxDeg) : 0;
      const fontMin = rt.nodeLabelFontSizeMin ?? 10;
      const fontMax = rt.nodeLabelFontSizeMax ?? 14;
      const superFontSize = rt.superNodeFontSize ?? 13;
      const scaledFontSize = isSuperNode ? superFontSize : Math.round(fontMin + importance * (fontMax - fontMin));

      const labelFontWeight = isSuperNode ? "bold" : "500";
      // For super nodes, use group color as pill background; for regular nodes, use theme bg
      const labelBg = isSuperNode ? (color != null ? darkenColor(color, 0.6) : rt.labelBgColor) : rt.labelBgColor;
      // Use bright text when pill background is present for better contrast
      const labelFill = isSuperNode ? 0xffffff
        : (this.host.isDarkTheme() ? 0xe0e0e0 : 0x222222);
      label = new CanvasText(n.label, {
        fontSize: scaledFontSize,
        fill: labelFill,
        fontWeight: labelFontWeight,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      label.bgColor = labelBg;
      label.bgAlpha = isSuperNode ? (rt.superNodeLabelBgAlpha ?? 0.9) : rt.labelBgAlpha;
      label.bgPadX = isSuperNode ? SUPER_LABEL_PAD_X : REGULAR_LABEL_PAD_X;
      label.bgPadY = isSuperNode ? SUPER_LABEL_PAD_Y : REGULAR_LABEL_PAD_Y;
      label.cornerRadius = rt.labelHaloCornerRadius ?? null;
      label.strokeColor = rt.labelStrokeColor ?? null;
      label.strokeWidth = rt.labelStrokeWidth ?? 0;

      // --- Zone-based label placement ---
      // Analyze adjacent node angles and place label in the direction of the largest gap.
      const zoneOffset = rt.labelZoneOffset ?? 6;
      if (rt.labelZonePlacement) {
        const placement = this.computeZonePlacement(n, r, zoneOffset);
        label.x = placement.x;
        label.y = placement.y;
        label.anchor.set(placement.anchorX, 0);
      } else {
        label.x = r + LABEL_EDGE_OFFSET;
        label.y = -(r * LABEL_Y_OFFSET_FACTOR + LABEL_EDGE_OFFSET);
      }
      container.addChild(label);

      // --- Tag label (below node, fixed offset) ---
      if (rt.tagLabelShow && n.tags && n.tags.length > 0 && !isSuperNode) {
        const maxTags = rt.tagLabelMaxTags ?? 2;
        const tagText = n.tags.slice(0, maxTags).map(t => `#${t}`).join(" ");
        const accentColor = this.host.getAccentColor?.() ?? 0x818cf8;
        tagLabel = new CanvasText(tagText, {
          fontSize: rt.tagLabelFontSize ?? 9,
          fill: accentColor,
          fontWeight: "400",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        });
        tagLabel.alpha = rt.tagLabelAlpha ?? 0.65;
        tagLabel.bgColor = rt.labelBgColor;
        tagLabel.bgAlpha = (rt.labelBgAlpha ?? 0.85) * TAG_BG_ALPHA_DAMPEN;
        tagLabel.bgPadX = TAG_LABEL_PAD_X;
        tagLabel.bgPadY = TAG_LABEL_PAD_Y;
        tagLabel.cornerRadius = rt.labelHaloCornerRadius ?? null;
        tagLabel.anchor.set(0.5, 0);
        tagLabel.x = 0;
        tagLabel.y = r + (rt.tagLabelOffset ?? 4);
        // Tag labels start hidden; LOD in applyTextFade controls visibility
        tagLabel.visible = false;
        container.addChild(tagLabel);
      }
    }

    world.addChild(container);

    const pixiNodes = this.host.getPixiNodes();
    pixiNodes.set(n.id, {
      data: n, gfx: container, circle, label, tagLabel,
      hoverLabel: null, leaderLine: null, radius: r, color, held: false, sortRank: -1,
      priorityScore: -1, minShowZoom: 1.0, labelWasVisible: false,
    });
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

    this.markDirty(true);

    if (this.pendingNodes.length > 0) {
      this.scheduleDeferredBatch();
    } else {
      this.pendingNodeR = null;
      this.pendingNodeColor = null;
      this.cullOverlappingLabels();
    }
  };

  private scheduleDeferredBatch() {
    if (this.deferredBatchId !== null) return;
    this.deferredBatchId = setTimeout(this.processDeferredBatch, 0);
  }

  cancelDeferredBatch() {
    if (this.deferredBatchId !== null) {
      clearTimeout(this.deferredBatchId);
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
  computeZonePlacement(
    node: GraphNode,
    nodeRadius: number,
    offset: number
  ): { x: number; y: number; anchorX: number } {
    const adj = this.host.getAdjacency?.();
    const pixiNodes = this.host.getPixiNodes();
    const neighbors = adj?.get(node.id);

    // Default: place to the right if no adjacency info
    if (!neighbors || neighbors.size === 0) {
      return { x: nodeRadius + offset, y: -(nodeRadius * LABEL_Y_OFFSET_FACTOR), anchorX: 0 };
    }

    // Collect angles to all neighboring nodes AND positionally proximate nodes.
    // In dense layouts (sunburst, cardioid), nearby unlinked nodes in the same arc
    // can cause AP-6 ambiguity if labels are placed toward them.
    const angles: number[] = [];
    const rtZone = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };
    const proximityFactor = rtZone.labelZoneProximityFactor ?? 8;
    const proximityR = (nodeRadius + offset) * proximityFactor;
    for (const nid of neighbors) {
      const pn = pixiNodes.get(nid);
      if (!pn) continue;
      const dx = pn.data.x - node.x;
      const dy = pn.data.y - node.y;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
      angles.push(Math.atan2(dy, dx));
    }
    // Also include nearby non-linked nodes within proximity radius.
    // Cap at 12 nearest proximity nodes to limit O(n²) cost for large graphs.
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
    // Keep only the closest 20 to avoid over-constraining the gap search
    proxCandidates.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < Math.min(ZONE_MAX_PROXIMITY_CANDIDATES, proxCandidates.length); i++) {
      angles.push(proxCandidates[i].angle);
    }

    if (angles.length === 0) {
      return { x: nodeRadius + offset, y: -(nodeRadius * LABEL_Y_OFFSET_FACTOR), anchorX: 0 };
    }

    // Sort angles and find the largest gap
    angles.sort((a, b) => a - b);

    let maxGap = 0;
    let gapMidAngle = 0;

    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
      const gap = next - angles[i];
      if (gap > maxGap) {
        maxGap = gap;
        gapMidAngle = angles[i] + gap / 2;
      }
    }

    // Place label at the midpoint of the largest gap.
    // When gap is narrow (dense layout), pull label closer to its own node
    // to reduce AP-6 ambiguity (label closer to another node).
    const gapNarrowTh = rtZone.labelGapScaleNarrowThreshold ?? Math.PI / 4;
    const gapMedTh = rtZone.labelGapScaleMediumThreshold ?? Math.PI / 2;
    const gapNarrowFactor = rtZone.labelGapScaleNarrow ?? 0.6;
    const gapMedFactor = rtZone.labelGapScaleMedium ?? 0.8;
    const gapScale = maxGap < gapNarrowTh ? gapNarrowFactor : maxGap < gapMedTh ? gapMedFactor : 1.0;
    const dist = (nodeRadius + offset) * gapScale;
    const lx = Math.cos(gapMidAngle) * dist;
    const ly = Math.sin(gapMidAngle) * dist;

    // Determine text anchor based on direction
    const cosA = Math.cos(gapMidAngle);
    let anchorX: number;
    if (cosA > ZONE_ANCHOR_COS_POSITIVE) {
      anchorX = 0;       // text-anchor: start (label to the right)
    } else if (cosA < ZONE_ANCHOR_COS_NEGATIVE) {
      anchorX = 1;       // text-anchor: end (label to the left)
    } else {
      anchorX = 0.5;     // text-anchor: middle (label above/below)
    }

    return { x: lx, y: ly, anchorX };
  }

  // =========================================================================
  // Label overlap culling — hide labels that overlap higher-priority ones
  // =========================================================================
  cullOverlappingLabels() {
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };
    if (!rt.labelOverlapCulling) return;

    const margin = rt.labelOverlapMargin;
    const pixiNodes = this.host.getPixiNodes();
    const degrees = this.host.getDegrees();
    const zoom = this.host.getWorldContainer()?.scale.x ?? 1;
    const maxScreenW = rt.labelOverlapMaxScreenW;
    const maxScreenH = rt.labelOverlapMaxScreenH;

    // 1. Collect all visible labels into screen-space rects
    const rects = this._collectLabelRects(pixiNodes, degrees, zoom, maxScreenW, maxScreenH);

    // 2. Build spatial hash grid for overlap detection
    const grid = this._createOverlapGrid(margin);

    // 3. Sort by priority score — highest priority first (Google Maps-style)
    const minNonSuper = rt.labelMinNonSuper ?? 3;
    rects.sort((a, b) => b.pn.priorityScore - a.pn.priorityScore);

    const placed: CullLabelRect[] = [];
    const drawLeader = rt.labelLeaderLines;
    const llAlpha = rt.labelLeaderLineAlpha;
    const llWidth = rt.labelLeaderLineWidth;
    const maxDispRatio = rt.labelMaxDisplacementRatio ?? 4.0;

    // Clear all existing leader lines before re-evaluation
    for (const pn of pixiNodes.values()) {
      if (pn.leaderLine) {
        pn.leaderLine.clear();
        pn.leaderLine.visible = false;
      }
    }

    // 4. Place labels with displacement when overlapping
    for (const r of rects) {
      if (!grid.checkOverlap(r)) {
        placed.push(r);
        grid.insert(r);
        continue;
      }

      const found = this._tryDisplaceLabel(r, zoom, maxDispRatio, grid, drawLeader, llWidth, llAlpha);
      if (found) {
        placed.push(found);
        grid.insert(found);
      } else {
        r.label.visible = false;
      }
    }

    // 5. Guarantee placement floor (AP-4 + AP-5)
    this._guaranteePlacementFloor(rt, rects, placed, grid, zoom, margin,
      minNonSuper, drawLeader, llWidth, llAlpha);

    // 6. Draw leader lines for non-displaced labels at high counter-scale
    this._drawCounterScaleLeaderLines(rt, placed, zoom, drawLeader, llWidth, llAlpha);
  }

  // =========================================================================
  // cullOverlappingLabels — extracted sub-methods
  // =========================================================================

  /**
   * Collect all visible labels into screen-space rects for overlap detection.
   * All x, y, w, h values are in screen pixels (world * zoom).
   */
  private _collectLabelRects(
    pixiNodes: Map<string, PixiNode>,
    degrees: Map<string, number>,
    zoom: number,
    maxScreenW: number,
    maxScreenH: number,
  ): CullLabelRect[] {
    const rects: CullLabelRect[] = [];
    for (const pn of pixiNodes.values()) {
      const label = pn.label;
      if (!label || !label.text || !label.visible) continue;
      const fontSize = (label.style.fontSize as number) ?? 11;
      const charW = fontSize * LABEL_CHAR_WIDTH_FACTOR;
      const scaleX = label.scale?.x ?? 1;
      const scaleY = label.scale?.y ?? 1;
      const padX = label.bgPadX ?? 0;
      const padY = label.bgPadY ?? 0;
      const rawW = label.text.length * charW * scaleX * zoom + padX * 2 * scaleX * zoom;
      const rawH = fontSize * scaleY * LABEL_LINE_HEIGHT_FACTOR * zoom + padY * 2 * scaleY * zoom;
      const w = Math.min(rawW, maxScreenW > 0 ? maxScreenW : Infinity);
      const h = Math.min(rawH, maxScreenH > 0 ? maxScreenH : Infinity);
      const wx = (pn.data.x + label.x) * zoom;
      const wy = (pn.data.y + label.y) * zoom;
      const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
      rects.push({ pn, label, x: wx, y: wy, w, h,
        degree: degrees.get(pn.data.id) ?? 0, isSuper });
    }
    return rects;
  }

  /**
   * Create a spatial hash grid for O(n*k) overlap detection.
   * Returns an object with insert() and checkOverlap() methods.
   */
  private _createOverlapGrid(margin: number): CullOverlapGrid {
    const CELL_SIZE = OVERLAP_GRID_CELL_SIZE;
    const gridMap = new Map<number, CullLabelRect[]>();
    const cellKey = (cx: number, cy: number) => cx * OVERLAP_GRID_HASH_PRIME + cy;

    const getCellRange = (rect: CullLabelRect) => ({
      x0: Math.floor((rect.x - margin) / CELL_SIZE),
      y0: Math.floor((rect.y - margin) / CELL_SIZE),
      x1: Math.floor((rect.x + rect.w + margin) / CELL_SIZE),
      y1: Math.floor((rect.y + rect.h + margin) / CELL_SIZE),
    });

    return {
      insert(rect: CullLabelRect) {
        const { x0, y0, x1, y1 } = getCellRange(rect);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const k = cellKey(cx, cy);
            const arr = gridMap.get(k);
            if (arr) arr.push(rect); else gridMap.set(k, [rect]);
          }
        }
      },
      checkOverlap(rect: CullLabelRect): boolean {
        const { x0, y0, x1, y1 } = getCellRange(rect);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const arr = gridMap.get(cellKey(cx, cy));
            if (!arr) continue;
            for (const p of arr) {
              if (
                rect.x - margin < p.x + p.w + margin &&
                rect.x + rect.w + margin > p.x - margin &&
                rect.y - margin < p.y + p.h + margin &&
                rect.y + rect.h + margin > p.y - margin
              ) return true;
            }
          }
        }
        return false;
      },
    };
  }

  /**
   * Try to displace a label to avoid overlap. Returns the placed rect on success,
   * or null if no displacement position was found.
   * Applies AP-1 displacement cap and draws leader line when displaced.
   */
  private _tryDisplaceLabel(
    r: CullLabelRect,
    zoom: number,
    maxDispRatio: number,
    grid: CullOverlapGrid,
    drawLeader: boolean,
    llWidth: number,
    llAlpha: number,
  ): CullLabelRect | null {
    const { pn } = r;
    const nodeR = pn.radius ?? 6;
    const screenNodeR = nodeR * zoom;

    // Displacement offsets in screen space
    const offsets = [
      { dx: r.w * 0.5 + screenNodeR, dy: screenNodeR + r.h },       // bottom-right
      { dx: -(r.w + screenNodeR + 2), dy: 0 },                       // left
      { dx: 0, dy: screenNodeR + r.h * 1.2 },                        // below
      { dx: r.w * 0.3 + screenNodeR, dy: -(screenNodeR + r.h) },     // top-right
      { dx: -(r.w + screenNodeR + 2), dy: -(screenNodeR + r.h) },    // top-left
      { dx: -(r.w + screenNodeR + 2), dy: screenNodeR + r.h },       // bottom-left
      { dx: r.w * 0.3 + screenNodeR, dy: -(screenNodeR + r.h * 1.2) }, // above-right
      { dx: -(r.w * 0.3 + screenNodeR), dy: -(screenNodeR + r.h * 1.2) }, // above-left
    ];

    // Compute normBase for AP-1 displacement cap
    const fontSize = (r.label.style.fontSize as number) ?? 11;
    const charW = fontSize * LABEL_CHAR_WIDTH_FACTOR;
    const scaleX = r.label.scale?.x ?? 1;
    const visualW = (r.label.text?.length ?? 0) * charW * scaleX;
    const normBase = Math.max(nodeR + visualW * 0.3, nodeR, 1);
    const maxWorldDisp = maxDispRatio * normBase;

    const baseLx = r.label.x;
    const baseLy = r.label.y;
    for (const off of offsets) {
      let worldDx = zoom > 0 ? off.dx / zoom : off.dx;
      let worldDy = zoom > 0 ? off.dy / zoom : off.dy;
      // Cap TOTAL distance to maxWorldDisp
      const totalX = baseLx + worldDx;
      const totalY = baseLy + worldDy;
      const totalDist = Math.sqrt(totalX ** 2 + totalY ** 2);
      if (totalDist > maxWorldDisp && totalDist > 0) {
        const s = maxWorldDisp / totalDist;
        worldDx = totalX * s - baseLx;
        worldDy = totalY * s - baseLy;
      }
      const cappedScreenX = (pn.data.x + baseLx + worldDx) * zoom;
      const cappedScreenY = (pn.data.y + baseLy + worldDy) * zoom;
      const alt: CullLabelRect = { ...r, x: cappedScreenX, y: cappedScreenY };
      if (!grid.checkOverlap(alt)) {
        r.label.x = baseLx + worldDx;
        r.label.y = baseLy + worldDy;

        // Draw leader line from node edge to label
        if (drawLeader) {
          this._drawLeaderLine(pn, r, zoom, llWidth, llAlpha);
        }
        return alt;
      }
    }
    return null;
  }

  /**
   * Draw a leader line from node edge to the label anchor point.
   * Used for displaced labels and force-show labels.
   */
  private _drawLeaderLine(
    pn: PixiNode,
    r: CullLabelRect,
    zoom: number,
    llWidth: number,
    llAlpha: number,
    alphaMultiplier = 1.0,
  ): void {
    const nodeR = pn.radius ?? 6;
    if (!pn.leaderLine) {
      pn.leaderLine = new CanvasGraphics();
      pn.gfx.addChild(pn.leaderLine);
    }
    const ll = pn.leaderLine;
    ll.clear();
    ll.visible = true;
    const lx = r.label.x;
    const ly = r.label.y;
    const worldW = zoom > 0 ? r.w / zoom : r.w;
    const worldH = zoom > 0 ? r.h / zoom : r.h;
    const anchorX = clamp(0, lx, lx + worldW);
    const anchorY = clamp(0, ly, ly + worldH);
    const dist = Math.sqrt(anchorX ** 2 + anchorY ** 2);
    const edgeX = dist > 0.1 ? (anchorX / dist) * nodeR : 0;
    const edgeY = dist > 0.1 ? (anchorY / dist) * nodeR : 0;
    ll.lineStyle(llWidth, pn.color, llAlpha * alphaMultiplier);
    ll.moveTo(edgeX, edgeY);
    ll.lineTo(anchorX, anchorY);
  }

  /**
   * Placement floor guarantee (AP-4 + AP-5).
   * Force-shows highest-degree culled candidates without creating AABB overlaps.
   */
  private _guaranteePlacementFloor(
    rt: RenderThresholds,
    rects: CullLabelRect[],
    placed: CullLabelRect[],
    grid: CullOverlapGrid,
    zoom: number,
    margin: number,
    minNonSuper: number,
    drawLeader: boolean,
    llWidth: number,
    llAlpha: number,
  ): void {
    const minPlaced = rt.labelMinPlaced ?? 3;
    const minPlacedRatio = rt.labelMinPlacedRatio ?? 0.18;
    const totalCandidates = rects.length;
    const ratioFloor = minPlacedRatio > 0 ? Math.ceil(totalCandidates * minPlacedRatio) : 0;
    const absoluteFloor = Math.max(minPlaced, ratioFloor);

    const placedNonSuperNow = placed.filter(r => !r.isSuper).length;

    // AABB overlap check helper — uses spatial hash grid for O(k) lookup
    const overlapsPlaced = (candidate: CullLabelRect): boolean => {
      const cx = (candidate.pn.data.x + candidate.label.x) * zoom;
      const cy = (candidate.pn.data.y + candidate.label.y) * zoom;
      const testRect: CullLabelRect = { ...candidate, x: cx, y: cy };
      return grid.checkOverlap(testRect);
    };

    if (!(absoluteFloor > 0 || minNonSuper > 0)) return;

    const placedSet = new Set(placed.map(r => r.pn.data.id));
    const hiddenSupers = rects.filter(r => r.isSuper && !placedSet.has(r.pn.data.id))
      .sort((a, b) => b.degree - a.degree);
    const hiddenRegulars = rects.filter(r => !r.isSuper && !placedSet.has(r.pn.data.id))
      .sort((a, b) => b.degree - a.degree);

    // tryDisplaceForceShow: attempt displacement offsets for force-show candidates.
    // Displacement is capped to labelForceShowMaxRadii × nodeRadius in world space.
    // If no position found within range, label is hidden (not forced far away).
    const forceShowMaxRadii = rt.labelForceShowMaxRadii ?? 5;
    const tryDisplaceForceShow = (r: CullLabelRect): boolean => {
      if (!overlapsPlaced(r)) return true; // fits without displacement
      const nodeR = r.pn.radius ?? 6;
      const screenNodeR = nodeR * zoom;
      const maxWorldDisp = nodeR * forceShowMaxRadii;
      const clearX = r.w + margin;
      const clearY = r.h + margin;
      // Systematic 8-direction × 5-multiplier offsets (40 positions, capped)
      const dirs = [
        { dx: 1, dy: 0 },   { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },   { dx: 0, dy: -1 },
        { dx: 1, dy: 1 },   { dx: -1, dy: -1 },
        { dx: 1, dy: -1 },  { dx: -1, dy: 1 },
      ];

      const origLx = r.label.x;
      const origLy = r.label.y;

      for (let m = 1; m <= 5; m++) {
        for (const d of dirs) {
          const wdx = zoom > 0 ? (d.dx * (clearX + screenNodeR) * m) / zoom : 0;
          const wdy = zoom > 0 ? (d.dy * (clearY + screenNodeR) * m) / zoom : 0;
          // Enforce displacement cap
          const totalDist = Math.sqrt((origLx + wdx) ** 2 + (origLy + wdy) ** 2);
          if (totalDist > maxWorldDisp) continue;

          r.label.x = origLx + wdx;
          r.label.y = origLy + wdy;

          if (!overlapsPlaced(r)) {
            r.x = (r.pn.data.x + r.label.x) * zoom;
            r.y = (r.pn.data.y + r.label.y) * zoom;
            return true;
          }
        }
      }
      r.label.x = origLx;
      r.label.y = origLy;
      return false;
    };

    // Draw leader line for force-show displaced labels (AP-6 fix)
    const drawForceShowLeader = (r: CullLabelRect, origLx: number, origLy: number) => {
      if (!drawLeader) return;
      if (Math.abs(r.label.x - origLx) < 0.1 && Math.abs(r.label.y - origLy) < 0.1) return;
      this._drawLeaderLine(r.pn, r, zoom, llWidth, llAlpha);
    };

    // First guarantee minNonSuper non-super labels (AP-5)
    let nonSuperCount = placedNonSuperNow;
    for (const r of hiddenRegulars) {
      if (nonSuperCount >= minNonSuper) break;
      const origLx = r.label.x;
      const origLy = r.label.y;
      if (tryDisplaceForceShow(r)) {
        r.label.visible = true;
        placed.push(r);
        grid.insert(r);
        nonSuperCount++;
        drawForceShowLeader(r, origLx, origLy);
      }
    }

    // AP-5 super-node concession: hide lowest-degree supers and place regulars
    const placedSupers = placed.filter(r => r.isSuper);
    const currentSuperRatio = placed.length > 0 ? placedSupers.length / placed.length : 0;
    const targetNonSuperMin = Math.max(minNonSuper, Math.ceil(placed.length * 0.30));
    if (currentSuperRatio > 0.75 && nonSuperCount < targetNonSuperMin && hiddenRegulars.length > 0) {
      const sacrificeable = placedSupers.sort((a, b) => a.degree - b.degree);
      const maxSacrifice = Math.min(
        sacrificeable.length,
        Math.ceil(placed.length * 0.25),
      );
      let sacrificed = 0;
      let regIdx = 0;
      for (const sup of sacrificeable) {
        if (sacrificed >= maxSacrifice || nonSuperCount >= targetNonSuperMin) break;
        while (regIdx < hiddenRegulars.length &&
               placed.some(p => p.pn.data.id === hiddenRegulars[regIdx].pn.data.id)) {
          regIdx++;
        }
        if (regIdx >= hiddenRegulars.length) break;

        const reg = hiddenRegulars[regIdx++];
        const supScreenX = sup.x;
        const supScreenY = sup.y;

        sup.label.visible = false;
        if (sup.pn.leaderLine) { sup.pn.leaderLine.visible = false; }
        const idx = placed.indexOf(sup);
        if (idx >= 0) placed.splice(idx, 1);
        sacrificed++;

        const origLx = reg.label.x;
        const origLy = reg.label.y;
        if (tryDisplaceForceShow(reg)) {
          reg.label.visible = true;
          placed.push(reg);
          grid.insert(reg);
          nonSuperCount++;
          drawForceShowLeader(reg, origLx, origLy);
        } else {
          // Fallback: place at super's world position with leader line
          const wdx = zoom > 0 ? (supScreenX - reg.pn.data.x * zoom) / zoom : 0;
          const wdy = zoom > 0 ? (supScreenY - reg.pn.data.y * zoom) / zoom : 0;
          reg.label.x = wdx;
          reg.label.y = wdy;
          reg.x = supScreenX;
          reg.y = supScreenY;
          reg.label.visible = true;
          placed.push(reg);
          grid.insert(reg);
          nonSuperCount++;
          drawForceShowLeader(reg, origLx, origLy);
        }
      }
    }

    // Then guarantee absoluteFloor total labels (AP-4)
    let totalCount = placed.length;
    for (const r of [...hiddenSupers, ...hiddenRegulars]) {
      if (totalCount >= absoluteFloor) break;
      if (placed.some(p => p.pn.data.id === r.pn.data.id)) continue;
      const origLx = r.label.x;
      const origLy = r.label.y;
      if (tryDisplaceForceShow(r)) {
        r.label.visible = true;
        placed.push(r);
        grid.insert(r);
        totalCount++;
        drawForceShowLeader(r, origLx, origLy);
      }
    }

    const finalPlacedSet = new Set(placed.map(r => r.pn.data.id));
    for (const r of rects) {
      if (finalPlacedSet.has(r.pn.data.id)) {
        r.label.visible = true;
      }
    }
  }

  /**
   * Draw leader lines for non-displaced labels when counter-scale exceeds threshold.
   * At high zoom-out, even default-position labels are visually far from their node.
   */
  private _drawCounterScaleLeaderLines(
    rt: RenderThresholds,
    placed: CullLabelRect[],
    zoom: number,
    drawLeader: boolean,
    llWidth: number,
    llAlpha: number,
  ): void {
    if (!drawLeader) return;
    const alwaysThreshold = rt.labelLeaderLineAlwaysThreshold ?? 3.0;
    for (const r of placed) {
      const { pn } = r;
      if (pn.leaderLine?.visible) continue; // already has leader line from displacement
      const labelScale = r.label.scale?.x ?? 1;
      if (labelScale < alwaysThreshold) continue;
      this._drawLeaderLine(pn, r, zoom, llWidth, llAlpha, 0.6);
    }
  }
}

// ---------------------------------------------------------------------------
// Types used by cullOverlappingLabels sub-methods
// ---------------------------------------------------------------------------

/** Screen-space label bounding rect for overlap culling */
interface CullLabelRect {
  pn: PixiNode;
  label: CanvasText;
  x: number;
  y: number;
  w: number;
  h: number;
  degree: number;
  isSuper: boolean;
}

/** Spatial hash grid interface for label overlap detection */
interface CullOverlapGrid {
  insert(rect: CullLabelRect): void;
  checkOverlap(rect: CullLabelRect): boolean;
}
