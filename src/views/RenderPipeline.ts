import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { GraphNode, NodeDisplayMode, CardDisplayConfig, DonutDisplayConfig, CardRenderConfig, RenderThresholds } from "../types";
import { DEFAULT_CARD_RENDER_CONFIG, mergeRenderThresholds } from "../types";
import type { PixiNode } from "./InteractionManager";
import { getNodeShape, drawShape, drawShapeAt, getNodeDisplayConfig } from "../utils/node-shapes";
import type { ShapeRule } from "../utils/node-shapes";
import { effectiveRadius } from "../layouts/cluster-force";
import { clamp } from "../utils/geometry";
import { hexToRgb, getLuminance, wcagContrastRatio, contrastColor } from "../utils/color";
import { hslToHex, incCounter } from "../utils/graph-helpers";
import { SpatialHashGrid } from "../utils/spatial-grid";

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

const CARD_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, sans-serif";

/** Create a CanvasText marked as card text. */
function createCardText(
  str: string, fontSize: number, fill: number,
  weight: "normal" | "bold" = "normal",
  style: "normal" | "italic" = "normal",
): CardText {
  const t = new CanvasText(str, {
    fontSize, fill, fontWeight: weight, fontStyle: style, fontFamily: CARD_FONT_FAMILY,
  });
  return markAsCardText(t);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EDGE_REDRAW_SKIP = 3;

/** Number of frames the render loop idles before detaching the ticker */
const IDLE_FRAME_DETACH_THRESHOLD = 60;

/** Screen-space node radius estimate used for LOD tier calculations (px) */
const NODE_SCREEN_PX_BASE = 30;

/** Minimum world radius applied at non-extreme zoom to keep nodes visible.
 *  Nodes are always at least 2×this value in screen-pixel diameter. */
export const MIN_WORLD_RADIUS_PX = 8;

/** Convert a screen-pixel size to world units, floored at `floor`. */
export function screenToWorld(screenPx: number, ws: number, floor: number): number {
  return Math.max(floor, ws > 0 ? screenPx / ws : floor);
}

/** Viewport culling margin in world units (divided by worldScale) */
const VIEWPORT_CULL_MARGIN_PX = 60;

/** Maximum number of labels created before dynamically raising degree threshold */
const MAX_LABEL_COUNT = 500;

/** Default minimum degree threshold for showing node labels */
const DEFAULT_LABEL_DEGREE_THRESHOLD = 3;

/** Number of nodes created synchronously before deferring the rest */
const IMMEDIATE_BATCH_SIZE = 200;

/** Number of nodes processed per deferred batch frame (higher = faster initial render) */
const DEFERRED_BATCH_SIZE = 200;

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

/** 比較選択リングの線幅 */
const COMPARE_RING_LINE_WIDTH = 2.5;
/** 比較選択リングの半径パディング */
const COMPARE_RING_RADIUS_PAD = 8;
/** 比較選択リングの色 (マゼンタ系) */
const COMPARE_RING_COLOR = 0xe879f9;
/** 比較選択リングのアルファ */
const COMPARE_RING_ALPHA = 0.85;
/** 比較選択リングの破線セグメント数 */
const COMPARE_RING_SEGMENTS = 8;
/** 比較選択リングの破線ギャップ比率 */
const COMPARE_RING_GAP = 0.3;

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

/** Maximum counter-scale factor for card mode (prevents enormous cards at extreme zoom-out) */
const CARD_SCALE_CAP = 8;

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
/** Sub-label font size (px) */
const SUB_LABEL_FONT_SIZE = 9;
/** Sub-label alpha opacity */
const SUB_LABEL_ALPHA = 0.6;
/** Sub-label vertical gap between each sub-label (px) */
const SUB_LABEL_GAP = 2;

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
// OVERLAP_GRID_HASH_PRIME removed — grid logic now in SpatialHashGrid

/** Glow attenuation node count threshold (above this, glow starts fading) */
const GLOW_ATTENUATE_THRESHOLD = 300;
/** Glow attenuation range (from threshold to threshold+range, glow fades to zero) */
const GLOW_ATTENUATE_RANGE = 500;
/** Glow radius attenuation max factor */
const GLOW_RADIUS_ATTENUATE_FACTOR = 0.7;
/** P90 percentile fraction for hub node glow detection */
const GLOW_P90_FRACTION = 0.9;

// Semantic-zoom compact card font sizes (tier 3 = compact labels)
const COMPACT_CARD_FONT_MIN = 6;
const COMPACT_CARD_FONT_BASE = 9;

// Semantic-zoom full card font sizes (tier 4 = name + definition + preview)
const FULL_CARD_FONT_MIN = 7;
const FULL_CARD_FONT_BASE = 10;

/** Ratio of sub-field font to header font in semantic-zoom cards */
const CARD_SUB_FONT_RATIO = 0.85;

/** Line height multiplier for card text (vertical spacing between lines) */
const CARD_LINE_HEIGHT = 1.3;

/** Plain card body line height multiplier (slightly more spacing than table) */
const PLAIN_CARD_BODY_LINE_HEIGHT = 1.4;

/** Plain card title font minimum size (px) */
const PLAIN_CARD_TITLE_FONT_MIN = 3;

/** Plain card body font minimum size (px) */
const PLAIN_CARD_BODY_FONT_MIN = 2;

/** Plain card internal padding (px, scaled by worldScale) */
const PLAIN_CARD_PAD = 4;

// ---------------------------------------------------------------------------
// darkenColor utility (shared with GraphViewContainer)
// ---------------------------------------------------------------------------
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
export function computeDensityMinDist(
  baseDist: number,
  maxDist: number,
  zoom: number,
  threshold: number,
): number {
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
    { dx: hw + pad, dy: pad + labelH },              // bottom-right
    { dx: -(labelW + pad), dy: 0 },                  // left
    { dx: 0, dy: pad + labelH * 1.2 },               // below
    { dx: hw + pad, dy: -(pad + labelH) },            // top-right
    { dx: -(labelW + pad), dy: -(pad + labelH) },     // top-left
    { dx: -(labelW + pad), dy: pad + labelH },        // bottom-left
    { dx: hw + pad, dy: -(pad + labelH * 1.2) },      // above-right
    { dx: -(hw + pad), dy: -(pad + labelH * 1.2) },   // above-left
    { dx: labelW + pad * 2, dy: 0 },                  // far right
    { dx: 0, dy: -(pad + labelH * 1.5) },             // far above
    { dx: -(labelW + pad * 2), dy: pad + labelH * 0.5 }, // far bottom-left
    { dx: hw + pad, dy: pad + labelH * 1.5 },         // far below-right
  ];
}

/** Darken a hex color by mixing toward black. factor 0 = unchanged, 1 = black. */
export function darkenColor(hex: number, factor: number): number {
  const { r, g, b } = hexToRgb(hex);
  const dr = r * (1 - factor);
  const dg = g * (1 - factor);
  const db = b * (1 - factor);
  return (Math.round(dr) << 16) | (Math.round(dg) << 8) | Math.round(db);
}

/** Lighten a hex color by mixing toward white. factor 0 = unchanged, 1 = white. */
export function lightenColor(hex: number, factor: number): number {
  const { r, g, b } = hexToRgb(hex);
  const lr = r + (255 - r) * factor;
  const lg = g + (255 - g) * factor;
  const lb = b + (255 - b) * factor;
  return (Math.round(lr) << 16) | (Math.round(lg) << 8) | Math.round(lb);
}

/** Blend two hex colors. t=0 returns a, t=1 returns b. */
export function blendColors(a: number, b: number, t: number): number {
  const ar = hexToRgb(a), br = hexToRgb(b);
  return (Math.round(ar.r + (br.r - ar.r) * t) << 16) |
         (Math.round(ar.g + (br.g - ar.g) * t) << 8) |
          Math.round(ar.b + (br.b - ar.b) * t);
}

/** Desaturate a 0xRRGGBB color toward gray. factor=1 is original, factor=0 is fully gray. */
export function desaturateColor(color: number, factor: number): number {
  if (factor >= 1) return color;
  const { r, g, b } = hexToRgb(color);
  const gray = Math.round(getLuminance(r, g, b));
  const nr = Math.round(gray + (r - gray) * factor);
  const ng = Math.round(gray + (g - gray) * factor);
  const nb = Math.round(gray + (b - gray) * factor);
  return (nr << 16) | (ng << 8) | nb;
}

/** Simple deterministic hash of a string to a hue value (0–360). */
export function hashStringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

// hslToHex imported from ../utils/graph-helpers (DRY: removed local duplicate)

/** Truncate a label to maxChars, appending "…" if truncated. 0 or negative maxChars means no truncation. */
export function truncateLabel(label: string, maxChars: number): string {
  return maxChars > 0 && label.length > maxChars
    ? label.slice(0, maxChars) + "…"
    : label;
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
  /** HR: Get current world scale (zoom level) */
  getWorldScale(): number;
  /** HR: Re-evaluate labels after zoom change (LOD + cull) */
  updateLabelsForZoom?(): void;
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
  return k >= 0 && k < arr.length ? arr[k] : 0;
}

export class RenderPipeline {
  private host: RenderHost;

  // Render loop state
  private needsRedraw = true;
  private needsFullRedraw = false;
  private idleFrames = 0;
  private _tickerBound = false;
  private edgeRedrawCounter = 0;
  // HR: Track zoom for label re-evaluation on zoom change
  private _prevWorldScale = 1;
  private _labelCullCooldown = 0;

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
      const t0 = performance.now();
      this.updatePositions(this.needsFullRedraw);
      this.lastFrameMs = Math.round((performance.now() - t0) * 10) / 10;
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
    // InteractionManager already debounces updateLabelsForZoom on wheel zoom;
    // this path catches zoom changes from simulation ticks (node position drift).
    const curScale = this.host.getWorldScale();
    const zoomRatio = curScale > 0 ? Math.abs(curScale - this._prevWorldScale) / curScale : 0;
    this._labelCullCooldown--;
    if (forceFullRedraw || (zoomRatio > 0.05 && this._labelCullCooldown <= 0)) {
      this._prevWorldScale = curScale;
      const rt = mergeRenderThresholds(this.host.getRenderThresholds?.());
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

      // Use the same minWorldRadius as batch rendering so highlighted nodes
      // don't shrink compared to their batch-rendered size at low zoom.
      const worldScale = this.host.getWorldContainer()?.scale?.x ?? 1;
      const minWorldRadius = Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);
      const effR = Math.max(pn.radius, minWorldRadius);

      if (isKbFocused) {
        const focusRadius = effR * KB_FOCUS_RADIUS_FACTOR;
        const segments = KB_FOCUS_SEGMENTS;
        const gap = KB_FOCUS_GAP_FRACTION;
        // A11y: ensure focus ring visible at any zoom (min 2px screen-space width)
        // JH: high contrast mode doubles focus ring width for §0.3 compliance
        const hcFocus = this.host.isHighContrastMode?.() ? 2 : 1;
        const focusLineW = Math.max(KB_FOCUS_LINE_WIDTH * hcFocus, 2 / worldScale);
        const focusColor = this.host.isDarkTheme() ? 0x00ccff : 0x0066cc; // high-contrast cyan/blue
        pn.circle.lineStyle(focusLineW, focusColor, KB_FOCUS_LINE_ALPHA);
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
        drawShape(pn.circle, shape, effR * crc.highlightHaloRadius, pn.color, crc.highlightHaloAlpha);
      }

      const strokeCol = darkenColor(pn.color, crc.strokeDarken);
      pn.circle.lineStyle(crc.highlightStrokeWidth, strokeCol, 0.85);
      drawShape(pn.circle, shape, effR, pn.color, 1);
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
    const rt = mergeRenderThresholds(this.host.getRenderThresholds?.());

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
    type PassFn = (g: CanvasGraphics, ctx: typeof ctxRef) => void;
    const ctxRef = ctx;
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
    passes.push((g, c) => this._renderPathfinderMarkers(g, c));

    // Pass 5: Compare selection rings
    passes.push((g, c) => this._renderCompareRings(g, c));

    // Pass 6: Bookmark star overlay
    passes.push((g, c) => this._renderBookmarkStars(g, c));

    // Pass 7: Missing neighbor orange rings
    passes.push((g, c) => this._renderMissingNeighborRings(g, c));

    // Pass 8: Tag badges on node circumference
    if (this.host.getShowTagBadges?.()) {
      passes.push((g, c) => this._renderTagBadges(g, c));
    }

    // Pass 9: Importance ring
    if (this.host.getShowImportanceRing?.()) {
      passes.push((g, c) => this._renderImportanceRings(g, c));
    }

    // Pass 10: Recency marker
    if (this.host.getRecencyConfig?.()) {
      passes.push((g, c) => this._renderRecencyMarkers(g, c));
    }

    // Pass 11: Bridge nodes — gold ring for high betweenness
    if (this.host.getBridgeNodeIds?.()) {
      passes.push((g, c) => this._renderBridgeNodes(g, c));
    }

    // Pass 12: Articulation point warning ring
    if (this.host.getArticulationPointIds?.()) {
      passes.push((g, c) => this._renderArticulationPoints(g, c));
    }

    // Pass 13: Entropy overlay — knowledge diversity heatmap
    if (this.host.getShowEntropyOverlay?.()) {
      passes.push((g, c) => this._renderEntropyOverlay(g, c));
    }

    // Pass 14: Multi-select rings
    const msIds = this.host.getMultiSelectNodeIds?.();
    if (msIds && msIds.length > 0) {
      const ids = msIds;
      passes.push((g, c) => this._renderMultiSelectRings(g, c, ids));
    }

    // Pass 15: S1 Hierarchy tree overlay
    passes.push((g, c) => this._renderHierarchyOverlay(g, c));

    // Pass 16: S6 Ontology backbone
    passes.push((g) => this._renderOntologyBackbone(g));

    // Pass 17: S4 Gap detection dotted edges
    passes.push((g) => this._renderGapEdges(g));

    // Execute all active passes
    for (const pass of passes) pass(g, ctx);
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
      if (nx < vpMinX || nx > vpMaxX || ny < vpMinY || ny > vpMaxY) {
        // JT: §0.4 Hide off-viewport nodes from PixiJS renderer for perf
        pn.gfx.visible = false;
        continue;
      }
      pn.gfx.visible = true;
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
    // A11y: even at extreme zoom-out, guarantee minimum 1px screen-space radius
    const minWorldRadius = isExtremeZoom
      ? Math.max(0.5 / worldScale, 1)  // at least 1px on screen
      : Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);

    // 5-level LOD (used when autoLOD is enabled)
    const lodLevel = computeLodLevel(nodeScreenPx, rt as Parameters<typeof computeLodLevel>[1]);

    return {
      visible, pixiNodes, tlFilteredOut, alpha, nodeCount,
      shapeRules, worldScale, isExtremeZoom, isMidZoom, minWorldRadius, lodLevel,
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
      lodLevel: number;
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

  /** Remove CardText children from a single node's gfx container. */
  private _cleanupCardText(gfx: CanvasContainer) {
    for (let ci = gfx.children.length - 1; ci >= 0; ci--) {
      if (isCardText(gfx.children[ci])) {
        const child = gfx.children[ci];
        gfx.removeChild(child);
        child.destroy();
      }
    }
  }

  /** Remove all CardText children from every node's gfx container. */
  private _cleanupCardTextAll(pixiNodes: Map<string, PixiNode>) {
    for (const pn of pixiNodes.values()) {
      this._cleanupCardText(pn.gfx);
    }
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
    // HM: 2px screen-space dots with 1px stroke for better visibility at extreme zoom
    const dotRadius = Math.max(1.5, 2 / worldScale);
    const strokeW = Math.max(0.5, 0.8 / worldScale);
    for (const pn of visible) {
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      g.lineStyle(strokeW, 0x000000, nodeAlpha * 0.4);
      g.beginFill(pn.color, nodeAlpha);
      g.drawCircle(pn.data.x, pn.data.y, dotRadius);
      g.endFill();
    }
    g.lineStyle(0);
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
      lodLevel: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const { pixiNodes } = ctx;
    const displayMode = this.host.getNodeDisplayMode();
    const autoLOD = rt.autoLOD;

    // Clean up stale card text when NOT in table card mode
    if (displayMode !== "card" || (this.host.getCardDisplayConfig().headerStyle ?? "plain") !== "table") {
      this._cleanupCardTextAll(pixiNodes);
    }

    // Auto-LOD: override display mode based on lodLevel
    if (autoLOD && displayMode === "node") {
      if (ctx.lodLevel >= 5) {
        // LOD 5: full card mode
        this._renderCardMode(g, ctx, crc, rt);
      } else if (ctx.lodLevel >= 4) {
        // LOD 4: compact card background + node rendering
        this._renderNodeModeAutoLOD(g, ctx, crc, rt);
      } else if (this.host.getSemanticZoom?.()) {
        this._renderSemanticZoomMode(g, ctx, crc, rt);
      } else {
        this._renderNodeMode(g, ctx, crc, rt);
      }
      return;
    }

    switch (displayMode) {
      case "node":
        if (this.host.getSemanticZoom?.()) {
          this._renderSemanticZoomMode(g, ctx, crc, rt);
        } else {
          this._renderNodeMode(g, ctx, crc, rt);
        }
        break;
      case "card": {
        // IC: Tiered density fallback to prevent card overlap at various zoom/density
        // LOD < 3: always circles (extreme zoom)
        // LOD 3 + >150 visible: circles (dense mid-zoom)
        // LOD 4 + >500 visible: node mode with labels (high density)
        // LOD 4/5 + <=500 or LOD 5: full cards
        const cardDensityThreshold = rt.cardDensityFallbackCount;
        const cardDensityThresholdHigh = rt.cardDensityFallbackCountHigh;
        if (ctx.lodLevel < 3 || (ctx.lodLevel === 3 && ctx.visible.length > cardDensityThreshold)) {
          this._renderNodeMode(g, ctx, crc, rt);
        } else if (ctx.lodLevel === 4 && ctx.visible.length > cardDensityThresholdHigh) {
          this._renderNodeMode(g, ctx, crc, rt);
        } else {
          this._renderCardMode(g, ctx, crc, rt);
        }
        break;
      }
      case "donut":
        this._renderDonutMode(g, ctx, crc, rt);
        break;
      case "sunburst-segment":
        this._renderSunburstSegmentMode(g, ctx, crc);
        break;
    }
  }

  /** Render compact card background (rounded rect) behind a node for LOD 4.
   *  A1: Height expands to accommodate sub-labels when present. */
  private _renderCompactCardBg(g: CanvasGraphics, pn: PixiNode, crc: Required<import("../types").CardRenderConfig>): void {
    const w = pn.radius * crc.compactCardWidthRatio;
    // Expand height if sub-labels exist (to house metadata text)
    const subCount = pn.subLabels?.length ?? 0;
    const h = pn.radius * crc.compactCardHeightRatio + subCount * (SUB_LABEL_FONT_SIZE + SUB_LABEL_GAP) * 0.06;
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
      visible: PixiNode[]; pixiNodes: Map<string, PixiNode>;
      tlFilteredOut: Set<string> | null; alpha: number; nodeCount: number;
      shapeRules: ShapeRule[]; worldScale: number; minWorldRadius: number;
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
      visible: PixiNode[]; tlFilteredOut: Set<string> | null;
      alpha: number; nodeCount: number; shapeRules: ShapeRule[];
      worldScale: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const { visible, tlFilteredOut, alpha, nodeCount, shapeRules, worldScale, minWorldRadius } = ctx;
    const prominentN = rt.prominentTopN;
    const nonPromSat = rt.nonProminentSaturation;
    const useGradient = nodeCount < rt.gradientNodeCount;

    // Zoom-adaptive node size: boost radius at zoom-out for visibility
    const zoomNodeBoost = worldScale < 0.5 ? 1 + (0.5 - worldScale) * 0.5 : 1; // up to 1.25x at zoom=0

    // Density-aware stroke: thicken stroke at zoom-out so overlapping nodes remain distinguishable
    // IK: High contrast mode doubles base stroke for better visibility
    const hc = this.host.isHighContrastMode?.() ?? false;
    const hcMul = hc ? 2 : 1;
    const dsZoomLow = rt.denseStrokeZoomLow;
    const dsZoomMid = rt.denseStrokeZoomMid;
    const dsMaxW = rt.denseStrokeMaxWidth;
    const dsMidW = rt.denseStrokeMidWidth;
    const baseStrokeW = (worldScale < dsZoomLow
      ? Math.min(2 / worldScale, dsMaxW)
      : worldScale < dsZoomMid ? dsMidW : 1) * hcMul;

    for (const pn of visible) {
      const shape = getNodeShape(pn.data, shapeRules);
      const effR = Math.max(pn.radius * zoomNodeBoost, minWorldRadius);
      let nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      // Zoom-out: fade low-degree nodes for visual clarity (AM: importance fade)
      // IA: Stronger fade so high-degree hubs stand out in dense clusters
      if (worldScale < 0.3 && pn.sortRank >= 0 && pn.sortRank >= prominentN * 2) {
        nodeAlpha *= Math.max(rt.fadeLowDegreeFloor, worldScale / 0.3);
      }

      // Desaturate non-prominent nodes
      let drawColor = pn.color;
      if (pn.sortRank >= 0 && pn.sortRank >= prominentN) {
        drawColor = desaturateColor(pn.color, nonPromSat);
      }
      const strokeColor = darkenColor(drawColor, crc.strokeDarken);
      g.lineStyle(baseStrokeW, strokeColor, nodeAlpha * crc.strokeAlpha);
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

  /** M1: Semantic zoom — per-node LOD based on screen-space size. */
  private _renderSemanticZoomMode(
    g: CanvasGraphics,
    ctx: {
      visible: PixiNode[]; pixiNodes: Map<string, PixiNode>;
      tlFilteredOut: Set<string> | null; alpha: number; nodeCount: number;
      shapeRules: ShapeRule[]; worldScale: number; minWorldRadius: number;
    },
    crc: ReturnType<typeof Object.assign>,
    rt: ReturnType<typeof Object.assign>,
  ) {
    const { visible, tlFilteredOut, alpha, shapeRules, worldScale, minWorldRadius } = ctx;
    const compactPx = rt.semanticZoomCompactPx;
    const fullPx = rt.semanticZoomFullPx;
    const defField = this.host.getDefinitionField?.() ?? "";
    // IK: High contrast stroke multiplier for semantic zoom card paths
    const hcSem = this.host.isHighContrastMode?.() ? 2 : 1;
    const labelColor = this.host.getLabelColor();

    for (const pn of visible) {
      const effR = Math.max(pn.radius, minWorldRadius);
      const screenPx = effR * 2 * worldScale;
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;

      if (screenPx < 1.5) {
        // Tier 1: colored dot
        const dotSize = 1 / worldScale;
        g.lineStyle(0);
        g.beginFill(pn.color, nodeAlpha);
        g.drawRect(pn.data.x - dotSize / 2, pn.data.y - dotSize / 2, dotSize, dotSize);
        g.endFill();
      } else if (screenPx < compactPx) {
        // Tier 2: circle + label
        const shape = getNodeShape(pn.data, shapeRules);
        const strokeColor = darkenColor(pn.color, crc.strokeDarken);
        g.lineStyle(hcSem, strokeColor, nodeAlpha * crc.strokeAlpha);
        g.beginFill(pn.color, nodeAlpha);
        drawShapeAt(g, shape, pn.data.x, pn.data.y, effR);
        g.endFill();
      } else if (screenPx < fullPx) {
        // Tier 3: compact card (name + definition field)
        const cardW = effR * 4;
        const cardH = effR * 2;
        const halfW = cardW / 2;
        const halfH = cardH / 2;
        const strokeColor = darkenColor(pn.color, crc.strokeDarken);
        g.lineStyle(hcSem, strokeColor, nodeAlpha * crc.strokeAlpha);
        g.beginFill(pn.color, nodeAlpha * crc.semanticCardFillAlpha);
        g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, cardH, 2 / worldScale);
        g.endFill();
        // Compact card text via gfx children
        const gfx = pn.gfx;
        this._cleanupCardText(gfx);
        const fontSize = Math.min(Math.max(COMPACT_CARD_FONT_MIN, COMPACT_CARD_FONT_BASE / worldScale), COMPACT_CARD_FONT_BASE * CARD_SCALE_CAP);
        const nameText = createCardText(truncateLabel(pn.data.label, rt.labelMaxChars), fontSize, labelColor, "bold");
        nameText.x = -halfW + 2 / worldScale;
        nameText.y = -halfH + 2 / worldScale;
        nameText.maxWidth = cardW - 4 / worldScale;
        gfx.addChild(nameText);
        if (defField && pn.data.meta?.[defField]) {
          const defText = createCardText(String(pn.data.meta[defField]), fontSize * CARD_SUB_FONT_RATIO, labelColor);
          defText.x = -halfW + 2 / worldScale;
          defText.y = -halfH + fontSize * CARD_LINE_HEIGHT + 2 / worldScale;
          defText.maxWidth = cardW - 4 / worldScale;
          defText.alpha = crc.cardSubTextAlpha;
          gfx.addChild(defText);
        }
      } else {
        // Tier 4: full card (name + definition + bodyPreview)
        const cardW = effR * 5;
        const cardH = effR * 3;
        const halfW = cardW / 2;
        const halfH = cardH / 2;
        const strokeColor = darkenColor(pn.color, crc.strokeDarken);
        g.lineStyle(hcSem, strokeColor, nodeAlpha * crc.strokeAlpha);
        g.beginFill(pn.color, nodeAlpha * crc.semanticCardFullFillAlpha);
        g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, cardH, 3 / worldScale);
        g.endFill();
        // Header bar
        const headerH = effR * crc.semanticCardHeaderHeightRatio;
        g.beginFill(pn.color, nodeAlpha * crc.semanticCardHeaderFillAlpha);
        g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, headerH, 3 / worldScale);
        g.endFill();

        const gfx = pn.gfx;
        this._cleanupCardText(gfx);
        const fontSize = Math.min(Math.max(FULL_CARD_FONT_MIN, FULL_CARD_FONT_BASE / worldScale), FULL_CARD_FONT_BASE * CARD_SCALE_CAP);
        const smallFont = fontSize * CARD_SUB_FONT_RATIO;
        let curY = -halfH + 3 / worldScale;
        const nameText = createCardText(truncateLabel(pn.data.label, rt.labelMaxChars), fontSize, contrastColor(pn.color), "bold");
        nameText.x = -halfW + 3 / worldScale;
        nameText.y = curY;
        nameText.maxWidth = cardW - 6 / worldScale;
        gfx.addChild(nameText);
        curY += fontSize * CARD_LINE_HEIGHT;

        if (defField && pn.data.meta?.[defField]) {
          const defText = createCardText(String(pn.data.meta[defField]), smallFont, labelColor, "bold");
          defText.x = -halfW + 3 / worldScale;
          defText.y = curY;
          defText.maxWidth = cardW - 6 / worldScale;
          gfx.addChild(defText);
          curY += smallFont * 1.3;
        }
        if (pn.data.bodyPreview) {
          const previewText = createCardText(pn.data.bodyPreview, smallFont, labelColor, "normal", "italic");
          previewText.x = -halfW + 3 / worldScale;
          previewText.y = curY;
          previewText.maxWidth = cardW - 6 / worldScale;
          previewText.alpha = crc.cardBodyPreviewAlpha;
          gfx.addChild(previewText);
        }
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
    const cardMaxW = (cardConfig.maxWidth ?? 200) / worldScale;
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
    // Cap card counter-scale to prevent cards from becoming enormous at extreme zoom-out
    const cardScale = Math.min(1 / worldScale, CARD_SCALE_CAP);
    // Sync font size cap with cardScale to prevent text overflow
    const cardFontScaleCap = CARD_SCALE_CAP * worldScale; // effective 1/worldScale capped
    const headerH = crc.tableHeaderHeight * cardScale;
    const fieldLineH = crc.fieldLineHeight * cardScale;
    const pad = crc.cardPadding * cardScale;
    const cornerR = crc.cardCornerRadius * cardScale;
    // IE: Card content respects hover checklist for meta/body display
    const panelMeta = this.host.getPanel?.()?.hoverShowMeta ?? true;
    const panelBody = this.host.getPanel?.()?.hoverShowBody ?? false;
    const showMeta = panelMeta && nodeCount < rt.cardTextNodeCount && cardConfig.fields.length > 0;
    const fieldCount = showMeta ? cardConfig.fields.length : 0;
    // M4: extra rows for definitionField and bodyPreview
    const defField = this.host.getDefinitionField?.() ?? "";
    const hasDefField = (panelMeta && defField.length > 0) ? 1 : 0;
    const hasPreview = panelBody ? 1 : 0;
    const totalH = headerH + (fieldCount + hasDefField + hasPreview) * fieldLineH + pad * 2;

    const tableCardNodes: PixiNode[] = [];

    // Card width: golden ratio (or custom aspect ratio) based on content height
    const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
    const arHalfW = (totalH * cardAR) / 2;

    for (const pn of visible) {
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      // Card minimum width: at least 40 world-px so body text is readable, capped to prevent enormous cards
      const MIN_CARD_HALF_W = Math.min(20 / worldScale, 20 * CARD_SCALE_CAP);
      const halfW = Math.max(MIN_CARD_HALF_W, Math.min(cardMaxW / 2, crc.cardAspectRatio > 0 ? arHalfW : effR * crc.cardWidthFactor));
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

      // Outer border (IK: high contrast doubles stroke)
      const hcTable = this.host.isHighContrastMode?.() ? 2 : 1;
      const strokeColor = darkenColor(pn.color, crc.strokeDarken);
      g.lineStyle(hcTable, strokeColor, nodeAlpha * crc.strokeAlpha);
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
      const MIN_CARD_HALF_W_TEXT = Math.min(20 / worldScale, 20 * CARD_SCALE_CAP);
      const halfW = Math.max(MIN_CARD_HALF_W_TEXT, Math.min(cardMaxW / 2, crc.cardAspectRatio > 0 ? arHalfW : effR * crc.cardWidthFactor));
      const cardY = -totalH / 2;  // relative to pn.gfx
      const textPadX = pad;
      const fontSize = Math.min(Math.max(crc.headerFontSizeMin, crc.headerFontSizeBase / worldScale), crc.headerFontSizeBase * CARD_SCALE_CAP);
      const smallFontSize = Math.min(Math.max(crc.fieldFontSizeMin, crc.fieldFontSizeBase / worldScale), crc.fieldFontSizeBase * CARD_SCALE_CAP);
      const fieldCount2 = cardConfig.fields.length;
      const gfx = pn.gfx;

      // Icon offset for header text
      const iconOffset = showIcon ? (headerH * CARD_ICON_SIZE_RATIO + pad) : 0;
      const availableTextW = halfW * 2 - textPadX * 2 - iconOffset;

      // Header text (bold, white) — apply GD labelMaxChars
      const headerText = createCardText(truncateLabel(pn.data.label, rt.labelMaxChars), fontSize, contrastColor(pn.color), "bold");
      headerText.x = -halfW + textPadX + iconOffset;
      headerText.y = cardY + headerH / 2 + fontSize * crc.fontBaselineOffset;
      if (rt.cardTextTruncation !== false) headerText.maxWidth = availableTextW;
      gfx.addChild(headerText);

      // M4: Definition field (bold line above regular fields)
      const defField = this.host.getDefinitionField?.() ?? "";
      const meta = pn.data.meta ?? {};
      let extraRowOffset = 0;
      if (defField && meta[defField] != null && String(meta[defField]) !== "") {
        const defText = createCardText(String(meta[defField]), smallFontSize, labelColor, "bold");
        defText.x = -halfW + textPadX;
        defText.y = cardY + headerH + extraRowOffset * fieldLineH + fieldLineH / 2 + smallFontSize * crc.fontBaselineOffset;
        if (rt.cardTextTruncation !== false) defText.maxWidth = availableTextW;
        gfx.addChild(defText);
        extraRowOffset++;
      }

      // Field rows
      const fieldValueOnly = cardConfig.fieldFormat === "value-only";
      for (let fi = 0; fi < fieldCount2; fi++) {
        const fieldName = cardConfig.fields[fi];
        const rawVal = meta[fieldName];
        const valStr = rawVal == null ? "" : String(rawVal);
        const displayText = fieldValueOnly ? valStr : `${fieldName}: ${valStr}`;
        const fieldText = createCardText(displayText, smallFontSize, labelColor);
        fieldText.x = -halfW + textPadX;
        fieldText.y = cardY + headerH + (fi + extraRowOffset) * fieldLineH + fieldLineH / 2 + smallFontSize * crc.fontBaselineOffset;
        if (rt.cardTextTruncation !== false) fieldText.maxWidth = availableTextW;
        gfx.addChild(fieldText);
      }

      // M4: Body preview (italic, last line)
      if (pn.data.bodyPreview) {
        const previewText = createCardText(pn.data.bodyPreview, smallFontSize, labelColor, "normal", "italic");
        previewText.x = -halfW + textPadX;
        previewText.y = cardY + headerH + (fieldCount2 + extraRowOffset) * fieldLineH + fieldLineH / 2 + smallFontSize * crc.fontBaselineOffset;
        previewText.alpha = crc.cardSubTextAlpha;
        if (rt.cardTextTruncation !== false) previewText.maxWidth = availableTextW;
        gfx.addChild(previewText);
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
    // IE: Card content respects hover checklist
    const panelMeta2 = this.host.getPanel?.()?.hoverShowMeta ?? true;
    const showMeta = panelMeta2 && nodeCount < rt.cardTextNodeCount && cardConfig.fields.length > 0;
    const fieldLineH = crc.fieldLineHeight / worldScale;

    // HM: Golden ratio for plain cards — compute width from height × AR
    const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;

    for (const pn of visible) {
      const effR = Math.max(pn.radius, minWorldRadius);
      const nodeAlpha = (tlFilteredOut && tlFilteredOut.has(pn.data.id)) ? alpha * crc.filteredNodeAlpha : alpha;
      const MIN_PLAIN_HALF_W = 20 / worldScale;
      // HM: Step 1 — estimate base height (title + optional meta)
      const baseH = showMeta ? cardH + cardConfig.fields.length * fieldLineH : cardH;
      // HM: Step 2 — golden ratio width from base height
      const arHalfW = (baseH * cardAR) / 2;
      const halfW = Math.max(MIN_PLAIN_HALF_W, Math.min(cardMaxW / 2, arHalfW));
      // FI: Dynamic card height based on body content (uses final width for line wrapping)
      // IP: Use cardBodyMaxLines (not hardcoded 3) for consistent card height
      const maxBodyLines = rt.cardBodyMaxLines;
      const bodyLines = pn.data.bodyPreview ? Math.min(maxBodyLines, Math.ceil(pn.data.bodyPreview.length / Math.max(5, Math.floor((halfW * 2 - 8 / worldScale) / (8 / worldScale * 0.55))))) : 0;
      const bodyExtraH = bodyLines * (8 / worldScale * 1.3);
      const totalH = baseH + bodyExtraH;
      const halfH = totalH / 2;

      // Card background (IK: high contrast mode doubles stroke width)
      const hcCard = this.host.isHighContrastMode?.() ? 2 : 1;
      const strokeColor = darkenColor(pn.color, crc.strokeDarken);
      g.lineStyle(hcCard, strokeColor, nodeAlpha * crc.plainCardStrokeAlpha);
      g.beginFill(pn.color, nodeAlpha * crc.plainCardFillAlpha);
      g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, halfW * 2, totalH, crc.cardCornerRadius / worldScale);
      g.endFill();

      // FH/FI: Plain card with title + wrapped body preview
      {
        const fontSize = Math.min(Math.max(PLAIN_CARD_TITLE_FONT_MIN, FULL_CARD_FONT_BASE / worldScale), FULL_CARD_FONT_BASE * CARD_SCALE_CAP);
        const bodyFontBase = rt.cardBodyFontSize;
        const smallFont = Math.min(Math.max(PLAIN_CARD_BODY_FONT_MIN, bodyFontBase / worldScale), bodyFontBase * CARD_SCALE_CAP);
        const pad = Math.min(PLAIN_CARD_PAD / worldScale, PLAIN_CARD_PAD * CARD_SCALE_CAP);
        const textW = halfW * 2 - pad * 2;
        const lineH = smallFont * CARD_LINE_HEIGHT;
        // A11y: auto-select title/body text color for WCAG contrast against card background
        const titleFill = contrastColor(pn.color);
        const bodyFill = titleFill === 0xffffff ? 0xcccccc : 0x444444;
        // Title (apply GD labelMaxChars truncation)
        const title = createCardText(truncateLabel(pn.data.label, rt.labelMaxChars), fontSize, titleFill, "bold");
        title.x = -halfW + pad;
        title.y = -halfH + pad;
        if (rt.cardTextTruncation !== false) title.maxWidth = textW;
        pn.gfx.addChild(title);
        // FH: Wrapped body preview — split into multiple lines
        // IE: Card content respects hoverShowBody checklist
        const cardShowBody = this.host.getPanel?.()?.hoverShowBody ?? true;
        if (pn.data.bodyPreview && cardShowBody) {
          const maxLines = rt.cardBodyMaxLines;
          const charsPerLine = Math.max(5, Math.floor(textW / (smallFont * 0.55)));
          const words = pn.data.bodyPreview.split(/\s+/);
          const lines: string[] = [];
          let cur = "";
          for (const w of words) {
            if (cur.length + w.length + 1 > charsPerLine) {
              lines.push(cur);
              cur = w;
              if (lines.length >= maxLines) break;
            } else {
              cur = cur ? cur + " " + w : w;
            }
          }
          if (cur && lines.length < maxLines) lines.push(cur);
          for (let li = 0; li < lines.length; li++) {
            const bodyLine = createCardText(lines[li], smallFont, bodyFill);
            bodyLine.x = -halfW + pad;
            bodyLine.y = -halfH + pad + fontSize * PLAIN_CARD_BODY_LINE_HEIGHT + li * lineH;
            bodyLine.alpha = crc.cardSubTextAlpha;
            if (rt.cardTextTruncation !== false) bodyLine.maxWidth = textW;
            pn.gfx.addChild(bodyLine);
          }
        }
      }
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
      incCounter(valueCounts, val);
    }

    let startAngle = -Math.PI / 2;
    const total = members.length;
    let colorIdx = 0;
    const sectorColors = this.host.getRenderThresholds?.()?.donutSectorColors ?? [0x818cf8, 0xf472b6, 0xfbbf24, 0x34d399, 0x60a5fa, 0xf87171, 0xb4a0ff, 0x2dd4bf];
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

    const rtt = this.host.getRenderThresholds?.() ?? {};
    const pfStartColor = rtt.pathfinderStartColor;
    const pfEndColor = rtt.pathfinderEndColor;
    const { visible, shapeRules } = ctx;
    for (const pn of visible) {
      if (!pfNodes.has(pn.data.id)) continue;
      const shape = getNodeShape(pn.data, shapeRules);
      const isStart = pfState?.startId === pn.data.id;
      const isEnd = pfState?.endId === pn.data.id;
      const ringColor = isStart ? pfStartColor : isEnd ? pfEndColor : pfStartColor;
      g.lineStyle(isStart || isEnd ? PF_ENDPOINT_LINE_WIDTH : PF_INTERMEDIATE_LINE_WIDTH, ringColor, INDICATOR_RING_ALPHA);
      g.beginFill(0, 0);
      drawShapeAt(g, shape, pn.data.x, pn.data.y, pn.radius + (isStart || isEnd ? PF_ENDPOINT_RADIUS_PAD : PF_INTERMEDIATE_RADIUS_PAD));
      g.endFill();
    }
  }

  // =========================================================================
  // Pass 5: 比較選択ノードのリング (破線スタイル)
  // =========================================================================
  /** 比較選択中のノードに破線リングを描画 */
  private _renderCompareRings(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[]; shapeRules: ShapeRule[] },
  ) {
    const compareIds = this.host.getCompareNodeIds?.() ?? [];
    if (compareIds.length === 0) return;
    const compareSet = new Set(compareIds);

    const { visible } = ctx;
    for (const pn of visible) {
      if (!compareSet.has(pn.data.id)) continue;
      const ringRadius = pn.radius + COMPARE_RING_RADIUS_PAD;
      // 破線リングを描画 (セグメント化された弧)
      g.lineStyle(COMPARE_RING_LINE_WIDTH, COMPARE_RING_COLOR, COMPARE_RING_ALPHA);
      g.beginFill(0, 0);
      for (let i = 0; i < COMPARE_RING_SEGMENTS; i++) {
        const startAngle = (i / COMPARE_RING_SEGMENTS) * Math.PI * 2;
        const endAngle = startAngle + ((1 - COMPARE_RING_GAP) / COMPARE_RING_SEGMENTS) * Math.PI * 2;
        g.arc(pn.data.x, pn.data.y, ringRadius, startAngle, endAngle);
        g.moveTo(
          pn.data.x + Math.cos(endAngle) * ringRadius,
          pn.data.y + Math.sin(endAngle) * ringRadius,
        );
      }
      g.endFill();
    }
  }

  // =========================================================================
  // Pass 6: ブックマーク星オーバーレイ
  // =========================================================================
  /** ブックマーク済みノードに星形アイコンを描画 */
  private _renderBookmarkStars(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[] },
  ) {
    const bookmarked = this.host.getBookmarkedNodeIds?.() ?? null;
    if (!bookmarked || bookmarked.size === 0) return;

    const { visible } = ctx;
    const starColor = this.host.getRenderThresholds?.()?.bookmarkStarColor ?? 0xf5c542;
    const starAlpha = 0.9;
    for (const pn of visible) {
      if (!bookmarked.has(pn.data.id)) continue;
      // ノード右上に小さな星を描画
      const sr = Math.max(4, pn.radius * 0.35);
      const cx = pn.data.x + pn.radius * 0.7;
      const cy = pn.data.y - pn.radius * 0.7;
      // 5頂点の星形
      g.beginFill(starColor, starAlpha);
      g.lineStyle(0);
      const spikes = 5;
      const outerR = sr;
      const innerR = sr * 0.4;
      for (let i = 0; i < spikes * 2; i++) {
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.endFill();
    }
  }

  // =========================================================================
  // Pass 7: 未接続同タグノードのオレンジダッシュリング
  // =========================================================================
  /** Draw a dashed orange ring around nodes that share a tag but have no direct edge. */
  private _renderMissingNeighborRings(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[] },
  ) {
    const missingSet = this.host.getMissingNeighborNodeIds?.() ?? null;
    if (!missingSet || missingSet.size === 0) return;

    const { visible } = ctx;
    const ringColor = this.host.getRenderThresholds?.()?.missingNeighborRingColor ?? 0xff8c00;
    const ringAlpha = 0.85;
    const lineWidth = 2;
    const dashSegments = 10;
    const gapFraction = 0.35;
    const radiusPad = 4;

    for (const pn of visible) {
      if (!missingSet.has(pn.data.id)) continue;
      const r = pn.radius + radiusPad;
      const cx = pn.data.x;
      const cy = pn.data.y;
      // Draw dashed circle as individual arc segments
      g.lineStyle(lineWidth, ringColor, ringAlpha);
      g.beginFill(0, 0); // no fill
      const segAngle = (2 * Math.PI) / dashSegments;
      const drawAngle = segAngle * (1 - gapFraction);
      for (let i = 0; i < dashSegments; i++) {
        const startA = i * segAngle;
        const endA = startA + drawAngle;
        g.moveTo(cx + Math.cos(startA) * r, cy + Math.sin(startA) * r);
        // Approximate arc with short line segments
        const steps = 4;
        for (let s = 1; s <= steps; s++) {
          const a = startA + (endA - startA) * (s / steps);
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
      }
      g.endFill();
    }
  }

  // =========================================================================
  // Pass 8: Tag badges — colored pills on node circumference
  // =========================================================================
  private _renderTagBadges(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[]; worldScale: number; minWorldRadius: number },
  ) {
    const MAX_BADGES = 4;
    // Ensure badge is at least 3 screen pixels at any zoom
    const minScreenPx = 3;
    const ws = ctx.worldScale || 1;
    const BADGE_R = screenToWorld(minScreenPx, ws, 3);
    const PAD = BADGE_R * 0.7;

    for (const pn of ctx.visible) {
      const tags = pn.data.tags;
      if (!tags || tags.length === 0) continue;
      const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
      const cx = pn.data.x;
      const cy = pn.data.y;
      const count = Math.min(tags.length, MAX_BADGES);
      const startAngle = -Math.PI / 2; // top

      for (let i = 0; i < count; i++) {
        const angle = startAngle + (i / count) * Math.PI * 2;
        const bx = cx + Math.cos(angle) * (nodeR + PAD + BADGE_R);
        const by = cy + Math.sin(angle) * (nodeR + PAD + BADGE_R);
        const hue = hashStringToHue(tags[i]);
        const color = hslToHex(hue, 0.7, 0.5);
        g.lineStyle(0);
        g.beginFill(color, 0.9);
        g.drawCircle(bx, by, BADGE_R);
        g.endFill();
      }
      if (tags.length > MAX_BADGES) {
        const angle = startAngle + (MAX_BADGES / (MAX_BADGES + 1)) * Math.PI * 2;
        const bx = cx + Math.cos(angle) * (nodeR + PAD + BADGE_R);
        const by = cy + Math.sin(angle) * (nodeR + PAD + BADGE_R);
        g.lineStyle(screenToWorld(1, ws, 1), 0x888888, 0.7);
        g.beginFill(0x888888, 0.4);
        g.drawCircle(bx, by, BADGE_R);
        g.endFill();
      }
    }
  }

  // =========================================================================
  // Pass 9: Importance ring — metric-proportional ring around nodes
  // =========================================================================
  private _renderImportanceRings(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[]; worldScale: number; minWorldRadius: number },
  ) {
    const config = this.host.getShowImportanceRing?.();
    if (!config) return;

    const degrees = this.host.getDegrees();
    let metricMap: Map<string, number>;
    if (config.metric === "betweenness") {
      metricMap = this.host.getBetweennessCache?.() ?? degrees;
    } else {
      metricMap = degrees;
    }
    if (metricMap.size === 0) return;

    let maxVal = 0;
    for (const v of metricMap.values()) {
      if (v > maxVal) maxVal = v;
    }
    if (maxVal === 0) return;

    const ws = ctx.worldScale || 1;
    // Ensure ring is at least 2 screen pixels wide
    const minRingPx = 2;
    const RING_PAD = screenToWorld(minRingPx, ws, 3);
    const MAX_RING_WIDTH = screenToWorld(4, ws, 4);

    for (const pn of ctx.visible) {
      const val = metricMap.get(pn.data.id) ?? 0;
      if (val === 0) continue;
      const t = val / maxVal;
      const ringWidth = Math.max(ws > 0 ? 1 / ws : 1, 1 + t * MAX_RING_WIDTH);
      const hue = (1 - t) * 240;
      const color = hslToHex(hue, 0.8, 0.6);
      g.lineStyle(ringWidth, color, 0.6);
      const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
      g.drawCircle(pn.data.x, pn.data.y, nodeR + RING_PAD);
      g.lineStyle(0);
    }
  }

  // =========================================================================
  // Pass 10: Recency marker — green dot for recent, fade for old
  // =========================================================================
  private _renderRecencyMarkers(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[] },
  ) {
    const config = this.host.getRecencyConfig?.();
    if (!config) return;

    const now = Date.now();
    const recentThresholdMs = config.days * 24 * 60 * 60 * 1000;
    const oldThresholdMs = 90 * 24 * 60 * 60 * 1000; // 90 days
    const DOT_R = 3;

    for (const pn of ctx.visible) {
      const mtime = pn.data.mtime;
      if (!mtime) continue;
      const age = now - mtime;

      if (age < recentThresholdMs) {
        // Recent: green dot at top-right (bright green, full opacity)
        const dx = pn.radius * 0.7;
        const dy = -pn.radius * 0.7;
        g.lineStyle(0);
        g.beginFill(this.host.getRenderThresholds?.()?.recencyMarkerColor ?? 0x22c55e, 0.9);
        g.drawCircle(pn.data.x + dx, pn.data.y + dy, DOT_R);
        g.endFill();
      } else if (age > oldThresholdMs) {
        // Old: semi-transparent overlay to fade
        g.lineStyle(0);
        g.beginFill(0x000000, 0.3);
        g.drawCircle(pn.data.x, pn.data.y, pn.radius);
        g.endFill();
      } else {
        // DP: Intermediate age — amber dot with fading alpha
        const t = (age - recentThresholdMs) / (oldThresholdMs - recentThresholdMs);
        const alpha = 0.8 * (1 - t); // fades as age increases
        if (alpha > 0.1) {
          const dx = pn.radius * 0.7;
          const dy = -pn.radius * 0.7;
          g.lineStyle(0);
          g.beginFill(0xf59e0b, alpha); // amber-500
          g.drawCircle(pn.data.x + dx, pn.data.y + dy, DOT_R);
          g.endFill();
        }
      }
    }
  }

  // =========================================================================
  // Pass 11: Bridge nodes — gold ring for high betweenness centrality
  // =========================================================================
  private _renderBridgeNodes(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[]; worldScale: number; minWorldRadius: number },
  ) {
    const bridgeIds = this.host.getBridgeNodeIds?.();
    if (!bridgeIds || bridgeIds.size === 0) return;

    const GOLD = 0xffd700;
    const ws = ctx.worldScale || 1;
    const RING_WIDTH = screenToWorld(2, ws, 3);
    const PAD = screenToWorld(3, ws, 5);

    for (const pn of ctx.visible) {
      if (!bridgeIds.has(pn.data.id)) continue;
      g.lineStyle(RING_WIDTH, GOLD, 0.8);
      const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
      g.drawCircle(pn.data.x, pn.data.y, nodeR + PAD);
      g.lineStyle(0);
    }
  }

  // =========================================================================
  // Pass 12: Articulation points — red warning ring
  // =========================================================================
  private _renderArticulationPoints(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[]; worldScale: number; minWorldRadius: number },
  ) {
    const apIds = this.host.getArticulationPointIds?.();
    if (!apIds || apIds.size === 0) return;

    const WARNING_COLOR = 0xff4444;
    const ws = ctx.worldScale || 1;
    const RING_WIDTH = screenToWorld(1.5, ws, 2);
    const PAD = screenToWorld(3, ws, 6);

    for (const pn of ctx.visible) {
      if (!apIds.has(pn.data.id)) continue;
      const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
      g.lineStyle(RING_WIDTH, WARNING_COLOR, 0.7);
      g.drawCircle(pn.data.x, pn.data.y, nodeR + PAD);
      g.drawCircle(pn.data.x, pn.data.y, nodeR + PAD + screenToWorld(2, ws, 3));
      g.lineStyle(0);
    }
  }

  // =========================================================================
  // Pass 13: Entropy overlay — semi-transparent halo sized by knowledge diversity
  // =========================================================================
  private _renderEntropyOverlay(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[]; worldScale: number; minWorldRadius: number },
  ) {
    const scores = this.host.getEntropyScores?.();
    if (!scores || scores.size === 0) return;

    const ws = ctx.worldScale || 1;
    for (const pn of ctx.visible) {
      const entropy = scores.get(pn.data.id);
      if (entropy === undefined || entropy === 0) continue;
      const t = Math.min(1, entropy);
      const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
      // Ensure halo is at least 4 screen pixels
      const minHaloWorld = ws > 0 ? 4 / ws : nodeR * 2;
      const haloRadius = Math.max(minHaloWorld, nodeR * (1 + t * 2));
      const hue = (1 - t) * 240;
      const color = hslToHex(hue, 0.7, 0.5);
      g.lineStyle(0);
      g.beginFill(color, 0.15 + t * 0.2);
      g.drawCircle(pn.data.x, pn.data.y, haloRadius);
      g.endFill();
    }
  }

  // =========================================================================
  // Pass 14: Multi-select rings — solid cyan ring
  // =========================================================================
  private _renderMultiSelectRings(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[] },
    selectedIds: string[],
  ) {
    const selectedSet = new Set(selectedIds);
    const RING_COLOR = 0x06b6d4; // cyan-500
    const RING_WIDTH = 2.5;
    const PAD = 5;

    for (const pn of ctx.visible) {
      if (!selectedSet.has(pn.data.id)) continue;
      g.lineStyle(RING_WIDTH, RING_COLOR, 0.85);
      g.drawCircle(pn.data.x, pn.data.y, pn.radius + PAD);
      g.lineStyle(0);
    }
  }

  // =========================================================================
  // Pass 15: S1 Hierarchy tree overlay — purple lines from focused node
  // =========================================================================
  private _renderHierarchyOverlay(
    g: CanvasGraphics,
    ctx: { visible: PixiNode[] },
  ) {
    const tree = this.host.getHierarchyTree?.();
    if (!tree || tree.size === 0) return;

    const pixiNodes = this.host.getPixiNodes();
    const EDGE_COLOR = 0x8b5cf6; // purple-500
    const EDGE_WIDTH = 2.5;

    g.lineStyle(EDGE_WIDTH, EDGE_COLOR, 0.6);
    for (const [childId, parentId] of tree) {
      const child = pixiNodes.get(childId);
      const parent = pixiNodes.get(parentId);
      if (!child || !parent) continue;
      g.moveTo(parent.data.x, parent.data.y);
      g.lineTo(child.data.x, child.data.y);
    }
    g.lineStyle(0);
  }

  // =========================================================================
  // Pass 16: S6 Ontology backbone — translucent indigo skeleton
  // =========================================================================
  private _renderOntologyBackbone(g: CanvasGraphics) {
    const backbone = this.host.getOntologyBackbone?.();
    if (!backbone || backbone.length === 0) return;

    const pixiNodes = this.host.getPixiNodes();
    g.lineStyle(4, 0x6366f1, 0.25); // indigo-500, very translucent
    for (const { from, to } of backbone) {
      const pnFrom = pixiNodes.get(from);
      const pnTo = pixiNodes.get(to);
      if (!pnFrom || !pnTo) continue;
      g.moveTo(pnFrom.data.x, pnFrom.data.y);
      g.lineTo(pnTo.data.x, pnTo.data.y);
    }
    g.lineStyle(0);
  }

  // =========================================================================
  // Pass 17: S4 Gap detection — dashed amber lines for missing connections
  // =========================================================================
  private _renderGapEdges(g: CanvasGraphics) {
    const gaps = this.host.getStructuralGaps?.();
    if (!gaps || gaps.length === 0) return;

    const pixiNodes = this.host.getPixiNodes();
    const GAP_COLOR = 0xfbbf24; // amber-400
    const DASH_LEN = 6;
    const GAP_LEN = 4;

    for (const { from, to } of gaps) {
      const pnA = pixiNodes.get(from);
      const pnB = pixiNodes.get(to);
      if (!pnA || !pnB) continue;

      // Draw dashed line
      const dx = pnB.data.x - pnA.data.x;
      const dy = pnB.data.y - pnA.data.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      const step = DASH_LEN + GAP_LEN;
      let d = 0;
      g.lineStyle(1.5, GAP_COLOR, 0.45);
      while (d < dist) {
        const end = Math.min(d + DASH_LEN, dist);
        g.moveTo(pnA.data.x + ux * d, pnA.data.y + uy * d);
        g.lineTo(pnA.data.x + ux * end, pnA.data.y + uy * end);
        d += step;
      }
    }
    g.lineStyle(0);
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
    // Clean up leader lines, tag labels, and sub-labels before clearing
    for (const pn of pixiNodes.values()) {
      if (pn.leaderLine) { pn.leaderLine.destroy(); pn.leaderLine = null; }
      if (pn.tagLabel) { pn.tagLabel.destroy(); pn.tagLabel = null; }
      if (pn.subLabels) {
        for (const sl of pn.subLabels) sl.destroy();
        pn.subLabels = [];
      }
    }
    pixiNodes.clear();
    this.cancelDeferredBatch();

    const degrees = this.host.getDegrees();

    // Dynamically raise label threshold for large graphs to limit GPU texture memory.
    const degValues = nodes.map(n => degrees.get(n.id) || 0).sort((a, b) => b - a);
    // For small graphs (< 200 nodes), show all labels regardless of degree
    this.pendingLabelThreshold = degValues.length < 200
      ? 0
      : degValues.length > MAX_LABEL_COUNT
        ? Math.max(DEFAULT_LABEL_DEGREE_THRESHOLD, degValues[MAX_LABEL_COUNT - 1])
        : DEFAULT_LABEL_DEGREE_THRESHOLD;

    // Cache maxDeg once — avoids O(n²) recomputation inside createSinglePixiNode
    this._cachedMaxDeg = degValues.length > 0 ? degValues[0] : 1;
    // HM: Cache maxBodyLength for content-proportional card sizing
    let mbl = 0;
    for (const n of nodes) { const bl = n.bodyLength ?? 0; if (bl > mbl) mbl = bl; }
    this._cachedMaxBodyLength = mbl;

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
    const rtNode = mergeRenderThresholds(this.host.getRenderThresholds?.());
    const maxR = rtNode.maxNodeRadius > 0 ? rtNode.maxNodeRadius : Infinity;
    const ns = this.host.getNodeSize?.() ?? nodeR(n);
    const nodeDeg = this.host.getDegrees().get(n.id) || 0;
    const sizeByDeg = rtNode.nodeSizeByDegree;
    const r = effectiveRadius(n, ns, nodeDeg, maxR, rtNode.minNodeRadius, this._cachedMaxDeg, sizeByDeg,
      n.bodyLength ?? 0, this._cachedMaxBodyLength ?? 0, rtNode.cardContentScale);
    const color = nodeColor(n);
    const circle = new CanvasGraphics();
    if (isSuperNode) {
      const rt = mergeRenderThresholds(this.host.getRenderThresholds?.());
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
      const rt = mergeRenderThresholds(this.host.getRenderThresholds?.());

      // --- Importance-based font size: scale between min and max based on degree ---
      const maxDeg = this._cachedMaxDeg || 1;
      const importance = maxDeg > 0 ? Math.min(1, deg / maxDeg) : 0;
      const fontMin = rt.nodeLabelFontSizeMin;
      const fontMax = rt.nodeLabelFontSizeMax;
      const superFontSize = rt.superNodeFontSize;
      const scaledFontSize = isSuperNode ? superFontSize : Math.round(fontMin + importance * (fontMax - fontMin));

      const labelFontWeight = isSuperNode ? "bold" : "500";
      // For super nodes, use group color as pill background; for regular nodes, use theme-aware bg
      const themeLabelBg = this.host.isDarkTheme() ? (rt.labelBgColor) : (rt.labelBgColorLight);
      // AL: Optionally sync label bg with node color (subtle tint)
      const syncBg = rt.labelBgColorSync && color != null;
      const labelBg = isSuperNode ? (color != null ? darkenColor(color, 0.6) : themeLabelBg)
        : syncBg ? blendColors(themeLabelBg, color, 0.15) : themeLabelBg;
      // Use bright text when pill background is present for better contrast
      // A11y: auto-correct label color if WCAG contrast ratio < 4.5:1
      let labelFill = isSuperNode ? 0xffffff
        : (this.host.isDarkTheme() ? 0xe0e0e0 : 0x222222);
      if (wcagContrastRatio(labelFill, labelBg) < 4.5) {
        labelFill = contrastColor(labelBg);
      }
      // GD: Truncate label to max chars
      // A3: Prepend icon prefix from nodeIconField mapping
      let displayLabel = truncateLabel(n.label, rt.labelMaxChars);
      const iconCfg = this.host.getNodeIconConfig?.();
      if (iconCfg && iconCfg.field && n.meta) {
        const fieldVal = String(n.meta[iconCfg.field] ?? "");
        const icon = iconCfg.map[fieldVal];
        if (icon) displayLabel = `${icon} ${displayLabel}`;
      }
      label = new CanvasText(displayLabel, {
        fontSize: scaledFontSize,
        fill: labelFill,
        fontWeight: labelFontWeight,
        fontFamily: CARD_FONT_FAMILY,
      });
      label.bgColor = labelBg;
      // Theme-adaptive bgAlpha: light theme needs higher opacity for contrast
      const baseBgAlpha = isSuperNode ? (rt.superNodeLabelBgAlpha) : rt.labelBgAlpha;
      label.bgAlpha = this.host.isDarkTheme() ? baseBgAlpha : Math.min(1.0, baseBgAlpha + 0.1);
      label.bgPadX = isSuperNode ? SUPER_LABEL_PAD_X : REGULAR_LABEL_PAD_X;
      label.bgPadY = isSuperNode ? SUPER_LABEL_PAD_Y : REGULAR_LABEL_PAD_Y;
      label.cornerRadius = rt.labelHaloCornerRadius;
      label.strokeColor = rt.labelStrokeColor;
      label.strokeWidth = rt.labelStrokeWidth;

      // --- Zone-based label placement ---
      // Analyze adjacent node angles and place label in the direction of the largest gap.
      const zoneOffset = rt.labelZoneOffset;
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
        const maxTags = rt.tagLabelMaxTags;
        const tagText = n.tags.slice(0, maxTags).map(t => `#${t}`).join(" ");
        const accentColor = this.host.getAccentColor?.() ?? 0x818cf8;
        tagLabel = new CanvasText(tagText, {
          fontSize: rt.tagLabelFontSize,
          fill: accentColor,
          fontWeight: "400",
          fontFamily: CARD_FONT_FAMILY,
        });
        tagLabel.alpha = rt.tagLabelAlpha;
        tagLabel.bgColor = rt.labelBgColor;
        tagLabel.bgAlpha = (rt.labelBgAlpha) * TAG_BG_ALPHA_DAMPEN;
        tagLabel.bgPadX = TAG_LABEL_PAD_X;
        tagLabel.bgPadY = TAG_LABEL_PAD_Y;
        tagLabel.cornerRadius = rt.labelHaloCornerRadius;
        tagLabel.anchor.set(0.5, 0);
        tagLabel.x = 0;
        tagLabel.y = r + (rt.tagLabelOffset);
        // Tag labels start hidden; LOD in applyTextFade controls visibility
        tagLabel.visible = false;
        container.addChild(tagLabel);
      }
    }

    // --- Sub-labels: additional metadata fields below node ---
    const subLabels: CanvasText[] = [];
    const subFieldsRaw = this.host.getNodeSubLabelFields?.() ?? "";
    if (subFieldsRaw && label && !isSuperNode) {
      const srt = mergeRenderThresholds(this.host.getRenderThresholds?.());
      const fields = subFieldsRaw.split(",").map(s => s.trim()).filter(Boolean);
      // Stack sub-labels below tagLabel (or below node if no tagLabel)
      let yOffset = tagLabel
        ? r + (srt.tagLabelOffset) + (srt.tagLabelFontSize) + SUB_LABEL_GAP
        : r + (srt.tagLabelOffset);
      for (const field of fields) {
        // Resolve via host.getNodeProperty if available, else fall back to meta
        const val = this.host.getNodeProperty
          ? this.host.getNodeProperty(n.id, field)
          : (n.meta?.[field] !== undefined && n.meta?.[field] !== null ? String(n.meta[field]) : undefined);
        if (!val) continue;
        const subLabel = new CanvasText(val, {
          fontSize: SUB_LABEL_FONT_SIZE,
          fill: this.host.isDarkTheme() ? 0xbbbbbb : 0x555555,
          fontWeight: "400",
          fontFamily: CARD_FONT_FAMILY,
        });
        subLabel.alpha = SUB_LABEL_ALPHA;
        subLabel.bgColor = srt.labelBgColor;
        subLabel.bgAlpha = (srt.labelBgAlpha) * TAG_BG_ALPHA_DAMPEN;
        subLabel.bgPadX = TAG_LABEL_PAD_X;
        subLabel.bgPadY = TAG_LABEL_PAD_Y;
        subLabel.cornerRadius = srt.labelHaloCornerRadius;
        subLabel.anchor.set(0.5, 0);
        subLabel.x = 0;
        subLabel.y = yOffset;
        subLabel.visible = false; // LOD-gated same as tagLabel
        container.addChild(subLabel);
        subLabels.push(subLabel);
        yOffset += SUB_LABEL_FONT_SIZE + SUB_LABEL_GAP;
      }
    }

    if (!this._skipNodeRendering) {
      world.addChild(container);
    }

    const pixiNodes = this.host.getPixiNodes();
    pixiNodes.set(n.id, {
      data: n, gfx: container, circle, label, tagLabel, subLabels,
      hoverLabel: null, leaderLine: null, radius: r, color, held: false, sortRank: -1,
      priorityScore: -1, minShowZoom: 1.0, labelWasVisible: false, hoverForcedLabel: false,
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
  /** Return the last computed autoLOD level (0-5). Used by LabelManager for LOD 2 filtering. */
  getLastLodLevel(): number { return this._lastLodLevel; }

  /** Set whether to skip per-node rendering (for non-graph viewModes). */
  setSkipNodeRendering(skip: boolean): void { this._skipNodeRendering = skip; }

  /** Whether autoLOD is currently active. */
  isAutoLODActive(): boolean {
    const rt = mergeRenderThresholds(this.host.getRenderThresholds?.());
    return rt.autoLOD;
  }

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
    const rtZone = mergeRenderThresholds(this.host.getRenderThresholds?.());
    const proximityFactor = rtZone.labelZoneProximityFactor;
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
    const gapNarrowTh = rtZone.labelGapScaleNarrowThreshold;
    const gapMedTh = rtZone.labelGapScaleMediumThreshold;
    const gapNarrowFactor = rtZone.labelGapScaleNarrow;
    const gapMedFactor = rtZone.labelGapScaleMedium;
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
    const rt = mergeRenderThresholds(this.host.getRenderThresholds?.());
    if (!rt.labelOverlapCulling) {
      this.host.updateDensityCulledBadge?.(0);
      // Reset stale stats when culling is disabled
      this._lastCullStats = { totalLabels: 0, visibleLabels: 0, culledLabels: 0, collisionRate: 0 };
      return;
    }

    // Scale margin inversely with zoom — at low zoom, labels are counterscaled larger
    // so overlap detection needs more generous spacing
    const zoom = this.host.getWorldContainer()?.scale.x ?? 1;
    const zoomMarginScale = zoom < 0.5 ? Math.min(4, 1 + (0.5 - zoom) * 6) : 1;
    const margin = rt.labelOverlapMargin * zoomMarginScale;
    const pixiNodes = this.host.getPixiNodes();
    const degrees = this.host.getDegrees();
    const maxScreenW = rt.labelOverlapMaxScreenW;
    const maxScreenH = rt.labelOverlapMaxScreenH;

    // 1. Collect all visible labels into screen-space rects
    const rects = this._collectLabelRects(pixiNodes, degrees, zoom, maxScreenW, maxScreenH);

    // 2. Build spatial hash grid for overlap detection
    const grid = new SpatialHashGrid<CullLabelRect>(OVERLAP_GRID_CELL_SIZE, margin);

    // 2.5: Reserve DOM overlay zones so labels don't displace into panels
    const app = this.host.getPixiApp();
    if (app?.view) {
      const canvasRect = app.view.getBoundingClientRect();
      const panels = [".gi-graph-stats", ".gi-legend", ".gi-minimap-wrap", ".gi-node-info"];
      for (const sel of panels) {
        const el = app.view.parentElement?.querySelector(sel) as HTMLElement | null;
        if (!el || el.style.display === "none" || !el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        // Convert DOM rect to screen-space relative to canvas
        grid.insert({
          x: r.left - canvasRect.left, y: r.top - canvasRect.top,
          w: r.width, h: r.height,
          label: null as any, pn: null as any,
          degree: 999, isSuper: false,
        });
      }
    }

    // 2.7: HL — Reserve enclosure label positions as exclusion zones
    const encLabels = this.host.getEnclosureLabels?.();
    if (encLabels && encLabels.size > 0) {
      const world = this.host.getWorldContainer();
      if (world) {
        for (const lbl of encLabels.values()) {
          if (!lbl.visible) continue;
          // Convert world coords to screen coords
          const sx = (lbl.x * world.scale.x + world.x);
          const sy = (lbl.y * world.scale.y + world.y);
          const sw = (lbl.width ?? 60) * lbl.scale.x;
          const sh = (lbl.height ?? 14) * lbl.scale.y;
          grid.insert({ x: sx - sw / 2, y: sy - sh / 2, w: sw, h: sh, label: null as any, pn: null as any, degree: 500, isSuper: false });
        }
      }
    }

    // 3. Sort by priority score — highest priority first (Google Maps-style)
    // Hover-forced labels get priority boost so they survive culling (displaced with leader lines if needed)
    const minNonSuper = rt.labelMinNonSuper;
    rects.sort((a, b) => {
      // HY: Reduced hover boost from 200→80 to prevent hover labels from
      // displacing too many normal labels at mid-zoom
      const aBoost = a.pn.hoverForcedLabel ? 80 : 0;
      const bBoost = b.pn.hoverForcedLabel ? 80 : 0;
      return (b.pn.priorityScore + bBoost) - (a.pn.priorityScore + aBoost);
    });

    const placed: CullLabelRect[] = [];
    const drawLeader = rt.labelLeaderLines;
    const llAlpha = rt.labelLeaderLineAlpha;
    const llWidth = rt.labelLeaderLineWidth;
    const maxDispRatio = rt.labelMaxDisplacementRatio;

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
        // Smooth fade-out instead of instant hide (AD: collision animation)
        // Gentler fade rate (0.15) for less jarring transitions during zoom
        r.label.alpha = Math.max(0, (r.label.alpha ?? 1) - (rt.labelFadeRate ?? 0.15));
        if (r.label.alpha <= 0.05) r.label.visible = false;
      }
    }

    // 4.5. Density-adaptive culling: remove labels that are too close together
    // HV: Extended to all zoom levels (was zoom < 0.5 only), with gentler spacing at high zoom
    const densityZoomThreshold = rt.labelDensityZoomThreshold;
    if (placed.length > 10) {
      const densityMinDist = computeDensityMinDist(
        rt.labelDensityMinScreenDist, rt.labelDensityMaxDist, zoom, densityZoomThreshold,
      );
      const densityMinDist2 = densityMinDist * densityMinDist;
      // Sort placed by priority (highest first) — keep high priority, remove low
      placed.sort((a, b) => (b.pn.priorityScore + (b.pn.hoverForcedLabel ? 80 : 0))
                          - (a.pn.priorityScore + (a.pn.hoverForcedLabel ? 80 : 0)));
      const kept: CullLabelRect[] = [];
      for (const r of placed) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        let tooClose = false;
        for (const k of kept) {
          const kx = k.x + k.w / 2;
          const ky = k.y + k.h / 2;
          if ((cx - kx) ** 2 + (cy - ky) ** 2 < densityMinDist2) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          kept.push(r);
        } else {
          r.label.alpha = Math.max(0, (r.label.alpha ?? 1) - (rt.labelFadeRate ?? 0.15));
          if (r.label.alpha <= 0.05) r.label.visible = false;
        }
      }
      placed.length = 0;
      placed.push(...kept);
    }

    // 5. Guarantee placement floor (AP-4 + AP-5)
    this._guaranteePlacementFloor(rt, rects, placed, grid, zoom, margin,
      minNonSuper, drawLeader, llWidth, llAlpha);

    // 6. Draw leader lines for non-displaced labels at high counter-scale
    this._drawCounterScaleLeaderLines(rt, placed, zoom, drawLeader, llWidth, llAlpha);

    // 7. Report density-culled count to host for badge display
    const totalVisible = rects.filter(r => r.label.visible).length;
    const densityCulled = rects.length - totalVisible;
    this.host.updateDensityCulledBadge?.(densityCulled);

    // §0.1: Expose label collision stats for quality monitoring
    this._lastCullStats = {
      totalLabels: rects.length,
      visibleLabels: totalVisible,
      culledLabels: densityCulled,
      collisionRate: rects.length > 0 ? densityCulled / rects.length : 0,
    };
  }

  /** §0.1 Quality stats from last cullOverlappingLabels run */
  get cullStats() { return this._lastCullStats; }
  private _lastCullStats = { totalLabels: 0, visibleLabels: 0, culledLabels: 0, collisionRate: 0 };

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
    // Viewport bounds for culling (skip off-screen labels to reduce O(n²) cost)
    const dims = this.host.getCanvasDimensions();
    const world = this.host.getWorldContainer();
    const vpMargin = 100; // extra margin to avoid popping at edges
    // Cap effective margin to prevent extreme zoom-out from including entire world
    const effectiveVpMargin = Math.min(vpMargin / zoom, vpMargin * 5);
    const vpLeft = world ? -world.x / zoom - effectiveVpMargin : -Infinity;
    const vpTop = world ? -world.y / zoom - effectiveVpMargin : -Infinity;
    const vpRight = world ? (dims.width - world.x) / zoom + effectiveVpMargin : Infinity;
    const vpBottom = world ? (dims.height - world.y) / zoom + effectiveVpMargin : Infinity;

    const rects: CullLabelRect[] = [];
    for (const pn of pixiNodes.values()) {
      // Skip nodes outside viewport (world coordinates)
      if (pn.data.x < vpLeft || pn.data.x > vpRight ||
          pn.data.y < vpTop || pn.data.y > vpBottom) continue;
      // Collect main label OR hoverLabel (prefer hoverLabel when present for overlap culling)
      const isHoverLabel = !!(pn.hoverLabel && pn.hoverLabel.visible);
      const label = isHoverLabel ? pn.hoverLabel : pn.label;
      if (!label || !label.text || !label.visible) continue;
      const fontSize = (label.style.fontSize as number) ?? 11;
      // Bold text (hoverLabel) is ~10% wider — increase char width estimate
      const boldFactor = isHoverLabel ? 1.1 : 1.0;
      const charW = fontSize * LABEL_CHAR_WIDTH_FACTOR * boldFactor;
      const scaleX = label.scale?.x ?? 1;
      const scaleY = label.scale?.y ?? 1;
      const padX = label.bgPadX ?? 0;
      const padY = label.bgPadY ?? 0;
      // Use measured dimensions when available (more accurate than estimates)
      const measuredW = (label.width && label.width > 0) ? label.width : 0;
      const measuredH = (label.height && label.height > 0) ? label.height : 0;
      const estimatedW = label.text.length * charW + padX * 2;
      const estimatedH = fontSize * LABEL_LINE_HEIGHT_FACTOR + padY * 2;
      const baseW = measuredW > 0 ? measuredW : estimatedW;
      const baseH = measuredH > 0 ? measuredH : estimatedH;
      const rawW = baseW * scaleX * zoom;
      const rawH = baseH * scaleY * zoom;
      const w = Math.min(rawW, maxScreenW > 0 ? maxScreenW : Infinity);
      const h = Math.min(rawH, maxScreenH > 0 ? maxScreenH : Infinity);
      const anchorX = label.anchor?.x ?? 0;
      const anchorY = label.anchor?.y ?? 0;
      const wx = (pn.data.x + label.x) * zoom - w * anchorX;
      const wy = (pn.data.y + label.y) * zoom - h * anchorY;
      const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
      rects.push({ pn, label, x: wx, y: wy, w, h,
        degree: degrees.get(pn.data.id) ?? 0, isSuper });
    }
    return rects;
  }

  // _createOverlapGrid removed — replaced by SpatialHashGrid<CullLabelRect> from spatial-grid.ts

  /**
   * Try to displace a label to avoid overlap. Returns the placed rect on success,
   * or null if no displacement position was found.
   * Applies AP-1 displacement cap and draws leader line when displaced.
   */
  private _tryDisplaceLabel(
    r: CullLabelRect,
    zoom: number,
    maxDispRatio: number,
    grid: SpatialHashGrid<CullLabelRect>,
    drawLeader: boolean,
    llWidth: number,
    llAlpha: number,
  ): CullLabelRect | null {
    const { pn } = r;
    const nodeR = pn.radius ?? 12;
    const screenNodeR = nodeR * zoom;

    const rawOffsets = generateDisplacementOffsets(r.w, r.h, screenNodeR);
    // Adaptive: sort offsets by distance from nearest placed label (farthest first)
    const offsets = rawOffsets.map(o => {
      // Use center point for distance scoring (not top-left corner)
      const testCx = r.x + r.w / 2 + o.dx;
      const testCy = r.y + r.h / 2 + o.dy;
      let minDist = Infinity;
      grid.forEachNear(testCx, testCy, r.w + r.h, (p) => {
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        const d = (testCx - cx) ** 2 + (testCy - cy) ** 2;
        if (d < minDist) minDist = d;
      });
      return { ...o, score: minDist };
    }).sort((a, b) => b.score - a.score);

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
      const anchorX = r.label.anchor?.x ?? 0;
      const anchorY = r.label.anchor?.y ?? 0;
      const cappedScreenX = (pn.data.x + baseLx + worldDx) * zoom - r.w * anchorX;
      const cappedScreenY = (pn.data.y + baseLy + worldDy) * zoom - r.h * anchorY;
      const alt: CullLabelRect = { ...r, x: cappedScreenX, y: cappedScreenY };
      if (!grid.checkOverlap(alt)) {
        r.label.x = baseLx + worldDx;
        r.label.y = baseLy + worldDy;
        // Sync original rect bounds to avoid stale data in subsequent phases
        r.x = cappedScreenX;
        r.y = cappedScreenY;

        // Draw leader line from node edge to label
        if (drawLeader) {
          this._drawLeaderLine(pn, alt, zoom, llWidth, llAlpha);
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
    const nodeR = pn.radius ?? 12;
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
    // Compute label bounding box in node-local coords, accounting for anchor
    const labelAnchorX = r.label.anchor?.x ?? 0;
    const labelAnchorY = r.label.anchor?.y ?? 0;
    const labelLeft = lx - worldW * labelAnchorX;
    const labelRight = labelLeft + worldW;
    const labelTop = ly - worldH * labelAnchorY;
    const labelBottom = labelTop + worldH;
    // Closest point on label rect to the node center (0,0 in local space)
    const closestX = clamp(0, labelLeft, labelRight);
    const closestY = clamp(0, labelTop, labelBottom);
    const dist = Math.sqrt(closestX ** 2 + closestY ** 2);
    const edgeX = dist > 0.1 ? (closestX / dist) * nodeR : 0;
    const edgeY = dist > 0.1 ? (closestY / dist) * nodeR : 0;
    ll.lineStyle(llWidth, pn.color, llAlpha * alphaMultiplier);
    ll.moveTo(edgeX, edgeY);
    ll.lineTo(closestX, closestY);
  }

  /**
   * Placement floor guarantee (AP-4 + AP-5).
   * Force-shows highest-degree culled candidates without creating AABB overlaps.
   */
  private _guaranteePlacementFloor(
    rt: RenderThresholds,
    rects: CullLabelRect[],
    placed: CullLabelRect[],
    grid: SpatialHashGrid<CullLabelRect>,
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

    if (!(absoluteFloor > 0 || minNonSuper > 0)) return;

    const placedSet = new Set(placed.map(r => r.pn.data.id));
    const hiddenSupers = rects.filter(r => r.isSuper && !placedSet.has(r.pn.data.id))
      .sort((a, b) => b.degree - a.degree);
    const hiddenRegulars = rects.filter(r => !r.isSuper && !placedSet.has(r.pn.data.id))
      .sort((a, b) => b.degree - a.degree);

    const maxRadii = rt.labelForceShowMaxRadii ?? 5;

    // Draw leader line for force-show displaced labels (AP-6 fix)
    const drawForceShowLeader = (r: CullLabelRect, origLx: number, origLy: number) => {
      if (!drawLeader) return;
      if (Math.abs(r.label.x - origLx) < 0.1 && Math.abs(r.label.y - origLy) < 0.1) return;
      this._drawLeaderLine(r.pn, r, zoom, llWidth, llAlpha);
    };

    // Phase 1: guarantee minNonSuper non-super labels (AP-5)
    let nonSuperCount = placedNonSuperNow;
    for (const r of hiddenRegulars) {
      if (nonSuperCount >= minNonSuper) break;
      const origLx = r.label.x;
      const origLy = r.label.y;
      if (this._tryDisplaceForceShow(r, grid, margin, zoom, maxRadii)) {
        r.label.visible = true;
        placed.push(r);
        grid.insert(r);
        nonSuperCount++;
        drawForceShowLeader(r, origLx, origLy);
      }
    }

    // Phase 2: super-node sacrifice for regular labels (AP-5 concession)
    nonSuperCount = this._sacrificeSuperLabels(
      placed, hiddenRegulars, grid, margin, zoom, maxRadii,
      minNonSuper, nonSuperCount, drawLeader, llWidth, llAlpha,
    );

    // Phase 3: absolute floor guarantee (AP-4)
    this._fillLabelsToFloor(
      absoluteFloor, [...hiddenSupers, ...hiddenRegulars],
      placed, grid, margin, zoom, maxRadii, drawLeader, llWidth, llAlpha,
    );

    // Final visibility sync — ensure unplaced labels stay hidden
    const finalPlacedSet = new Set(placed.map(r => r.pn.data.id));
    for (const r of rects) {
      if (finalPlacedSet.has(r.pn.data.id)) {
        r.label.visible = true;
      } else {
        r.label.visible = false;
      }
    }
  }

  /**
   * Attempt displacement offsets for a force-show candidate label.
   * Displacement is capped to maxRadii × nodeRadius in world space.
   * Returns true if the label was placed (with or without displacement).
   */
  private _tryDisplaceForceShow(
    r: CullLabelRect,
    grid: SpatialHashGrid<CullLabelRect>,
    margin: number,
    zoom: number,
    maxRadii: number,
  ): boolean {
    // AABB overlap check using spatial hash grid (with anchor offset)
    const anchorX = r.label.anchor?.x ?? 0;
    const anchorY = r.label.anchor?.y ?? 0;
    const overlaps = (): boolean => {
      const cx = (r.pn.data.x + r.label.x) * zoom - r.w * anchorX;
      const cy = (r.pn.data.y + r.label.y) * zoom - r.h * anchorY;
      const testRect: CullLabelRect = { ...r, x: cx, y: cy };
      return grid.checkOverlap(testRect);
    };

    if (!overlaps()) return true; // fits without displacement

    const nodeR = r.pn.radius ?? 12;
    const screenNodeR = nodeR * zoom;
    const maxWorldDisp = nodeR * maxRadii;
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

        if (!overlaps()) {
          r.x = (r.pn.data.x + r.label.x) * zoom - r.w * anchorX;
          r.y = (r.pn.data.y + r.label.y) * zoom - r.h * anchorY;
          return true;
        }
      }
    }
    r.label.x = origLx;
    r.label.y = origLy;
    return false;
  }

  /**
   * AP-5 super-node concession: hide lowest-degree super labels
   * and replace them with regular labels to improve label diversity.
   * Returns updated nonSuperCount.
   */
  private _sacrificeSuperLabels(
    placed: CullLabelRect[],
    hiddenRegulars: CullLabelRect[],
    grid: SpatialHashGrid<CullLabelRect>,
    margin: number,
    zoom: number,
    maxRadii: number,
    minNonSuper: number,
    nonSuperCount: number,
    drawLeader: boolean,
    llWidth: number,
    llAlpha: number,
  ): number {
    const placedSupers = placed.filter(r => r.isSuper);
    const currentSuperRatio = placed.length > 0 ? placedSupers.length / placed.length : 0;
    const targetNonSuperMin = Math.max(minNonSuper, Math.ceil(placed.length * 0.30));
    if (!(currentSuperRatio > 0.75 && nonSuperCount < targetNonSuperMin && hiddenRegulars.length > 0)) {
      return nonSuperCount;
    }

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
      if (this._tryDisplaceForceShow(reg, grid, margin, zoom, maxRadii)) {
        reg.label.visible = true;
        placed.push(reg);
        grid.insert(reg);
        nonSuperCount++;
        if (drawLeader && (Math.abs(reg.label.x - origLx) >= 0.1 || Math.abs(reg.label.y - origLy) >= 0.1)) {
          this._drawLeaderLine(reg.pn, reg, zoom, llWidth, llAlpha);
        }
      } else {
        // Fallback: place at super's world position with leader line — but only if it doesn't overlap
        const wdx = zoom > 0 ? (supScreenX - reg.pn.data.x * zoom) / zoom : 0;
        const wdy = zoom > 0 ? (supScreenY - reg.pn.data.y * zoom) / zoom : 0;
        reg.label.x = wdx;
        reg.label.y = wdy;
        reg.x = supScreenX;
        reg.y = supScreenY;
        const testRect: CullLabelRect = { ...reg, x: supScreenX, y: supScreenY };
        if (!grid.checkOverlap(testRect)) {
          reg.label.visible = true;
          placed.push(reg);
          grid.insert(reg);
          nonSuperCount++;
          if (drawLeader && (Math.abs(reg.label.x - origLx) >= 0.1 || Math.abs(reg.label.y - origLy) >= 0.1)) {
            this._drawLeaderLine(reg.pn, reg, zoom, llWidth, llAlpha);
          }
        } else {
          // Cannot place without overlap — restore super label instead
          sup.label.visible = true;
          placed.push(sup);
          sacrificed--;
        }
      }
    }
    return nonSuperCount;
  }

  /**
   * AP-4 absolute floor: guarantee a minimum number of visible labels
   * by force-showing highest-degree candidates from the combined hidden list.
   */
  private _fillLabelsToFloor(
    absoluteFloor: number,
    candidates: CullLabelRect[],
    placed: CullLabelRect[],
    grid: SpatialHashGrid<CullLabelRect>,
    margin: number,
    zoom: number,
    maxRadii: number,
    drawLeader: boolean,
    llWidth: number,
    llAlpha: number,
  ): void {
    let totalCount = placed.length;
    for (const r of candidates) {
      if (totalCount >= absoluteFloor) break;
      if (placed.some(p => p.pn.data.id === r.pn.data.id)) continue;
      const origLx = r.label.x;
      const origLy = r.label.y;
      if (this._tryDisplaceForceShow(r, grid, margin, zoom, maxRadii)) {
        r.label.visible = true;
        placed.push(r);
        grid.insert(r);
        totalCount++;
        if (drawLeader && (Math.abs(r.label.x - origLx) >= 0.1 || Math.abs(r.label.y - origLy) >= 0.1)) {
          this._drawLeaderLine(r.pn, r, zoom, llWidth, llAlpha);
        }
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

// CullOverlapGrid interface removed — using SpatialHashGrid<CullLabelRect> directly
