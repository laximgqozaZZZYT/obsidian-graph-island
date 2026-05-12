import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function mkEdge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target } as GraphEdge;
}

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------
describe("countInterClusterEdges", () => {
	it("returns 0 inter-edges for an empty edge iterable", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts a forward edge from setA → setB", () => {
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges([mkEdge("a", "b")], setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("b")).toBe(true);
	});

	it("counts a reversed edge from setB → setA (direction-agnostic)", () => {
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges([mkEdge("b", "a")], setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("b")).toBe(true);
	});

	it("ignores edges whose both endpoints are in setA", () => {
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges([mkEdge("a1", "a2")], setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("ignores edges whose both endpoints are in setB", () => {
		const setA = new Set(["a"]);
		const setB = new Set(["b1", "b2"]);
		const result = countInterClusterEdges([mkEdge("b1", "b2")], setA, setB);
		expect(result.interEdges).toBe(0);
	});

	it("ignores edges not belonging to either set", () => {
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges([mkEdge("x", "y")], setA, setB);
		expect(result.interEdges).toBe(0);
	});

	it("counts multiple inter-cluster edges and collects all bridge nodes", () => {
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1", "b2"]);
		const edges = [
			mkEdge("a1", "b1"),
			mkEdge("a2", "b2"),
			mkEdge("a1", "a2"), // intra-A — ignored
		];
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(2);
		expect(result.bridgeNodes).toEqual(new Set(["a1", "b1", "a2", "b2"]));
	});

	it("works with a generator (arbitrary Iterable<GraphEdge>)", () => {
		function* edgeGen() {
			yield mkEdge("a", "b");
			yield mkEdge("a", "c"); // c not in either set
		}
		const result = countInterClusterEdges(edgeGen(), new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------
describe("collectMemberTags", () => {
	it("returns an empty set for an empty member list", () => {
		const tags = collectMemberTags([], () => ["tag"]);
		expect(tags.size).toBe(0);
	});

	it("collects all tags from a single member", () => {
		const tags = collectMemberTags(["n1"], () => ["alpha", "beta"]);
		expect(tags).toEqual(new Set(["alpha", "beta"]));
	});

	it("unions tags across multiple members", () => {
		const tagMap = new Map([
			["a", ["t1", "t2"]],
			["b", ["t2", "t3"]],
		]);
		const tags = collectMemberTags(["a", "b"], (id) => tagMap.get(id));
		expect(tags).toEqual(new Set(["t1", "t2", "t3"]));
	});

	it("skips members whose getTags returns undefined", () => {
		const tags = collectMemberTags(["a", "b", "c"], (id) => {
			if (id === "b") return ["tag"];
			return undefined;
		});
		expect(tags).toEqual(new Set(["tag"]));
	});

	it("deduplicates identical tags from different members", () => {
		const tags = collectMemberTags(["x", "y"], () => ["shared"]);
		expect(tags.size).toBe(1);
		expect(tags.has("shared")).toBe(true);
	});

	it("handles a member with an empty tag array gracefully", () => {
		const tags = collectMemberTags(["empty"], () => []);
		expect(tags.size).toBe(0);
	});
});
