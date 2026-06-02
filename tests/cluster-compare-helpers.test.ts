/**
 * Tests for src/views/cluster-compare-helpers.ts — pure helper functions
 * for cluster comparison logic.
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

function mkEdge(src: string, tgt: string, id?: string): GraphEdge {
	return { id: id ?? `${src}-${tgt}`, source: src, target: tgt };
}

// ===========================================================================
// countInterClusterEdges
// ===========================================================================

describe("countInterClusterEdges", () => {
	it("returns zero when edge list is empty", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts a single crossing edge (forward direction)", () => {
		const edges = [mkEdge("a", "b")];
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes).toContain("a");
		expect(result.bridgeNodes).toContain("b");
	});

	it("counts a single crossing edge (reverse direction — setB source, setA target)", () => {
		const edges = [mkEdge("b", "a")];
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes).toContain("a");
		expect(result.bridgeNodes).toContain("b");
	});

	it("ignores intra-cluster edges within setA", () => {
		const edges = [mkEdge("a1", "a2"), mkEdge("a1", "b1")];
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
	});

	it("ignores intra-cluster edges within setB", () => {
		const edges = [mkEdge("b1", "b2"), mkEdge("a1", "b1")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1", "b2"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
	});

	it("counts multiple inter-cluster edges", () => {
		const edges = [mkEdge("a1", "b1"), mkEdge("a2", "b2"), mkEdge("a1", "a2")];
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1", "b2"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(2);
	});

	it("collects all bridge node IDs", () => {
		const edges = [mkEdge("a1", "b1"), mkEdge("a2", "b2")];
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1", "b2"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.bridgeNodes.size).toBe(4);
		expect(result.bridgeNodes).toContain("a1");
		expect(result.bridgeNodes).toContain("a2");
		expect(result.bridgeNodes).toContain("b1");
		expect(result.bridgeNodes).toContain("b2");
	});

	it("does not double-count the same bridge node", () => {
		// a1 participates in two edges — should appear once in bridgeNodes
		const edges = [mkEdge("a1", "b1"), mkEdge("a1", "b2")];
		const setA = new Set(["a1"]);
		const setB = new Set(["b1", "b2"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(2);
		// bridgeNodes is a Set, so a1 only appears once
		const nodeList = [...result.bridgeNodes];
		expect(nodeList.filter((n) => n === "a1").length).toBe(1);
	});

	it("ignores edges whose both endpoints are in neither set", () => {
		const edges = [mkEdge("x", "y")];
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("ignores edge with one endpoint in setA but the other not in setB", () => {
		const edges = [mkEdge("a", "x")];
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
	});

	it("handles overlapping sets gracefully (edge within overlap is counted from both sides)", () => {
		// If a node is in both setA and setB the function still follows its
		// stated contract: check (setA.has(src) && setB.has(tgt)) or vice-versa.
		const edges = [mkEdge("shared", "shared2")];
		const setA = new Set(["shared", "other-a"]);
		const setB = new Set(["shared2", "other-b"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
	});

	it("works with a generator / iterable (not just Array)", () => {
		function* makeEdges(): Iterable<GraphEdge> {
			yield mkEdge("a", "b");
			yield mkEdge("a", "c");
		}
		const setA = new Set(["a"]);
		const setB = new Set(["b", "c"]);
		const result = countInterClusterEdges(makeEdges(), setA, setB);
		expect(result.interEdges).toBe(2);
	});

	it("returns correct type shape — interEdges is number, bridgeNodes is Set<string>", () => {
		const result = countInterClusterEdges([], new Set<string>(), new Set<string>());
		expect(typeof result.interEdges).toBe("number");
		expect(result.bridgeNodes).toBeInstanceOf(Set);
	});
});

// ===========================================================================
// collectMemberTags
// ===========================================================================

describe("collectMemberTags", () => {
	it("returns empty set when memberIds is empty", () => {
		const tags = collectMemberTags([], (_id) => ["t1"]);
		expect(tags.size).toBe(0);
	});

	it("collects tags from a single node", () => {
		const getTags = (id: string) => (id === "n1" ? ["alpha", "beta"] : undefined);
		const tags = collectMemberTags(["n1"], getTags);
		expect(tags).toEqual(new Set(["alpha", "beta"]));
	});

	it("collects union of tags across multiple nodes", () => {
		const map: Record<string, string[]> = {
			n1: ["a", "b"],
			n2: ["b", "c"],
			n3: ["d"],
		};
		const tags = collectMemberTags(["n1", "n2", "n3"], (id) => map[id]);
		expect(tags).toEqual(new Set(["a", "b", "c", "d"]));
	});

	it("deduplicates tags appearing in multiple nodes", () => {
		const map: Record<string, string[]> = {
			n1: ["shared", "unique-a"],
			n2: ["shared", "unique-b"],
		};
		const tags = collectMemberTags(["n1", "n2"], (id) => map[id]);
		// "shared" should appear only once
		expect(tags.size).toBe(3);
		expect(tags).toContain("shared");
	});

	it("skips nodes for which getTags returns undefined", () => {
		const getTags = (id: string) => (id === "n1" ? ["tag1"] : undefined);
		const tags = collectMemberTags(["n1", "unknown", "n2"], getTags);
		expect(tags).toEqual(new Set(["tag1"]));
	});

	it("handles nodes with empty tag arrays", () => {
		const map: Record<string, string[]> = {
			n1: [],
			n2: ["t1"],
		};
		const tags = collectMemberTags(["n1", "n2"], (id) => map[id]);
		expect(tags).toEqual(new Set(["t1"]));
	});

	it("works with a generator / iterable (not just Array)", () => {
		function* ids(): Iterable<string> {
			yield "n1";
			yield "n2";
		}
		const map: Record<string, string[]> = { n1: ["x"], n2: ["y"] };
		const tags = collectMemberTags(ids(), (id) => map[id]);
		expect(tags).toEqual(new Set(["x", "y"]));
	});

	it("returns a Set<string> instance", () => {
		const tags = collectMemberTags([], (_id) => undefined);
		expect(tags).toBeInstanceOf(Set);
	});

	it("handles a single node with no tags (undefined vs empty array)", () => {
		const tags = collectMemberTags(["lone"], (_id) => undefined);
		expect(tags.size).toBe(0);
	});

	it("handles large number of members efficiently", () => {
		const ids = Array.from({ length: 1000 }, (_, i) => `n${i}`);
		const getTags = (id: string) => [id + "_tag"];
		const tags = collectMemberTags(ids, getTags);
		expect(tags.size).toBe(1000);
	});
});
