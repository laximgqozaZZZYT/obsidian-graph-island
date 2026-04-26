import { describe, it, expect } from "vitest";
import {
	countConnectedComponents,
	computeGraphStats,
	computeNodeDegrees,
	generateStructureQuestions,
} from "../src/analysis/graph-analysis";

function buildDegrees(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
	return computeNodeDegrees(nodes, edges);
}
import type { GraphNode, GraphEdge } from "../src/types";

function mkNode(id: string, tags?: string[]): GraphNode {
	return { id, label: id, filePath: `${id}.md`, tags } as GraphNode;
}
function mkEdge(s: string, t: string, type = "link"): GraphEdge {
	return { id: `${s}-${t}`, source: s, target: t, type } as GraphEdge;
}

// =========================================================================
// countConnectedComponents
// =========================================================================
describe("countConnectedComponents", () => {
	it("returns 0 for empty graph", () => {
		expect(countConnectedComponents([], [])).toBe(0);
	});

	it("single node = 1 component", () => {
		expect(countConnectedComponents([mkNode("a")], [])).toBe(1);
	});

	it("two connected nodes = 1 component", () => {
		expect(countConnectedComponents([mkNode("a"), mkNode("b")], [mkEdge("a", "b")])).toBe(1);
	});

	it("two isolated nodes = 2 components", () => {
		expect(countConnectedComponents([mkNode("a"), mkNode("b")], [])).toBe(2);
	});

	it("triangle = 1 component", () => {
		expect(
			countConnectedComponents(
				[mkNode("a"), mkNode("b"), mkNode("c")],
				[mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("c", "a")],
			),
		).toBe(1);
	});

	it("two separate pairs = 2 components", () => {
		expect(
			countConnectedComponents(
				[mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")],
				[mkEdge("a", "b"), mkEdge("c", "d")],
			),
		).toBe(2);
	});

	it("chain of 5 = 1 component", () => {
		const nodes = ["a", "b", "c", "d", "e"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("c", "d"), mkEdge("d", "e")];
		expect(countConnectedComponents(nodes, edges)).toBe(1);
	});
});

// =========================================================================
// computeNodeDegrees
// =========================================================================
describe("computeNodeDegrees", () => {
	it("returns empty map for empty graph", () => {
		const d = computeNodeDegrees([], []);
		expect(d.size).toBe(0);
	});

	it("isolated node has degree 0", () => {
		const d = computeNodeDegrees([mkNode("a")], []);
		expect(d.get("a")).toBe(0);
	});

	it("single edge gives degree 1 to both endpoints", () => {
		const d = computeNodeDegrees([mkNode("a"), mkNode("b")], [mkEdge("a", "b")]);
		expect(d.get("a")).toBe(1);
		expect(d.get("b")).toBe(1);
	});

	it("star center has degree N-1", () => {
		const center = mkNode("hub");
		const spokes = ["s1", "s2", "s3", "s4"].map((id) => mkNode(id));
		const edges = spokes.map((s) => mkEdge("hub", s.id));
		const d = computeNodeDegrees([center, ...spokes], edges);
		expect(d.get("hub")).toBe(4);
		for (const s of spokes) expect(d.get(s.id)).toBe(1);
	});
});

// =========================================================================
// computeGraphStats
// =========================================================================
describe("computeGraphStats", () => {
	it("returns valid stats for empty graph", () => {
		const s = computeGraphStats([], [], new Map());
		expect(s.nodeCount).toBe(0);
		expect(s.edgeCount).toBe(0);
		expect(s.avgDegree).toBe(0);
		expect(s.density).toBe(0);
	});

	it("single node with no edges", () => {
		const n = [mkNode("a")];
		const s = computeGraphStats(n, [], buildDegrees(n, []));
		expect(s.nodeCount).toBe(1);
		expect(s.edgeCount).toBe(0);
		expect(s.componentCount).toBe(1);
	});

	it("complete graph of 3 nodes", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("a", "c")];
		const s = computeGraphStats(nodes, edges, buildDegrees(nodes, edges));
		expect(s.nodeCount).toBe(3);
		expect(s.edgeCount).toBe(3);
		expect(s.componentCount).toBe(1);
		expect(s.density).toBeCloseTo(1.0, 1);
		expect(s.avgDegree).toBeCloseTo(2.0, 1);
	});

	it("hubs array contains highest-degree nodes", () => {
		const nodes = [mkNode("hub"), mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("hub", "a"), mkEdge("hub", "b"), mkEdge("hub", "c")];
		const s = computeGraphStats(nodes, edges, buildDegrees(nodes, edges));
		expect(s.hubs.length).toBeGreaterThan(0);
		expect(s.hubs[0][0]).toBe("hub");
	});

	it("orphanRate is correct", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("a", "b")]; // c is orphan
		const s = computeGraphStats(nodes, edges, buildDegrees(nodes, edges));
		expect(s.orphanRate).toBeCloseTo(1 / 3, 1);
	});
});

// =========================================================================
// generateStructureQuestions
// =========================================================================
describe("generateStructureQuestions", () => {
	it("returns array for empty graph", () => {
		const q = generateStructureQuestions([], [], new Map());
		expect(Array.isArray(q)).toBe(true);
		expect(q.length).toBe(0);
	});

	it("returns questions for disconnected graph", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const q = generateStructureQuestions(nodes, [], buildDegrees(nodes, []));
		expect(q.length).toBeGreaterThan(0);
	});

	it("returns questions for hub-dominated graph", () => {
		const hub = mkNode("hub");
		const spokes = Array.from({ length: 20 }, (_, i) => mkNode(`s${i}`));
		const edges = spokes.map((s) => mkEdge("hub", s.id));
		const all = [hub, ...spokes];
		const q = generateStructureQuestions(all, edges, buildDegrees(all, edges));
		expect(q.length).toBeGreaterThan(0);
	});
});
