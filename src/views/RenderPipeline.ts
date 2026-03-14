import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { GraphNode, NodeDisplayMode, CardDisplayConfig, DonutDisplayConfig, CardRenderConfig, RenderThresholds } from "../types";
import { DEFAULT_CARD_RENDER_CONFIG, DEFAULT_RENDER_THRESHOLDS } from "../types";
import type { PixiNode } from "./InteractionManager";
import { getNodeShape, drawShape, drawShapeAt, getNodeDisplayConfig } from "../utils/node-shapes";
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
  /** Whether scaleByDegree is enabled */
  getScaleByDegree?(): boolean;
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
      const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...this.host.getCardRenderConfig?.() };
      const shape = getNodeShape(pn.data, this.host.getNodeShapeRules());
      drawShape(pn.circle, shape, pn.radius * crc.highlightHaloRadius, pn.color, crc.highlightHaloAlpha);
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

    const alpha = hasHighlight ? crc.highlightDimAlpha : 1;
    const nodeCount = visible.length;
    const shapeRules = this.host.getNodeShapeRules();

    // Minimum screen-space node size: ensure nodes are visible at extreme zoom-out
    const nodeScreenPx = 30 * worldScale; // typical node radius in screen pixels
    // LOD tiers based on zoom level:
    //   extreme (< 1.5px): fixed-size dot rectangles
    //   mid (< 4px): all circles, no shape lookup, no gradient
    //   normal: full shape + gradient rendering
    const isExtremeZoom = nodeScreenPx < rt.cardLODExtremePx;
    const isMidZoom = !isExtremeZoom && nodeScreenPx < rt.cardLODNormalPx;
    // For normal zoom, use min-radius to keep nodes visible when slightly small
    const minWorldRadius = isExtremeZoom ? 0 : Math.max(0, 1.5 / worldScale);

    // Pass 1: Glow halos (enhanced for hub nodes) — skip at extreme/mid zoom
    const showGlow = nodeCount < rt.glowNodeCount && !isExtremeZoom && !isMidZoom;
    if (showGlow) {
      const baseGlowAlpha = nodeCount < 300 ? rt.glowBaseAlpha : rt.glowBaseAlpha * (1 - (nodeCount - 300) / 500);
      const baseGlowRadius = nodeCount < 300 ? rt.glowBaseRadius : rt.glowBaseRadius - 0.7 * ((nodeCount - 300) / 500);
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
        const hubFactor = deg >= p90 ? rt.glowHubFactor : 1;
        const glowAlpha = baseGlowAlpha * hubFactor;
        const glowRadius = baseGlowRadius * (deg >= p90 ? rt.glowHubRadiusFactor : 1);
        const effR = Math.max(pn.radius, minWorldRadius);
        g.beginFill(pn.color, alpha * glowAlpha);
        drawShapeAt(g, shape, pn.data.x, pn.data.y, effR * glowRadius);
        g.endFill();
      }
    }

    // Pass 2: Nodes — LOD-tiered rendering
    // Pre-pass: clean up table-card text at extreme/mid zoom (text not visible at these LODs)
    if (isExtremeZoom || isMidZoom) {
      for (const pn of pixiNodes.values()) {
        const gfx = pn.gfx;
        for (let ci = gfx.children.length - 1; ci >= 0; ci--) {
          if ((gfx.children[ci] as any)._isCardText) {
            const child = gfx.children[ci];
            gfx.removeChild(child);
            child.destroy();
          }
        }
      }
    }
    if (isExtremeZoom) {
      // Extreme zoom-out: draw fixed-size rectangles (1×1 screen pixel)
      const dotSize = 1 / worldScale;
      g.lineStyle(0);
      for (const pn of visible) {
        const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
        g.beginFill(pn.color, nodeAlpha);
        g.drawRect(pn.data.x - dotSize / 2, pn.data.y - dotSize / 2, dotSize, dotSize);
        g.endFill();
      }
    } else if (isMidZoom) {
      // Mid zoom: all circles (skip shape lookup + gradient for speed)
      g.lineStyle(0);
      for (const pn of visible) {
        const effR = Math.max(pn.radius, minWorldRadius);
        const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
        g.beginFill(pn.color, nodeAlpha);
        g.drawCircle(pn.data.x, pn.data.y, effR);
        g.endFill();
      }
    } else {
      // Normal zoom: full shape + optional gradient, with display mode support
      const displayMode = this.host.getNodeDisplayMode();
      const useGradient = nodeCount < rt.gradientNodeCount;

      // Clean up any previous table-card text children when NOT in table card mode
      // (prevents stale text when switching modes or when nodes leave viewport)
      if (displayMode !== "card" || (this.host.getCardDisplayConfig().headerStyle ?? "plain") !== "table") {
        for (const pn of pixiNodes.values()) {
          const gfx = pn.gfx;
          for (let ci = gfx.children.length - 1; ci >= 0; ci--) {
            if ((gfx.children[ci] as any)._isCardText) {
              const child = gfx.children[ci];
              gfx.removeChild(child);
              child.destroy();
            }
          }
        }
      }

      if (displayMode === "node") {
        // Default mode: unchanged shape rendering
        for (const pn of visible) {
          const shape = getNodeShape(pn.data, shapeRules);
          const effR = Math.max(pn.radius, minWorldRadius);
          const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
          const strokeColor = darkenColor(pn.color, crc.strokeDarken);
          g.lineStyle(1, strokeColor, nodeAlpha * crc.strokeAlpha);
          if (useGradient && shape === "circle") {
            const innerCol = lightenColor(pn.color, crc.gradientHighlight);
            const outerCol = darkenColor(pn.color, crc.gradientShadow);
            g.beginRadialFill(pn.data.x, pn.data.y, effR, innerCol, outerCol, nodeAlpha, nodeAlpha);
          } else {
            g.beginFill(pn.color, nodeAlpha);
          }
          drawShapeAt(g, shape, pn.data.x, pn.data.y, effR);
          g.endFill();
          // Double outline for super nodes (collapsed groups)
          if (pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0) {
            const innerR = effR * rt.superNodeInnerRatio;
            g.lineStyle(rt.superNodeInnerStroke / worldScale, strokeColor, nodeAlpha * rt.superNodeInnerAlpha);
            g.drawCircle(pn.data.x, pn.data.y, innerR);
            g.lineStyle(0);
          }
        }
      } else if (displayMode === "card") {
        // Card mode: draw rounded rectangle background
        const cardConfig = this.host.getCardDisplayConfig();
        const headerStyle = cardConfig.headerStyle ?? "plain";
        const cardMaxW = (cardConfig.maxWidth ?? 120) / worldScale;
        const showIcon = cardConfig.showIcon === true;

        // Clean up any previous card text children from ALL nodes
        // (handles mode switches, viewport culling, and node count changes)
        for (const pn of pixiNodes.values()) {
          const gfx = pn.gfx;
          for (let ci = gfx.children.length - 1; ci >= 0; ci--) {
            const child = gfx.children[ci];
            if ((child as any)._isCardText) {
              gfx.removeChild(child);
              child.destroy();
            }
          }
        }

        if (headerStyle === "table") {
          // ---- Table (ER-diagram) card style ----
          const headerH = crc.tableHeaderHeight / worldScale;
          const fieldLineH = crc.fieldLineHeight / worldScale;
          const pad = crc.cardPadding / worldScale;
          const cornerR = crc.cardCornerRadius / worldScale;
          const showMeta = nodeCount < rt.cardTextNodeCount && cardConfig.fields.length > 0;
          const fieldCount = showMeta ? cardConfig.fields.length : 0;
          const totalH = headerH + fieldCount * fieldLineH + pad * 2;

          // Track nodes that need text rendering
          const tableCardNodes: PixiNode[] = [];

          // Card width: golden ratio (or custom aspect ratio) based on content height
          const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
          const arHalfW = (totalH * cardAR) / 2;

          for (const pn of visible) {
            const effR = Math.max(pn.radius, minWorldRadius);
            const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
            // Use aspect-ratio width if set, otherwise fall back to radius-based
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
            // Top corners rounded, bottom corners square — approximate with full rounded rect clipped by body
            g.drawRoundedRect(cardX, cardY, cardW, headerH + cornerR, cornerR);
            g.endFill();
            // Fill the corner overlap area at bottom of header
            g.beginFill(pn.color, nodeAlpha * crc.cardHeaderAlpha);
            g.drawRect(cardX, cardY + headerH, cardW, cornerR);
            g.endFill();

            // 2b. File icon in header (when showIcon enabled)
            if (showIcon) {
              const iconS = headerH * 0.55;
              const foldS = iconS * 0.28;
              const iconX = cardX + pad;
              const iconY = cardY + (headerH - iconS) / 2;
              // Page body outline
              g.lineStyle(0.5 / worldScale, 0xffffff, nodeAlpha * 0.7);
              g.beginFill(0xffffff, nodeAlpha * 0.25);
              g.moveTo(iconX, iconY);
              g.lineTo(iconX + iconS - foldS, iconY);
              g.lineTo(iconX + iconS, iconY + foldS);
              g.lineTo(iconX + iconS, iconY + iconS);
              g.lineTo(iconX, iconY + iconS);
              g.closePath();
              g.endFill();
              // Fold triangle
              g.lineStyle(0);
              g.beginFill(0xffffff, nodeAlpha * 0.15);
              g.moveTo(iconX + iconS - foldS, iconY);
              g.lineTo(iconX + iconS - foldS, iconY + foldS);
              g.lineTo(iconX + iconS, iconY + foldS);
              g.closePath();
              g.endFill();
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

          // ---- Text pass for table cards (only when node count < 200) ----
          if (tableCardNodes.length > 0) {
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
              const iconOffset = showIcon ? (headerH * 0.55 + pad) : 0;
              // Available text width inside the card
              const availableTextW = halfW * 2 - textPadX * 2 - iconOffset;

              // Header text (bold, white)
              const headerText = new CanvasText(pn.data.label, {
                fontSize,
                fontWeight: "bold",
                fill: 0xffffff,
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              });
              (headerText as any)._isCardText = true;
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
                (fieldText as any)._isCardText = true;
                fieldText.x = -halfW + textPadX;
                fieldText.y = cardY + headerH + fi * fieldLineH + fieldLineH / 2 + smallFontSize * crc.fontBaselineOffset;
                if (rt.cardTextTruncation !== false) fieldText.maxWidth = availableTextW;
                gfx.addChild(fieldText);
              }
            }
          }
        } else {
          // ---- Plain card style (original, unchanged) ----
          const cardH = crc.plainCardHeight / worldScale; // base card height
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
      } else if (displayMode === "donut") {
        // Donut mode: draw ring (outer circle with inner cutout)
        const donutConfig = this.host.getDonutDisplayConfig();
        const innerR = donutConfig.innerRadius ?? 0.6;
        const bgColor = this.host.isDarkTheme() ? 0x1e1e1e : 0xffffff;

        for (const pn of visible) {
          const effR = Math.max(pn.radius, minWorldRadius);
          const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;

          // Check if this is a super node with breakdown data
          const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
          if (isSuperNode && donutConfig.breakdownField) {
            // Draw sector breakdown for super nodes
            // Collect member categories from pixiNodes
            const members = pn.data.collapsedMembers!;
            const valueCounts = new Map<string, number>();
            for (const memberId of members) {
              const memberPn = this.host.getPixiNodes().get(memberId);
              const val = memberPn?.data?.meta?.[donutConfig.breakdownField] as string ?? "other";
              valueCounts.set(val, (valueCounts.get(val) ?? 0) + 1);
            }

            // Draw sectors
            let startAngle = -Math.PI / 2;
            const total = members.length;
            let colorIdx = 0;
            const sectorColors = [0x818cf8, 0xf472b6, 0xfbbf24, 0x34d399, 0x60a5fa, 0xf87171, 0xa78bfa, 0x2dd4bf];
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
            // Inner circle cutout (draw background-color circle on top)
            g.beginFill(bgColor, 1);
            g.drawCircle(pn.data.x, pn.data.y, effR * innerR);
            g.endFill();
          } else {
            // Single-color ring for individual nodes
            const strokeColor = darkenColor(pn.color, 0.4);
            g.lineStyle(1, strokeColor, nodeAlpha * 0.5);
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
      } else if (displayMode === "sunburst-segment") {
        // Sunburst segment mode: draw arc segments
        const arcAngleDeg = 30; // default arc angle
        const arcAngle = (arcAngleDeg * Math.PI) / 180;

        for (let i = 0; i < visible.length; i++) {
          const pn = visible[i];
          const effR = Math.max(pn.radius, minWorldRadius);
          const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
          // Compute angle offset based on index for uniform distribution
          const angleOffset = (i / Math.max(visible.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const startAngle = angleOffset - arcAngle / 2;
          const endAngle = angleOffset + arcAngle / 2;

          const strokeColor = darkenColor(pn.color, 0.4);
          g.lineStyle(1, strokeColor, nodeAlpha * 0.5);
          g.beginFill(pn.color, nodeAlpha);
          g.moveTo(pn.data.x, pn.data.y);
          g.arc(pn.data.x, pn.data.y, effR, startAngle, endAngle);
          g.lineTo(pn.data.x, pn.data.y);
          g.endFill();
        }
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
    // Clean up leader lines before clearing
    for (const pn of pixiNodes.values()) {
      if (pn.leaderLine) { pn.leaderLine.destroy(); pn.leaderLine = null; }
    }
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
    const memberCount = isSuperNode ? n.collapsedMembers!.length : 0;
    const MAX_NODE_RADIUS = 30;
    const scaleByDegree = this.host.getScaleByDegree?.() ?? true;
    const rawR = (isSuperNode && scaleByDegree)
      ? Math.max(nodeR(n), nodeR(n) * (1 + Math.sqrt(memberCount) * 0.5))
      : nodeR(n);
    const r = Math.min(rawR, MAX_NODE_RADIUS);
    const color = nodeColor(n);
    const circle = new CanvasGraphics();
    if (isSuperNode) {
      const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };
      circle.lineStyle(rt.superNodeOuterStroke, color, 1);
      circle.drawCircle(0, 0, r);
      circle.lineStyle(rt.superNodeInnerStroke, color, rt.superNodeInnerAlpha);
      circle.drawCircle(0, 0, r * rt.superNodeInnerRatio);
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
      const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };
      label = new CanvasText(n.label, {
        fontSize: 11, fill: this.host.getLabelColor(),
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      label.bgColor = rt.labelBgColor;
      label.bgAlpha = rt.labelBgAlpha;
      label.x = r + 2;
      label.y = -(r * 0.4 + 2);
      container.addChild(label);
    }

    world.addChild(container);

    const pixiNodes = this.host.getPixiNodes();
    pixiNodes.set(n.id, {
      data: n, gfx: container, circle, label,
      hoverLabel: null, leaderLine: null, radius: r, color, held: false,
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
  // Label overlap culling — hide labels that overlap higher-priority ones
  // =========================================================================
  cullOverlappingLabels() {
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds?.() };
    if (!rt.labelOverlapCulling) return;

    const margin = rt.labelOverlapMargin;
    const pixiNodes = this.host.getPixiNodes();
    const degrees = this.host.getDegrees();

    // Build label-to-pixiNode map for O(1) lookups
    interface LabelRect {
      pn: PixiNode;
      label: CanvasText;
      x: number;
      y: number;
      w: number;
      h: number;
      degree: number;
    }
    const rects: LabelRect[] = [];

    for (const pn of pixiNodes.values()) {
      const label = pn.label;
      if (!label || !label.text || !label.visible) continue;
      // Approximate label dimensions (scale-aware)
      const fontSize = (label.style.fontSize as number) ?? 11;
      const charW = fontSize * 0.6;
      const scaleX = label.scale?.x ?? 1;
      const scaleY = label.scale?.y ?? 1;
      const w = label.text.length * charW * scaleX;
      const h = fontSize * scaleY * 1.3;
      // World position
      const wx = pn.data.x + label.x * scaleX;
      const wy = pn.data.y + label.y * scaleY;
      rects.push({ pn, label, x: wx, y: wy, w, h, degree: degrees.get(pn.data.id) ?? 0 });
    }

    // Sort by degree descending — high-degree labels get priority
    rects.sort((a, b) => b.degree - a.degree);

    const placed: LabelRect[] = [];
    const checkOverlap = (rect: LabelRect): boolean => {
      for (const p of placed) {
        if (
          rect.x - margin < p.x + p.w + margin &&
          rect.x + rect.w + margin > p.x - margin &&
          rect.y - margin < p.y + p.h + margin &&
          rect.y + rect.h + margin > p.y - margin
        ) return true;
      }
      return false;
    };

    const drawLeader = rt.labelLeaderLines;
    const llAlpha = rt.labelLeaderLineAlpha;
    const llWidth = rt.labelLeaderLineWidth;

    // Clear all existing leader lines before re-evaluation
    for (const pn of pixiNodes.values()) {
      if (pn.leaderLine) {
        pn.leaderLine.clear();
        pn.leaderLine.visible = false;
      }
    }

    for (const r of rects) {
      const { pn } = r;
      const nodeR = pn.radius ?? 6;

      if (!checkOverlap(r)) {
        // Original position works — no leader line needed
        placed.push(r);
        continue;
      }

      // Try 4 alternate offsets (in world-space units) before hiding.
      // Offsets account for label scale via r.w/r.h which are already scaled.
      const offsets = [
        { dx: r.w * 0.5 + nodeR, dy: nodeR + r.h },     // bottom-right
        { dx: -(r.w + nodeR + 2), dy: 0 },               // left
        { dx: 0, dy: nodeR + r.h * 1.5 },                // below (further)
        { dx: r.w * 0.3 + nodeR, dy: -(nodeR + r.h) },   // top-right
      ];
      let found = false;
      const scaleX = r.label.scale?.x ?? 1;
      const scaleY = r.label.scale?.y ?? 1;

      for (const off of offsets) {
        const alt: LabelRect = { ...r, x: r.x + off.dx, y: r.y + off.dy };
        if (!checkOverlap(alt)) {
          // Apply offset in label-local coords (divide by scale since world offset)
          r.label.x += off.dx / scaleX;
          r.label.y += off.dy / scaleY;
          placed.push(alt);
          found = true;

          // Draw leader line from node edge to nearest point on displaced label
          if (drawLeader) {
            if (!pn.leaderLine) {
              pn.leaderLine = new CanvasGraphics();
              pn.gfx.addChild(pn.leaderLine);
            }
            const ll = pn.leaderLine;
            ll.clear();
            ll.visible = true;
            // Label rect in local coords
            const lx = r.label.x;
            const ly = r.label.y;
            const lw = r.w / scaleX;
            const lh = r.h / scaleY;
            // Closest point on label rect to node center (0,0)
            const anchorX = Math.max(lx, Math.min(0, lx + lw));
            const anchorY = Math.max(ly, Math.min(0, ly + lh));
            const dist = Math.sqrt(anchorX ** 2 + anchorY ** 2);
            const edgeX = dist > 0.1 ? (anchorX / dist) * nodeR : 0;
            const edgeY = dist > 0.1 ? (anchorY / dist) * nodeR : 0;
            ll.lineStyle(llWidth, pn.color, llAlpha);
            ll.moveTo(edgeX, edgeY);
            ll.lineTo(anchorX, anchorY);
          }
          break;
        }
      }
      if (!found) {
        r.label.visible = false;
      }
    }
  }
}
