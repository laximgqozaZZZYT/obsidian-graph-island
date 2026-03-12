/**
 * Cluster arrangement force for the Force layout.
 *
 * Groups nodes by a chosen criterion, assigns each group a fixed position,
 * then arranges nodes within each group according to the chosen pattern.
 *
 * Inter-group placement:
 *  - tree: horizontal row
 *  - others: circle around canvas center
 *
 * Intra-group arrangement:
 *  - spiral: Archimedean spiral (r = aθ, equal arc-length spacing)
 *  - concentric: concentric rings, radius ∝ group node count
 *  - tree: BFS layers top-down
 *  - grid: m×n grid sorted by degree
 *  - mountain: peak-at-top with exponentially widening rows
 *  - random: seeded scatter with collision avoidance
 *  - sunburst: radial sectors with concentric arc-rings per group
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
import { resolveArrangementFromLayout, isExactPreset } from "./coordinate-presets";
import { coordinateOffsets, type CoordinateGuide, type CoordinateContext } from "./coordinate-engine";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A single arc segment for sunburst guide lines */
export interface SunburstArc {
  /** Group key this arc belongs to */
  groupKey: string;
  /** Depth tier (0=core, 1=body, 2=periphery) */
  depth: number;
  /** Inner radius of the band */
  rInner: number;
  /** Outer radius of the band */
  rOuter: number;
  /** Start angle (radians) */
  startAngle: number;
  /** End angle (radians) */
  endAngle: number;
  /** Center X */
  cx: number;
  /** Center Y */
  cy: number;
}

// ---------------------------------------------------------------------------
// ArrangementResult — unified return type from all *Offsets() functions
// ---------------------------------------------------------------------------

/** Guide data for timeline arrangement */
export interface TimelineGuide {
  type: "timeline";
  axisY: number;
  ticks: { x: number; label: string }[];
}

/** Guide data for spiral arrangement */
export interface SpiralGuide {
  type: "spiral";
  a: number;
  maxTheta: number;
}

/** Guide data for grid arrangement */
export interface GridGuide {
  type: "grid";
  verticals: number[];
  horizontals: number[];
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number };
}

/** Guide data for tree arrangement */
export interface TreeGuide {
  type: "tree";
  depthLevels: { y: number; label: string }[];
  xMin: number;
  xMax: number;
}

/** Guide data for triangle arrangement */
export interface TriangleGuide {
  type: "triangle";
  vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
}

/** Guide data for mountain arrangement */
export interface MountainGuide {
  type: "mountain";
  points: { x: number; y: number }[];
}

export type ArrangementGuide =
  | TimelineGuide
  | SpiralGuide
  | GridGuide
  | TreeGuide
  | TriangleGuide
  | MountainGuide
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
}

/** Guide line data collected from all groups */
export interface GuideLineData {
  arrangement: string;
  groups: { groupKey: string; centerX: number; centerY: number; guide: ArrangementGuide }[];
}

/** Metadata about cluster assignments, exposed for edge bundling. */
export interface ClusterMetadata {
  /** Maps node ID → cluster group key */
  nodeClusterMap: Map<string, string>;
  /** Maps cluster group key → target center position */
  clusterCentroids: Map<string, { x: number; y: number }>;
  /** Maps cluster group key → estimated visual radius */
  clusterRadii: Map<string, number>;
  /** Sunburst arc segments for guide line rendering (only set for sunburst arrangement) */
  sunburstArcs?: SunburstArc[];
  /** Timeline bar data (only set for timeline arrangement with duration bars) */
  timelineBars?: TimelineBarInfo[];
  /** Guide line data for arrangement visualization */
  guideLineData?: GuideLineData;
  /** Synthetic sequence edges generated from timeline ordering */
  sequenceEdges?: GraphEdge[];
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
  /** Whether node radius scales with degree (backlink count) */
  scaleByDegree: boolean;
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
  /** Comma-separated order fields for link-based ordering (e.g. "next,prev,parent_id,story_order") */
  timelineOrderFields?: string;
  /** Guide line mode: "shared" or "per-group" (timeline only) */
  guideLineMode?: "shared" | "per-group";
  /** Accessor for node frontmatter values (for timeline arrangement) */
  getNodeProperty?: (nodeId: string, key: string) => string | undefined;
  /** Resolved coordinate layout configuration */
  coordinateLayout?: CoordinateLayout;
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
  iterations: number = 5,
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
      const d = Math.sqrt((t.x - centroid.x) ** 2 + (t.y - centroid.y) ** 2);
      if (d > maxDist) maxDist = d;
    }
    // Use the larger of estimated and actual radius (actual captures orbit rings, etc.)
    const estimated = clusterRadii.get(key) ?? 0;
    const effective = Math.max(estimated, maxDist + 10); // +10 for node visual extent
    actualRadii.set(key, effective);
    clusterRadii.set(key, effective); // Update for downstream consumers
  }

  for (let iter = 0; iter < iterations; iter++) {
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
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (rA + rB) * 1.3; // 30% padding for visual breathing room

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

export function buildClusterForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): ClusterForceResult | null {
  if (cfg.groupRules.length === 0) return null;

  // Multi-rule pipeline: each rule subdivides the previous groups
  let groups = new Map<string, GraphNode[]>([["__all__", [...nodes]]]);
  for (const rule of cfg.groupRules) {
    groups = applyGroupRule(groups, rule, edges, degrees);
  }
  if (groups.size === 0) return null;

  // Parent-aware merge: collapse small connected-component sub-groups
  // back into their parent tag group, preserving tag-level structure.
  const minGroupSize = nodes.length >= 100 ? Math.max(3, Math.ceil(nodes.length * 0.005)) : 2;
  {
    // Build parent → child key mapping from "::" separator
    const pm = new Map<string, string[]>();
    for (const key of groups.keys()) {
      const parent = key.replace(/::.*$/, "");
      if (!pm.has(parent)) pm.set(parent, []);
      pm.get(parent)!.push(key);
    }
    // Phase 1: merge small CCs back into their parent tag group
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
    // Phase 2: merge remaining standalone tiny groups into __other__
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
    groups = merged;
  }
  if (groups.size === 0) return null;

  const { targets, sunburstArcs, guideGroups, allBars, allSequenceEdges } = computeAbsoluteTargets(groups, edges, degrees, cfg);

  // Build cluster metadata for edge bundling
  const nodeClusterMap = new Map<string, string>();
  const clusterCentroids = new Map<string, { x: number; y: number }>();
  const clusterRadii = new Map<string, number>();
  for (const [key, members] of groups) {
    for (const n of members) nodeClusterMap.set(n.id, key);
    // Compute centroid from target positions (will be updated live by caller)
    let sx = 0, sy = 0;
    for (const n of members) {
      const t = targets.get(n.id);
      if (t) { sx += t.x; sy += t.y; }
    }
    clusterCentroids.set(key, { x: sx / members.length, y: sy / members.length });
    clusterRadii.set(key, estimateGroupRadius(members.length, cfg.nodeSize, cfg.groupScale, cfg.arrangement, members));
  }

  // Snapshot bar node positions before overlap resolution
  const barNodePosBefore = new Map<string, { x: number; y: number }>();
  if (allBars && allBars.length > 0) {
    for (const bar of allBars) {
      const t = targets.get(bar.nodeId);
      if (t) barNodePosBefore.set(bar.nodeId, { x: t.x, y: t.y });
    }
  }

  // Resolve pairwise group overlaps (especially important after super node expansion)
  // Skip for timeline: unified timeline already handles Y-band separation
  // Skip for sunburst: all groups share a single center — overlap resolution destroys radial layout
  if (cfg.arrangement !== "timeline" && cfg.arrangement !== "sunburst") {
    resolveGroupOverlaps(targets, groups, clusterRadii, clusterCentroids);
  }

  // Re-align timeline bars with post-overlap node target positions
  if (allBars && allBars.length > 0) {
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

  // Also re-align guide line data with post-overlap positions
  if (guideGroups && guideGroups.length > 0) {
    for (const gg of guideGroups) {
      const centroid = clusterCentroids.get(gg.groupKey);
      if (centroid) {
        gg.centerX = centroid.x;
        gg.centerY = centroid.y;
      }
    }
  }

  // Build guide line data from arrangement results
  const guideLineData: GuideLineData | undefined = guideGroups && guideGroups.length > 0
    ? { arrangement: cfg.arrangement, groups: guideGroups }
    : undefined;

  // Timeline bars (already in absolute coordinates, adjusted for overlap resolution)
  const timelineBars = allBars && allBars.length > 0 ? allBars : undefined;

  // Build node index for enclosure separation (if active)
  const tagMem = cfg.tagMembership;
  const encSpacing = cfg.enclosureSpacing ?? 1.5;
  const nodeIdx = tagMem ? new Map(nodes.map(n => [n.id, n])) : null;

  const force = (_alpha: number) => {
    // Fixed high blend — always snap strongly to target positions
    const blend = 0.85;

    for (const n of nodes) {
      const t = targets.get(n.id);
      if (!t) continue;
      n.x += (t.x - n.x) * blend;
      n.y += (t.y - n.y) * blend;
      n.vx = 0;
      n.vy = 0;
    }

    // Enclosure separation nudge — disabled pending investigation
    // if (tagMem && nodeIdx) {
    //   nudgeEnclosureGroups(nodeIdx, tagMem, encSpacing, cfg.nodeSize);
    // }
  };

  return { force, metadata: { nodeClusterMap, clusterCentroids, clusterRadii, sunburstArcs, timelineBars, guideLineData, sequenceEdges: allSequenceEdges } };
}

// ---------------------------------------------------------------------------
// Node radius helper (mirrors GraphViewContainer nodeR formula)
// ---------------------------------------------------------------------------

/** Look up per-node spacing multiplier (defaults to 1.0 if absent). */
function getSpacing(id: string, map?: Map<string, number>): number {
  return map?.get(id) ?? 1.0;
}

/** Visual radius of a node — same formula as GraphViewContainer.nodeR */
function nodeRadius(nodeSize: number, degree: number, scaleByDegree: boolean): number {
  if (!scaleByDegree) return nodeSize;
  return Math.max(nodeSize, nodeSize + Math.sqrt(degree) * 3.2);
}

const MAX_NODE_RADIUS = 30;

/** Effective visual radius accounting for super nodes (collapsed groups).
 *  Mirrors RenderPipeline: rawR = nodeR * (1 + sqrt(memberCount) * 0.5), cap 30 */
function effectiveRadius(n: GraphNode, nodeSize: number, degree: number, scaleByDegree: boolean): number {
  const baseR = nodeRadius(nodeSize, degree, scaleByDegree);
  if (n.collapsedMembers && n.collapsedMembers.length > 0) {
    return Math.min(Math.max(baseR, baseR * (1 + Math.sqrt(n.collapsedMembers.length) * 0.5)), MAX_NODE_RADIUS);
  }
  return baseR;
}

// ---------------------------------------------------------------------------
// Absolute target computation
// ---------------------------------------------------------------------------

interface AbsoluteTargetResult {
  targets: Map<string, { x: number; y: number }>;
  sunburstArcs?: SunburstArc[];
  guideGroups?: FlatTargetResult["guideGroups"];
  allBars?: TimelineBarInfo[];
  allSequenceEdges?: GraphEdge[];
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
    const ctx: CoordinateContext = {
      degrees,
      edges,
      nodeSize: cfg.nodeSize,
      nodeSpacing: cfg.nodeSpacing,
      groupScale: cfg.groupScale,
      getNodeProperty: cfg.getNodeProperty,
    };
    const result = coordinateOffsets(allMembers, degrees, edges, cfg.coordinateLayout, ctx);
    const targets = new Map<string, { x: number; y: number }>();
    for (const n of allMembers) {
      const off = result.offsets.get(n.id);
      targets.set(n.id, {
        x: cfg.centerX + (off?.dx ?? 0),
        y: cfg.centerY + (off?.dy ?? 0),
      });
    }
    const guideGroups: FlatTargetResult["guideGroups"] = [];
    if (result.guide) {
      guideGroups.push({ groupKey: "__all__", centerX: cfg.centerX, centerY: cfg.centerY, guide: result.guide });
    }
    return { targets, guideGroups, allBars: [], allSequenceEdges: undefined };
  }

  // Detect parent-child hierarchy from composite keys ("::" from splitByConnectedComponents)
  const parentMap = new Map<string, string[]>();
  for (const key of groups.keys()) {
    const parent = key.replace(/::.*$/, "");
    if (!parentMap.has(parent)) parentMap.set(parent, []);
    parentMap.get(parent)!.push(key);
  }
  const hasHierarchy = [...parentMap.values()].some(ch => ch.length > 1);

  // SunBurst uses its own global layout (angle sectors per group)
  if (cfg.arrangement === "sunburst") {
    return computeSunburstTargets(groups, parentMap, degrees, cfg);
  }

  if (hasHierarchy) {
    const r = computeHierarchicalTargets(groups, parentMap, edges, degrees, cfg);
    return { targets: r.targets, guideGroups: r.guideGroups, allBars: r.allBars, allSequenceEdges: r.allSequenceEdges };
  }
  const r = computeFlatTargets(groups, edges, degrees, cfg);
  return { targets: r.targets, guideGroups: r.guideGroups, allBars: r.allBars, allSequenceEdges: r.allSequenceEdges };
}

// ---------------------------------------------------------------------------
// SunBurst — hierarchical radial sector layout (baumkuchen diagram style)
//
// Two-level hierarchy:
//
//   Level 0 (inner band):  Parent groups share the full 360°.
//     Each parent gets a proportional angular sector.
//     The highest-priority nodes (by sort) fill the inner ring(s).
//
//   Level 1 (outer bands):  Sub-groups (from recursive CC splitting)
//     Each sub-group gets a proportional sub-sector within its parent's
//     angular range.  Remaining nodes fill outward ring by ring.
//
// When there is NO hierarchy (flat groups), the inner ring is filled
// with the top-priority nodes across all groups, then groups fan out.
// ---------------------------------------------------------------------------

function computeSunburstTargets(
  groups: Map<string, GraphNode[]>,
  parentMap: Map<string, string[]>,
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): AbsoluteTargetResult {
  const targets = new Map<string, { x: number; y: number }>();
  const arcs: SunburstArc[] = [];

  let totalNodes = 0;
  for (const members of groups.values()) totalNodes += members.length;
  if (totalNodes === 0) return { targets, sunburstArcs: arcs };

  const cx = cfg.centerX;
  const cy = cfg.centerY;
  const nodeDiam = cfg.nodeSize * 2;

  // --- Ring geometry ---
  // For sunburst, use tighter packing than other arrangements:
  // - Angular spacing uses nodeWidth (node diameter * nodeSpacing) but scaled down
  //   since radial separation already provides visual distinction.
  // - Ring thickness matches nodeDiam with minimal spacing.
  // - Center hole is compact to maximize usable area.
  const nodeWidth = nodeDiam * Math.max(cfg.nodeSpacing * 0.5, 1.0);
  const ringThick = nodeDiam * Math.max(cfg.nodeSpacing * 0.5, 1.0);
  const ringGap = nodeDiam * cfg.groupScale * 0.06;
  const centerHole = nodeDiam * cfg.groupScale * 1.0;

  // Sort helper
  const sortNodes = (arr: GraphNode[]) => {
    if (cfg.sortComparator) return [...arr].sort(cfg.sortComparator);
    return [...arr].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
  };

  // --- Build parent-level super groups ---
  // parentKeys: unique parent group names (without "::" suffix)
  const parentKeys = [...parentMap.keys()];
  const parentNodeCount = new Map<string, number>();
  for (const [parent, childKeys] of parentMap) {
    let count = 0;
    for (const ck of childKeys) count += (groups.get(ck)?.length ?? 0);
    parentNodeCount.set(parent, count);
  }

  // --- Level 0: Assign parent sectors (proportional to node count) ---
  const nParents = parentKeys.length;
  const sectorGap = nParents > 1 ? 0.03 * Math.max(cfg.groupSpacing, 1) : 0;
  const totalGap = sectorGap * nParents;
  const availAngle = Math.PI * 2 - totalGap;

  interface Sector { start: number; end: number; sweep: number; }
  const parentSectors = new Map<string, Sector>();
  let anglePos = -Math.PI / 2;
  for (const pk of parentKeys) {
    const ratio = (parentNodeCount.get(pk) || 1) / totalNodes;
    const sweep = ratio * availAngle;
    parentSectors.set(pk, { start: anglePos, end: anglePos + sweep, sweep });
    anglePos += sweep + sectorGap;
  }

  // --- Level 0: Fill inner ring(s) with each parent's top-priority nodes ---
  // Each parent fills its angular sector in ring 0 with its top nodes.
  const placed = new Set<string>();
  let maxInnerRing = 0; // track how many rings the inner level uses

  for (const pk of parentKeys) {
    const childKeys = parentMap.get(pk)!;
    const sector = parentSectors.get(pk)!;

    // Collect all nodes for this parent
    const parentNodes: GraphNode[] = [];
    for (const ck of childKeys) {
      const members = groups.get(ck);
      if (members) parentNodes.push(...members);
    }
    const sorted = sortNodes(parentNodes);

    let nodeIdx = 0;
    let ringIdx = 0;

    while (nodeIdx < sorted.length) {
      const rInner = centerHole + ringIdx * (ringThick + ringGap);
      const rMid = rInner + ringThick * 0.5;
      const rOuter = rInner + ringThick;

      const arcLen = rMid * sector.sweep;
      const capacity = Math.max(1, Math.floor(arcLen / nodeWidth));

      // For inner ring: only fill up to capacity, remaining go to sub-group phase
      // Check if this parent has sub-groups (hierarchy). If yes, only fill ring 0.
      const hasSubGroups = childKeys.length > 1;
      if (hasSubGroups && ringIdx >= 1) break; // stop at ring 0 for hierarchical parents

      const count = Math.min(capacity, sorted.length - nodeIdx);

      const pad = Math.min(sector.sweep * 0.02, 0.015);
      const usable = sector.sweep - 2 * pad;

      for (let i = 0; i < count; i++) {
        const at = count === 1 ? 0.5 : i / (count - 1);
        const angle = sector.start + pad + at * usable;
        targets.set(sorted[nodeIdx].id, {
          x: cx + rMid * Math.cos(angle),
          y: cy + rMid * Math.sin(angle),
        });
        placed.add(sorted[nodeIdx].id);
        nodeIdx++;
      }

      arcs.push({
        groupKey: pk,
        depth: ringIdx,
        rInner, rOuter,
        startAngle: sector.start,
        endAngle: sector.end,
        cx, cy,
      });

      if (ringIdx > maxInnerRing) maxInnerRing = ringIdx;
      ringIdx++;

      // For flat (non-hierarchical) parents, keep filling until done
      if (!hasSubGroups && nodeIdx >= sorted.length) break;
    }
  }

  // --- Level 1: Sub-group fan-out (only for parents with children) ---
  const subGroupStartRing = maxInnerRing + 1;

  for (const pk of parentKeys) {
    const childKeys = parentMap.get(pk)!;
    if (childKeys.length <= 1) continue; // no sub-groups, already fully placed

    const parentSector = parentSectors.get(pk)!;

    // Count unplaced nodes per child
    const childUnplaced = new Map<string, GraphNode[]>();
    let totalUnplaced = 0;
    for (const ck of childKeys) {
      const members = groups.get(ck) ?? [];
      const remaining = members.filter(n => !placed.has(n.id));
      if (remaining.length > 0) {
        childUnplaced.set(ck, remaining);
        totalUnplaced += remaining.length;
      }
    }
    if (totalUnplaced === 0) continue;

    // Assign sub-sectors proportional to unplaced node count
    const subGap = childUnplaced.size > 1 ? 0.02 * Math.max(cfg.groupSpacing, 1) : 0;
    const subTotalGap = subGap * childUnplaced.size;
    const subAvail = parentSector.sweep - subTotalGap;
    let subAngle = parentSector.start;

    for (const [ck, remaining] of childUnplaced) {
      const ratio = remaining.length / totalUnplaced;
      const sweep = ratio * subAvail;
      const subSector: Sector = { start: subAngle, end: subAngle + sweep, sweep };

      const sorted = sortNodes(remaining);
      let nodeIdx = 0;
      let ringIdx = subGroupStartRing;

      while (nodeIdx < sorted.length) {
        const rInner = centerHole + ringIdx * (ringThick + ringGap);
        const rMid = rInner + ringThick * 0.5;
        const rOuter = rInner + ringThick;

        const arcLen = rMid * subSector.sweep;
        const capacity = Math.max(1, Math.floor(arcLen / nodeWidth));
        const count = Math.min(capacity, sorted.length - nodeIdx);

        const pad = Math.min(subSector.sweep * 0.02, 0.015);
        const usable = subSector.sweep - 2 * pad;

        for (let i = 0; i < count; i++) {
          const at = count === 1 ? 0.5 : i / (count - 1);
          const angle = subSector.start + pad + at * usable;
          targets.set(sorted[nodeIdx].id, {
            x: cx + rMid * Math.cos(angle),
            y: cy + rMid * Math.sin(angle),
          });
          placed.add(sorted[nodeIdx].id);
          nodeIdx++;
        }

        arcs.push({
          groupKey: ck,
          depth: ringIdx,
          rInner, rOuter,
          startAngle: subSector.start,
          endAngle: subSector.end,
          cx, cy,
        });

        ringIdx++;
      }

      subAngle += sweep + subGap;
    }
  }

  return { targets, sunburstArcs: arcs };
}

/** Result from flat/hierarchical target computation, includes guide data */
interface FlatTargetResult {
  targets: Map<string, { x: number; y: number }>;
  guideGroups: { groupKey: string; centerX: number; centerY: number; guide: ArrangementGuide }[];
  allBars: TimelineBarInfo[];
  allSequenceEdges?: GraphEdge[];
}

/** Flat layout — all groups at the same level (no recursive split). */
function computeFlatTargets(
  groups: Map<string, GraphNode[]>,
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): FlatTargetResult {
  const targets = new Map<string, { x: number; y: number }>();
  const guideGroups: FlatTargetResult["guideGroups"] = [];
  const allBars: TimelineBarInfo[] = [];
  const groupKeys = [...groups.keys()];
  const nGroups = groupKeys.length;

  const groupCenters = new Map<string, { x: number; y: number }>();

  // Timeline with multiple groups: merge all nodes into a single unified timeline
  // then separate groups by Y-band offset
  if (cfg.arrangement === "timeline" && nGroups > 1) {
    return computeUnifiedTimelineTargets(groups, edges, degrees, cfg);
  }

  if (nGroups === 1) {
    groupCenters.set(groupKeys[0], { x: cfg.centerX, y: cfg.centerY });
  } else if (cfg.arrangement === "tree" || cfg.arrangement === "mountain") {
    layoutGroupsHorizontal(groupKeys, groups, cfg, groupCenters);
  } else {
    layoutGroupsCircle(groupKeys, groups, cfg, groupCenters);
  }

  const allSeqEdges: GraphEdge[] = [];
  for (const [key, members] of groups) {
    const center = groupCenters.get(key)!;
    const result = computeOffsets(members, degrees, edges, cfg);
    for (const n of members) {
      const off = result.offsets.get(n.id);
      targets.set(n.id, {
        x: center.x + (off?.dx ?? 0),
        y: center.y + (off?.dy ?? 0),
      });
    }
    // Collect guide data with absolute positions
    if (result.guide) {
      guideGroups.push({ groupKey: key, centerX: center.x, centerY: center.y, guide: result.guide });
    }
    // Collect bar data with absolute positions
    if (result.bars) {
      for (const bar of result.bars) {
        allBars.push({
          ...bar,
          xStart: bar.xStart + center.x,
          xEnd: bar.xEnd + center.x,
          yCenter: bar.yCenter + center.y,
        });
      }
    }
    // Collect sequence edges
    if (result.sequenceEdges) {
      allSeqEdges.push(...result.sequenceEdges);
    }
  }
  return { targets, guideGroups, allBars, allSequenceEdges: allSeqEdges.length > 0 ? allSeqEdges : undefined };
}

/**
 * Unified timeline: all groups share a single X-axis (same date -> same X
 * column).  Y positions are re-stacked per-group so each group's nodes
 * stack independently within each time column, keeping vertical extent
 * compact while maintaining globally consistent X positions.
 *
 * Strategy:
 *   1. Run timelineOffsets on ALL nodes merged to get shared X positions
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
  const guideGroups: FlatTargetResult["guideGroups"] = [];
  const allBars: TimelineBarInfo[] = [];
  const nodeSize = cfg.nodeSize;
  const groupKeys = [...groups.keys()];

  // --- Step 1: compute unified X positions from ALL nodes ---
  const allMembers: GraphNode[] = [];
  for (const members of groups.values()) allMembers.push(...members);

  const cmp = cfg.sortComparator ?? ((a: GraphNode, b: GraphNode) =>
    (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
  const unified = timelineOffsets(
    allMembers, degrees, cfg.nodeSpacing, cfg.groupScale, nodeSize, cmp,
    cfg.nodeSpacingMap, cfg.timelineKey, cfg.getNodeProperty,
    cfg.timelineEndKey, cfg.timelineOrderFields,
  );

  // Build group membership lookup
  const groupOfNode = new Map<string, string>();
  for (const [key, members] of groups) {
    for (const n of members) groupOfNode.set(n.id, key);
  }

  // --- Step 2: re-stack Y per group ---
  // Collect nodes by (group, X-column) for independent per-group stacking
  const nodesByGroupCol = new Map<string, Map<number, string[]>>();
  for (const key of groupKeys) nodesByGroupCol.set(key, new Map());

  // Round dx to find column identity (nodes at same time step share dx)
  const nodeDx = new Map<string, number>();
  for (const [nodeId, off] of unified.offsets) {
    nodeDx.set(nodeId, off.dx);
    const gk = groupOfNode.get(nodeId) ?? groupKeys[0];
    const colKey = Math.round(off.dx * 100); // quantize to avoid float issues
    const cols = nodesByGroupCol.get(gk)!;
    let list = cols.get(colKey);
    if (!list) { list = []; cols.set(colKey, list); }
    list.push(nodeId);
  }

  // Compute per-group Y stacking using the same spacing logic as timelineOffsets.
  // Derive effectiveSpacing from the actual X range and number of unique X positions.
  const uniqueXPositions = new Set<number>();
  for (const { dx } of unified.offsets.values()) uniqueXPositions.add(Math.round(dx * 100));
  const nCols = Math.max(1, uniqueXPositions.size);
  let effectiveSpacing: number;
  if (nCols >= 2) {
    // Infer spacing from the actual range
    let minDx = Infinity, maxDx = -Infinity;
    for (const { dx } of unified.offsets.values()) {
      if (dx < minDx) minDx = dx;
      if (dx > maxDx) maxDx = dx;
    }
    effectiveSpacing = (maxDx - minDx) / (nCols - 1);
  } else {
    effectiveSpacing = nodeSize * 2;
  }
  // Match the bar-aware minimum from timelineOffsets
  const barH = nodeSize * 2;
  const barGapMin = nodeSize * 1.5;
  const minYStack = barH + barGapMin;
  const yStackSpacing = Math.max(effectiveSpacing * 0.6, minYStack);
  const minNodeGap = Math.max(nodeSize * 1.5, yStackSpacing);

  // Per-group offsets: keep original dx, re-compute dy
  const perGroupOffsets = new Map<string, Map<string, { dx: number; dy: number }>>();
  for (const [gk, cols] of nodesByGroupCol) {
    const offsets = new Map<string, { dx: number; dy: number }>();
    for (const [, nodeIds] of cols) {
      // Sort by degree (higher degree first, same as original)
      nodeIds.sort((a, b) => (degrees.get(b) || 0) - (degrees.get(a) || 0));
      for (let i = 0; i < nodeIds.length; i++) {
        const nid = nodeIds[i];
        offsets.set(nid, {
          dx: nodeDx.get(nid) ?? 0,
          dy: i * minNodeGap,
        });
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

  // --- Step 3: compute per-group Y extents and assign Y-bands ---
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

  const bandGap = nodeSize * cfg.groupSpacing * 2;
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

  // --- Step 4: apply targets ---
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

  // --- Step 5: collect guide data ---
  if (unified.guide) {
    guideGroups.push({
      groupKey: "__unified__",
      centerX: cfg.centerX,
      centerY: cfg.centerY,
      guide: unified.guide,
    });
  }

  // --- Step 6: collect bars with per-group Y adjustments ---
  // Bars come from unified offsets but need Y adjusted to per-group positions
  if (unified.bars) {
    for (const bar of unified.bars) {
      const gk = groupOfNode.get(bar.nodeId) ?? groupKeys[0];
      const bandOff = groupYOffset.get(gk) ?? 0;
      const range = groupYRanges.get(gk);
      // Find the node's per-group dy for bar alignment
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

  // Filter sequence edges to within-group only (unified timeline merges all
  // groups, so raw edges may cross mythology→mythology boundaries).
  let filteredSeqEdges: GraphEdge[] | undefined;
  if (unified.sequenceEdges) {
    filteredSeqEdges = unified.sequenceEdges.filter(e => {
      const sg = groupOfNode.get(e.source);
      const tg = groupOfNode.get(e.target);
      return sg != null && sg === tg;
    });
    if (filteredSeqEdges.length === 0) filteredSeqEdges = undefined;
  }

  return {
    targets,
    guideGroups,
    allBars,
    allSequenceEdges: filteredSeqEdges,
  };
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
  if (cfg.arrangement === "timeline") {
    return computeUnifiedTimelineTargets(groups, edges, degrees, cfg);
  }

  const targets = new Map<string, { x: number; y: number }>();
  const guideGroups: FlatTargetResult["guideGroups"] = [];
  const allBars: TimelineBarInfo[] = [];
  const allSeqEdges: GraphEdge[] = [];
  const parentKeys = [...parentMap.keys()];

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

  // Level 1: place parent centers
  const parentCenters = new Map<string, { x: number; y: number }>();
  const nParents = parentKeys.length;

  if (nParents === 1) {
    parentCenters.set(parentKeys[0], { x: cfg.centerX, y: cfg.centerY });
  } else if (cfg.arrangement === "timeline") {
    layoutGroupsVertical(parentKeys, superGroups, cfg, parentCenters);
  } else if (cfg.arrangement === "tree" || cfg.arrangement === "mountain") {
    layoutGroupsHorizontal(parentKeys, superGroups, cfg, parentCenters);
  } else {
    layoutGroupsCircle(parentKeys, superGroups, cfg, parentCenters);
  }

  // Level 2: within each parent, lay out sub-groups
  for (const [parent, childKeys] of parentMap) {
    const pCenter = parentCenters.get(parent)!;

    if (childKeys.length === 1) {
      // No sub-groups — single group, apply arrangement directly
      const members = groups.get(childKeys[0])!;
      const result = computeOffsets(members, degrees, edges, cfg);
      for (const n of members) {
        const off = result.offsets.get(n.id);
        targets.set(n.id, {
          x: pCenter.x + (off?.dx ?? 0),
          y: pCenter.y + (off?.dy ?? 0),
        });
      }
      if (result.guide) {
        guideGroups.push({ groupKey: childKeys[0], centerX: pCenter.x, centerY: pCenter.y, guide: result.guide });
      }
      if (result.bars) {
        for (const bar of result.bars) {
          allBars.push({ ...bar, xStart: bar.xStart + pCenter.x, xEnd: bar.xEnd + pCenter.x, yCenter: bar.yCenter + pCenter.y });
        }
      }
      if (result.sequenceEdges) {
        allSeqEdges.push(...result.sequenceEdges);
      }
      continue;
    }

    // Multiple sub-groups: sort by size (largest first) and place in local arrangement
    const sorted = [...childKeys].sort((a, b) =>
      (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0));

    // Compute local sub-group centers around the parent center
    const subCenters = new Map<string, { x: number; y: number }>();
    const totalNodes = sorted.reduce((s, k) => s + (groups.get(k)?.length ?? 0), 0);
    const parentR = estimateGroupRadius(totalNodes, cfg.nodeSize, cfg.groupScale, cfg.arrangement);

    if (sorted.length <= 1) {
      subCenters.set(sorted[0], pCenter);
    } else {
      // Place sub-groups in a local circle, radius proportional to parent footprint
      const subCircleR = parentR * 0.6;
      for (let i = 0; i < sorted.length; i++) {
        const angle = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
        subCenters.set(sorted[i], {
          x: pCenter.x + subCircleR * Math.cos(angle),
          y: pCenter.y + subCircleR * Math.sin(angle),
        });
      }
    }

    // Apply intra-group arrangement within each sub-group
    for (const ck of sorted) {
      const members = groups.get(ck);
      if (!members) continue;
      const center = subCenters.get(ck)!;
      const result = computeOffsets(members, degrees, edges, cfg);
      for (const n of members) {
        const off = result.offsets.get(n.id);
        targets.set(n.id, {
          x: center.x + (off?.dx ?? 0),
          y: center.y + (off?.dy ?? 0),
        });
      }
      if (result.guide) {
        guideGroups.push({ groupKey: ck, centerX: center.x, centerY: center.y, guide: result.guide });
      }
      if (result.bars) {
        for (const bar of result.bars) {
          allBars.push({ ...bar, xStart: bar.xStart + center.x, xEnd: bar.xEnd + center.x, yCenter: bar.yCenter + center.y });
        }
      }
      if (result.sequenceEdges) {
        allSeqEdges.push(...result.sequenceEdges);
      }
    }
  }

  return { targets, guideGroups, allBars, allSequenceEdges: allSeqEdges.length > 0 ? allSeqEdges : undefined };
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
) {
  // Estimate each group's width; total row width = sum of all group widths + gaps
  const groupWidths: number[] = [];
  let totalNodes = 0;
  for (const key of keys) {
    const members = groups.get(key)!;
    totalNodes += members.length;
    const r = estimateGroupRadius(members.length, cfg.nodeSize, cfg.groupScale, cfg.arrangement, members);
    groupWidths.push(r * 2);
  }
  // Gap scales with slider value AND sqrt of total node count
  const nodeFactor = Math.sqrt(Math.max(totalNodes, 1));
  const gap = cfg.nodeSize * cfg.groupSpacing * nodeFactor * 0.8;
  const totalW = groupWidths.reduce((s, w) => s + w, 0) + gap * (keys.length - 1);

  let xCursor = cfg.centerX - totalW / 2;
  for (let i = 0; i < keys.length; i++) {
    const w = groupWidths[i];
    out.set(keys[i], { x: xCursor + w / 2, y: cfg.centerY });
    xCursor += w + gap;
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
) {
  const groupHeights: number[] = [];
  for (const key of keys) {
    const members = groups.get(key)!;
    // Estimate height: number of stacked nodes in the tallest time column
    // Use a simpler heuristic: sqrt(memberCount) * nodeSize * spacing
    const r = estimateGroupRadius(members.length, cfg.nodeSize, cfg.groupScale, cfg.arrangement, members);
    groupHeights.push(r * 2);
  }
  const gap = cfg.nodeSize * cfg.groupSpacing * 4;
  const totalH = groupHeights.reduce((s, h) => s + h, 0) + gap * (keys.length - 1);

  let yCursor = cfg.centerY - totalH / 2;
  for (let i = 0; i < keys.length; i++) {
    const h = groupHeights[i];
    out.set(keys[i], { x: cfg.centerX, y: yCursor + h / 2 });
    yCursor += h + gap;
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
) {
  const nGroups = keys.length;
  // Estimate the largest group's footprint to prevent overlap
  let maxGroupRadius = 0;
  let totalNodes = 0;
  for (const [, members] of groups) {
    totalNodes += members.length;
    const r = estimateGroupRadius(members.length, cfg.nodeSize, cfg.groupScale, cfg.arrangement, members);
    if (r > maxGroupRadius) maxGroupRadius = r;
  }
  // Circle must be large enough so adjacent groups don't overlap
  const minCircleR = (maxGroupRadius * 2 + 40) * nGroups / (2 * Math.PI);
  // Floor scales with groupScale AND sqrt of total node count
  const nodeFactor = Math.sqrt(Math.max(totalNodes, 1));
  const floor = cfg.nodeSize * nodeFactor * 3;
  const groupRadius = Math.max(floor, minCircleR) * cfg.groupSpacing;

  for (let i = 0; i < nGroups; i++) {
    const angle = (i / nGroups) * Math.PI * 2 - Math.PI / 2;
    out.set(keys[i], {
      x: cfg.centerX + groupRadius * Math.cos(angle),
      y: cfg.centerY + groupRadius * Math.sin(angle),
    });
  }
}

/** Estimate a group's visual radius based on member count and base node size.
 *  When `members` array is provided, accounts for super node sizes. */
function estimateGroupRadius(
  memberCount: number,
  nodeSize: number,
  nodeSpacingMul: number,
  arrangement?: ClusterArrangement,
  members?: GraphNode[],
): number {
  const gap = nodeSize * 2 * nodeSpacingMul;
  // If any member is a super node, inflate the estimate
  let superBonus = 0;
  if (members) {
    for (const m of members) {
      if (m.collapsedMembers && m.collapsedMembers.length > 0) {
        const sr = Math.min(nodeSize * (1 + Math.sqrt(m.collapsedMembers.length) * 0.5), MAX_NODE_RADIUS);
        superBonus = Math.max(superBonus, sr - nodeSize);
      }
    }
  }
  if (arrangement === "mountain") {
    // Mountain's widest row determines the radius — simulate row capacities
    let remaining = memberCount;
    let row = 0;
    let maxCols = 1;
    while (remaining > 0) {
      const cap = row === 0 ? 1 : Math.ceil(1 + row * 1.6 + row * row * 0.3);
      const actual = Math.min(cap, remaining);
      if (actual > maxCols) maxCols = actual;
      remaining -= actual;
      row++;
    }
    return gap * maxCols / 2 + superBonus;
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
    if (field === "backlinks") {
      key = backlinkBucket(degrees.get(n.id) || 0);
    } else if (field === "node_type") {
      key = n.isTag ? "tag" : (n.category || "file");
    } else if (field === "none") {
      key = "__all__";
    } else {
      // Generic field lookup via getNodeFieldValues (tag, folder, category, frontmatter, etc.)
      const vals = getNodeFieldValues(n, field);
      key = vals.length > 0 ? vals[0] : `__no_${field}__`;
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
  const { nodeSpacing, groupScale, scaleByDegree, sortComparator, nodeSpacingMap } = cfg;
  // Compute effective nodeSize: if any member is a super node, use the
  // largest effective radius so that fixed-spacing arrangements (grid,
  // triangle, mountain, timeline) give enough room.
  let nodeSize = cfg.nodeSize;
  for (const m of members) {
    const er = effectiveRadius(m, cfg.nodeSize, degrees.get(m.id) || 0, scaleByDegree);
    if (er > nodeSize) nodeSize = er;
  }
  // Default sort: degree descending (preserves legacy behaviour)
  const defaultSort = (a: GraphNode, b: GraphNode) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0);
  const cmp = sortComparator ?? defaultSort;

  // --- Routing ---
  // Arrangements with hardcoded layout functions (producing guides, proper spacing, etc.)
  // take priority over the generic coordinate engine. The coordinate engine is used only
  // when (a) no hardcoded function exists, or (b) the user has explicitly customized
  // coordinateLayout via the UI (panel.coordinateLayout is non-null).
  //
  // Note: resolveCoordinateLayout() always returns non-null (falling back to ARRANGEMENT_PRESETS),
  // so we check the *arrangement name* to decide whether to use the hardcoded path.
  const HARDCODED_ARRANGEMENTS = new Set<ClusterArrangement>([
    "spiral", "concentric", "tree", "grid", "triangle", "random", "mountain", "timeline",
  ]);

  if (HARDCODED_ARRANGEMENTS.has(cfg.arrangement) && isExactPreset(cfg.coordinateLayout!)) {
    // Arrangement has a hardcoded function AND the coordinateLayout matches a built-in preset
    // (i.e. the user hasn't customized the axis config) → use the richer hardcoded path.
    return dispatchHardcoded(cfg.arrangement, members, degrees, edges, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp, nodeSpacingMap, cfg);
  }

  if (cfg.coordinateLayout) {
    const ctx: CoordinateContext = {
      degrees,
      edges,
      nodeSize,
      nodeSpacing,
      groupScale,
      getNodeProperty: cfg.getNodeProperty,
    };
    return coordinateOffsets(members, degrees, edges, cfg.coordinateLayout, ctx);
  }

  // Fallback — legacy path
  return dispatchHardcoded(cfg.arrangement, members, degrees, edges, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp, nodeSpacingMap, cfg);
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
  scaleByDegree: boolean,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap: Map<string, number> | undefined,
  cfg: ClusterForceConfig,
): ArrangementResult {
  switch (arrangement) {
    case "spiral": return spiralOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp, nodeSpacingMap);
    case "concentric": return { offsets: concentricOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp, nodeSpacingMap) };
    case "tree": return treeOffsets(members, edges, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "grid": return gridOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "triangle": return triangleOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "random": return { offsets: randomOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, nodeSpacingMap) };
    case "mountain": return mountainOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "timeline": return timelineOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap, cfg.timelineKey, cfg.getNodeProperty, cfg.timelineEndKey, cfg.timelineOrderFields);
    default: return { offsets: new Map() };
  }
}

// ---------------------------------------------------------------------------
// Spiral — Archimedean: r = aθ, with adaptive step sizes
//
// Each node advances θ enough so that the arc-length between consecutive
// nodes is at least (radius[i] + radius[i+1]) × spacingMul.
// This prevents large central nodes from overlapping while keeping
// smaller outer nodes compact.
// ---------------------------------------------------------------------------

function spiralOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  scaleByDegree: boolean,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap?: Map<string, number>,
): ArrangementResult {
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return { offsets };

  // Precompute each node's visual radius
  const radii = sorted.map(nd => effectiveRadius(nd, nodeSize, degrees.get(nd.id) || 0, scaleByDegree));

  // armGap controls distance between spiral turns — governed by groupScale
  const armGap = nodeSize * 2 * groupScale;
  const a = armGap / (2 * Math.PI);

  // Place center node at origin
  offsets.set(sorted[0].id, { dx: 0, dy: 0 });

  // Start θ so that r(θ) ≥ centerRadius + firstNodeRadius (with spacing padding)
  let theta = n > 1 ? (radii[0] + radii[1]) * spacingMul / Math.max(a, 0.01) : 0;

  for (let i = 1; i < n; i++) {
    const r = a * theta;
    offsets.set(sorted[i].id, {
      dx: r * Math.cos(theta),
      dy: r * Math.sin(theta),
    });

    // Advance θ for next node: arc-length ≥ (this radius + next radius) × spacingMul × avg node spacing
    if (i < n - 1) {
      const avgSpacing = (getSpacing(sorted[i].id, nodeSpacingMap) + getSpacing(sorted[i + 1].id, nodeSpacingMap)) / 2;
      const minDist = (radii[i] + radii[i + 1]) * spacingMul * avgSpacing;
      const currentR = Math.max(a * theta, 1);
      const dTheta = Math.max(minDist / currentR, 0.05);
      theta += dTheta;
    }
  }
  const guide: SpiralGuide = { type: "spiral", a, maxTheta: theta };
  return { offsets, guide };
}

// ---------------------------------------------------------------------------
// Concentric rings — adaptive ring spacing
//
// Ring 0 holds 1 node (center). Each subsequent ring's radius is computed
// so that nodes on the ring don't overlap: circumference ≥ sum of diameters.
// Ring capacity adapts to actual node radii.
// ---------------------------------------------------------------------------

function concentricOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  scaleByDegree: boolean,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap?: Map<string, number>,
): Map<string, { dx: number; dy: number }> {
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return offsets;

  // Precompute radii (super-node aware)
  const radii = sorted.map(nd => effectiveRadius(nd, nodeSize, degrees.get(nd.id) || 0, scaleByDegree));

  // Place center node
  offsets.set(sorted[0].id, { dx: 0, dy: 0 });

  let idx = 1; // next node to place
  let ringR = 0; // current ring radius

  while (idx < n) {
    // Ring increment — governed by groupScale (overall ring spacing)
    const prevR = ringR === 0 ? radii[0] : nodeSize;
    const minGap = (prevR + radii[idx]) * groupScale;
    ringR = Math.max(ringR + minGap, ringR + nodeSize * 2 * groupScale);

    // Capacity — governed by spacingMul (node-to-node gap on the ring)
    const circumference = 2 * Math.PI * ringR;
    // Estimate average radius of nodes that will go on this ring
    let cap = 1;
    let totalDiamNeeded = radii[idx] * 2 * spacingMul * getSpacing(sorted[idx].id, nodeSpacingMap);
    while (cap < n - idx) {
      const nextR = radii[idx + cap];
      const nextDiam = nextR * 2 * spacingMul * getSpacing(sorted[idx + cap].id, nodeSpacingMap);
      if (totalDiamNeeded + nextDiam > circumference) break;
      totalDiamNeeded += nextDiam;
      cap++;
    }
    cap = Math.max(1, cap);

    // Place nodes on this ring
    for (let j = 0; j < cap && idx < n; j++, idx++) {
      const angle = (j / cap) * Math.PI * 2;
      offsets.set(sorted[idx].id, {
        dx: ringR * Math.cos(angle),
        dy: ringR * Math.sin(angle),
      });
    }
  }
  return offsets;
}

// ---------------------------------------------------------------------------
// Tree — BFS from highest-degree node, layered top-down
// Large disconnected layers are split into multiple rows to avoid
// ultra-wide single-row layouts.
// ---------------------------------------------------------------------------

function treeOffsets(
  members: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap?: Map<string, number>,
): ArrangementResult {
  const offsets = new Map<string, { dx: number; dy: number }>();
  if (members.length === 0) return { offsets };

  // Horizontal gap between nodes — governed by spacingMul
  const nodeSpacing = nodeSize * 2 * spacingMul;
  // Vertical gap between layers — governed by groupScale
  const layerHeight = nodeSize * 2 * groupScale * 1.5;

  const idSet = new Set(members.map(n => n.id));

  // Build local adjacency
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

  // BFS from first node in sort order (highest priority)
  const root = [...members].sort(cmp)[0];
  const visited = new Set<string>();
  const layers: string[][] = [];
  let queue = [root.id];
  visited.add(root.id);

  while (queue.length > 0) {
    layers.push(queue);
    const next: string[] = [];
    for (const id of queue) {
      for (const nb of adj.get(id) || []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          next.push(nb);
        }
      }
    }
    queue = next;
  }

  // Add disconnected nodes — split into rows of maxCols to prevent ultra-wide layouts
  const disconnected = members.filter(n => !visited.has(n.id)).map(n => n.id);
  if (disconnected.length > 0) {
    const maxCols = Math.max(10, Math.ceil(Math.sqrt(disconnected.length)));
    for (let start = 0; start < disconnected.length; start += maxCols) {
      layers.push(disconnected.slice(start, start + maxCols));
    }
  }

  const totalHeight = (layers.length - 1) * layerHeight;

  // Track global x-extent for guide data
  let globalXMin = Infinity, globalXMax = -Infinity;

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    // Compute per-node widths using spacing multiplier
    const widths = layer.map(id => nodeSpacing * getSpacing(id, nodeSpacingMap));
    const totalWidth = widths.reduce((s, w) => s + w, 0) - (widths.length > 0 ? widths[widths.length - 1] : 0);
    let cx = -totalWidth / 2;
    for (let ni = 0; ni < layer.length; ni++) {
      const dx = cx;
      const dy = li * layerHeight - totalHeight / 2;
      offsets.set(layer[ni], { dx, dy });
      if (dx < globalXMin) globalXMin = dx;
      if (dx > globalXMax) globalXMax = dx;
      cx += widths[ni];
    }
  }

  // Build tree depth guide
  const depthLevels: { y: number; label: string }[] = [];
  for (let li = 0; li < layers.length; li++) {
    const y = li * layerHeight - totalHeight / 2;
    depthLevels.push({ y, label: `L${li}` });
  }
  const guide: TreeGuide = {
    type: "tree",
    depthLevels,
    xMin: globalXMin - nodeSpacing,
    xMax: globalXMax + nodeSpacing,
  };

  return { offsets, guide };
}

// ---------------------------------------------------------------------------
// Grid — square grid sorted by degree (cols = √n)
// ---------------------------------------------------------------------------

function gridOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap?: Map<string, number>,
): ArrangementResult {
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  // Grid cell spacing — combines both: nodeSpacing for horizontal, groupScale for overall
  const spacing = nodeSize * 2 * Math.max(spacingMul, groupScale);
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
    type: "grid",
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

function triangleOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap?: Map<string, number>,
): ArrangementResult {
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return { offsets };

  const colSpacing = nodeSize * 2 * Math.max(spacingMul, groupScale);
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
    type: "triangle",
    vertices: [
      { x: 0, y: topY - rowSpacing * 0.3 },
      { x: -bottomHalfW - colSpacing * 0.3, y: bottomY + rowSpacing * 0.3 },
      { x: bottomHalfW + colSpacing * 0.3, y: bottomY + rowSpacing * 0.3 },
    ],
  };

  return { offsets, guide };
}

// ---------------------------------------------------------------------------
// Mountain — peak at top, exponentially widening rows toward base
//
// Row 0 holds 1 node (the peak — highest degree). Each subsequent row
// holds more nodes than the previous, growing by an accelerating factor
// so the silhouette resembles a mountain: narrow summit, wide base.
//
// Row height decreases toward the base (compressed foothills), while
// row width increases, producing a flattened mountain aspect ratio.
// ---------------------------------------------------------------------------

function mountainOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap?: Map<string, number>,
): ArrangementResult {
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return { offsets };

  const colSpacing = nodeSize * 2 * Math.max(spacingMul, groupScale);

  // Build row capacities: row k gets ceil(1 + k * 1.6 + k²×0.3) nodes
  // This creates accelerating growth: 1, 3, 5, 8, 12, 17, ...
  const rows: number[] = [];
  let remaining = n;
  let row = 0;
  while (remaining > 0) {
    const cap = row === 0 ? 1 : Math.ceil(1 + row * 1.6 + row * row * 0.3);
    const actual = Math.min(cap, remaining);
    rows.push(actual);
    remaining -= actual;
    row++;
  }
  const numRows = rows.length;

  // Row heights: taller near peak, compressed toward base
  // Peak rows get full spacing, base rows get ~40% spacing
  const rowHeights: number[] = [];
  for (let r = 0; r < numRows; r++) {
    const t = numRows > 1 ? r / (numRows - 1) : 0; // 0 = peak, 1 = base
    const compression = 1.0 - t * 0.6; // 1.0 at peak → 0.4 at base
    rowHeights.push(colSpacing * compression);
  }

  // Compute cumulative Y positions (peak at top = negative Y)
  const yPositions: number[] = [0];
  for (let r = 1; r < numRows; r++) {
    yPositions.push(yPositions[r - 1] + rowHeights[r - 1]);
  }
  const totalH = yPositions[numRows - 1];

  // Center vertically
  const yOffset = -totalH / 2;

  let idx = 0;
  for (let r = 0; r < numRows; r++) {
    const count = rows[r];
    const y = yPositions[r] + yOffset;

    // Row width: nodes spread evenly
    const rowWidth = (count - 1) * colSpacing;

    for (let c = 0; c < count && idx < n; c++) {
      const ns = getSpacing(sorted[idx].id, nodeSpacingMap);
      const x = count === 1 ? 0 : (c * colSpacing - rowWidth / 2) * ns;
      offsets.set(sorted[idx].id, { dx: x, dy: y });
      idx++;
    }
  }

  // Build mountain silhouette guide
  const mountainPoints: { x: number; y: number }[] = [];
  for (let r = 0; r < numRows; r++) {
    const count = rows[r];
    const y = yPositions[r] + yOffset;
    const halfW = (count - 1) * colSpacing / 2 + colSpacing * 0.5;
    // Left edge (going down)
    mountainPoints.push({ x: -halfW, y });
  }
  // Right edge (going back up)
  for (let r = numRows - 1; r >= 0; r--) {
    const count = rows[r];
    const y = yPositions[r] + yOffset;
    const halfW = (count - 1) * colSpacing / 2 + colSpacing * 0.5;
    mountainPoints.push({ x: halfW, y });
  }
  const guide: MountainGuide = { type: "mountain", points: mountainPoints };

  return { offsets, guide };
}

// ---------------------------------------------------------------------------
// Timeline — horizontal line with time-based or fallback ordering
//
// 1. Try the user-specified timelineKey (e.g. "date", "era")
// 2. If few nodes have that key, try fallback keys: start-date, story_order,
//    order, sequence, created
// 3. Nodes with a time value are placed left-to-right by sorted value
// 4. Nodes sharing the same time step stack vertically
// 5. Nodes WITHOUT any time value are still placed in a single horizontal
//    line (sorted by label/id), never in a grid
// ---------------------------------------------------------------------------

const TIMELINE_FALLBACK_KEYS = [
  "start-date", "story_order", "order", "sequence", "created", "date",
  "era", "turn", "chapter", "episode", "sort", "priority", "index",
];

function timelineOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  cmp: (a: GraphNode, b: GraphNode) => number,
  nodeSpacingMap?: Map<string, number>,
  timelineKey?: string,
  getNodeProperty?: (nodeId: string, key: string) => string | undefined,
  timelineEndKey?: string,
  timelineOrderFields?: string,
): ArrangementResult {
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = members.length;
  if (n === 0) return { offsets };

  const spacing = nodeSize * 2 * Math.max(spacingMul, groupScale);

  // --- Resolve effective time key with fallback ---
  const resolvedKey = resolveTimeKey(members, timelineKey || "date", getNodeProperty);

  // --- Partition: timed vs untimed ---
  const timed: { node: GraphNode; value: string }[] = [];
  let untimed: GraphNode[] = [];
  for (const nd of members) {
    const val = resolvedKey ? getNodeProperty?.(nd.id, resolvedKey) : undefined;
    if (val !== undefined && val !== "") {
      timed.push({ node: nd, value: String(val) });
    } else {
      untimed.push(nd);
    }
  }

  // --- Feature A: Link-based ordering for untimed nodes ---
  // Parse order fields (default: "next,prev,parent_id,story_order")
  const orderFieldStr = timelineOrderFields || "next,prev,parent_id,story_order";
  const orderFields = orderFieldStr.split(",").map(f => f.trim()).filter(Boolean);
  const hasNext = orderFields.includes("next");
  const hasPrev = orderFields.includes("prev");
  const hasParentId = orderFields.includes("parent_id");

  if (untimed.length > 0 && getNodeProperty) {
    // Try link chain ordering (next/prev)
    if (hasNext || hasPrev) {
      const chainOrder = buildLinkChainOrder(untimed, getNodeProperty);
      if (chainOrder.size > 0) {
        const chainOrdered: GraphNode[] = [];
        const remaining: GraphNode[] = [];
        for (const nd of untimed) {
          if (chainOrder.has(nd.id)) chainOrdered.push(nd);
          else remaining.push(nd);
        }
        chainOrdered.sort((a, b) => (chainOrder.get(a.id) ?? 0) - (chainOrder.get(b.id) ?? 0));
        // Convert chain-ordered nodes to timed entries
        const startIdx = timed.length > 0 ? timed.length : 0;
        for (let i = 0; i < chainOrdered.length; i++) {
          timed.push({ node: chainOrdered[i], value: `__chain_${String(startIdx + i).padStart(6, "0")}` });
        }
        untimed = remaining;
      }
    }

    // Try hierarchy ordering (parent_id + story_order)
    if (untimed.length > 0 && hasParentId) {
      const hierOrder = buildHierarchyOrder(untimed, getNodeProperty);
      if (hierOrder.size > 0) {
        const hierOrdered: GraphNode[] = [];
        const remaining: GraphNode[] = [];
        for (const nd of untimed) {
          if (hierOrder.has(nd.id)) hierOrdered.push(nd);
          else remaining.push(nd);
        }
        hierOrdered.sort((a, b) => (hierOrder.get(a.id) ?? 0) - (hierOrder.get(b.id) ?? 0));
        const startIdx = timed.length > 0 ? timed.length : 0;
        for (let i = 0; i < hierOrdered.length; i++) {
          timed.push({ node: hierOrdered[i], value: `__hier_${String(startIdx + i).padStart(6, "0")}` });
        }
        untimed = remaining;
      }
    }
  }

  // --- Sort timed nodes (detect numeric vs lexicographic) ---
  // Exclude synthetic chain/hier values from numeric check
  const realTimed = timed.filter(t => !t.value.startsWith("__chain_") && !t.value.startsWith("__hier_"));
  const allNumeric = realTimed.length > 0 && realTimed.every(t => !isNaN(Number(t.value)));
  // Sort only real timed nodes; synthetic ones keep their insertion order
  const syntheticSet = new Set(timed.filter(t => t.value.startsWith("__")).map(t => t.node.id));
  const realTimedArr = timed.filter(t => !syntheticSet.has(t.node.id));
  const syntheticArr = timed.filter(t => syntheticSet.has(t.node.id));
  if (allNumeric) {
    realTimedArr.sort((a, b) => Number(a.value) - Number(b.value));
  } else {
    realTimedArr.sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
  }
  // Merge: real timed first, then chain/hierarchy ordered
  const sortedTimed = [...realTimedArr, ...syntheticArr];

  // --- Build unique time steps ---
  const uniqueTimes = [...new Set(sortedTimed.map(t => t.value))];
  const timeIndexMap = new Map<string, number>();
  uniqueTimes.forEach((t, i) => timeIndexMap.set(t, i));

  // Auto-compress step width for many columns.
  // For large datasets (hundreds of time columns), we compress aggressively
  // so the total layout fits in a reasonable viewport.
  const nTimedCols = uniqueTimes.length;
  // Untimed nodes are placed in a compact grid, not individual columns
  const untimedGridCols = untimed.length > 0
    ? Math.ceil(Math.sqrt(untimed.length))
    : 0;
  const totalCols = nTimedCols + untimedGridCols;
  const maxCols = 40;
  // Adaptive floor: for very large datasets, allow much tighter packing
  const minSpacing = totalCols > 200
    ? nodeSize * 1.2
    : totalCols > 100
      ? nodeSize * 1.8
      : nodeSize * 3;
  const effectiveSpacing = totalCols > maxCols
    ? Math.max(minSpacing, spacing * maxCols / totalCols)
    : spacing;

  // Y-axis stacking spacing: must use effectiveSpacing (not raw spacing)
  // to keep columns compact when X is compressed.
  // When duration bars are present, ensure minimum gap so bars don't overlap.
  const barH = nodeSize * 2;   // barHeight used in TimelineBarInfo
  const barGap = nodeSize * 1.5; // minimum vertical gap between bars
  const minYStack = barH + barGap; // ~3.5 × nodeSize
  const yStackSpacing = Math.max(effectiveSpacing * 0.6, minYStack);

  // --- Place timed nodes: X = time index, Y = stack within same step ---
  const columnStack = new Map<number, number>();

  for (const { node, value } of sortedTimed) {
    const ti = timeIndexMap.get(value)!;
    const stackIdx = columnStack.get(ti) ?? 0;
    columnStack.set(ti, stackIdx + 1);
    const ns = getSpacing(node.id, nodeSpacingMap);
    offsets.set(node.id, {
      dx: ti * effectiveSpacing,          // X is purely column-based (no per-node spacing)
      dy: stackIdx * yStackSpacing * ns,
    });
  }

  // --- Place untimed nodes in a compact GRID after timed columns ---
  if (untimed.length > 0) {
    // Sort by label/id for deterministic order
    untimed.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
    const gridCols = Math.max(1, Math.ceil(Math.sqrt(untimed.length)));
    const startX = nTimedCols * effectiveSpacing + effectiveSpacing * 2; // gap after timed
    for (let i = 0; i < untimed.length; i++) {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      offsets.set(untimed[i].id, {
        dx: startX + col * effectiveSpacing,
        dy: row * yStackSpacing,
      });
    }
  }

  // --- Center both axes ---
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { dx, dy } of offsets.values()) {
    if (dx < minX) minX = dx;
    if (dx > maxX) maxX = dx;
    if (dy < minY) minY = dy;
    if (dy > maxY) maxY = dy;
  }
  const xCenter = (minX + maxX) / 2;
  const yCenter = (minY + maxY) / 2;
  for (const [id, pos] of offsets) {
    offsets.set(id, { dx: pos.dx - xCenter, dy: pos.dy - yCenter });
  }

  // --- Feature B: Duration bars ---
  const bars: TimelineBarInfo[] = [];
  const resolvedEndKey = timelineEndKey || "end-date";
  if (getNodeProperty && resolvedKey) {
    for (const { node, value } of sortedTimed) {
      if (value.startsWith("__")) continue; // Skip synthetic entries
      const endVal = getNodeProperty(node.id, resolvedEndKey);
      if (!endVal || endVal === "") continue;
      // Find xEnd from end value's position on the timeline
      const endTimeIdx = timeIndexMap.get(endVal);
      const startOff = offsets.get(node.id);
      if (!startOff) continue;
      const xStart = startOff.dx;
      let xEnd: number;
      if (endTimeIdx !== undefined) {
        // End value exists as a time step
        xEnd = endTimeIdx * effectiveSpacing - xCenter;
      } else {
        // Interpolate: find where it would fall
        if (allNumeric && !isNaN(Number(endVal))) {
          const endNum = Number(endVal);
          // Find surrounding time steps
          let bestIdx = uniqueTimes.length - 1;
          for (let i = 0; i < uniqueTimes.length; i++) {
            if (Number(uniqueTimes[i]) >= endNum) { bestIdx = i; break; }
          }
          xEnd = bestIdx * effectiveSpacing - xCenter;
        } else {
          // Lexicographic interpolation — find nearest time step
          let bestIdx = uniqueTimes.length - 1;
          for (let i = 0; i < uniqueTimes.length; i++) {
            if (uniqueTimes[i] >= endVal) { bestIdx = i; break; }
          }
          xEnd = bestIdx * effectiveSpacing - xCenter;
        }
      }
      if (xEnd > xStart) {
        bars.push({
          nodeId: node.id,
          xStart,
          xEnd,
          barHeight: nodeSize * 2,
          yCenter: startOff.dy,
        });
      }
    }
  }

  // --- Resolve bar overlaps using compact lane assignment ---
  // Assigns each bar to a Y-lane where it doesn't overlap with any existing bar.
  // Bars are sorted by their original Y (from column stacking) to preserve locality.
  // Lane spacing is minimal: just enough to prevent visual overlap.
  if (bars.length > 1) {
    const laneH = barH + 2; // minimal lane spacing: just barHeight + 2px gap
    const maxLanes = 200; // cap to prevent extreme vertical spread

    // Sort by original yCenter to preserve column-based ordering
    bars.sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);

    // Each lane tracks active X intervals (xEnd values sorted)
    const laneEnds: number[] = []; // laneEnds[i] = max xEnd currently in lane i

    for (const bar of bars) {
      // Find first lane where bar doesn't overlap in X
      let assigned = -1;
      for (let l = 0; l < Math.min(laneEnds.length, maxLanes); l++) {
        if (bar.xStart >= laneEnds[l]) {
          assigned = l;
          break;
        }
      }
      if (assigned < 0 && laneEnds.length < maxLanes) {
        assigned = laneEnds.length;
        laneEnds.push(-Infinity);
      }
      if (assigned < 0) {
        // Exceeded max lanes — find lane with smallest xEnd to minimize overlap
        let minEnd = Infinity, minL = 0;
        for (let l = 0; l < laneEnds.length; l++) {
          if (laneEnds[l] < minEnd) { minEnd = laneEnds[l]; minL = l; }
        }
        assigned = minL;
      }
      laneEnds[assigned] = bar.xEnd;

      const laneY = assigned * laneH;
      bar.yCenter = laneY;
      const off = offsets.get(bar.nodeId);
      if (off) offsets.set(bar.nodeId, { dx: off.dx, dy: laneY });
    }

    // Compact scaling: if total lane height exceeds a reasonable target,
    // scale down Y positions and bar heights proportionally.
    // Target: fit bars in ~1200px world height so they're visible at moderate zoom.
    const totalLaneH = laneEnds.length * laneH;
    const targetH = Math.max(600, n * 0.8); // proportional to node count, min 600
    if (totalLaneH > targetH) {
      const scale = targetH / totalLaneH;
      for (const bar of bars) {
        bar.yCenter *= scale;
        bar.barHeight *= scale;
        const off = offsets.get(bar.nodeId);
        if (off) offsets.set(bar.nodeId, { dx: off.dx, dy: bar.yCenter });
      }
    }
  }

  // Push apart non-bar nodes that share a time column
  {
    const minNodeGap = Math.max(nodeSize * 1.5, yStackSpacing);
    const barNodeIds = new Set(bars.map(b => b.nodeId));
    const byColumn = new Map<number, string[]>();
    for (const { node, value } of sortedTimed) {
      if (barNodeIds.has(node.id)) continue; // bar nodes already positioned by lane
      const ti = timeIndexMap.get(value);
      if (ti === undefined) continue;
      let col = byColumn.get(ti);
      if (!col) { col = []; byColumn.set(ti, col); }
      col.push(node.id);
    }
    for (const ids of byColumn.values()) {
      if (ids.length < 2) continue;
      const items = ids.map(id => ({ id, off: offsets.get(id)! })).filter(x => x.off);
      items.sort((a, b) => a.off.dy - b.off.dy);
      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1], cur = items[i];
        const gap = cur.off.dy - prev.off.dy;
        if (gap < minNodeGap) {
          const newDy = prev.off.dy + minNodeGap;
          offsets.set(cur.id, { dx: cur.off.dx, dy: newDy });
          cur.off = { dx: cur.off.dx, dy: newDy };
        }
      }
    }
  }

  // --- Re-center after lane assignment ---
  {
    let minY2 = Infinity, maxY2 = -Infinity;
    for (const { dy } of offsets.values()) {
      if (dy < minY2) minY2 = dy;
      if (dy > maxY2) maxY2 = dy;
    }
    const yAdj = (minY2 + maxY2) / 2;
    if (Math.abs(yAdj) > 0.1) {
      for (const [id, pos] of offsets) {
        offsets.set(id, { dx: pos.dx, dy: pos.dy - yAdj });
      }
      for (const bar of bars) {
        bar.yCenter -= yAdj;
      }
    }
  }

  // --- Timeline guide (axis + ticks) ---
  const ticks: { x: number; label: string }[] = [];
  // Only show ticks for non-synthetic time values
  for (const tv of uniqueTimes) {
    if (tv.startsWith("__")) continue;
    const idx = timeIndexMap.get(tv)!;
    ticks.push({ x: idx * effectiveSpacing - xCenter, label: tv });
  }
  const guide: TimelineGuide = {
    type: "timeline",
    axisY: -yCenter, // axis at y=0 before centering
    ticks,
  };

  // --- Generate synthetic sequence edges between temporally adjacent nodes ---
  // Within the sorted timed array, connect consecutive nodes (same time axis order).
  // Only connect "real" timed nodes (skip synthetic __chain_/__hier_ entries unless
  // they are adjacent to each other in the same synthetic ordering scheme).
  const seqEdges: GraphEdge[] = [];
  if (sortedTimed.length >= 2) {
    for (let i = 1; i < sortedTimed.length; i++) {
      const prev = sortedTimed[i - 1];
      const cur = sortedTimed[i];
      // Connect if both are real timed OR both are from same synthetic scheme
      const prevSynth = prev.value.startsWith("__");
      const curSynth = cur.value.startsWith("__");
      if (prevSynth !== curSynth) continue; // don't bridge real↔synthetic
      if (prevSynth && curSynth) {
        // Both synthetic: only connect if same scheme (chain or hier)
        const prevScheme = prev.value.split("_")[2]; // e.g. "chain" or "hier"
        const curScheme = cur.value.split("_")[2];
        if (prevScheme !== curScheme) continue;
      }
      seqEdges.push({
        id: `__seq__${prev.node.id}__${cur.node.id}`,
        source: prev.node.id,
        target: cur.node.id,
        type: "sequence",
      });
    }
  }

  return {
    offsets,
    guide,
    bars: bars.length > 0 ? bars : undefined,
    sequenceEdges: seqEdges.length > 0 ? seqEdges : undefined,
  };
}

// ---------------------------------------------------------------------------
// Feature A helpers: link chain ordering and hierarchy ordering
// ---------------------------------------------------------------------------

/**
 * Build order from next/prev link chains.
 * Reads "next" and "prev" fields (wikilink format [[target]]) from frontmatter.
 */
function buildLinkChainOrder(
  members: GraphNode[],
  getNodeProperty: (id: string, key: string) => string | undefined,
): Map<string, number> {
  const order = new Map<string, number>();
  const idSet = new Set(members.map(n => n.id));

  // Build forward links: id → next id
  const nextMap = new Map<string, string>();
  const hasIncoming = new Set<string>();

  for (const nd of members) {
    const nextVal = getNodeProperty(nd.id, "next");
    if (nextVal) {
      const target = extractWikilink(nextVal);
      if (target && idSet.has(target)) {
        nextMap.set(nd.id, target);
        hasIncoming.add(target);
      }
    }
    const prevVal = getNodeProperty(nd.id, "prev");
    if (prevVal) {
      const target = extractWikilink(prevVal);
      if (target && idSet.has(target)) {
        hasIncoming.add(nd.id); // nd has incoming from target
        if (!nextMap.has(target)) {
          nextMap.set(target, nd.id);
        }
      }
    }
  }

  if (nextMap.size === 0) return order;

  // Find chain heads (nodes with outgoing next but no incoming)
  const heads: string[] = [];
  for (const id of nextMap.keys()) {
    if (!hasIncoming.has(id)) heads.push(id);
  }
  // If no clear head found, use any node that has a next link
  if (heads.length === 0 && nextMap.size > 0) {
    heads.push(nextMap.keys().next().value!);
  }

  // Walk each chain
  let globalIdx = 0;
  const visited = new Set<string>();
  for (const head of heads) {
    let cur: string | undefined = head;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      order.set(cur, globalIdx++);
      cur = nextMap.get(cur);
    }
  }

  return order;
}

/**
 * Build order from parent_id + story_order hierarchy.
 * Constructs a tree and does DFS traversal in story_order.
 */
function buildHierarchyOrder(
  members: GraphNode[],
  getNodeProperty: (id: string, key: string) => string | undefined,
): Map<string, number> {
  const order = new Map<string, number>();
  const idSet = new Set(members.map(n => n.id));

  // Build parent→children map
  const children = new Map<string, { id: string; storyOrder: number }[]>();
  const hasParent = new Set<string>();

  for (const nd of members) {
    const parentVal = getNodeProperty(nd.id, "parent_id");
    if (parentVal) {
      const parentId = extractWikilink(parentVal) || parentVal;
      if (idSet.has(parentId)) {
        hasParent.add(nd.id);
        if (!children.has(parentId)) children.set(parentId, []);
        const so = Number(getNodeProperty(nd.id, "story_order") ?? "0") || 0;
        children.get(parentId)!.push({ id: nd.id, storyOrder: so });
      }
    }
  }

  if (children.size === 0) return order;

  // Sort children by story_order
  for (const ch of children.values()) {
    ch.sort((a, b) => a.storyOrder - b.storyOrder);
  }

  // Find roots (nodes that are parents but have no parent themselves)
  const roots: string[] = [];
  for (const id of children.keys()) {
    if (!hasParent.has(id)) roots.push(id);
  }
  // If no roots, use nodes with most children
  if (roots.length === 0) {
    let maxChildren = 0;
    let bestId = "";
    for (const [id, ch] of children) {
      if (ch.length > maxChildren) { maxChildren = ch.length; bestId = id; }
    }
    if (bestId) roots.push(bestId);
  }

  // DFS traversal
  let idx = 0;
  const visited = new Set<string>();
  const dfs = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    order.set(id, idx++);
    const ch = children.get(id);
    if (ch) {
      for (const c of ch) dfs(c.id);
    }
  };
  for (const root of roots) dfs(root);

  // Add remaining nodes with parent but not reached
  for (const nd of members) {
    if (!visited.has(nd.id) && hasParent.has(nd.id)) {
      order.set(nd.id, idx++);
    }
  }

  return order;
}

/** Extract a file path from [[wikilink]] or [[wikilink|alias]] format */
function extractWikilink(val: string): string | null {
  const m = val.match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : null;
}

/** Try the user key first; if < 30% of nodes have it, scan fallback keys */
function resolveTimeKey(
  members: GraphNode[],
  primaryKey: string,
  getNodeProperty?: (nodeId: string, key: string) => string | undefined,
): string | null {
  if (!getNodeProperty || members.length === 0) return null;

  // Check primary key coverage
  const threshold = Math.max(1, Math.floor(members.length * 0.3));
  let count = 0;
  for (const nd of members) {
    const val = getNodeProperty(nd.id, primaryKey);
    if (val !== undefined && val !== "") count++;
    if (count >= threshold) return primaryKey;
  }
  if (count > 0) return primaryKey; // At least some nodes have it

  // Try fallback keys
  for (const fallbackKey of TIMELINE_FALLBACK_KEYS) {
    if (fallbackKey === primaryKey) continue;
    let fc = 0;
    for (const nd of members) {
      const val = getNodeProperty(nd.id, fallbackKey);
      if (val !== undefined && val !== "") fc++;
      if (fc >= threshold) return fallbackKey;
    }
    if (fc > 0) return fallbackKey;
  }

  return null; // No usable key found → all nodes will be untimed (single line by label)
}

// ---------------------------------------------------------------------------
// Random — seeded scatter with collision avoidance
//
// Nodes are placed at pseudo-random positions within a disc whose radius
// scales with group size. A simple hash of the node ID seeds position so
// that the layout is deterministic (same data → same arrangement) yet
// visually chaotic.
// ---------------------------------------------------------------------------

function randomOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
  groupScale: number,
  nodeSize: number,
  scaleByDegree: boolean,
  nodeSpacingMap?: Map<string, number>,
): Map<string, { dx: number; dy: number }> {
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = members.length;
  if (n === 0) return offsets;

  // Disc radius scales with member count (same formula as estimateGroupRadius)
  const gap = nodeSize * 2 * Math.max(spacingMul, groupScale);
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
    const nr = effectiveRadius(nd, nodeSize, degrees.get(nd.id) || 0, scaleByDegree);
    const ns = getSpacing(nd.id, nodeSpacingMap);
    const minDist = nr * 2 * spacingMul * ns;

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
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
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
  spacingMul: number,
  nodeSize: number,
): void {
  const tags = [...tagMembership.keys()];
  if (tags.length < 2) return;

  // Compute centroid + extent per tag from current positions
  const centroids: { tag: string; cx: number; cy: number; r: number }[] = [];
  for (const tag of tags) {
    const ids = tagMembership.get(tag)!;
    let sx = 0, sy = 0, cnt = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const n = nodeIdx.get(id);
      if (!n) continue;
      sx += n.x; sy += n.y; cnt++;
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    }
    if (cnt === 0) continue;
    const r = Math.max(30, Math.hypot(maxX - minX, maxY - minY) / 2);
    centroids.push({ tag, cx: sx / cnt, cy: sy / cnt, r });
  }

  // Cap: maximum position nudge per node per tick
  const maxNudge = nodeSize * 0.5;

  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      const a = centroids[i], b = centroids[j];
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const desiredDist = (a.r + b.r) * spacingMul;
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
const visualRadius = effectiveRadius;

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
  // Timeline: lane assignment handles bar overlap, so keep spacing moderate
  const isTimeline = baseCfg.arrangement === "timeline";
  const MAX_NODE_SPACING = isTimeline ? 4 : 10;
  const MAX_GROUP_SCALE = isTimeline ? 3 : 5;
  const MAX_GROUP_SPACING = isTimeline ? 2 : 5;

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
      const r = visualRadius(n, baseSize, deg, baseCfg.scaleByDegree);
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
          const dist = Math.sqrt(cdx * cdx + cdy * cdy);
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
