import { describe, it, expect } from "vitest";
import { computeAutoFitSpacing, type ClusterForceConfig } from "../src/layouts/cluster-force";
import type { GraphNode, GraphEdge } from "../src/types";

function mkNode(id: string, x = 0, y = 0): GraphNode {
	return { id, label: id, filePath: `${id}.md`, x, y, vx: 0, vy: 0 } as any;
}
function mkEdge(s: string, t: string): GraphEdge {
	return { id: `${s}-${t}`, source: s, target: t, type: "link" } as any;
}

function baseCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
	return {
		groupRules: [{ groupBy: "none", recursive: false }],
		arrangement: "force",
		centerX: 400,
		centerY: 300,
		width: 800,
		height: 600,
		nodeSize: 15,
		nodeSpacing: 3,
		groupScale: 1.5,
		groupSpacing: 2,
		...overrides,
	} as ClusterForceConfig;
}

describe("computeAutoFitSpacing", () => {
	it("returns valid spacing for small graph", () => {
		const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`, i * 50, i * 30));
		const edges = [mkEdge("n0", "n1"), mkEdge("n1", "n2"), mkEdge("n2", "n3")];
		const degrees = new Map<string, number>();
		for (const e of edges) {
			degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
			degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
		}
		const result = computeAutoFitSpacing(nodes, edges, degrees, baseCfg());
		expect(result.nodeSpacing).toBeGreaterThan(0);
		expect(result.groupScale).toBeGreaterThan(0);
		expect(result.groupSpacing).toBeGreaterThan(0);
		expect(Number.isFinite(result.nodeSpacing)).toBe(true);
		expect(Number.isFinite(result.groupScale)).toBe(true);
		expect(Number.isFinite(result.groupSpacing)).toBe(true);
	});

	it("respects upper bounds", () => {
		const nodes = Array.from({ length: 5 }, (_, i) => mkNode(`n${i}`));
		const result = computeAutoFitSpacing(nodes, [], new Map(), baseCfg({ nodeSpacing: 100 }));
		// Upper bound for unconstrained is 10
		expect(result.nodeSpacing).toBeLessThanOrEqual(10);
		expect(result.groupScale).toBeLessThanOrEqual(5);
		expect(result.groupSpacing).toBeLessThanOrEqual(5);
	});

	it("constrained mode (skipGroupOverlap) has lower bounds", () => {
		const nodes = Array.from({ length: 5 }, (_, i) => mkNode(`n${i}`));
		const result = computeAutoFitSpacing(
			nodes,
			[],
			new Map(),
			baseCfg({ skipGroupOverlap: true, nodeSpacing: 100 }),
		);
		expect(result.nodeSpacing).toBeLessThanOrEqual(4);
		expect(result.groupScale).toBeLessThanOrEqual(3);
		expect(result.groupSpacing).toBeLessThanOrEqual(2);
	});

	it("handles empty graph without crash", () => {
		const result = computeAutoFitSpacing([], [], new Map(), baseCfg());
		expect(Number.isFinite(result.nodeSpacing)).toBe(true);
		expect(Number.isFinite(result.groupScale)).toBe(true);
	});

	it("handles single node", () => {
		const result = computeAutoFitSpacing([mkNode("a")], [], new Map(), baseCfg());
		expect(result.nodeSpacing).toBeGreaterThan(0);
	});

	it("spacing values are stable across calls", () => {
		const nodes = Array.from({ length: 8 }, (_, i) => mkNode(`n${i}`, i * 40, i * 25));
		const edges = [mkEdge("n0", "n1"), mkEdge("n2", "n3")];
		const degrees = new Map<string, number>();
		for (const e of edges) {
			degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
			degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
		}
		const cfg = baseCfg();
		const r1 = computeAutoFitSpacing(nodes, edges, degrees, cfg);
		const r2 = computeAutoFitSpacing(nodes, edges, degrees, cfg);
		expect(r1.nodeSpacing).toBe(r2.nodeSpacing);
		expect(r1.groupScale).toBe(r2.groupScale);
	});
});
