/**
 * Test factory functions — reusable builders for common test data types.
 */
import type { GraphData, GraphNode, GraphEdge, SnapshotDiff, GraphSnapshot } from "../../src/types";

// ---------------------------------------------------------------------------
// GraphData
// ---------------------------------------------------------------------------

/** Create a minimal GraphNode */
export function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return { id, label: id.replace(/\.md$/, ""), meta: {}, ...overrides } as GraphNode;
}

/** Create a positioned GraphNode for spatial tests (road network, layout) */
export function makePositionedNode(id: string, x: number, y: number): GraphNode {
  return { id, label: `Node ${id}`, x, y, type: "file" } as GraphNode;
}

/** Create a minimal GraphEdge */
export function makeEdge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type } as GraphEdge;
}

/** Create a GraphData with optional nodes and edges */
export function makeGraphData(opts?: {
  nodes?: Array<string | Partial<GraphNode>>;
  edges?: Array<[string, string, string?]>;
}): GraphData {
  const nodes = (opts?.nodes ?? []).map(n =>
    typeof n === "string" ? makeNode(n) : makeNode(n.id ?? "unknown", n),
  );
  const edges = (opts?.edges ?? []).map(([s, t, type]) => makeEdge(s, t, type));
  return { nodes, edges } as GraphData;
}

// ---------------------------------------------------------------------------
// SnapshotDiff
// ---------------------------------------------------------------------------

/** Create a minimal SnapshotDiff for testing */
export function makeDiff(opts?: Partial<{
  addedNodeIds: string[];
  removedNodes: Array<{ id: string; metaHash: string }>;
  changedNodeIds: string[];
  addedEdgeKeys: string[];
  removedEdges: Array<{ source: string; target: string; type: string }>;
}>): SnapshotDiff {
  return {
    addedNodeIds: new Set(opts?.addedNodeIds ?? []),
    removedNodes: opts?.removedNodes ?? [],
    changedNodeIds: new Set(opts?.changedNodeIds ?? []),
    addedEdgeKeys: new Set(opts?.addedEdgeKeys ?? []),
    removedEdges: opts?.removedEdges ?? [],
  };
}

// ---------------------------------------------------------------------------
// GraphSnapshot
// ---------------------------------------------------------------------------

/** Create a minimal GraphSnapshot for testing */
export function makeSnapshot(
  name: string,
  opts?: Partial<{
    createdAt: string;
    nodeCount: number;
    edgeCount: number;
    layout: string;
    searchQuery: string;
    groupBy: string;
    notes: string;
  }>,
): GraphSnapshot {
  return {
    name,
    createdAt: opts?.createdAt ?? new Date().toISOString(),
    nodes: Array.from({ length: opts?.nodeCount ?? 10 }, (_, i) => ({
      id: `node-${i}`,
      metaHash: "",
    })),
    edges: Array.from({ length: opts?.edgeCount ?? 5 }, (_, i) => ({
      source: `node-${i}`,
      target: `node-${(i + 1) % (opts?.nodeCount ?? 10)}`,
      type: "link",
    })),
    notes: opts?.notes,
    context: {
      layout: opts?.layout ?? "force",
      searchQuery: opts?.searchQuery ?? "",
      groupBy: opts?.groupBy ?? "",
      nodeCount: opts?.nodeCount ?? 10,
      edgeCount: opts?.edgeCount ?? 5,
    },
  };
}
