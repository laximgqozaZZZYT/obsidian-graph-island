import * as PIXI from "pixi.js";
import type { GraphNode } from "../types";
import type { PixiNode } from "./InteractionManager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EDGE_REDRAW_SKIP = 1;

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

// ---------------------------------------------------------------------------
// RenderHost — the interface the RenderPipeline needs from its parent
// ---------------------------------------------------------------------------
export interface RenderHost {
  /** Get the PIXI application */
  getPixiApp(): PIXI.Application | null;
  /** Get the PIXI node map */
  getPixiNodes(): Map<string, PixiNode>;
  /** Get the world container */
  getWorldContainer(): PIXI.Container | null;
  /** Get the batch graphics layer for non-highlighted node circles */
  getNodeCircleBatch(): PIXI.Graphics | null;
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
}

// ---------------------------------------------------------------------------
// RenderPipeline — owns the PIXI render loop, node creation, and batch drawing
// ---------------------------------------------------------------------------
export class RenderPipeline {
  private host: RenderHost;

  // Render loop state
  private needsRedraw = true;
  private needsFullRedraw = false;
  private idleFrames = 0;
  private _tickerBound = false;
  private edgeRedrawCounter = 0;

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
      this.host.drawEdges();
    }
  }

  // =========================================================================
  // Node circle drawing
  // =========================================================================
  /** Draw an individual node circle (highlighted or hidden for batch) */
  drawNodeCircle(pn: PixiNode, highlight: boolean) {
    pn.circle.clear();
    if (highlight) {
      pn.circle.visible = true;
      pn.circle.beginFill(pn.color, 0.12);
      pn.circle.drawCircle(0, 0, pn.radius * 2.2);
      pn.circle.endFill();
      const strokeCol = darkenColor(pn.color, 0.3);
      pn.circle.lineStyle(1.5, strokeCol, 0.85);
      pn.circle.beginFill(pn.color);
      pn.circle.drawCircle(0, 0, pn.radius);
      pn.circle.endFill();
    } else {
      pn.circle.visible = false;
    }
  }

  /**
   * Redraw all non-highlighted node circles in a single batch Graphics.
   * Reduces GPU draw calls from 1000+ to 1.
   */
  redrawNodeBatch() {
    const g = this.host.getNodeCircleBatch();
    if (!g) return;
    g.clear();
    const hId = this.host.getHighlightedNodeId();
    const hlSet = this.host.getPrevHighlightSet();
    const eph = this.host.getEphemeralHighlight();
    const hasHighlight = !!(hId || (eph && eph.size > 0));

    // Effective highlight set: ephemeral overrides normal hover
    const activeSet = (eph && eph.size > 0) ? eph : hlSet;

    // Two-pass: first all glows (behind), then all solid circles (on top).
    const visible: PixiNode[] = [];
    const pixiNodes = this.host.getPixiNodes();
    for (const pn of pixiNodes.values()) {
      if (hasHighlight && activeSet.has(pn.data.id)) continue;
      visible.push(pn);
    }

    const alpha = hasHighlight ? 0.12 : 1;
    const nodeCount = visible.length;

    // Pass 1: Glow halos
    const showGlow = nodeCount < 800;
    if (showGlow) {
      const glowAlpha = nodeCount < 300 ? 0.14 : 0.14 * (1 - (nodeCount - 300) / 500);
      const glowRadius = nodeCount < 300 ? 2.2 : 2.2 - 0.7 * ((nodeCount - 300) / 500);
      g.lineStyle(0);
      for (const pn of visible) {
        g.beginFill(pn.color, alpha * glowAlpha);
        g.drawCircle(pn.data.x, pn.data.y, pn.radius * glowRadius);
        g.endFill();
      }
    }

    // Pass 2: Solid circles with subtle same-hue stroke
    for (const pn of visible) {
      const strokeColor = darkenColor(pn.color, 0.4);
      g.lineStyle(1, strokeColor, alpha * 0.5);
      g.beginFill(pn.color, alpha);
      g.drawCircle(pn.data.x, pn.data.y, pn.radius);
      g.endFill();
    }

    // Pass 3: Hold indicator ring for pinned nodes
    for (const pn of visible) {
      if (!pn.held) continue;
      g.lineStyle(2, this.host.isDarkTheme() ? 0xffffff : 0x333333, 0.9);
      g.beginFill(0, 0);
      g.drawCircle(pn.data.x, pn.data.y, pn.radius + 4);
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
    world: PIXI.Container,
  ) {
    const container = new PIXI.Container();
    container.x = n.x;
    container.y = n.y;

    const isSuperNode = !!(n.collapsedMembers && n.collapsedMembers.length > 0);
    const memberCount = isSuperNode ? n.collapsedMembers!.length : 0;
    const r = isSuperNode ? Math.max(nodeR(n), nodeR(n) * (1 + Math.sqrt(memberCount) * 0.5)) : nodeR(n);
    const color = nodeColor(n);
    const circle = new PIXI.Graphics();
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

    let label: PIXI.Text | null = null;
    const degrees = this.host.getDegrees();
    const deg = degrees.get(n.id) || 0;
    if (isSuperNode || deg > this.pendingLabelThreshold) {
      label = new PIXI.Text(n.label, {
        fontSize: 11, fill: this.host.getLabelColor(),
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      label.x = r + 2;
      label.y = -6;
      label.resolution = 2;
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
