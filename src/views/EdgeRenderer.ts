import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { GraphEdge, EdgeCardinalityMode, Cardinality, CardinalityRule, CardinalityRenderConfig } from "../types";
import { DEFAULT_CARDINALITY_RENDER_CONFIG } from "../types";
import { cssColorToHex } from "../utils/graph-helpers";

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
  /** Show relation/type labels on edges */
  showEdgeLabels: boolean;
  /** Show directional arrows on all edges */
  showArrows: boolean;
  /** Node ID → radius (for positioning arrows at node edge) */
  nodeRadii: Map<string, number> | null;
  /** Current world container scale (for zoom-dependent rendering) */
  worldScale?: number;
  /** Edge cardinality marker mode */
  edgeCardinalityMode?: EdgeCardinalityMode;
  /** Custom cardinality rules */
  cardinalityRules?: CardinalityRule[];
  /** Cardinality marker render config (sizes, offsets, line widths) */
  cardinalityRenderConfig?: CardinalityRenderConfig;
  /** Cable bundling mode: auto (when clusters exist), always, never */
  cableBundleMode?: "auto" | "always" | "never";
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
  /** Show edge weight via line thickness (same source-target pair count) */
  edgeWeightThickness?: boolean;
}

// Minimal position data needed for source/target
interface Pos {
  x: number;
  y: number;
  id?: string;
}

/** Returns true if the edge should be skipped based on type visibility toggles. */
function shouldSkipEdge(e: GraphEdge, cfg: EdgeDrawConfig): boolean {
  switch (e.type) {
    case "link": return !cfg.showLinks;
    case "tag": return !cfg.showTagEdges;
    case "category": return !cfg.showCategoryEdges;
    case "semantic": return !cfg.showSemanticEdges;
    case "inheritance": return !cfg.showInheritance;
    case "aggregation": return !cfg.showAggregation;
    case "has-tag": return !cfg.showTagNodes;
    case "similar": return !cfg.showSimilar;
    case "sibling": return !cfg.showSibling;
    case "sequence": return !cfg.showSequence;
    default: return !cfg.showLinks; // untyped edges treated as links
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Theme-aware edge colors
function defaultColor(isDark: boolean) { return isDark ? 0x666666 : 0x999999; }
function highlightColor(isDark: boolean) { return isDark ? 0x999999 : 0x555555; }
const INHERITANCE_COLOR = 0x9ca3af;
const AGGREGATION_COLOR = 0x60a5fa;
const SIMILAR_COLOR = 0xfbbf24;
const HAS_TAG_COLOR = 0xa78bfa;
const SIBLING_COLOR = 0x34d399;   // green — peer relationship
const SEQUENCE_COLOR = 0xfb923c;  // orange — sequential order

/** Number of angular bins over [0, π). 6 bins = 30° each. */
const ANGLE_BINS = 6;
const BIN_WIDTH = Math.PI / ANGLE_BINS;
/** Spatial grid cell size in pixels for locality-aware bundling */
const GRID_CELL = 200;
/** Minimum edges in a direction-color-cell group to activate bundling */
const MIN_BUNDLE_SIZE = 4;

// ---------------------------------------------------------------------------
// Edge color helper (shared between pre-computation and draw loop)
// ---------------------------------------------------------------------------
function resolveEdgeColor(
  e: GraphEdge,
  useRelColor: boolean,
  relationColors: Map<string, string>,
  isDark: boolean,
): number {
  if (e.type === "inheritance") return INHERITANCE_COLOR;
  if (e.type === "aggregation") return AGGREGATION_COLOR;
  if (e.type === "similar") return SIMILAR_COLOR;
  if (e.type === "has-tag") return HAS_TAG_COLOR;
  if (e.type === "sibling") return SIBLING_COLOR;
  if (e.type === "sequence") return SEQUENCE_COLOR;
  if (useRelColor && e.relation) {
    const css = relationColors.get(e.relation);
    if (css) return cssColorToHex(css);
  }
  return defaultColor(isDark);
}

// ---------------------------------------------------------------------------
// Direction-color bundle pre-computation
// ---------------------------------------------------------------------------

/** Accumulated data for a (angleBin, color) group */
interface BundleAccum {
  sumMx: number;  // sum of midpoint x
  sumMy: number;  // sum of midpoint y
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
function normalizeAngle(a: number): number {
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
    if (shouldSkipEdge(e, cfg)) continue;

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
    if (!acc) { acc = { sumMx: 0, sumMy: 0, count: 0 }; accum.set(key, acc); }
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
// Cable bundling — inter-cluster edge grouping
// ---------------------------------------------------------------------------

/** Maximum distinct colors per cable */
const MAX_CABLE_COLORS = 8;

/** A single color lane within a cable — all edges of one color */
interface CableLane {
  color: number;
  edges: GraphEdge[];
}

/** A cable: a group of inter-cluster edges sharing the same cluster pair, up to MAX_CABLE_COLORS colors */
interface Cable {
  /** Ordered pair key: "clusterA|clusterB" (alphabetical) */
  pairKey: string;
  srcCluster: string;
  tgtCluster: string;
  /** Edges grouped by color — each lane draws one trunk line */
  lanes: CableLane[];
  /** All edges in this cable (for cabledEdgeIds tracking) */
  allEdges: GraphEdge[];
  /** Index of this cable within the pair (for parallel offset) */
  cableIndex: number;
  /** Total cables for this pair */
  totalCables: number;
}

/** Pre-computed cable layout for a cluster pair */
interface CableLayout {
  /** Trunk start point (on source cluster boundary) */
  trunkStart: { x: number; y: number };
  /** Trunk end point (on target cluster boundary) */
  trunkEnd: { x: number; y: number };
  /** Perpendicular offset for parallel cables */
  offsetX: number;
  offsetY: number;
}

/**
 * Group inter-cluster edges into cables (max MAX_CABLE_COLORS distinct colors per cable).
 * Same-color edges within a cable share a single trunk line.
 * Returns cables + set of edge IDs handled by cables (so main loop skips them).
 */
function buildCables(
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): { cables: Cable[]; cabledEdgeIds: Set<string> } {
  const cables: Cable[] = [];
  const cabledEdgeIds = new Set<string>();
  const { nodeClusterMap } = cfg;
  if (!nodeClusterMap) return { cables, cabledEdgeIds };

  // Group inter-cluster edges by cluster pair, then by color
  const pairData = new Map<string, {
    srcCluster: string;
    tgtCluster: string;
    byColor: Map<number, GraphEdge[]>;
  }>();

  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;

    const sid = typeof e.source === "string" ? e.source : (e.source as any).id;
    const tid = typeof e.target === "string" ? e.target : (e.target as any).id;
    const srcCluster = nodeClusterMap.get(sid);
    const tgtCluster = nodeClusterMap.get(tid);
    if (!srcCluster || !tgtCluster || srcCluster === tgtCluster) continue;

    // Canonical pair key (alphabetical order)
    const [a, b] = srcCluster < tgtCluster ? [srcCluster, tgtCluster] : [tgtCluster, srcCluster];
    const pairKey = `${a}|${b}`;

    let pair = pairData.get(pairKey);
    if (!pair) {
      pair = { srcCluster: a, tgtCluster: b, byColor: new Map() };
      pairData.set(pairKey, pair);
    }

    const color = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
    let colorGroup = pair.byColor.get(color);
    if (!colorGroup) { colorGroup = []; pair.byColor.set(color, colorGroup); }
    colorGroup.push(e);
  }

  // Split each pair into cables of max MAX_CABLE_COLORS distinct colors
  for (const [pairKey, pair] of pairData) {
    // Iterate byColor entries directly — avoid spread into temporary array
    const colorEntriesArr: [number, GraphEdge[]][] = [];
    let totalEdges = 0;
    for (const entry of pair.byColor) {
      colorEntriesArr.push(entry);
      totalEdges += entry[1].length;
    }
    if (colorEntriesArr.length === 0) continue;
    // Single edge total: draw normally
    if (totalEdges < 2) continue;

    const totalCables = Math.ceil(colorEntriesArr.length / MAX_CABLE_COLORS);
    for (let ci = 0; ci < totalCables; ci++) {
      const startIdx = ci * MAX_CABLE_COLORS;
      const endIdx = Math.min(startIdx + MAX_CABLE_COLORS, colorEntriesArr.length);
      const lanes: CableLane[] = [];
      const allEdges: GraphEdge[] = [];
      for (let k = startIdx; k < endIdx; k++) {
        const [color, edges] = colorEntriesArr[k];
        lanes.push({ color, edges });
        for (const e of edges) allEdges.push(e);
      }
      cables.push({
        pairKey,
        srcCluster: pair.srcCluster,
        tgtCluster: pair.tgtCluster,
        lanes,
        allEdges,
        cableIndex: ci,
        totalCables,
      });
      for (const e of allEdges) cabledEdgeIds.add(e.id);
    }
  }

  return { cables, cabledEdgeIds };
}

/**
 * Compute trunk layout for a cable: start/end points clipped to cluster boundaries,
 * plus perpendicular offset for parallel cables.
 */
function computeCableLayout(
  cable: Cable,
  centroids: Map<string, { x: number; y: number }>,
  radii: Map<string, number>,
  cfg?: EdgeDrawConfig,
): CableLayout | null {
  const cA = centroids.get(cable.srcCluster);
  const cB = centroids.get(cable.tgtCluster);
  if (!cA || !cB) return null;

  const rA = radii.get(cable.srcCluster) ?? 50;
  const rB = radii.get(cable.tgtCluster) ?? 50;

  const dx = cB.x - cA.x;
  const dy = cB.y - cA.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;

  const ux = dx / dist;
  const uy = dy / dist;

  // Trunk start/end: clipped at cluster boundary (with small margin)
  // If clusters overlap (rA + rB > dist), place trunk endpoints at midpoint
  const margin = 5;
  const gapDist = dist - rA - rB;
  let startFrac: number, endFrac: number;
  if (gapDist > margin * 2) {
    // Normal case: trunk spans the gap between cluster boundaries
    startFrac = (rA + margin) / dist;
    endFrac = (rB + margin) / dist;
  } else {
    // Clusters close/overlapping: place trunk at 40%–60% of centroid-centroid line
    startFrac = 0.4;
    endFrac = 0.4;
  }
  const trunkStart = { x: cA.x + ux * dist * startFrac, y: cA.y + uy * dist * startFrac };
  const trunkEnd = { x: cB.x - ux * dist * endFrac, y: cB.y - uy * dist * endFrac };

  // Perpendicular offset for parallel cables
  const px = -uy;
  const py = ux;
  const cableSpacing = cfg?.cableSpacing ?? 4;
  const centerOffset = (cable.cableIndex - (cable.totalCables - 1) / 2) * cableSpacing;

  return {
    trunkStart,
    trunkEnd,
    offsetX: px * centerOffset,
    offsetY: py * centerOffset,
  };
}

/**
 * Draw all cables: per-color trunk lines + subtle fan-in/fan-out to individual nodes.
 *
 * Each cable contains up to MAX_CABLE_COLORS lanes (one per distinct color).
 * Each lane draws ONE trunk line in its color — same-color edges are fully merged
 * into a single visual strand. At group boundaries, thin fan lines connect
 * individual nodes to the cable endpoint.
 */
function drawCables(
  g: CanvasGraphics,
  cables: Cable[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
  densityScale: number,
): void {
  const { clusterCentroids: centroids, clusterRadii: radii } = cfg;
  if (!centroids || !radii) return;

  for (const cable of cables) {
    const layout = computeCableLayout(cable, centroids, radii, cfg);
    if (!layout) continue;

    const { trunkStart, trunkEnd, offsetX, offsetY } = layout;

    // Perpendicular unit vector (always computed from trunk direction)
    const tdx = trunkEnd.x - trunkStart.x;
    const tdy = trunkEnd.y - trunkStart.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
    const perpX = tlen > 0 ? -tdy / tlen : 0;
    const perpY = tlen > 0 ? tdx / tlen : 1;

    const nLanes = cable.lanes.length;
    const laneSpacing = 3;

    for (let li = 0; li < nLanes; li++) {
      const lane = cable.lanes[li];
      // Lane offset = cable-level offset + per-lane sub-offset
      const laneSubOffset = (li - (nLanes - 1) / 2) * laneSpacing;
      const lox = offsetX + perpX * laneSubOffset;
      const loy = offsetY + perpY * laneSubOffset;

      const ts = { x: trunkStart.x + lox, y: trunkStart.y + loy };
      const te = { x: trunkEnd.x + lox, y: trunkEnd.y + loy };

      // --- Trunk: one line per color, ~2× normal edge thickness, high contrast ---
      let trunkWidth = cfg.cableTrunkWidth ?? 2;
      // Apply edge weight to trunk width: scale by sqrt of lane edge count
      if (cfg.edgeWeightThickness && lane.edges.length > 1) {
        trunkWidth *= Math.sqrt(lane.edges.length);
      }
      let trunkAlpha = cfg.cableTrunkAlpha ?? 0.85;

      // Highlight: if any edge in this lane connects highlighted nodes, brighten trunk
      if (cfg.highlightedNodeId) {
        let laneHit = false;
        for (const e of lane.edges) {
          const sid = typeof e.source === "string" ? e.source : (e.source as any).id;
          const tid = typeof e.target === "string" ? e.target : (e.target as any).id;
          if (cfg.highlightSet.has(sid) && cfg.highlightSet.has(tid)) {
            laneHit = true;
            break;
          }
        }
        if (laneHit) {
          trunkAlpha = 1;
          trunkWidth = 3;
        } else {
          trunkAlpha = 0.04;
        }
      }

      g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha * densityScale, native: true });
      g.moveTo(ts.x, ts.y);
      g.lineTo(te.x, te.y);

      // --- Fan lines: configurable lines from nodes to trunk endpoints ---
      const fanWidth = cfg.cableFanWidth ?? 1;
      const baseFanAlpha = cfg.cableFanAlpha ?? 0.45;
      const fanCount = lane.edges.length;
      const crowdFactor = Math.min(1, 6.0 / fanCount);  // 6本以下は100%、増えると減衰
      const fanAlpha = baseFanAlpha * (0.4 + 0.6 * crowdFactor) * densityScale;

      for (const e of lane.edges) {
        const src = resolvePos(e.source);
        const tgt = resolvePos(e.target);
        if (!src || !tgt) continue;

        const sid = src.id ?? (typeof e.source === "string" ? e.source : (e.source as any).id);
        const tid = tgt.id ?? (typeof e.target === "string" ? e.target : (e.target as any).id);
        const srcCluster = cfg.nodeClusterMap!.get(sid);

        let alpha = fanAlpha;

        // Highlight: show individual fans clearly on hover
        if (cfg.highlightedNodeId) {
          if (cfg.highlightSet.has(sid) && cfg.highlightSet.has(tid)) {
            alpha = 0.8;
          } else {
            alpha = 0.02;
          }
        }

        const isSrcSide = srcCluster === cable.srcCluster;
        const nearEnd = isSrcSide ? ts : te;
        const farEnd = isSrcSide ? te : ts;

        g.lineStyle({ width: fanWidth, color: lane.color, alpha, native: true });

        // Fan-in: source node → near trunk endpoint (straight line for performance)
        g.moveTo(src.x, src.y);
        g.lineTo(nearEnd.x, nearEnd.y);

        // Fan-out: far trunk endpoint → target node
        g.moveTo(farEnd.x, farEnd.y);
        g.lineTo(tgt.x, tgt.y);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Direction bundle cache — avoids recomputing every frame during animation
// ---------------------------------------------------------------------------
let _bundleCache: Map<string, BundleGroup> | null = null;
let _bundleDirty = true;
let _bundleFrameCount = 0;
/** Recompute bundles every Nth frame during animation (reduces cost by ~66%) */
const BUNDLE_SKIP = 3;

// Cable bundling cache (same invalidation as direction bundles)
let _cableCache: { cables: Cable[]; cabledEdgeIds: Set<string> } | null = null;
let _cableDirty = true;

/** Mark the direction bundle cache as stale (call when edges, visibility, or
 *  layout change significantly — e.g. toggling edge types, loading new data). */
export function invalidateBundleCache(): void {
  _bundleDirty = true;
  _cableDirty = true;
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
): void {
  g.clear();
  if (arrowGfx) arrowGfx.clear();

  const { highlightedNodeId: hId, colorEdgesByRelation: useRelColor } = cfg;
  // Disable arc curves when edge count is high to avoid vertex buffer explosion.
  // quadraticCurveTo generates ~20 vertices per edge vs 4 for lineTo.
  const isArcLayout = cfg.isArcLayout && edges.length < 500;

  // Scale base alpha inversely with edge density to keep the graph readable.
  // <100 edges: full alpha; 100–1000: gentle fade; 1000+: aggressive fade.
  const edgeCount = cfg.totalEdgeCount ?? edges.length;
  const densityScaleBase = edgeCount <= 100 ? 1
    : edgeCount <= 500 ? 1 - 0.35 * ((edgeCount - 100) / 400)
    : edgeCount <= 2000 ? 0.65 - 0.35 * ((edgeCount - 500) / 1500)
    : 0.3;
  // At extreme zoom-out (scale < 0.05), further reduce alpha so edges don't
  // obscure nodes rendered with min-radius inflation.
  const ws = cfg.worldScale ?? 1;
  const zoomFade = ws >= 0.05 ? 1 : Math.max(0.15, ws / 0.05);
  const densityScale = Math.max(cfg.edgeDensityFloor ?? 0.08, densityScaleBase * zoomFade);

  // Pre-compute edge pair counts for weight-based thickness
  let pairCount: Map<string, number> | null = null;
  if (cfg.edgeWeightThickness) {
    pairCount = new Map();
    for (const e of edges) {
      const key = [e.source, e.target].sort().join(":");
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }
  }

  // Pre-compute direction×color bundles for highway-style edge merging
  const β = cfg.bundleStrength;
  let bundles: Map<string, BundleGroup> | null = null;
  if (β > 0) {
    _bundleFrameCount++;
    if (_bundleDirty || !_bundleCache || _bundleFrameCount >= BUNDLE_SKIP) {
      _bundleCache = buildDirectionBundles(edges, resolvePos, cfg);
      _bundleDirty = false;
      _bundleFrameCount = 0;
    }
    bundles = _bundleCache;
  }

  // Cable bundling: group inter-cluster edges into cables (cached like direction bundles)
  const clustersAvailable = !!(cfg.nodeClusterMap && cfg.clusterCentroids && cfg.clusterRadii);
  const cableMode = cfg.cableBundleMode ?? "auto";
  // "never" → always off; "always" → on if cluster data exists (graceful skip otherwise); "auto" → on if clusters
  const hasClusters = cableMode === "never" ? false
    : cableMode === "always" ? clustersAvailable
    : clustersAvailable;
  let cables: Cable[];
  let cabledEdgeIds: Set<string>;
  if (hasClusters) {
    if (_cableDirty || !_cableCache) {
      _cableCache = buildCables(edges, resolvePos, cfg);
      _cableDirty = false;
    }
    cables = _cableCache.cables;
    cabledEdgeIds = _cableCache.cabledEdgeIds;
  } else {
    cables = [];
    cabledEdgeIds = new Set<string>();
  }

  // Draw cables first (trunk + fan-out)
  if (cables.length > 0) {
    drawCables(g, cables, resolvePos, cfg, densityScale);
  }

  for (const e of edges) {
    // Skip edges handled by cable bundling
    if (cabledEdgeIds.has(e.id)) continue;
    if (shouldSkipEdge(e, cfg)) continue;

    const src = resolvePos(e.source);
    const tgt = resolvePos(e.target);
    if (!src || !tgt) continue;

    // Determine color
    const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);

    // Determine alpha & thickness
    const isSimilar = e.type === "similar";
    const isOnto = e.type === "inheritance" || e.type === "aggregation";
    const isBreadcrumbs = e.type === "sibling" || e.type === "sequence";
    const isStructural = isOnto || e.type === "has-tag" || isSimilar || isBreadcrumbs;
    let alpha = (isStructural ? 0.7 : 0.65) * densityScale;
    let lineThick = 1.2;

    // Edge weight: thicken based on same source-target pair count
    if (pairCount) {
      const pairKey = [e.source, e.target].sort().join(":");
      const weight = pairCount.get(pairKey) ?? 1;
      lineThick = 1.2 + Math.log2(weight) * 0.6;
      // Slightly increase alpha for heavy edges
      if (weight > 2) alpha *= Math.min(1.3, 1 + (weight - 2) * 0.05);
    }

    if (!isOnto && e.relation && useRelColor) alpha = 0.8 * densityScale;

    // Fade by source node degree: low-degree → faint, high-degree → opaque
    if (cfg.fadeByDegree && cfg.maxDegree > 0) {
      const sid = src.id ?? (e.source as string);
      const tid = tgt.id ?? (e.target as string);
      const srcDeg = cfg.degrees.get(sid) ?? 0;
      const tgtDeg = cfg.degrees.get(tid) ?? 0;
      const minDeg = Math.min(srcDeg, tgtDeg);
      // sqrt normalization: 0→MIN_ALPHA, maxDegree→base alpha
      const t = Math.sqrt(minDeg / cfg.maxDegree);
      alpha *= 0.15 + 0.85 * t;  // range: 15%-100% of base alpha
    }

    if (hId) {
      const sid = src.id ?? (e.source as string);
      const tid = tgt.id ?? (e.target as string);
      if (cfg.highlightSet.has(sid) && cfg.highlightSet.has(tid)) {
        lineThick = 2.0;
        alpha = 1;
        if (!isOnto && !e.relation) {
          // Keep lineColor from resolveEdgeColor — don't override to HIGHLIGHT_COLOR
          // so bundled highlight edges still group by their original color
        }
      } else {
        alpha = 0.15;
      }
    }

    g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });

    // Edge type dash pattern: scale by lineThick so dashes stay visible (DQ-13)
    const s = lineThick;
    if (e.type === "semantic") {
      g.setLineDash([4 * s, 4 * s]);
    } else if (e.type === "tag" || e.type === "has-tag") {
      g.setLineDash([8 * s, 3 * s]);
    } else if (isSimilar) {
      g.setLineDash([3 * s, 5 * s]);
    }

    // --- Draw the edge ---

    if (isSimilar) {
      // Similar edges: always straight lines
      g.moveTo(src.x, src.y);
      g.lineTo(tgt.x, tgt.y);
    } else if (bundles && !isArcLayout) {
      // Direction×color bundling: curve edge toward group centroid
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) {
        g.moveTo(src.x, src.y);
        g.lineTo(tgt.x, tgt.y);
      } else {
        const angle = normalizeAngle(Math.atan2(dy, dx));
        const bin = Math.min(Math.floor(angle / BIN_WIDTH), ANGLE_BINS - 1);
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        const gx = Math.floor(mx / GRID_CELL);
        const gy = Math.floor(my / GRID_CELL);
        const key = `${gx},${gy}|${bin}|${lineColor}`;
        const group = bundles.get(key);

        if (group) {
          const cx = mx + (group.cx - mx) * β;
          const cy = my + (group.cy - my) * β;
          g.moveTo(src.x, src.y);
          g.quadraticCurveTo(cx, cy, tgt.x, tgt.y);
        } else {
          // Small group — straight line
          g.moveTo(src.x, src.y);
          g.lineTo(tgt.x, tgt.y);
        }
      }
    } else if (isArcLayout) {
      const mx = (src.x + tgt.x) / 2;
      const minY = Math.min(src.y, tgt.y);
      const dist = Math.abs(tgt.x - src.x);
      const cpY = minY - dist * 0.3 - 20;
      g.moveTo(src.x, src.y);
      g.quadraticCurveTo(mx, cpY, tgt.x, tgt.y);
    } else {
      g.moveTo(src.x, src.y);
      g.lineTo(tgt.x, tgt.y);
    }

    // Draw markers for ontology edges
    if (isOnto) {
      drawEdgeMarker(g, src, tgt, e.type as "inheritance" | "aggregation", lineColor, alpha, cfg.bgColor);
    }

    // Draw arrow for sequence edges (next/prev)
    if (e.type === "sequence") {
      drawSequenceArrow(g, src, tgt, lineColor, alpha);
    }

    // Generic directional arrow for all edges when showArrows is enabled
    // (skip edges that already have their own markers)
    if (cfg.showArrows && e.type !== "sequence" && !isOnto && arrowGfx) {
      const tgtR = cfg.nodeRadii?.get(e.target) ?? 4;
      drawGenericArrow(arrowGfx, src, tgt, lineColor, Math.max(alpha, 0.5), tgtR);
    }

    // Draw cardinality markers (crow's foot notation) — additive, after existing markers
    if (cfg.edgeCardinalityMode === "crowsfoot") {
      const rule = resolveCardinality(e, cfg.cardinalityRules ?? []);
      if (rule) {
        const srcR = cfg.nodeRadii?.get(typeof e.source === "string" ? e.source : (e.source as any).id) ?? 4;
        const tgtR = cfg.nodeRadii?.get(typeof e.target === "string" ? e.target : (e.target as any).id) ?? 4;
        const cardCfg = { ...DEFAULT_CARDINALITY_RENDER_CONFIG, ...(cfg.cardinalityRenderConfig ?? {}) };
        drawCardinalityMarker(g, src, tgt, rule.sourceCardinality, lineColor, alpha, srcR, cardCfg);
        drawCardinalityMarker(g, tgt, src, rule.targetCardinality, lineColor, alpha, tgtR, cardCfg);
      }
    }

    // Reset line dash after edge types that use it
    if (e.type === "semantic" || e.type === "tag" || e.type === "has-tag" || isSimilar) {
      g.setLineDash([]);
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
  type: "inheritance" | "aggregation",
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
  const sz = 8;

  if (type === "inheritance") {
    const bx = tgt.x - ux * sz;
    const by = tgt.y - uy * sz;
    g.lineStyle({ width: 1.5, color, alpha, native: true });
    g.beginFill(bgColor, alpha * 0.9);
    g.moveTo(tgt.x, tgt.y);
    g.lineTo(bx + px * sz * 0.5, by + py * sz * 0.5);
    g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
    g.closePath();
    g.endFill();
  } else {
    const mx = src.x + ux * sz;
    const my = src.y + uy * sz;
    const fx = src.x + ux * sz * 2;
    const fy = src.y + uy * sz * 2;
    g.lineStyle({ width: 1.5, color, alpha, native: true });
    g.beginFill(bgColor, alpha * 0.9);
    g.moveTo(src.x, src.y);
    g.lineTo(mx + px * sz * 0.4, my + py * sz * 0.4);
    g.lineTo(fx, fy);
    g.lineTo(mx - px * sz * 0.4, my - py * sz * 0.4);
    g.closePath();
    g.endFill();
  }
}

/**
 * Draw a filled arrow at the target end of a sequence edge (→ direction).
 */
function drawSequenceArrow(
  g: CanvasGraphics,
  src: Pos,
  tgt: Pos,
  color: number,
  alpha: number,
) {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const sz = 7;

  const bx = tgt.x - ux * sz;
  const by = tgt.y - uy * sz;
  g.lineStyle({ width: 1, color, alpha, native: true });
  g.beginFill(color, alpha);
  g.moveTo(tgt.x, tgt.y);
  g.lineTo(bx + px * sz * 0.4, by + py * sz * 0.4);
  g.lineTo(bx - px * sz * 0.4, by - py * sz * 0.4);
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
) {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  // Scale arrow size proportional to target node radius (visible at any zoom)
  const sz = Math.max(10, targetRadius * 0.35);
  const hw = sz * 0.45; // half-width

  // Place arrow tip at the edge of the target node circle
  const tipX = tgt.x - ux * (targetRadius + 2);
  const tipY = tgt.y - uy * (targetRadius + 2);
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
    case "inheritance": return { sourceCardinality: "1", targetCardinality: "0..N" };
    case "aggregation": return { sourceCardinality: "1", targetCardinality: "0..N" };
    case "has-tag": return { sourceCardinality: "N", targetCardinality: "1" };
    case "link": return { sourceCardinality: "1", targetCardinality: "0..1" };
    case "sequence": return { sourceCardinality: "1", targetCardinality: "1" };
    default: return null;
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
      g.drawCircle(bx + ux * sz * cfg.circleOffsetFactor01, by + uy * sz * cfg.circleOffsetFactor01, sz * cfg.circleRadiusFactor);
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
      g.drawCircle(bx + ux * sz * cfg.circleOffsetFactor0N, by + uy * sz * cfg.circleOffsetFactor0N, sz * cfg.circleRadiusFactor);
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

/** Maximum number of edge labels to render (performance guard) */
const MAX_EDGE_LABELS = 200;

/**
 * Determine the display label for an edge.
 * Returns the custom relation name if set, otherwise a short type label.
 * Returns null for edge types that should not display a label (links, has-tag).
 */
function getEdgeLabel(e: GraphEdge): string | null {
  if (e.relation) return e.relation;
  switch (e.type) {
    case "inheritance": return "is-a";
    case "aggregation": return "has-a";
    case "similar": return "\u2248"; // ≈
    case "sibling": return "sibling";
    case "sequence": return "seq";
    case "has-tag": return null;
    default: return null; // plain links — no label
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

  // Collect labelable edges (skip hidden types and those without a label)
  const labelable: { edge: GraphEdge; label: string }[] = [];
  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;
    const label = getEdgeLabel(e);
    if (!label) continue;
    labelable.push({ edge: e, label });
  }

  // Performance guard: show only the most important labels when count exceeds limit.
  // Prioritize edges whose endpoints have higher combined degree (more connected = more visible).
  if (labelable.length > MAX_EDGE_LABELS) {
    if (cfg.degrees && cfg.degrees.size > 0) {
      labelable.sort((a, b) => {
        const da = (cfg.degrees.get(a.edge.source as string) ?? 0) + (cfg.degrees.get(a.edge.target as string) ?? 0);
        const db = (cfg.degrees.get(b.edge.source as string) ?? 0) + (cfg.degrees.get(b.edge.target as string) ?? 0);
        return db - da;
      });
    }
    labelable.length = MAX_EDGE_LABELS;
  }

  const fillColor = cfg.isDark ? 0xcccccc : 0x444444;

  for (const { edge: e, label } of labelable) {
    const sp = resolvePos(e.source);
    const tp = resolvePos(e.target);
    if (!sp || !tp) continue;

    // Place label at edge midpoint
    const mx = (sp.x + tp.x) / 2;
    const my = (sp.y + tp.y) / 2;

    const text = new CanvasText(label, {
      fontSize: 10,
      fill: fillColor,
      fontFamily: "sans-serif",
    });
    text.anchor.set(0.5, 0.5);
    text.x = mx;
    text.y = my;
    text.alpha = 0.7;
    text.resolution = 2;

    container.addChild(text);
  }
}
