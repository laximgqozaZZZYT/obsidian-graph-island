import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../src/types";

function mkEdge(src: string, tgt: string): GraphEdge {
	return { id: `${src}->${tgt}`, source: src, target: tgt, type: "link" } as GraphEdge;
}

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------

describe("countInterClusterEdges", () => {
	it("returns zero for empty edge list", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts an edge from A to B", () => {
		const result = countInterClusterEdges([mkEdge("a1", "b1")], new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes).toContain("a1");
		expect(result.bridgeNodes).toContain("b1");
	});

	it("counts an edge from B to A (reverse direction)", () => {
		const result = countInterClusterEdges([mkEdge("b1", "a1")], new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes).toContain("b1");
		expect(result.bridgeNodes).toContain("a1");
	});

	it("ignores intra-cluster edges within A", () => {
		const result = countInterClusterEdges(
			[mkEdge("a1", "a2")],
			new Set(["a1", "a2"]),
			new Set(["b1"]),
		);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("ignores intra-cluster edges within B", () => {
		const result = countInterClusterEdges(
			[mkEdge("b1", "b2")],
			new Set(["a1"]),
			new Set(["b1", "b2"]),
		);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts multiple inter-cluster edges and collects all bridge nodes", () => {
		const edges = [mkEdge("a1", "b1"), mkEdge("a2", "b2"), mkEdge("a1", "b2")];
		const result = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(3);
		expect(result.bridgeNodes.size).toBe(4);
		expect(result.bridgeNodes).toContain("a1");
		expect(result.bridgeNodes).toContain("a2");
		expect(result.bridgeNodes).toContain("b1");
		expect(result.bridgeNodes).toContain("b2");
	});

	it("handles edges with d3-simulation object-style source/target", () => {
		const edge = {
			id: "x",
			source: { id: "a1" } as unknown as string,
			target: { id: "b1" } as unknown as string,
			type: "link",
		} as GraphEdge;
		const result = countInterClusterEdges([edge], new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
	});

	it("ignores edges where neither endpoint is in A or B", () => {
		const result = countInterClusterEdges(
			[mkEdge("c1", "d1")],
			new Set(["a1"]),
			new Set(["b1"]),
		);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("bridge nodes set deduplicates repeated endpoints", () => {
		const edges = [mkEdge("a1", "b1"), mkEdge("a1", "b2")];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(2);
		// a1 appears in both edges but should only be in bridgeNodes once
		expect([...result.bridgeNodes].filter((n) => n === "a1").length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------

describe("collectMemberTags", () => {
	it("returns empty set for empty memberIds", () => {
		const result = collectMemberTags([], () => ["tag1"]);
		expect(result.size).toBe(0);
	});

	it("collects tags from a single member", () => {
		const result = collectMemberTags(["a"], (_id) => ["tag1", "tag2"]);
		expect(result.size).toBe(2);
		expect(result).toContain("tag1");
		expect(result).toContain("tag2");
	});

	it("collects tags from multiple members", () => {
		const tagMap: Record<string, string[]> = { a: ["t1", "t2"], b: ["t2", "t3"] };
		const result = collectMemberTags(["a", "b"], (id) => tagMap[id]);
		expect(result).toContain("t1");
		expect(result).toContain("t2");
		expect(result).toContain("t3");
		expect(result.size).toBe(3); // t2 deduplicated
	});

	it("skips members whose getTags returns undefined", () => {
		const result = collectMemberTags(["a", "unknown"], (id) => {
			if (id === "a") return ["tag1"];
			return undefined;
		});
		expect(result.size).toBe(1);
		expect(result).toContain("tag1");
	});

	it("deduplicates identical tags across members", () => {
		const result = collectMemberTags(["a", "b", "c"], (_id) => ["shared"]);
		expect(result.size).toBe(1);
		expect(result).toContain("shared");
	});

	it("handles members with empty tag arrays", () => {
		const result = collectMemberTags(["a", "b"], (_id) => []);
		expect(result.size).toBe(0);
	});

	it("works with a Set as memberIds input", () => {
		const ids = new Set(["x", "y"]);
		const result = collectMemberTags(ids, (id) => [id + "-tag"]);
		expect(result.size).toBe(2);
		expect(result).toContain("x-tag");
		expect(result).toContain("y-tag");
	});
});
