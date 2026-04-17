import { describe, it, expect } from "vitest";
import { bfsShortestPath, computeComparison, VIEW_TYPE_NODE_COMPARE } from "../src/views/NodeComparisonView";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helper: create minimal GraphNode for testing
// ---------------------------------------------------------------------------
function mkNode(id: string, opts: Partial<GraphNode> = {}): GraphNode {
	return {
		id,
		label: opts.label ?? id,
		x: 0,
		y: 0,
		tags: opts.tags,
		category: opts.category,
		filePath: opts.filePath,
		...opts,
	} as GraphNode;
}

// ---------------------------------------------------------------------------
// VIEW_TYPE_NODE_COMPARE constant
// ---------------------------------------------------------------------------
describe("VIEW_TYPE_NODE_COMPARE", () => {
	it("is a non-empty string", () => {
		expect(typeof VIEW_TYPE_NODE_COMPARE).toBe("string");
		expect(VIEW_TYPE_NODE_COMPARE.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// bfsShortestPath — BFS shortest path between two nodes
// ---------------------------------------------------------------------------
describe("bfsShortestPath", () => {
	it("returns [start] when start === end", () => {
		const adj = new Map<string, Set<string>>();
		expect(bfsShortestPath(adj, "a", "a")).toEqual(["a"]);
	});

	it("finds direct neighbor path (length 1)", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
		]);
		expect(bfsShortestPath(adj, "a", "b")).toEqual(["a", "b"]);
	});

	it("finds 2-hop path", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["b", new Set(["a", "c"])],
			["c", new Set(["b"])],
		]);
		const path = bfsShortestPath(adj, "a", "c");
		expect(path).toEqual(["a", "b", "c"]);
	});

	it("returns null when no path exists", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["c", new Set(["d"])],
		]);
		expect(bfsShortestPath(adj, "a", "c")).toBeNull();
	});

	it("returns null when target has no entry in adj", () => {
		const adj = new Map([["a", new Set(["b"])]]);
		expect(bfsShortestPath(adj, "a", "z")).toBeNull();
	});

	it("finds shortest among multiple paths", () => {
		// a-b-c (2 hops) vs a-d-e-c (3 hops)
		const adj = new Map([
			["a", new Set(["b", "d"])],
			["b", new Set(["a", "c"])],
			["c", new Set(["b", "e"])],
			["d", new Set(["a", "e"])],
			["e", new Set(["d", "c"])],
		]);
		const path = bfsShortestPath(adj, "a", "c");
		expect(path).not.toBeNull();
		expect(path!.length).toBe(3); // shortest is a-b-c
		expect(path![0]).toBe("a");
		expect(path![path!.length - 1]).toBe("c");
	});

	it("handles graph with isolated nodes", () => {
		const adj = new Map([
			["a", new Set<string>()],
			["b", new Set<string>()],
		]);
		expect(bfsShortestPath(adj, "a", "b")).toBeNull();
	});

	it("handles empty adjacency map", () => {
		const adj = new Map<string, Set<string>>();
		expect(bfsShortestPath(adj, "a", "b")).toBeNull();
	});

	it("works with directed graphs (one-way edges)", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["b", new Set<string>()], // b cannot reach a
		]);
		expect(bfsShortestPath(adj, "a", "b")).toEqual(["a", "b"]);
		expect(bfsShortestPath(adj, "b", "a")).toBeNull();
	});

	it("handles self-loop in adjacency", () => {
		const adj = new Map([
			["a", new Set(["a", "b"])],
			["b", new Set(["a"])],
		]);
		expect(bfsShortestPath(adj, "a", "b")).toEqual(["a", "b"]);
	});
});

// ---------------------------------------------------------------------------
// computeComparison — shared/unique neighbors, tags, categories, path
// ---------------------------------------------------------------------------
describe("computeComparison", () => {
	it("identifies shared neighbors (excluding A and B themselves)", () => {
		const adj = new Map([
			["a", new Set(["b", "c", "d"])],
			["b", new Set(["a", "c", "e"])],
			["c", new Set(["a", "b"])],
			["d", new Set(["a"])],
			["e", new Set(["b"])],
		]);
		const nodeA = mkNode("a");
		const nodeB = mkNode("b");
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.sharedNeighbors).toContain("c");
		expect(result.sharedNeighbors).not.toContain("a");
		expect(result.sharedNeighbors).not.toContain("b");
	});

	it("identifies unique neighbors for A and B", () => {
		const adj = new Map([
			["a", new Set(["b", "c", "d"])],
			["b", new Set(["a", "c", "e"])],
		]);
		const nodeA = mkNode("a");
		const nodeB = mkNode("b");
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.uniqueToA).toContain("d");
		expect(result.uniqueToA).not.toContain("c"); // shared
		expect(result.uniqueToA).not.toContain("b"); // B itself excluded
		expect(result.uniqueToB).toContain("e");
		expect(result.uniqueToB).not.toContain("a"); // A itself excluded
	});

	it("computes shared and unique tags", () => {
		const nodeA = mkNode("a", { tags: ["fantasy", "action", "drama"] });
		const nodeB = mkNode("b", { tags: ["action", "sci-fi"] });
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.sharedTags).toEqual(["action"]);
		expect(result.uniqueTagsA).toContain("fantasy");
		expect(result.uniqueTagsA).toContain("drama");
		expect(result.uniqueTagsB).toEqual(["sci-fi"]);
	});

	it("identifies shared category", () => {
		const nodeA = mkNode("a", { category: "character" });
		const nodeB = mkNode("b", { category: "character" });
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.sharedCategories).toEqual(["character"]);
	});

	it("returns empty sharedCategories when categories differ", () => {
		const nodeA = mkNode("a", { category: "character" });
		const nodeB = mkNode("b", { category: "location" });
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.sharedCategories).toEqual([]);
	});

	it("returns empty sharedCategories when one node has no category", () => {
		const nodeA = mkNode("a", { category: "character" });
		const nodeB = mkNode("b");
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.sharedCategories).toEqual([]);
	});

	it("computes shortest path and pathLength", () => {
		const adj = new Map([
			["a", new Set(["c"])],
			["b", new Set(["c"])],
			["c", new Set(["a", "b"])],
		]);
		const nodeA = mkNode("a");
		const nodeB = mkNode("b");
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.shortestPath).toEqual(["a", "c", "b"]);
		expect(result.pathLength).toBe(2);
	});

	it("returns null path and -1 length when unreachable", () => {
		const adj = new Map<string, Set<string>>();
		const nodeA = mkNode("a");
		const nodeB = mkNode("b");
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.shortestPath).toBeNull();
		expect(result.pathLength).toBe(-1);
	});

	it("handles nodes with no tags gracefully", () => {
		const nodeA = mkNode("a");
		const nodeB = mkNode("b");
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.sharedTags).toEqual([]);
		expect(result.uniqueTagsA).toEqual([]);
		expect(result.uniqueTagsB).toEqual([]);
	});

	it("handles direct neighbors (path length 1)", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
		]);
		const nodeA = mkNode("a");
		const nodeB = mkNode("b");
		const result = computeComparison(nodeA, nodeB, adj);

		expect(result.shortestPath).toEqual(["a", "b"]);
		expect(result.pathLength).toBe(1);
	});
});
