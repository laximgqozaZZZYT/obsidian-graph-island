import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { GraphNode } from "../types";
import type { PixiNode } from "./InteractionManager";
import { getNodeShape, drawShape, drawShapeAt } from "../utils/node-shapes";
import type { ShapeRule } from "../utils/node-shapes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EDGE_REDRAW_SKIP = 3;

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
  /** Draw group grid overlay */
  drawGroupGrid(): void;
  /** Tick layout transition animation; returns true if still running */
  tickLayoutTransition(): boolean;
  /** Get the canvas viewport dimensions (CSS pixels) */
  getCanvasDimensions(): { width: number; height: number };
  /** Whether ring chart mode is active (sunburst + ringChartMode) */
  isRingChartMode(): boolean;
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
      if (this.idleFrames > 60 && app) {
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
      const shape = getNodeShape(pn.data, this.host.getNodeShapeRules());
      drawShape(pn.circle, shape, pn.radius * 2.2, pn.color, 0.12);
      const strokeCol = darkenColor(pn.color, 0.3);
      pn.circle.lineStyle(1.5, strokeCol, 0.85);
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
    // Ring chart mode: hide all nodes
    if (this.host.isRingChartMode()) return;
    const hId = this.host.getHighlightedNodeId();
    const hlSet = this.host.getPrevHighlightSet();
    const eph = this.host.getEphemeralHighlight();
    const hasHighlight = !!(hId || (eph && eph.size > 0));

    // Effective highlight set: ephemeral overrides normal hover
    const activeSet = (eph && eph.size > 0) ? eph : hlSet;

    // --- Viewport culling bounds (world coordinates) ---
    const world = this.host.getWorldContainer();
    const worldScale = world?.scale?.x ?? 1;
    const { width: cw, height: ch } = this.host.getCanvasDimensions();
    const wx = world?.x ?? 0;
    const wy = world?.y ?? 0;
    // Margin in world units so nodes at the edge aren't clipped mid-circle
    const margin = 60 / worldScale;
    const vpMinX = -wx / worldScale - margin;
    const vpMinY = -wy / worldScale - margin;
    const vpMaxX = vpMinX + cw / worldScale + margin * 2;
    const vpMaxY = vpMinY + ch / worldScale + margin * 2;

    // Reuse pooled array to avoid per-frame allocation
    const visible = this._visiblePool;
    visible.length = 0;
    const pixiNodes = this.host.getPixiNodes();
    const hiddenBySearch = this.host.getSearchHiddenNodes();
    for (const pn of pixiNodes.values()) {
      if (hiddenBySearch.has(pn.data.id)) continue;
      if (hasHighlight && activeSet.has(pn.data.id)) continue;
      // Viewport culling: skip nodes outside visible area
      const nx = pn.data.x, ny = pn.data.y;
      if (nx < vpMinX || nx > vpMaxX || ny < vpMinY || ny > vpMaxY) continue;
      visible.push(pn);
    }

    // Timeline range filtering: dim nodes outside range (only when active)
    let tlFilteredOut: Set<string> | null = null;
    const tlRange = (this.host as any).getTimelineRange?.() as { min: number; max: number; active: boolean } | undefined;
    if (tlRange?.active) {
      let globalMinX = Infinity, globalMaxX = -Infinity;
      for (const pn of pixiNodes.values()) {
        if (pn.data.x < globalMinX) globalMinX = pn.data.x;
        if (pn.data.x > globalMaxX) globalMaxX = pn.data.x;
      }
      const xSpan = globalMaxX - globalMinX;
      const tlMinX = globalMinX + xSpan * tlRange.min;
      const tlMaxX = globalMinX + xSpan * tlRange.max;
      tlFilteredOut = new Set<string>();
      for (const pn of visible) {
        if (pn.data.x < tlMinX || pn.data.x > tlMaxX) {
          tlFilteredOut.add(pn.data.id);
        }
      }
    }

    const alpha = hasHighlight ? 0.12 : 1;
    const nodeCount = visible.length;
    const shapeRules = this.host.getNodeShapeRules();

    // Minimum screen-space node size: ensure nodes are visible at extreme zoom-out
    const nodeScreenPx = 30 * worldScale; // typical node radius in screen pixels
    // LOD tiers based on zoom level:
    //   extreme (< 1.5px): fixed-size dot rectangles
    //   mid (< 4px): all circles, no shape lookup, no gradient
    //   normal: full shape + gradient rendering
    const isExtremeZoom = nodeScreenPx < 1.5;
    const isMidZoom = !isExtremeZoom && nodeScreenPx < 4;
    // For normal zoom, use min-radius to keep nodes visible when slightly small
    const minWorldRadius = isExtremeZoom ? 0 : Math.max(0, 1.5 / worldScale);

    // Pass 1: Glow halos (enhanced for hub nodes) — skip at extreme/mid zoom
    const showGlow = nodeCount < 800 && !isExtremeZoom && !isMidZoom;
    if (showGlow) {
      const baseGlowAlpha = nodeCount < 300 ? 0.14 : 0.14 * (1 - (nodeCount - 300) / 500);
      const baseGlowRadius = nodeCount < 300 ? 2.2 : 2.2 - 0.7 * ((nodeCount - 300) / 500);
      // Reuse degree buffer + O(n) quickSelect instead of sort O(n log n)
      const degArr = this._degreesPool;
      degArr.length = visible.length;
      for (let i = 0; i < visible.length; i++) degArr[i] = visible[i].data.degree ?? 0;
      const targetIdx = Math.floor(visible.length * 0.9);
      const p90 = quickSelect(degArr, targetIdx) || 1;
      g.lineStyle(0);
      for (let i = 0; i < visible.length; i++) {
        const pn = visible[i];
        const shape = getNodeShape(pn.data, shapeRules);
        const deg = pn.data.degree ?? 0;
        const hubFactor = deg >= p90 ? 1.6 : 1;
        const glowAlpha = baseGlowAlpha * hubFactor;
        const glowRadius = baseGlowRadius * (deg >= p90 ? 1.3 : 1);
        const effR = Math.max(pn.radius, minWorldRadius);
        g.beginFill(pn.color, alpha * glowAlpha);
        drawShapeAt(g, shape, pn.data.x, pn.data.y, effR * glowRadius);
        g.endFill();
      }
    }

    // Pass 2: Nodes — LOD-tiered rendering
    if (isExtremeZoom) {
      // Extreme zoom-out: draw fixed-size rectangles (1×1 screen pixel)
      const dotSize = 1 / worldScale;
      g.lineStyle(0);
      for (const pn of visible) {
        const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * 0.08 : alpha;
        g.beginFill(pn.color, nodeAlpha);
        g.drawRect(pn.data.x - dotSize / 2, pn.data.y - dotSize / 2, dotSize, dotSize);
        g.endFill();
      }
    } else if (isMidZoom) {
      // Mid zoom: all circles (skip shape lookup + gradient for speed)
      g.lineStyle(0);
      for (const pn of visible) {
        const effR = Math.max(pn.radius, minWorldRadius);
        const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * 0.08 : alpha;
        g.beginFill(pn.color, nodeAlpha);
        g.drawCircle(pn.data.x, pn.data.y, effR);
        g.endFill();
      }
    } else {
      // Normal zoom: full shape + optional gradient
      const useGradient = nodeCount < 500;
      for (const pn of visible) {
        const shape = getNodeShape(pn.data, shapeRules);
        const effR = Math.max(pn.radius, minWorldRadius);
        const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * 0.08 : alpha;
        const strokeColor = darkenColor(pn.color, 0.4);
        g.lineStyle(1, strokeColor, nodeAlpha * 0.5);
        if (useGradient && shape === "circle") {
          const innerCol = lightenColor(pn.color, 0.25);
          const outerCol = darkenColor(pn.color, 0.15);
          g.beginRadialFill(pn.data.x, pn.data.y, effR, innerCol, outerCol, nodeAlpha, nodeAlpha);
        } else {
          g.beginFill(pn.color, nodeAlpha);
        }
        drawShapeAt(g, shape, pn.data.x, pn.data.y, effR);
        g.endFill();
      }
    }

    // Pass 3: Hold indicator ring for pinned nodes
    for (const pn of visible) {
      if (!pn.held) continue;
      const shape = isMidZoom ? "circle" as const : getNodeShape(pn.data, shapeRules);
      g.lineStyle(2, this.host.isDarkTheme() ? 0xffffff : 0x333333, 0.9);
      g.beginFill(0, 0);
      drawShapeAt(g, shape, pn.data.x, pn.data.y, pn.radius + 4);
      g.endFill();
    }

    // Pass 4: Pathfinder start/end node markers
    const pfNodes = (this.host as any).getPathfinderNodeSet?.() as Set<string> | null;
    const pfState = (this.host as any).getPathfinderState?.() as { startId: string | null; endId: string | null } | undefined;
    if (pfNodes && pfNodes.size > 0) {
      for (const pn of visible) {
        if (!pfNodes.has(pn.data.id)) continue;
        const shape = getNodeShape(pn.data, shapeRules);
        const isStart = pfState?.startId === pn.data.id;
        const isEnd = pfState?.endId === pn.data.id;
        const ringColor = isStart ? 0x22d3ee : isEnd ? 0xf97316 : 0x22d3ee;
        g.lineStyle(isStart || isEnd ? 3 : 2, ringColor, 0.9);
        g.beginFill(0, 0);
        drawShapeAt(g, shape, pn.data.x, pn.data.y, pn.radius + (isStart || isEnd ? 6 : 3));
        g.endFill();
      }
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
    pixiNodes.clear();
    this.cancelDeferredBatch();

    const degrees = this.host.getDegrees();

    // Dynamically raise label threshold for large graphs to limit GPU texture memory.
    const MAX_LABELS = 300;
    const degValues = nodes.map(n => degrees.get(n.id) || 0).sort((a, b) => b - a);
    this.pendingLabelThreshold = degValues.length > MAX_LABELS
      ? Math.max(3, degValues[MAX_LABELS - 1])
      : 3;

    // Sort by degree descending — high-degree nodes render first (most important)
    const sorted = [...nodes].sort((a, b) =>
      (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0)
    );

    // Immediate batch: create enough nodes for an initial visible graph
    const IMMEDIATE_BATCH = Math.min(200, sorted.length);
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
    const memberCount = isSuperNode ? n.collapsedMembers!.length : 0;
    const MAX_NODE_RADIUS = 30;
    const rawR = isSuperNode ? Math.max(nodeR(n), nodeR(n) * (1 + Math.sqrt(memberCount) * 0.5)) : nodeR(n);
    const r = Math.min(rawR, MAX_NODE_RADIUS);
    const color = nodeColor(n);
    const circle = new CanvasGraphics();
    if (isSuperNode) {
      // Draw double circle for super nodes (visible immediately)
      circle.lineStyle(2, color, 1);
      circle.drawCircle(0, 0, r);
      circle.lineStyle(1.5, color, 0.6);
      circle.drawCircle(0, 0, r * 0.7);
      circle.beginFill(color, 0.3);
      circle.drawCircle(0, 0, r);
      circle.endFill();
      circle.visible = true;
    } else {
      circle.visible = false;
    }
    container.addChild(circle);

    let label: CanvasText | null = null;
    const degrees = this.host.getDegrees();
    const deg = degrees.get(n.id) || 0;
    if (isSuperNode || deg > this.pendingLabelThreshold) {
      label = new CanvasText(n.label, {
        fontSize: 11, fill: this.host.getLabelColor(),
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      label.x = r + 2;
      label.y = -6;
      container.addChild(label);
    }

    world.addChild(container);

    const pixiNodes = this.host.getPixiNodes();
    pixiNodes.set(n.id, {
      data: n, gfx: container, circle, label,
      hoverLabel: null, radius: r, color, held: false,
    });
  }

  /** Process the next batch of deferred nodes from the stack */
  private processDeferredBatch = () => {
    this.deferredBatchId = null;
    const world = this.host.getWorldContainer();
    if (!world || !this.pendingNodeR || !this.pendingNodeColor) return;
    if (this.pendingNodes.length === 0) return;

    const BATCH_SIZE = 100;
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
}
