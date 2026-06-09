/**
 * Tests for src/views/cluster-compare-helpers.ts
 *
 * Both exported functions are pure (no Obsidian API dependencies), so we can
 * test them directly without any mocking.
 */
import { describe, it, expect } from "vitest";
import {
	countInterClusterEdges,
	collectMemberTags,
} from "../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkEdge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target, type: "link" };
}

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------

describe("countInterClusterEdges", () => {
	it("returns 0 for empty edge set", () => {
		const setA = new Set(["a", "b"]);
		const setB = new Set(["c", "d"]);
		const result = countInterClusterEdges([], setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts a forward edge (A→B direction)", () => {
		const edges: GraphEdge[] = [mkEdge("a1", "b1")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a1")).toBe(true);
		expect(result.bridgeNodes.has("b1")).toBe(true);
	});

	it("counts a reverse edge (B→A direction)", () => {
		const edges: GraphEdge[] = [mkEdge("b1", "a1")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a1")).toBe(true);
		expect(result.bridgeNodes.has("b1")).toBe(true);
	});

	it("ignores edges entirely within cluster A", () => {
		const edges: GraphEdge[] = [mkEdge("a1", "a2")];
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("ignores edges entirely within cluster B", () => {
		const edges: GraphEdge[] = [mkEdge("b1", "b2")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1", "b2"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
	});

	it("ignores edges where both endpoints are in neither set", () => {
		const edges: GraphEdge[] = [mkEdge("x", "y")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
	});

	it("ignores edges where one endpoint is in neither set", () => {
		const edges: GraphEdge[] = [mkEdge("a1", "unknown")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
	});

	it("counts multiple inter-cluster edges and deduplicates bridgeNodes", () => {
		// a1 bridges to both b1 and b2
		const edges: GraphEdge[] = [mkEdge("a1", "b1"), mkEdge("a1", "b2")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1", "b2"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(2);
		// bridgeNodes = {a1, b1, b2}
		expect(result.bridgeNodes.size).toBe(3);
		expect(result.bridgeNodes.has("a1")).toBe(true);
		expect(result.bridgeNodes.has("b1")).toBe(true);
		expect(result.bridgeNodes.has("b2")).toBe(true);
	});

	it("handles d3-force style edges where source/target are objects with id", () => {
		// edgeSourceId/edgeTargetId resolve object endpoints
		const edge = { source: { id: "a1" }, target: { id: "b1" }, type: "link" } as any;
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const result = countInterClusterEdges([edge], setA, setB);
		expect(result.interEdges).toBe(1);
	});

	it("works correctly when setA and setB overlap", () => {
		// "shared" appears in both sets — edge from shared to b1 satisfies setB.has(src) && setA.has(tgt)
		const edges: GraphEdge[] = [mkEdge("shared", "b1")];
		const setA = new Set(["shared"]);
		const setB = new Set(["shared", "b1"]);
		const result = countInterClusterEdges(edges, setA, setB);
		// setA.has("shared") && setB.has("b1") → true
		expect(result.interEdges).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------

describe("collectMemberTags", () => {
	it("returns empty set when memberIds is empty", () => {
		const tags = collectMemberTags([], () => ["x"]);
		expect(tags.size).toBe(0);
	});

	it("collects tags from a single member", () => {
		const tagMap = new Map([["n1", ["alpha", "beta"]]]);
		const tags = collectMemberTags(["n1"], (id) => tagMap.get(id));
		expect(tags.has("alpha")).toBe(true);
		expect(tags.has("beta")).toBe(true);
		expect(tags.size).toBe(2);
	});

	it("merges tags from multiple members", () => {
		const tagMap = new Map([
			["n1", ["a", "b"]],
			["n2", ["b", "c"]],
		]);
		const tags = collectMemberTags(["n1", "n2"], (id) => tagMap.get(id));
		// Union: {a, b, c}
		expect(tags.has("a")).toBe(true);
		expect(tags.has("b")).toBe(true);
		expect(tags.has("c")).toBe(true);
		expect(tags.size).toBe(3);
	});

	it("silently skips members whose getTags returns undefined", () => {
		const tags = collectMemberTags(["missing"], () => undefined);
		expect(tags.size).toBe(0);
	});

	it("silently skips members with an empty tag array", () => {
		const tags = collectMemberTags(["n1"], () => []);
		expect(tags.size).toBe(0);
	});

	it("deduplicates tags appearing in multiple members", () => {
		const tagMap = new Map([
			["n1", ["shared", "only_n1"]],
			["n2", ["shared", "only_n2"]],
			["n3", ["shared"]],
		]);
		const tags = collectMemberTags(["n1", "n2", "n3"], (id) => tagMap.get(id));
		expect(tags.size).toBe(3); // shared, only_n1, only_n2
		expect(tags.has("shared")).toBe(true);
	});

	it("accepts a generator as memberIds (iterable)", () => {
		function* gen() {
			yield "n1";
			yield "n2";
		}
		const tagMap = new Map([
			["n1", ["tag1"]],
			["n2", ["tag2"]],
		]);
		const tags = collectMemberTags(gen(), (id) => tagMap.get(id));
		expect(tags.has("tag1")).toBe(true);
		expect(tags.has("tag2")).toBe(true);
	});
});
