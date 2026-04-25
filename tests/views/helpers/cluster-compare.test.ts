import { describe, it, expect } from "vitest";
import { countInterClusterEdges } from "../../../src/views/helpers/cluster-compare";
import type { GraphEdge } from "../../../src/types";

const edge = (id: string, source: string, target: string): GraphEdge => ({
	id,
	source,
	target,
});

describe("countInterClusterEdges", () => {
	it("returns zero counts and empty bridges when edges are empty", () => {
		const result = countInterClusterEdges([], new Set(["a"]), new Set(["b"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("ignores edges that stay inside a single cluster", () => {
		const edges = [edge("e1", "a1", "a2"), edge("e2", "b1", "b2")];
		const result = countInterClusterEdges(edges, new Set(["a1", "a2"]), new Set(["b1", "b2"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});

	it("counts a forward A→B edge and records both endpoints as bridges", () => {
		const edges = [edge("e1", "a1", "b1")];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
		expect([...result.bridgeNodes].sort()).toEqual(["a1", "b1"]);
	});

	it("counts a reverse B→A edge symmetrically", () => {
		const edges = [edge("e1", "b1", "a1")];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
		expect([...result.bridgeNodes].sort()).toEqual(["a1", "b1"]);
	});

	it("counts multiple crossing edges and accumulates the bridge set", () => {
		const edges = [
			edge("e1", "a1", "b1"),
			edge("e2", "a2", "b1"),
			edge("e3", "b2", "a1"),
			edge("e4", "a1", "a2"),
			edge("e5", "b1", "b2"),
		];
		const result = countInterClusterEdges(
			edges,
			new Set(["a1", "a2"]),
			new Set(["b1", "b2"]),
		);
		expect(result.interEdges).toBe(3);
		expect([...result.bridgeNodes].sort()).toEqual(["a1", "a2", "b1", "b2"]);
	});

	it("resolves d3-force object endpoints (post-simulation form)", () => {
		const objEdge = {
			id: "e1",
			source: { id: "a1" },
			target: { id: "b1" },
		} as unknown as GraphEdge;
		const result = countInterClusterEdges([objEdge], new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(1);
		expect([...result.bridgeNodes].sort()).toEqual(["a1", "b1"]);
	});

	it("does not count edges touching only one of the two clusters", () => {
		const edges = [
			edge("e1", "a1", "c1"),
			edge("e2", "c1", "b1"),
		];
		const result = countInterClusterEdges(edges, new Set(["a1"]), new Set(["b1"]));
		expect(result.interEdges).toBe(0);
		expect(result.bridgeNodes.size).toBe(0);
	});
});
