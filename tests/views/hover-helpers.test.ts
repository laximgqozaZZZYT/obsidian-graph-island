import { describe, it, expect } from "vitest";
import { addLinkNeighborsToSet } from "../../src/views/hover-helpers";
import type { GraphEdge } from "../../src/types";

describe("addLinkNeighborsToSet", () => {
	// Directed graph: A → B → C (and undirected adjacency for BFS).
	const adj = new Map<string, Set<string>>([
		["A", new Set(["B"])],
		["B", new Set(["A", "C"])],
		["C", new Set(["B"])],
	]);
	const edges: GraphEdge[] = [
		{ id: "e1", source: "A", target: "B" },
		{ id: "e2", source: "B", target: "C" },
	];

	it("adds all BFS-reachable neighbors when forwardLinks && backlinks", () => {
		const result = new Set<string>(["A"]);
		addLinkNeighborsToSet(result, "A", { forwardLinks: true, backlinks: true }, adj, 2, edges);
		expect(result.has("A")).toBe(true);
		expect(result.has("B")).toBe(true);
		expect(result.has("C")).toBe(true);
	});

	it("excludes in-edge neighbors when forwardLinks only (C has no out-edges)", () => {
		// C has only an incoming edge from B; so forward-only filter for C drops B.
		const result = new Set<string>(["C"]);
		addLinkNeighborsToSet(result, "C", { forwardLinks: true, backlinks: false }, adj, 2, edges);
		expect(result.has("B")).toBe(false);
		expect(result.has("A")).toBe(false);
		expect(result.has("C")).toBe(true);
	});

	it("excludes out-edge neighbors when backlinks only (A has no in-edges)", () => {
		// A has only an outgoing edge to B; so backlinks-only filter for A drops B.
		const result = new Set<string>(["A"]);
		addLinkNeighborsToSet(result, "A", { forwardLinks: false, backlinks: true }, adj, 2, edges);
		expect(result.has("B")).toBe(false);
		expect(result.has("C")).toBe(false);
		expect(result.has("A")).toBe(true);
	});

	it("adds no neighbors beyond the start node when hops=0", () => {
		const result = new Set<string>();
		addLinkNeighborsToSet(result, "A", { forwardLinks: true, backlinks: true }, adj, 0, edges);
		expect(result.size).toBe(1);
		expect(result.has("A")).toBe(true);
		expect(result.has("B")).toBe(false);
	});

	it("does not throw and adds nothing beyond the start when hoverAdj lacks hId", () => {
		const result = new Set<string>();
		expect(() => {
			addLinkNeighborsToSet(result, "X", { forwardLinks: true, backlinks: true }, adj, 2, edges);
		}).not.toThrow();
		// bfsNeighborSet seeds visited with the start id even if the adj map has no entry.
		expect(result.size).toBe(1);
		expect(result.has("X")).toBe(true);
	});
});
