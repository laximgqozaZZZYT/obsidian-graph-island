import * as PIXI from "pixi.js";
import type { GraphEdge } from "../types";
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
function defaultColor(isDark: boolean) { return isDark ? 0x555555 : 0xbbbbbb; }
function highlightColor(isDark: boolean) { return isDark ? 0x888888 : 0x666666; }
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
function buildDirectionBundles(
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): Map<string, BundleGroup> {
  const accum = new Map<string, BundleAccum>();

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

  const result = new Map<string, BundleGroup>();
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
    const colorEntries = [...pair.byColor.entries()]; // [color, edges[]]
    if (colorEntries.length === 0) continue;
    // Single edge total: draw normally
    const totalEdges = colorEntries.reduce((s, [, es]) => s + es.length, 0);
    if (totalEdges < 2) continue;

    const totalCables = Math.ceil(colorEntries.length / MAX_CABLE_COLORS);
    for (let ci = 0; ci < totalCables; ci++) {
      const colorChunk = colorEntries.slice(ci * MAX_CABLE_COLORS, (ci + 1) * MAX_CABLE_COLORS);
      const lanes: CableLane[] = colorChunk.map(([color, edges]) => ({ color, edges }));
      const allEdges = lanes.flatMap(l => l.edges);
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
  const cableSpacing = 4;
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
  g: PIXI.Graphics,
  cables: Cable[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
  densityScale: number,
): void {
  const { clusterCentroids: centroids, clusterRadii: radii } = cfg;
  if (!centroids || !radii) return;

  for (const cable of cables) {
    const layout = computeCableLayout(cable, centroids, radii);
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
      let trunkWidth = 2;
      let trunkAlpha = 0.85;

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

      g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha, native: true });
      g.moveTo(ts.x, ts.y);
      g.lineTo(te.x, te.y);

      // --- Fan lines: thin, low-alpha lines from nodes to trunk endpoints ---
      // Scale alpha down with edge count so dense fans don't overwhelm
      const fanCount = lane.edges.length;
      const fanAlpha = Math.min(0.25, 3.0 / fanCount) * densityScale;

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

        g.lineStyle({ width: 0.5, color: lane.color, alpha, native: true });

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
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw all edges into a single PIXI.Graphics batch.
 *
 * @param g          - The PIXI.Graphics to draw into (will be cleared first)
 * @param edges      - The graph edges to draw
 * @param resolvePos - Resolves a source/target reference to a position
 * @param cfg        - Drawing configuration
 */
export function drawEdges(
  g: PIXI.Graphics,
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): void {
  g.clear();

  const { highlightedNodeId: hId, colorEdgesByRelation: useRelColor } = cfg;
  // Disable arc curves when edge count is high to avoid vertex buffer explosion.
  // quadraticCurveTo generates ~20 vertices per edge vs 4 for lineTo.
  const isArcLayout = cfg.isArcLayout && edges.length < 500;

  // Scale base alpha inversely with edge density to keep the graph readable.
  // <100 edges: full alpha; 100–1000: gentle fade; 1000+: aggressive fade.
  const edgeCount = cfg.totalEdgeCount ?? edges.length;
  const densityScale = edgeCount <= 100 ? 1
    : edgeCount <= 500 ? 1 - 0.35 * ((edgeCount - 100) / 400)
    : edgeCount <= 2000 ? 0.65 - 0.35 * ((edgeCount - 500) / 1500)
    : 0.3;

  // Pre-compute direction×color bundles for highway-style edge merging
  const β = cfg.bundleStrength;
  const bundles = β > 0 ? buildDirectionBundles(edges, resolvePos, cfg) : null;

  // Cable bundling: group inter-cluster edges into cables
  const hasClusters = cfg.nodeClusterMap && cfg.clusterCentroids && cfg.clusterRadii;
  const { cables, cabledEdgeIds } = hasClusters
    ? buildCables(edges, resolvePos, cfg)
    : { cables: [] as Cable[], cabledEdgeIds: new Set<string>() };

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
    let lineThick = 1;

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
        lineThick = 1.5;
        alpha = 1;
        if (!isOnto && !e.relation) {
          // Keep lineColor from resolveEdgeColor — don't override to HIGHLIGHT_COLOR
          // so bundled highlight edges still group by their original color
        }
      } else {
        alpha = 0.08;
      }
    }

    g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });

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
  g: PIXI.Graphics,
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
  g: PIXI.Graphics,
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
 * Draw text labels on edges into a dedicated PIXI.Container.
 *
 * Labels are placed at the midpoint of each edge.  When the total number of
 * labelable edges exceeds MAX_EDGE_LABELS the labels are skipped entirely to
 * avoid performance degradation from excessive PIXI.Text objects.
 */
export function drawEdgeLabels(
  container: PIXI.Container,
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): void {
  // Remove all previous labels
  container.removeChildren();

  if (!cfg.showEdgeLabels) return;

  // Collect labelable edges (skip hidden types and those without a label)
  const labelable: { edge: GraphEdge; label: string }[] = [];
  for (const e of edges) {
    if (shouldSkipEdge(e, cfg)) continue;
    const label = getEdgeLabel(e);
    if (!label) continue;
    labelable.push({ edge: e, label });
  }

  // Performance guard: skip labels when there are too many
  if (labelable.length > MAX_EDGE_LABELS) return;

  const fillColor = cfg.isDark ? 0xcccccc : 0x444444;

  for (const { edge: e, label } of labelable) {
    const sp = resolvePos(e.source);
    const tp = resolvePos(e.target);
    if (!sp || !tp) continue;

    // Place label at edge midpoint
    const mx = (sp.x + tp.x) / 2;
    const my = (sp.y + tp.y) / 2;

    const text = new PIXI.Text(label, {
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
