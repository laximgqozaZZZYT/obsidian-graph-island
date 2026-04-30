import { describe, it, expect } from "vitest";
import { countInterClusterEdges, collectMemberTags } from "../src/utils/cluster-compare";
import type { GraphEdge } from "../src/types";

function edge(id: string, source: string, target: string): GraphEdge {
	return { id, source, target };
}

describe("countInterClusterEdges", () => {
	it("counts edges that bridge two cluster sets and collects bridge nodes", () => {
		const edges: GraphEdge[] = [
			edge("e1", "a1", "b1"), // crosses A→B
			edge("e2", "a2", "a3"), // internal to A
			edge("e3", "b1", "a2"), // crosses B→A
			edge("e4", "b1", "b2"), // internal to B
		];
		const setA = new Set(["a1", "a2", "a3"]);
		const setB = new Set(["b1", "b2"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		expect(interEdges).toBe(2);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1", "a2"]));
	});

	it("returns zero edges and empty bridges when sets do not connect", () => {
		const edges: GraphEdge[] = [edge("e1", "a1", "a2"), edge("e2", "b1", "b2")];
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1", "b2"]));
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("ignores edges where neither endpoint is in either set", () => {
		const edges: GraphEdge[] = [edge("e1", "x", "y"), edge("e2", "a1", "b1")];
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1"]));
	});

	it("ignores edges that connect a set to a node outside both sets", () => {
		const edges: GraphEdge[] = [edge("e1", "a1", "x"), edge("e2", "y", "b1")];
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("handles d3-force-mutated edges where source/target are objects", () => {
		// d3-force replaces string IDs with node references during simulation.
		const edges = [{ id: "e1", source: { id: "a1" }, target: { id: "b1" } } as unknown as GraphEdge];
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["a1", "b1"]));
	});

	it("returns empty result for empty edge list", () => {
		const { interEdges, bridgeNodes } = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(interEdges).toBe(0);
		expect(bridgeNodes.size).toBe(0);
	});

	it("does not double-count when two sets share a node (degenerate)", () => {
		// If a node is in both sets, an edge with both endpoints in the
		// intersection must still register only once per qualifying edge.
		const edges: GraphEdge[] = [edge("e1", "shared", "b1")];
		const setA = new Set(["shared"]);
		const setB = new Set(["shared", "b1"]);
		const { interEdges, bridgeNodes } = countInterClusterEdges(edges, setA, setB);
		// e1: setA.has("shared") && setB.has("b1") → counts as 1
		expect(interEdges).toBe(1);
		expect(bridgeNodes).toEqual(new Set(["shared", "b1"]));
	});
});

describe("collectMemberTags", () => {
	it("collects the union of tags across given member IDs", () => {
		const tagMap: Record<string, string[]> = {
			n1: ["a", "b"],
			n2: ["b", "c"],
			n3: ["d"],
		};
		const result = collectMemberTags(["n1", "n2", "n3"], (id) => tagMap[id]);
		expect(result).toEqual(new Set(["a", "b", "c", "d"]));
	});

	it("skips IDs whose tags are undefined", () => {
		const tagMap: Record<string, string[] | undefined> = {
			n1: ["x"],
			n2: undefined,
			n3: ["y"],
		};
		const result = collectMemberTags(["n1", "n2", "n3", "missing"], (id) => tagMap[id]);
		expect(result).toEqual(new Set(["x", "y"]));
	});

	it("returns an empty set for empty member list", () => {
		const result = collectMemberTags([], () => ["unused"]);
		expect(result.size).toBe(0);
	});

	it("deduplicates tags shared across members", () => {
		const result = collectMemberTags(["n1", "n2"], (id) => (id === "n1" ? ["t"] : ["t"]));
		expect(result).toEqual(new Set(["t"]));
	});

	it("accepts any iterable for member IDs (e.g. Set)", () => {
		const ids = new Set(["a", "b"]);
		const result = collectMemberTags(ids, (id) => [id]);
		expect(result).toEqual(new Set(["a", "b"]));
	});

	it("handles empty tag arrays without error", () => {
		const result = collectMemberTags(["n1"], () => []);
		expect(result.size).toBe(0);
	});
});
