/**
 * Coverage-focused test for src/layouts/cluster-force.ts.
 *
 * Complements existing tests by exercising:
 *  - computeAutoFitSpacing (previously untested export)
 *  - buildClusterForce result.metadata (cluster assignment + centroids + radii)
 *  - random / phyllotaxis arrangements (untouched by direct tests)
 *  - additional boundary cases not covered in cluster-force.test.ts,
 *    cluster-force-blend.test.ts, or cluster-force-extra.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
	buildClusterForce,
	computeAutoFitSpacing,
	computeAutoOptimize,
	effectiveRadius,
	estimateLabelExtent,
	estimateLabelWidth,
	nodeRadius,
	pairwiseGap,
	analyzeOverlap,
	type ClusterForceConfig,
} from "../src/layouts/cluster-force";
import type { GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function baseCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
	return {
		groupRules: [{ groupBy: "tag", recursive: false }],
		arrangement: "grid",
		centerX: 400,
		centerY: 300,
		width: 800,
		height: 600,
		nodeSize: 8,
		nodeSpacing: 3.0,
		groupScale: 3.0,
		groupSpacing: 2.0,
		...overrides,
	};
}

function converge(force: (alpha: number) => void, iterations = 40) {
	for (let i = 0; i < iterations; i++) force(1);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
	return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ---------------------------------------------------------------------------
// computeAutoFitSpacing — previously untested export
// ---------------------------------------------------------------------------
describe("computeAutoFitSpacing", () => {
	it("returns spacing values rounded to one decimal place", () => {
		const nodes = [
			makeNode("a", { tags: ["g1"] }),
			makeNode("b", { tags: ["g1"] }),
			makeNode("c", { tags: ["g2"] }),
		];
		const result = computeAutoFitSpacing(nodes, [], new Map(), baseCfg());
		// Rounded to 1 decimal → multiplying by 10 yields an integer
		expect(Number.isFinite(result.nodeSpacing)).toBe(true);
		expect(Math.round(result.nodeSpacing * 10)).toBe(result.nodeSpacing * 10);
		expect(Math.round(result.groupScale * 10)).toBe(result.groupScale * 10);
		expect(Math.round(result.groupSpacing * 10)).toBe(result.groupSpacing * 10);
	});

	it("clamps nodeSpacing to MAX_NODE_SPACING=4 when skipGroupOverlap is set", () => {
		const nodes = Array.from({ length: 30 }, (_, i) => makeNode(`n${i}`, { tags: ["g1"] }));
		const result = computeAutoFitSpacing(
			nodes,
			[],
			new Map(),
			baseCfg({ skipGroupOverlap: true, nodeSpacing: 50, groupScale: 50, groupSpacing: 50 }),
		);
		// constrained upper bounds: nodeSpacing ≤ 4, groupScale ≤ 3, groupSpacing ≤ 2
		expect(result.nodeSpacing).toBeLessThanOrEqual(4);
		expect(result.groupScale).toBeLessThanOrEqual(3);
		expect(result.groupSpacing).toBeLessThanOrEqual(2);
	});

	it("clamps to unconstrained upper bounds (10/5/5) when skipGroupOverlap is false", () => {
		const nodes = Array.from({ length: 40 }, (_, i) =>
			makeNode(`n${i}`, { tags: [i < 20 ? "g1" : "g2"] }),
		);
		const result = computeAutoFitSpacing(
			nodes,
			[],
			new Map(),
			baseCfg({ nodeSpacing: 100, groupScale: 100, groupSpacing: 100 }),
		);
		expect(result.nodeSpacing).toBeLessThanOrEqual(10);
		expect(result.groupScale).toBeLessThanOrEqual(5);
		expect(result.groupSpacing).toBeLessThanOrEqual(5);
	});

	it("handles a single node without throwing", () => {
		const nodes = [makeNode("solo", { tags: ["g1"] })];
		const result = computeAutoFitSpacing(nodes, [], new Map(), baseCfg());
		expect(Number.isFinite(result.nodeSpacing)).toBe(true);
		expect(Number.isFinite(result.groupScale)).toBe(true);
		expect(Number.isFinite(result.groupSpacing)).toBe(true);
	});

	it("survives large graphs (n > 500) where max iterations is reduced", () => {
		const nodes = Array.from({ length: 600 }, (_, i) =>
			makeNode(`n${i}`, { tags: [`g${i % 5}`] }),
		);
		const degrees = new Map(nodes.map((n, i) => [n.id, i % 10]));
		const result = computeAutoFitSpacing(nodes, [], degrees, baseCfg({ arrangement: "phyllotaxis" }));
		// All return values are finite and within unconstrained caps
		expect(result.nodeSpacing).toBeGreaterThan(0);
		expect(result.nodeSpacing).toBeLessThanOrEqual(10);
	});
});

// ---------------------------------------------------------------------------
// buildClusterForce → ClusterMetadata (cluster assignment/centroid/radii)
// ---------------------------------------------------------------------------
describe("buildClusterForce metadata", () => {
	it("nodeClusterMap maps every node to a group key", () => {
		const nodes = [
			makeNode("a", { tags: ["t1"] }),
			makeNode("b", { tags: ["t1"] }),
			makeNode("c", { tags: ["t2"] }),
		];
		const result = buildClusterForce(nodes, [], new Map(), baseCfg());
		expect(result).not.toBeNull();
		const map = result!.metadata.nodeClusterMap;
		for (const n of nodes) {
			expect(map.has(n.id)).toBe(true);
		}
		// Nodes with the same tag share a group key
		expect(map.get("a")).toBe(map.get("b"));
		expect(map.get("a")).not.toBe(map.get("c"));
	});

	it("clusterCentroids has one entry per distinct group", () => {
		const nodes = [
			makeNode("a", { tags: ["x"] }),
			makeNode("b", { tags: ["x"] }),
			makeNode("c", { tags: ["y"] }),
			makeNode("d", { tags: ["z"] }),
		];
		const result = buildClusterForce(nodes, [], new Map(), baseCfg());
		expect(result).not.toBeNull();
		const centroids = result!.metadata.clusterCentroids;
		const distinctGroups = new Set(result!.metadata.nodeClusterMap.values());
		for (const g of distinctGroups) {
			const c = centroids.get(g);
			expect(c).toBeDefined();
			expect(Number.isFinite(c!.x)).toBe(true);
			expect(Number.isFinite(c!.y)).toBe(true);
		}
	});

	it("clusterRadii are positive and finite for each group", () => {
		const nodes = Array.from({ length: 12 }, (_, i) =>
			makeNode(`n${i}`, { tags: [i < 6 ? "a" : "b"] }),
		);
		const result = buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "concentric" }));
		expect(result).not.toBeNull();
		const radii = result!.metadata.clusterRadii;
		expect(radii.size).toBeGreaterThanOrEqual(1);
		for (const r of radii.values()) {
			expect(Number.isFinite(r)).toBe(true);
			expect(r).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// Random arrangement — deterministic disc scatter with collision nudge
// ---------------------------------------------------------------------------
describe("random arrangement", () => {
	it("produces finite positions that deterministically depend on node IDs", () => {
		const idsA = ["alpha", "beta", "gamma", "delta"];
		const run = () => {
			const nodes = idsA.map((id) => makeNode(id, { tags: ["g1"] }));
			const r = buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "random" }))!;
			converge(r.force);
			return nodes.map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) }));
		};
		const a = run();
		const b = run();
		expect(a).toEqual(b);
		for (const p of a) {
			expect(Number.isFinite(p.x)).toBe(true);
			expect(Number.isFinite(p.y)).toBe(true);
		}
	});

	it("no two random-placed nodes land on the same pixel", () => {
		const nodes = Array.from({ length: 15 }, (_, i) => makeNode(`n${i}`, { tags: ["g1"] }));
		const r = buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "random" }))!;
		converge(r.force);
		const keys = new Set(nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`));
		expect(keys.size).toBe(nodes.length);
	});
});

// ---------------------------------------------------------------------------
// Phyllotaxis direct — spiral arrangement without d3 simulation loop
// ---------------------------------------------------------------------------
describe("phyllotaxis arrangement (direct force)", () => {
	it("groups separate when running the force function directly (no d3 sim)", () => {
		const nodes: GraphNode[] = [];
		for (let i = 0; i < 12; i++) nodes.push(makeNode(`a${i}`, { tags: ["A"] }));
		for (let i = 0; i < 12; i++) nodes.push(makeNode(`b${i}`, { tags: ["B"] }));
		const r = buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "phyllotaxis" }))!;
		converge(r.force);
		const centroidA = (() => {
			const xs = nodes.filter((n) => n.tags![0] === "A");
			const cx = xs.reduce((s, n) => s + n.x, 0) / xs.length;
			const cy = xs.reduce((s, n) => s + n.y, 0) / xs.length;
			return { x: cx, y: cy };
		})();
		const centroidB = (() => {
			const xs = nodes.filter((n) => n.tags![0] === "B");
			const cx = xs.reduce((s, n) => s + n.x, 0) / xs.length;
			const cy = xs.reduce((s, n) => s + n.y, 0) / xs.length;
			return { x: cx, y: cy };
		})();
		expect(dist(centroidA, centroidB)).toBeGreaterThan(20);
	});
});

// ---------------------------------------------------------------------------
// nodeRadius — Infinity fallback (cluster-force.test.ts only covers NaN/0/neg)
// ---------------------------------------------------------------------------
describe("nodeRadius Infinity fallback", () => {
	it("Infinity nodeSize falls back to minNodeRadius floor", () => {
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
	});

	it("-Infinity nodeSize falls back to minNodeRadius floor", () => {
		expect(nodeRadius(-Infinity, 0, 18)).toBe(18);
	});
});

// ---------------------------------------------------------------------------
// effectiveRadius — interaction corners not hit by existing tests
// ---------------------------------------------------------------------------
describe("effectiveRadius interaction edges", () => {
	it("cardContentScale=0 disables content scaling even with valid body length", () => {
		const n = makeNode("a");
		const rBase = effectiveRadius(n, 20, 0);
		const rZero = effectiveRadius(n, 20, 0, 60, 18, 0, false, 500, 1000, 0);
		expect(rZero).toBe(rBase);
	});

	it("maxBodyLength=0 suppresses content scaling (log denominator guard)", () => {
		const n = makeNode("a");
		const rBase = effectiveRadius(n, 20, 0);
		const rNoMax = effectiveRadius(n, 20, 0, 60, 18, 0, false, 500, 0, 1.0);
		expect(rNoMax).toBe(rBase);
	});

	it("single-member collapsed node is still inflated vs normal node", () => {
		const normal = makeNode("a");
		const superN = makeNode("b", { collapsedMembers: ["c"] as any });
		expect(effectiveRadius(superN, 20, 0)).toBeGreaterThan(effectiveRadius(normal, 20, 0));
	});
});

// ---------------------------------------------------------------------------
// estimateLabelExtent — font scaling via (degree / maxDeg) importance
// ---------------------------------------------------------------------------
describe("estimateLabelExtent font scaling", () => {
	const mk = (label: string, over?: Partial<GraphNode>): GraphNode =>
		({ id: label, label, ...over }) as GraphNode;

	it("maxDeg=0 pins font to fontMin (importance=0)", () => {
		const w = estimateLabelExtent(mk("abc"), 10, 100, 0, 1, 11, 14);
		// label=3 chars, fontSize=round(11+0*3)=11, charW=11*0.6=6.6, padX=8
		// raw = 3*6.6 + 16 = 35.8
		expect(w).toBeCloseTo(35.8, 3);
	});

	it("high-importance node (degree==maxDeg) uses fontMax", () => {
		const low = estimateLabelExtent(mk("abc"), 10, 0, 10, 1, 11, 14);
		const high = estimateLabelExtent(mk("abc"), 10, 10, 10, 1, 11, 14);
		expect(high).toBeGreaterThan(low);
	});

	it("super node uses the fixed superFontSize regardless of importance", () => {
		const a = estimateLabelExtent(
			mk("xyz", { collapsedMembers: ["m"] as any }),
			10,
			0,
			10,
			1,
			11,
			14,
			13,
		);
		const b = estimateLabelExtent(
			mk("xyz", { collapsedMembers: ["m"] as any }),
			10,
			10,
			10,
			1,
			11,
			14,
			13,
		);
		expect(a).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// estimateLabelWidth — suffix encoding for collapsed members
// ---------------------------------------------------------------------------
describe("estimateLabelWidth suffix accounting", () => {
	it("0 collapsed members still yields ' (0)' suffix (truthy array)", () => {
		const n: GraphNode = { id: "a", label: "lab", collapsedMembers: [] as any } as GraphNode;
		// "lab" (3) + " (0)" (4) = 7 chars → 7*7 = 49
		expect(estimateLabelWidth(n)).toBe(7 * 7);
	});

	it("two-digit collapsed count adds corresponding suffix width", () => {
		const members = Array.from({ length: 12 }, (_, i) => `m${i}`);
		const n: GraphNode = { id: "a", label: "lab", collapsedMembers: members as any } as GraphNode;
		// "lab" (3) + " (12)" (5) = 8 chars → 8*7 = 56
		expect(estimateLabelWidth(n)).toBe(8 * 7);
	});

	it("three-digit count scales suffix linearly", () => {
		const members = Array.from({ length: 100 }, (_, i) => `m${i}`);
		const n: GraphNode = { id: "a", label: "a", collapsedMembers: members as any } as GraphNode;
		// "a" (1) + " (100)" (6) = 7 chars → 7*7 = 49
		expect(estimateLabelWidth(n)).toBe(7 * 7);
	});
});

// ---------------------------------------------------------------------------
// pairwiseGap — non-positive spacing (corner case)
// ---------------------------------------------------------------------------
describe("pairwiseGap non-positive spacing", () => {
	it("spacing=0 returns 0 regardless of radii", () => {
		expect(pairwiseGap(12, 3, 0)).toBe(0);
	});

	it("negative spacing produces negative gap (pure math, no clamping)", () => {
		expect(pairwiseGap(10, 10, -1)).toBe(-20);
	});
});

// ---------------------------------------------------------------------------
// computeAutoOptimize — corner behaviours beyond cluster-force.test.ts
// ---------------------------------------------------------------------------
describe("computeAutoOptimize corner cases", () => {
	const cfg = {
		overlapThreshold: 0.1,
		padIncrement: 3,
		padMax: 5,
		repelScale: 1.5,
		linkScale: 1.2,
	};

	it("padMax clamps _overlapPad when existing value already exceeds padMax", () => {
		const result = computeAutoOptimize(0.9, 10, { _overlapPad: 100 }, 50, 100, cfg);
		expect(result.constants["_overlapPad"]).toBe(5); // min(100+3, 5) = 5
	});

	it("_minGap defaults to 0 when avgRadius is 0", () => {
		const result = computeAutoOptimize(0.5, 0, {}, 50, 100, cfg);
		expect(result.constants["_minGap"]).toBe(0); // max(0, 0*0.5) = 0
	});

	it("threshold=0 always triggers the 'needsMore' branch for any positive ratio", () => {
		const zeroCfg = { ...cfg, overlapThreshold: 0 };
		const result = computeAutoOptimize(0.01, 5, {}, 10, 10, zeroCfg);
		expect(result.needsMore).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// analyzeOverlap — zero-distance / identical positions
// ---------------------------------------------------------------------------
describe("analyzeOverlap zero-distance handling", () => {
	it("multiple coincident nodes: closePairs == overlapPairs == n(n-1)/2", () => {
		const n = 4;
		const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, x: 10, y: 10 }));
		const radii = new Map(nodes.map((v) => [v.id, 5] as const));
		const r = analyzeOverlap(nodes, radii, 3);
		const expected = (n * (n - 1)) / 2;
		expect(r.closePairs).toBe(expected);
		expect(r.overlapPairs).toBe(expected);
		expect(r.overlapRatio).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// buildClusterForce — empty nodes list (edge case)
// ---------------------------------------------------------------------------
describe("buildClusterForce with empty input", () => {
	it("either returns null or an empty-metadata result for empty nodes", () => {
		// Implementation currently short-circuits to null when there are no nodes
		// to group. The important invariant is that callers can detect the no-op.
		const result = buildClusterForce([], [], new Map(), baseCfg());
		if (result !== null) {
			expect(() => result.force(1)).not.toThrow();
			expect(result.metadata.nodeClusterMap.size).toBe(0);
		} else {
			expect(result).toBeNull();
		}
	});
});

// ---------------------------------------------------------------------------
// buildClusterForce — edges touching nodes outside the membership
// ---------------------------------------------------------------------------
describe("buildClusterForce resilience", () => {
	it("ignores edges that reference unknown node ids without throwing", () => {
		const nodes = [makeNode("a", { tags: ["g"] }), makeNode("b", { tags: ["g"] })];
		const edges: GraphEdge[] = [
			{ id: "a->b", source: "a", target: "b" },
			// dangling edge referencing ghost nodes
			{ id: "x->y", source: "x", target: "y" },
		];
		const result = buildClusterForce(nodes, edges, new Map(), baseCfg());
		expect(result).not.toBeNull();
		expect(() => converge(result!.force)).not.toThrow();
		for (const n of nodes) {
			expect(Number.isFinite(n.x)).toBe(true);
			expect(Number.isFinite(n.y)).toBe(true);
		}
	});
});
