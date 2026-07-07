import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------

describe("countInterClusterEdges", () => {
	it("returns zero inter-edges and empty bridgeNodes for empty edge list", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("returns zero when all edges are within setA", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "a1", target: "a2" }];
		const result = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("returns zero when all edges are within setB", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "b1", target: "b2" }];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts edge from setA to setB (forward direction)", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "a1", target: "b1" }];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes).toContain("a1");
		expect(result.bridgeNodes).toContain("b1");
	});

	it("counts edge from setB to setA (reverse direction)", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "b1", target: "a1" }];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes).toContain("a1");
		expect(result.bridgeNodes).toContain("b1");
	});

	it("counts multiple crossing edges", () => {
		const edges: GraphEdge[] = [
			{ id: "e1", source: "a1", target: "b1" },
			{ id: "e2", source: "a2", target: "b2" },
			{ id: "e3", source: "b1", target: "a2" },
		];
		const result = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(3);
		expect(result.bridgeNodes).toContain("a1");
		expect(result.bridgeNodes).toContain("b1");
		expect(result.bridgeNodes).toContain("a2");
		expect(result.bridgeNodes).toContain("b2");
	});

	it("adds both endpoints to bridgeNodes for a crossing edge", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "a1", target: "b1" }];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.bridgeNodes.size).toBe(2);
	});

	it("deduplicates bridgeNodes when a node appears in multiple crossing edges", () => {
		const edges: GraphEdge[] = [
			{ id: "e1", source: "a1", target: "b1" },
			{ id: "e2", source: "a2", target: "b1" },
		];
		const result = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1"]));
		expect(result.interEdges).toBe(2);
		// b1 appears in both, so bridgeNodes should have a1, a2, b1 (not b1 twice)
		expect(result.bridgeNodes.size).toBe(3);
	});

	it("ignores edges where both endpoints are outside both sets", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "x", target: "y" }];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("handles edge with source in setA and target outside both sets", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "a1", target: "x" }];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(0);
	});

	it("handles node present in both setA and setB (intersection)", () => {
		// Source is in both, target is in setB only → setA.has(src) && setB.has(tgt) is true
		const edges: GraphEdge[] = [{ id: "e1", source: "shared", target: "b1" }];
		const result = countInterClusterEdges(
			edges,
			new Set(["shared"]), // shared is in A
			new Set(["shared", "b1"]), // shared is also in B
		);
		// setA.has("shared") && setB.has("b1") → true
		expect(result.interEdges).toBe(1);
	});

	it("works with generator (Iterable) input", () => {
		function* edgeGen(): Iterable<GraphEdge> {
			yield { id: "e1", source: "a1", target: "b1" };
			yield { id: "e2", source: "a2", target: "b2" };
		}
		const result = countInterClusterEdges(edgeGen(), new Set(["a1", "a2"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(2);
	});

	it("handles empty setA", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "a1", target: "b1" }];
		const result = countInterClusterEdges(edges, new Set(), new Set(["b1"]));
		expect(result.interEdges).toBe(0);
	});

	it("handles empty setB", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "a1", target: "b1" }];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set());
		expect(result.interEdges).toBe(0);
	});

	it("handles both sets empty", () => {
		const edges: GraphEdge[] = [{ id: "e1", source: "a1", target: "b1" }];
		const result = countInterClusterEdges(edges, new Set(), new Set());
		expect(result.interEdges).toBe(0);
	});

	it("handles large sets efficiently", () => {
		const setA = new Set<string>();
		const setB = new Set<string>();
		const edges: GraphEdge[] = [];
		for (let i = 0; i < 100; i++) setA.add(`a${i}`);
		for (let i = 0; i < 100; i++) setB.add(`b${i}`);
		for (let i = 0; i < 50; i++) {
			edges.push({ id: `e${i}`, source: `a${i}`, target: `b${i}` });
		}
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(50);
		expect(result.bridgeNodes.size).toBe(100);
	});

	it("returns correct ClusterCompareEdgeStats interface shape", () => {
		const result = countInterClusterEdges([], new Set(), new Set());
		expect(typeof result.interEdges).toBe("number");
		expect(result.bridgeNodes).toBeInstanceOf(Set);
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

	it("returns empty set when all getTags calls return undefined", () => {
		const result = collectMemberTags(["a", "b", "c"], () => undefined);
		expect(result.size).toBe(0);
	});

	it("collects tags from a single member", () => {
		const result = collectMemberTags(["node1"], () => ["alpha", "beta"]);
		expect(result).toContain("alpha");
		expect(result).toContain("beta");
		expect(result.size).toBe(2);
	});

	it("collects tags from multiple members", () => {
		const tagMap: Record<string, string[]> = {
			node1: ["a", "b"],
			node2: ["c", "d"],
		};
		const result = collectMemberTags(["node1", "node2"], (id) => tagMap[id]);
		expect(result).toContain("a");
		expect(result).toContain("b");
		expect(result).toContain("c");
		expect(result).toContain("d");
		expect(result.size).toBe(4);
	});

	it("deduplicates shared tags across members", () => {
		const result = collectMemberTags(["node1", "node2"], () => ["shared", "unique"]);
		// Both nodes return same tags — should deduplicate
		expect(result.size).toBe(2);
		expect(result).toContain("shared");
		expect(result).toContain("unique");
	});

	it("skips members that return undefined from getTags", () => {
		const tagMap: Record<string, string[] | undefined> = {
			node1: ["a"],
			node2: undefined,
			node3: ["b"],
		};
		const result = collectMemberTags(["node1", "node2", "node3"], (id) => tagMap[id]);
		expect(result).toContain("a");
		expect(result).toContain("b");
		expect(result).not.toContain(undefined as any);
		expect(result.size).toBe(2);
	});

	it("handles members with empty tag arrays", () => {
		const result = collectMemberTags(["node1", "node2"], (id) => (id === "node1" ? [] : ["tag"]));
		expect(result).toContain("tag");
		expect(result.size).toBe(1);
	});

	it("skips unknown node IDs when getTags returns undefined", () => {
		const knownTags: Record<string, string[]> = { known: ["tag"] };
		const result = collectMemberTags(["known", "unknown"], (id) => knownTags[id]);
		expect(result).toContain("tag");
		expect(result.size).toBe(1);
	});

	it("works with generator (Iterable) memberIds input", () => {
		function* memberGen(): Iterable<string> {
			yield "node1";
			yield "node2";
		}
		const tagMap: Record<string, string[]> = { node1: ["x"], node2: ["y"] };
		const result = collectMemberTags(memberGen(), (id) => tagMap[id]);
		expect(result).toContain("x");
		expect(result).toContain("y");
	});

	it("returns a Set instance", () => {
		const result = collectMemberTags([], () => undefined);
		expect(result).toBeInstanceOf(Set);
	});

	it("handles single member with many tags", () => {
		const tags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
		const result = collectMemberTags(["node1"], () => tags);
		expect(result.size).toBe(100);
	});

	it("handles many members each with one tag (all different)", () => {
		const members = Array.from({ length: 50 }, (_, i) => `node${i}`);
		const result = collectMemberTags(members, (id) => [id + "-tag"]);
		expect(result.size).toBe(50);
	});
});
