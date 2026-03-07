import type { GraphNode, GraphEdge } from "../types";

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
    outgoing.get(e.source)!.push(e.target);
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
