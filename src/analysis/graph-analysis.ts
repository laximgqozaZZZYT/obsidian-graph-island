import type { GraphNode, GraphEdge } from "../types";

// ---------------------------------------------------------------------------
// Graph Statistics (Feature CX)
// ---------------------------------------------------------------------------

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  /** Graph density: edges / max possible edges (0–1) */
  density: number;
  /** Top N most-connected nodes: [nodeId, degree] */
  hubs: [string, number][];
  /** Number of connected components via BFS */
  componentCount: number;
}

/**
 * Compute summary statistics for the current graph view.
 * @param nodes  Visible nodes
 * @param edges  Visible edges
 * @param degrees  Pre-computed degree map (from computeNodeDegrees)
 * @param hubCount  How many top hubs to return (default 5)
 */
export function computeGraphStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degrees: Map<string, number>,
  hubCount = 5,
): GraphStats {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;
  const density = nodeCount > 1
    ? (2 * edgeCount) / (nodeCount * (nodeCount - 1))
    : 0;
  const hubs: [string, number][] = [...degrees.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, hubCount);
  const componentCount = countConnectedComponents(nodes, edges);
  return { nodeCount, edgeCount, avgDegree, density, hubs, componentCount };
}

/**
 * Count connected components using BFS.
 */
export function countConnectedComponents(
  nodes: GraphNode[],
  edges: GraphEdge[],
): number {
  if (nodes.length === 0) return 0;
  // Build adjacency
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
  const visited = new Set<string>();
  let components = 0;
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    components++;
    // BFS from this node
    const queue = [n.id];
    visited.add(n.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
  }
  return components;
}

export function computeNodeDegrees(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of nodes) degrees.set(node.id, 0);
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
  }
  return degrees;
}

export function computeInDegree(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, number> {
  const inDegree = new Map<string, number>();
  for (const node of nodes) inDegree.set(node.id, 0);
  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }
  return inDegree;
}

export function computePropagatedImportance(
  nodes: GraphNode[],
  edges: GraphEdge[],
  decay = 0.5
): Map<string, number> {
  const inDeg = new Map<string, number>();
  for (const n of nodes) inDeg.set(n.id, 0);
  for (const e of edges) {
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const outgoing = new Map<string, string[]>();
  for (const n of nodes) outgoing.set(n.id, []);
  for (const e of edges) {
    outgoing.get(e.source)?.push(e.target);
  }

  const importance = new Map<string, number>();
  for (const n of nodes) {
    importance.set(n.id, inDeg.get(n.id) ?? 0);
  }

  for (let iter = 0; iter < 3; iter++) {
    let changed = false;
    for (const n of nodes) {
      const targets = outgoing.get(n.id) ?? [];
      if (targets.length === 0) continue;
      const childSum = targets.reduce(
        (sum, tid) => sum + (importance.get(tid) ?? 0),
        0
      );
      const newVal = (inDeg.get(n.id) ?? 0) + decay * childSum;
      const oldVal = importance.get(n.id) ?? 0;
      if (Math.abs(newVal - oldVal) > 0.001) {
        importance.set(n.id, newVal);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return importance;
}
