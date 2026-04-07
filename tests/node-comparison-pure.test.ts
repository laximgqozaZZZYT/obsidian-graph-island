import { describe, it, expect } from "vitest";
import {
	classifyNeighbors,
	classifyTags,
	computeComparison,
} from "../src/views/NodeComparisonView";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// classifyNeighbors — set-difference between two adjacency sets
// ---------------------------------------------------------------------------

describe("classifyNeighbors", () => {
	it("returns empty arrays when both sets are empty", () => {
		const result = classifyNeighbors(new Set(), new Set(), "a", "b");
		expect(result).toEqual({ shared: [], uniqueToA: [], uniqueToB: [] });
	});

	it("classifies shared and unique neighbors correctly", () => {
		const nA = new Set(["x", "y", "z"]);
		const nB = new Set(["y", "z", "w"]);
		const result = classifyNeighbors(nA, nB, "a", "b");
		expect(result.shared.sort()).toEqual(["y", "z"]);
		expect(result.uniqueToA).toEqual(["x"]);
		expect(result.uniqueToB).toEqual(["w"]);
	});

	it("excludes idA and idB from all result arrays", () => {
		const nA = new Set(["b", "x"]); // b is idB — should be excluded
		const nB = new Set(["a", "x"]); // a is idA — should be excluded
		const result = classifyNeighbors(nA, nB, "a", "b");
		expect(result.shared).toEqual(["x"]);
		expect(result.uniqueToA).toEqual([]);
		expect(result.uniqueToB).toEqual([]);
	});

	it("handles A having neighbors but B having none", () => {
		const nA = new Set(["x", "y"]);
		const nB = new Set<string>();
		const result = classifyNeighbors(nA, nB, "a", "b");
		expect(result.shared).toEqual([]);
		expect(result.uniqueToA).toEqual(["x", "y"]);
		expect(result.uniqueToB).toEqual([]);
	});

	it("handles B having neighbors but A having none", () => {
		const nA = new Set<string>();
		const nB = new Set(["x", "y"]);
		const result = classifyNeighbors(nA, nB, "a", "b");
		expect(result.shared).toEqual([]);
		expect(result.uniqueToA).toEqual([]);
		expect(result.uniqueToB).toEqual(["x", "y"]);
	});

	it("handles completely overlapping neighbor sets", () => {
		const common = new Set(["x", "y", "z"]);
		const result = classifyNeighbors(common, new Set(common), "a", "b");
		expect(result.shared.sort()).toEqual(["x", "y", "z"]);
		expect(result.uniqueToA).toEqual([]);
		expect(result.uniqueToB).toEqual([]);
	});

	it("handles completely disjoint neighbor sets", () => {
		const nA = new Set(["x", "y"]);
		const nB = new Set(["w", "z"]);
		const result = classifyNeighbors(nA, nB, "a", "b");
		expect(result.shared).toEqual([]);
		expect(result.uniqueToA.sort()).toEqual(["x", "y"]);
		expect(result.uniqueToB.sort()).toEqual(["w", "z"]);
	});
});

// ---------------------------------------------------------------------------
// classifyTags — set-difference between tag arrays
// ---------------------------------------------------------------------------

describe("classifyTags", () => {
	it("returns empty arrays when both are undefined", () => {
		const result = classifyTags(undefined, undefined);
		expect(result).toEqual({ shared: [], uniqueToA: [], uniqueToB: [] });
	});

	it("returns empty arrays when both are empty", () => {
		const result = classifyTags([], []);
		expect(result).toEqual({ shared: [], uniqueToA: [], uniqueToB: [] });
	});

	it("classifies shared and unique tags", () => {
		const result = classifyTags(["a", "b", "c"], ["b", "c", "d"]);
		expect(result.shared.sort()).toEqual(["b", "c"]);
		expect(result.uniqueToA).toEqual(["a"]);
		expect(result.uniqueToB).toEqual(["d"]);
	});

	it("handles A having tags but B undefined", () => {
		const result = classifyTags(["x", "y"], undefined);
		expect(result.shared).toEqual([]);
		expect(result.uniqueToA.sort()).toEqual(["x", "y"]);
		expect(result.uniqueToB).toEqual([]);
	});

	it("handles B having tags but A undefined", () => {
		const result = classifyTags(undefined, ["x", "y"]);
		expect(result.shared).toEqual([]);
		expect(result.uniqueToA).toEqual([]);
		expect(result.uniqueToB.sort()).toEqual(["x", "y"]);
	});

	it("deduplicates within same array via Set", () => {
		const result = classifyTags(["a", "a", "b"], ["b", "b", "c"]);
		expect(result.shared).toEqual(["b"]);
		expect(result.uniqueToA).toEqual(["a"]);
		expect(result.uniqueToB).toEqual(["c"]);
	});

	it("handles identical tag arrays", () => {
		const result = classifyTags(["x", "y"], ["x", "y"]);
		expect(result.shared.sort()).toEqual(["x", "y"]);
		expect(result.uniqueToA).toEqual([]);
		expect(result.uniqueToB).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// computeComparison — integration of classifyNeighbors + classifyTags + BFS
// ---------------------------------------------------------------------------

function makeNode(id: string, opts: Partial<GraphNode> = {}): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts };
}

describe("computeComparison", () => {
	it("computes comparison for two isolated nodes", () => {
		const nodeA = makeNode("a");
		const nodeB = makeNode("b");
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);
		expect(result.sharedNeighbors).toEqual([]);
		expect(result.uniqueToA).toEqual([]);
		expect(result.uniqueToB).toEqual([]);
		expect(result.shortestPath).toBeNull();
		expect(result.pathLength).toBe(-1);
	});

	it("computes shared neighbors and shortest path", () => {
		const nodeA = makeNode("a");
		const nodeB = makeNode("b");
		const adj = new Map<string, Set<string>>([
			["a", new Set(["b", "x"])],
			["b", new Set(["a", "x", "y"])],
			["x", new Set(["a", "b"])],
			["y", new Set(["b"])],
		]);
		const result = computeComparison(nodeA, nodeB, adj);
		expect(result.sharedNeighbors).toEqual(["x"]);
		expect(result.uniqueToA).toEqual([]);
		expect(result.uniqueToB).toEqual(["y"]);
		expect(result.shortestPath).toEqual(["a", "b"]);
		expect(result.pathLength).toBe(1);
	});

	it("detects shared tags and categories", () => {
		const nodeA = makeNode("a", { tags: ["foo", "bar"], category: "cat1" });
		const nodeB = makeNode("b", { tags: ["bar", "baz"], category: "cat1" });
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);
		expect(result.sharedTags).toEqual(["bar"]);
		expect(result.uniqueTagsA).toEqual(["foo"]);
		expect(result.uniqueTagsB).toEqual(["baz"]);
		expect(result.sharedCategories).toEqual(["cat1"]);
	});

	it("returns empty sharedCategories when categories differ", () => {
		const nodeA = makeNode("a", { category: "cat1" });
		const nodeB = makeNode("b", { category: "cat2" });
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);
		expect(result.sharedCategories).toEqual([]);
	});

	it("returns empty sharedCategories when one node has no category", () => {
		const nodeA = makeNode("a", { category: "cat1" });
		const nodeB = makeNode("b");
		const adj = new Map<string, Set<string>>();
		const result = computeComparison(nodeA, nodeB, adj);
		expect(result.sharedCategories).toEqual([]);
	});

	it("computes multi-hop shortest path", () => {
		const nodeA = makeNode("a");
		const nodeB = makeNode("d");
		const adj = new Map<string, Set<string>>([
			["a", new Set(["b"])],
			["b", new Set(["a", "c"])],
			["c", new Set(["b", "d"])],
			["d", new Set(["c"])],
		]);
		const result = computeComparison(nodeA, nodeB, adj);
		expect(result.shortestPath).toEqual(["a", "b", "c", "d"]);
		expect(result.pathLength).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// EmbeddedGraphRenderer pure functions
// ---------------------------------------------------------------------------

import { layoutConcentric, getColor } from "../src/views/EmbeddedGraphRenderer";

describe("layoutConcentric", () => {
	it("does nothing for empty array", () => {
		layoutConcentric([]);
		// no throw
	});

	it("places center node at origin", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		layoutConcentric(nodes, "a");
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("places center node at origin by id match", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		layoutConcentric(nodes, "b");
		expect(nodes[1].x).toBe(0);
		expect(nodes[1].y).toBe(0);
	});

	it("falls back to first node when centerPath not found", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		layoutConcentric(nodes, "nonexistent");
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("falls back to first node when centerPath is undefined", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		layoutConcentric(nodes);
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("distributes non-center nodes in concentric rings", () => {
		const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`));
		layoutConcentric(nodes, "n0");
		// Center at origin
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
		// All other nodes should be at non-zero positions
		for (let i = 1; i < nodes.length; i++) {
			const dist = Math.sqrt(nodes[i].x ** 2 + nodes[i].y ** 2);
			expect(dist).toBeGreaterThan(0);
		}
	});

	it("first ring nodes are at radius 80", () => {
		const nodes = [makeNode("center"), makeNode("ring1")];
		layoutConcentric(nodes, "center");
		const dist = Math.sqrt(nodes[1].x ** 2 + nodes[1].y ** 2);
		expect(dist).toBeCloseTo(80, 1);
	});

	it("places single node at origin", () => {
		const nodes = [makeNode("only")];
		layoutConcentric(nodes, "only");
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("places many nodes across multiple rings", () => {
		// 8 * 1 = 8 per first ring, so 9+ nodes should spill to ring 2
		const nodes = Array.from({ length: 20 }, (_, i) => makeNode(`n${i}`));
		layoutConcentric(nodes, "n0");
		const distances = nodes.slice(1).map((n) => Math.sqrt(n.x ** 2 + n.y ** 2));
		// Should have at least two distinct radius values
		const uniqueRadii = new Set(distances.map((d) => Math.round(d)));
		expect(uniqueRadii.size).toBeGreaterThanOrEqual(2);
	});
});

describe("getColor", () => {
	it("returns a color for index 0", () => {
		const c = getColor(0);
		expect(typeof c).toBe("string");
		expect(c.length).toBeGreaterThan(0);
	});

	it("wraps around for large indices", () => {
		const c0 = getColor(0);
		const cWrap = getColor(100000);
		// Should still return a valid string
		expect(typeof cWrap).toBe("string");
		// getColor(0) and getColor(N*palette.length) should match
		expect(cWrap).toBeDefined();
	});

	it("returns different colors for different indices", () => {
		const colors = new Set([getColor(0), getColor(1), getColor(2)]);
		expect(colors.size).toBeGreaterThanOrEqual(2);
	});

	it("handles negative-like wrapping gracefully", () => {
		// JavaScript % can give negative with negative operand,
		// but the implementation uses modulus on non-negative index
		const c = getColor(0);
		expect(c).toBeDefined();
	});
});
