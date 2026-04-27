import { describe, it, expect } from "vitest";
import { findTopSimilarNodes } from "../../src/utils/find-similar-nodes";
import type { GraphEdge, GraphNode } from "../../src/types";

function makeNode(id: string): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0 };
}

function makeEdge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target };
}

describe("findTopSimilarNodes", () => {
	it("computes Jaccard scores from shared neighbor ids (hand-checked)", () => {
		// Adjacency:
		//   T -> {N1, N2, N3}
		//   A -> {N1, N2}              shared with T = {N1, N2} (2),  union = {N1, N2, N3} (3) → 2/3
		//   B -> {N1, N4}              shared with T = {N1} (1),       union = {N1, N2, N3, N4} (4) → 1/4
		const target = makeNode("T");
		const a = makeNode("A");
		const b = makeNode("B");
		const n1 = makeNode("N1");
		const n2 = makeNode("N2");
		const n3 = makeNode("N3");
		const n4 = makeNode("N4");
		const edges: GraphEdge[] = [
			makeEdge("T", "N1"),
			makeEdge("T", "N2"),
			makeEdge("T", "N3"),
			makeEdge("A", "N1"),
			makeEdge("A", "N2"),
			makeEdge("B", "N1"),
			makeEdge("B", "N4"),
		];

		const result = findTopSimilarNodes(target, [a, b, n1, n2, n3, n4], edges, 3);
		expect(result).toHaveLength(2);
		expect(result[0].node.id).toBe("A");
		expect(result[0].score).toBeCloseTo(2 / 3);
		expect(result[1].node.id).toBe("B");
		expect(result[1].score).toBeCloseTo(1 / 4);
	});

	it("never includes the target itself in the result", () => {
		// Make target appear in candidates and also in edges; should still be filtered.
		const target = makeNode("T");
		const a = makeNode("A");
		const shared = makeNode("S");
		const edges: GraphEdge[] = [makeEdge("T", "S"), makeEdge("A", "S")];

		const result = findTopSimilarNodes(target, [target, a, shared], edges, 3);
		expect(result.find((r) => r.node.id === "T")).toBeUndefined();
		// A shares S with T → score should be > 0
		expect(result.find((r) => r.node.id === "A")?.score).toBeGreaterThan(0);
	});

	it("excludes candidates whose Jaccard score is 0 (no shared neighbors)", () => {
		const target = makeNode("T");
		const a = makeNode("A"); // shares neighbor X with T
		const b = makeNode("B"); // disjoint neighborhood
		const c = makeNode("C"); // no edges at all → empty adjacency
		const edges: GraphEdge[] = [
			makeEdge("T", "X"),
			makeEdge("A", "X"),
			makeEdge("B", "Y"), // Y is not in T's neighbors
		];

		const result = findTopSimilarNodes(target, [a, b, c], edges, 3);
		expect(result).toHaveLength(1);
		expect(result[0].node.id).toBe("A");
	});

	it("caps the result at topN (default 3) when more candidates qualify", () => {
		// Five candidates each share at least one neighbor with T.
		const target = makeNode("T");
		const candidates = ["A", "B", "C", "D", "E"].map(makeNode);
		const edges: GraphEdge[] = [
			makeEdge("T", "N1"),
			makeEdge("T", "N2"),
			makeEdge("T", "N3"),
			makeEdge("A", "N1"),
			makeEdge("A", "N2"),
			makeEdge("A", "N3"), // perfect overlap → 1.0
			makeEdge("B", "N1"),
			makeEdge("B", "N2"), // 2/3
			makeEdge("C", "N1"),
			makeEdge("C", "N3"), // 2/3
			makeEdge("D", "N1"), // 1/3
			makeEdge("E", "N2"), // 1/3
		];

		const result = findTopSimilarNodes(target, candidates, edges, 3);
		expect(result).toHaveLength(3);
		expect(result[0].node.id).toBe("A");
		expect(result[0].score).toBeCloseTo(1);
	});

	it("returns fewer than topN entries when not enough candidates qualify", () => {
		const target = makeNode("T");
		const a = makeNode("A");
		const b = makeNode("B");
		const edges: GraphEdge[] = [makeEdge("T", "X"), makeEdge("A", "X"), makeEdge("B", "X")];

		const result = findTopSimilarNodes(target, [a, b], edges, 3);
		expect(result).toHaveLength(2);
	});

	it("breaks score ties by node.id ascending", () => {
		// All candidates have the same overlap pattern with T → equal scores.
		const target = makeNode("T");
		const z = makeNode("Z");
		const m = makeNode("M");
		const a = makeNode("A");
		const edges: GraphEdge[] = [makeEdge("T", "X"), makeEdge("A", "X"), makeEdge("M", "X"), makeEdge("Z", "X")];

		const result = findTopSimilarNodes(target, [z, m, a], edges, 3);
		expect(result.map((r) => r.node.id)).toEqual(["A", "M", "Z"]);
		expect(result.every((r) => r.score === result[0].score)).toBe(true);
	});
});
