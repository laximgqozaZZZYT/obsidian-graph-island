import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../../src/utils/cluster-compare";
import type { GraphEdge } from "../../src/types";

function edge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target };
}

describe("countInterClusterEdges", () => {
	it("counts edges crossing A→B and collects both endpoints as bridges", () => {
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1", "b2"]);
		const edges: GraphEdge[] = [
			edge("a1", "b1"),
			edge("a2", "a1"), // intra-A
			edge("b1", "b2"), // intra-B
			edge("a2", "b2"),
		];
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(2);
		expect(bridgeNodes).toEqual(new Set(["a1", "a2", "b1", "b2"]));
	});

	it("counts B→A direction symmetrically", () => {
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges([edge("b", "a")], setA, setB);
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["a", "b"]));
	});

	it("returns zero when no edges cross the partition", () => {
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(
			[edge("a1", "a2"), edge("b1", "b1")],
			setA,
			setB,
		);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("ignores edges whose endpoints fall outside both sets", () => {
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(
			[edge("x", "y"), edge("a", "x")],
			setA,
			setB,
		);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("handles an empty edge list", () => {
		const { interEdges, bridgeNodes } = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});
});

describe("collectMemberTags", () => {
	it("returns the union of tags across the given member IDs", () => {
		const tagsByNode = new Map<string, string[]>([
			["n1", ["alpha", "beta"]],
			["n2", ["beta", "gamma"]],
			["n3", ["delta"]],
		]);
		const out = collectMemberTags(["n1", "n2"], (id) => tagsByNode.get(id));
		expect(out).toEqual(new Set(["alpha", "beta", "gamma"]));
	});

	it("skips members with no tag entry", () => {
		const tagsByNode = new Map<string, string[]>([["n1", ["x"]]]);
		const out = collectMemberTags(["n1", "missing", "n2"], (id) => tagsByNode.get(id));
		expect(out).toEqual(new Set(["x"]));
	});

	it("skips members whose tag list is empty (no tags added)", () => {
		const out = collectMemberTags(["n1"], () => []);
		expect(out.size).toBe(0);
	});

	it("returns an empty set for an empty member list", () => {
		const out = collectMemberTags([], () => ["should", "not", "appear"]);
		expect(out.size).toBe(0);
	});

	it("deduplicates tags that occur in multiple members", () => {
		const out = collectMemberTags(["a", "b", "c"], () => ["shared"]);
		expect(out).toEqual(new Set(["shared"]));
	});
});
