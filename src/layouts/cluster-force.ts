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
 *
 * Two independent controls:
 *  - nodeSpacing: minimum gap between adjacent nodes (nodeRadius × n)
 *  - groupScale: overall pattern size (arm gap, ring increment, layer height)
 *
 * Uses ABSOLUTE target positions and aggressive position blending with
 * full velocity kill to guarantee visibility.
 */
import type { GraphNode, GraphEdge, ClusterGroupBy, ClusterArrangement } from "../types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ClusterForceConfig {
  groupBy: ClusterGroupBy;
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
  /** Enable recursive sub-grouping within each group */
  recursive: boolean;
  /** When enclosure mode is active, tag membership map for separation */
  tagMembership?: Map<string, Set<string>>;
  /** Enclosure spacing multiplier (default 1.5) */
  enclosureSpacing?: number;
  /** Custom comparator for node sort order within each group */
  sortComparator?: (a: GraphNode, b: GraphNode) => number;
}

/**
 * Build a d3-compatible force function for cluster arrangement.
 * Returns null if groupBy is "none".
 */
export function buildClusterForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): ((alpha: number) => void) | null {
  let groups = partitionNodes(nodes, cfg.groupBy, degrees);
  if (groups.size === 0) return null;

  // Recursive sub-grouping: split each group into connected components
  if (cfg.recursive) {
    groups = splitByConnectedComponents(groups, edges);
  }

  const targets = computeAbsoluteTargets(groups, edges, degrees, cfg);

  // Build node index for enclosure separation (if active)
  const tagMem = cfg.tagMembership;
  const encSpacing = cfg.enclosureSpacing ?? 1.5;
  const nodeIdx = tagMem ? new Map(nodes.map(n => [n.id, n])) : null;

  return (_alpha: number) => {
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
}

// ---------------------------------------------------------------------------
// Node radius helper (mirrors GraphViewContainer nodeR formula)
// ---------------------------------------------------------------------------

/** Visual radius of a node — same formula as GraphViewContainer.nodeR */
function nodeRadius(nodeSize: number, degree: number, scaleByDegree: boolean): number {
  if (!scaleByDegree) return nodeSize;
  return Math.max(nodeSize, nodeSize + Math.sqrt(degree) * 3.2);
}

// ---------------------------------------------------------------------------
// Absolute target computation
// ---------------------------------------------------------------------------

function computeAbsoluteTargets(
  groups: Map<string, GraphNode[]>,
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): Map<string, { x: number; y: number }> {
  const targets = new Map<string, { x: number; y: number }>();
  const groupKeys = [...groups.keys()];
  const nGroups = groupKeys.length;

  // --- Compute group centers ---
  const groupCenters = new Map<string, { x: number; y: number }>();

  if (nGroups === 1) {
    groupCenters.set(groupKeys[0], { x: cfg.centerX, y: cfg.centerY });
  } else if (cfg.arrangement === "tree") {
    // Tree: arrange groups in a horizontal row
    layoutGroupsHorizontal(groupKeys, groups, cfg, groupCenters);
  } else {
    // All others: arrange groups on a circle
    layoutGroupsCircle(groupKeys, groups, cfg, groupCenters);
  }

  // --- Compute intra-group offsets → absolute positions ---
  for (const [key, members] of groups) {
    const center = groupCenters.get(key)!;
    const offsets = computeOffsets(members, degrees, edges, cfg);
    for (const n of members) {
      const off = offsets.get(n.id);
      targets.set(n.id, {
        x: center.x + (off?.dx ?? 0),
        y: center.y + (off?.dy ?? 0),
      });
    }
  }

  return targets;
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
  for (const key of keys) {
    const members = groups.get(key)!;
    const r = estimateGroupRadius(members.length, cfg.nodeSize, cfg.groupScale);
    groupWidths.push(r * 2);
  }
  const gap = cfg.nodeSize * cfg.groupScale * cfg.groupSpacing * 2;
  const totalW = groupWidths.reduce((s, w) => s + w, 0) + gap * (keys.length - 1);

  let xCursor = cfg.centerX - totalW / 2;
  for (let i = 0; i < keys.length; i++) {
    const w = groupWidths[i];
    out.set(keys[i], { x: xCursor + w / 2, y: cfg.centerY });
    xCursor += w + gap;
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
  for (const members of groups.values()) {
    const r = estimateGroupRadius(members.length, cfg.nodeSize, cfg.groupScale);
    if (r > maxGroupRadius) maxGroupRadius = r;
  }
  // Circle must be large enough so adjacent groups don't overlap
  const minCircleR = (maxGroupRadius * 2 + 40) * nGroups / (2 * Math.PI);
  // Floor scales with groupScale so even tiny groups move apart when scale increases
  const floor = cfg.nodeSize * cfg.groupScale * 10;
  const groupRadius = Math.max(floor, minCircleR) * cfg.groupSpacing;

  for (let i = 0; i < nGroups; i++) {
    const angle = (i / nGroups) * Math.PI * 2 - Math.PI / 2;
    out.set(keys[i], {
      x: cfg.centerX + groupRadius * Math.cos(angle),
      y: cfg.centerY + groupRadius * Math.sin(angle),
    });
  }
}

/** Estimate a group's visual radius based on member count and base node size. */
function estimateGroupRadius(
  memberCount: number,
  nodeSize: number,
  nodeSpacingMul: number,
): number {
  const gap = nodeSize * 2 * nodeSpacingMul;
  // Approximate footprint: √n nodes across × gap
  return gap * Math.sqrt(memberCount) / 2;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function partitionNodes(
  nodes: GraphNode[],
  groupBy: ClusterGroupBy,
  degrees: Map<string, number>,
): Map<string, GraphNode[]> {
  const groups = new Map<string, GraphNode[]>();

  for (const n of nodes) {
    let key: string;
    switch (groupBy) {
      case "tag":
        key = (n.tags && n.tags.length > 0) ? n.tags[0] : "__untagged__";
        break;
      case "backlinks":
        key = backlinkBucket(degrees.get(n.id) || 0);
        break;
      case "node_type":
        key = n.isTag ? "tag" : (n.category || "file");
        break;
      default:
        key = "__all__";
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
): Map<string, { dx: number; dy: number }> {
  const { nodeSpacing, groupScale, nodeSize, scaleByDegree, sortComparator } = cfg;
  // Default sort: degree descending (preserves legacy behaviour)
  const defaultSort = (a: GraphNode, b: GraphNode) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0);
  const cmp = sortComparator ?? defaultSort;
  switch (cfg.arrangement) {
    case "spiral": return spiralOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp);
    case "concentric": return concentricOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp);
    case "tree": return treeOffsets(members, edges, degrees, nodeSpacing, groupScale, nodeSize, cmp);
    case "grid": return gridOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp);
    default: return new Map();
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
): Map<string, { dx: number; dy: number }> {
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return offsets;

  // Precompute each node's visual radius
  const radii = sorted.map(nd => nodeRadius(nodeSize, degrees.get(nd.id) || 0, scaleByDegree));

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

    // Advance θ for next node: arc-length ≥ (this radius + next radius) × spacingMul
    if (i < n - 1) {
      const minDist = (radii[i] + radii[i + 1]) * spacingMul;
      const currentR = Math.max(a * theta, 1);
      const dTheta = Math.max(minDist / currentR, 0.05);
      theta += dTheta;
    }
  }
  return offsets;
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
): Map<string, { dx: number; dy: number }> {
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return offsets;

  // Precompute radii
  const radii = sorted.map(nd => nodeRadius(nodeSize, degrees.get(nd.id) || 0, scaleByDegree));

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
    let totalDiamNeeded = radii[idx] * 2 * spacingMul;
    while (cap < n - idx) {
      const nextR = radii[idx + cap];
      const nextDiam = nextR * 2 * spacingMul;
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
): Map<string, { dx: number; dy: number }> {
  const offsets = new Map<string, { dx: number; dy: number }>();
  if (members.length === 0) return offsets;

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

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const totalWidth = (layer.length - 1) * nodeSpacing;
    for (let ni = 0; ni < layer.length; ni++) {
      offsets.set(layer[ni], {
        dx: ni * nodeSpacing - totalWidth / 2,
        dy: li * layerHeight - totalHeight / 2,
      });
    }
  }

  return offsets;
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
): Map<string, { dx: number; dy: number }> {
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
    offsets.set(sorted[i].id, {
      dx: col * spacing - totalW / 2,
      dy: row * spacing - totalH / 2,
    });
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
