import { describe, it, expect } from "vitest";
import {
	countInterClusterEdges,
	collectMemberTags,
	computeSharedTags,
} from "../../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../../src/types";

const mkEdge = (source: string, target: string, type = "link"): GraphEdge =>
	({ source, target, type }) as GraphEdge;

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------
describe("countInterClusterEdges", () => {
	it("counts only edges crossing between the two sets", () => {
		const edges = [
			mkEdge("a1", "a2"), // intra-A
			mkEdge("b1", "b2"), // intra-B
			mkEdge("a1", "b1"), // crosses (A→B)
			mkEdge("b2", "a2"), // crosses (B→A)
		];
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1", "b2"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(2);
		expect(bridgeNodes).toEqual(new Set(["a1", "a2", "b1", "b2"]));
	});

	it("returns zero edges and empty bridges when sets are disjoint from edges", () => {
		const edges = [mkEdge("x", "y")];
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("ignores edges where both endpoints are in setA", () => {
		const edges = [mkEdge("a1", "a2")];
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("ignores edges with one endpoint outside both sets", () => {
		const edges = [
			mkEdge("a1", "outsider"), // a1 is in A, outsider is in neither
			mkEdge("outsider", "b1"), // b1 is in B, outsider is in neither
		];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("counts duplicate crossing edges separately and adds endpoints once", () => {
		const edges = [mkEdge("a1", "b1"), mkEdge("a1", "b1")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(2);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1"]));
	});

	it("handles d3-force resolved endpoints (object form)", () => {
		// After d3 simulation, source/target may be node objects with id
		const edge = { source: { id: "a1" }, target: { id: "b1" }, type: "link" } as unknown as GraphEdge;
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges([edge], setA, setB);
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1"]));
	});

	it("returns zero for empty inputs", () => {
		const result = countInterClusterEdges([], new Set(), new Set());
		expect(result).toEqual({ interEdges: 0, bridgeNodes: new Set() });
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------
describe("collectMemberTags", () => {
	it("aggregates the union of tags across members", () => {
		const tagMap = new Map<string, string[]>([
			["n1", ["alpha", "beta"]],
			["n2", ["beta", "gamma"]],
		]);
		const tags = collectMemberTags(["n1", "n2"], (id) => tagMap.get(id));
		expect(tags).toEqual(new Set(["alpha", "beta", "gamma"]));
	});

	it("skips nodes whose lookup returns undefined", () => {
		const tagMap = new Map<string, string[]>([["n1", ["a"]]]);
		const tags = collectMemberTags(["n1", "missing"], (id) => tagMap.get(id));
		expect(tags).toEqual(new Set(["a"]));
	});

	it("skips nodes with empty tags array without throwing", () => {
		const tags = collectMemberTags(["n1"], () => []);
		expect(tags.size).toBe(0);
	});

	it("returns an empty set for empty member list", () => {
		const tags = collectMemberTags([], () => ["x"]);
		expect(tags.size).toBe(0);
	});

	it("deduplicates tags when the same tag appears on multiple nodes", () => {
		const tags = collectMemberTags(["a", "b", "c"], () => ["common"]);
		expect(tags).toEqual(new Set(["common"]));
	});
});

// ---------------------------------------------------------------------------
// computeSharedTags
// ---------------------------------------------------------------------------
describe("computeSharedTags", () => {
	it("returns the intersection in iteration order of the first set", () => {
		const a = new Set(["x", "y", "z"]);
		const b = new Set(["z", "y"]);
		expect(computeSharedTags(a, b)).toEqual(["y", "z"]);
	});

	it("returns an empty array when there is no overlap", () => {
		expect(computeSharedTags(new Set(["a"]), new Set(["b"]))).toEqual([]);
	});

	it("handles either input being empty", () => {
		expect(computeSharedTags(new Set(), new Set(["a"]))).toEqual([]);
		expect(computeSharedTags(new Set(["a"]), new Set())).toEqual([]);
	});

	it("returns all tags when sets are identical", () => {
		const s = new Set(["a", "b", "c"]);
		expect(computeSharedTags(s, s)).toEqual(["a", "b", "c"]);
	});

	it("does not mutate either input set", () => {
		const a = new Set(["x", "y"]);
		const b = new Set(["y", "z"]);
		computeSharedTags(a, b);
		expect(a).toEqual(new Set(["x", "y"]));
		expect(b).toEqual(new Set(["y", "z"]));
	});
});
