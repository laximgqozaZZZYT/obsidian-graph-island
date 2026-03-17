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
  /** Edge label placement mode: center (midpoint), offset (perpendicular above), smart (collision-avoiding) */
  edgeLabelPlacement?: "center" | "offset" | "smart";
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
  /** Coordinate system: "cartesian" or "polar" — determines cable routing mode */
  coordinateSystem?: "cartesian" | "polar";
  /** エッジ種別ごとにレイヤー分離描画 — 種別別に描画パスを分けて z-order を制御 */
  edgeLayerMode?: boolean;
  /** エッジ重みラベル表示: 同一ペア間のエッジ本数を数値で表示 */
  showEdgeWeightLabels?: boolean;
  /** エッジ多重度ラベル: 同一ノードペア間に複数エッジがある場合、本数を表示 */
  showEdgeCardinalityLabels?: boolean;
  /** Filter edges by directionality: "all" | "bidirectional" | "unidirectional" */
  edgeDirectionFilter?: "all" | "bidirectional" | "unidirectional";
  /** Visual indicator for bidirectional edges (thicker + higher alpha) */
  showBidirectionalIndicator?: boolean;
  /** Pre-computed set of bidirectional edge keys ("source→target") */
  _bidirectionalSet?: Set<string>;
  /** Scale edge width by target node in-degree */
  edgeStrengthGlow?: boolean;
  /** Minimum width multiplier for edge strength glow (default 0.5) */
  edgeStrengthGlowMin?: number;
  /** Maximum width multiplier for edge strength glow (default 3.0) */
  edgeStrengthGlowMax?: number;
}

// Minimal position data needed for source/target
interface Pos {
  x: number;
  y: number;
  id?: string;
}

/** Returns true if the edge should be skipped based on type visibility toggles. */
function shouldSkipEdge(e: GraphEdge, cfg: EdgeDrawConfig): boolean {
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
function buildBidirectionalSet(edges: GraphEdge[]): Set<string> {
  const forward = new Set<string>();
  const bidir = new Set<string>();
  for (const e of edges) {
    const fwd = `${e.source}→${e.target}`;
    const rev = `${e.target}→${e.source}`;
    if (forward.has(rev)) {
      bidir.add(rev);
      bidir.add(fwd);
    }
    forward.add(fwd);
  }
  return bidir;
}

/** Check if an edge should be skipped based on the direction filter. */
function shouldSkipByDirection(e: GraphEdge, cfg: EdgeDrawConfig): boolean {
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
function defaultColor(isDark: boolean) { return isDark ? 0x666666 : 0x999999; }
function highlightColor(isDark: boolean) { return isDark ? 0x999999 : 0x555555; }
const INHERITANCE_COLOR = 0x9ca3af;
const AGGREGATION_COLOR = 0x60a5fa;
const SIMILAR_COLOR = 0xfbbf24;
const HAS_TAG_COLOR = 0xb4a0ff;
const SIBLING_COLOR = 0x34d399;   // green — peer relationship
const SEQUENCE_COLOR = 0xfb923c;  // orange — sequential order

// ---------------------------------------------------------------------------
// Edge type specification map — single source of truth for per-type behavior
// ---------------------------------------------------------------------------
interface EdgeTypeSpec {
  /** Which EdgeDrawConfig field controls visibility */
  visibilityField: keyof EdgeDrawConfig;
  /** Fixed color for this edge type, or null to use relation/default color */
  color: number | null;
}

const EDGE_TYPE_SPECS: ReadonlyMap<string, EdgeTypeSpec> = new Map<string, EdgeTypeSpec>([
  [EDGE_TYPE_LINK,        { visibilityField: "showLinks",        color: null }],
  [EDGE_TYPE_TAG,         { visibilityField: "showTagEdges",     color: null }],
  ["category",            { visibilityField: "showCategoryEdges", color: null }],
  ["semantic",            { visibilityField: "showSemanticEdges", color: null }],
  [EDGE_TYPE_INHERITANCE, { visibilityField: "showInheritance",  color: INHERITANCE_COLOR }],
  [EDGE_TYPE_AGGREGATION, { visibilityField: "showAggregation",  color: AGGREGATION_COLOR }],
  [EDGE_TYPE_HAS_TAG,     { visibilityField: "showTagNodes",     color: HAS_TAG_COLOR }],
  [EDGE_TYPE_SIMILAR,     { visibilityField: "showSimilar",      color: SIMILAR_COLOR }],
  [EDGE_TYPE_SIBLING,     { visibilityField: "showSibling",      color: SIBLING_COLOR }],
  [EDGE_TYPE_SEQUENCE,    { visibilityField: "showSequence",     color: SEQUENCE_COLOR }],
]);

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
const DEFAULT_LINE_THICKNESS = 2;
/** Edge weight additional thickness per log2 step */
const WEIGHT_THICKNESS_FACTOR = 0.6;
/** Fade-by-degree minimum alpha fraction */
const FADE_BY_DEGREE_MIN_ALPHA = 0.15;
/** Alpha for relation-colored edges */
const RELATION_COLOR_ALPHA = 0.8;
/** Highlighted edge line thickness */
const HIGHLIGHT_LINE_THICKNESS = 3.5;
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
const CABLE_LANE_SPACING = 14;
/** Cable layout margin from cluster boundary */
const CABLE_LAYOUT_MARGIN = 5;
/** Cable layout overlap start/end fraction */
const CABLE_OVERLAP_FRAC = 0.4;
/** Trunk conduit alpha — semi-transparent so wires show through */
const TRUNK_CONDUIT_ALPHA = 0;
/** Cable conduit alpha — semi-transparent so wires show through */
const CABLE_CONDUIT_ALPHA = 0;
/** Wire alpha — most opaque layer, clearly visible */
const WIRE_BASE_ALPHA = 0.9;
/** Wire spacing within a cable (screen pixels between parallel wires) */
const STUB_WIRE_SPACING = 7;
/** Maximum conduit width in screen pixels */
const MAX_CONDUIT_WIDTH = 16;
/** Trunk conduit screen width (px) — thickest layer */
const TRUNK_SCREEN_WIDTH = 12;
/** Cable conduit screen width (px) — medium layer */
const CABLE_SCREEN_WIDTH = 6;
/** Wire screen width (px) — thinnest layer */
const WIRE_SCREEN_WIDTH = 2.5;
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
  const spec = EDGE_TYPE_SPECS.get(e.type ?? "");
  if (spec?.color != null) return spec.color;
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
    if (shouldSkipByDirection(e, cfg)) continue;

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

/** 引込口の方向 (将来のグループ内ルーティング用に残す) */
type PortDirection = "N" | "S" | "E" | "W";

/** 引き込み口: 各グループに1つ、接続先グループ方向の平均ベクトルで配置 */
interface GroupPort {
  groupKey: string;
  x: number;
  y: number;
  /** Perpendicular direction at the port (tangent to group boundary).
   *  Used to spread wires consistently on both trunk and internal sides. */
  perpX: number;
  perpY: number;
}

/** 幹線: グループペア間を結ぶ。内部にケーブルを収容。1ペア1本。 */
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

/** オントロジー型エッジかどうか */
function isOntologyEdge(e: GraphEdge): boolean {
  return e.type === EDGE_TYPE_INHERITANCE
    || e.type === EDGE_TYPE_AGGREGATION
    || e.type === EDGE_TYPE_SEQUENCE;
}

/**
 * エッジが自ノード(nodeId)から見てどの方向のポートを使うか判定。
 * - N: 自分が source かつ 非オントロジー（リンク先）
 * - S: 自分が target かつ 非オントロジー（バックリンク）
 * - E: 自分が source かつ オントロジー（矢印出る）
 * - W: 自分が target かつ オントロジー（矢印入る）
 */
function classifyEdgePort(e: GraphEdge, nodeId: string): PortDirection {
  const isSrc = edgeSourceId(e) === nodeId;
  const onto = isOntologyEdge(e);
  if (onto) return isSrc ? "E" : "W";
  return isSrc ? "N" : "S";
}

/** PortColorLanes キー生成ヘルパー: "groupKey|dir" */
function portLaneKey(groupKey: string, dir: PortDirection): string {
  return `${groupKey}|${dir}`;
}

// ---------------------------------------------------------------------------
// Group BBox & Perimeter routing helpers
// ---------------------------------------------------------------------------

/** Face of a bounding box */
type BBoxFace = "N" | "S" | "E" | "W";

/** Bounding box with margin */
interface GroupBBox {
  minX: number; minY: number; maxX: number; maxY: number;
}

/** Compute the graph-wide center from all cluster centroids */
function computeGraphCenter(
  centroids: Map<string, { x: number; y: number }>,
): { x: number; y: number } {
  let sx = 0, sy = 0, n = 0;
  for (const c of centroids.values()) { sx += c.x; sy += c.y; n++; }
  if (n === 0) return { x: 0, y: 0 };
  return { x: sx / n, y: sy / n };
}

/**
 * Compute the bounding box of all nodes belonging to a group, with margin.
 * Returns null if no nodes found.
 */
function computeGroupBBox(
  groupKey: string,
  resolvePos: (ref: string | object) => Pos | undefined,
  nodeClusterMap: Map<string, string>,
  margin: number,
): GroupBBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
function computePortFace(
  bbox: GroupBBox,
  graphCenter: { x: number; y: number },
): BBoxFace {
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
    if (d < bestDist) { bestDist = d; best = faces[i]; }
  }
  return best.face;
}

/** Get the port position (center of the chosen face) */
function faceCenter(bbox: GroupBBox, face: BBoxFace): { x: number; y: number } {
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  switch (face) {
    case "N": return { x: cx, y: bbox.minY };
    case "S": return { x: cx, y: bbox.maxY };
    case "W": return { x: bbox.minX, y: cy };
    case "E": return { x: bbox.maxX, y: cy };
  }
}

/** Get the perpendicular (tangent) direction at a face */
function facePerpendicular(face: BBoxFace): { perpX: number; perpY: number } {
  // Tangent along the face edge
  switch (face) {
    case "N": case "S": return { perpX: 1, perpY: 0 }; // horizontal face
    case "E": case "W": return { perpX: 0, perpY: 1 }; // vertical face
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
function buildPerimeterPath(
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
function findPerimeterBranchPoint(
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
    const abx = b.x - a.x, aby = b.y - a.y;
    const apx = targetX - a.x, apy = targetY - a.y;
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
interface JunctionGrid {
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
function mergeNearbyValues(sorted: number[], minSpacing: number): number[] {
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
function computeJunctionGrid(
  groupKey: string,
  resolvePos: (ref: string | object) => Pos | undefined,
  nodeClusterMap: Map<string, string>,
): JunctionGrid {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [nid, gk] of nodeClusterMap) {
    if (gk !== groupKey) continue;
    const p = resolvePos(nid);
    if (p) { xs.push(Math.round(p.x)); ys.push(Math.round(p.y)); }
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
function filterGridForPortFace(grid: JunctionGrid, face: BBoxFace): JunctionGrid {
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
function findNearestGap(gaps: number[], target: number): number | null {
  if (gaps.length === 0) return null;
  let best = gaps[0];
  let bestDist = Math.abs(gaps[0] - target);
  for (let i = 1; i < gaps.length; i++) {
    const d = Math.abs(gaps[i] - target);
    if (d < bestDist) { bestDist = d; best = gaps[i]; }
  }
  return best;
}

/**
 * Find a gap BETWEEN two coordinates (strictly between minV and maxV).
 * If none found strictly between, fall back to nearest gap overall.
 */
function findGapBetween(gaps: number[], a: number, b: number): number | null {
  if (gaps.length === 0) return null;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  // Prefer a gap strictly between a and b
  let best: number | null = null;
  let bestDist = Infinity;
  const mid = (a + b) / 2;
  for (const g of gaps) {
    if (g > lo + 1 && g < hi - 1) {
      const d = Math.abs(g - mid);
      if (d < bestDist) { bestDist = d; best = g; }
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
function routeViaJunctionGrid(
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

// ---------------------------------------------------------------------------
// Polar junction grid — ring/radial gap routing for polar coordinate groups
// ---------------------------------------------------------------------------

/** Junction grid for polar coordinate groups */
interface PolarJunctionGrid {
  /** Sorted ring radii where nodes are placed (relative to group center) */
  rings: number[];
  /** Sorted angles (radians) where nodes are placed */
  angles: number[];
  /** Midpoint radii between adjacent rings (routing corridors) */
  ringGaps: number[];
  /** Midpoint angles between adjacent node angles (routing corridors) */
  angleGaps: number[];
  /** Group center in world coordinates */
  cx: number;
  cy: number;
}

/** Compute a polar junction grid from node positions within a group. */
function computePolarJunctionGrid(
  groupKey: string,
  resolvePos: (ref: string | object) => Pos | undefined,
  nodeClusterMap: Map<string, string>,
  center: { x: number; y: number },
): PolarJunctionGrid {
  const radii: number[] = [];
  const angles: number[] = [];

  for (const [nid, gk] of nodeClusterMap) {
    if (gk !== groupKey) continue;
    const p = resolvePos(nid);
    if (!p) continue;
    const dx = p.x - center.x, dy = p.y - center.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.atan2(dy, dx);
    radii.push(Math.round(r * 10) / 10);
    angles.push(a);
  }

  radii.sort((a, b) => a - b);
  angles.sort((a, b) => a - b);

  // Merge nearby radii (same approach as mergeNearbyValues for cartesian)
  let minSpacing = 20;
  if (radii.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < radii.length; i++) {
      const g = radii[i] - radii[i - 1];
      if (g > 1) gaps.push(g);
    }
    if (gaps.length > 0) {
      gaps.sort((a, b) => a - b);
      minSpacing = gaps[Math.floor(gaps.length / 2)] * 0.4;
    }
  }
  const mergedRings = mergeNearbyValues(radii, minSpacing);

  // Merge nearby angles (wrap-aware: consider gap between last and first+2π)
  const minAngleSpacing = angles.length >= 2 ? Math.PI / (angles.length * 2) : 0.1;
  const mergedAngles = mergeNearbyValues(angles, minAngleSpacing);

  // Compute ring gaps (midpoints between adjacent merged rings)
  const ringGaps: number[] = [];
  for (let i = 0; i < mergedRings.length - 1; i++) {
    if (mergedRings[i + 1] - mergedRings[i] > minSpacing) {
      ringGaps.push((mergedRings[i] + mergedRings[i + 1]) / 2);
    }
  }

  // Compute angle gaps (midpoints between adjacent merged angles)
  const angleGaps: number[] = [];
  for (let i = 0; i < mergedAngles.length - 1; i++) {
    angleGaps.push((mergedAngles[i] + mergedAngles[i + 1]) / 2);
  }
  // Wrap-around gap: between last angle and first angle + 2π
  if (mergedAngles.length >= 2) {
    const wrapGap = (mergedAngles[mergedAngles.length - 1] + mergedAngles[0] + Math.PI * 2) / 2;
    // Normalize to [-π, π]
    const normGap = wrapGap > Math.PI ? wrapGap - Math.PI * 2 : wrapGap;
    angleGaps.push(normGap);
  }

  return {
    rings: mergedRings, angles: mergedAngles,
    ringGaps, angleGaps,
    cx: center.x, cy: center.y,
  };
}

/**
 * Filter a PolarJunctionGrid to exclude the ring gap closest to the port.
 * The port faces the graph center, so the innermost ringGap is on the port face.
 */
function filterPolarGridForPort(grid: PolarJunctionGrid, portR: number): PolarJunctionGrid {
  if (grid.ringGaps.length <= 0) return grid;

  // Find which ringGap is closest to the port radius
  let closestIdx = 0;
  let closestDist = Math.abs(grid.ringGaps[0] - portR);
  for (let i = 1; i < grid.ringGaps.length; i++) {
    const d = Math.abs(grid.ringGaps[i] - portR);
    if (d < closestDist) { closestDist = d; closestIdx = i; }
  }

  // Remove that ringGap
  const filtered = [...grid.ringGaps];
  filtered.splice(closestIdx, 1);
  return { ...grid, ringGaps: filtered };
}

/**
 * Route between two points within a polar group using the ring/angle grid.
 * Wires run along ringGap arcs and radial lines through angleGaps.
 *
 * Path: from → (fromAngle, srcRingGap) → arc to (toAngle, midRingGap) → to
 */
function routeViaPolarGrid(
  from: { x: number; y: number },
  to: { x: number; y: number },
  grid: PolarJunctionGrid,
): { x: number; y: number }[] {
  const { cx, cy, ringGaps, angleGaps } = grid;

  if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1) {
    return [from, to];
  }

  const fromR = Math.sqrt((from.x - cx) ** 2 + (from.y - cy) ** 2);
  const toR = Math.sqrt((to.x - cx) ** 2 + (to.y - cy) ** 2);
  const fromA = Math.atan2(from.y - cy, from.x - cx);
  const toA = Math.atan2(to.y - cy, to.x - cx);

  const path: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
  const addPt = (x: number, y: number) => {
    const last = path[path.length - 1];
    if (Math.abs(x - last.x) > 1 || Math.abs(y - last.y) > 1) {
      path.push({ x, y });
    }
  };

  // Find the best ringGap to route through (between from and to radii)
  const midR = (fromR + toR) / 2;
  let gapR: number | null = null;
  if (ringGaps.length > 0) {
    gapR = ringGaps[0];
    let bestDist = Math.abs(gapR - midR);
    // Prefer gap between the two radii
    const loR = Math.min(fromR, toR), hiR = Math.max(fromR, toR);
    for (const r of ringGaps) {
      if (r > loR && r < hiR) {
        const d = Math.abs(r - midR);
        if (d < bestDist) { bestDist = d; gapR = r; }
      }
    }
    // If none between, use nearest
    if (!(gapR > loR && gapR < hiR)) {
      gapR = ringGaps[0];
      bestDist = Math.abs(gapR - midR);
      for (const r of ringGaps) {
        const d = Math.abs(r - midR);
        if (d < bestDist) { bestDist = d; gapR = r; }
      }
    }
  }

  // Find angleGap nearest to from's angle (for radial exit)
  const findAngleGap = (targetA: number): number | null => {
    if (angleGaps.length === 0) return null;
    let best = angleGaps[0];
    let bestD = angleDist(best, targetA);
    for (const a of angleGaps) {
      const d = angleDist(a, targetA);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  };

  const srcAngleGap = findAngleGap(fromA);
  const tgtAngleGap = findAngleGap(toA);

  if (gapR !== null && srcAngleGap !== null && tgtAngleGap !== null) {
    // Full polar routing:
    // 1. Radial from source to srcAngleGap at source's ring
    addPt(cx + fromR * Math.cos(srcAngleGap), cy + fromR * Math.sin(srcAngleGap));
    // 2. Move to ringGap along srcAngleGap
    addPt(cx + gapR * Math.cos(srcAngleGap), cy + gapR * Math.sin(srcAngleGap));
    // 3. Arc along ringGap from srcAngleGap to tgtAngleGap
    let dAngle = tgtAngleGap - srcAngleGap;
    if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
    const arcSteps = Math.max(4, Math.ceil(Math.abs(dAngle) / (Math.PI / 12)));
    for (let i = 1; i < arcSteps; i++) {
      const t = i / arcSteps;
      const a = srcAngleGap + dAngle * t;
      addPt(cx + gapR * Math.cos(a), cy + gapR * Math.sin(a));
    }
    // 4. Arrive at tgtAngleGap on ringGap
    addPt(cx + gapR * Math.cos(tgtAngleGap), cy + gapR * Math.sin(tgtAngleGap));
    // 5. Radial to target's ring at tgtAngleGap
    addPt(cx + toR * Math.cos(tgtAngleGap), cy + toR * Math.sin(tgtAngleGap));
  } else if (gapR !== null) {
    // No angle gaps: just radial out, arc, radial in
    addPt(cx + gapR * Math.cos(fromA), cy + gapR * Math.sin(fromA));
    let dAngle = toA - fromA;
    if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
    const arcSteps = Math.max(4, Math.ceil(Math.abs(dAngle) / (Math.PI / 12)));
    for (let i = 1; i < arcSteps; i++) {
      const t = i / arcSteps;
      const a = fromA + dAngle * t;
      addPt(cx + gapR * Math.cos(a), cy + gapR * Math.sin(a));
    }
    addPt(cx + gapR * Math.cos(toA), cy + gapR * Math.sin(toA));
  } else {
    // No ring gaps: direct radial (fallback)
    const midA = fromA + shortestAngleDelta(fromA, toA) / 2;
    const outerR = Math.max(fromR, toR) * 1.2;
    addPt(cx + outerR * Math.cos(midA), cy + outerR * Math.sin(midA));
  }

  addPt(to.x, to.y);
  return path;
}

/** Shortest unsigned angle distance */
function angleDist(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/** Shortest signed angle delta from a to b */
function shortestAngleDelta(a: number, b: number): number {
  let d = b - a;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ---------------------------------------------------------------------------
// Consolidated edge render cache — replaces scattered module-level let vars
// ---------------------------------------------------------------------------
class EdgeRenderCache {
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

/**
 * Compute 1 Port per group.
 * - Cartesian: placed at the center of the bbox face closest to graph center.
 * - Polar: placed at the point on the group boundary closest to graph center,
 *   with perpendicular tangent to the radial direction (arc-tangent).
 */
function computeGroupPorts(
  groupKeys: Set<string>,
  centroids: Map<string, { x: number; y: number }>,
  radii: Map<string, number>,
  connections: Map<string, Set<string>>,
  coordinateSystem?: "cartesian" | "polar",
  polarCenter?: { x: number; y: number },
  resolvePos?: (ref: string | object) => Pos | undefined,
  nodeClusterMap?: Map<string, string>,
): Map<string, GroupPort> {
  const ports: Map<string, GroupPort> = new Map();
  const isPolar = coordinateSystem === "polar";

  // Compute graph center from all centroids
  const graphCenter = polarCenter ?? computeGraphCenter(centroids);
  _cache.graphCenter = graphCenter;

  // Estimate margin from node spacing (will be refined per-group if resolvePos available)
  const defaultMargin = 30;

  for (const gk of groupKeys) {
    const c = centroids.get(gk);
    if (!c) continue;

    if (isPolar) {
      // Polar port: place on group boundary in the direction toward graph center.
      // The perpendicular is the arc-tangent direction (perpendicular to radius).
      const r = radii.get(gk) ?? DEFAULT_CLUSTER_RADIUS;
      let dirX = graphCenter.x - c.x;
      let dirY = graphCenter.y - c.y;
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLen < 0.01) { dirX = 0; dirY = -1; }
      else { dirX /= dirLen; dirY /= dirLen; }
      // Perpendicular = tangent to the arc (90° CCW from radial direction)
      const perpX = -dirY, perpY = dirX;
      ports.set(gk, { groupKey: gk, x: c.x + dirX * r, y: c.y + dirY * r, perpX, perpY });
      continue;
    }

    // Cartesian port: bbox face closest to graph center
    let bbox: GroupBBox | null = null;
    if (resolvePos && nodeClusterMap) {
      const positions: { x: number; y: number }[] = [];
      for (const [nid, g] of nodeClusterMap) {
        if (g !== gk) continue;
        const p = resolvePos(nid);
        if (p) positions.push({ x: p.x, y: p.y });
      }
      let margin = defaultMargin;
      if (positions.length >= 2) {
        let minDist = Infinity;
        for (let i = 0; i < Math.min(positions.length, 50); i++) {
          for (let j = i + 1; j < Math.min(positions.length, 50); j++) {
            const d = Math.sqrt((positions[i].x - positions[j].x) ** 2 + (positions[i].y - positions[j].y) ** 2);
            if (d > 1 && d < minDist) minDist = d;
          }
        }
        if (minDist < Infinity) margin = minDist * 0.5;
      }
      bbox = computeGroupBBox(gk, resolvePos, nodeClusterMap, margin);
      _cache.groupBBox.set(gk, bbox);
    }

    if (bbox) {
      const face = computePortFace(bbox, graphCenter);
      const pos = faceCenter(bbox, face);
      const { perpX, perpY } = facePerpendicular(face);
      ports.set(gk, { groupKey: gk, x: pos.x, y: pos.y, perpX, perpY });
    } else {
      // Fallback: same as polar (centroid + radius toward center)
      const r = radii.get(gk) ?? DEFAULT_CLUSTER_RADIUS;
      let dirX = graphCenter.x - c.x;
      let dirY = graphCenter.y - c.y;
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLen < 0.01) { dirX = 0; dirY = -1; }
      else { dirX /= dirLen; dirY /= dirLen; }
      const perpX = -dirY, perpY = dirX;
      ports.set(gk, { groupKey: gk, x: c.x + dirX * r, y: c.y + dirY * r, perpX, perpY });
    }
  }
  return ports;
}

/**
 * Build a Manhattan (L-shaped) path from point A to point B.
 * The path follows grid-aligned segments: first horizontal, then vertical.
 */
function buildManhattanPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // If nearly aligned (within 5% of distance), go straight
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return [a, b];
  if (Math.abs(dx) < dist * 0.05 || Math.abs(dy) < dist * 0.05) {
    return [a, b];
  }

  // Use the option with longer first segment for cleaner visual
  const useBend1 = Math.abs(dx) >= Math.abs(dy);
  const bend = useBend1 ? { x: b.x, y: a.y } : { x: a.x, y: b.y };

  return [a, bend, b];
}

/** Horizontal-priority trunk path: go horizontal first, then vertical.
 *  Used for horizontal/timeline arrangements where groups are side-by-side. */
function buildHorizontalTrunkPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number }[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return [a, b];
  if (Math.abs(dy) < dist * 0.05) return [a, b]; // nearly horizontal
  // Horizontal first, then vertical
  return [a, { x: b.x, y: a.y }, b];
}

/** Vertical-priority trunk path: go vertical first, then horizontal.
 *  Used for vertical arrangements where groups are stacked. */
function buildVerticalTrunkPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number }[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return [a, b];
  if (Math.abs(dx) < dist * 0.05) return [a, b]; // nearly vertical
  // Vertical first, then horizontal
  return [a, { x: a.x, y: b.y }, b];
}

/**
 * Build a polar trunk path from point A to point B via arc + radial segments.
 * Route: A → radial to arcR → arc at arcR → radial to B
 * where arcR is a shared radius for the arc segment (midpoint of the two radii).
 */
function buildPolarTrunkPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  center: { x: number; y: number },
): { x: number; y: number }[] {
  const dxA = a.x - center.x, dyA = a.y - center.y;
  const dxB = b.x - center.x, dyB = b.y - center.y;
  const rA = Math.sqrt(dxA * dxA + dyA * dyA);
  const rB = Math.sqrt(dxB * dxB + dyB * dyB);
  const thetaA = Math.atan2(dyA, dxA);
  const thetaB = Math.atan2(dyB, dxB);

  // If nearly same angle, go straight (radial line)
  let angleDiff = thetaB - thetaA;
  if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
  if (Math.abs(angleDiff) < 0.05 || rA < 1 || rB < 1) return [a, b];

  // Arc radius: use the larger of the two (outer arc for clearance)
  const arcR = Math.max(rA, rB) * 1.1;

  // Generate arc waypoints from thetaA to thetaB at arcR
  const ARC_STEPS = Math.max(4, Math.ceil(Math.abs(angleDiff) / (Math.PI / 12)));
  const path: { x: number; y: number }[] = [a];

  // Radial step from A to arc radius (if needed)
  if (Math.abs(rA - arcR) > 5) {
    path.push({ x: center.x + arcR * Math.cos(thetaA), y: center.y + arcR * Math.sin(thetaA) });
  }

  // Arc waypoints
  for (let i = 1; i < ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const theta = thetaA + angleDiff * t;
    path.push({ x: center.x + arcR * Math.cos(theta), y: center.y + arcR * Math.sin(theta) });
  }

  // Radial step from arc to B (if needed)
  if (Math.abs(rB - arcR) > 5) {
    path.push({ x: center.x + arcR * Math.cos(thetaB), y: center.y + arcR * Math.sin(thetaB) });
  }

  path.push(b);
  return path;
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
  allPorts?: Map<string, GroupPort>,
): { trunks: Trunk[]; cabledEdgeIds: Set<string> } {
  const trunks: Trunk[] = [];
  const cabledEdgeIds = new Set<string>();
  const { nodeClusterMap } = cfg;
  if (!nodeClusterMap) return { trunks, cabledEdgeIds };

  // pairData key: "groupA|groupB" (alphabetically sorted, 1 trunk per pair)
  const pairData = new Map<string, {
    srcGroup: string; tgtGroup: string;
    byColor: Map<number, GraphEdge[]>;
  }>();

  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;
    if (shouldSkipByDirection(e, cfg)) continue;
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

  // Build connection map for Port computation (if allPorts not provided)
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

  // Use provided allPorts or compute them
  let ports = allPorts;
  if (!ports) {
    const groupKeys = new Set(connections.keys());
    // Compute polarCenter from all centroids
    let polarCenter: { x: number; y: number } | undefined;
    if (cfg.coordinateSystem === "polar" && centroids.size > 0) {
      let sx = 0, sy = 0;
      for (const c of centroids.values()) { sx += c.x; sy += c.y; }
      polarCenter = { x: sx / centroids.size, y: sy / centroids.size };
    }
    ports = computeGroupPorts(groupKeys, centroids, radii, connections, cfg.coordinateSystem, polarCenter, resolvePos, cfg.nodeClusterMap ?? undefined);
  }

  // Compute a single trunk endpoint per group pointing toward the other group.
  // This gives 1 trunk per group pair (not per direction pair).
  for (const [pairKey, pair] of pairData) {
    const cables: TrunkCable[] = [];
    const allEdges: GraphEdge[] = [];
    for (const [color, edgeList] of pair.byColor) {
      cables.push({ color, edges: edgeList });
      for (const e of edgeList) allEdges.push(e);
    }

    // Use the SAME shared ports from computeGroupPorts so that trunk endpoints
    // match groupPortBranch endpoints exactly (no gap).
    const portA = ports.get(pair.srcGroup);
    const portB = ports.get(pair.tgtGroup);
    if (!portA || !portB) continue;

    const rA = radii.get(pair.srcGroup) ?? DEFAULT_CLUSTER_RADIUS;
    const rB = radii.get(pair.tgtGroup) ?? DEFAULT_CLUSTER_RADIUS;
    const cA = centroids.get(pair.srcGroup);
    const cB = centroids.get(pair.tgtGroup);

    // Junction = port + 30% radius outward (away from centroid)
    const jDistA = rA * 0.3;
    const jDistB = rB * 0.3;
    const dxA = portA.x - (cA?.x ?? portA.x), dyA = portA.y - (cA?.y ?? portA.y);
    const lenA = Math.sqrt(dxA * dxA + dyA * dyA);
    const jctA = lenA > 1
      ? { x: portA.x + (dxA / lenA) * jDistA, y: portA.y + (dyA / lenA) * jDistA }
      : { x: portA.x, y: portA.y };
    const dxB = portB.x - (cB?.x ?? portB.x), dyB = portB.y - (cB?.y ?? portB.y);
    const lenB = Math.sqrt(dxB * dxB + dyB * dyB);
    const jctB = lenB > 1
      ? { x: portB.x + (dxB / lenB) * jDistB, y: portB.y + (dyB / lenB) * jDistB }
      : { x: portB.x, y: portB.y };

    // Path: PortA → JunctionA → (middle segment) → JunctionB → PortB
    // Route style depends on coordinate system AND group arrangement pattern.
    const isPolar = cfg.coordinateSystem === "polar";
    const polarCenter = isPolar ? computePolarCenter(cfg) : undefined;
    const arrangement = cfg.clusterArrangement ?? "grid";
    const middle = isPolar && polarCenter
      ? buildPolarTrunkPath(jctA, jctB, polarCenter)
      : arrangement === "horizontal" || arrangement === "timeline"
        ? buildHorizontalTrunkPath(jctA, jctB)
        : arrangement === "vertical"
          ? buildVerticalTrunkPath(jctA, jctB)
          : buildManhattanPath(jctA, jctB);
    const path: { x: number; y: number }[] = [];
    path.push(portA);
    if (Math.abs(jctA.x - portA.x) > 1 || Math.abs(jctA.y - portA.y) > 1) {
      path.push(jctA);
    }
    for (const p of middle) {
      const prev = path[path.length - 1];
      if (Math.abs(p.x - prev.x) > 1 || Math.abs(p.y - prev.y) > 1) {
        path.push(p);
      }
    }
    const lastPt = path[path.length - 1];
    if (Math.abs(jctB.x - lastPt.x) > 1 || Math.abs(jctB.y - lastPt.y) > 1) {
      path.push(jctB);
    }
    if (Math.abs(portB.x - path[path.length - 1].x) > 1 || Math.abs(portB.y - path[path.length - 1].y) > 1) {
      path.push(portB);
    }

    trunks.push({ pairKey, srcGroup: pair.srcGroup, tgtGroup: pair.tgtGroup, path, cables, allEdges });
    for (const e of allEdges) cabledEdgeIds.add(e.id);
  }

  return { trunks, cabledEdgeIds };
}

// ---------------------------------------------------------------------------
// Intra-group cable wiring
// ---------------------------------------------------------------------------

/** ノードポート: ノード位置の参照 */
interface NodePort {
  nodeId: string;
  x: number;
  y: number;
}

/** グループ内ケーブル: 同一グループ内のエッジ配線 */
interface IntraGroupCable {
  groupKey: string;
  junction: { x: number; y: number };
  branches: { nodePort: NodePort; path: { x: number; y: number }[]; edges: GraphEdge[] }[];
  groupPortBranch: { path: { x: number; y: number }[]; edges: GraphEdge[] } | null;
}

/** Node port offset: fraction of node spacing to place port below/beside node */
const NODE_PORT_OFFSET_RATIO = 0.5;
/** Minimum node port offset distance (world units) */
const NODE_PORT_MIN_OFFSET = 50;

/** Cable routing options */
interface CableRouteOpts {
  /** Row gap midpoints for cartesian L-shape routing */
  rowGaps?: number[];
  /** Polar mode: center of the coordinate system */
  center?: { x: number; y: number };
  /** Polar mode: ring gap radii (midpoints between adjacent node rings) */
  ringGaps?: number[];
}

/**
 * Compute a cable path that avoids nodes by running through gaps.
 *
 * Cartesian: L-shape through row gaps
 *   from → (from.x, gapY) → (to.x, gapY) → to
 *
 * Polar: arc through ring gaps
 *   from → (radial to gapRing) → (arc along gapRing) → (radial to target) → to
 */
function computeCablePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  offset: number,
  opts?: CableRouteOpts,
): { x: number; y: number }[] {
  if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1) {
    return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
  }

  // ── Polar routing ──
  if (opts?.center && opts?.ringGaps && opts.ringGaps.length > 0) {
    const cx = opts.center.x, cy = opts.center.y;
    const fromR = Math.sqrt((from.x - cx) ** 2 + (from.y - cy) ** 2);
    const toR = Math.sqrt((to.x - cx) ** 2 + (to.y - cy) ** 2);
    const fromA = Math.atan2(from.y - cy, from.x - cx);
    const toA = Math.atan2(to.y - cy, to.x - cx);

    // Pick the ring gap between from and to radii
    const midR = (fromR + toR) / 2;
    let gapR = opts.ringGaps[0];
    let bestDist = Math.abs(gapR - midR);
    for (const r of opts.ringGaps) {
      const d = Math.abs(r - midR);
      if (d < bestDist) { bestDist = d; gapR = r; }
    }

    // Arc interpolation along the gap ring from fromAngle to toAngle
    let dAngle = toA - fromA;
    // Shortest arc direction
    if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI;

    const ARC_STEPS = Math.max(4, Math.ceil(Math.abs(dAngle) / (Math.PI / 12)));
    const path: { x: number; y: number }[] = [{ x: from.x, y: from.y }];

    // Radial move: from → gap ring at from's angle
    path.push({ x: cx + gapR * Math.cos(fromA), y: cy + gapR * Math.sin(fromA) });

    // Arc along gap ring
    for (let i = 1; i < ARC_STEPS; i++) {
      const t = i / ARC_STEPS;
      const a = fromA + dAngle * t;
      path.push({ x: cx + gapR * Math.cos(a), y: cy + gapR * Math.sin(a) });
    }

    // Radial move: gap ring at to's angle → to
    path.push({ x: cx + gapR * Math.cos(toA), y: cy + gapR * Math.sin(toA) });
    path.push({ x: to.x, y: to.y });

    return path;
  }

  // ── Cartesian routing ──
  if (opts?.rowGaps && opts.rowGaps.length > 0) {
    const midY = (from.y + to.y) / 2;
    let gapY = opts.rowGaps[0];
    let bestDist = Math.abs(gapY - midY);
    for (const g of opts.rowGaps) {
      const d = Math.abs(g - midY);
      if (d < bestDist) { bestDist = d; gapY = g; }
    }
    // Prefer a gap between from and to
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    if (gapY < minY || gapY > maxY) {
      for (const g of opts.rowGaps) {
        if (g >= minY && g <= maxY) {
          const d = Math.abs(g - midY);
          if (d < bestDist) { bestDist = d; gapY = g; }
        }
      }
    }
    return [
      { x: from.x, y: from.y },
      { x: from.x, y: gapY },
      { x: to.x, y: gapY },
      { x: to.x, y: to.y },
    ];
  }

  // ── Fallback: perpendicular offset ──
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len, perpY = dx / len;
  const sign = perpY >= 0 ? 1 : -1;
  return [
    { x: from.x, y: from.y },
    { x: (from.x + to.x) / 2 + perpX * offset * sign,
      y: (from.y + to.y) / 2 + perpY * offset * sign },
    { x: to.x, y: to.y },
  ];
}

/** Pre-computed perimeter info for a group (used by cable routing helpers). */
interface GroupPerimInfo {
  bbox: GroupBBox;
  face: BBoxFace;
  port: { x: number; y: number };
  perimeterPath: { x: number; y: number }[];
  grid: JunctionGrid;
  polarGrid?: PolarJunctionGrid;
}

/**
 * Route a single source node's intra-group cable (branches + group port branch).
 * Extracted from the inner loop of buildIntraGroupCables Step 3.
 */
function _routeSingleIntraCable(
  sourceNodeId: string,
  edgeList: GraphEdge[],
  groupKey: string,
  centroid: { x: number; y: number },
  portForKey: GroupPort | null,
  perimInfo: GroupPerimInfo | null,
  isPolar: boolean,
  resolvePos: (ref: string | object) => Pos | undefined,
  nodeClusterMap: Map<string, string>,
  groupExternalMap: Map<string, Map<string, GraphEdge[]>>,
  handledEdgeIds: Set<string>,
): IntraGroupCable | null {
  const srcPos = resolvePos(sourceNodeId);
  if (!srcPos) return null;

  const targetPositions = new Map<string, { x: number; y: number }>();
  const externalEdges = groupExternalMap.get(groupKey)?.get(sourceNodeId) ?? [];
  const connectsExternal = externalEdges.length > 0;

  for (const e of edgeList) {
    const tid = edgeTargetId(e);
    const tgtGroup = nodeClusterMap.get(tid);
    if (tgtGroup && tgtGroup !== groupKey) continue;
    if (targetPositions.has(tid)) continue;
    const tgtPos = resolvePos(e.target) ?? resolvePos(tid);
    if (!tgtPos) continue;
    targetPositions.set(tid, { x: tgtPos.x, y: tgtPos.y });
  }

  if (targetPositions.size === 0 && !connectsExternal) return null;

  const junction = { x: centroid.x, y: centroid.y };

  // ── Build branches: route via junction grid ──
  // Use a filtered grid that excludes the port-face gap to avoid
  // branching wires on the same face as the entry port (引き込み口).
  const branches: IntraGroupCable["branches"] = [];

  // Prepare routing grid (cartesian or polar)
  const branchGrid = perimInfo
    ? filterGridForPortFace(perimInfo.grid, perimInfo.face)
    : null;
  // Polar: filter ringGap closest to port
  let branchPolarGrid: PolarJunctionGrid | null = null;
  if (isPolar && perimInfo?.polarGrid && portForKey) {
    const portR = Math.sqrt(
      (portForKey.x - perimInfo.polarGrid.cx) ** 2 +
      (portForKey.y - perimInfo.polarGrid.cy) ** 2,
    );
    branchPolarGrid = filterPolarGridForPort(perimInfo.polarGrid, portR);
  }

  // Choose routing function based on coordinate system
  const routeBranch = (src: { x: number; y: number }, tgt: { x: number; y: number }) => {
    if (branchPolarGrid && branchPolarGrid.ringGaps.length > 0) {
      return deduplicatePath(routeViaPolarGrid(src, tgt, branchPolarGrid));
    }
    if (branchGrid) {
      return deduplicatePath(routeViaJunctionGrid(src, tgt, branchGrid));
    }
    return [{ x: src.x, y: src.y }, { x: tgt.x, y: tgt.y }];
  };

  for (const e of edgeList) {
    const tid = edgeTargetId(e);
    const tgtPos = targetPositions.get(tid);
    if (!tgtPos) continue;

    let branch = branches.find(b => b.nodePort.nodeId === tid);
    if (!branch) {
      const tgtPort: NodePort = { nodeId: tid, x: tgtPos.x, y: tgtPos.y };
      const path = routeBranch(srcPos, tgtPos);
      branch = { nodePort: tgtPort, path, edges: [] };
      branches.push(branch);
    }
    branch.edges.push(e);
    handledEdgeIds.add(e.id);
  }

  if (branches.length === 0 && !connectsExternal) return null;

  // Group port branch: route from source node to port.
  // Uses filtered grid so wire approaches port without branching on port face.
  let groupPortBranch: IntraGroupCable["groupPortBranch"] = null;
  if (connectsExternal && portForKey) {
    let path = routeBranch(srcPos, portForKey);
    path = deduplicatePath(path);
    groupPortBranch = { path, edges: [...externalEdges] };
  }

  return { groupKey, junction, branches, groupPortBranch };
}

/**
 * Route an external-only node (target of cross-group edges, no intra-group source edges).
 * Extracted from the inner loop of buildIntraGroupCables Step 4.
 */
function _routeExternalOnlyNode(
  nodeId: string,
  externalEdges: GraphEdge[],
  groupKey: string,
  centroid: { x: number; y: number },
  portForKey: GroupPort,
  perimInfo: GroupPerimInfo | null,
  isPolar: boolean,
  resolvePos: (ref: string | object) => Pos | undefined,
): IntraGroupCable | null {
  const nodePos = resolvePos(nodeId);
  if (!nodePos) return null;
  if (externalEdges.length === 0) return null;

  const junction = { x: centroid.x, y: centroid.y };

  let path: { x: number; y: number }[];
  if (isPolar && perimInfo?.polarGrid) {
    // Polar: route through filtered polar grid
    const portR = Math.sqrt(
      (portForKey.x - perimInfo.polarGrid.cx) ** 2 +
      (portForKey.y - perimInfo.polarGrid.cy) ** 2,
    );
    const filteredPolar = filterPolarGridForPort(perimInfo.polarGrid, portR);
    path = filteredPolar.ringGaps.length > 0
      ? deduplicatePath(routeViaPolarGrid(nodePos, portForKey, filteredPolar))
      : [{ x: nodePos.x, y: nodePos.y }, { x: portForKey.x, y: portForKey.y }];
  } else if (perimInfo) {
    // Cartesian: route through filtered junction grid
    const filteredGrid = filterGridForPortFace(perimInfo.grid, perimInfo.face);
    path = deduplicatePath(routeViaJunctionGrid(nodePos, portForKey, filteredGrid));
  } else {
    path = [{ x: nodePos.x, y: nodePos.y }, { x: portForKey.x, y: portForKey.y }];
  }

  const groupPortBranch: IntraGroupCable["groupPortBranch"] = { path, edges: [...externalEdges] };
  return { groupKey, junction, branches: [], groupPortBranch };
}

/**
 * Build intra-group cables using perimeter routing.
 *
 * Each group has a single port (on the bbox face closest to graph center).
 * Wires enter at the port and travel counter-clockwise around the group's
 * bounding box perimeter. When a wire reaches the row/column of its target
 * node, it branches inward via an L-shaped Manhattan path.
 *
 * External (cross-group) edges also route from the node to the port via
 * the perimeter path.
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

  // Step 1: Collect intra-group and external edges, grouped by (group, source node)
  const groupSourceMap = new Map<string, Map<string, GraphEdge[]>>();
  const groupExternalMap = new Map<string, Map<string, GraphEdge[]>>();

  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;
    if (shouldSkipByDirection(e, cfg)) continue;
    const sid = edgeSourceId(e);
    const tid = edgeTargetId(e);
    const srcGroup = nodeClusterMap.get(sid);
    const tgtGroup = nodeClusterMap.get(tid);
    if (!srcGroup || !tgtGroup) continue;
    if (srcGroup === tgtGroup) {
      let sourceMap = groupSourceMap.get(srcGroup);
      if (!sourceMap) { sourceMap = new Map(); groupSourceMap.set(srcGroup, sourceMap); }
      let edgeList = sourceMap.get(sid);
      if (!edgeList) { edgeList = []; sourceMap.set(sid, edgeList); }
      edgeList.push(e);
    } else {
      // Cross-group — external edge (for group port wiring on BOTH sides)
      let extMap = groupExternalMap.get(srcGroup);
      if (!extMap) { extMap = new Map(); groupExternalMap.set(srcGroup, extMap); }
      let extList = extMap.get(sid);
      if (!extList) { extList = []; extMap.set(sid, extList); }
      extList.push(e);
      let tgtExtMap = groupExternalMap.get(tgtGroup);
      if (!tgtExtMap) { tgtExtMap = new Map(); groupExternalMap.set(tgtGroup, tgtExtMap); }
      let tgtExtList = tgtExtMap.get(tid);
      if (!tgtExtList) { tgtExtList = []; tgtExtMap.set(tid, tgtExtList); }
      tgtExtList.push(e);
    }
  }

  // Step 2: Pre-compute group bboxes, perimeter paths, and junction grids
  const isPolar = cfg.coordinateSystem === "polar";
  const groupPerimeters = new Map<string, GroupPerimInfo>();

  const graphCenter = _cache.graphCenter ?? computeGraphCenter(clusterCentroids);

  // Collect all group keys that need perimeter info
  const allGroupKeys = new Set<string>();
  for (const gk of groupSourceMap.keys()) allGroupKeys.add(gk);
  for (const gk of groupExternalMap.keys()) allGroupKeys.add(gk);

  for (const groupKey of allGroupKeys) {
    // Try cached bbox first
    let bbox = _cache.groupBBox.get(groupKey) ?? null;
    if (!bbox) {
      // Estimate margin from node spacing
      const positions: { x: number; y: number }[] = [];
      for (const [nid, g] of nodeClusterMap) {
        if (g !== groupKey) continue;
        const p = resolvePos(nid);
        if (p) positions.push({ x: p.x, y: p.y });
      }
      let margin = 30;
      if (positions.length >= 2) {
        let minDist = Infinity;
        for (let i = 0; i < Math.min(positions.length, 50); i++) {
          for (let j = i + 1; j < Math.min(positions.length, 50); j++) {
            const d = Math.sqrt((positions[i].x - positions[j].x) ** 2 + (positions[i].y - positions[j].y) ** 2);
            if (d > 1 && d < minDist) minDist = d;
          }
        }
        if (minDist < Infinity) margin = minDist * 0.5;
      }
      bbox = computeGroupBBox(groupKey, resolvePos, nodeClusterMap, margin);
      _cache.groupBBox.set(groupKey, bbox);
    }
    if (!bbox) continue;

    const face = computePortFace(bbox, graphCenter);
    const port = faceCenter(bbox, face);
    const perimeterPath = buildPerimeterPath(bbox, face, port);
    const grid = computeJunctionGrid(groupKey, resolvePos, nodeClusterMap);

    // For polar coordinate systems, also compute the polar junction grid
    let polarGrid: PolarJunctionGrid | undefined;
    if (isPolar) {
      const centroid = clusterCentroids.get(groupKey);
      if (centroid) {
        polarGrid = computePolarJunctionGrid(groupKey, resolvePos, nodeClusterMap, centroid);
      }
    }

    groupPerimeters.set(groupKey, { bbox, face, port, perimeterPath, grid, polarGrid });
  }

  // Step 3: Build cables with perimeter routing
  for (const [groupKey, sourceMap] of groupSourceMap) {
    const centroid = clusterCentroids.get(groupKey);
    if (!centroid) continue;
    const portForKey = groupPorts.get(groupKey);
    const perimInfo = groupPerimeters.get(groupKey);

    for (const [sourceNodeId, edgeList] of sourceMap) {
      const cable = _routeSingleIntraCable(
        sourceNodeId, edgeList, groupKey, centroid, portForKey ?? null,
        perimInfo ?? null, isPolar, resolvePos, nodeClusterMap,
        groupExternalMap, handledEdgeIds,
      );
      if (cable) cables.push(cable);
    }
  }

  // Step 4: Handle nodes that are only targets of cross-group edges
  for (const [groupKey, extNodeMap] of groupExternalMap) {
    const centroid = clusterCentroids.get(groupKey);
    if (!centroid) continue;
    const portForKey = groupPorts.get(groupKey);
    if (!portForKey) continue;

    const sourceMap = groupSourceMap.get(groupKey);
    const perimInfo = groupPerimeters.get(groupKey);

    for (const [nodeId, externalEdges] of extNodeMap) {
      if (sourceMap?.has(nodeId)) continue;

      const cable = _routeExternalOnlyNode(
        nodeId, externalEdges, groupKey, centroid, portForKey,
        perimInfo ?? null, isPolar, resolvePos,
      );
      if (cable) cables.push(cable);
    }
  }

  return { cables, handledEdgeIds };
}

/** Remove consecutive near-identical points from a path */
function deduplicatePath(path: { x: number; y: number }[]): { x: number; y: number }[] {
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

/**
 * Compute a degree-based alpha multiplier for cable wires.
 * Mirrors the fadeByDegree logic in resolveEdgeStyle for consistency.
 */
function cableFadeByDegree(edges: GraphEdge[], cfg: EdgeDrawConfig): number {
  if (!cfg.fadeByDegree || cfg.maxDegree <= 0) return 1;
  let minDeg = Infinity;
  for (const e of edges) {
    const sd = cfg.degrees.get(edgeSourceId(e)) ?? 0;
    const td = cfg.degrees.get(edgeTargetId(e)) ?? 0;
    const d = Math.min(sd, td);
    if (d < minDeg) minDeg = d;
  }
  if (minDeg === Infinity) return 1;
  const t = Math.sqrt(minDeg / cfg.maxDegree);
  return FADE_BY_DEGREE_MIN_ALPHA + (1 - FADE_BY_DEGREE_MIN_ALPHA) * t;
}

/**
 * Compute weight-based thickness bonus for cable wires.
 * Uses the max pair count among the edges in the group.
 */
function cableWeightThickness(edges: GraphEdge[], cfg: EdgeDrawConfig): number {
  if (!cfg.edgeWeightThickness || edges.length <= 1) return 0;
  // Count same source-target pairs
  const pairs = new Map<string, number>();
  for (const e of edges) {
    const k = [edgeSourceId(e), edgeTargetId(e)].sort().join(":");
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
  }
  let maxW = 1;
  for (const w of pairs.values()) { if (w > maxW) maxW = w; }
  return maxW > 1 ? Math.log2(maxW) * WEIGHT_THICKNESS_FACTOR : 0;
}

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
): void {
  for (const branch of cable.branches) {
    const colorMap = new Map<number, GraphEdge[]>();
    for (const e of branch.edges) {
      const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
      const ex = colorMap.get(c);
      if (ex) ex.push(e); else colorMap.set(c, [e]);
    }

    const nColors = colorMap.size;
    const p0 = branch.path[0], pN = branch.path[branch.path.length - 1];
    const tdx = pN.x - p0.x, tdy = pN.y - p0.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
    const perpX = tlen > 0 ? -tdy / tlen : 0;
    const perpY = tlen > 0 ? tdx / tlen : 1;

    let ci = 0;
    for (const [color, edges] of colorMap) {
      const highlight = getBranchHighlight(edges);
      // If filtering, only draw wires matching the filter
      if (filterHighlight !== null && highlight !== filterHighlight) { ci++; continue; }

      let wireAlpha = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;
      if (highlight === "bright") wireAlpha = cfg.highlightEdgeAlpha ?? 1.0;
      else if (highlight === "dim") wireAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;

      // Apply degree-based fade to cable wires (mirrors resolveEdgeStyle)
      wireAlpha *= cableFadeByDegree(edges, cfg);

      const off = nColors > 1 ? (ci - (nColors - 1) / 2) * STUB_WIRE_SPACING : 0;
      const wirePath = off === 0 ? branch.path
        : branch.path.map(p => ({ x: p.x + perpX * off, y: p.y + perpY * off }));

      const finalAlpha = highlight === "bright"
        ? wireAlpha
        : Math.max(wireAlpha * densityScale, highlight === "dim" ? 0.05 : 0.1);
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
): void {
  const gpb = cable.groupPortBranch;
  if (!gpb || gpb.edges.length === 0) return;

  const gpColorMap = new Map<number, GraphEdge[]>();
  for (const e of gpb.edges) {
    const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
    const ex = gpColorMap.get(c);
    if (ex) ex.push(e); else gpColorMap.set(c, [e]);
  }

  for (const [color, edges] of gpColorMap) {
    // Build wire path with port endpoint shifted to lane position
    const wirePath = gpb.path.map(p => ({ x: p.x, y: p.y }));
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

      const gpFinalAlpha = gpHighlight === "bright"
        ? wireAlpha
        : Math.max(wireAlpha * densityScale, 0.05);
      _drawSmoothPath(g, wirePath, wireWidth, color, gpFinalAlpha);
    } else {
      // Normal mode — draw all at base alpha
      const gpFinalAlpha = Math.max(baseA * fadeMul * densityScale, 0.1);
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

  // Highlight helper: an edge is "bright" only when the HOVERED node itself
  // is one of its endpoints (not just any highlight-set member).
  const hovId = cfg.highlightedNodeId;
  const getBranchHighlight = (branchEdges: GraphEdge[]): "normal" | "bright" | "dim" => {
    if (!hovId) return "normal";
    for (const e of branchEdges) {
      const sid = edgeSourceId(e);
      const tid = edgeTargetId(e);
      if (sid === hovId || tid === hovId) return "bright";
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
      _drawSingleIntraCableBranches(g, cable, cfg, densityScale, filterHighlight, getBranchHighlight);
    }
  };

  if (cfg.highlightedNodeId) {
    // Skip dim branch wires during hover for clean highlight visualization.
    // Dim wires (thousands of unrelated tag/category edges) create visual noise
    // that obscures the highlighted connections. Only bright (connected) wires shown.
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
        _drawSingleIntraCableGpb(g, cable, cfg, densityScale, portColorLanes, filterHL, getBranchHighlight);
      }
    };
    // Skip dim GPB wires during hover — same rationale as branch wires
    _drawGpbWires("bright");
  } else {
    for (const cable of cables) {
      _drawSingleIntraCableGpb(g, cable, cfg, densityScale, portColorLanes, null, getBranchHighlight);
    }
  }
}

// Intra-group cable cache — now stored in _cache

/**
 * Shared color→lane mapping per group port.
 * Both trunk wires and groupPortBranch wires use this for consistent lane assignment
 * AND the same perpendicular direction at the port.
 */
interface PortLaneInfo {
  colors: number[];
  /** Port coordinates */
  portX: number;
  portY: number;
  /** Shared perpendicular direction at the port (tangent to group boundary) */
  perpX: number;
  perpY: number;
}
type PortColorLanes = Map<string, PortLaneInfo>;

// Port color lanes cache — now stored in _cache

/**
 * Build a shared color→lane mapping for each group port (1 port per group).
 * Collects colors from groupPortBranch edges per group.
 * Key: groupKey (not "groupKey|dir" since there is only 1 port).
 */
function buildPortColorLanes(
  trunks: Trunk[],
  cables: { groupKey: string; groupPortBranch: { edges: GraphEdge[] } | null }[],
  cfg: EdgeDrawConfig,
  groupPorts: Map<string, GroupPort>,
): PortColorLanes {
  // Key: groupKey
  const portColors = new Map<string, Set<number>>();

  const ensure = (key: string): Set<number> => {
    let s = portColors.get(key);
    if (!s) { s = new Set(); portColors.set(key, s); }
    return s;
  };

  // Collect colors from groupPortBranch edges
  for (const cable of cables) {
    const gpb = cable.groupPortBranch;
    if (!gpb || gpb.edges.length === 0) continue;
    const s = ensure(cable.groupKey);
    for (const e of gpb.edges) {
      const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
      s.add(c);
    }
  }

  // Build PortLaneInfo with fixed endpoint coordinates per color
  const result: PortColorLanes = new Map();
  for (const [gk, colorSet] of portColors) {
    const port = groupPorts.get(gk);
    if (!port) continue;
    const colors = [...colorSet].sort((a, b) => a - b);
    result.set(gk, {
      colors,
      portX: port.x,
      portY: port.y,
      perpX: port.perpX,
      perpY: port.perpY,
    });
  }
  return result;
}

/** Compute the fixed endpoint coordinate for a given color at a group port. */
function getPortLaneEndpoint(
  info: PortLaneInfo,
  color: number,
  laneSpacing: number,
): { x: number; y: number } | null {
  const idx = info.colors.indexOf(color);
  if (idx < 0) return null;
  const nUnique = info.colors.length;
  const off = nUnique > 1 ? (idx - (nUnique - 1) / 2) * laneSpacing : 0;
  return {
    x: info.portX + info.perpX * off,
    y: info.portY + info.perpY * off,
  };
}

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
  const p0 = trunk.path[0], pN = trunk.path[trunk.path.length - 1];
  const tdx = pN.x - p0.x, tdy = pN.y - p0.y;
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

  for (let ci = 0; ci < nUnique; ci++) {
    const color = uniqueColors[ci];
    const wireEdges = colorMap.get(color)!;

    const off = (ci - (nUnique - 1) / 2) * laneSpacing;
    const ox = perpX * off, oy = perpY * off;

    // Build wire path: uniform perp offset, but snap first/last to
    // PortColorLanes endpoints so trunk and groupPortBranch couple.
    const _buildTrunkWirePath = (): { x: number; y: number }[] => {
      const wp = trunk.path.map(p => ({ x: p.x + ox, y: p.y + oy }));
      const srcEp = srcLane ? getPortLaneEndpoint(srcLane, color, laneSpacing) : null;
      const tgtEp = tgtLane ? getPortLaneEndpoint(tgtLane, color, laneSpacing) : null;
      if (srcEp) wp[0] = srcEp;
      if (tgtEp) wp[wp.length - 1] = tgtEp;
      return wp;
    };

    const fadeMul = cableFadeByDegree(wireEdges, cfg);
    const baseWireW = cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH;
    const baseWireA = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;
    const wireWidth = baseWireW + cableWeightThickness(wireEdges, cfg);

    if (cfg.highlightedNodeId) {
      // An edge is "bright" only when the HOVERED node itself is one of its endpoints.
      const hovId = cfg.highlightedNodeId;
      const brightEdges: GraphEdge[] = [];
      const dimEdges: GraphEdge[] = [];
      for (const e of wireEdges) {
        const sid = edgeSourceId(e);
        const tid = edgeTargetId(e);
        if (sid === hovId || tid === hovId) {
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
      const wireAlpha = Math.max(baseWireA * fadeMul * densityScale, 0.1);
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
  const trunkCountAlpha = trunks.length <= 5 ? 1.0
    : trunks.length <= 20 ? 0.5
    : trunks.length <= 100 ? 0.25
    : 0.12;
  for (const trunk of trunks) {
    // Use unique color count for width (merged same-color cables share a lane)
    const trunkColorSet = new Set<number>();
    for (const c of trunk.cables) trunkColorSet.add(c.color);
    const trunkWidth = Math.max(trunkColorSet.size * laneSpacing + CABLE_SCREEN_WIDTH, cfgTrunkWidth);
    if (cfgTrunkAlpha > 0) {
      const highlight = getTrunkHighlight(trunk);
      const trunkAlpha = highlight === "dim" ? 0.02 : highlight === "bright" ? 0.2 : cfgTrunkAlpha;
      _drawSmoothPath(g, trunk.path, trunkWidth, 0x888888, trunkAlpha * densityScale * trunkCountAlpha);
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
    // Skip dim trunk wires during hover for clean highlight visualization
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
// Direction bundle cache — now stored in _cache
// ---------------------------------------------------------------------------
/** Recompute bundles every Nth frame during animation (reduces cost by ~66%) */
const BUNDLE_SKIP = 3;

// Trunk bundling cache — now stored in _cache

/** Mark the direction bundle cache as stale (call when edges, visibility, or
 *  layout change significantly — e.g. toggling edge types, loading new data). */
export function invalidateBundleCache(): void {
  _cache.invalidateBundles();
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

  // Edge strength glow: scale width by target node in-degree
  if (cfg.edgeStrengthGlow && cfg.maxDegree > 0) {
    const tid = tgt.id ?? (e.target as string);
    const targetDeg = cfg.degrees.get(tid) ?? 0;
    const t = Math.min(1, targetDeg / cfg.maxDegree);
    const glowMin = cfg.edgeStrengthGlowMin ?? 0.5;
    const glowMax = cfg.edgeStrengthGlowMax ?? 3.0;
    lineThick *= glowMin + t * (glowMax - glowMin);
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
    if (roadNetwork !== _cache.roadRouteNetwork) {
      _cache.roadRoute.clear();
      _cache.roadRouteNetwork = roadNetwork;
    }
    const cacheKey = srcId < tgtId ? `${srcId}|${tgtId}` : `${tgtId}|${srcId}`;
    let waypoints = _cache.roadRoute.get(cacheKey);
    if (!waypoints) {
      waypoints = routeEdge(roadNetwork, srcId, tgtId);
      _cache.roadRoute.set(cacheKey, waypoints);
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
    const edx = tgt.x - src.x, edy = tgt.y - src.y;
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
// Pre-computation helpers (extracted from drawEdges for readability)
// ---------------------------------------------------------------------------

/** Build edge pair counts for weight-based thickness rendering. */
function buildPairCounts(edges: GraphEdge[]): Map<string, number> {
  const pairCount = new Map<string, number>();
  for (const e of edges) {
    const key = [e.source, e.target].sort().join(":");
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }
  return pairCount;
}

/** Compute direction x color bundles for highway-style edge merging (cached). */
function prepareBundles(
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): Map<string, BundleGroup> | null {
  const bundleStrength = cfg.bundleStrength;
  if (bundleStrength <= 0) return null;

  _cache.bundleFrameCount++;
  if (_cache.bundleDirty || !_cache.bundle || _cache.bundleFrameCount >= BUNDLE_SKIP) {
    _cache.bundle = buildDirectionBundles(edges, resolvePos, cfg);
    _cache.bundleDirty = false;
    _cache.bundleFrameCount = 0;
  }
  return _cache.bundle;
}

/** Compute polar center from all cluster centroids (for polar coordinate system). */
function computePolarCenter(cfg: EdgeDrawConfig): { x: number; y: number } | undefined {
  if (cfg.coordinateSystem !== "polar" || !cfg.clusterCentroids || cfg.clusterCentroids.size === 0) {
    return undefined;
  }
  let sx = 0, sy = 0;
  for (const c of cfg.clusterCentroids.values()) { sx += c.x; sy += c.y; }
  return { x: sx / cfg.clusterCentroids.size, y: sy / cfg.clusterCentroids.size };
}

/** Result of cable preparation phase. */
interface CablePrepResult {
  hasClusters: boolean;
  cabledEdgeIds: Set<string>;
  intraHandledIds: Set<string>;
}

/**
 * Prepare cable trunks and intra-group cables (cached).
 * Updates _cache.cable, _cache.intraCable, _cache.portColorLanes as needed.
 */
function prepareCables(
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): CablePrepResult {
  const clustersAvailable = !!(cfg.nodeClusterMap && cfg.clusterCentroids && cfg.clusterRadii);
  const cableMode = cfg.cableBundleMode ?? "auto";
  const hasClusters = cableMode === "never" ? false
    : cableMode === "always" ? clustersAvailable
    : clustersAvailable;

  if (!hasClusters) {
    return { hasClusters: false, cabledEdgeIds: new Set<string>(), intraHandledIds: new Set<string>() };
  }

  // Auto-invalidate when centroid count changes or on bundle skip cycle
  // (ensures cable paths update as nodes spread during simulation)
  const curCentroidCount = cfg.clusterCentroids?.size ?? 0;
  if (curCentroidCount !== _cache.cableCentroidCount) {
    _cache.cableDirty = true;
    _cache.intraCableDirty = true;
    _cache.portColorLanes = null;
    _cache.cableCentroidCount = curCentroidCount;
  }
  if (_cache.bundleFrameCount === 0) {
    _cache.cableDirty = true;
    _cache.intraCableDirty = true;
    _cache.portColorLanes = null;
  }

  const polarCenter = computePolarCenter(cfg);

  if (_cache.cableDirty || !_cache.cable) {
    // Pre-compute group ports for buildTrunks
    const centroids = cfg.clusterCentroids!;
    const radii = cfg.clusterRadii!;
    const groupKeys = new Set(cfg.nodeClusterMap!.values());
    // Build connection map from edges (which groups connect to which)
    const connections = new Map<string, Set<string>>();
    for (const e of edges) {
      if (shouldSkipEdge(e, cfg)) continue;
      if (shouldSkipByDirection(e, cfg)) continue;
      const sg = cfg.nodeClusterMap!.get(edgeSourceId(e));
      const tg = cfg.nodeClusterMap!.get(edgeTargetId(e));
      if (!sg || !tg || sg === tg) continue;
      if (!connections.has(sg)) connections.set(sg, new Set());
      if (!connections.has(tg)) connections.set(tg, new Set());
      connections.get(sg)!.add(tg);
      connections.get(tg)!.add(sg);
    }
    _cache.groupBBox.clear(); // clear bbox cache when recomputing ports
    const allGroupPorts = computeGroupPorts(groupKeys, centroids, radii, connections, cfg.coordinateSystem, polarCenter, resolvePos, cfg.nodeClusterMap ?? undefined);
    _cache.cachedGroupPorts = allGroupPorts;
    _cache.cable = buildTrunks(edges, resolvePos, cfg, allGroupPorts);
    _cache.cableDirty = false;
  }

  const cabledEdgeIds = _cache.cable.cabledEdgeIds;

  // Intra-group cable wiring
  let intraHandledIds = new Set<string>();
  if (_cache.cable) {
    if (_cache.intraCableDirty || !_cache.intraCable) {
      // Compute group ports for intra-group cables
      if (!_cache.cachedGroupPorts) {
        const centroids = cfg.clusterCentroids!;
        const radii = cfg.clusterRadii!;
        const connections = new Map<string, Set<string>>();
        for (const trunk of _cache.cable.trunks) {
          if (!connections.has(trunk.srcGroup)) connections.set(trunk.srcGroup, new Set());
          if (!connections.has(trunk.tgtGroup)) connections.set(trunk.tgtGroup, new Set());
          connections.get(trunk.srcGroup)!.add(trunk.tgtGroup);
          connections.get(trunk.tgtGroup)!.add(trunk.srcGroup);
        }
        const groupKeys = new Set(cfg.nodeClusterMap!.values());
        const pc = computePolarCenter(cfg);
        _cache.cachedGroupPorts = computeGroupPorts(groupKeys, centroids, radii, connections, cfg.coordinateSystem, pc, resolvePos, cfg.nodeClusterMap ?? undefined);
      }
      _cache.intraCable = buildIntraGroupCables(edges, resolvePos, cfg, _cache.cachedGroupPorts);
      _cache.intraCableDirty = false;
      _cache.portColorLanes = null; // invalidate shared mapping
    }

    // Build shared port color lane mapping (after both caches are ready)
    if (!_cache.portColorLanes && _cache.cachedGroupPorts) {
      _cache.portColorLanes = buildPortColorLanes(
        _cache.cable.trunks, _cache.intraCable.cables, cfg, _cache.cachedGroupPorts,
      );
    }

    intraHandledIds = _cache.intraCable.handledEdgeIds;
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
): void {
  if (cablePrep.hasClusters && _cache.cable) {
    // Draw all cable wires. When highlighting, drawTrunks and drawIntraGroupCables
    // internally do 2-pass (dim first, bright on top) for z-order.
    if (_cache.cable.trunks.length > 0) {
      drawTrunks(g, _cache.cable.trunks, cfg, densityScale, _cache.portColorLanes);
    }
    if (_cache.intraCable && _cache.intraCable.cables.length > 0) {
      drawIntraGroupCables(g, _cache.intraCable.cables, cfg, densityScale, _cache.portColorLanes);
    }
    // Final bright pass: redraw bright trunk wires on top of everything
    if (cfg.highlightedNodeId && _cache.cable.trunks.length > 0) {
      drawTrunks(g, _cache.cable.trunks, cfg, densityScale, _cache.portColorLanes, "bright");
    }
  } else if (_cache.cable && _cache.cable.trunks.length > 0) {
    drawTrunks(g, _cache.cable.trunks, cfg, densityScale);
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
): void {
  g.clear();
  if (arrowGfx) arrowGfx.clear();

  // Pre-compute bidirectional set if direction filter or indicator is active
  const needsBidir = (cfg.edgeDirectionFilter && cfg.edgeDirectionFilter !== "all") || cfg.showBidirectionalIndicator;
  cfg._bidirectionalSet = needsBidir ? buildBidirectionalSet(edges) : undefined;

  const { colorEdgesByRelation: useRelColor } = cfg;
  // Disable arc curves when edge count is high to avoid vertex buffer explosion.
  // quadraticCurveTo generates ~20 vertices per edge vs 4 for lineTo.
  const isArcLayout = cfg.isArcLayout && edges.length < ARC_MAX_EDGE_COUNT;

  const edgeCount = cfg.totalEdgeCount ?? edges.length;
  const densityScale = computeDensityScale(cfg, edgeCount);

  // Pre-compute edge pair counts for weight-based thickness
  const pairCount = cfg.edgeWeightThickness ? buildPairCounts(edges) : null;

  // Pre-compute direction x color bundles for highway-style edge merging
  const bundles = prepareBundles(edges, resolvePos, cfg);
  const bundleStrength = cfg.bundleStrength;

  // Cable trunks and intra-group cables
  const cablePrep = prepareCables(edges, resolvePos, cfg);
  drawCables(g, cfg, densityScale, cablePrep);

  // レイヤー分離モード: 種別ごとに描画パスを分けて z-order を制御
  if (cfg.edgeLayerMode) {
    _drawEdgesLayered(g, edges, resolvePos, cfg, useRelColor, isArcLayout,
      densityScale, pairCount, bundles, bundleStrength, cablePrep, arrowGfx);
  } else {
    _drawEdgesSinglePass(g, edges, resolvePos, cfg, useRelColor, isArcLayout,
      densityScale, pairCount, bundles, bundleStrength, cablePrep, arrowGfx);
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
): void {
  let _dbgLeaked = 0;
  for (const e of edges) {
    if (cablePrep.cabledEdgeIds.has(e.id)) continue;
    if (cablePrep.intraHandledIds.has(e.id)) continue;
    if (shouldSkipEdge(e, cfg)) continue;
    if (shouldSkipByDirection(e, cfg)) continue;

    const src = resolvePos(e.source);
    const tgt = resolvePos(e.target);
    if (!src || !tgt) continue;

    if (cablePrep.hasClusters) {
      _dbgLeaked++;
      continue;
    }

    const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
    let { alpha, lineThick } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);

    // Bidirectional indicator: subtly adjust thickness and alpha
    if (cfg.showBidirectionalIndicator && cfg._bidirectionalSet) {
      const isBidir = cfg._bidirectionalSet.has(`${e.source}→${e.target}`);
      if (isBidir) {
        lineThick *= 1.5;
        alpha = Math.min(1.0, alpha + 0.2);
      } else {
        alpha = Math.max(0.05, alpha - 0.15);
      }
    }

    g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
    const hasDash = applyDashPattern(g, e, lineThick);

    drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength, cfg.roadNetwork);
    drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);

    if (hasDash) g.setLineDash([]);
  }
}

// ---------------------------------------------------------------------------
// レイヤー分離描画 — 種別ごとに描画パスを分け、alpha/width を微調整
// ---------------------------------------------------------------------------

/** レイヤー描画順序 (下層 → 上層): 薄いものを先に、重要なものを後に描画 */
const EDGE_LAYER_ORDER: readonly (string | undefined)[] = [
  EDGE_TYPE_SIMILAR,     // 最下層: 類似エッジ (最も薄い)
  EDGE_TYPE_TAG,         // 共有タグ
  EDGE_TYPE_HAS_TAG,     // has-tag
  "category",            // 共有カテゴリ
  "semantic",            // 意味関係
  EDGE_TYPE_SIBLING,     // 兄弟
  EDGE_TYPE_SEQUENCE,    // 順序
  EDGE_TYPE_AGGREGATION, // 集約
  EDGE_TYPE_INHERITANCE, // 継承
  EDGE_TYPE_LINK,        // 最上層: wikilink (最も重要)
  undefined,             // type未設定のフォールバック
];

/** レイヤーごとの alpha 乗数 (下層ほど薄い) */
const LAYER_ALPHA_MULTIPLIERS: readonly number[] = [
  0.50, // similar
  0.60, // tag
  0.60, // has-tag
  0.65, // category
  0.70, // semantic
  0.75, // sibling
  0.80, // sequence
  0.85, // aggregation
  0.90, // inheritance
  1.00, // link
  0.70, // undefined/other
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
): void {
  // レイヤー順にエッジを描画
  for (let li = 0; li < EDGE_LAYER_ORDER.length; li++) {
    const layerType = EDGE_LAYER_ORDER[li];
    const alphaMul = LAYER_ALPHA_MULTIPLIERS[li];
    const widthOff = LAYER_WIDTH_OFFSETS[li];

    for (const e of edges) {
      // このレイヤーに属さないエッジはスキップ
      if ((e.type ?? undefined) !== layerType) continue;

      if (cablePrep.cabledEdgeIds.has(e.id)) continue;
      if (cablePrep.intraHandledIds.has(e.id)) continue;
      if (shouldSkipEdge(e, cfg)) continue;
      if (shouldSkipByDirection(e, cfg)) continue;

      const src = resolvePos(e.source);
      const tgt = resolvePos(e.target);
      if (!src || !tgt) continue;

      if (cablePrep.hasClusters) continue;

      const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
      let { alpha, lineThick } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);

      // Bidirectional indicator: subtly adjust thickness and alpha
      if (cfg.showBidirectionalIndicator && cfg._bidirectionalSet) {
        const isBidir = cfg._bidirectionalSet.has(`${e.source}→${e.target}`);
        if (isBidir) {
          lineThick *= 1.5;
          alpha = Math.min(1.0, alpha + 0.2);
        } else {
          alpha = Math.max(0.05, alpha - 0.15);
        }
      }

      // レイヤーごとに alpha と width を微調整
      const layerAlpha = alpha * alphaMul;
      const layerWidth = Math.max(0.5, lineThick + widthOff);

      g.lineStyle({ width: layerWidth, color: lineColor, alpha: layerAlpha, native: true });
      const hasDash = applyDashPattern(g, e, layerWidth);

      drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength, cfg.roadNetwork);
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

  if (!cfg.showEdgeLabels && !cfg.showEdgeWeightLabels && !cfg.showEdgeCardinalityLabels) return;

  // --- エッジ重みラベル: 同一ペア間のエッジ本数を表示 ---
  if (cfg.showEdgeWeightLabels) {
    const pairCounts = buildPairCounts(edges);
    // ペアごとに1回だけラベルを描く（重複除外セット）
    const drawnPairs = new Set<string>();
    const fillColor = cfg.isDark ? 0xcccccc : 0x444444;
    for (const e of edges) {
      if (shouldSkipEdge(e, cfg)) continue;
      if (shouldSkipByDirection(e, cfg)) continue;
      const key = [e.source, e.target].sort().join(":");
      const count = pairCounts.get(key) ?? 1;
      if (count <= 1 || drawnPairs.has(key)) continue;
      drawnPairs.add(key);
      const sp = resolvePos(e.source);
      const tp = resolvePos(e.target);
      if (!sp || !tp) continue;
      const mx = (sp.x + tp.x) / 2;
      const my = (sp.y + tp.y) / 2;
      // 重みラベルは関係ラベルと重ならないようオフセット
      const offsetY = cfg.showEdgeLabels ? -10 : 0;
      const text = new CanvasText(String(count), {
        fontSize: EDGE_LABEL_FONT_SIZE,
        fill: fillColor,
        fontFamily: "sans-serif",
        fontWeight: "bold",
      });
      text.anchor.set(0.5, 0.5);
      text.x = mx;
      text.y = my + offsetY;
      text.alpha = EDGE_LABEL_ALPHA;
      text.resolution = EDGE_LABEL_RESOLUTION;
      container.addChild(text);
    }
  }

  // --- エッジ多重度ラベル: 同一ペア間のエッジ本数を表示 (showEdgeWeightLabelsと排他) ---
  if (cfg.showEdgeCardinalityLabels && !cfg.showEdgeWeightLabels) {
    const pairCounts = buildPairCounts(edges);
    const drawnPairs = new Set<string>();
    const fillColor = cfg.isDark ? 0xcccccc : 0x444444;
    for (const e of edges) {
      if (shouldSkipEdge(e, cfg)) continue;
      if (shouldSkipByDirection(e, cfg)) continue;
      const key = [e.source, e.target].sort().join(":");
      const count = pairCounts.get(key) ?? 1;
      if (count <= 1 || drawnPairs.has(key)) continue;
      drawnPairs.add(key);
      const sp = resolvePos(e.source);
      const tp = resolvePos(e.target);
      if (!sp || !tp) continue;
      const mx = (sp.x + tp.x) / 2;
      const my = (sp.y + tp.y) / 2;
      const offsetY = cfg.showEdgeLabels ? -10 : 0;
      const text = new CanvasText(String(count), {
        fontSize: 10,
        fill: fillColor,
        fontFamily: "sans-serif",
        fontWeight: "bold",
      });
      text.anchor.set(0.5, 0.5);
      text.x = mx;
      text.y = my + offsetY;
      text.alpha = EDGE_LABEL_ALPHA;
      text.resolution = EDGE_LABEL_RESOLUTION;
      container.addChild(text);
    }
  }

  // --- 通常のエッジラベル（関係名/種別名） ---
  if (!cfg.showEdgeLabels) return;

  // Collect labelable edges (skip hidden types and those without a label)
  const labelable: { edge: GraphEdge; label: string }[] = [];
  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;
    if (shouldSkipByDirection(e, cfg)) continue;
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
  const placement = cfg.edgeLabelPlacement ?? "center";
  const PERPENDICULAR_OFFSET = 8;
  // For "smart" mode: track placed label bounding boxes to avoid collisions
  const placedRects: { x: number; y: number; hw: number; hh: number }[] = [];
  const SMART_LABEL_HW = 25; // estimated half-width of a label
  const SMART_LABEL_HH = 7;  // estimated half-height of a label
  const SMART_SHIFT_STEP = 12; // shift distance per collision attempt
  const SMART_MAX_SHIFTS = 4;  // maximum shift attempts

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
      fontSize: EDGE_LABEL_FONT_SIZE,
      fill: fillColor,
      fontFamily: "sans-serif",
    });
    text.anchor.set(0.5, 0.5);
    text.x = labelX;
    text.y = labelY;
    text.alpha = EDGE_LABEL_ALPHA;
    text.resolution = EDGE_LABEL_RESOLUTION;

    container.addChild(text);
  }
}
