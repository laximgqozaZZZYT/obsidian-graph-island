/**
 * Tests for src/views/cluster-compare-helpers.ts
 *
 * These are pure helper functions extracted from GraphViewContainer.updateClusterCompare().
 */
import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEdge(id: string, source: string, target: string): GraphEdge {
	return { id, source, target };
}

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------

describe("countInterClusterEdges", () => {
	it("returns 0 inter-edges and empty bridgeNodes for empty edge set", () => {
		const setA = new Set(["a", "b"]);
		const setB = new Set(["c", "d"]);
		const result = countInterClusterEdges([], setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts edge from setA to setB", () => {
		const edges = [makeEdge("e1", "a", "c")];
		const setA = new Set(["a"]);
		const setB = new Set(["c"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("c")).toBe(true);
	});

	it("counts edge from setB to setA (direction-independent)", () => {
		const edges = [makeEdge("e1", "c", "a")];
		const setA = new Set(["a"]);
		const setB = new Set(["c"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("c")).toBe(true);
	});

	it("does not count edges within setA", () => {
		const edges = [makeEdge("e1", "a", "b")];
		const setA = new Set(["a", "b"]);
		const setB = new Set(["c", "d"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("does not count edges within setB", () => {
		const edges = [makeEdge("e1", "c", "d")];
		const setA = new Set(["a", "b"]);
		const setB = new Set(["c", "d"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts multiple inter-cluster edges", () => {
		const edges = [
			makeEdge("e1", "a", "c"),
			makeEdge("e2", "b", "d"),
			makeEdge("e3", "d", "a"),
		];
		const setA = new Set(["a", "b"]);
		const setB = new Set(["c", "d"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(3);
		expect(result.bridgeNodes.size).toBe(4);
	});

	it("collects unique bridge nodes (no duplicates)", () => {
		const edges = [
			makeEdge("e1", "a", "c"),
			makeEdge("e2", "a", "c"), // same endpoints
		];
		const setA = new Set(["a"]);
		const setB = new Set(["c"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(2);
		expect(result.bridgeNodes.size).toBe(2); // only "a" and "c", no duplicates
	});

	it("ignores edges with endpoints in neither set", () => {
		const edges = [makeEdge("e1", "x", "y")];
		const setA = new Set(["a"]);
		const setB = new Set(["c"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("handles empty setA and setB", () => {
		const edges = [makeEdge("e1", "a", "b")];
		const result = countInterClusterEdges(edges, new Set(), new Set());
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("handles single-node clusters", () => {
		const edges = [makeEdge("e1", "a", "b")];
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("b")).toBe(true);
	});

	it("works with generator/iterable edges", () => {
		function* edgeGen(): Iterable<GraphEdge> {
			yield makeEdge("e1", "a", "c");
			yield makeEdge("e2", "b", "d");
		}
		const setA = new Set(["a", "b"]);
		const setB = new Set(["c", "d"]);
		const result = countInterClusterEdges(edgeGen(), setA, setB);
		expect(result.interEdges).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------

describe("collectMemberTags", () => {
	it("returns empty set for empty memberIds", () => {
		const getTags = (_id: string) => undefined;
		const result = collectMemberTags([], getTags);
		expect(result.size).toBe(0);
	});

	it("collects tags from a single member", () => {
		const getTags = (id: string) => (id === "n1" ? ["character", "hero"] : undefined);
		const result = collectMemberTags(["n1"], getTags);
		expect(result.has("character")).toBe(true);
		expect(result.has("hero")).toBe(true);
		expect(result.size).toBe(2);
	});

	it("merges tags from multiple members", () => {
		const tagMap: Record<string, string[]> = {
			n1: ["a", "b"],
			n2: ["b", "c"],
			n3: ["d"],
		};
		const getTags = (id: string) => tagMap[id];
		const result = collectMemberTags(["n1", "n2", "n3"], getTags);
		expect(result.has("a")).toBe(true);
		expect(result.has("b")).toBe(true);
		expect(result.has("c")).toBe(true);
		expect(result.has("d")).toBe(true);
		expect(result.size).toBe(4);
	});

	it("deduplicates tags across members", () => {
		const getTags = (_id: string) => ["shared-tag", "another-tag"];
		const result = collectMemberTags(["n1", "n2", "n3"], getTags);
		expect(result.size).toBe(2); // deduped
		expect(result.has("shared-tag")).toBe(true);
	});

	it("skips members with undefined tags", () => {
		const getTags = (id: string) => (id === "n1" ? ["t1"] : undefined);
		const result = collectMemberTags(["n1", "n2", "n3"], getTags);
		expect(result.size).toBe(1);
		expect(result.has("t1")).toBe(true);
	});

	it("skips unknown node IDs silently", () => {
		const getTags = (_id: string) => undefined;
		const result = collectMemberTags(["unknown1", "unknown2"], getTags);
		expect(result.size).toBe(0);
	});

	it("handles members with empty tag arrays", () => {
		const getTags = (_id: string) => [] as string[];
		const result = collectMemberTags(["n1", "n2"], getTags);
		expect(result.size).toBe(0);
	});

	it("works with generator/iterable memberIds", () => {
		function* memberGen(): Iterable<string> {
			yield "n1";
			yield "n2";
		}
		const getTags = (id: string) => (id === "n1" ? ["t1"] : ["t2"]);
		const result = collectMemberTags(memberGen(), getTags);
		expect(result.has("t1")).toBe(true);
		expect(result.has("t2")).toBe(true);
	});

	it("returns a Set (not array or other type)", () => {
		const getTags = (_id: string) => ["x"];
		const result = collectMemberTags(["n1"], getTags);
		expect(result instanceof Set).toBe(true);
	});
});
