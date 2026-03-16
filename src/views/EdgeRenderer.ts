import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { GraphEdge, EdgeCardinalityMode, Cardinality, CardinalityRule, CardinalityRenderConfig } from "../types";
import { DEFAULT_CARDINALITY_RENDER_CONFIG } from "../types";
import { cssColorToHex, edgeSourceId, edgeTargetId } from "../utils/graph-helpers";
import type { RoadNetwork } from "../layouts/cable-tray";
import { routeEdge, findNearestIntersection, cachedFindShortestPath, pathToWaypoints, invalidatePathCache } from "../layouts/cable-tray";
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
  /** Group arrangement pattern — used for trunk routing direction */
  clusterArrangement?: string;
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
/** Cable lane spacing in screen pixels — wide enough to distinguish parallel cables */
const CABLE_LANE_SPACING = 8;
/** Cable layout margin from cluster boundary */
const CABLE_LAYOUT_MARGIN = 5;
/** Cable layout overlap start/end fraction */
const CABLE_OVERLAP_FRAC = 0.4;
/** Trunk conduit alpha — semi-transparent so wires show through */
const TRUNK_CONDUIT_ALPHA = 0.18;
/** Cable conduit alpha — semi-transparent so wires show through */
const CABLE_CONDUIT_ALPHA = 0.12;
/** Wire alpha — most opaque layer, clearly visible */
const WIRE_BASE_ALPHA = 0.7;
/** Wire spacing within a cable (screen pixels between parallel wires) */
const STUB_WIRE_SPACING = 3;
/** Maximum conduit width in screen pixels */
const MAX_CONDUIT_WIDTH = 16;
/** Trunk conduit screen width (px) — thickest layer */
const TRUNK_SCREEN_WIDTH = 12;
/** Cable conduit screen width (px) — medium layer */
const CABLE_SCREEN_WIDTH = 6;
/** Wire screen width (px) — thinnest layer */
const WIRE_SCREEN_WIDTH = 1.5;
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
// 3-Layer Wiring Model: 幹線 (Trunk) → Port (引き込み口) → ケーブル (Cable) → 電線 (Wire)
// ---------------------------------------------------------------------------

/** 引き込み口: 各グループに1つ、グループ境界上に配置 */
interface GroupPort {
  groupKey: string;
  x: number;
  y: number;
}

/** 幹線: グループペア間を結ぶ。内部にケーブルを収容 */
interface Trunk {
  pairKey: string;
  srcGroup: string;
  tgtGroup: string;
  path: { x: number; y: number }[];
  cables: TrunkCable[];
  allEdges: GraphEdge[];
}

/** 幹線内のケーブル: 同一色のエッジをまとめる */
interface TrunkCable {
  color: number;
  edges: GraphEdge[];
}

/**
 * Compute one Port per group on the group boundary.
 * Port direction = average direction to all connected groups.
 */
function computeGroupPorts(
  groupKeys: Set<string>,
  centroids: Map<string, { x: number; y: number }>,
  radii: Map<string, number>,
  connections: Map<string, Set<string>>,
): Map<string, GroupPort> {
  const ports = new Map<string, GroupPort>();
  for (const gk of groupKeys) {
    const c = centroids.get(gk);
    if (!c) continue;
    const r = radii.get(gk) ?? DEFAULT_CLUSTER_RADIUS;
    const conns = connections.get(gk);
    if (!conns || conns.size === 0) {
      ports.set(gk, { groupKey: gk, x: c.x, y: c.y });
      continue;
    }
    let sinSum = 0, cosSum = 0;
    for (const other of conns) {
      const oc = centroids.get(other);
      if (!oc) continue;
      const dx = oc.x - c.x, dy = oc.y - c.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      cosSum += dx / len;
      sinSum += dy / len;
    }
    const avgLen = Math.sqrt(cosSum * cosSum + sinSum * sinSum);
    let portX: number, portY: number;
    if (avgLen < 0.01) {
      portX = c.x + r;
      portY = c.y;
    } else {
      portX = c.x + (cosSum / avgLen) * r;
      portY = c.y + (sinSum / avgLen) * r;
    }
    ports.set(gk, { groupKey: gk, x: portX, y: portY });
  }
  return ports;
}

/**
 * Build a Manhattan (L-shaped) path from port A to port B.
 * The path follows grid-aligned segments: first horizontal, then vertical.
 * For concentric/radial arrangements, we use the radial+arc convention.
 */
function buildManhattanPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  arrangement?: string,
): { x: number; y: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // If nearly aligned (within 5% of distance), go straight
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return [a, b];
  if (Math.abs(dx) < dist * 0.05 || Math.abs(dy) < dist * 0.05) {
    return [a, b];
  }

  // Manhattan L-shape: go horizontal first, then vertical.
  // Choose the L-direction that keeps the bend farther from both ports.
  // Option 1: horizontal then vertical → bend at (b.x, a.y)
  // Option 2: vertical then horizontal → bend at (a.x, b.y)
  // Pick the one where the bend point is farther from the midpoint (more "square")
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const bend1 = { x: b.x, y: a.y };
  const bend2 = { x: a.x, y: b.y };
  const d1 = (bend1.x - mid.x) ** 2 + (bend1.y - mid.y) ** 2;
  const d2 = (bend2.x - mid.x) ** 2 + (bend2.y - mid.y) ** 2;

  // Use the option with longer first segment for cleaner visual
  const useBend1 = Math.abs(dx) >= Math.abs(dy);
  const bend = useBend1 ? bend1 : bend2;

  return [a, bend, b];
}

/**
 * Group inter-group edges into Trunks (one per group pair).
 * Each trunk contains cables grouped by edge color.
 * Only pairs with 2+ edges become trunks (singletons stay as normal edges).
 */
function buildTrunks(
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): { trunks: Trunk[]; cabledEdgeIds: Set<string> } {
  const trunks: Trunk[] = [];
  const cabledEdgeIds = new Set<string>();
  const { nodeClusterMap } = cfg;
  if (!nodeClusterMap) return { trunks, cabledEdgeIds };

  const pairData = new Map<string, {
    srcGroup: string; tgtGroup: string;
    byColor: Map<number, GraphEdge[]>;
  }>();

  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;
    const sid = edgeSourceId(e);
    const tid = edgeTargetId(e);
    const srcGroup = nodeClusterMap.get(sid);
    const tgtGroup = nodeClusterMap.get(tid);
    if (!srcGroup || !tgtGroup || srcGroup === tgtGroup) continue;
    const [a, b] = srcGroup < tgtGroup ? [srcGroup, tgtGroup] : [tgtGroup, srcGroup];
    const pairKey = `${a}|${b}`;
    let pair = pairData.get(pairKey);
    if (!pair) { pair = { srcGroup: a, tgtGroup: b, byColor: new Map() }; pairData.set(pairKey, pair); }
    const color = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
    let group = pair.byColor.get(color);
    if (!group) { group = []; pair.byColor.set(color, group); }
    group.push(e);
  }

  // Build connection map for Port computation
  const connections = new Map<string, Set<string>>();
  for (const [, pair] of pairData) {
    if (!connections.has(pair.srcGroup)) connections.set(pair.srcGroup, new Set());
    if (!connections.has(pair.tgtGroup)) connections.set(pair.tgtGroup, new Set());
    connections.get(pair.srcGroup)!.add(pair.tgtGroup);
    connections.get(pair.tgtGroup)!.add(pair.srcGroup);
  }

  const centroids = cfg.clusterCentroids;
  const radii = cfg.clusterRadii;
  if (!centroids || !radii) return { trunks, cabledEdgeIds };

  const groupKeys = new Set(connections.keys());
  const ports = computeGroupPorts(groupKeys, centroids, radii, connections);

  // Compute junction point per group: a shared point where all trunks from
  // this group converge before fanning out. This is offset from the Port
  // in the direction away from the group centroid.
  const junctions = new Map<string, { x: number; y: number }>();
  for (const [gk, port] of ports) {
    const c = centroids.get(gk);
    if (!c) { junctions.set(gk, { x: port.x, y: port.y }); continue; }
    const r = radii.get(gk) ?? DEFAULT_CLUSTER_RADIUS;
    // Junction = Port + offset outward (away from centroid), distance = 30% of radius
    const dx = port.x - c.x, dy = port.y - c.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) { junctions.set(gk, { x: port.x, y: port.y }); continue; }
    const junctionDist = r * 0.3;
    junctions.set(gk, {
      x: port.x + (dx / len) * junctionDist,
      y: port.y + (dy / len) * junctionDist,
    });
  }

  for (const [pairKey, pair] of pairData) {
    const cables: TrunkCable[] = [];
    const allEdges: GraphEdge[] = [];
    let totalEdges = 0;
    for (const [color, edgeList] of pair.byColor) {
      cables.push({ color, edges: edgeList });
      for (const e of edgeList) allEdges.push(e);
      totalEdges += edgeList.length;
    }
    // All inter-group edges go through trunks — no minimum count
    const portA = ports.get(pair.srcGroup);
    const portB = ports.get(pair.tgtGroup);
    if (!portA || !portB) continue;

    const jctA = junctions.get(pair.srcGroup) ?? portA;
    const jctB = junctions.get(pair.tgtGroup) ?? portB;

    // Path: PortA → JunctionA → (Manhattan middle) → JunctionB → PortB
    const middle = buildManhattanPath(jctA, jctB, cfg.clusterArrangement);
    // Full path: Port → Junction → middle route → Junction → Port
    const path: { x: number; y: number }[] = [];
    path.push({ x: portA.x, y: portA.y });
    // Add junction only if it differs from port
    if (Math.abs(jctA.x - portA.x) > 1 || Math.abs(jctA.y - portA.y) > 1) {
      path.push({ x: jctA.x, y: jctA.y });
    }
    // Add middle points (skip first/last if they duplicate junction)
    for (let i = 0; i < middle.length; i++) {
      const p = middle[i];
      const prev = path[path.length - 1];
      if (Math.abs(p.x - prev.x) > 1 || Math.abs(p.y - prev.y) > 1) {
        path.push(p);
      }
    }
    // Add junction B and port B
    const lastPt = path[path.length - 1];
    if (Math.abs(jctB.x - lastPt.x) > 1 || Math.abs(jctB.y - lastPt.y) > 1) {
      path.push({ x: jctB.x, y: jctB.y });
    }
    if (Math.abs(portB.x - path[path.length - 1].x) > 1 || Math.abs(portB.y - path[path.length - 1].y) > 1) {
      path.push({ x: portB.x, y: portB.y });
    }

    trunks.push({ pairKey, srcGroup: pair.srcGroup, tgtGroup: pair.tgtGroup, path, cables, allEdges });
    for (const e of allEdges) cabledEdgeIds.add(e.id);
  }

  return { trunks, cabledEdgeIds };
}

// ---------------------------------------------------------------------------
// Intra-group cable wiring
// ---------------------------------------------------------------------------

/** Node port offset: fraction of node spacing to place port below/beside node */
const NODE_PORT_OFFSET_RATIO = 0.5;
/** Minimum node port offset distance (world units) */
const NODE_PORT_MIN_OFFSET = 50;

/**
 * Build intra-group cables: edges within the same cluster group are bundled
 * by shared source node. Each cable branches from a junction (source node pos)
 * to multiple target node ports via Manhattan paths.
 */
function buildIntraGroupCables(
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
  groupPorts: Map<string, GroupPort>,
): { cables: IntraGroupCable[]; handledEdgeIds: Set<string> } {
  const cables: IntraGroupCable[] = [];
  const handledEdgeIds = new Set<string>();
  const { nodeClusterMap, clusterCentroids } = cfg;
  if (!nodeClusterMap || !clusterCentroids) return { cables, handledEdgeIds };

  // Step 1: Collect intra-group edges, grouped by (group, source node)
  const groupSourceMap = new Map<string, Map<string, GraphEdge[]>>();

  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;
    const sid = edgeSourceId(e);
    const tid = edgeTargetId(e);
    const srcGroup = nodeClusterMap.get(sid);
    const tgtGroup = nodeClusterMap.get(tid);
    if (!srcGroup || !tgtGroup || srcGroup !== tgtGroup) continue;
    // Same group — intra-group edge
    let sourceMap = groupSourceMap.get(srcGroup);
    if (!sourceMap) { sourceMap = new Map(); groupSourceMap.set(srcGroup, sourceMap); }
    let edgeList = sourceMap.get(sid);
    if (!edgeList) { edgeList = []; sourceMap.set(sid, edgeList); }
    edgeList.push(e);
  }

  // Step 2: Build cables for each group's source nodes
  for (const [groupKey, sourceMap] of groupSourceMap) {
    const centroid = clusterCentroids.get(groupKey);
    if (!centroid) continue;
    const groupPort = groupPorts.get(groupKey);

    // Compute node row spacing to place cable ports between rows.
    // Collect Y coordinates of all nodes in this group, find min gap.
    const groupNodeYs = new Set<number>();
    for (const [nid] of sourceMap) {
      const p = resolvePos(nid);
      if (p) groupNodeYs.add(Math.round(p.y));
    }
    // Also collect target node Ys
    for (const [, edgeList] of sourceMap) {
      for (const e of edgeList) {
        const tp = resolvePos(e.target);
        if (tp) groupNodeYs.add(Math.round(tp.y));
      }
    }
    const sortedYs = [...groupNodeYs].sort((a, b) => a - b);
    let minRowGap = Infinity;
    for (let i = 1; i < sortedYs.length; i++) {
      const gap = sortedYs[i] - sortedYs[i - 1];
      if (gap > 1 && gap < minRowGap) minRowGap = gap;
    }
    // Port offset = half of row spacing (cables run between rows)
    const portOffset = minRowGap < Infinity ? minRowGap * 0.45 : NODE_PORT_MIN_OFFSET;

    for (const [sourceNodeId, edgeList] of sourceMap) {

      const srcPos = resolvePos(sourceNodeId);
      if (!srcPos) continue;

      // Collect all node positions for this cable (source + all targets)
      const nodePositions: { x: number; y: number }[] = [{ x: srcPos.x, y: srcPos.y }];
      const targetPositions = new Map<string, { x: number; y: number }>();
      let connectsExternal = false;

      for (const e of edgeList) {
        const tid = edgeTargetId(e);
        const tgtGroup = nodeClusterMap.get(tid);
        if (tgtGroup && tgtGroup !== groupKey) {
          connectsExternal = true;
          continue;
        }
        if (targetPositions.has(tid)) continue;
        const tgtPos = resolvePos(e.target) ?? resolvePos(tid);
        if (!tgtPos) continue;
        targetPositions.set(tid, { x: tgtPos.x, y: tgtPos.y });
        nodePositions.push({ x: tgtPos.x, y: tgtPos.y });
      }

      if (targetPositions.size === 0 && !connectsExternal) continue;

      // ── Junction = average position of ALL nodes in this group ──
      // Computed from actual node positions (not clusterMeta centroids).
      let allGroupX = 0, allGroupY = 0, allGroupN = 0;
      for (const [nid] of sourceMap) {
        const p = resolvePos(nid);
        if (p) { allGroupX += p.x; allGroupY += p.y; allGroupN++; }
      }
      // Also include target nodes that may not be sources
      const countedIds = new Set(sourceMap.keys());
      for (const [, edgeList] of sourceMap) {
        for (const e of edgeList) {
          const tid = edgeTargetId(e);
          if (countedIds.has(tid)) continue;
          countedIds.add(tid);
          const tg = nodeClusterMap.get(tid);
          if (tg !== groupKey) continue;
          const p = resolvePos(e.target) ?? resolvePos(tid);
          if (p) { allGroupX += p.x; allGroupY += p.y; allGroupN++; }
        }
      }
      const junction = allGroupN > 0
        ? { x: allGroupX / allGroupN, y: allGroupY / allGroupN }
        : { x: centroid.x, y: centroid.y };

      // ── Row gap for cable routing ──
      // Cables must NOT cross nodes. They route through the gap between
      // node rows, never on the same Y as any node.
      const halfGap = sortedYs.length >= 2
        ? (sortedYs[sortedYs.length - 1] - sortedYs[0]) / (sortedYs.length - 1) / 2
        : portOffset;
      const minClearance = Math.max(portOffset * 0.3, 8); // minimum distance from any node row

      const findGapBelow = (y: number): number => {
        for (let ri = 0; ri < sortedYs.length - 1; ri++) {
          const gap = (sortedYs[ri] + sortedYs[ri + 1]) / 2;
          if (gap > y + 1) return gap;
        }
        return sortedYs[sortedYs.length - 1] + halfGap;
      };

      let routeY = findGapBelow(junction.y);
      // Ensure routeY doesn't overlap any node row
      for (const ny of sortedYs) {
        if (Math.abs(routeY - ny) < minClearance) {
          routeY = ny + minClearance;
        }
      }

      // ── Build branches ──
      // Each branch path: src → (down to routeY) → junction X → (across to tgt X) → tgt
      // This ensures cables pass through junction and never cross node rows.
      // Route: src → (drop to routeY) → junction.x → tgt.x → (rise to tgt)
      const branches: IntraGroupCable["branches"] = [];

      for (const e of edgeList) {
        const tid = edgeTargetId(e);
        const tgtPos = targetPositions.get(tid);
        if (!tgtPos) continue;

        let branch = branches.find(b => b.nodePort.nodeId === tid);
        if (!branch) {
          const tgtPort: NodePort = { nodeId: tid, x: tgtPos.x, y: tgtPos.y };

          // ALL cables route through junction via gap row — no direct lines
          const path = [
            { x: srcPos.x, y: srcPos.y },     // start at source
            { x: srcPos.x, y: routeY },        // drop to routing gap
            { x: junction.x, y: routeY },      // across to junction X
            { x: tgtPos.x, y: routeY },        // across to target X
            { x: tgtPos.x, y: tgtPos.y },      // up to target
          ];
          branch = { nodePort: tgtPort, path, edges: [] };
          branches.push(branch);
        }
        branch.edges.push(e);
        handledEdgeIds.add(e.id);
      }

      if (branches.length === 0 && !connectsExternal) continue;

      // Group port branch: source → (gap) → junction → (gap) → groupPort
      let groupPortBranch: IntraGroupCable["groupPortBranch"] = null;
      if (connectsExternal && groupPort) {
        const path = [
          { x: srcPos.x, y: srcPos.y },
          { x: srcPos.x, y: routeY },             // drop to routing gap
          { x: junction.x, y: routeY },                   // across to junction X
          { x: groupPort.x, y: routeY },          // across to group port X
          { x: groupPort.x, y: groupPort.y },     // up/down to group port
        ];
        groupPortBranch = { path };
      }

      cables.push({ groupKey, junction, branches, groupPortBranch });
    }
  }

  return { cables, handledEdgeIds };
}

/**
 * Draw intra-group cables in 2 passes: conduits then wires.
 */
function drawIntraGroupCables(
  g: CanvasGraphics,
  cables: IntraGroupCable[],
  cfg: EdgeDrawConfig,
  densityScale: number,
): void {
  if (cables.length === 0) return;

  // Cable count attenuation (similar to trunk crowd alpha)
  const cableCount = cables.length;
  const crowdAlpha = cableCount <= 20 ? 1.0
    : cableCount <= 60 ? 0.6
    : cableCount <= 150 ? 0.35
    : 0.2;

  // Highlight helper
  const getBranchHighlight = (branchEdges: GraphEdge[]): "normal" | "bright" | "dim" => {
    if (!cfg.highlightedNodeId) return "normal";
    for (const e of branchEdges) {
      if (cfg.highlightSet.has(edgeSourceId(e)) || cfg.highlightSet.has(edgeTargetId(e))) return "bright";
    }
    return "dim";
  };

  // PASS 0: Junction points — visible dots (cross shape, 4px native)
  for (const cable of cables) {
    const j = cable.junction;
    g.lineStyle({ width: 4, color: 0xff4444, alpha: 0.8, native: true });
    g.moveTo(j.x - 0.5, j.y);
    g.lineTo(j.x + 0.5, j.y);
  }

  // PASS 1: Cable conduits — CABLE_SCREEN_WIDTH, semi-transparent
  for (const cable of cables) {
    for (const branch of cable.branches) {
      const highlight = getBranchHighlight(branch.edges);
      const conduitAlpha = highlight === "dim" ? 0.03 : highlight === "bright" ? 0.18 : CABLE_CONDUIT_ALPHA;
      _drawSmoothPath(g, branch.path, CABLE_SCREEN_WIDTH, 0x888888, conduitAlpha * densityScale * crowdAlpha);
    }
    if (cable.groupPortBranch) {
      _drawSmoothPath(g, cable.groupPortBranch.path, CABLE_SCREEN_WIDTH, 0x888888,
        CABLE_CONDUIT_ALPHA * densityScale * crowdAlpha * 0.7);
    }
  }

  // PASS 2: Wires — WIRE_SCREEN_WIDTH, colored, visible through conduit
  for (const cable of cables) {
    for (const branch of cable.branches) {
      const nEdges = branch.edges.length;
      const highlight = getBranchHighlight(branch.edges);

      const p0 = branch.path[0], pN = branch.path[branch.path.length - 1];
      const tdx = pN.x - p0.x, tdy = pN.y - p0.y;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
      const perpX = tlen > 0 ? -tdy / tlen : 0;
      const perpY = tlen > 0 ? tdx / tlen : 1;

      for (let ei = 0; ei < nEdges; ei++) {
        const e = branch.edges[ei];
        const color = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);

        let wireAlpha = WIRE_BASE_ALPHA;
        if (highlight === "bright") wireAlpha = cfg.highlightEdgeAlpha ?? 1.0;
        else if (highlight === "dim") wireAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;

        const off = nEdges > 1 ? (ei - (nEdges - 1) / 2) * STUB_WIRE_SPACING : 0;
        const wirePath = off === 0 ? branch.path
          : branch.path.map(p => ({ x: p.x + perpX * off, y: p.y + perpY * off }));

        _drawSmoothPath(g, wirePath, WIRE_SCREEN_WIDTH, color, wireAlpha * densityScale * crowdAlpha);
      }
    }
  }
}

// Intra-group cable cache (same invalidation as trunks)
let _intraCableCache: { cables: IntraGroupCable[]; handledEdgeIds: Set<string> } | null = null;
let _intraCableDirty = true;

/**
 * Draw trunks in 3 passes: conduit background, cable conduits, then wires.
 * Uses existing _drawSmoothPath for all rendering.
 */
function drawTrunks(
  g: CanvasGraphics,
  trunks: Trunk[],
  cfg: EdgeDrawConfig,
  densityScale: number,
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

  // Lane spacing for parallel cables within a trunk (screen px)
  const laneSpacing = CABLE_LANE_SPACING;

  // PASS 1: Trunk conduits — width adapts to cable count so all lanes fit inside.
  // Alpha scales inversely with trunk count to prevent overdrawn white bands
  // where many trunks overlap (e.g., through dense node rows).
  const trunkCountAlpha = trunks.length <= 5 ? 1.0
    : trunks.length <= 20 ? 0.5
    : trunks.length <= 100 ? 0.25
    : 0.12;
  for (const trunk of trunks) {
    const nCables = trunk.cables.length;
    const trunkWidth = Math.max(nCables * laneSpacing + CABLE_SCREEN_WIDTH, TRUNK_SCREEN_WIDTH);
    const highlight = getTrunkHighlight(trunk);
    const trunkAlpha = highlight === "dim" ? 0.02 : highlight === "bright" ? 0.2 : TRUNK_CONDUIT_ALPHA;
    _drawSmoothPath(g, trunk.path, trunkWidth, 0x888888, trunkAlpha * densityScale * trunkCountAlpha);
  }

  // PASS 2: Cable conduits — medium width, semi-transparent gray, one per color lane
  for (const trunk of trunks) {
    const nCables = trunk.cables.length;
    if (nCables <= 1) continue;

    const p0 = trunk.path[0], pN = trunk.path[trunk.path.length - 1];
    const tdx = pN.x - p0.x, tdy = pN.y - p0.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
    const perpX = tlen > 0 ? -tdy / tlen : 0;
    const perpY = tlen > 0 ? tdx / tlen : 1;

    for (let ci = 0; ci < nCables; ci++) {
      const off = (ci - (nCables - 1) / 2) * laneSpacing;
      const cablePath = trunk.path.map(p => ({ x: p.x + perpX * off, y: p.y + perpY * off }));
      _drawSmoothPath(g, cablePath, CABLE_SCREEN_WIDTH, 0x888888, CABLE_CONDUIT_ALPHA * densityScale);
    }
  }

  // PASS 3: Wires — thinnest, colored, clearly visible through conduits
  for (const trunk of trunks) {
    const nCables = trunk.cables.length;
    const p0 = trunk.path[0], pN = trunk.path[trunk.path.length - 1];
    const tdx = pN.x - p0.x, tdy = pN.y - p0.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
    const perpX = tlen > 0 ? -tdy / tlen : 0;
    const perpY = tlen > 0 ? tdx / tlen : 1;

    const highlight = getTrunkHighlight(trunk);

    for (let ci = 0; ci < nCables; ci++) {
      const cable = trunk.cables[ci];
      const off = (ci - (nCables - 1) / 2) * laneSpacing;
      const ox = perpX * off, oy = perpY * off;

      let wireAlpha = WIRE_BASE_ALPHA;
      if (highlight === "bright") wireAlpha = cfg.highlightEdgeAlpha ?? 1.0;
      else if (highlight === "dim") wireAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;

      const wirePath = trunk.path.map(p => ({ x: p.x + ox, y: p.y + oy }));
      _drawSmoothPath(g, wirePath, WIRE_SCREEN_WIDTH, cable.color, wireAlpha * densityScale);
    }
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
      const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
      const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
      const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
      const dot = Math.abs(dx1 * dx2 + dy1 * dy2);
      if (cross > 0.1 * (dot + 1)) {
        const mx = (cur.x + next.x) / 2, my = (cur.y + next.y) / 2;
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
// Direction bundle cache — avoids recomputing every frame during animation
// ---------------------------------------------------------------------------
let _bundleCache: Map<string, BundleGroup> | null = null;
let _bundleDirty = true;

// Road routing cache — invalidated when road network reference changes
let _roadRouteCache = new Map<string, { x: number; y: number }[]>();
let _roadRouteCacheNetwork: RoadNetwork | null = null;
let _bundleFrameCount = 0;
/** Recompute bundles every Nth frame during animation (reduces cost by ~66%) */
const BUNDLE_SKIP = 3;

// Trunk bundling cache (same invalidation as direction bundles)
let _cableCache: { trunks: Trunk[]; cabledEdgeIds: Set<string> } | null = null;
let _cableDirty = true;
let _cableCentroidCount = 0; // track centroid count to auto-invalidate

/** Mark the direction bundle cache as stale (call when edges, visibility, or
 *  layout change significantly — e.g. toggling edge types, loading new data). */
export function invalidateBundleCache(): void {
  _bundleDirty = true;
  _cableDirty = true;
  _intraCableDirty = true;
  _roadRouteCache.clear();
  _roadRouteCacheNetwork = null;
  invalidatePathCache();
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
  // Road routing: all edge types follow roads when available.
  // Waypoints are connected with smooth quadratic curves (not straight segments)
  // to avoid ugly L-shaped paths from Dijkstra routing on grids.
  if (roadNetwork && roadNetwork.intersections.length > 0 && !isArcLayout) {
    const srcId = edgeSourceId(e);
    const tgtId = edgeTargetId(e);
    // Cache route lookups (invalidate when network reference changes)
    if (roadNetwork !== _roadRouteCacheNetwork) {
      _roadRouteCache.clear();
      _roadRouteCacheNetwork = roadNetwork;
    }
    const cacheKey = srcId < tgtId ? `${srcId}|${tgtId}` : `${tgtId}|${srcId}`;
    let waypoints = _roadRouteCache.get(cacheKey);
    if (!waypoints) {
      waypoints = routeEdge(roadNetwork, srcId, tgtId);
      _roadRouteCache.set(cacheKey, waypoints);
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

  // Trunk bundling: group inter-group edges into trunks with ports
  const clustersAvailable = !!(cfg.nodeClusterMap && cfg.clusterCentroids && cfg.clusterRadii);
  const cableMode = cfg.cableBundleMode ?? "auto";
  const hasClusters = cableMode === "never" ? false
    : cableMode === "always" ? clustersAvailable
    : clustersAvailable;
  let cabledEdgeIds: Set<string>;
  if (hasClusters) {
    // Auto-invalidate when centroid count changes (e.g. simulation startup → stable)
    const curCentroidCount = cfg.clusterCentroids?.size ?? 0;
    if (curCentroidCount !== _cableCentroidCount) {
      _cableDirty = true;
      _cableCentroidCount = curCentroidCount;
    }
    if (_cableDirty || !_cableCache) {
      _cableCache = buildTrunks(edges, resolvePos, cfg);
      _cableDirty = false;
    }
    cabledEdgeIds = _cableCache.cabledEdgeIds;
    if (_cableCache.trunks.length > 0) {
      drawTrunks(g, _cableCache.trunks, cfg, densityScale);
    }
  } else {
    cabledEdgeIds = new Set<string>();
  }

  // Intra-group cable wiring
  let intraHandledIds = new Set<string>();
  if (hasClusters && _cableCache) {
    if (_intraCableDirty || !_intraCableCache) {
      // Compute group ports for intra-group cables (re-uses computeGroupPorts)
      const centroids = cfg.clusterCentroids!;
      const radii = cfg.clusterRadii!;
      // Build connection map from trunks for port computation
      const connections = new Map<string, Set<string>>();
      for (const trunk of _cableCache.trunks) {
        if (!connections.has(trunk.srcGroup)) connections.set(trunk.srcGroup, new Set());
        if (!connections.has(trunk.tgtGroup)) connections.set(trunk.tgtGroup, new Set());
        connections.get(trunk.srcGroup)!.add(trunk.tgtGroup);
        connections.get(trunk.tgtGroup)!.add(trunk.srcGroup);
      }
      const groupKeys = new Set(cfg.nodeClusterMap!.values());
      const groupPorts = computeGroupPorts(groupKeys, centroids, radii, connections);
      _intraCableCache = buildIntraGroupCables(edges, resolvePos, cfg, groupPorts);
      _intraCableDirty = false;
    }
    intraHandledIds = _intraCableCache.handledEdgeIds;
    if (_intraCableCache.cables.length > 0) {
      drawIntraGroupCables(g, _intraCableCache.cables, cfg, densityScale);
    }
  }

  let _dbgLeaked = 0;
  for (const e of edges) {
    // Skip edges handled by trunk bundling or intra-group cables
    if (cabledEdgeIds.has(e.id)) continue;
    if (intraHandledIds.has(e.id)) continue;
    if (shouldSkipEdge(e, cfg)) continue;

    const src = resolvePos(e.source);
    const tgt = resolvePos(e.target);
    if (!src || !tgt) continue;

    // Edges not handled by trunk or intra-group cables fall through to normal drawing

    const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
    const { alpha, lineThick } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);

    g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
    const hasDash = applyDashPattern(g, e, lineThick);

    drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength);
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
