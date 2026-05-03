/**
 * Test factory functions — reusable builders for common test data types.
 */
import type { GraphData, GraphNode, GraphEdge } from "../../src/types";

// ---------------------------------------------------------------------------
// GraphData
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id.replace(/\.md$/, ""), meta: {}, ...overrides } as GraphNode;
}

/** Create a positioned GraphNode for spatial tests (road network, layout) */
export function makePositionedNode(id: string, x: number, y: number): GraphNode {
	return { id, label: `Node ${id}`, x, y, type: "file" } as GraphNode;
}

function makeEdge(source: string, target: string, type = "link"): GraphEdge {
	return { source, target, type } as GraphEdge;
}

/** Create a GraphData with optional nodes and edges */
export function makeGraphData(opts?: {
	nodes?: Array<string | Partial<GraphNode>>;
	edges?: Array<[string, string, string?]>;
}): GraphData {
	const nodes = (opts?.nodes ?? []).map((n) =>
		typeof n === "string" ? makeNode(n) : makeNode(n.id ?? "unknown", n),
	);
	const edges = (opts?.edges ?? []).map(([s, t, type]) => makeEdge(s, t, type));
	return { nodes, edges } as GraphData;
}
