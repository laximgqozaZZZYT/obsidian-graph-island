import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// countInterClusterEdges
// ---------------------------------------------------------------------------
describe("countInterClusterEdges", () => {
	function edge(id: string, source: string, target: string): GraphEdge {
		return { id, source, target };
	}

	it("counts zero when no edges cross the two sets", () => {
		const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
		const setA = new Set(["a", "b", "c"]);
		const setB = new Set(["x", "y"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts an edge from setA to setB", () => {
		const edges = [edge("e1", "a", "x")];
		const setA = new Set(["a"]);
		const setB = new Set(["x"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("x")).toBe(true);
	});

	it("counts an edge from setB to setA (direction-agnostic)", () => {
		const edges = [edge("e1", "x", "a")];
		const setA = new Set(["a"]);
		const setB = new Set(["x"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(1);
		expect(result.bridgeNodes.has("a")).toBe(true);
		expect(result.bridgeNodes.has("x")).toBe(true);
	});

	it("ignores edges entirely within one set", () => {
		const edges = [edge("e1", "a", "b")];
		const setA = new Set(["a", "b"]);
		const setB = new Set(["x", "y"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
	});

	it("ignores edges entirely outside both sets", () => {
		const edges = [edge("e1", "p", "q")];
		const setA = new Set(["a"]);
		const setB = new Set(["b"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("accumulates multiple bridging edges and dedupes bridge node ids", () => {
		const edges = [edge("e1", "a", "x"), edge("e2", "a", "y"), edge("e3", "b", "x")];
		const setA = new Set(["a", "b"]);
		const setB = new Set(["x", "y"]);
		const result = countInterClusterEdges(edges, setA, setB);
		expect(result.interEdges).toBe(3);
		expect(result.bridgeNodes).toEqual(new Set(["a", "x", "y", "b"]));
	});

	it("handles an empty edge list", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("handles empty sets", () => {
		const edges = [edge("e1", "a", "b")];
		const result = countInterClusterEdges(edges, new Set(), new Set());
		expect(result.interEdges).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// collectMemberTags
// ---------------------------------------------------------------------------
describe("collectMemberTags", () => {
	it("collects the union of tags across members", () => {
		const tagMap: Record<string, string[]> = {
			n1: ["foo", "bar"],
			n2: ["bar", "baz"],
		};
		const result = collectMemberTags(["n1", "n2"], (id) => tagMap[id]);
		expect(result).toEqual(new Set(["foo", "bar", "baz"]));
	});

	it("skips members with undefined tags", () => {
		const result = collectMemberTags(["n1", "n2"], (id) => (id === "n1" ? ["foo"] : undefined));
		expect(result).toEqual(new Set(["foo"]));
	});

	it("skips members with empty tag arrays", () => {
		const result = collectMemberTags(["n1"], () => []);
		expect(result.size).toBe(0);
	});

	it("returns an empty set for an empty member list", () => {
		const result = collectMemberTags([], () => ["foo"]);
		expect(result.size).toBe(0);
	});

	it("returns an empty set when getTags always returns undefined", () => {
		const result = collectMemberTags(["n1", "n2", "n3"], () => undefined);
		expect(result.size).toBe(0);
	});

	it("dedupes repeated tags across members", () => {
		const result = collectMemberTags(["n1", "n2"], () => ["shared"]);
		expect(result).toEqual(new Set(["shared"]));
	});
});
