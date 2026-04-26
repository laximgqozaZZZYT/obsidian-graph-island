import { describe, it, expect } from "vitest";
import { generateStructureQuestions } from "../src/analysis/graph-analysis";
import type { GraphNode, GraphEdge } from "../src/types";

function mkNode(id: string, tags?: string[]): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, tags };
}
function mkEdge(source: string, target: string): GraphEdge {
	return { id: `${source}-${target}`, source, target };
}

describe("generateStructureQuestions", () => {
	it("returns empty array for empty graph", () => {
		const result = generateStructureQuestions([], [], new Map());
		expect(result).toEqual([]);
	});

	it("generates hub question for highly connected node", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
		const edges = [mkEdge("a", "b"), mkEdge("a", "c"), mkEdge("a", "d")];
		const degrees = new Map([
			["a", 3],
			["b", 1],
			["c", 1],
			["d", 1],
		]);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.some((q) => q.includes('"a"') && q.includes("connected"))).toBe(true);
	});

	it("generates bridge question when betweenness provided", () => {
		// "a" is highest degree, "b" is highest betweenness (must differ for question)
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
		const edges = [mkEdge("a", "b"), mkEdge("a", "c"), mkEdge("a", "d"), mkEdge("b", "c")];
		const degrees = new Map([
			["a", 3],
			["b", 2],
			["c", 2],
			["d", 1],
		]);
		const betweenness = new Map([
			["a", 0.5],
			["b", 1.0],
			["c", 0],
			["d", 0],
		]);
		const result = generateStructureQuestions(nodes, edges, degrees, betweenness);
		expect(result.some((q) => q.includes("betweenness"))).toBe(true);
	});

	it("generates orphan question when many orphans", () => {
		const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`));
		const degrees = new Map(nodes.map((n) => [n.id, 0] as [string, number]));
		const result = generateStructureQuestions(nodes, [], degrees);
		expect(result.some((q) => q.includes("orphan"))).toBe(true);
	});

	it("generates tag coverage question when many untagged", () => {
		const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`));
		const edges = [mkEdge("n0", "n1")];
		const degrees = new Map([
			["n0", 1],
			["n1", 1],
		]);
		for (let i = 2; i < 10; i++) degrees.set(`n${i}`, 0);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.some((q) => q.includes("untagged"))).toBe(true);
	});

	it("generates density question for sparse graph", () => {
		const nodes = Array.from({ length: 20 }, (_, i) => mkNode(`n${i}`, ["t1"]));
		const edges = [mkEdge("n0", "n1")];
		const degrees = new Map<string, number>();
		degrees.set("n0", 1);
		degrees.set("n1", 1);
		for (let i = 2; i < 20; i++) degrees.set(`n${i}`, 0);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.some((q) => q.includes("density"))).toBe(true);
	});
});
