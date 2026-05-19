import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../src/types";

function makeEdge(source: string, target: string): GraphEdge {
	return { id: `${source}-${target}`, source, target };
}

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------

describe("countInterClusterEdges", () => {
	it("returns zero when edge list is empty", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("returns zero when both endpoints are in the same set", () => {
		const edges = [makeEdge("a", "b")];
		const setA = new Set(["a", "b"]);
		const setB = new Set(["c"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts a cross edge (source in setA, target in setB)", () => {
		const edges = [makeEdge("a", "c")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set(["c"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("c")).toBe(true);
	});

	it("counts a cross edge regardless of direction (source in setB, target in setA)", () => {
		const edges = [makeEdge("c", "a")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set(["c"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("c")).toBe(true);
	});

	it("counts multiple cross edges and collects all bridge nodes", () => {
		const edges = [makeEdge("a", "c"), makeEdge("b", "d"), makeEdge("a", "a2")];
		const setA = new Set(["a", "b", "a2"]);
		const setB = new Set(["c", "d"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(2);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("c")).toBe(true);
		expect(result.bridgeNodes.has("b")).toBe(true);
		expect(result.bridgeNodes.has("d")).toBe(true);
		expect(result.bridgeNodes.has("a2")).toBe(false);
	});

	it("handles empty setA (no cross edges possible)", () => {
		const edges = [makeEdge("a", "b")];
		const result = countInterClusterEdges(edges, new Set(), new Set(["b"]));
		expect(result.interEdges).toBe(0);
	});

	it("handles empty setB (no cross edges possible)", () => {
		const edges = [makeEdge("a", "b")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set());
		expect(result.interEdges).toBe(0);
	});

	it("does not double-count bridge nodes that appear in multiple edges", () => {
		const edges = [makeEdge("a", "c"), makeEdge("a", "d")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set(["c", "d"]));
		expect(result.interEdges).toBe(2);
		// "a" participates in both edges but should appear only once in bridgeNodes
		expect(result.bridgeNodes.size).toBe(3); // a, c, d
	});

	it("accepts d3-style object endpoints ({id: string})", () => {
		const edge = { id: "e1", source: { id: "a" }, target: { id: "c" } } as unknown as GraphEdge;
		const result = countInterClusterEdges([edge], new Set(["a"]), new Set(["c"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("c")).toBe(true);
	});

	it("accepts an iterable that is not an array", () => {
		function* gen(): Generator<GraphEdge> {
			yield makeEdge("a", "c");
			yield makeEdge("b", "d");
		}
		const result = countInterClusterEdges(gen(), new Set(["a", "b"]), new Set(["c", "d"]));
		expect(result.interEdges).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------

describe("collectMemberTags", () => {
	it("returns empty set for empty member list", () => {
		const result = collectMemberTags([], () => ["tag1"]);
		expect(result.size).toBe(0);
	});

	it("collects tags from a single member", () => {
		const result = collectMemberTags(["a"], (_id) => ["t1", "t2"]);
		expect(result.has("t1")).toBe(true);
		expect(result.has("t2")).toBe(true);
		expect(result.size).toBe(2);
	});

	it("unions tags across multiple members", () => {
		const tagMap: Record<string, string[]> = {
			a: ["t1", "t2"],
			b: ["t2", "t3"],
			c: ["t4"],
		};
		const result = collectMemberTags(["a", "b", "c"], (id) => tagMap[id]);
		expect(result.has("t1")).toBe(true);
		expect(result.has("t2")).toBe(true);
		expect(result.has("t3")).toBe(true);
		expect(result.has("t4")).toBe(true);
		expect(result.size).toBe(4);
	});

	it("deduplicates tags that appear in multiple members", () => {
		const result = collectMemberTags(["a", "b", "c"], () => ["shared"]);
		expect(result.size).toBe(1);
		expect(result.has("shared")).toBe(true);
	});

	it("silently skips members whose getTags returns undefined", () => {
		const tagMap: Record<string, string[]> = { a: ["t1"] };
		const result = collectMemberTags(["a", "b"], (id) => tagMap[id]);
		expect(result.has("t1")).toBe(true);
		expect(result.size).toBe(1);
	});

	it("returns empty set when all members return undefined", () => {
		const result = collectMemberTags(["x", "y"], () => undefined);
		expect(result.size).toBe(0);
	});

	it("accepts a Set as the memberIds iterable", () => {
		const ids = new Set(["a", "b"]);
		const tagMap: Record<string, string[]> = { a: ["t1"], b: ["t2"] };
		const result = collectMemberTags(ids, (id) => tagMap[id]);
		expect(result.has("t1")).toBe(true);
		expect(result.has("t2")).toBe(true);
	});

	it("accepts a generator as the memberIds iterable", () => {
		function* gen(): Generator<string> {
			yield "a";
			yield "b";
		}
		const tagMap: Record<string, string[]> = { a: ["t1"], b: ["t2"] };
		const result = collectMemberTags(gen(), (id) => tagMap[id]);
		expect(result.size).toBe(2);
	});
});
