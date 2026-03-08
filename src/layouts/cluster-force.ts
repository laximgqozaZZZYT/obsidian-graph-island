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
  /** Blend strength toward target position (0–1, default 0.3) */
  strength: number;
  /** Grid columns — only used when arrangement = "grid" */
  gridCols: number;
  /** Canvas center X */
  centerX: number;
  /** Canvas center Y */
  centerY: number;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Multiplier for spacing between nodes within a group (default 1.0) */
  nodeSpacing: number;
  /** Multiplier for spacing between groups (default 1.0) */
  groupSpacing: number;
}

/**
 * Build a d3-compatible force function for cluster arrangement.
 * Returns null if groupBy is "none" or arrangement is "free".
 */
export function buildClusterForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): ((alpha: number) => void) | null {
  if (cfg.arrangement === "free") return null;

  const groups = partitionNodes(nodes, cfg.groupBy, degrees);
  if (groups.size === 0) return null;

  const targets = computeAbsoluteTargets(groups, edges, degrees, cfg);
  const str = cfg.strength;

  return (_alpha: number) => {
    const blend = Math.min(0.85, str * 1.5);

    for (const n of nodes) {
      const t = targets.get(n.id);
      if (!t) continue;
      n.x += (t.x - n.x) * blend;
      n.y += (t.y - n.y) * blend;
      n.vx = 0;
      n.vy = 0;
    }
  };
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
    const offsets = computeOffsets(members, cfg.arrangement, degrees, edges, cfg.gridCols, cfg.nodeSpacing);
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
 * Place groups in a horizontal row, evenly spaced across the canvas width.
 * Each group gets horizontal space proportional to its member count.
 */
function layoutGroupsHorizontal(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  out: Map<string, { x: number; y: number }>,
) {
  const totalNodes = [...groups.values()].reduce((s, m) => s + m.length, 0);
  const margin = cfg.width * 0.05;
  const usableW = (cfg.width - margin * 2) * cfg.groupSpacing;

  let xCursor = margin;
  for (const key of keys) {
    const members = groups.get(key)!;
    const share = members.length / totalNodes;
    const slotW = usableW * share;
    out.set(key, { x: xCursor + slotW / 2, y: cfg.centerY });
    xCursor += slotW;
  }
}

/**
 * Place groups on a circle around the canvas center.
 * Radius adapts to canvas size and the estimated intra-group footprint.
 */
function layoutGroupsCircle(
  keys: string[],
  groups: Map<string, GraphNode[]>,
  cfg: ClusterForceConfig,
  out: Map<string, { x: number; y: number }>,
) {
  const nGroups = keys.length;
  // Estimate the largest group's radius to prevent overlap
  const maxMembers = Math.max(...[...groups.values()].map(m => m.length));
  const maxGroupRadius = estimateGroupRadius(maxMembers, cfg.nodeSpacing);
  // Circle must be large enough so adjacent groups don't overlap
  const minCircleR = (maxGroupRadius * 2 + 40) * nGroups / (2 * Math.PI);
  const canvasR = Math.min(cfg.width, cfg.height) * 0.35;
  const groupRadius = Math.max(canvasR, minCircleR) * cfg.groupSpacing;

  for (let i = 0; i < nGroups; i++) {
    const angle = (i / nGroups) * Math.PI * 2 - Math.PI / 2;
    out.set(keys[i], {
      x: cfg.centerX + groupRadius * Math.cos(angle),
      y: cfg.centerY + groupRadius * Math.sin(angle),
    });
  }
}

/** Rough estimate of a group's visual radius based on member count. */
function estimateGroupRadius(n: number, nodeSpacing: number): number {
  return 15 * Math.sqrt(n) * nodeSpacing;
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
  arrangement: ClusterArrangement,
  degrees: Map<string, number>,
  edges: GraphEdge[],
  gridCols: number,
  nodeSpacing: number,
): Map<string, { dx: number; dy: number }> {
  switch (arrangement) {
    case "spiral": return spiralOffsets(members, degrees, nodeSpacing);
    case "concentric": return concentricOffsets(members, degrees, nodeSpacing);
    case "tree": return treeOffsets(members, edges, degrees, nodeSpacing);
    case "grid": return gridOffsets(members, degrees, gridCols, nodeSpacing);
    default: return new Map();
  }
}

// ---------------------------------------------------------------------------
// Spiral — Archimedean: r = aθ with equal arc-length spacing
//
// θ is derived from equal arc-length: s = aθ²/2 → θ = √(2s/a)
// where s = i * nodeGap (cumulative arc length to the i-th point).
// armGap controls distance between successive turns (2πa).
// ---------------------------------------------------------------------------

function spiralOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
): Map<string, { dx: number; dy: number }> {
  const sorted = [...members].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return offsets;

  // Archimedean spiral: r = a * theta, where a = armGap / (2 * PI).
  // armGap = radial distance between successive turns.
  //
  // Nodes are placed at linearly increasing theta (equal angular step)
  // which produces clearly visible spiral arms. The total number of
  // turns is kept moderate (~sqrt(n)/2.5) so arms stay distinguishable.
  //
  // A small irrational angular offset (based on the golden ratio)
  // is added to prevent nodes from aligning on the same radial ray
  // when n is very small.
  const armGap = Math.max(16, 32 - n * 0.04) * spacingMul;
  const a = armGap / (2 * Math.PI);
  const totalTurns = Math.max(2.5, Math.sqrt(n) / 2.5);
  const totalTheta = totalTurns * 2 * Math.PI;
  const dTheta = totalTheta / Math.max(1, n - 1);
  // Golden-ratio offset (irrational) avoids collinear nodes for small n
  const goldenOff = 0.3819660112 * Math.PI; // (3 - sqrt(5))/2 * PI

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      offsets.set(sorted[i].id, { dx: 0, dy: 0 });
    } else {
      const theta = i * dTheta + goldenOff;
      const r = a * i * dTheta; // radius based on unshifted angle for true Archimedean
      offsets.set(sorted[i].id, {
        dx: r * Math.cos(theta),
        dy: r * Math.sin(theta),
      });
    }
  }
  return offsets;
}

// ---------------------------------------------------------------------------
// Concentric rings — radius proportional to group member count
//
// Ring i holds 6*i nodes (i≥1); ring 0 holds 1 node (center).
// Ring spacing = baseRing * √(n) / 10, so outer radius ∝ member count.
// ---------------------------------------------------------------------------

function concentricOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  spacingMul: number,
): Map<string, { dx: number; dy: number }> {
  const sorted = [...members].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  if (n === 0) return offsets;

  // Ring spacing scales with member count so total radius ∝ n
  const ringSpacing = Math.max(10, 6 * Math.sqrt(n)) * spacingMul;

  let ringIdx = 0;
  let posInRing = 0;

  for (let i = 0; i < n; i++) {
    if (ringIdx === 0) {
      offsets.set(sorted[i].id, { dx: 0, dy: 0 });
      posInRing++;
      if (posInRing >= 1) { ringIdx++; posInRing = 0; }
      continue;
    }

    const cap = ringIdx * 6;
    const angle = (posInRing / cap) * Math.PI * 2;
    const r = ringSpacing * ringIdx;
    offsets.set(sorted[i].id, {
      dx: r * Math.cos(angle),
      dy: r * Math.sin(angle),
    });

    posInRing++;
    if (posInRing >= cap) { ringIdx++; posInRing = 0; }
  }
  return offsets;
}

// ---------------------------------------------------------------------------
// Tree — BFS from highest-degree node, layered top-down
// ---------------------------------------------------------------------------

function treeOffsets(
  members: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  spacingMul: number,
): Map<string, { dx: number; dy: number }> {
  const offsets = new Map<string, { dx: number; dy: number }>();
  if (members.length === 0) return offsets;

  const nodeSpacing = Math.max(10, 25 - members.length * 0.005) * spacingMul;
  const layerHeight = nodeSpacing * 1.5;

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

  // BFS from highest-degree node
  const root = [...members].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0))[0];
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

  // Add disconnected nodes as extra layer
  const disconnected = members.filter(n => !visited.has(n.id)).map(n => n.id);
  if (disconnected.length > 0) layers.push(disconnected);

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
// Grid — m×n grid sorted by degree
// ---------------------------------------------------------------------------

function gridOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  cols: number,
  spacingMul: number,
): Map<string, { dx: number; dy: number }> {
  const sorted = [...members].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  const spacing = Math.max(10, 25 - n * 0.005) * spacingMul;
  const c = Math.max(1, cols);
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
