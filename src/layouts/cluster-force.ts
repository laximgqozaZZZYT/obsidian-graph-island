/**
 * Cluster arrangement force for the Force layout.
 *
 * Groups nodes by a chosen criterion, assigns each group a fixed position,
 * then arranges nodes within each group according to the chosen pattern.
 *
 * Inter-group placement:
 *  - others: circle around canvas center
 *
 * Intra-group arrangement:
 *  - concentric: concentric rings, radius ∝ group node count
 *  - grid: m×n grid sorted by degree
 *  - random: seeded scatter with collision avoidance
 *
 * Two independent controls:
 *  - nodeSpacing: minimum gap between adjacent nodes (nodeRadius × n)
 *  - groupScale: overall pattern size (arm gap, ring increment, layer height)
 *
 * Uses ABSOLUTE target positions and aggressive position blending with
 * full velocity kill to guarantee visibility.
 */
import type { GraphNode, GraphEdge, ClusterArrangement, ClusterGroupRule, CoordinateLayout } from "../types";
import { getNodeFieldValues } from "../utils/node-grouping";
import { computeBBoxWithCentroid, magnitude } from "../utils/geometry";
import { resolveArrangementFromLayout, isExactPreset, ARRANGEMENT_PRESETS } from "./coordinate-presets";
import { coordinateOffsets, type CoordinateGuide, type CoordinateContext } from "./coordinate-engine";
import {
  ARRANGEMENT_CONCENTRIC, ARRANGEMENT_TIMELINE, ARRANGEMENT_TRIANGLE,
  ARRANGEMENT_GRID, ARRANGEMENT_RADIAL, ARRANGEMENT_RANDOM,
  ARRANGEMENT_PHYLLOTAXIS, ARRANGEMENT_CUSTOM, ARRANGEMENT_EGO,
  EDGE_TYPE_INHERITANCE, EDGE_TYPE_AGGREGATION, EDGE_TYPE_SIMILAR, EDGE_TYPE_SIBLING,
  GUIDE_TYPE_COORDINATE,
  GROUP_ARRANGEMENT_CONCENTRIC, GROUP_ARRANGEMENT_HORIZONTAL,
  GROUP_ARRANGEMENT_VERTICAL, GROUP_ARRANGEMENT_GRID,
} from "../constants";
import { timelineOffsetsV2 } from "./timeline-layout";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ArrangementResult — unified return type from all *Offsets() functions
// ---------------------------------------------------------------------------

/** Guide data for timeline arrangement */
interface TimelineGuide {
  type: "timeline";
  axisY: number;
  ticks: { x: number; label: string }[];
}

/** Guide data for grid arrangement */
interface GridGuide {
  type: "grid";
  verticals: number[];
  horizontals: number[];
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number };
}

/** Guide data for triangle arrangement */
export interface TriangleGuide {
  type: "triangle";
  vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
}

/** Guide data for concentric arrangement */
export interface ConcentricGuide {
  type: "concentric";
  rings: number[];  // radius of each ring
}

export type ArrangementGuide =
  | TimelineGuide
  | GridGuide
  | TriangleGuide
  | ConcentricGuide
  | CoordinateGuide;

/** Duration bar info for timeline nodes with start+end dates */
export interface TimelineBarInfo {
  nodeId: string;
  xStart: number;
  xEnd: number;
  barHeight: number;
  yCenter: number;
}

/** Unified result from intra-group arrangement functions */
export interface ArrangementResult {
  offsets: Map<string, { dx: number; dy: number }>;
  guide?: ArrangementGuide;
  bars?: TimelineBarInfo[];
  /** Synthetic sequence edges connecting temporally adjacent nodes */
  sequenceEdges?: GraphEdge[];
  /** Per-node ring radius (relative to group center) for concentric projection */
  ringAssignments?: Map<string, number>;
  /** Ordered node chains from next/prev link relationships (each array = one chain in order) */
  nodeChains?: string[][];
}

/** Per-group route data for transit map rendering */
export interface TimelineRoute {
  groupKey: string;
  /** Nodes in time order, with their final world positions */
  waypoints: Array<{ nodeId: string; x: number; y: number }>;
}

/** Metadata about cluster assignments, exposed for edge bundling. */
/** Per-group guide entry — associates arrangement guide data with group center */
export interface GroupGuideEntry {
  guide: ArrangementGuide;
  centerX: number;
  centerY: number;
  /** Group key — used to re-align guide centers after overlap resolution */
  groupKey?: string;
}

export interface ClusterMetadata {
  /** Maps node ID → cluster group key */
  nodeClusterMap: Map<string, string>;
  /** Maps cluster group key → target center position */
  clusterCentroids: Map<string, { x: number; y: number }>;
  /** Maps cluster group key → estimated visual radius */
  clusterRadii: Map<string, number>;
  /** Timeline bar data (only set for timeline arrangement with duration bars) */
  timelineBars?: TimelineBarInfo[];
  /** Synthetic sequence edges generated from timeline ordering */
  sequenceEdges?: GraphEdge[];
  /** Per-group route data for transit map rendering */
  timelineRoutes?: TimelineRoute[];
  /** Per-group arrangement guide data (grid lines, rings, etc.) for road network generation */
  groupGuides?: GroupGuideEntry[];
}

/** Result of buildClusterForce: force function + cluster metadata for bundling. */
export interface ClusterForceResult {
  force: (alpha: number) => void;
  metadata: ClusterMetadata;
}

export interface ClusterForceConfig {
  groupRules: ClusterGroupRule[];
  arrangement: ClusterArrangement;
  /** Canvas center X */
  centerX: number;
  /** Canvas center Y */
  centerY: number;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Base node size (panel.nodeSize) — used to compute visual radius */
  nodeSize: number;
  /** Node spacing = nodeSize × 2 × this multiplier (default 3.0) */
  nodeSpacing: number;
  /** Pattern scale — controls overall group footprint (spiral arm gap,
   *  ring increment, etc.) independently of nodeSpacing (default 1.0) */
  groupScale: number;
  /** Group spacing multiplier (default 2.0) */
  groupSpacing: number;
  /** When enclosure mode is active, tag membership map for separation */
  tagMembership?: Map<string, Set<string>>;
  /** Enclosure spacing multiplier (default 1.5) */
  enclosureSpacing?: number;
  /** Custom comparator for node sort order within each group */
  sortComparator?: (a: GraphNode, b: GraphNode) => number;
  /** Per-node spacing multiplier from NodeRules */
  nodeSpacingMap?: Map<string, number>;
  /** Frontmatter key for timeline arrangement (e.g. "date", "era") */
  timelineKey?: string;
  /** Frontmatter key for timeline end date (e.g. "end-date") */
  timelineEndKey?: string;
  /** Comma-separated order fields for link-based ordering (derived from ontology sequence/reverse fields + hierarchy fields) */
  timelineOrderFields?: string;
  /** Ontology sequence fields (forward direction, e.g. ["next"]) — used by chain ordering */
  sequenceFields?: string[];
  /** Ontology reverse sequence fields (e.g. ["prev", "previous"]) — used by chain ordering */
  reverseSequenceFields?: string[];
  /** Accessor for node frontmatter values (for timeline arrangement) */
  getNodeProperty?: (nodeId: string, key: string) => string | undefined;
  /** Resolved coordinate layout configuration */
  coordinateLayout?: CoordinateLayout;
  /** User-defined constants from coordinateLayout (includes _blend, _overlapPad, _minGap) */
  userConstants?: Record<string, number>;
  /** Inter-group layout strategy — preset by arrangement pattern.
   *  "circle" (default): groups on a circle.
   *  "horizontal": groups in a line.
   *  "concentric": groups on concentric rings.
   *  "vertical": groups stacked vertically (timeline). */
  groupLayoutMode?: "circle" | "horizontal" | "concentric" | "vertical" | "grid";
  /** Skip inter-group overlap resolution (preset by arrangements like
   *  timeline that handle spacing internally) */
  skipGroupOverlap?: boolean;
  /** Total number of nodes across all groups (exposed as built-in variable N in expressions) */
  totalNodeCount?: number;
  /** Maximum node radius in world units (0 = unlimited, default 60) */
  maxNodeRadius?: number;
  /** Minimum node radius in world units (default 3). Prevents nodes from
   *  becoming too small to hover/click. */
  minNodeRadius?: number;
  /** Panel repelForce — used for adaptive blend */
  repelForce?: number;
  /** Subset of RenderThresholds for blend/layout tuning */
  blendConfig?: {
    clusterBlendDefault?: number;
    clusterBlendDecayFactor?: number;
  };
  /** Label spacing factor (0–1) — fraction of estimated label width added
   *  to node gaps during layout.  0 = ignore labels (legacy), 1 = full. */
  labelSpacingFactor?: number;
  /** Min font size for node labels (for label extent estimation) */
  nodeLabelFontSizeMin?: number;
  /** Max font size for node labels (for label extent estimation) */
  nodeLabelFontSizeMax?: number;
  /** Normalize spread across arrangement patterns so nodes appear the same
   *  screen size after autoFitView (default true). */
  normalizeArrangementSpread?: boolean;
  /** Metadata field to sub-group orphan nodes by (e.g. "category", "folder", "tag").
   *  Empty string = disabled. */
  orphanClusterField?: string;
  /** C4: Manual cluster overrides (nodeId → groupKey) */
  manualClusterOverrides?: Record<string, string>;
}

/**
 * Build a d3-compatible force function for cluster arrangement.
 * Returns null if groupRules is empty.
 * Also returns ClusterMetadata for edge bundling.
 */
/**
 * Post-process targets to resolve pairwise group overlaps.
 * For each overlapping group pair, push them apart along the line connecting their centers.
 * Also shifts all member node targets accordingly.
 */
function resolveGroupOverlaps(
  targets: Map<string, { x: number; y: number }>,
  groups: Map<string, GraphNode[]>,
  clusterRadii: Map<string, number>,
  clusterCentroids: Map<string, { x: number; y: number }>,
  nodeSize: number,
  degrees: Map<string, number>,
  overlapPad: number = 1.3,
  groupLabelPad: number = 0,
): void {
  const keys = [...groups.keys()];
  if (keys.length < 2) return;

  // Compute actual radii from target positions (more accurate than estimateGroupRadius)
  const actualRadii = new Map<string, number>();
  for (const key of keys) {
    const members = groups.get(key);
    const centroid = clusterCentroids.get(key);
    if (!members || !centroid) continue;
    let maxDist = 0;
    for (const m of members) {
      const t = targets.get(m.id);
      if (!t) continue;
      // Use effectiveRadius for super nodes (collapsed groups) to prevent overlap
      const r = effectiveRadius(m, nodeSize, degrees.get(m.id) ?? 0);
      const d = magnitude(t.x - centroid.x, t.y - centroid.y) + r;
      if (d > maxDist) maxDist = d;
    }
    const estimated = clusterRadii.get(key) ?? 0;
    // Add group label padding to account for label placed outside the hull
    const effective = Math.max(estimated, maxDist) + groupLabelPad;
    actualRadii.set(key, effective);
    clusterRadii.set(key, effective);
  }

  const maxIter = Math.max(5, Math.min(keys.length, 15));
  for (let iter = 0; iter < maxIter; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const kA = keys[i];
        const kB = keys[j];
        const cA = clusterCentroids.get(kA);
        const cB = clusterCentroids.get(kB);
        if (!cA || !cB) continue;

        const rA = actualRadii.get(kA) ?? 0;
        const rB = actualRadii.get(kB) ?? 0;
        if (rA < 1 || rB < 1) continue;

        const dx = cB.x - cA.x;
        const dy = cB.y - cA.y;
        const dist = magnitude(dx, dy);
        const minDist = (rA + rB) * overlapPad;

        if (dist >= minDist) continue;
        anyOverlap = true;

        // Asymmetric push: smaller group moves more than larger group
        const overlap = minDist - dist;
        const totalR = rA + rB;
        // Weight inversely proportional to radius — small group gets pushed more
        const wB = totalR > 0 ? rA / totalR : 0.5; // wB is fraction B moves
        const wA = 1 - wB;                          // wA is fraction A moves

        const nx = dist > 0.01 ? dx / dist : 1;
        const ny = dist > 0.01 ? dy / dist : 0;

        const shiftAx = -nx * overlap * wA;
        const shiftAy = -ny * overlap * wA;
        const shiftBx = nx * overlap * wB;
        const shiftBy = ny * overlap * wB;

        // Update centroids
        cA.x += shiftAx;
        cA.y += shiftAy;
        cB.x += shiftBx;
        cB.y += shiftBy;

        // Shift all member targets
        const membersA = groups.get(kA);
        const membersB = groups.get(kB);
        if (membersA) {
          for (const m of membersA) {
            const t = targets.get(m.id);
            if (t) { t.x += shiftAx; t.y += shiftAy; }
          }
        }
        if (membersB) {
          for (const m of membersB) {
            const t = targets.get(m.id);
            if (t) { t.x += shiftBx; t.y += shiftBy; }
          }
        }
      }
    }

    if (!anyOverlap) break;
  }
}

/**
 * Post-expression minimum gap correction.
 * For each group, find node pairs closer than minGap and push them apart.
 * Uses up to 3 iterations of pairwise repulsion.
 */
function resolveIntraGroupGaps(
  targets: Map<string, { x: number; y: number }>,
  groups: Map<string, GraphNode[]>,
  minGap: number,
  nodeSize: number,
  degrees: Map<string, number>,
  maxNodeRadius = 60,
  minNodeRadius = 8,
  labelSpacingFactor = 0,
  fontMin = 11,
  fontMax = 14,
): void {
  if (minGap <= 0) return;

  // Pre-compute max degree across all nodes for label extent estimation
  let maxDeg = 0;
  if (labelSpacingFactor > 0) {
    for (const d of degrees.values()) { if (d > maxDeg) maxDeg = d; }
  }

  const effR = (n: GraphNode) => effectiveRadius(n, nodeSize, degrees.get(n.id) ?? 0, maxNodeRadius, minNodeRadius);
  const labelExt = (n: GraphNode) => labelSpacingFactor > 0
    ? estimateLabelExtent(n, nodeSize, degrees.get(n.id) ?? 0, maxDeg, labelSpacingFactor, fontMin, fontMax)
    : 0;

  for (const [, members] of groups) {
    if (members.length < 2) continue;

    for (let iter = 0; iter < 3; iter++) {
      let anyPush = false;
      for (let i = 0; i < members.length; i++) {
        const ti = targets.get(members[i].id);
        if (!ti) continue;
        const ri = effR(members[i]) + labelExt(members[i]);

        for (let j = i + 1; j < members.length; j++) {
          const tj = targets.get(members[j].id);
          if (!tj) continue;
          const rj = effR(members[j]) + labelExt(members[j]);

          const dx = tj.x - ti.x;
          const dy = tj.y - ti.y;
          const dist = magnitude(dx, dy);
          const required = ri + rj + minGap;

          if (dist >= required) continue;
          anyPush = true;

          const overlap = required - dist;
          const nx = dist > 0.01 ? dx / dist : 1;
          const ny = dist > 0.01 ? dy / dist : 0;
          const half = overlap / 2;

          ti.x -= nx * half;
          ti.y -= ny * half;
          tj.x += nx * half;
          tj.y += ny * half;
        }
      }
      if (!anyPush) break;
    }
  }
}

export function buildClusterForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): ClusterForceResult | null {
  // perGroup=false layouts (concentric) compute offsets across all nodes
  // regardless of grouping — they still need the force to run even without group rules.
  const isGlobalLayout = cfg.coordinateLayout && !cfg.coordinateLayout.perGroup;
  // Hardcoded arrangements (timeline, etc.) need layout even without group
  // rules — they'll operate on the single "__all__" group created below.
  // Also include all coordinate-preset arrangements (grid, triangle, phyllotaxis, custom)
  // which have perGroup=true and therefore do not satisfy isGlobalLayout, but still
  // need the force to run so nodes spread out from their initial center position.
  const NEEDS_LAYOUT = new Set([ARRANGEMENT_CONCENTRIC, ARRANGEMENT_RADIAL, ARRANGEMENT_RANDOM, ARRANGEMENT_TIMELINE, ARRANGEMENT_GRID, ARRANGEMENT_TRIANGLE, ARRANGEMENT_PHYLLOTAXIS, ARRANGEMENT_CUSTOM]);
  if (cfg.groupRules.length === 0 && !isGlobalLayout && !NEEDS_LAYOUT.has(cfg.arrangement) && !cfg.orphanClusterField) return null;

  // Phase 1: Group subdivision
  let groups = applyAllGroupRules(nodes, edges, degrees, cfg.groupRules);
  if (groups.size === 0) return null;

  // Phase 1b: Orphan sub-grouping — partition orphan nodes by metadata field
  if (cfg.orphanClusterField) {
    groups = subGroupOrphans(groups, degrees, cfg.orphanClusterField);
  }

  // Phase 1c: C4 Manual cluster overrides — move nodes between groups
  if (cfg.manualClusterOverrides) {
    const overrides = cfg.manualClusterOverrides;
    for (const [nodeId, targetGroup] of Object.entries(overrides)) {
      // Remove from current group
      for (const [gk, members] of groups) {
        const idx = members.findIndex(n => n.id === nodeId);
        if (idx >= 0) {
          const [node] = members.splice(idx, 1);
          // Add to target group (create if needed)
          if (!groups.has(targetGroup)) groups.set(targetGroup, []);
          groups.get(targetGroup)!.push(node);
          break;
        }
      }
    }
    // Remove empty groups
    for (const [gk, members] of groups) {
      if (members.length === 0) groups.delete(gk);
    }
  }

  // Phase 2: Merge small groups
  groups = mergeSmallGroups(groups, nodes.length);
  if (groups.size === 0) return null;

  // Phase 3: Label spacing inflation
  cfg = inflateLabelSpacing(nodes, degrees, cfg);

  // Phase 4: Target computation + metadata
  const { targets, allBars, allSequenceEdges, ringConstraints, timelineRoutes, groupGuides } = computeAbsoluteTargets(groups, edges, degrees, cfg);
  const { nodeClusterMap, clusterCentroids, clusterRadii } = buildClusterMetadataFromTargets(groups, targets, cfg);

  // Phase 5: Gap + overlap resolution
  resolveGapsAndOverlaps(targets, groups, allBars, clusterRadii, clusterCentroids, cfg, degrees);

  // Phase 5b: Re-align guide centers after overlap resolution.
  // resolveGapsAndOverlaps shifts group positions but doesn't update
  // groupGuides[].centerX/centerY, causing guides to render at stale positions.
  if (groupGuides) {
    for (const entry of groupGuides) {
      if (entry.groupKey) {
        const updatedCenter = clusterCentroids.get(entry.groupKey);
        if (updatedCenter) {
          entry.centerX = updatedCenter.x;
          entry.centerY = updatedCenter.y;
        }
      }
    }
  }

  // Assemble final metadata
  const timelineBars = allBars && allBars.length > 0 ? allBars : undefined;

  // Build force function
  const force = buildClusterForceFunction(nodes, targets, ringConstraints, cfg);

  return { force, metadata: { nodeClusterMap, clusterCentroids, clusterRadii, timelineBars, sequenceEdges: allSequenceEdges, timelineRoutes, groupGuides } };
}

// ---------------------------------------------------------------------------
// buildClusterForce phase functions — file-private
// ---------------------------------------------------------------------------

/** Multi-rule pipeline: subdivide groups by each rule, then filter empty */
function applyAllGroupRules(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  groupRules: ClusterGroupRule[],
): Map<string, GraphNode[]> {
  let groups = new Map<string, GraphNode[]>([["__all__", [...nodes]]]);
  for (const rule of groupRules) {
    groups = applyGroupRule(groups, rule, edges, degrees);
  }
  return groups;
}

/** Parent-aware merge: collapse small CCs back into parent, then remaining tiny → __other__ */
function mergeSmallGroups(
  groups: Map<string, GraphNode[]>,
  nodeCount: number,
): Map<string, GraphNode[]> {
  const minGroupSize = nodeCount >= 100 ? Math.max(3, Math.ceil(nodeCount * 0.005)) : 2;

  // Build parent → child key mapping from "::" separator
  const pm = new Map<string, string[]>();
  for (const key of groups.keys()) {
    const parent = key.replace(/::.*$/, "");
    if (!pm.has(parent)) pm.set(parent, []);
    pm.get(parent)!.push(key);
  }
  // Sub-phase 1: merge small CCs back into their parent tag group
  for (const [parent, children] of pm) {
    if (children.length <= 1) continue;
    let base = groups.get(parent) ?? [];
    for (const ck of children) {
      if (ck === parent) continue;
      const members = groups.get(ck)!;
      if (members.length < minGroupSize) {
        base = base.concat(members);
        groups.delete(ck);
      }
    }
    groups.set(parent, base);
  }
  // Sub-phase 2: merge remaining standalone tiny groups into __other__
  const merged = new Map<string, GraphNode[]>();
  let otherNodes: GraphNode[] = [];
  for (const [key, members] of groups) {
    if (members.length < minGroupSize) {
      otherNodes = otherNodes.concat(members);
    } else {
      merged.set(key, members);
    }
  }
  if (otherNodes.length > 0) merged.set("__other__", otherNodes);
  return merged;
}

/** Sub-group orphan nodes (degree=0) by a metadata field.
 *  Non-orphan nodes stay in their original group; orphans are extracted and
 *  re-partitioned into new groups keyed as "orphan:<fieldValue>". */
function subGroupOrphans(
  groups: Map<string, GraphNode[]>,
  degrees: Map<string, number>,
  field: string,
): Map<string, GraphNode[]> {
  const result = new Map<string, GraphNode[]>();
  const orphanBuckets = new Map<string, GraphNode[]>();

  for (const [key, members] of groups) {
    const nonOrphans: GraphNode[] = [];
    for (const n of members) {
      if ((degrees.get(n.id) || 0) === 0) {
        // Orphan — bucket by field value
        const vals = getNodeFieldValues(n, field);
        const bucketKey = vals.length > 0 ? vals[0] : `__no_${field}__`;
        let arr = orphanBuckets.get(bucketKey);
        if (!arr) { arr = []; orphanBuckets.set(bucketKey, arr); }
        arr.push(n);
      } else {
        nonOrphans.push(n);
      }
    }
    if (nonOrphans.length > 0) {
      result.set(key, nonOrphans);
    }
  }

  // Add orphan sub-groups
  for (const [bucketKey, members] of orphanBuckets) {
    result.set(`orphan:${bucketKey}`, members);
  }

  return result;
}

/** Label-aware spacing: inflate cfg.nodeSize based on p70 label extent */
function inflateLabelSpacing(
  nodes: GraphNode[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): ClusterForceConfig {
  const lsf = cfg.labelSpacingFactor ?? 0;
  if (lsf > 0 && nodes.length > 0) {
    let maxDeg = 0;
    for (const d of degrees.values()) { if (d > maxDeg) maxDeg = d; }
    // Compute label extent across nodes (use median-ish approach: 70th percentile)
    const extents = nodes.map(n => estimateLabelExtent(
      n, cfg.nodeSize, degrees.get(n.id) ?? 0, maxDeg, lsf,
      cfg.nodeLabelFontSizeMin ?? 11, cfg.nodeLabelFontSizeMax ?? 14,
    ));
    extents.sort((a, b) => a - b);
    const p70 = extents[Math.floor(extents.length * 0.7)] ?? 0;
    // Add half the representative label extent (labels extend in one direction,
    // and two adjacent labels share the space between nodes).
    return { ...cfg, nodeSize: cfg.nodeSize + p70 * 0.5 };
  }
  return cfg;
}

/** Post-computation gap correction + group overlap resolution + bar realignment */
function resolveGapsAndOverlaps(
  targets: Map<string, { x: number; y: number }>,
  groups: Map<string, GraphNode[]>,
  allBars: TimelineBarInfo[] | undefined,
  clusterRadii: Map<string, number>,
  clusterCentroids: Map<string, { x: number; y: number }>,
  cfg: ClusterForceConfig,
  degrees: Map<string, number>,
): void {
  // Snapshot bar positions before adjustments
  const barNodePosBefore = snapshotBarPositions(allBars, targets);

  // Post-expression intra-group gap correction
  const minGap = cfg.userConstants?._minGap ?? 0;
  const lsfIntra = cfg.labelSpacingFactor ?? 0;
  if (minGap > 0 || lsfIntra > 0) {
    resolveIntraGroupGaps(
      targets, groups, minGap, cfg.nodeSize, degrees,
      cfg.maxNodeRadius ?? 60, cfg.minNodeRadius ?? 15,
      lsfIntra, cfg.nodeLabelFontSizeMin ?? 11, cfg.nodeLabelFontSizeMax ?? 14,
    );
  }

  // Resolve pairwise group overlaps
  resolveGroupOverlapsIfNeeded(targets, groups, clusterRadii, clusterCentroids, cfg, degrees);

  // Re-align bars after overlap resolution
  realignBarsAfterOverlap(allBars, barNodePosBefore, targets);
}

// ---------------------------------------------------------------------------
// buildClusterForce helpers — file-private sub-functions
// ---------------------------------------------------------------------------

/** Build cluster metadata (nodeClusterMap, centroids, radii) from target positions. */
function buildClusterMetadataFromTargets(
  groups: Map<string, GraphNode[]>,
  targets: Map<string, { x: number; y: number }>,
  cfg: ClusterForceConfig,
): {
  nodeClusterMap: Map<string, string>;
  clusterCentroids: Map<string, { x: number; y: number }>;
  clusterRadii: Map<string, number>;
} {
  const nodeClusterMap = new Map<string, string>();
  const clusterCentroids = new Map<string, { x: number; y: number }>();
  const clusterRadii = new Map<string, number>();

  for (const [key, members] of groups) {
    for (const n of members) nodeClusterMap.set(n.id, key);
    let sx = 0, sy = 0;
    for (const n of members) {
      const t = targets.get(n.id);
      if (t) { sx += t.x; sy += t.y; }
    }
    const cx = sx / members.length;
    const cy = sy / members.length;
    clusterCentroids.set(key, { x: cx, y: cy });

    let actualR = 0;
    for (const n of members) {
      const t = targets.get(n.id);
      if (t) {
        const d = magnitude(t.x - cx, t.y - cy);
        if (d > actualR) actualR = d;
      }
    }
    const estimated = estimateGroupRadius(members.length, cfg.nodeSize, cfg.nodeSpacing, cfg.groupScale, cfg.arrangement, members, cfg.maxNodeRadius ?? 60);
    clusterRadii.set(key, Math.max(actualR, estimated));
  }

  return { nodeClusterMap, clusterCentroids, clusterRadii };
}

/** Snapshot bar node positions before overlap resolution. */
function snapshotBarPositions(
  allBars: TimelineBarInfo[] | undefined,
  targets: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const snapshot = new Map<string, { x: number; y: number }>();
  if (allBars && allBars.length > 0) {
    for (const bar of allBars) {
      const t = targets.get(bar.nodeId);
      if (t) snapshot.set(bar.nodeId, { x: t.x, y: t.y });
    }
  }
  return snapshot;
}

/** Resolve group overlaps if not skipped by configuration. */
function resolveGroupOverlapsIfNeeded(
  targets: Map<string, { x: number; y: number }>,
  groups: Map<string, GraphNode[]>,
  clusterRadii: Map<string, number>,
  clusterCentroids: Map<string, { x: number; y: number }>,
  cfg: ClusterForceConfig,
  degrees: Map<string, number>,
): void {
  const isGlobalCoordLayout = cfg.coordinateLayout && !cfg.coordinateLayout.perGroup;
  if (cfg.skipGroupOverlap || isGlobalCoordLayout) return;

  // Increase overlap padding when groups contain super nodes (collapsed)
  let overlapPad = cfg.userConstants?._overlapPad ?? 1.3;
  let hasSuperNodes = false;
  for (const members of groups.values()) {
    if (members.length === 1 && members[0].collapsedMembers && members[0].collapsedMembers.length > 0) {
      hasSuperNodes = true; break;
    }
  }
  if (hasSuperNodes) overlapPad = Math.max(overlapPad, 1.8);
  const lsf = cfg.labelSpacingFactor ?? 0;
  const glScaleMax = 4.0;
  const glHullOff = 24;
  const groupLabelPad = lsf > 0
    ? ((cfg.nodeLabelFontSizeMax ?? 14) * glScaleMax + glHullOff) * lsf
    : 0;
  resolveGroupOverlaps(targets, groups, clusterRadii, clusterCentroids, cfg.nodeSize, degrees, overlapPad, groupLabelPad);
}

/** Re-align timeline bars with post-overlap node target positions. */
function realignBarsAfterOverlap(
  allBars: TimelineBarInfo[] | undefined,
  barNodePosBefore: Map<string, { x: number; y: number }>,
  targets: Map<string, { x: number; y: number }>,
): void {
  if (!allBars || allBars.length === 0) return;
  for (const bar of allBars) {
    const before = barNodePosBefore.get(bar.nodeId);
    const after = targets.get(bar.nodeId);
    if (before && after) {
      const deltaX = after.x - before.x;
      const deltaY = after.y - before.y;
      bar.xStart += deltaX;
      bar.xEnd += deltaX;
      bar.yCenter += deltaY;
    }
  }
}

/** Build the d3-compatible force function (blend + ring snap). */
function buildClusterForceFunction(
  nodes: GraphNode[],
  targets: Map<string, { x: number; y: number }>,
  ringConstraints: Map<string, RingConstraint> | undefined,
  cfg: ClusterForceConfig,
): (alpha: number) => void {
  const bc = cfg.blendConfig;
  const blendDefault = bc?.clusterBlendDefault ?? 0.85;
  const blendInitial = cfg.userConstants?._blend ?? blendDefault;
  const decayFactor = bc?.clusterBlendDecayFactor ?? 3;
  const STRUCTURED = [ARRANGEMENT_GRID, ARRANGEMENT_TRIANGLE];
  const isStructured = STRUCTURED.includes(cfg.arrangement);

  return (_alpha: number) => {
    const blend = isStructured
      ? blendInitial
      : blendInitial * Math.min(1, _alpha * decayFactor);

    for (const n of nodes) {
      const t = targets.get(n.id);
      if (!t) continue;
      n.x += (t.x - n.x) * blend;
      n.y += (t.y - n.y) * blend;
      if (blend > 0.5) {
        n.vx = 0;
        n.vy = 0;
      } else {
        n.vx *= (1 - blend);
        n.vy *= (1 - blend);
      }
    }

    if (ringConstraints) {
      for (const n of nodes) {
        const rc = ringConstraints.get(n.id);
        if (!rc) continue;
        if (rc.r === 0) {
          n.x = rc.cx;
          n.y = rc.cy;
        } else {
          const dx = n.x - rc.cx;
          const dy = n.y - rc.cy;
          const dist = magnitude(dx, dy);
          if (dist > 0.01) {
            n.x = rc.cx + (dx / dist) * rc.r;
            n.y = rc.cy + (dy / dist) * rc.r;
          } else {
            const t = targets.get(n.id);
            if (t) { n.x = t.x; n.y = t.y; }
          }
        }
        n.vx = 0;
        n.vy = 0;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Node radius helper (mirrors GraphViewContainer nodeR formula)
// ---------------------------------------------------------------------------

/** Look up per-node spacing multiplier (defaults to 1.0 if absent). */
function getSpacing(id: string, map?: Map<string, number>): number {
  return map?.get(id) ?? 1.0;
}

/** Unified gap formula: nodeSize × 2 × max(nodeSpacing, groupScale).
 *  Convenience alias for pairwiseGap(nodeSize, nodeSize, max(nodeSpacing, groupScale)).
 *  Used only in estimateGroupRadius and normalizeSpread where uniform nodeSize is intentional. */
function computeGroupGap(nodeSize: number, nodeSpacing: number, groupScale: number): number {
  return pairwiseGap(nodeSize, nodeSize, Math.max(nodeSpacing, groupScale));
}

/** Pairwise gap between two adjacent elements using the larger element's
 *  size as reference.  Ensures that a small element next to a large one
 *  still gets an appropriately sized gap.
 *  Returns the center-to-center minimum distance (not the clear gap). */
function pairwiseGap(r1: number, r2: number, spacing: number): number {
  return Math.max(r1, r2) * 2 * spacing;
}

/** Estimate the world-space width a node's label will occupy at render time.
 *  This allows layout-time spacing to account for label dimensions before
 *  PixiJS text objects are created.
 *  charW ≈ fontSize × 0.6 (monospace-equivalent average for proportional fonts). */
/** Character width factor for monospace-equivalent average (proportional fonts). */
const LABEL_CHAR_WIDTH_FACTOR = 0.6;
/** Pill padding for super nodes (matches RenderPipeline createSinglePixiNode). */
const LABEL_PAD_X_SUPER = 10;
/** Pill padding for regular nodes. */
const LABEL_PAD_X_REGULAR = 8;

function estimateLabelExtent(
  node: GraphNode,
  nodeSize: number,
  degree: number,
  maxDeg: number,
  labelSpacingFactor: number,
  fontMin = 11,
  fontMax = 14,
  superFontSize = 13,
): number {
  if (labelSpacingFactor <= 0) return 0;
  const label = node.label ?? "";
  if (label.length === 0) return 0;
  const importance = maxDeg > 0 ? Math.min(1, degree / maxDeg) : 0;
  const isSuperNode = !!(node.collapsedMembers && node.collapsedMembers.length > 0);
  const fontSize = isSuperNode ? superFontSize : Math.round(fontMin + importance * (fontMax - fontMin));
  const charW = fontSize * LABEL_CHAR_WIDTH_FACTOR;
  const padX = isSuperNode ? LABEL_PAD_X_SUPER : LABEL_PAD_X_REGULAR;
  const rawWidth = label.length * charW + padX * 2;
  return rawWidth * labelSpacingFactor;
}

/** Visual radius of a node — canonical formula used across the codebase.
 *  Enforces minNodeRadius floor so nodes remain hoverable/clickable. */
export function nodeRadius(nodeSize: number, degree: number, minNodeRadius = 15, maxDegree = 0, sizeByDegree = false): number {
  if (sizeByDegree && maxDegree > 0 && degree > 0) {
    // Scale: base + proportion of degree (sqrt dampened)
    const t = Math.sqrt(degree / maxDegree);
    return Math.max(minNodeRadius, nodeSize * (0.6 + t * 0.8));
  }
  return Math.max(nodeSize, minNodeRadius);
}

/** Effective visual radius accounting for super nodes (collapsed groups).
 *  Canonical formula: baseR = nodeRadius(); superR = baseR * (1 + sqrt(memberCount) * 0.5); capped by maxNodeRadius.
 *  Enforces minNodeRadius floor. */
export function effectiveRadius(n: GraphNode, nodeSize: number, degree: number, maxNodeRadius = 60, minNodeRadius = 15, maxDegree = 0, sizeByDegree = false): number {
  const baseR = nodeRadius(nodeSize, degree, minNodeRadius, maxDegree, sizeByDegree);
  const cap = maxNodeRadius > 0 ? maxNodeRadius : Infinity;
  if (n.collapsedMembers && n.collapsedMembers.length > 0) {
    return Math.max(Math.min(Math.max(baseR, baseR * (1 + Math.sqrt(n.collapsedMembers.length) * 0.5)), cap), minNodeRadius);
  }
  return Math.max(baseR, minNodeRadius);
}

// ---------------------------------------------------------------------------
// ArrangementParams — unified parameter object for all arrangement functions
// ---------------------------------------------------------------------------

/** Consolidated parameters for intra-group arrangement offset functions.
 *  Replaces 10+ positional parameters with a single typed object. */
interface ArrangementParams {
  members: GraphNode[];
  degrees: Map<string, number>;
  edges: GraphEdge[];
  nodeSpacing: number;
  groupScale: number;
  nodeSize: number;
  maxGroupNodeR: number;
  cmp: (a: GraphNode, b: GraphNode) => number;
  nodeSpacingMap?: Map<string, number>;
  cfg: ClusterForceConfig;
}

// ---------------------------------------------------------------------------
// Absolute target computation
// ---------------------------------------------------------------------------

interface AbsoluteTargetResult {
  targets: Map<string, { x: number; y: number }>;
  allBars?: TimelineBarInfo[];
  allSequenceEdges?: GraphEdge[];
  ringConstraints?: Map<string, RingConstraint>;
  timelineRoutes?: TimelineRoute[];
  /** Per-group guide data for road network generation */
  groupGuides?: GroupGuideEntry[];
}

function computeAbsoluteTargets(
  groups: Map<string, GraphNode[]>,
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): AbsoluteTargetResult {
  // coordinateLayout with perGroup=false: compute offsets across ALL nodes at once,
  // ignoring group boundaries and hierarchy.  This is essential for layouts like
  // concentric rings where degree-based binning must span the full graph.
  if (cfg.coordinateLayout && !cfg.coordinateLayout.perGroup) {
    const allMembers: GraphNode[] = [];
    for (const members of groups.values()) allMembers.push(...members);

    // Route through computeOffsets (which dispatches to hardcoded functions
    // for concentric, etc.) instead of going directly to coordinateOffsets.
    const result = computeOffsets(allMembers, degrees, edges, cfg);

    const targets = new Map<string, { x: number; y: number }>();
    for (const n of allMembers) {
      const off = result.offsets.get(n.id);
      targets.set(n.id, {
        x: cfg.centerX + (off?.dx ?? 0),
        y: cfg.centerY + (off?.dy ?? 0),
      });
    }
    const globalGuides: GroupGuideEntry[] = [];
    if (result.guide) {
      globalGuides.push({ guide: result.guide, centerX: cfg.centerX, centerY: cfg.centerY });
    }
    return { targets, allBars: [], allSequenceEdges: undefined, groupGuides: globalGuides.length > 0 ? globalGuides : undefined };
  }

  // Detect parent-child hierarchy from composite keys ("::" from splitByConnectedComponents)
  const parentMap = new Map<string, string[]>();
  for (const key of groups.keys()) {
    const parent = key.replace(/::.*$/, "");
    if (!parentMap.has(parent)) parentMap.set(parent, []);
    parentMap.get(parent)!.push(key);
  }
  const hasHierarchy = [...parentMap.values()].some(ch => ch.length > 1);

  if (hasHierarchy) {
    const r = computeHierarchicalTargets(groups, parentMap, edges, degrees, cfg);
    return { targets: r.targets, allBars: r.allBars, allSequenceEdges: r.allSequenceEdges, timelineRoutes: r.timelineRoutes, groupGuides: r.groupGuides };
  }
  const r = computeFlatTargets(groups, edges, degrees, cfg);
  return { targets: r.targets, allBars: r.allBars, allSequenceEdges: r.allSequenceEdges, ringConstraints: r.ringConstraints, timelineRoutes: r.timelineRoutes, groupGuides: r.groupGuides };
}

/** Result from flat/hierarchical target computation, includes guide data */
/** Per-node ring constraint for concentric snap: center + radius */
interface RingConstraint {
  cx: number;
  cy: number;
  r: number;
}

interface FlatTargetResult {
  targets: Map<string, { x: number; y: number }>;
  allBars: TimelineBarInfo[];
  allSequenceEdges?: GraphEdge[];
  /** Concentric ring constraints — node snaps to circle(cx,cy,r) */
  ringConstraints?: Map<string, RingConstraint>;
  /** Per-group route data for transit map rendering */
  timelineRoutes?: TimelineRoute[];
  /** Per-group guide data for road network generation */
  groupGuides?: GroupGuideEntry[];
}

// ─── Shared helpers for computeFlatTargets / computeHierarchicalTargets ───

/** Sort group keys in-place by each group's representative node (first per sortComparator). */
function _sortKeysByRepresentative(
  keys: string[],
  nodeSource: Map<string, GraphNode[]>,
  cmp: ((a: GraphNode, b: GraphNode) => number) | undefined,
): void {
  if (!cmp || keys.length <= 1) return;
  const reps = new Map<string, GraphNode>();
  for (const key of keys) {
    const members = nodeSource.get(key);
    if (members && members.length > 0) {
      reps.set(key, [...members].sort(cmp)[0]);
    }
  }
  keys.sort((a, b) => {
    const ra = reps.get(a);
    const rb = reps.get(b);
    if (!ra || !rb) return 0;
    return cmp(ra, rb);
  });
}

/** Compute per-group intra-group offsets and measure actual bounding radii. */
function _computeGroupOffsetsAndRadii(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  degrees: Map<string, number>,
  edges: GraphEdge[],
  cfg: ClusterForceConfig,
): { groupResults: Map<string, ArrangementResult>; actualRadii: Map<string, number> } {
  const groupResults = new Map<string, ArrangementResult>();
  const actualRadii = new Map<string, number>();
  for (const key of keys) {
    const members = groups.get(key)!;
    const result = computeOffsets(members, degrees, edges, cfg);
    groupResults.set(key, result);
    let maxDist = 0;
    for (const { dx, dy } of result.offsets.values()) {
      const d = magnitude(dx, dy);
      if (d > maxDist) maxDist = d;
    }
    actualRadii.set(key, maxDist + cfg.nodeSize);
  }
  return { groupResults, actualRadii };
}

/** Place group centers using the configured groupLayoutMode. */
function _layoutGroupCenters(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  actualRadii: Map<string, number>,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (keys.length === 1) {
    out.set(keys[0], { x: cfg.centerX, y: cfg.centerY });
  } else {
    const mode = cfg.groupLayoutMode ?? "circle";
    switch (mode) {
      case GROUP_ARRANGEMENT_HORIZONTAL:
        layoutGroupsHorizontal(keys, groups, cfg, out, actualRadii);
        break;
      case GROUP_ARRANGEMENT_VERTICAL:
        layoutGroupsVertical(keys, groups, cfg, out, actualRadii);
        break;
      case GROUP_ARRANGEMENT_CONCENTRIC:
        layoutGroupsConcentric(keys, groups, cfg, out, actualRadii);
        break;
      case GROUP_ARRANGEMENT_GRID:
        layoutGroupsGrid(keys, groups, cfg, out, actualRadii);
        break;
      default:
        layoutGroupsCircle(keys, groups, cfg, out, actualRadii);
        break;
    }
  }
  return out;
}

/** Accumulator for collecting results while applying offsets to targets. */
interface _OffsetAccumulator {
  targets: Map<string, { x: number; y: number }>;
  allBars: TimelineBarInfo[];
  allSeqEdges: GraphEdge[];
  groupGuides: GroupGuideEntry[];
  ringConstraints?: Map<string, RingConstraint>;
}

/** Apply pre-computed offsets for a single group to absolute target positions. */
function _applyGroupOffsets(
  members: GraphNode[],
  center: { x: number; y: number },
  result: ArrangementResult,
  acc: _OffsetAccumulator,
  groupKey?: string,
): void {
  for (const n of members) {
    const off = result.offsets.get(n.id);
    acc.targets.set(n.id, {
      x: center.x + (off?.dx ?? 0),
      y: center.y + (off?.dy ?? 0),
    });
  }
  if (result.ringAssignments) {
    if (!acc.ringConstraints) acc.ringConstraints = new Map<string, RingConstraint>();
    for (const [nodeId, r] of result.ringAssignments) {
      acc.ringConstraints.set(nodeId, { cx: center.x, cy: center.y, r });
    }
  }
  if (result.bars) {
    for (const bar of result.bars) {
      acc.allBars.push({
        ...bar,
        xStart: bar.xStart + center.x,
        xEnd: bar.xEnd + center.x,
        yCenter: bar.yCenter + center.y,
      });
    }
  }
  if (result.sequenceEdges) {
    acc.allSeqEdges.push(...result.sequenceEdges);
  }
  if (result.guide) {
    acc.groupGuides.push({ guide: result.guide, centerX: center.x, centerY: center.y, groupKey });
  }
}

/** Collect timeline route data from computed targets (single-group timeline case). */
function _collectTimelineRoutes(
  groupKeys: string[],
  groups: Map<string, GraphNode[]>,
  groupResults: Map<string, ArrangementResult>,
  targets: Map<string, { x: number; y: number }>,
): TimelineRoute[] | undefined {
  const routes: TimelineRoute[] = [];
  for (const key of groupKeys) {
    const members = groups.get(key);
    if (!members || members.length < 2) continue;
    const result = groupResults.get(key);
    const chains = result?.nodeChains;

    if (chains && chains.length > 0) {
      for (const chain of chains) {
        const waypoints: Array<{ nodeId: string; x: number; y: number }> = [];
        for (const nodeId of chain) {
          const pos = targets.get(nodeId);
          if (pos) waypoints.push({ nodeId, x: pos.x, y: pos.y });
        }
        if (waypoints.length >= 2) {
          routes.push({ groupKey: key, waypoints });
        }
      }
      const chainedSet = new Set(chains.flat());
      const unchained: Array<{ nodeId: string; x: number; y: number }> = [];
      for (const n of members) {
        if (chainedSet.has(n.id)) continue;
        const pos = targets.get(n.id);
        if (pos) unchained.push({ nodeId: n.id, x: pos.x, y: pos.y });
      }
      if (unchained.length >= 2) {
        unchained.sort((a, b) => a.x - b.x);
        routes.push({ groupKey: key, waypoints: unchained });
      }
    } else {
      const waypoints: Array<{ nodeId: string; x: number; y: number }> = [];
      for (const n of members) {
        const pos = targets.get(n.id);
        if (pos) waypoints.push({ nodeId: n.id, x: pos.x, y: pos.y });
      }
      waypoints.sort((a, b) => a.x - b.x);
      if (waypoints.length >= 2) {
        routes.push({ groupKey: key, waypoints });
      }
    }
  }
  return routes.length > 0 ? routes : undefined;
}

/** Flat layout — all groups at the same level (no recursive split). */
/**
 * 6-step pipeline for computing flat (non-hierarchical) group targets.
 *
 * The strict ordering ensures consistent results regardless of arrangement:
 *   1. Node size determination   — compute effective radii for all nodes
 *   2. Inter-node distance       — derive spacing (gap) from node sizes
 *   3. Group radius              — compute intra-group offsets, measure actual bounding radius
 *   4. Inter-group distance      — compute required separations from actual radii
 *   5. Group position            — place group centers using actual radii
 *   6. Node position             — combine group center + intra-group offset
 *
 * Steps 1-2 are performed inside computeOffsets (nodeSize, gap).
 * Step 3 runs computeOffsets for EACH group first (relative to origin),
 * then measures the actual bounding radius per group.
 * Steps 4-5 use actual radii in the layout functions (no more estimates).
 * Step 6 translates relative offsets to absolute positions.
 */
function computeFlatTargets(
  groups: Map<string, GraphNode[]>,
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): FlatTargetResult {
  let groupKeys = [...groups.keys()];
  _sortKeysByRepresentative(groupKeys, groups, cfg.sortComparator);

  // Timeline with multiple groups: merge all nodes into a single unified timeline
  if (cfg.arrangement === ARRANGEMENT_TIMELINE && groupKeys.length > 1) {
    return computeUnifiedTimelineTargets(groups, edges, degrees, cfg);
  }

  // Steps 1-3: Per-group offsets + actual radii
  const { groupResults, actualRadii } = _computeGroupOffsetsAndRadii(
    groupKeys, groups, degrees, edges, cfg,
  );

  // Steps 4-5: Place group centers
  const groupCenters = _layoutGroupCenters(groupKeys, groups, cfg, actualRadii);

  // Step 6: Absolute positions = group center + offset
  const acc: _OffsetAccumulator = {
    targets: new Map(), allBars: [], allSeqEdges: [], groupGuides: [],
  };
  for (const key of groupKeys) {
    const members = groups.get(key)!;
    _applyGroupOffsets(members, groupCenters.get(key)!, groupResults.get(key)!, acc, key);
  }

  // Route data for timeline arrangement (single-group case)
  let timelineRoutes: TimelineRoute[] | undefined;
  if (cfg.arrangement === ARRANGEMENT_TIMELINE) {
    timelineRoutes = _collectTimelineRoutes(groupKeys, groups, groupResults, acc.targets);
  }

  return {
    targets: acc.targets,
    allBars: acc.allBars,
    ringConstraints: acc.ringConstraints,
    allSequenceEdges: acc.allSeqEdges.length > 0 ? acc.allSeqEdges : undefined,
    timelineRoutes,
    groupGuides: acc.groupGuides.length > 0 ? acc.groupGuides : undefined,
  };
}

/**
 * Unified timeline: all groups share a single X-axis (same date -> same X
 * column).  Y positions are re-stacked per-group so each group's nodes
 * stack independently within each time column, keeping vertical extent
 * compact while maintaining globally consistent X positions.
 *
 * Strategy:
 *   1. Run timelineOffsetsV2 on ALL nodes merged to get shared X positions
 *      (global time axis with consistent effectiveSpacing).
 *   2. Re-compute Y stacking per-group: within each time column, only
 *      stack that group's nodes, not all groups mixed together.
 *   3. Lay groups out in Y-bands separated by a small gap.
 */
function computeUnifiedTimelineTargets(
  groups: Map<string, GraphNode[]>,
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): FlatTargetResult {
  const targets = new Map<string, { x: number; y: number }>();
  const allBars: TimelineBarInfo[] = [];
  const nodeSize = cfg.nodeSize;
  const groupKeys = [...groups.keys()];

  // --- Step 1: compute unified X positions from ALL nodes ---
  const allMembers: GraphNode[] = [];
  for (const members of groups.values()) allMembers.push(...members);

  const cmp = cfg.sortComparator ?? ((a: GraphNode, b: GraphNode) =>
    (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));

  // Compute max group node radius for timeline params
  let maxGroupNodeR = nodeSize;
  if (allMembers.length > 0) {
    const maxR = cfg.maxNodeRadius ?? 60;
    const minR = cfg.minNodeRadius ?? 15;
    for (const m of allMembers) {
      const r = effectiveRadius(m, cfg.nodeSize, degrees.get(m.id) ?? 0, maxR, minR);
      if (r > maxGroupNodeR) maxGroupNodeR = r;
    }
  }

  const unified = timelineOffsetsV2({
    members: allMembers, degrees, edges, nodeSpacing: cfg.nodeSpacing,
    groupScale: cfg.groupScale, nodeSize, maxGroupNodeR,
    cmp, nodeSpacingMap: cfg.nodeSpacingMap, cfg,
  });

  // Build group membership lookup
  const groupOfNode = new Map<string, string>();
  for (const [key, members] of groups) {
    for (const n of members) groupOfNode.set(n.id, key);
  }

  // --- Step 2: re-stack Y per group ---
  const { perGroupOffsets, minNodeGap } = unifiedTimelineRestackY(
    unified.offsets, groupOfNode, groupKeys, degrees, nodeSize, cfg,
  );

  // --- Step 3-4: assign Y-bands and apply absolute targets ---
  const { groupYOffset, groupYRanges, yCenter } = unifiedTimelineAssignBands(
    perGroupOffsets, groupKeys, nodeSize, cfg,
  );
  unifiedTimelineApplyTargets(perGroupOffsets, groupYOffset, groupYRanges, yCenter, cfg, targets);

  // --- Step 5: collect bars with per-group Y adjustments ---
  unifiedTimelineCollectBars(unified.bars, groupOfNode, groupKeys, groupYOffset, groupYRanges, perGroupOffsets, yCenter, cfg, allBars);

  // Filter sequence edges to within-group only
  let filteredSeqEdges: GraphEdge[] | undefined;
  if (unified.sequenceEdges) {
    filteredSeqEdges = unified.sequenceEdges.filter(e => {
      const sg = groupOfNode.get(e.source);
      const tg = groupOfNode.get(e.target);
      return sg != null && sg === tg;
    });
    if (filteredSeqEdges.length === 0) filteredSeqEdges = undefined;
  }

  // --- Route data ---
  const timelineRoutes = unifiedTimelineCollectRoutes(groups, groupKeys, unified.nodeChains, targets);

  // Propagate guide data from unified timeline computation
  const groupGuides: GroupGuideEntry[] = [];
  if (unified.guide) {
    groupGuides.push({ guide: unified.guide, centerX: cfg.centerX, centerY: cfg.centerY });
  }

  return {
    targets,
    allBars,
    allSequenceEdges: filteredSeqEdges,
    timelineRoutes: timelineRoutes.length > 0 ? timelineRoutes : undefined,
    groupGuides: groupGuides.length > 0 ? groupGuides : undefined,
  };
}

// ---------------------------------------------------------------------------
// computeUnifiedTimelineTargets helpers — file-private sub-functions
// ---------------------------------------------------------------------------

/** Re-stack Y positions per group: nodes in the same X-column get independent Y stacking per group. */
function unifiedTimelineRestackY(
  unifiedOffsets: Map<string, { dx: number; dy: number }>,
  groupOfNode: Map<string, string>,
  groupKeys: string[],
  degrees: Map<string, number>,
  nodeSize: number,
  cfg: ClusterForceConfig,
): { perGroupOffsets: Map<string, Map<string, { dx: number; dy: number }>>; minNodeGap: number } {
  const nodesByGroupCol = new Map<string, Map<number, string[]>>();
  for (const key of groupKeys) nodesByGroupCol.set(key, new Map());

  const nodeDx = new Map<string, number>();
  for (const [nodeId, off] of unifiedOffsets) {
    nodeDx.set(nodeId, off.dx);
    const gk = groupOfNode.get(nodeId) ?? groupKeys[0];
    const colKey = Math.round(off.dx * 100);
    const cols = nodesByGroupCol.get(gk)!;
    let list = cols.get(colKey);
    if (!list) { list = []; cols.set(colKey, list); }
    list.push(nodeId);
  }

  // Derive effective spacing from actual X range
  const uniqueXPositions = new Set<number>();
  for (const { dx } of unifiedOffsets.values()) uniqueXPositions.add(Math.round(dx * 100));
  const nCols = Math.max(1, uniqueXPositions.size);
  let effectiveSpacing: number;
  if (nCols >= 2) {
    let minDx = Infinity, maxDx = -Infinity;
    for (const { dx } of unifiedOffsets.values()) {
      if (dx < minDx) minDx = dx;
      if (dx > maxDx) maxDx = dx;
    }
    effectiveSpacing = (maxDx - minDx) / (nCols - 1);
  } else {
    effectiveSpacing = nodeSize * 2;
  }
  const barH = nodeSize * 2;
  const barGapMin = nodeSize * (cfg.userConstants?._barGapFactor ?? 1.5);
  const minYStack = barH + barGapMin;
  const yStackSpacing = Math.max(effectiveSpacing * (cfg.userConstants?._yStackFactor ?? 0.6), minYStack);
  const minNodeGap = Math.max(nodeSize * (cfg.userConstants?._barGapFactor ?? 1.5), yStackSpacing);

  const perGroupOffsets = new Map<string, Map<string, { dx: number; dy: number }>>();
  for (const [gk, cols] of nodesByGroupCol) {
    const offsets = new Map<string, { dx: number; dy: number }>();
    for (const [, nodeIds] of cols) {
      nodeIds.sort((a, b) => (degrees.get(b) || 0) - (degrees.get(a) || 0));
      for (let i = 0; i < nodeIds.length; i++) {
        const nid = nodeIds[i];
        offsets.set(nid, { dx: nodeDx.get(nid) ?? 0, dy: i * minNodeGap });
      }
    }
    // Center Y per group
    let minY = Infinity, maxY = -Infinity;
    for (const { dy } of offsets.values()) {
      if (dy < minY) minY = dy;
      if (dy > maxY) maxY = dy;
    }
    const yAdj = (minY + maxY) / 2;
    for (const [id, pos] of offsets) {
      offsets.set(id, { dx: pos.dx, dy: pos.dy - yAdj });
    }
    perGroupOffsets.set(gk, offsets);
  }

  return { perGroupOffsets, minNodeGap };
}

/** Compute per-group Y extents and assign Y-band offsets. */
function unifiedTimelineAssignBands(
  perGroupOffsets: Map<string, Map<string, { dx: number; dy: number }>>,
  groupKeys: string[],
  nodeSize: number,
  cfg: ClusterForceConfig,
): {
  groupYOffset: Map<string, number>;
  groupYRanges: Map<string, { minDy: number; maxDy: number }>;
  yCenter: number;
} {
  const groupYRanges = new Map<string, { minDy: number; maxDy: number }>();
  for (const [gk, offsets] of perGroupOffsets) {
    let minDy = Infinity, maxDy = -Infinity;
    for (const { dy } of offsets.values()) {
      if (dy < minDy) minDy = dy;
      if (dy > maxDy) maxDy = dy;
    }
    groupYRanges.set(gk, {
      minDy: minDy === Infinity ? 0 : minDy,
      maxDy: maxDy === -Infinity ? 0 : maxDy,
    });
  }

  const bandGap = nodeSize * cfg.groupSpacing * (cfg.userConstants?._bandGapFactor ?? 2);
  const groupYOffset = new Map<string, number>();
  let yCursor = 0;
  for (const key of groupKeys) {
    const range = groupYRanges.get(key);
    const bandHeight = range ? (range.maxDy - range.minDy) : 0;
    groupYOffset.set(key, yCursor);
    yCursor += bandHeight + bandGap;
  }
  const totalHeight = yCursor - (groupKeys.length > 0 ? bandGap : 0);
  const yCenter = totalHeight / 2;

  return { groupYOffset, groupYRanges, yCenter };
}

/** Apply per-group offsets to absolute target positions. */
function unifiedTimelineApplyTargets(
  perGroupOffsets: Map<string, Map<string, { dx: number; dy: number }>>,
  groupYOffset: Map<string, number>,
  groupYRanges: Map<string, { minDy: number; maxDy: number }>,
  yCenter: number,
  cfg: ClusterForceConfig,
  targets: Map<string, { x: number; y: number }>,
): void {
  for (const [gk, offsets] of perGroupOffsets) {
    const bandOff = groupYOffset.get(gk) ?? 0;
    const range = groupYRanges.get(gk);
    for (const [nodeId, off] of offsets) {
      const relDy = range ? (off.dy - range.minDy) : off.dy;
      targets.set(nodeId, {
        x: cfg.centerX + off.dx,
        y: cfg.centerY + bandOff + relDy - yCenter,
      });
    }
  }
}

/** Collect unified bars with per-group Y adjustments. */
function unifiedTimelineCollectBars(
  unifiedBars: TimelineBarInfo[] | undefined,
  groupOfNode: Map<string, string>,
  groupKeys: string[],
  groupYOffset: Map<string, number>,
  groupYRanges: Map<string, { minDy: number; maxDy: number }>,
  perGroupOffsets: Map<string, Map<string, { dx: number; dy: number }>>,
  yCenter: number,
  cfg: ClusterForceConfig,
  allBars: TimelineBarInfo[],
): void {
  if (!unifiedBars) return;
  for (const bar of unifiedBars) {
    const gk = groupOfNode.get(bar.nodeId) ?? groupKeys[0];
    const bandOff = groupYOffset.get(gk) ?? 0;
    const range = groupYRanges.get(gk);
    const pgOff = perGroupOffsets.get(gk)?.get(bar.nodeId);
    if (!pgOff) continue;
    const relDy = range ? (pgOff.dy - range.minDy) : pgOff.dy;
    allBars.push({
      ...bar,
      xStart: bar.xStart + cfg.centerX,
      xEnd: bar.xEnd + cfg.centerX,
      yCenter: cfg.centerY + bandOff + relDy - yCenter,
    });
  }
}

/** Collect per-group route waypoints, using chain order when available. */
function unifiedTimelineCollectRoutes(
  groups: Map<string, GraphNode[]>,
  groupKeys: string[],
  globalChains: string[][] | undefined,
  targets: Map<string, { x: number; y: number }>,
): TimelineRoute[] {
  const timelineRoutes: TimelineRoute[] = [];

  for (const gk of groupKeys) {
    const members = groups.get(gk);
    if (!members || members.length < 2) continue;
    const memberSet = new Set(members.map(n => n.id));

    if (globalChains && globalChains.length > 0) {
      const chainedInGroup = new Set<string>();
      for (const chain of globalChains) {
        const segment: Array<{ nodeId: string; x: number; y: number }> = [];
        for (const nodeId of chain) {
          if (!memberSet.has(nodeId)) continue;
          const pos = targets.get(nodeId);
          if (pos) {
            segment.push({ nodeId, x: pos.x, y: pos.y });
            chainedInGroup.add(nodeId);
          }
        }
        if (segment.length >= 2) {
          timelineRoutes.push({ groupKey: gk, waypoints: segment });
        }
      }
      const unchained: Array<{ nodeId: string; x: number; y: number }> = [];
      for (const n of members) {
        if (chainedInGroup.has(n.id)) continue;
        const pos = targets.get(n.id);
        if (pos) unchained.push({ nodeId: n.id, x: pos.x, y: pos.y });
      }
      if (unchained.length >= 2) {
        unchained.sort((a, b) => a.x - b.x);
        timelineRoutes.push({ groupKey: gk, waypoints: unchained });
      }
    } else {
      const waypoints: Array<{ nodeId: string; x: number; y: number }> = [];
      for (const n of members) {
        const pos = targets.get(n.id);
        if (pos) waypoints.push({ nodeId: n.id, x: pos.x, y: pos.y });
      }
      waypoints.sort((a, b) => a.x - b.x);
      if (waypoints.length >= 2) {
        timelineRoutes.push({ groupKey: gk, waypoints });
      }
    }
  }

  return timelineRoutes;
}

/**
 * Two-level hierarchical layout for recursive splits.
 *
 * Level 1: Place parent groups (tag groups) using the normal inter-group layout.
 * Level 2: Within each parent, spread sub-groups (connected components) locally
 *          and apply intra-group arrangement within each sub-group.
 */
function computeHierarchicalTargets(
  groups: Map<string, GraphNode[]>,
  parentMap: Map<string, string[]>,
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): FlatTargetResult {
  // Timeline with hierarchy: use unified timeline across all groups
  if (cfg.arrangement === ARRANGEMENT_TIMELINE) {
    return computeUnifiedTimelineTargets(groups, edges, degrees, cfg);
  }

  let parentKeys = [...parentMap.keys()];

  // Build virtual "super groups" to compute parent-level sizes
  const superGroups = new Map<string, GraphNode[]>();
  for (const [parent, childKeys] of parentMap) {
    const all: GraphNode[] = [];
    for (const ck of childKeys) {
      const members = groups.get(ck);
      if (members) all.push(...members);
    }
    superGroups.set(parent, all);
  }

  _sortKeysByRepresentative(parentKeys, superGroups, cfg.sortComparator);

  // Steps 1-3: Compute offsets for ALL groups, measure actual radii
  const { groupResults: allGroupResults, actualRadii: allGroupRadii } =
    _computeGroupOffsetsAndRadii([...groups.keys()], groups, degrees, edges, cfg);

  // Compute parent-level radii from children's extents
  const parentActualRadii = _computeParentRadii(parentMap, allGroupRadii, cfg);

  // Steps 4-5: Place parent centers
  const parentCenters = _layoutGroupCenters(parentKeys, superGroups, cfg, parentActualRadii);

  // Step 6: Combine group centers + offsets
  const acc: _OffsetAccumulator = {
    targets: new Map(), allBars: [], allSeqEdges: [], groupGuides: [],
  };
  _applyHierarchicalOffsets(parentMap, parentCenters, groups, allGroupResults, allGroupRadii, cfg, acc);

  return {
    targets: acc.targets,
    allBars: acc.allBars,
    allSequenceEdges: acc.allSeqEdges.length > 0 ? acc.allSeqEdges : undefined,
    groupGuides: acc.groupGuides.length > 0 ? acc.groupGuides : undefined,
  };
}

/** Compute parent-level radii from child group radii for hierarchical layout. */
function _computeParentRadii(
  parentMap: Map<string, string[]>,
  allGroupRadii: Map<string, number>,
  cfg: ClusterForceConfig,
): Map<string, number> {
  const parentActualRadii = new Map<string, number>();
  for (const [parent, childKeys] of parentMap) {
    let maxR = 0;
    for (const ck of childKeys) {
      const r = allGroupRadii.get(ck) ?? 0;
      if (r > maxR) maxR = r;
    }
    if (childKeys.length > 1) {
      parentActualRadii.set(parent, maxR * 2 + cfg.nodeSize * cfg.groupSpacing * 2);
    } else {
      parentActualRadii.set(parent, maxR);
    }
  }
  return parentActualRadii;
}

/** Apply offsets for hierarchical layout: single-child parents use direct offsets,
 *  multi-child parents place sub-groups in a circle around the parent center. */
function _applyHierarchicalOffsets(
  parentMap: Map<string, string[]>,
  parentCenters: Map<string, { x: number; y: number }>,
  groups: Map<string, GraphNode[]>,
  allGroupResults: Map<string, ArrangementResult>,
  allGroupRadii: Map<string, number>,
  cfg: ClusterForceConfig,
  acc: _OffsetAccumulator,
): void {
  for (const [parent, childKeys] of parentMap) {
    const pCenter = parentCenters.get(parent)!;

    if (childKeys.length === 1) {
      const members = groups.get(childKeys[0])!;
      const result = allGroupResults.get(childKeys[0])!;
      _applyGroupOffsets(members, pCenter, result, acc, childKeys[0]);
      continue;
    }

    // Multiple sub-groups: sort + place in a circle
    const sorted = _sortChildKeys(childKeys, groups, cfg);
    const subCenters = _placeSubGroupCenters(sorted, pCenter, allGroupRadii, cfg);

    for (const ck of sorted) {
      const members = groups.get(ck);
      if (!members) continue;
      _applyGroupOffsets(members, subCenters.get(ck)!, allGroupResults.get(ck)!, acc, ck);
    }
  }
}

/** Sort child keys by representative node (sortComparator) or by size (largest first). */
function _sortChildKeys(
  childKeys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
): string[] {
  if (cfg.sortComparator) {
    const cmp = cfg.sortComparator;
    const reps = new Map<string, GraphNode>();
    for (const ck of childKeys) {
      const members = groups.get(ck);
      if (members && members.length > 0) {
        reps.set(ck, [...members].sort(cmp)[0]);
      }
    }
    return [...childKeys].sort((a, b) => {
      const ra = reps.get(a);
      const rb = reps.get(b);
      if (!ra || !rb) return 0;
      return cmp(ra, rb);
    });
  }
  return [...childKeys].sort((a, b) =>
    (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0));
}

/** Place sub-group centers in a circle around the parent center. */
function _placeSubGroupCenters(
  sorted: string[],
  pCenter: { x: number; y: number },
  allGroupRadii: Map<string, number>,
  cfg: ClusterForceConfig,
): Map<string, { x: number; y: number }> {
  const subCenters = new Map<string, { x: number; y: number }>();
  if (sorted.length <= 1) {
    subCenters.set(sorted[0], pCenter);
  } else {
    let maxSubR = 0;
    for (const ck of sorted) {
      const r = allGroupRadii.get(ck) ?? 0;
      if (r > maxSubR) maxSubR = r;
    }
    const subCircleR = (maxSubR * 2 + cfg.nodeSize * 4) * sorted.length / (2 * Math.PI);
    for (let i = 0; i < sorted.length; i++) {
      const angle = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
      subCenters.set(sorted[i], {
        x: pCenter.x + subCircleR * Math.cos(angle),
        y: pCenter.y + subCircleR * Math.sin(angle),
      });
    }
  }
  return subCenters;
}

/**
 * Place groups in a horizontal row.
 * Total width is derived from actual group sizes so it scales
 * proportionally with nodeSpacing.
 */
function layoutGroupsHorizontal(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  out: Map<string, { x: number; y: number }>,
  actualRadii?: Map<string, number>,
) {
  // Step 3: Group radii (measured from offsets or estimated)
  const groupR: number[] = [];
  for (const key of keys) {
    const members = groups.get(key)!;
    groupR.push(actualRadii?.get(key)
      ?? estimateGroupRadius(members.length, cfg.nodeSize, cfg.nodeSpacing, cfg.groupScale, cfg.arrangement, members, cfg.maxNodeRadius ?? 60));
  }

  // Step 4: Inter-group distance — pairwise max-reference gap
  // Between groups i and i+1: gap = max(groupR[i], groupR[i+1]) * 2 * groupSpacing
  const gaps: number[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    gaps.push(pairwiseGap(groupR[i], groupR[i + 1], cfg.groupSpacing));
  }

  // Step 5: Group positions (horizontal row)
  let totalW = groupR[0] * 2;
  for (let i = 0; i < gaps.length; i++) {
    totalW += gaps[i] + groupR[i + 1] * 2;
  }

  let xCursor = cfg.centerX - totalW / 2 + groupR[0];
  out.set(keys[0], { x: xCursor, y: cfg.centerY });
  for (let i = 1; i < keys.length; i++) {
    xCursor += groupR[i - 1] + gaps[i - 1] + groupR[i];
    out.set(keys[i], { x: xCursor, y: cfg.centerY });
  }
}

/**
 * Stack groups vertically (same X center, different Y bands).
 * Used by timeline arrangement so all groups share the same time axis.
 */
function layoutGroupsVertical(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  out: Map<string, { x: number; y: number }>,
  actualRadii?: Map<string, number>,
) {
  // Step 3: Group radii
  const groupR: number[] = [];
  for (const key of keys) {
    const members = groups.get(key)!;
    groupR.push(actualRadii?.get(key)
      ?? estimateGroupRadius(members.length, cfg.nodeSize, cfg.nodeSpacing, cfg.groupScale, cfg.arrangement, members, cfg.maxNodeRadius ?? 60));
  }

  // Step 4: Pairwise inter-group gaps
  const gaps: number[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    gaps.push(pairwiseGap(groupR[i], groupR[i + 1], cfg.groupSpacing));
  }

  // Step 5: Group positions (vertical stack)
  let totalH = groupR[0] * 2;
  for (let i = 0; i < gaps.length; i++) {
    totalH += gaps[i] + groupR[i + 1] * 2;
  }

  let yCursor = cfg.centerY - totalH / 2 + groupR[0];
  out.set(keys[0], { x: cfg.centerX, y: yCursor });
  for (let i = 1; i < keys.length; i++) {
    yCursor += groupR[i - 1] + gaps[i - 1] + groupR[i];
    out.set(keys[i], { x: cfg.centerX, y: yCursor });
  }
}

/**
 * Place groups on a circle around the canvas center.
 * Radius is derived from intra-group footprints so it scales
 * proportionally with nodeSpacing.  A small floor prevents collapse
 * for tiny groups; canvas size is NOT used so that spacing changes
 * always produce proportional layout changes.
 */
function layoutGroupsCircle(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  out: Map<string, { x: number; y: number }>,
  actualRadii?: Map<string, number>,
) {
  const nGroups = keys.length;

  // Step 3: Group radii
  const groupR: number[] = [];
  for (const key of keys) {
    const members = groups.get(key)!;
    groupR.push(actualRadii?.get(key)
      ?? estimateGroupRadius(members.length, cfg.nodeSize, cfg.nodeSpacing, cfg.groupScale, cfg.arrangement, members, cfg.maxNodeRadius ?? 60));
  }

  // Step 4: Inter-group distance — pairwise max-reference
  // Circle radius is computed so adjacent groups don't overlap.
  // For each adjacent pair (i, i+1 mod n), the arc-length must accommodate
  // both radii plus a pairwise gap based on the larger group.
  let totalArcNeeded = 0;
  for (let i = 0; i < nGroups; i++) {
    const j = (i + 1) % nGroups;
    totalArcNeeded += groupR[i] + groupR[j] + pairwiseGap(groupR[i], groupR[j], cfg.groupSpacing);
  }
  const minCircleR = totalArcNeeded / (2 * Math.PI);

  // Step 5: Group positions on circle
  const groupRadius = Math.max(minCircleR, cfg.nodeSize * Math.sqrt(nGroups) * cfg.groupSpacing);

  for (let i = 0; i < nGroups; i++) {
    const angle = (i / nGroups) * Math.PI * 2 - Math.PI / 2;
    out.set(keys[i], {
      x: cfg.centerX + groupRadius * Math.cos(angle),
      y: cfg.centerY + groupRadius * Math.sin(angle),
    });
  }
}

/**
 * Place groups on concentric rings around the canvas center.
 * The first key goes to the center; remaining groups are distributed
 * across concentric rings so that each ring holds groups whose combined
 * angular extent fits the circumference.  Key order is determined by
 * the caller (sorted by sortComparator representative node).
 */
function layoutGroupsConcentric(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  out: Map<string, { x: number; y: number }>,
  actualRadii?: Map<string, number>,
) {
  if (keys.length === 0) return;

  // Keys are already sorted by the caller (computeFlatTargets) using sortComparator.
  // First key → center, remaining keys → concentric rings in order.

  // Step 3: Group radii
  const groupRadii = new Map<string, number>();
  for (const key of keys) {
    const members = groups.get(key);
    if (!members) continue;
    groupRadii.set(key, actualRadii?.get(key)
      ?? estimateGroupRadius(members.length, cfg.nodeSize, cfg.nodeSpacing, cfg.groupScale, cfg.arrangement, members, cfg.maxNodeRadius ?? 60));
  }

  // Place the first group at center
  out.set(keys[0], { x: cfg.centerX, y: cfg.centerY });

  if (keys.length === 1) return;

  // Step 4-5: Distribute remaining groups across concentric rings
  // using pairwise max-reference for inter-group distance
  const centerR = groupRadii.get(keys[0]) ?? 0;
  let prevMaxR = centerR;
  let ringRadius = centerR + pairwiseGap(centerR, groupRadii.get(keys[1]) ?? 0, cfg.groupSpacing);
  let idx = 1;

  while (idx < keys.length) {
    const circumference = 2 * Math.PI * ringRadius;
    const ringGroups: string[] = [];
    let totalDiam = 0;

    while (idx < keys.length) {
      const r = groupRadii.get(keys[idx]) ?? 0;
      // Pairwise gap with previous group on ring (or first on ring)
      const prevOnRing = ringGroups.length > 0 ? (groupRadii.get(ringGroups[ringGroups.length - 1]) ?? 0) : r;
      const diam = r + prevOnRing + pairwiseGap(r, prevOnRing, cfg.groupSpacing);
      if (ringGroups.length > 0 && totalDiam + diam > circumference) break;
      ringGroups.push(keys[idx]);
      totalDiam += diam;
      idx++;
    }

    for (let j = 0; j < ringGroups.length; j++) {
      const angle = (j / ringGroups.length) * Math.PI * 2 - Math.PI / 2;
      out.set(ringGroups[j], {
        x: cfg.centerX + ringRadius * Math.cos(angle),
        y: cfg.centerY + ringRadius * Math.sin(angle),
      });
    }

    // Next ring: gap references max of current ring vs next group
    const ringMaxR = Math.max(...ringGroups.map(k => groupRadii.get(k) ?? 0));
    const nextR = idx < keys.length ? (groupRadii.get(keys[idx]) ?? 0) : ringMaxR;
    ringRadius += ringMaxR + pairwiseGap(ringMaxR, nextR, cfg.groupSpacing) + nextR;
    prevMaxR = ringMaxR;
  }
}

/**
 * Place groups on a 2D grid (rows × columns), centered on the canvas.
 * Columns are filled first (left to right), then rows (top to bottom).
 * Row heights and column widths adapt to the actual group radii so
 * large and small groups coexist without overlap.
 */
function layoutGroupsGrid(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  out: Map<string, { x: number; y: number }>,
  actualRadii?: Map<string, number>,
) {
  const n = keys.length;
  if (n === 0) return;

  // Step 3: Group radii
  const groupR: number[] = [];
  for (const key of keys) {
    const members = groups.get(key)!;
    groupR.push(actualRadii?.get(key)
      ?? estimateGroupRadius(members.length, cfg.nodeSize, cfg.nodeSpacing, cfg.groupScale, cfg.arrangement, members, cfg.maxNodeRadius ?? 60));
  }

  // Determine grid dimensions — aim for roughly square grid
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  // Compute per-column max width and per-row max height
  const colMaxR: number[] = new Array(cols).fill(0);
  const rowMaxR: number[] = new Array(rows).fill(0);
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    colMaxR[col] = Math.max(colMaxR[col], groupR[i]);
    rowMaxR[row] = Math.max(rowMaxR[row], groupR[i]);
  }

  // Step 4-5: Compute cell centers with pairwise gaps
  const cellCenterX: number[] = [];
  let xCursor = colMaxR[0];
  cellCenterX.push(xCursor);
  for (let c = 1; c < cols; c++) {
    xCursor += colMaxR[c - 1] + pairwiseGap(colMaxR[c - 1], colMaxR[c], cfg.groupSpacing) + colMaxR[c];
    cellCenterX.push(xCursor);
  }
  const totalW = xCursor + colMaxR[cols - 1];

  const cellCenterY: number[] = [];
  let yCursor = rowMaxR[0];
  cellCenterY.push(yCursor);
  for (let r = 1; r < rows; r++) {
    yCursor += rowMaxR[r - 1] + pairwiseGap(rowMaxR[r - 1], rowMaxR[r], cfg.groupSpacing) + rowMaxR[r];
    cellCenterY.push(yCursor);
  }
  const totalH = yCursor + rowMaxR[rows - 1];

  // Center the grid on the canvas
  const offsetX = cfg.centerX - totalW / 2;
  const offsetY = cfg.centerY - totalH / 2;

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.set(keys[i], {
      x: offsetX + cellCenterX[col],
      y: offsetY + cellCenterY[row],
    });
  }
}

/** Estimate a group's visual radius based on member count and base node size.
 *  When `members` array is provided, accounts for super node sizes. */
function estimateGroupRadius(
  memberCount: number,
  nodeSize: number,
  nodeSpacing: number,
  groupScale: number,
  arrangement?: ClusterArrangement,
  members?: GraphNode[],
  maxNodeRadius = 60,
): number {
  const gap = computeGroupGap(nodeSize, nodeSpacing, groupScale);
  // If any member is a super node, inflate the estimate using canonical effectiveRadius
  let superBonus = 0;
  if (members) {
    for (const m of members) {
      if (m.collapsedMembers && m.collapsedMembers.length > 0) {
        const sr = effectiveRadius(m, nodeSize, 0, maxNodeRadius, cfg.minNodeRadius ?? 12);
        superBonus = Math.max(superBonus, sr - nodeSize);
      }
    }
  }
  // Default: approximate footprint √n nodes across × gap
  return gap * Math.sqrt(memberCount) / 2 + superBonus;
}

// ---------------------------------------------------------------------------
// Multi-rule pipeline
// ---------------------------------------------------------------------------

function applyGroupRule(
  groups: Map<string, GraphNode[]>,
  rule: ClusterGroupRule,
  edges: GraphEdge[],
  degrees: Map<string, number>,
): Map<string, GraphNode[]> {
  const result = new Map<string, GraphNode[]>();
  for (const [parentKey, members] of groups) {
    const subGroups = partitionNodes(members, rule.groupBy, degrees);
    const finalSubs = rule.recursive
      ? splitByConnectedComponents(subGroups, edges)
      : subGroups;
    for (const [subKey, subMembers] of finalSubs) {
      const compositeKey = parentKey === "__all__" ? subKey : `${parentKey}::${subKey}`;
      result.set(compositeKey, subMembers);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function partitionNodes(
  nodes: GraphNode[],
  groupBy: string,
  degrees: Map<string, number>,
): Map<string, GraphNode[]> {
  const groups = new Map<string, GraphNode[]>();

  // Normalize "field:?" syntax → extract field name
  const field = groupBy.endsWith(":?") ? groupBy.slice(0, -2) : groupBy;

  for (const n of nodes) {
    let key: string;
    // Legacy enum values
    switch (field) {
      case "backlinks":
        key = backlinkBucket(degrees.get(n.id) || 0);
        break;
      case "node_type":
        key = n.isTag ? "tag" : (n.category || "file");
        break;
      case "none":
        key = "__all__";
        break;
      default: {
        // Generic field lookup via getNodeFieldValues (tag, folder, category, frontmatter, etc.)
        const vals = getNodeFieldValues(n, field);
        key = vals.length > 0 ? vals[0] : `__no_${field}__`;
        break;
      }
    }
    let arr = groups.get(key);
    if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(n);
  }

  return groups;
}

/**
 * Split each group into connected components based on edges.
 * Groups with a single component are unchanged; groups with multiple
 * components get split into separate sub-groups.
 */
function splitByConnectedComponents(
  groups: Map<string, GraphNode[]>,
  edges: GraphEdge[],
): Map<string, GraphNode[]> {
  const result = new Map<string, GraphNode[]>();

  for (const [key, members] of groups) {
    if (members.length <= 1) {
      result.set(key, members);
      continue;
    }

    // Build local adjacency
    const idSet = new Set(members.map(n => n.id));
    const adj = new Map<string, string[]>();
    for (const id of idSet) adj.set(id, []);
    for (const e of edges) {
      const sid = typeof e.source === "string" ? e.source : (e.source as unknown as GraphNode).id;
      const tid = typeof e.target === "string" ? e.target : (e.target as unknown as GraphNode).id;
      if (idSet.has(sid) && idSet.has(tid)) {
        adj.get(sid)!.push(tid);
        adj.get(tid)!.push(sid);
      }
    }

    // BFS to find connected components
    const visited = new Set<string>();
    const nodeMap = new Map(members.map(n => [n.id, n]));
    let compIdx = 0;

    for (const n of members) {
      if (visited.has(n.id)) continue;
      const comp: GraphNode[] = [];
      const queue = [n.id];
      visited.add(n.id);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        comp.push(nodeMap.get(cur)!);
        for (const nb of adj.get(cur) || []) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      const subKey = compIdx === 0 ? key : `${key}::${compIdx}`;
      result.set(subKey, comp);
      compIdx++;
    }
  }

  return result;
}

function backlinkBucket(deg: number): string {
  if (deg === 0) return "0";
  if (deg <= 2) return "1-2";
  if (deg <= 5) return "3-5";
  if (deg <= 10) return "6-10";
  return "11+";
}

// ---------------------------------------------------------------------------
// Intra-group arrangement (compute offsets relative to group center)
// ---------------------------------------------------------------------------

function computeOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  edges: GraphEdge[],
  cfg: ClusterForceConfig,
): ArrangementResult {
  const { nodeSpacing, groupScale, sortComparator, nodeSpacingMap } = cfg;
  const maxR = cfg.maxNodeRadius ?? 60;
  const minR = cfg.minNodeRadius ?? 15;

  // ═══════════════════════════════════════════════════════════════════
  // 6-Step Pipeline — order is FIXED regardless of arrangement pattern
  // ═══════════════════════════════════════════════════════════════════
  //
  // Step 1: Node size determination
  //   - nodeSize = user-set base (cfg.nodeSize), NOT inflated by max degree
  //   - Per-node radii are pre-computed via effectiveRadius() and passed
  //     to arrangement functions for pairwise spacing calculations.
  //
  // Step 2: Inter-node distance determination
  //   - Uses pairwiseGap(r_i, r_j, spacing) = max(r_i, r_j) * 2 * spacing
  //   - The LARGER node in each adjacent pair determines the gap.
  //   - For uniform patterns (grid/triangle): cell spacing = max node radius
  //     within the group, ensuring all cells fit the largest node.
  //
  // Steps 3-6 happen in computeFlatTargets after all groups are computed.
  // ═══════════════════════════════════════════════════════════════════

  // Step 1: Keep nodeSize as user-set base; compute max group node radius
  // separately for uniform-spacing patterns (grid, triangle, mountain).
  const nodeSize = Math.max(cfg.nodeSize, minR);
  const effR = (n: GraphNode) => effectiveRadius(n, cfg.nodeSize, degrees.get(n.id) ?? 0, maxR, minR);
  let maxGroupNodeR = nodeSize;
  if (members.length > 0) {
    for (const m of members) {
      const r = effR(m);
      if (r > maxGroupNodeR) maxGroupNodeR = r;
    }
  }

  // Default sort: degree descending (preserves legacy behaviour)
  const defaultSort = (a: GraphNode, b: GraphNode) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0);
  const cmp = sortComparator ?? defaultSort;

  // --- Routing ---
  // Arrangements whose presets use expression transforms (grid, triangle)
  // are handled entirely by the coordinate engine — no hardcoded function needed.
  // Other hardcoded arrangements (concentric, timeline, random)
  // keep their specialised functions when the layout matches the exact preset.
  const HARDCODED_ARRANGEMENTS = new Set<ClusterArrangement>([
    ARRANGEMENT_CONCENTRIC, ARRANGEMENT_RADIAL, ARRANGEMENT_RANDOM, ARRANGEMENT_TIMELINE,
  ]);

  let result: ArrangementResult;

  // Hardcoded arrangements use their specialised function when the coordinate
  // layout hasn't been customized (null or matches the arrangement's preset).
  if (HARDCODED_ARRANGEMENTS.has(cfg.arrangement)) {
    const preset = ARRANGEMENT_PRESETS[cfg.arrangement];
    const isDefault = !cfg.coordinateLayout ||
      JSON.stringify(cfg.coordinateLayout) === JSON.stringify(preset);
    if (isDefault) {
      result = dispatchHardcoded(cfg.arrangement, members, degrees, edges, nodeSpacing, groupScale, nodeSize, maxGroupNodeR, cmp, nodeSpacingMap, cfg);
      normalizeSpread(result, members.length, nodeSize, nodeSpacing, groupScale, cfg);
      return result;
    }
  }

  if (cfg.coordinateLayout) {
    const ctx: CoordinateContext = {
      degrees,
      edges,
      nodeSize,
      nodeSpacing,
      groupScale,
      getNodeProperty: cfg.getNodeProperty,
      totalNodeCount: cfg.totalNodeCount ?? members.length,
    };
    result = coordinateOffsets(members, degrees, edges, cfg.coordinateLayout, ctx);
    normalizeSpread(result, members.length, nodeSize, nodeSpacing, groupScale, cfg);
    return result;
  }

  // Fallback — legacy path
  result = dispatchHardcoded(cfg.arrangement, members, degrees, edges, nodeSpacing, groupScale, nodeSize, maxGroupNodeR, cmp, nodeSpacingMap, cfg);
  normalizeSpread(result, members.length, nodeSize, nodeSpacing, groupScale, cfg);
  return result;
}

// ---------------------------------------------------------------------------
// Spread normalization — scales all offsets so the bounding radius matches
// a reference formula (grid-equivalent: gap × √n / 2), ensuring nodes
// appear the same screen size after autoFitView regardless of arrangement.
//
// Skipped for: random (no structure), timeline (axis encodes data),
// groups with ≤2 members, or when normalizeArrangementSpread === false.
// ---------------------------------------------------------------------------

function normalizeSpread(
  result: ArrangementResult,
  memberCount: number,
  nodeSize: number,
  nodeSpacing: number,
  groupScale: number,
  cfg: ClusterForceConfig,
): void {
  if (cfg.normalizeArrangementSpread === false) return;
  // Skip patterns where positions have semantic meaning or no structure.
  // Polar-based patterns (radial, concentric) encode distance-from-center
  // semantically — normalizing would compress/expand the radial structure.
  const SKIP_NORMALIZE = new Set([ARRANGEMENT_RANDOM, ARRANGEMENT_TIMELINE, ARRANGEMENT_PHYLLOTAXIS, ARRANGEMENT_RADIAL, ARRANGEMENT_CONCENTRIC]);
  if (SKIP_NORMALIZE.has(cfg.arrangement)) return;
  // Also skip if coordinate layout uses polar system (custom polar expressions)
  if (cfg.coordinateLayout?.system === "polar") return;
  const offsets = result.offsets;
  if (offsets.size < 3) return;

  // Compute actual bounding radius (max distance from centroid)
  let cx = 0, cy = 0;
  for (const { dx, dy } of offsets.values()) {
    cx += dx; cy += dy;
  }
  cx /= offsets.size;
  cy /= offsets.size;

  let maxDist = 0;
  for (const { dx, dy } of offsets.values()) {
    const d = magnitude(dx - cx, dy - cy);
    if (d > maxDist) maxDist = d;
  }
  if (maxDist < 1) return;

  // Reference radius: grid-equivalent spread = gap × √n / 2
  const gap = computeGroupGap(nodeSize, nodeSpacing, groupScale);
  const targetRadius = gap * Math.sqrt(memberCount) / 2;
  if (targetRadius < 1) return;

  const ratio = targetRadius / maxDist;
  // Only normalize if spread differs significantly (>25% deviation)
  if (ratio > 0.75 && ratio < 1.33) return;

  // Scale all offsets around centroid
  for (const off of offsets.values()) {
    off.dx = cx + (off.dx - cx) * ratio;
    off.dy = cy + (off.dy - cy) * ratio;
  }

  // Also scale guide data so grid lines / bounds stay aligned with offsets
  if (result.guide) {
    scaleGuidePositions(result.guide, cx, cy, ratio);
  }
}

/** Scale all position data in a guide by the same ratio used for normalizeSpread. */
function scaleGuidePositions(guide: ArrangementGuide, cx: number, cy: number, ratio: number): void {
  const sx = (v: number) => cx + (v - cx) * ratio;
  const sy = (v: number) => cy + (v - cy) * ratio;
  switch (guide.type) {
    case ARRANGEMENT_GRID: {
      for (let i = 0; i < guide.verticals.length; i++) guide.verticals[i] = sx(guide.verticals[i]);
      for (let i = 0; i < guide.horizontals.length; i++) guide.horizontals[i] = sy(guide.horizontals[i]);
      guide.bounds.xMin = sx(guide.bounds.xMin);
      guide.bounds.xMax = sx(guide.bounds.xMax);
      guide.bounds.yMin = sy(guide.bounds.yMin);
      guide.bounds.yMax = sy(guide.bounds.yMax);
      break;
    }
    case GUIDE_TYPE_COORDINATE: {
      if (guide.bounds) {
        guide.bounds.xMin = sx(guide.bounds.xMin);
        guide.bounds.xMax = sx(guide.bounds.xMax);
        guide.bounds.yMin = sy(guide.bounds.yMin);
        guide.bounds.yMax = sy(guide.bounds.yMax);
        if (guide.bounds.maxR != null) guide.bounds.maxR *= Math.abs(ratio);
      }
      if (guide.gridInfo) {
        for (const line of guide.gridInfo.axis1Lines) line.position = sx(line.position);
        for (const line of guide.gridInfo.axis2Lines) line.position = sy(line.position);
      }
      break;
    }
    case ARRANGEMENT_TRIANGLE: {
      for (const v of guide.vertices) { v.x = sx(v.x); v.y = sy(v.y); }
      break;
    }
    case ARRANGEMENT_CONCENTRIC: {
      for (let i = 0; i < guide.rings.length; i++) guide.rings[i] *= Math.abs(ratio);
      break;
    }
    // timeline: skipped by normalizeSpread, should not reach here
  }
}

/** Dispatch to the hardcoded arrangement offset function by name */
function dispatchHardcoded(
  arrangement: ClusterArrangement,
  members: GraphNode[],
  degrees: Map<string, number>,
  edges: GraphEdge[],
  nodeSpacing: number,
  groupScale: number,
  nodeSize: number,
  maxGroupNodeR: number,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap: Map<string, number> | undefined,
  cfg: ClusterForceConfig,
): ArrangementResult {
  // Build unified params object once for all arrangement functions
  const p: ArrangementParams = {
    members, degrees, edges, nodeSpacing, groupScale,
    nodeSize, maxGroupNodeR, cmp, nodeSpacingMap, cfg,
  };

  // Step 2: Inter-node distance uses pairwise max reference.
  // - Sequential patterns (concentric, radial): use per-node radii + pairwiseGap
  // - Uniform patterns (grid, triangle): use maxGroupNodeR for cell spacing
  switch (arrangement) {
    case ARRANGEMENT_CONCENTRIC: return concentricOffsets(p);
    case ARRANGEMENT_RADIAL: return radialOffsets(p);
    case ARRANGEMENT_GRID: return gridOffsets(p);
    case ARRANGEMENT_TRIANGLE: return triangleOffsets(p);
    case ARRANGEMENT_RANDOM: return { offsets: randomOffsets(p) };
    case ARRANGEMENT_TIMELINE: return timelineOffsetsV2(p);
    case ARRANGEMENT_EGO: return egoOffsets(p);
    default: return { offsets: new Map() };
  }
}

// ---------------------------------------------------------------------------
// Concentric rings — adaptive ring spacing
//
// Ring 0 holds 1 node (center). Each subsequent ring's radius is computed
// so that nodes on the ring don't overlap: circumference ≥ sum of diameters.
// Ring capacity adapts to actual node radii.
// ---------------------------------------------------------------------------

function concentricOffsets(p: ArrangementParams): ArrangementResult {
  const { members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap, cfg } = p;
  const maxR = cfg.maxNodeRadius ?? 60;
  const minR = cfg.minNodeRadius ?? 15;
  const effR = (n: GraphNode) => effectiveRadius(n, nodeSize, degrees.get(n.id) ?? 0, maxR, minR);

  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const ringAssignments = new Map<string, number>();
  const n = sorted.length;
  if (n === 0) return { offsets };
  const ringRadii: number[] = [];

  // Precompute radii (super-node aware)
  const radii = sorted.map(nd => effR(nd));

  // Place center node at origin
  offsets.set(sorted[0].id, { dx: 0, dy: 0 });
  ringAssignments.set(sorted[0].id, 0);

  let idx = 1;
  let ringR = 0;
  let ringIdx = 0; // for angular offset per ring

  while (idx < n) {
    // Step 2: Advance to next ring using pairwise max-reference gap
    const prevR = ringR === 0 ? radii[0] : radii[Math.max(0, idx - 1)];
    const minGap = pairwiseGap(prevR, radii[idx], groupScale);
    ringR = Math.max(ringR + minGap, ringR + nodeSize * 2 * groupScale);
    ringRadii.push(ringR);
    ringIdx++;

    // Compute how many nodes fit on this ring (capacity from circumference)
    const circumference = 2 * Math.PI * ringR;
    let cap = 0;
    let totalDiam = 0;
    while (cap < n - idx) {
      const d = radii[idx + cap] * 2 * nodeSpacing * getSpacing(sorted[idx + cap].id, nodeSpacingMap);
      if (cap > 0 && totalDiam + d > circumference) break;
      totalDiam += d;
      cap++;
    }
    cap = Math.max(1, cap);

    // Extend capacity to include all tied nodes at the boundary
    // (prefer keeping tied nodes on the same ring over strict capacity)
    while (cap < n - idx && cmp(sorted[idx + cap - 1], sorted[idx + cap]) === 0) {
      cap++;
    }

    // Place nodes on this ring with angular offset to avoid spoke alignment
    const angleOffset = (ringIdx % 2 === 0) ? 0 : Math.PI / cap;
    for (let j = 0; j < cap && idx < n; j++, idx++) {
      const angle = (j / cap) * Math.PI * 2 + angleOffset;
      offsets.set(sorted[idx].id, {
        dx: ringR * Math.cos(angle),
        dy: ringR * Math.sin(angle),
      });
      ringAssignments.set(sorted[idx].id, ringR);
    }
  }
  return { offsets, ringAssignments, guide: { type: ARRANGEMENT_CONCENTRIC, rings: ringRadii } };
}

// ---------------------------------------------------------------------------
// Radial — nodes distributed along radial spokes from center
// Each spoke holds multiple nodes at increasing radii.
// spokeCount defaults to ceil(sqrt(n)), configurable via _spokeCount constant.
// ---------------------------------------------------------------------------

function radialOffsets(p: ArrangementParams): ArrangementResult {
  const { members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap, cfg } = p;
  const maxR = cfg.maxNodeRadius ?? 60;
  const minR = cfg.minNodeRadius ?? 15;
  const effR = (n: GraphNode) => effectiveRadius(n, nodeSize, degrees.get(n.id) ?? 0, maxR, minR);
  const spokeCount = cfg.userConstants?._spokeCount;

  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return { offsets };

  const radii = sorted.map(nd => effR(nd));
  const nSpokes = Math.max(2, spokeCount ?? Math.ceil(Math.sqrt(n)));

  // Place center node at origin
  offsets.set(sorted[0].id, { dx: 0, dy: 0 });

  // Distribute remaining nodes across spokes
  for (let i = 1; i < n; i++) {
    const spoke = (i - 1) % nSpokes;
    const posOnSpoke = Math.floor((i - 1) / nSpokes) + 1;
    const angle = (spoke / nSpokes) * 2 * Math.PI;
    // Cumulative radius: each position steps outward by node diameter + gap
    const gap = (radii[i] * 2 + nodeSize) * groupScale * nodeSpacing * getSpacing(sorted[i].id, nodeSpacingMap);
    const r = posOnSpoke * gap;
    offsets.set(sorted[i].id, {
      dx: r * Math.cos(angle),
      dy: r * Math.sin(angle),
    });
  }
  return { offsets };
}

// ---------------------------------------------------------------------------
// Grid — square grid sorted by degree (cols = √n)
// ---------------------------------------------------------------------------

function gridOffsets(p: ArrangementParams): ArrangementResult {
  const { members, degrees, nodeSpacing, groupScale, maxGroupNodeR: nodeSize, cmp, nodeSpacingMap } = p;
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  // DQ-15: ensure minimum spacing of one nodeSize to prevent overlap
  // Use pairwiseGap with maxGroupNodeR for uniform-spacing patterns
  const spacing = Math.max(pairwiseGap(nodeSize, nodeSize, Math.max(nodeSpacing, groupScale)), nodeSize);
  const c = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / c);
  const totalW = (c - 1) * spacing;
  const totalH = (rows - 1) * spacing;

  for (let i = 0; i < n; i++) {
    const col = i % c;
    const row = Math.floor(i / c);
    const ns = getSpacing(sorted[i].id, nodeSpacingMap);
    offsets.set(sorted[i].id, {
      dx: col * spacing * ns - totalW / 2,
      dy: row * spacing * ns - totalH / 2,
    });
  }

  // Build grid guide lines
  const verticals: number[] = [];
  const horizontals: number[] = [];
  for (let col = 0; col < c; col++) verticals.push(col * spacing - totalW / 2);
  for (let row = 0; row < rows; row++) horizontals.push(row * spacing - totalH / 2);
  const guide: GridGuide = {
    type: ARRANGEMENT_GRID,
    verticals,
    horizontals,
    bounds: { xMin: -totalW / 2 - spacing / 2, yMin: -totalH / 2 - spacing / 2, xMax: totalW / 2 + spacing / 2, yMax: totalH / 2 + spacing / 2 },
  };

  return { offsets, guide };
}

// ---------------------------------------------------------------------------
// Triangle — equilateral-triangle shape
//
// Nodes are arranged in a triangular shape: row 0 has 1 node, row 1 has 2,
// row 2 has 3, etc. Each row is centered horizontally, producing a clear
// equilateral triangle silhouette pointing upward.
// ---------------------------------------------------------------------------

function triangleOffsets(p: ArrangementParams): ArrangementResult {
  const { members, degrees, nodeSpacing, groupScale, maxGroupNodeR: nodeSize, cmp, nodeSpacingMap } = p;
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return { offsets };

  // Use pairwiseGap with maxGroupNodeR for uniform-spacing patterns
  const colSpacing = pairwiseGap(nodeSize, nodeSize, Math.max(nodeSpacing, groupScale));
  // Row spacing for equilateral triangle: h = colSpacing × √3/2
  const rowSpacing = colSpacing * Math.sqrt(3) / 2;

  // Determine number of rows: row k has (k+1) nodes, total = k*(k+1)/2
  // Find smallest numRows such that numRows*(numRows+1)/2 >= n
  let numRows = 1;
  while (numRows * (numRows + 1) / 2 < n) numRows++;

  // Build row assignments: row k gets (k+1) nodes, last row may be partial
  const maxRowWidth = (numRows - 1) * colSpacing; // width of the bottom (widest) row
  const totalH = (numRows - 1) * rowSpacing;
  let idx = 0;

  for (let row = 0; row < numRows && idx < n; row++) {
    const nodesInRow = Math.min(row + 1, n - idx);
    // Center this row: the row has nodesInRow nodes, bottom row has numRows
    const rowWidth = (nodesInRow - 1) * colSpacing;

    for (let col = 0; col < nodesInRow && idx < n; col++) {
      const ns = getSpacing(sorted[idx].id, nodeSpacingMap);
      offsets.set(sorted[idx].id, {
        dx: (col * colSpacing - rowWidth / 2) * ns,
        dy: (row * rowSpacing - totalH / 2) * ns,
      });
      idx++;
    }
  }

  // Build triangle guide: 3 vertices of the equilateral triangle
  const topY = -totalH / 2;
  const bottomY = totalH / 2;
  const bottomHalfW = maxRowWidth / 2;
  const guide: TriangleGuide = {
    type: ARRANGEMENT_TRIANGLE,
    vertices: [
      { x: 0, y: topY - rowSpacing * 0.3 },
      { x: -bottomHalfW - colSpacing * 0.3, y: bottomY + rowSpacing * 0.3 },
      { x: bottomHalfW + colSpacing * 0.3, y: bottomY + rowSpacing * 0.3 },
    ],
  };

  return { offsets, guide };
}

// ---------------------------------------------------------------------------
// Ego — center the highest-degree node, arrange neighbors by edge type
// ---------------------------------------------------------------------------

function egoOffsets(p: ArrangementParams): ArrangementResult {
  const { members, degrees, edges, nodeSpacing, groupScale, nodeSize } = p;
  const offsets = new Map<string, { dx: number; dy: number }>();
  if (members.length === 0) return { offsets };

  // Find center node (highest degree within group)
  let centerId = members[0].id;
  let centerDeg = 0;
  for (const m of members) {
    const d = degrees.get(m.id) ?? 0;
    if (d > centerDeg) { centerDeg = d; centerId = m.id; }
  }
  offsets.set(centerId, { dx: 0, dy: 0 });

  // Classify neighbors by edge type
  const memberSet = new Set(members.map(m => m.id));
  const buckets: Record<string, string[]> = {
    inheritParent: [], inheritChild: [],
    aggregation: [], similar: [], other: [],
  };

  for (const e of edges) {
    const isInGroup = memberSet.has(e.source) && memberSet.has(e.target);
    if (!isInGroup) continue;
    const neighborId = e.source === centerId ? e.target : e.target === centerId ? e.source : null;
    if (!neighborId) continue;

    if (e.type === EDGE_TYPE_INHERITANCE) {
      if (e.target === centerId) buckets.inheritParent.push(neighborId);
      else buckets.inheritChild.push(neighborId);
    } else if (e.type === EDGE_TYPE_AGGREGATION) {
      buckets.aggregation.push(neighborId);
    } else if (e.type === EDGE_TYPE_SIMILAR || e.type === EDGE_TYPE_SIBLING) {
      buckets.similar.push(neighborId);
    } else {
      buckets.other.push(neighborId);
    }
  }

  // Remove duplicates (a node may appear in multiple edges)
  const placed = new Set<string>([centerId]);
  const sectorDefs: { key: string; centerAngle: number; spread: number }[] = [
    { key: "inheritParent", centerAngle: (3 * Math.PI) / 2, spread: Math.PI / 3 }, // up
    { key: "inheritChild", centerAngle: Math.PI / 2, spread: Math.PI / 3 },         // down
    { key: "aggregation", centerAngle: Math.PI, spread: Math.PI / 3 },               // left
    { key: "similar", centerAngle: 0, spread: Math.PI / 3 },                         // right
    { key: "other", centerAngle: Math.PI / 4, spread: Math.PI / 2 },                 // diagonal
  ];

  const ringR = nodeSize * 3 * groupScale * nodeSpacing;

  for (const sector of sectorDefs) {
    const ids = (buckets[sector.key] ?? []).filter(id => !placed.has(id));
    if (ids.length === 0) continue;
    const startAngle = sector.centerAngle - sector.spread / 2;
    const step = ids.length > 1 ? sector.spread / (ids.length - 1) : 0;
    for (let i = 0; i < ids.length; i++) {
      const angle = startAngle + step * i;
      offsets.set(ids[i], {
        dx: ringR * Math.cos(angle),
        dy: ringR * Math.sin(angle),
      });
      placed.add(ids[i]);
    }
  }

  // Non-adjacent members → outer ring
  const outerR = ringR * 1.8;
  const remaining = members.filter(m => !placed.has(m.id));
  for (let i = 0; i < remaining.length; i++) {
    const angle = (i / Math.max(1, remaining.length)) * Math.PI * 2;
    offsets.set(remaining[i].id, {
      dx: outerR * Math.cos(angle),
      dy: outerR * Math.sin(angle),
    });
  }

  return { offsets };
}

// ---------------------------------------------------------------------------
// Timeline — 水平時間軸配置 (timeline-layout.ts に移動済み)
// dispatchHardcoded() から timelineOffsetsV2() を呼び出す
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Random — seeded scatter with collision avoidance
//
// Nodes are placed at pseudo-random positions within a disc whose radius
// scales with group size. A simple hash of the node ID seeds position so
// that the layout is deterministic (same data → same arrangement) yet
// visually chaotic.
// ---------------------------------------------------------------------------

function randomOffsets(p: ArrangementParams): Map<string, { dx: number; dy: number }> {
  const { members, degrees, nodeSpacing, groupScale, nodeSize, nodeSpacingMap, cfg } = p;
  const maxR = cfg.maxNodeRadius ?? 60;
  const minR = cfg.minNodeRadius ?? 15;
  const effR = (n: GraphNode) => effectiveRadius(n, nodeSize, degrees.get(n.id) ?? 0, maxR, minR);

  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = members.length;
  if (n === 0) return offsets;

  // Disc radius scales with member count (same formula as estimateGroupRadius)
  const gap = computeGroupGap(nodeSize, nodeSpacing, groupScale);
  const discR = gap * Math.sqrt(n) / 2;

  // Simple deterministic hash → [0,1) from node ID
  function hashF(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    }
    return ((h >>> 0) % 10007) / 10007;
  }

  // Place each node using two hash values for angle and radius
  const placed: { x: number; y: number; r: number }[] = [];
  for (const nd of members) {
    const nr = effR(nd);
    const ns = getSpacing(nd.id, nodeSpacingMap);
    const minDist = nr * 2 * nodeSpacing * ns;

    // Generate candidate from hash
    const h1 = hashF(nd.id);
    const h2 = hashF(nd.id + "_2");
    const angle = h1 * Math.PI * 2;
    const radius = Math.sqrt(h2) * discR; // sqrt for uniform area distribution
    let dx = radius * Math.cos(angle);
    let dy = radius * Math.sin(angle);

    // Nudge away from collisions (simple iterative push)
    for (let iter = 0; iter < 8; iter++) {
      let pushed = false;
      for (const p of placed) {
        const ddx = dx - p.x;
        const ddy = dy - p.y;
        const dist = magnitude(ddx, ddy);
        const required = minDist + p.r;
        if (dist < required && dist > 0.01) {
          const push = (required - dist) * 0.6;
          dx += (ddx / dist) * push;
          dy += (ddy / dist) * push;
          pushed = true;
        }
      }
      if (!pushed) break;
    }

    placed.push({ x: dx, y: dy, r: minDist / 2 });
    offsets.set(nd.id, { dx, dy });
  }
  return offsets;
}

// ---------------------------------------------------------------------------
// Enclosure separation — per-tick position nudge (not static target mutation)
// ---------------------------------------------------------------------------

/**
 * Apply a mild position nudge to separate overlapping enclosure groups.
 * Called each tick AFTER the cluster blend, so the pattern is preserved
 * (blend pulls 85% back to target; nudge creates a small stable offset).
 *
 * Max nudge per node per tick is capped to prevent pattern destruction.
 */
function nudgeEnclosureGroups(
  nodeIdx: Map<string, GraphNode>,
  tagMembership: Map<string, Set<string>>,
  nodeSpacing: number,
  nodeSize: number,
): void {
  const tags = [...tagMembership.keys()];
  if (tags.length < 2) return;

  // Compute centroid + extent per tag from current positions
  const centroids: { tag: string; cx: number; cy: number; r: number }[] = [];
  for (const tag of tags) {
    const ids = tagMembership.get(tag)!;
    const points = [...ids].map(id => nodeIdx.get(id)).filter((n): n is GraphNode => !!n);
    if (points.length === 0) continue;
    const bb = computeBBoxWithCentroid(points);
    const r = Math.max(30, Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2);
    centroids.push({ tag, cx: bb.cx, cy: bb.cy, r });
  }

  // Cap: maximum position nudge per node per tick
  const maxNudge = nodeSize * 0.5;

  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      const a = centroids[i], b = centroids[j];
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const dist = magnitude(dx, dy);
      const desiredDist = (a.r + b.r) * nodeSpacing;
      if (dist >= desiredDist) continue;

      const nx = dist > 1 ? dx / dist : 1;
      const ny = dist > 1 ? dy / dist : 0;
      // Gentle nudge proportional to overlap, capped
      const rawNudge = (desiredDist - dist) * 0.02;
      const nudge = Math.min(rawNudge, maxNudge);

      const idsA = tagMembership.get(a.tag)!;
      const idsB = tagMembership.get(b.tag)!;
      for (const id of idsA) {
        const n = nodeIdx.get(id);
        if (!n) continue;
        const w = idsB.has(id) ? 0.05 : 1.0;
        n.x -= nx * nudge * w;
        n.y -= ny * nudge * w;
      }
      for (const id of idsB) {
        const n = nodeIdx.get(id);
        if (!n) continue;
        const w = idsA.has(id) ? 0.05 : 1.0;
        n.x += nx * nudge * w;
        n.y += ny * nudge * w;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-fit spacing computation
// ---------------------------------------------------------------------------

interface BBox {
  minX: number; minY: number; maxX: number; maxY: number;
}

/** Alias for effectiveRadius (used by auto-fit computation) */

/** Estimate label width for a node (approximation: 7px per char) */
function estimateLabelWidth(n: GraphNode): number {
  const label = n.label || n.id;
  // Super nodes have "(N)" suffix appended
  const suffix = n.collapsedMembers ? ` (${n.collapsedMembers.length})` : "";
  return (label.length + suffix.length) * 7;
}

/**
 * Compute optimal nodeSpacing, groupScale, and groupSpacing values
 * that eliminate group/node overlap.
 *
 * Algorithm: run buildClusterForce with trial spacing values,
 * snap nodes to targets, measure pairwise overlap using visual radii
 * (including super node sizes and label widths), then iteratively
 * increase spacing until overlaps are resolved (up to 3 passes).
 */
export function computeAutoFitSpacing(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  baseCfg: ClusterForceConfig,
): { nodeSpacing: number; groupScale: number; groupSpacing: number } {
  // Upper bounds (match slider maximums)
  // When group overlap is skipped (e.g. timeline), keep spacing moderate
  const constrained = !!baseCfg.skipGroupOverlap;
  const MAX_NODE_SPACING = constrained ? 4 : 10;
  const MAX_GROUP_SCALE = constrained ? 3 : 5;
  const MAX_GROUP_SPACING = constrained ? 2 : 5;

  // Start from the base config's values, clamped to current maximums
  let nodeSpacing = Math.min(baseCfg.nodeSpacing, MAX_NODE_SPACING);
  let groupScale = Math.min(baseCfg.groupScale, MAX_GROUP_SCALE);
  let groupSpacing = Math.min(baseCfg.groupSpacing, MAX_GROUP_SPACING);

  const baseSize = baseCfg.nodeSize;

  // Limit iterations for large graphs — O(n²) overlap detection is too expensive
  const maxIterations = nodes.length > 500 ? 2 : 5;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const cfg: ClusterForceConfig = {
      ...baseCfg,
      nodeSpacing,
      groupScale,
      groupSpacing,
      totalNodeCount: nodes.length,
    };

    const result = buildClusterForce(nodes, edges, degrees, cfg);
    if (!result) break;

    // Snapshot positions, apply force once, read targets, restore
    const saved = nodes.map(n => ({ x: n.x, y: n.y, vx: n.vx, vy: n.vy }));
    result.force(1.0);
    const targets = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = saved[i].x; nodes[i].y = saved[i].y;
      nodes[i].vx = saved[i].vx; nodes[i].vy = saved[i].vy;
    }

    // Build per-node info: target position, visual radius, label half-width
    const nodeInfos = nodes.map((n, i) => {
      const deg = degrees.get(n.id) ?? 0;
      const r = effectiveRadius(n, baseSize, deg);
      const labelHW = estimateLabelWidth(n) / 2;
      const group = result.metadata.nodeClusterMap.get(n.id) ?? "__none__";
      return { id: n.id, x: targets[i].x, y: targets[i].y, r, labelHW, group };
    });

    // --- Detect overlaps ---
    let maxOverlapRatio = 0;
    let hasNodeOverlap = false;
    let hasCrossGroupOverlap = false;

    // 1. Grid-based node overlap detection — O(n) instead of O(n²)
    //    Bucket nodes into spatial grid cells, only compare within neighboring cells.
    {
      const LABEL_H = 12;
      // Cell size: max extent of any node (radius + label)
      let maxExtent = 40;
      for (const ni of nodeInfos) {
        const ext = Math.max(ni.r, ni.labelHW) + ni.r + LABEL_H;
        if (ext > maxExtent) maxExtent = ext;
      }
      const cellSize = maxExtent * 2;
      const grid = new Map<string, number[]>();
      for (let i = 0; i < nodeInfos.length; i++) {
        const ni = nodeInfos[i];
        const gx = Math.floor(ni.x / cellSize);
        const gy = Math.floor(ni.y / cellSize);
        const key = `${gx},${gy}`;
        let arr = grid.get(key);
        if (!arr) { arr = []; grid.set(key, arr); }
        arr.push(i);
      }
      // Check 3×3 neighborhood per cell (avoids duplicates via i < j)
      for (const [key, indices] of grid) {
        const [gxStr, gyStr] = key.split(",");
        const gx = parseInt(gxStr, 10);
        const gy = parseInt(gyStr, 10);
        // Collect neighboring indices
        const neighbors: number[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nk = `${gx + dx},${gy + dy}`;
            const arr = grid.get(nk);
            if (arr) neighbors.push(...arr);
          }
        }
        for (const i of indices) {
          const a = nodeInfos[i];
          for (const j of neighbors) {
            if (j <= i) continue;
            const b = nodeInfos[j];
            const ddx = Math.abs(a.x - b.x);
            const ddy = Math.abs(a.y - b.y);
            const hExtA = Math.max(a.r, a.labelHW);
            const hExtB = Math.max(b.r, b.labelHW);
            const minDx = hExtA + hExtB;
            const vExtA = a.r + LABEL_H;
            const vExtB = b.r + LABEL_H;
            const minDy = vExtA + vExtB;
            const overlapX = minDx - ddx;
            const overlapY = minDy - ddy;
            if (overlapX > 0 && overlapY > 0) {
              hasNodeOverlap = true;
              if (a.group !== b.group) {
                hasCrossGroupOverlap = true;
                const overlapArea = overlapX * overlapY;
                const minExtent = minDx * minDy * 4;
                const ratio = overlapArea / (minExtent || 1);
                if (ratio > maxOverlapRatio) maxOverlapRatio = ratio;
              }
            }
          }
        }
      }
    }

    // 2. Group BBox overlap detection (catches cases where individual nodes
    //    don't overlap but group footprints do)
    const groupNodes = new Map<string, typeof nodeInfos>();
    for (const ni of nodeInfos) {
      if (!groupNodes.has(ni.group)) groupNodes.set(ni.group, []);
      groupNodes.get(ni.group)!.push(ni);
    }
    const groupKeys = [...groupNodes.keys()].filter(k => k !== "__none__");
    if (groupKeys.length > 1) {
      const groupBBoxes = new Map<string, BBox>();
      const pad = baseSize * 2;
      for (const k of groupKeys) {
        const members = groupNodes.get(k)!;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of members) {
          if (m.x - m.r < minX) minX = m.x - m.r;
          if (m.y - m.r < minY) minY = m.y - m.r;
          if (m.x + m.r > maxX) maxX = m.x + m.r;
          if (m.y + m.r > maxY) maxY = m.y + m.r;
        }
        groupBBoxes.set(k, { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad });
      }
      for (let i = 0; i < groupKeys.length; i++) {
        for (let j = i + 1; j < groupKeys.length; j++) {
          const a = groupBBoxes.get(groupKeys[i])!;
          const b = groupBBoxes.get(groupKeys[j])!;
          const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
          const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
          if (ox > 0 && oy > 0) {
            hasCrossGroupOverlap = true;
            hasNodeOverlap = true;
            const overlapArea = ox * oy;
            const aArea = (a.maxX - a.minX) * (a.maxY - a.minY);
            const bArea = (b.maxX - b.minX) * (b.maxY - b.minY);
            const ratio = overlapArea / (Math.min(aArea, bArea) || 1);
            if (ratio > maxOverlapRatio) maxOverlapRatio = ratio;
          }
        }
      }

      // 3. Group-level bounding circle overlap check
      const simRadii = result.metadata.clusterRadii;
      const simCentroids = result.metadata.clusterCentroids;
      for (let i = 0; i < groupKeys.length; i++) {
        for (let j = i + 1; j < groupKeys.length; j++) {
          const gA = groupKeys[i];
          const gB = groupKeys[j];
          const rA = simRadii.get(gA) ?? 0;
          const rB = simRadii.get(gB) ?? 0;
          const cA = simCentroids.get(gA);
          const cB = simCentroids.get(gB);
          if (!cA || !cB || rA < 1 || rB < 1) continue;
          const cdx = cB.x - cA.x;
          const cdy = cB.y - cA.y;
          const dist = magnitude(cdx, cdy);
          if (dist < (rA + rB) * 1.1) {
            hasCrossGroupOverlap = true;
            hasNodeOverlap = true;
            const circleOverlap = (rA + rB) * 1.1 - dist;
            const ratio = circleOverlap / ((rA + rB) || 1);
            if (ratio > maxOverlapRatio) maxOverlapRatio = ratio;
          }
        }
      }
    }

    // If no overlaps detected, we're done
    if (!hasNodeOverlap) break;

    // Adjust spacing values based on overlap type
    if (hasCrossGroupOverlap) {
      // Cross-group overlap: increase group spacing and scale
      const scaleFactor = 1 + Math.max(maxOverlapRatio, 0.3) * 2.0;
      groupSpacing = Math.min(groupSpacing * scaleFactor, MAX_GROUP_SPACING);
      groupScale = Math.min(groupScale * (1 + Math.max(maxOverlapRatio, 0.2)), MAX_GROUP_SCALE);
    }
    if (hasNodeOverlap && !hasCrossGroupOverlap) {
      // Intra-group node overlap only: increase node spacing
      nodeSpacing = Math.min(nodeSpacing * 1.5, MAX_NODE_SPACING);
    }
  }

  return {
    nodeSpacing: Math.round(nodeSpacing * 10) / 10,
    groupScale: Math.round(groupScale * 10) / 10,
    groupSpacing: Math.round(groupSpacing * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Auto-optimize: overlap analysis
// ---------------------------------------------------------------------------
export function analyzeOverlap(
  nodes: { id: string; x: number; y: number }[],
  radii: Map<string, number>,
  closeThresholdFactor: number,
): { overlapRatio: number; avgRadius: number; closePairs: number; overlapPairs: number } {
  if (nodes.length < 2) return { overlapRatio: 0, avgRadius: 0, closePairs: 0, overlapPairs: 0 };

  // Sample if too many nodes
  const MAX_SAMPLE = 500;
  let sample = nodes;
  if (nodes.length > MAX_SAMPLE) {
    const shuffled = [...nodes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    sample = shuffled.slice(0, MAX_SAMPLE);
  }

  let totalR = 0;
  let rCount = 0;
  for (const n of sample) {
    const r = radii.get(n.id);
    if (r !== undefined) { totalR += r; rCount++; }
  }
  const avgRadius = rCount > 0 ? totalR / rCount : 6;
  const closeThreshold = avgRadius * closeThresholdFactor;

  let closePairs = 0;
  let overlapPairs = 0;
  for (let i = 0; i < sample.length; i++) {
    const a = sample[i];
    const ra = radii.get(a.id) ?? avgRadius;
    for (let j = i + 1; j < sample.length; j++) {
      const b = sample[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = magnitude(dx, dy);
      if (dist < closeThreshold) {
        closePairs++;
        const rb = radii.get(b.id) ?? avgRadius;
        if (dist < ra + rb) overlapPairs++;
      }
    }
  }

  return {
    overlapRatio: overlapPairs / Math.max(1, closePairs),
    avgRadius,
    closePairs,
    overlapPairs,
  };
}

// ---------------------------------------------------------------------------
// Auto-optimize: compute adjusted parameters
// ---------------------------------------------------------------------------
export function computeAutoOptimize(
  overlapRatio: number,
  avgRadius: number,
  currentConstants: Record<string, number>,
  currentRepel: number,
  currentLinkDist: number,
  cfg: {
    overlapThreshold: number; padIncrement: number; padMax: number;
    repelScale: number; linkScale: number;
  },
): { constants: Record<string, number>; repelForce: number; linkDistance: number; needsMore: boolean } {
  if (overlapRatio <= cfg.overlapThreshold) {
    return { constants: { ...currentConstants }, repelForce: currentRepel, linkDistance: currentLinkDist, needsMore: false };
  }

  const constants = { ...currentConstants };
  const curPad = constants["_overlapPad"] ?? 0;
  constants["_overlapPad"] = Math.min(curPad + cfg.padIncrement, cfg.padMax);
  const curGap = constants["_minGap"] ?? 0;
  constants["_minGap"] = Math.max(curGap, avgRadius * 0.5);

  return {
    constants,
    repelForce: currentRepel * cfg.repelScale,
    linkDistance: currentLinkDist * cfg.linkScale,
    needsMore: true,
  };
}
