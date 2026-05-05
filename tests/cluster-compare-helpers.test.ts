import { describe, it, expect } from "vitest";
import {
	countInterClusterEdges,
	collectMemberTags,
} from "../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEdge(source: string, target: string, id?: string): GraphEdge {
	return { id: id ?? `${source}-${target}`, source, target };
}

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------

describe("countInterClusterEdges", () => {
	it("counts a single edge spanning setA → setB", () => {
		const edges = [makeEdge("a", "b")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(1);
		expect([...result.bridgeNodes]).toContain("a");
		expect([...result.bridgeNodes]).toContain("b");
	});

	it("counts a reversed edge setB → setA", () => {
		const edges = [makeEdge("b", "a")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes).toEqual(new Set(["b", "a"]));
	});

	it("ignores intra-cluster edges (both endpoints in same set)", () => {
		const edges = [makeEdge("a1", "a2"), makeEdge("b1", "b2")];
		const result = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts multiple bridge edges and collects all bridge nodes", () => {
		const edges = [makeEdge("a1", "b1"), makeEdge("a2", "b2"), makeEdge("a1", "a2")];
		const result = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(2);
		expect(result.bridgeNodes).toEqual(new Set(["a1", "b1", "a2", "b2"]));
	});

	it("returns zero counts for an empty edge list", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("ignores edges where neither endpoint is in either set", () => {
		const edges = [makeEdge("x", "y")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("node appearing in multiple bridge edges is added to bridgeNodes only once", () => {
		const edges = [makeEdge("a", "b1"), makeEdge("a", "b2")];
		const result = countInterClusterEdges(edges, new Set(["a"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(2);
		// "a" appears in two bridge edges but should be in the set only once
		expect([...result.bridgeNodes].filter((n) => n === "a")).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------

describe("collectMemberTags", () => {
	it("collects the union of tags across all members", () => {
		const getTags = (id: string) => ({ a: ["tag1", "tag2"], b: ["tag2", "tag3"] } as Record<string, string[]>)[id];
		const tags = collectMemberTags(["a", "b"], getTags);
		expect(tags).toEqual(new Set(["tag1", "tag2", "tag3"]));
	});

	it("skips members whose getTags returns undefined", () => {
		const getTags = (id: string) => (id === "a" ? ["t1"] : undefined);
		const tags = collectMemberTags(["a", "b", "c"], getTags);
		expect(tags).toEqual(new Set(["t1"]));
	});

	it("returns an empty set when the member list is empty", () => {
		const tags = collectMemberTags([], () => ["t1"]);
		expect(tags.size).toBe(0);
	});

	it("deduplicates tags that appear in multiple members", () => {
		const getTags = () => ["tag1", "tag2"] as readonly string[];
		const tags = collectMemberTags(["a", "b", "c"], getTags);
		expect(tags.size).toBe(2);
		expect(tags).toContain("tag1");
		expect(tags).toContain("tag2");
	});

	it("returns empty set when all members have empty tag arrays", () => {
		const getTags = () => [] as readonly string[];
		const tags = collectMemberTags(["a", "b"], getTags);
		expect(tags.size).toBe(0);
	});

	it("works with a generator-based Iterable for memberIds", () => {
		function* ids() {
			yield "x";
			yield "y";
		}
		const getTags = (id: string) => (id === "x" ? ["alpha"] : ["beta"]);
		const tags = collectMemberTags(ids(), getTags);
		expect(tags).toEqual(new Set(["alpha", "beta"]));
	});
});
