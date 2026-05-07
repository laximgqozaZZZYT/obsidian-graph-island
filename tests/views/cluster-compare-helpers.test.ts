/**
 * Unit tests for src/views/cluster-compare-helpers.ts
 *
 * Both helpers were extracted out of GraphViewContainer's "Cluster compare"
 * feature so they can be exercised without instantiating the view. They are
 * intentionally pure: no Pixi, no settings, no DOM.
 */
import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../../src/views/cluster-compare-helpers";
import type { GraphEdge } from "../../src/types";

function edge(source: string, target: string, type = "link"): GraphEdge {
	return { source, target, type } as unknown as GraphEdge;
}

describe("countInterClusterEdges", () => {
	it("returns 0 inter-edges and an empty bridge set when there are no edges", () => {
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges([], setA, setB);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("counts an edge whose endpoints land in setA and setB respectively", () => {
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges([edge("a1", "b1")], setA, setB);
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1"]));
	});

	it("treats the relationship symmetrically (B → A also counts)", () => {
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges([edge("b1", "a1")], setA, setB);
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1"]));
	});

	it("ignores intra-cluster edges (both endpoints inside the same set)", () => {
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1", "b2"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges([edge("a1", "a2"), edge("b1", "b2")], setA, setB);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("ignores edges whose endpoints are outside both sets entirely", () => {
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges([edge("x", "y"), edge("a1", "z")], setA, setB);
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("dedupes bridge nodes across multiple inter-cluster edges", () => {
		const setA = new Set(["a1", "a2"]);
		const setB = new Set(["b1", "b2"]);
		const edges = [edge("a1", "b1"), edge("a1", "b2"), edge("a2", "b1")];
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(3);
		expect(bridgeNodes).toEqual(new Set(["a1", "a2", "b1", "b2"]));
	});

	it("supports d3-force-style endpoints where source/target are node objects", () => {
		const setA = new Set(["a1"]);
		const setB = new Set(["b1"]);
		const objEdge = { source: { id: "a1" }, target: { id: "b1" } } as unknown as GraphEdge;
		const { interEdges, bridgeNodes } = countInterClusterEdges([objEdge], setA, setB);
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1"]));
	});
});

describe("collectMemberTags", () => {
	it("returns an empty set for an empty member list", () => {
		const tags = collectMemberTags([], () => []);
		expect(tags.size).toBe(0);
	});

	it("collects the union of tags across all members", () => {
		const data: Record<string, string[]> = {
			n1: ["alpha", "beta"],
			n2: ["beta", "gamma"],
		};
		const tags = collectMemberTags(["n1", "n2"], (id) => data[id]);
		expect(tags).toEqual(new Set(["alpha", "beta", "gamma"]));
	});

	it("skips members with undefined tag lookups (e.g. unknown IDs)", () => {
		const data: Record<string, string[]> = { n1: ["alpha"] };
		const tags = collectMemberTags(["n1", "missing"], (id) => data[id]);
		expect(tags).toEqual(new Set(["alpha"]));
	});

	it("skips members with no tags but still processes others", () => {
		const data: Record<string, string[] | undefined> = {
			n1: ["alpha"],
			n2: undefined,
			n3: ["beta"],
		};
		const tags = collectMemberTags(["n1", "n2", "n3"], (id) => data[id]);
		expect(tags).toEqual(new Set(["alpha", "beta"]));
	});

	it("treats an empty tag array as a no-op (no tags added)", () => {
		const data: Record<string, string[]> = { n1: [], n2: ["beta"] };
		const tags = collectMemberTags(["n1", "n2"], (id) => data[id]);
		expect(tags).toEqual(new Set(["beta"]));
	});

	it("returns a fresh Set each call (no shared state across invocations)", () => {
		const a = collectMemberTags(["x"], () => ["t1"]);
		const b = collectMemberTags(["x"], () => ["t2"]);
		expect(a).toEqual(new Set(["t1"]));
		expect(b).toEqual(new Set(["t2"]));
	});
});
