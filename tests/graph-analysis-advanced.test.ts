import { describe, it, expect } from "vitest";
import {
	computeBetweennessCentrality,
	detectArticulationPoints,
	computeSimilarNodes,
	computePropagatedImportance,
	computeInDegree,
} from "../src/analysis/graph-analysis";
import type { GraphNode, GraphEdge } from "../src/types";

// --- Helpers ---
function mkNode(id: string, tags?: string[]): GraphNode {
	return { id, label: id, filePath: `${id}.md`, tags } as GraphNode;
}
function mkEdge(source: string, target: string, type = "link"): GraphEdge {
	return { id: `${source}-${target}`, source, target, type } as GraphEdge;
}

// =============================================
// computeBetweennessCentrality (Brandes)
// =============================================
describe("computeBetweennessCentrality", () => {
	it("returns empty map for empty graph", () => {
		const bc = computeBetweennessCentrality([], []);
		expect(bc.size).toBe(0);
	});

	it("single node has zero centrality", () => {
		const bc = computeBetweennessCentrality([mkNode("a")], []);
		expect(bc.get("a")).toBe(0);
	});

	it("linear chain: middle node has highest centrality", () => {
		// a - b - c - d - e
		const nodes = ["a", "b", "c", "d", "e"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("c", "d"), mkEdge("d", "e")];
		const bc = computeBetweennessCentrality(nodes, edges);
		// c is the bridge between a,b and d,e — should have highest centrality
		const cVal = bc.get("c")!;
		const aVal = bc.get("a")!;
		expect(cVal).toBeGreaterThan(aVal);
		// b and d should have equal centrality (symmetric)
		expect(bc.get("b")).toBe(bc.get("d"));
	});

	it("star graph: center has highest centrality", () => {
		// hub connected to a, b, c, d
		const nodes = ["hub", "a", "b", "c", "d"].map((id) => mkNode(id));
		const edges = [mkEdge("hub", "a"), mkEdge("hub", "b"), mkEdge("hub", "c"), mkEdge("hub", "d")];
		const bc = computeBetweennessCentrality(nodes, edges);
		const hubVal = bc.get("hub")!;
		expect(hubVal).toBeGreaterThan(0);
		// Leaves should have zero centrality
		expect(bc.get("a")).toBe(0);
	});

	it("respects maxNodes limit", () => {
		const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`));
		const edges = [mkEdge("n0", "n1")];
		const bc = computeBetweennessCentrality(nodes, edges, 5);
		// All values should be 0 since V > maxNodes
		for (const v of bc.values()) expect(v).toBe(0);
	});

	it("complete graph: all nodes have equal centrality", () => {
		const nodes = ["a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("a", "c")];
		const bc = computeBetweennessCentrality(nodes, edges);
		// In K3, all nodes have equal centrality
		expect(bc.get("a")).toBe(bc.get("b"));
		expect(bc.get("b")).toBe(bc.get("c"));
	});
});

// =============================================
// detectArticulationPoints (Tarjan)
// =============================================
describe("detectArticulationPoints", () => {
	it("returns empty for empty graph", () => {
		expect(detectArticulationPoints([], []).size).toBe(0);
	});

	it("no articulation points in complete graph", () => {
		const nodes = ["a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("a", "c")];
		expect(detectArticulationPoints(nodes, edges).size).toBe(0);
	});

	it("middle node in chain is articulation point", () => {
		// a - b - c
		const nodes = ["a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
		const ap = detectArticulationPoints(nodes, edges);
		expect(ap.has("b")).toBe(true);
		expect(ap.has("a")).toBe(false);
	});

	it("star center is articulation point", () => {
		const nodes = ["hub", "a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("hub", "a"), mkEdge("hub", "b"), mkEdge("hub", "c")];
		const ap = detectArticulationPoints(nodes, edges);
		expect(ap.has("hub")).toBe(true);
	});

	it("bridge node between two cliques", () => {
		// Clique 1: a-b-c (triangle), Clique 2: d-e-f (triangle), bridge: c-d
		const nodes = ["a", "b", "c", "d", "e", "f"].map((id) => mkNode(id));
		const edges = [
			mkEdge("a", "b"),
			mkEdge("b", "c"),
			mkEdge("a", "c"),
			mkEdge("d", "e"),
			mkEdge("e", "f"),
			mkEdge("d", "f"),
			mkEdge("c", "d"), // bridge
		];
		const ap = detectArticulationPoints(nodes, edges);
		expect(ap.has("c")).toBe(true);
		expect(ap.has("d")).toBe(true);
	});
});

// =============================================
// computeSimilarNodes (Jaccard)
// =============================================
describe("computeSimilarNodes", () => {
	it("returns empty for unknown node", () => {
		const nodes = [mkNode("a")];
		expect(computeSimilarNodes("unknown", nodes, [], 3, 0.1)).toEqual([]);
	});

	it("returns empty when no features", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		expect(computeSimilarNodes("a", nodes, [], 3, 0.1)).toEqual([]);
	});

	it("finds similar nodes by shared tags", () => {
		const nodes = [
			mkNode("a", ["fantasy", "character"]),
			mkNode("b", ["fantasy", "character", "hero"]),
			mkNode("c", ["scifi"]),
		];
		const edges: GraphEdge[] = [];
		const similar = computeSimilarNodes("a", nodes, edges, 3, 0.01);
		// b shares both tags with a → higher similarity than c
		expect(similar.length).toBeGreaterThan(0);
		expect(similar[0].id).toBe("b");
	});

	it("excludes already-linked nodes", () => {
		const nodes = [mkNode("a", ["tag1"]), mkNode("b", ["tag1"]), mkNode("c", ["tag1"])];
		const edges = [mkEdge("a", "b")]; // a-b linked
		const similar = computeSimilarNodes("a", nodes, edges, 3, 0.01);
		expect(similar.some((s) => s.id === "b")).toBe(false);
		expect(similar.some((s) => s.id === "c")).toBe(true);
	});

	it("respects topN limit", () => {
		const nodes = [mkNode("a", ["t1"]), mkNode("b", ["t1"]), mkNode("c", ["t1"]), mkNode("d", ["t1"])];
		const similar = computeSimilarNodes("a", nodes, [], 2, 0.01);
		expect(similar.length).toBeLessThanOrEqual(2);
	});

	it("respects threshold", () => {
		const nodes = [
			mkNode("a", ["t1", "t2", "t3"]),
			mkNode("b", ["t1"]), // Jaccard = 1/3 ≈ 0.33
		];
		// threshold 0.5 → b should not qualify
		expect(computeSimilarNodes("a", nodes, [], 3, 0.5)).toEqual([]);
		// threshold 0.1 → b qualifies
		expect(computeSimilarNodes("a", nodes, [], 3, 0.1).length).toBe(1);
	});
});

// =============================================
// computeInDegree
// =============================================
describe("computeInDegree", () => {
	it("returns empty for empty graph", () => {
		expect(computeInDegree([], []).size).toBe(0);
	});

	it("counts incoming edges correctly", () => {
		const nodes = ["a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("c", "b")]; // b has 2 incoming
		const inDeg = computeInDegree(nodes, edges);
		expect(inDeg.get("b")).toBe(2);
		expect(inDeg.get("a")).toBe(0);
		expect(inDeg.get("c")).toBe(0);
	});
});

// =============================================
// computePropagatedImportance
// =============================================
describe("computePropagatedImportance", () => {
	it("returns zeros for no edges", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		const imp = computePropagatedImportance(nodes, []);
		expect(imp.get("a")).toBe(0);
	});

	it("hub accumulates importance from neighbors", () => {
		const nodes = ["hub", "a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "hub"), mkEdge("b", "hub"), mkEdge("c", "hub")];
		const imp = computePropagatedImportance(nodes, edges, 0.5);
		// hub should have higher importance than leaves
		expect(imp.get("hub")!).toBeGreaterThan(imp.get("a")!);
	});

	it("decay factor controls propagation strength", () => {
		const nodes = ["a", "b"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b")];
		const impHigh = computePropagatedImportance(nodes, edges, 0.9);
		const impLow = computePropagatedImportance(nodes, edges, 0.1);
		// Higher decay → more propagation → higher values
		expect(impHigh.get("a")!).toBeGreaterThanOrEqual(impLow.get("a")!);
	});

	// --- Boundary values (cycle120) ---

	it("isolated nodes all have 0 importance", () => {
		const nodes = Array.from({ length: 5 }, (_, i) => mkNode(`n${i}`));
		const imp = computePropagatedImportance(nodes, []);
		for (const n of nodes) {
			expect(imp.get(n.id)).toBe(0);
		}
	});

	it("DAG chain: all values are finite", () => {
		const nodes = ["a", "b", "c", "d"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("c", "d")];
		const imp = computePropagatedImportance(nodes, edges, 0.5);
		for (const id of ["a", "b", "c", "d"]) {
			expect(isFinite(imp.get(id)!), `${id} should be finite`).toBe(true);
		}
		// Source "a" has outgoing→children accumulation, sink "d" has in-degree only
		// a: inDeg(0) + decay * childSum; d: inDeg(1) + 0 = 1
		expect(imp.get("a")!).toBeGreaterThanOrEqual(0);
	});

	it("cycle: converges without infinite loop", () => {
		// a→b→c→a (cycle)
		const nodes = ["a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("c", "a")];
		const imp = computePropagatedImportance(nodes, edges, 0.5);
		// All should have finite values (3 iterations cap)
		for (const n of nodes) {
			expect(isFinite(imp.get(n.id)!)).toBe(true);
		}
	});

	it("star graph: hub has highest importance", () => {
		const nodes = Array.from({ length: 11 }, (_, i) => mkNode(i === 0 ? "hub" : `n${i}`));
		const edges = nodes.slice(1).map((n) => mkEdge(n.id, "hub"));
		const imp = computePropagatedImportance(nodes, edges, 0.5);
		const hubImp = imp.get("hub")!;
		for (const n of nodes.slice(1)) {
			expect(hubImp).toBeGreaterThanOrEqual(imp.get(n.id)!);
		}
	});

	it("decay 0 means no propagation (only in-degree counts)", () => {
		const nodes = ["a", "b", "c"].map((id) => mkNode(id));
		const edges = [mkEdge("a", "b"), mkEdge("c", "b")];
		const imp = computePropagatedImportance(nodes, edges, 0);
		// b has in-degree 2, a and c have 0
		expect(imp.get("b")).toBe(2);
		expect(imp.get("a")).toBe(0);
		expect(imp.get("c")).toBe(0);
	});
});
