import { describe, it, expect } from "vitest";
import type { GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Replicate the _buildMissingNeighborSet algorithm as a pure function
// so it can be tested without instantiating GraphViewContainer.
// ---------------------------------------------------------------------------
function buildMissingNeighborSet(nodes: GraphNode[], edges: GraphEdge[]): Set<string> | null {
	// Build tag → nodeIds map (all tags, not just enclosure-assigned)
	const tagToNodes = new Map<string, string[]>();
	for (const n of nodes) {
		if (n.isTag || !n.tags) continue;
		for (const tag of n.tags) {
			let arr = tagToNodes.get(tag);
			if (!arr) {
				arr = [];
				tagToNodes.set(tag, arr);
			}
			arr.push(n.id);
		}
	}

	// Build edge adjacency set for O(1) lookup
	const edgeSet = new Set<string>();
	for (const e of edges) {
		const s = typeof e.source === "object" ? (e.source as GraphNode).id : e.source;
		const t = typeof e.target === "object" ? (e.target as GraphNode).id : e.target;
		edgeSet.add(s < t ? `${s}\0${t}` : `${t}\0${s}`);
	}

	// For each tag group, find pairs with no edge → mark both nodes
	const result = new Set<string>();
	for (const [, nodeIds] of tagToNodes) {
		if (nodeIds.length < 2) continue;
		const len = Math.min(nodeIds.length, 200);
		for (let i = 0; i < len; i++) {
			let hasMissingPair = false;
			for (let j = i + 1; j < len; j++) {
				const a = nodeIds[i],
					b = nodeIds[j];
				const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
				if (!edgeSet.has(key)) {
					hasMissingPair = true;
					result.add(b);
				}
			}
			if (hasMissingPair) result.add(nodeIds[i]);
		}
	}

	return result.size > 0 ? result : null;
}

// Helper to create a minimal GraphNode
function mkNode(id: string, tags?: string[], isTag?: boolean): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, tags, isTag };
}

// Helper to create a minimal GraphEdge
function mkEdge(source: string, target: string): GraphEdge {
	return { id: `${source}-${target}`, source, target };
}

describe("buildMissingNeighborSet", () => {
	it("returns null when no nodes have tags", () => {
		const nodes = [mkNode("A"), mkNode("B")];
		const edges = [mkEdge("A", "B")];
		expect(buildMissingNeighborSet(nodes, edges)).toBeNull();
	});

	it("returns null when nodes have empty tags array", () => {
		const nodes = [mkNode("A", []), mkNode("B", [])];
		expect(buildMissingNeighborSet(nodes, [])).toBeNull();
	});

	it("does not flag nodes sharing a tag when they have an edge", () => {
		const nodes = [mkNode("A", ["t1"]), mkNode("B", ["t1"])];
		const edges = [mkEdge("A", "B")];
		expect(buildMissingNeighborSet(nodes, edges)).toBeNull();
	});

	it("flags both nodes sharing a tag when they lack an edge", () => {
		const nodes = [mkNode("A", ["t1"]), mkNode("B", ["t1"])];
		const result = buildMissingNeighborSet(nodes, []);
		expect(result).not.toBeNull();
		expect(result!.has("A")).toBe(true);
		expect(result!.has("B")).toBe(true);
	});

	it("does not flag a node with a unique tag (no other node shares it)", () => {
		const nodes = [mkNode("A", ["unique"]), mkNode("B", ["other"])];
		// Each tag has only 1 node, so no pairs to check
		expect(buildMissingNeighborSet(nodes, [])).toBeNull();
	});

	it("skips tag nodes (isTag = true)", () => {
		const nodes = [
			mkNode("A", ["t1"]),
			mkNode("tag-t1", ["t1"], true), // tag node, should be ignored
		];
		// Only one non-tag node has the tag, so no pairs
		expect(buildMissingNeighborSet(nodes, [])).toBeNull();
	});

	it("handles mixed: some pairs connected, some not", () => {
		const nodes = [mkNode("A", ["t1"]), mkNode("B", ["t1"]), mkNode("C", ["t1"])];
		// A-B connected, but A-C and B-C not connected
		const edges = [mkEdge("A", "B")];
		const result = buildMissingNeighborSet(nodes, edges);
		expect(result).not.toBeNull();
		// A is missing a connection to C
		expect(result!.has("A")).toBe(true);
		// B is missing a connection to C
		expect(result!.has("B")).toBe(true);
		// C is missing connections to A and B
		expect(result!.has("C")).toBe(true);
	});

	it("does not crash with groups larger than 200 nodes", () => {
		// Create 250 nodes all sharing the same tag, no edges
		const nodes: GraphNode[] = [];
		for (let i = 0; i < 250; i++) {
			nodes.push(mkNode(`n${i}`, ["big-tag"]));
		}
		const result = buildMissingNeighborSet(nodes, []);
		expect(result).not.toBeNull();
		// Should cap at 200 — first 200 nodes are checked
		// All 200 should be flagged (no edges between any of them)
		for (let i = 0; i < 200; i++) {
			expect(result!.has(`n${i}`)).toBe(true);
		}
		// Nodes beyond 200 may still be flagged as "b" in inner loop
		// but node at index 200+ won't be checked as "i" in outer loop
	});

	it("handles edge key ordering correctly (source > target lexically)", () => {
		// Ensure the canonical key works regardless of source/target order
		const nodes = [mkNode("Z", ["t1"]), mkNode("A", ["t1"])];
		// Edge from Z→A: canonical key should be "A\0Z"
		const edges = [mkEdge("Z", "A")];
		expect(buildMissingNeighborSet(nodes, edges)).toBeNull();
	});

	it("flags across multiple tags independently", () => {
		const nodes = [mkNode("A", ["t1"]), mkNode("B", ["t1", "t2"]), mkNode("C", ["t2"])];
		// A-B share t1 (no edge → flagged), B-C share t2 (no edge → flagged)
		const result = buildMissingNeighborSet(nodes, []);
		expect(result).not.toBeNull();
		expect(result!.has("A")).toBe(true);
		expect(result!.has("B")).toBe(true);
		expect(result!.has("C")).toBe(true);
	});
});
