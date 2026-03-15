import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { GraphEdge, EdgeCardinalityMode, Cardinality, CardinalityRule, CardinalityRenderConfig } from "../types";
import { DEFAULT_CARDINALITY_RENDER_CONFIG } from "../types";
import { cssColorToHex, edgeSourceId, edgeTargetId } from "../utils/graph-helpers";
import type { RoadNetwork } from "../layouts/road-network";
import { routeEdge, findNearestIntersection, findShortestPath, pathToWaypoints } from "../layouts/road-network";
import {
  EDGE_TYPE_INHERITANCE, EDGE_TYPE_AGGREGATION, EDGE_TYPE_SEQUENCE,
  EDGE_TYPE_SIMILAR, EDGE_TYPE_SIBLING, EDGE_TYPE_HAS_TAG,
  EDGE_TYPE_LINK, EDGE_TYPE_TAG,
} from "../constants";

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
  /** Alpha for edges directly connected to the hovered node (default 1.0). Overrides densityScale. */
  highlightEdgeAlpha?: number;
  /** Alpha for edges NOT connected to the hovered node while hover is active (default 0.15). */
  highlightEdgeNonMatchAlpha?: number;
  /** Show edge weight via line thickness (same source-target pair count) */
  edgeWeightThickness?: boolean;
  /** Road network for edge routing (edges follow roads when available) */
  roadNetwork?: RoadNetwork | null;
  /** Enable road-based edge routing (default true when roadNetwork is available) */
  enableRoadRouting?: boolean;
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
    case EDGE_TYPE_LINK: return !cfg.showLinks;
    case EDGE_TYPE_TAG: return !cfg.showTagEdges;
    case "category": return !cfg.showCategoryEdges;
    case "semantic": return !cfg.showSemanticEdges;
    case EDGE_TYPE_INHERITANCE: return !cfg.showInheritance;
    case EDGE_TYPE_AGGREGATION: return !cfg.showAggregation;
    case EDGE_TYPE_HAS_TAG: return !cfg.showTagNodes;
    case EDGE_TYPE_SIMILAR: return !cfg.showSimilar;
    case EDGE_TYPE_SIBLING: return !cfg.showSibling;
    case EDGE_TYPE_SEQUENCE: return !cfg.showSequence;
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
const HAS_TAG_COLOR = 0xb4a0ff;
const SIBLING_COLOR = 0x34d399;   // green — peer relationship
const SEQUENCE_COLOR = 0xfb923c;  // orange — sequential order

/** Number of angular bins over [0, π). 6 bins = 30° each. */
const ANGLE_BINS = 6;
const BIN_WIDTH = Math.PI / ANGLE_BINS;
/** Spatial grid cell size in pixels for locality-aware bundling */
const GRID_CELL = 200;
/** Minimum edges in a direction-color-cell group to activate bundling */
const MIN_BUNDLE_SIZE = 4;

/** Edge alpha for structural edge types */
const STRUCTURAL_EDGE_ALPHA = 0.7;
/** Edge alpha for non-structural edge types */
const NON_STRUCTURAL_EDGE_ALPHA = 0.65;
/** Default line thickness for edges */
const DEFAULT_LINE_THICKNESS = 1.2;
/** Edge weight additional thickness per log2 step */
const WEIGHT_THICKNESS_FACTOR = 0.6;
/** Fade-by-degree minimum alpha fraction */
const FADE_BY_DEGREE_MIN_ALPHA = 0.15;
/** Alpha for relation-colored edges */
const RELATION_COLOR_ALPHA = 0.8;
/** Highlighted edge line thickness */
const HIGHLIGHT_LINE_THICKNESS = 2.0;
/** Highlighted cable trunk width */
const HIGHLIGHT_CABLE_TRUNK_WIDTH = 3;
/** Cable fan crowd attenuation threshold (edges) */
const CABLE_FAN_CROWD_THRESHOLD = 6.0;
/** Cable fan crowd min alpha fraction */
const CABLE_FAN_CROWD_MIN_FRACTION = 0.4;
/** Cable fan alpha factor for highlighted (connected) edges */
const CABLE_FAN_CONNECTED_FACTOR = 0.8;
/** Cable fan alpha dampen factor for non-matching edges during hover */
const CABLE_FAN_NON_MATCH_DAMPEN = 0.15;
/** Cable lane spacing in pixels */
const CABLE_LANE_SPACING = 3;
/** Cable layout margin from cluster boundary */
const CABLE_LAYOUT_MARGIN = 5;
/** Cable layout overlap start/end fraction */
const CABLE_OVERLAP_FRAC = 0.4;
/** Default fallback cluster radius */
const DEFAULT_CLUSTER_RADIUS = 50;
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
const DENSITY_FULL_ALPHA_THRESHOLD = 100;
/** Density scale: gentle fade upper bound */
const DENSITY_GENTLE_THRESHOLD = 500;
/** Density scale: aggressive fade upper bound */
const DENSITY_AGGRESSIVE_THRESHOLD = 2000;
/** Density scale: gentle fade reduction factor */
const DENSITY_GENTLE_REDUCTION = 0.35;
/** Density scale: aggressive fade mid-alpha */
const DENSITY_AGGRESSIVE_MID_ALPHA = 0.65;
/** Density scale: aggressive fade reduction */
const DENSITY_AGGRESSIVE_REDUCTION = 0.35;
/** Density scale: floor alpha */
const DENSITY_MIN_ALPHA = 0.3;
/** Zoom fade threshold for extreme zoom-out */
const ZOOM_FADE_THRESHOLD = 0.05;
/** Zoom fade minimum alpha */
const ZOOM_FADE_MIN_ALPHA = 0.4;
/** Default density floor */
const DEFAULT_DENSITY_FLOOR = 0.25;
/** Edge label font size */
const EDGE_LABEL_FONT_SIZE = 10;
/** Edge label alpha */
const EDGE_LABEL_ALPHA = 0.7;
/** Edge label resolution */
const EDGE_LABEL_RESOLUTION = 2;
/** Maximum number of edge labels rendered */
const MAX_EDGE_LABELS = 200;

// ---------------------------------------------------------------------------
// Edge color helper (shared between pre-computation and draw loop)
// ---------------------------------------------------------------------------
function resolveEdgeColor(
  e: GraphEdge,
  useRelColor: boolean,
  relationColors: Map<string, string>,
  isDark: boolean,
): number {
  if (e.type === EDGE_TYPE_INHERITANCE) return INHERITANCE_COLOR;
  if (e.type === EDGE_TYPE_AGGREGATION) return AGGREGATION_COLOR;
  if (e.type === EDGE_TYPE_SIMILAR) return SIMILAR_COLOR;
  if (e.type === EDGE_TYPE_HAS_TAG) return HAS_TAG_COLOR;
  if (e.type === EDGE_TYPE_SIBLING) return SIBLING_COLOR;
  if (e.type === EDGE_TYPE_SEQUENCE) return SEQUENCE_COLOR;
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

    const sid = edgeSourceId(e);
    const tid = edgeTargetId(e);
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

  const rA = radii.get(cable.srcCluster) ?? DEFAULT_CLUSTER_RADIUS;
  const rB = radii.get(cable.tgtCluster) ?? DEFAULT_CLUSTER_RADIUS;

  const dx = cB.x - cA.x;
  const dy = cB.y - cA.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;

  const ux = dx / dist;
  const uy = dy / dist;

  // Trunk start/end: clipped at cluster boundary (with small margin)
  // If clusters overlap (rA + rB > dist), place trunk endpoints at midpoint
  const margin = CABLE_LAYOUT_MARGIN;
  const gapDist = dist - rA - rB;
  let startFrac: number, endFrac: number;
  if (gapDist > margin * 2) {
    // Normal case: trunk spans the gap between cluster boundaries
    startFrac = (rA + margin) / dist;
    endFrac = (rB + margin) / dist;
  } else {
    // Clusters close/overlapping: place trunk at 40%–60% of centroid-centroid line
    startFrac = CABLE_OVERLAP_FRAC;
    endFrac = CABLE_OVERLAP_FRAC;
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
    const laneSpacing = CABLE_LANE_SPACING;

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

      // Highlight: if any edge in this lane connects to a highlighted node, brighten trunk
      if (cfg.highlightedNodeId) {
        let laneHit = false;
        for (const e of lane.edges) {
          const sid = edgeSourceId(e);
          const tid = edgeTargetId(e);
          if (cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid)) {
            laneHit = true;
            break;
          }
        }
        if (laneHit) {
          trunkAlpha = cfg.highlightEdgeAlpha ?? 1.0;
          trunkWidth = HIGHLIGHT_CABLE_TRUNK_WIDTH;
        } else {
          trunkAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;
        }
      }

      g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha * densityScale, native: true });
      // Route trunk through road network if available (cached)
      if (cfg.roadNetwork && cfg.enableRoadRouting !== false && cfg.roadNetwork.intersections.length > 0) {
        const wps = getCachedCableTrunkRoute(cfg.roadNetwork, ts.x, ts.y, te.x, te.y);
        if (wps.length >= 2) {
          g.moveTo(ts.x, ts.y);
          for (const wp of wps) g.lineTo(wp.x, wp.y);
          g.lineTo(te.x, te.y);
        } else {
          g.moveTo(ts.x, ts.y);
          g.lineTo(te.x, te.y);
        }
      } else {
        g.moveTo(ts.x, ts.y);
        g.lineTo(te.x, te.y);
      }

      // --- Fan lines: configurable lines from nodes to trunk endpoints ---
      const fanWidth = cfg.cableFanWidth ?? 1;
      const baseFanAlpha = cfg.cableFanAlpha ?? 0.45;
      const fanCount = lane.edges.length;
      const crowdFactor = Math.min(1, CABLE_FAN_CROWD_THRESHOLD / fanCount);
      const fanAlpha = baseFanAlpha * (CABLE_FAN_CROWD_MIN_FRACTION + (1 - CABLE_FAN_CROWD_MIN_FRACTION) * crowdFactor) * densityScale;

      for (const e of lane.edges) {
        const src = resolvePos(e.source);
        const tgt = resolvePos(e.target);
        if (!src || !tgt) continue;

        const sid = src.id ?? edgeSourceId(e);
        const tid = tgt.id ?? edgeTargetId(e);
        const srcCluster = cfg.nodeClusterMap!.get(sid);

        let alpha = fanAlpha;

        // Highlight: show individual fans clearly on hover
        if (cfg.highlightedNodeId) {
          if (cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid)) {
            alpha = (cfg.highlightEdgeAlpha ?? 1.0) * CABLE_FAN_CONNECTED_FACTOR;
          } else {
            alpha = (cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA) * CABLE_FAN_NON_MATCH_DAMPEN;
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

// ---------------------------------------------------------------------------
// Road routing cache — invalidated when road network changes
// ---------------------------------------------------------------------------
let _roadRouteCache = new Map<string, { x: number; y: number }[]>();
let _roadRouteCacheNetwork: RoadNetwork | null = null;

/**
 * Return a cached route for the given source/target node pair.
 * The cache is automatically invalidated when the network reference changes
 * (i.e. after a layout rebuild).
 */
function getCachedRoute(
  network: RoadNetwork,
  srcId: string,
  tgtId: string,
): { x: number; y: number }[] {
  // Invalidate if network reference changed
  if (network !== _roadRouteCacheNetwork) {
    _roadRouteCache.clear();
    _roadRouteCacheNetwork = network;
  }

  const key = srcId < tgtId ? `${srcId}|${tgtId}` : `${tgtId}|${srcId}`;
  let cached = _roadRouteCache.get(key);
  if (!cached) {
    cached = routeEdge(network, srcId, tgtId);
    _roadRouteCache.set(key, cached);
  }
  return cached;
}

/**
 * Return a cached route for coordinate-based cable trunk routing.
 * Uses truncated coordinates as the cache key since cable endpoints
 * are centroids rather than node IDs.
 */
function getCachedCableTrunkRoute(
  network: RoadNetwork,
  sx: number, sy: number,
  ex: number, ey: number,
): { x: number; y: number }[] {
  // Invalidate if network reference changed
  if (network !== _roadRouteCacheNetwork) {
    _roadRouteCache.clear();
    _roadRouteCacheNetwork = network;
  }

  const cableKey = `cable:${Math.round(sx)}:${Math.round(sy)}:${Math.round(ex)}:${Math.round(ey)}`;
  let cached = _roadRouteCache.get(cableKey);
  if (!cached) {
    const startIsect = findNearestIntersection(network, sx, sy);
    const endIsect = findNearestIntersection(network, ex, ey);
    if (startIsect >= 0 && endIsect >= 0 && startIsect !== endIsect) {
      const path = findShortestPath(network, startIsect, endIsect);
      cached = pathToWaypoints(network, path);
    } else {
      cached = [];
    }
    _roadRouteCache.set(cableKey, cached);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// Segment usage tracking — visual bundling for road-routed edges
// ---------------------------------------------------------------------------

/** Per-frame segment usage counts for visual bundling effect */
let _segmentUsageMap = new Map<string, number>();

/**
 * Track road segment usage for visual bundling.
 * Each consecutive waypoint pair is a segment; increment its usage count.
 */
function canonicalSegmentKey(ax: number, ay: number, bx: number, by: number): string {
  const rax = Math.round(ax), ray = Math.round(ay);
  const rbx = Math.round(bx), rby = Math.round(by);
  // Canonical order: smaller coordinate pair first to avoid directional duplicates
  return rax < rbx || (rax === rbx && ray < rby)
    ? `${rax},${ray}-${rbx},${rby}`
    : `${rbx},${rby}-${rax},${ray}`;
}

function trackSegmentUsage(
  waypoints: { x: number; y: number }[],
  usageMap: Map<string, number>,
): void {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const key = canonicalSegmentKey(waypoints[i].x, waypoints[i].y, waypoints[i + 1].x, waypoints[i + 1].y);
    usageMap.set(key, (usageMap.get(key) ?? 0) + 1);
  }
}

/**
 * Look up the maximum segment usage count along a route.
 * Returns 1 if no segments are tracked (no bundling effect).
 */
function getRouteMaxUsage(
  waypoints: { x: number; y: number }[],
  usageMap: Map<string, number>,
): number {
  let max = 1;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const key = canonicalSegmentKey(waypoints[i].x, waypoints[i].y, waypoints[i + 1].x, waypoints[i + 1].y);
    const count = usageMap.get(key) ?? 1;
    if (count > max) max = count;
  }
  return max;
}

/** Mark the direction bundle cache as stale (call when edges, visibility, or
 *  layout change significantly — e.g. toggling edge types, loading new data). */
export function invalidateBundleCache(): void {
  _bundleDirty = true;
  _cableDirty = true;
  _roadRouteCache.clear();
  _roadRouteCacheNetwork = null;
}

// ---------------------------------------------------------------------------
// Edge style resolution — alpha and line thickness per edge
// ---------------------------------------------------------------------------

/** Resolved visual style for a single edge */
interface EdgeStyle {
  alpha: number;
  lineThick: number;
}

/**
 * Compute alpha and line thickness for a single edge based on type,
 * relation coloring, degree fading, edge weight, and hover highlight.
 */
function resolveEdgeStyle(
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

  if (cfg.highlightedNodeId) {
    const sid = src.id ?? (e.source as string);
    const tid = tgt.id ?? (e.target as string);
    // An edge is highlighted when at least one endpoint is in the highlight set
    const highlighted = cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid);
    if (highlighted) {
      lineThick = HIGHLIGHT_LINE_THICKNESS;
      alpha = cfg.highlightEdgeAlpha ?? 1.0;
    } else {
      alpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;
    }
  }

  return { alpha, lineThick };
}

// ---------------------------------------------------------------------------
// Dash pattern helpers
// ---------------------------------------------------------------------------

/** Apply a dash pattern based on edge type. Returns true if a dash was set. */
function applyDashPattern(g: CanvasGraphics, e: GraphEdge, lineThick: number): boolean {
  const s = lineThick;
  switch (e.type) {
    case "semantic":
      g.setLineDash([4 * s, 4 * s]);
      return true;
    case EDGE_TYPE_TAG:
    case EDGE_TYPE_HAS_TAG:
      g.setLineDash([8 * s, 3 * s]);
      return true;
    case EDGE_TYPE_SIMILAR:
      g.setLineDash([3 * s, 5 * s]);
      return true;
    default:
      return false;
  }
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
): void {
  // Road routing: all edge types follow roads when available
  if (roadNetwork && roadNetwork.intersections.length > 0 && !isArcLayout) {
    const srcId = typeof e.source === "string" ? e.source : (e.source as any)?.id ?? "";
    const tgtId = typeof e.target === "string" ? e.target : (e.target as any)?.id ?? "";
    const waypoints = getCachedRoute(roadNetwork, srcId, tgtId);
    if (waypoints.length >= 2) {
      // Draw edge along road waypoints
      g.moveTo(src.x, src.y);
      // Connect source to first waypoint
      g.lineTo(waypoints[0].x, waypoints[0].y);
      // Follow road waypoints
      for (let i = 1; i < waypoints.length; i++) {
        g.lineTo(waypoints[i].x, waypoints[i].y);
      }
      // Connect last waypoint to target
      g.lineTo(tgt.x, tgt.y);
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
    g.moveTo(src.x, src.y);
    g.lineTo(tgt.x, tgt.y);
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
    drawEdgeMarker(g, src, tgt, e.type as typeof EDGE_TYPE_INHERITANCE | typeof EDGE_TYPE_AGGREGATION, lineColor, alpha, cfg.bgColor);
  }

  // Sequence arrow (next/prev direction)
  if (e.type === EDGE_TYPE_SEQUENCE) {
    drawSequenceArrow(g, src, tgt, lineColor, alpha);
  }

  // Generic directional arrow (skip edges that already have their own markers)
  if (cfg.showArrows && e.type !== EDGE_TYPE_SEQUENCE && !isOnto && arrowGfx) {
    const tgtR = cfg.nodeRadii?.get(e.target) ?? 4;
    drawGenericArrow(arrowGfx, src, tgt, lineColor, Math.max(alpha, 0.5), tgtR);
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
function computeDensityScale(cfg: EdgeDrawConfig, edgeCount: number): number {
  const densityScaleBase = edgeCount <= DENSITY_FULL_ALPHA_THRESHOLD ? 1
    : edgeCount <= DENSITY_GENTLE_THRESHOLD ? 1 - DENSITY_GENTLE_REDUCTION * ((edgeCount - DENSITY_FULL_ALPHA_THRESHOLD) / (DENSITY_GENTLE_THRESHOLD - DENSITY_FULL_ALPHA_THRESHOLD))
    : edgeCount <= DENSITY_AGGRESSIVE_THRESHOLD ? DENSITY_AGGRESSIVE_MID_ALPHA - DENSITY_AGGRESSIVE_REDUCTION * ((edgeCount - DENSITY_GENTLE_THRESHOLD) / (DENSITY_AGGRESSIVE_THRESHOLD - DENSITY_GENTLE_THRESHOLD))
    : DENSITY_MIN_ALPHA;
  // At extreme zoom-out (scale < ZOOM_FADE_THRESHOLD), further reduce alpha so edges don't
  // obscure nodes rendered with min-radius inflation.
  const ws = cfg.worldScale ?? 1;
  const zoomFade = ws >= ZOOM_FADE_THRESHOLD ? 1 : Math.max(ZOOM_FADE_MIN_ALPHA, ws / ZOOM_FADE_THRESHOLD);
  return Math.max(cfg.edgeDensityFloor ?? DEFAULT_DENSITY_FLOOR, densityScaleBase * zoomFade);
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

  const { colorEdgesByRelation: useRelColor } = cfg;
  // Disable arc curves when edge count is high to avoid vertex buffer explosion.
  // quadraticCurveTo generates ~20 vertices per edge vs 4 for lineTo.
  const isArcLayout = cfg.isArcLayout && edges.length < ARC_MAX_EDGE_COUNT;

  const edgeCount = cfg.totalEdgeCount ?? edges.length;
  const densityScale = computeDensityScale(cfg, edgeCount);

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
  const bundleStrength = cfg.bundleStrength;
  let bundles: Map<string, BundleGroup> | null = null;
  if (bundleStrength > 0) {
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
  // "never" -> always off; "always" -> on if cluster data exists; "auto" -> on if clusters
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

  // Draw cables first (trunk + fan-out).
  // Pre-check: remove edges from cabledEdgeIds if their cable layout will fail
  // (e.g., nodes still at origin, clusters overlapping). This ensures those edges
  // fall back to normal straight-line drawing instead of silently disappearing.
  if (cables.length > 0) {
    const centroids = cfg.clusterCentroids;
    const radii = cfg.clusterRadii;
    if (centroids && radii) {
      for (const cable of cables) {
        const layout = computeCableLayout(cable, centroids, radii, cfg);
        if (!layout) {
          for (const lane of cable.lanes) {
            for (const e of lane.edges) cabledEdgeIds.delete(e.id);
          }
        }
      }
    }
    drawCables(g, cables, resolvePos, cfg, densityScale);
  }

  // Pre-pass: build segment usage counts for visual bundling on road-routed edges.
  // This lets us render shared road segments wider + more transparent.
  const roadNet = (cfg.enableRoadRouting !== false) ? cfg.roadNetwork : null;
  const useRoadRouting = !!(roadNet && roadNet.intersections.length > 0 && !isArcLayout);
  _segmentUsageMap.clear();
  if (useRoadRouting) {
    for (const e of edges) {
      if (cabledEdgeIds.has(e.id)) continue;
      if (shouldSkipEdge(e, cfg)) continue;
      const srcId = typeof e.source === "string" ? e.source : (e.source as any)?.id ?? "";
      const tgtId = typeof e.target === "string" ? e.target : (e.target as any)?.id ?? "";
      const waypoints = getCachedRoute(roadNet!, srcId, tgtId);
      if (waypoints.length >= 2) {
        trackSegmentUsage(waypoints, _segmentUsageMap);
      }
    }
  }

  for (const e of edges) {
    // Skip edges handled by cable bundling
    if (cabledEdgeIds.has(e.id)) continue;
    if (shouldSkipEdge(e, cfg)) continue;

    const src = resolvePos(e.source);
    const tgt = resolvePos(e.target);
    if (!src || !tgt) continue;

    const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
    let { alpha, lineThick } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);

    // Visual bundling: adjust style for edges sharing road segments
    if (useRoadRouting) {
      const srcId = typeof e.source === "string" ? e.source : (e.source as any)?.id ?? "";
      const tgtId = typeof e.target === "string" ? e.target : (e.target as any)?.id ?? "";
      const waypoints = getCachedRoute(roadNet!, srcId, tgtId);
      if (waypoints.length >= 2) {
        const usageCount = getRouteMaxUsage(waypoints, _segmentUsageMap);
        if (usageCount > 1) {
          const sqrtUsage = Math.sqrt(usageCount);
          lineThick = Math.min(lineThick * sqrtUsage, 8);
          alpha = alpha / sqrtUsage;
        }
      }
    }

    g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
    const hasDash = applyDashPattern(g, e, lineThick);

    drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength, roadNet);
    drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);

    if (hasDash) g.setLineDash([]);
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
  const sz = Math.max(GENERIC_ARROW_MIN_SIZE, targetRadius * GENERIC_ARROW_RADIUS_FACTOR);
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
    case EDGE_TYPE_INHERITANCE: return { sourceCardinality: "1", targetCardinality: "0..N" };
    case EDGE_TYPE_AGGREGATION: return { sourceCardinality: "1", targetCardinality: "0..N" };
    case EDGE_TYPE_HAS_TAG: return { sourceCardinality: "N", targetCardinality: "1" };
    case EDGE_TYPE_LINK: return { sourceCardinality: "1", targetCardinality: "0..1" };
    case EDGE_TYPE_SEQUENCE: return { sourceCardinality: "1", targetCardinality: "1" };
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

/**
 * Determine the display label for an edge.
 * Returns the custom relation name if set, otherwise a short type label.
 * Returns null for edge types that should not display a label (links, has-tag).
 */
function getEdgeLabel(e: GraphEdge): string | null {
  if (e.relation) return e.relation;
  switch (e.type) {
    case EDGE_TYPE_INHERITANCE: return "is-a";
    case EDGE_TYPE_AGGREGATION: return "has-a";
    case EDGE_TYPE_SIMILAR: return "\u2248"; // ≈
    case EDGE_TYPE_SIBLING: return "sibling";
    case EDGE_TYPE_SEQUENCE: return "seq";
    case EDGE_TYPE_HAS_TAG: return null;
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
      fontSize: EDGE_LABEL_FONT_SIZE,
      fill: fillColor,
      fontFamily: "sans-serif",
    });
    text.anchor.set(0.5, 0.5);
    text.x = mx;
    text.y = my;
    text.alpha = EDGE_LABEL_ALPHA;
    text.resolution = EDGE_LABEL_RESOLUTION;

    container.addChild(text);
  }
}
