/**
 * Coverage expansion tests — cycle154
 *
 * Targets uncovered branches in:
 *   - coordinate-engine: applyTransform (golden, curve, stack-avoid, even-divide, shape-fill, date-to-index)
 *   - coordinate-engine: resolveAxisValues (hop, property)
 *   - coordinate-engine: coordinateOffsets (polar mode, guide generation)
 *   - coordinate-engine: toCartesian (multi-node polar)
 *   - cluster-force: computeAutoFitSpacing
 *   - cluster-force: effectiveRadius (maxNodeRadius=0 with superNode)
 */
import { describe, it, expect } from "vitest";
import {
	resolveAxisValues,
	applyTransform,
	toCartesian,
	coordinateOffsets,
	type CoordinateContext,
} from "../src/layouts/coordinate-engine";
import {
	buildClusterForce,
	computeAutoFitSpacing,
	effectiveRadius,
	nodeRadius,
	type ClusterForceConfig,
} from "../src/layouts/cluster-force";
import type { GraphNode, GraphEdge, CoordinateLayout } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, meta?: Record<string, unknown>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, meta } as GraphNode;
}

function makeEdge(source: string, target: string, type = "link"): GraphEdge {
	return { id: `${source}->${target}`, source, target, type } as GraphEdge;
}

function baseCtx(overrides?: Partial<CoordinateContext>): CoordinateContext {
	return {
		degrees: new Map(),
		edges: [],
		nodeSize: 8,
		nodeSpacing: 3.0,
		groupScale: 1.0,
		...overrides,
	};
}

function baseCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
	return {
		nodeSize: 15,
		nodeSpacing: 2,
		groupScale: 1.5,
		groupSpacing: 1,
		totalNodeCount: 10,
		clusterArrangement: "concentric",
		groupRules: [{ groupBy: "tag:?", recursive: false }],
		...overrides,
	} as ClusterForceConfig;
}

// ---------------------------------------------------------------------------
// applyTransform — golden-angle
// ---------------------------------------------------------------------------
describe("applyTransform golden-angle (cycle154)", () => {
	it("multiplies raw values by golden angle constant", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
		]);
		const t = applyTransform(raw, { kind: "golden-angle" }, 10);
		// Golden angle ~ 2.3999
		expect(t.get("a")).toBeCloseTo(0);
		expect(t.get("b")!).toBeCloseTo(2.3999, 2);
		expect(t.get("c")!).toBeCloseTo(4.7999, 2);
	});

	it("golden-angle produces distinct values for sequential indices", () => {
		const raw = new Map<string, number>();
		for (let i = 0; i < 10; i++) raw.set(`n${i}`, i);
		const t = applyTransform(raw, { kind: "golden-angle" }, 1);
		const values = [...t.values()];
		// All values should be unique
		expect(new Set(values).size).toBe(10);
	});
});

// ---------------------------------------------------------------------------
// applyTransform — curve
// ---------------------------------------------------------------------------
describe("applyTransform curve (cycle154)", () => {
	it("archimedean curve produces monotonically increasing values", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
			["d", 3],
		]);
		const t = applyTransform(raw, { kind: "curve", curve: "archimedean", scale: 1 }, 10);
		const vals = [t.get("a")!, t.get("b")!, t.get("c")!, t.get("d")!];
		// Archimedean spiral: r = a + b*t, monotonically increasing
		for (let i = 1; i < vals.length; i++) {
			expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
		}
	});

	it("unknown curve falls back to linear spacing", () => {
		const raw = new Map([
			["a", 0],
			["b", 5],
		]);
		const t = applyTransform(raw, { kind: "curve", curve: "nonexistent_curve" as any, scale: 1 }, 10);
		// Fallback linear: v * spacing
		expect(t.get("a")).toBe(0);
		expect(t.get("b")).toBe(50);
	});

	it("curve with custom params overrides defaults", () => {
		// Use 5 nodes so interior t values differ between k=3 and k=7
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
			["d", 3],
			["e", 4],
		]);
		const t1 = applyTransform(raw, { kind: "curve", curve: "rose", scale: 1, params: { k: 3 } }, 10);
		const t2 = applyTransform(raw, { kind: "curve", curve: "rose", scale: 1, params: { k: 7 } }, 10);
		// At least one interior node should differ between k=3 and k=7
		const differ = ["b", "c", "d"].some((id) => t1.get(id) !== t2.get(id));
		expect(differ).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// applyTransform — stack-avoid
// ---------------------------------------------------------------------------
describe("applyTransform stack-avoid (cycle154)", () => {
	it("spreads nodes within same column bin", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);
		const other = new Map([
			["a", 10],
			["b", 10],
			["c", 10],
		]); // same column
		const t = applyTransform(raw, { kind: "stack-avoid" }, 10, other);
		// Nodes should be spread vertically with spacing
		const vals = [t.get("a")!, t.get("b")!, t.get("c")!];
		expect(vals[0]).toBeLessThan(vals[1]);
		expect(vals[1]).toBeLessThan(vals[2]);
	});

	it("without otherAxisValues falls back to linear", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
		]);
		const t = applyTransform(raw, { kind: "stack-avoid" }, 10);
		// Fallback: v * spacing
		expect(t.get("a")).toBe(10);
		expect(t.get("b")).toBe(20);
	});

	it("nodes in different columns get independent offsets", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
			["c", 1],
			["d", 2],
		]);
		const other = new Map([
			["a", 0],
			["b", 0],
			["c", 100],
			["d", 100],
		]);
		const t = applyTransform(raw, { kind: "stack-avoid" }, 10, other);
		// a and b are in bin 0, c and d in bin 10 — each pair spreads independently
		expect(t.size).toBe(4);
		// Both pairs should have symmetric offsets
		const pair1 = [t.get("a")!, t.get("b")!].sort((a, b) => a - b);
		const pair2 = [t.get("c")!, t.get("d")!].sort((a, b) => a - b);
		expect(pair1[1] - pair1[0]).toBeCloseTo(pair2[1] - pair2[0]);
	});
});

// ---------------------------------------------------------------------------
// applyTransform — even-divide
// ---------------------------------------------------------------------------
describe("applyTransform even-divide (cycle154)", () => {
	it("distributes angles evenly per ring when otherAxisValues provided", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
			["d", 3],
		]);
		const other = new Map([
			["a", 10],
			["b", 10],
			["c", 20],
			["d", 20],
		]);
		const t = applyTransform(raw, { kind: "even-divide", totalRange: 360 }, 1, other);
		// ring 10: a, b → angles 0, pi
		// ring 20: c, d → angles 0, pi
		const twoPI = 2 * Math.PI;
		expect(t.get("a")!).toBeCloseTo(0);
		expect(t.get("b")!).toBeCloseTo(twoPI / 2);
		expect(t.get("c")!).toBeCloseTo(0);
		expect(t.get("d")!).toBeCloseTo(twoPI / 2);
	});

	it("global even-divide without other axis uses raw value proportion", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
		]);
		const t = applyTransform(raw, { kind: "even-divide", totalRange: 360 }, 1);
		// Global: v / (maxVal+1) * totalRad
		const totalRad = 2 * Math.PI;
		expect(t.get("a")!).toBeCloseTo(0);
		expect(t.get("b")!).toBeCloseTo(totalRad / 3, 1);
		expect(t.get("c")!).toBeCloseTo((totalRad * 2) / 3, 1);
	});
});

// ---------------------------------------------------------------------------
// applyTransform — shape-fill
// ---------------------------------------------------------------------------
describe("applyTransform shape-fill (cycle154)", () => {
	it("square fill produces grid positions", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
			["d", 3],
		]);
		const t = applyTransform(raw, { kind: "shape-fill", shape: "square", axis: 1 }, 40);
		// 4 nodes → 2x2 grid
		expect(t.size).toBe(4);
		const vals = [...t.values()];
		// All values should be finite
		for (const v of vals) {
			expect(isFinite(v)).toBe(true);
		}
	});

	it("triangle fill axis=2 returns y coordinates", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
		]);
		const t = applyTransform(raw, { kind: "shape-fill", shape: "triangle", axis: 2 }, 30);
		expect(t.size).toBe(3);
		for (const v of t.values()) {
			expect(isFinite(v)).toBe(true);
		}
	});

	it("hexagon fill places first node at center (0)", () => {
		const raw = new Map([
			["center", 0],
			["ring1a", 1],
			["ring1b", 2],
		]);
		const tX = applyTransform(raw, { kind: "shape-fill", shape: "hexagon", axis: 1 }, 30);
		const tY = applyTransform(raw, { kind: "shape-fill", shape: "hexagon", axis: 2 }, 30);
		// First node (hexagon center) should be at (0, 0)
		expect(tX.get("center")).toBe(0);
		expect(tY.get("center")).toBe(0);
	});

	it("diamond fill produces rotated grid positions", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
			["d", 3],
		]);
		const t = applyTransform(raw, { kind: "shape-fill", shape: "diamond", axis: 1 }, 40);
		expect(t.size).toBe(4);
		for (const v of t.values()) {
			expect(isFinite(v)).toBe(true);
		}
	});

	it("circle fill distributes nodes in concentric rings", () => {
		const raw = new Map<string, number>();
		for (let i = 0; i < 8; i++) raw.set(`n${i}`, i);
		const t = applyTransform(raw, { kind: "shape-fill", shape: "circle", axis: 1 }, 30);
		expect(t.size).toBe(8);
		for (const v of t.values()) {
			expect(isFinite(v)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// applyTransform — date-to-index
// ---------------------------------------------------------------------------
describe("applyTransform date-to-index (cycle154)", () => {
	it("sorts by raw value and assigns sequential indices", () => {
		const raw = new Map([
			["c", 30],
			["a", 10],
			["b", 20],
		]);
		const t = applyTransform(raw, { kind: "date-to-index" }, 10);
		// Sorted: a(10), b(20), c(30) → indices 0, 1, 2 times spacing
		expect(t.get("a")).toBe(0);
		expect(t.get("b")).toBe(10);
		expect(t.get("c")).toBe(20);
	});

	it("handles duplicate values preserving all entries", () => {
		const raw = new Map([
			["a", 5],
			["b", 5],
			["c", 5],
		]);
		const t = applyTransform(raw, { kind: "date-to-index" }, 10);
		expect(t.size).toBe(3);
		// All have same raw value — order is stable but all get indexed
		const vals = [...t.values()].sort((a, b) => a - b);
		expect(vals).toEqual([0, 10, 20]);
	});
});

// ---------------------------------------------------------------------------
// resolveAxisValues — hop source
// ---------------------------------------------------------------------------
describe("resolveAxisValues hop source (cycle154)", () => {
	it("assigns BFS depth from start node", () => {
		const nodes = [makeNode("start"), makeNode("mid"), makeNode("far")];
		const edges = [makeEdge("start", "mid"), makeEdge("mid", "far")];
		const ctx = baseCtx({
			edges,
			degrees: new Map([
				["start", 1],
				["mid", 2],
				["far", 1],
			]),
		});
		const vals = resolveAxisValues(nodes, { kind: "hop", from: "start", maxDepth: 5 }, ctx);
		// start → 0 hops, mid → 1 hop, far → 2 hops
		expect(vals.get("start")).toBe(0);
		expect(vals.get("mid")).toBe(1);
		expect(vals.get("far")).toBe(2);
	});

	it("unreachable nodes get fallback depth", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("isolated")];
		const edges = [makeEdge("a", "b")];
		const ctx = baseCtx({ edges });
		const vals = resolveAxisValues(nodes, { kind: "hop", from: "a", maxDepth: 10 }, ctx);
		expect(vals.get("a")).toBe(0);
		// isolated node should get a large fallback value
		expect(vals.get("isolated")!).toBeGreaterThan(vals.get("b")!);
	});
});

// ---------------------------------------------------------------------------
// resolveAxisValues — property source
// ---------------------------------------------------------------------------
describe("resolveAxisValues property source (cycle154)", () => {
	it("resolves numeric property values via getNodeProperty", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const ctx = baseCtx({
			getNodeProperty: (id, key) => {
				if (key === "score") {
					const scores: Record<string, string> = { a: "10", b: "20", c: "30" };
					return scores[id];
				}
				return undefined;
			},
		});
		const vals = resolveAxisValues(nodes, { kind: "property", key: "score" }, ctx);
		expect(vals.get("a")).toBe(10);
		expect(vals.get("b")).toBe(20);
		expect(vals.get("c")).toBe(30);
	});

	it("falls back to meta field when getNodeProperty is absent", () => {
		const nodes = [makeNode("a", { priority: "5" }), makeNode("b", { priority: "15" })];
		const ctx = baseCtx();
		const vals = resolveAxisValues(nodes, { kind: "property", key: "priority" }, ctx);
		expect(vals.size).toBe(2);
		// Should resolve from meta
		expect(vals.get("a")!).toBeLessThan(vals.get("b")!);
	});
});

// ---------------------------------------------------------------------------
// resolveAxisValues — metric source
// ---------------------------------------------------------------------------
describe("resolveAxisValues metric source (cycle154)", () => {
	it("degree metric reads from ctx.degrees map", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const ctx = baseCtx({
			degrees: new Map([
				["a", 5],
				["b", 12],
			]),
		});
		const vals = resolveAxisValues(nodes, { kind: "metric", metric: "degree" }, ctx);
		expect(vals.get("a")).toBe(5);
		expect(vals.get("b")).toBe(12);
	});
});

// ---------------------------------------------------------------------------
// toCartesian — polar multi-node
// ---------------------------------------------------------------------------
describe("toCartesian polar multi-node (cycle154)", () => {
	it("polar with θ=0 puts nodes along x-axis", () => {
		const r = new Map([
			["a", 100],
			["b", 200],
		]);
		const theta = new Map([
			["a", 0],
			["b", 0],
		]);
		const result = toCartesian(r, theta, "polar");
		// Both on x-axis: centroid at (150,0) → a offset (-50,0), b offset (50,0)
		expect(result.get("a")!.dx).toBeCloseTo(-50);
		expect(result.get("a")!.dy).toBeCloseTo(0);
		expect(result.get("b")!.dx).toBeCloseTo(50);
		expect(result.get("b")!.dy).toBeCloseTo(0);
	});

	it("polar with evenly spaced angles places nodes in circle", () => {
		const n = 4;
		const r = new Map<string, number>();
		const theta = new Map<string, number>();
		for (let i = 0; i < n; i++) {
			r.set(`n${i}`, 100);
			theta.set(`n${i}`, (i / n) * 2 * Math.PI);
		}
		const result = toCartesian(r, theta, "polar");
		// All nodes equidistant from centroid (which should be near origin since
		// equal spacing on a circle has centroid at center)
		const distances = [...result.values()].map((p) => Math.sqrt(p.dx * p.dx + p.dy * p.dy));
		for (const d of distances) {
			expect(d).toBeCloseTo(100, 0);
		}
	});
});

// ---------------------------------------------------------------------------
// coordinateOffsets — polar mode integration
// ---------------------------------------------------------------------------
describe("coordinateOffsets polar integration (cycle154)", () => {
	it("produces offsets and guide for polar layout", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const layout: CoordinateLayout = {
			system: "polar",
			axis1: {
				source: { kind: "index" },
				transform: { kind: "linear", scale: 1 },
			},
			axis2: {
				source: { kind: "index" },
				transform: { kind: "even-divide", totalRange: 360 },
			},
		};
		const result = coordinateOffsets(nodes, new Map(), [], layout, baseCtx());
		expect(result.offsets.size).toBe(3);
		// Guide should indicate polar system
		expect((result as any).guide.system).toBe("polar");
		// All offsets should be finite
		for (const { dx, dy } of result.offsets.values()) {
			expect(isFinite(dx)).toBe(true);
			expect(isFinite(dy)).toBe(true);
		}
	});

	it("empty members returns empty offsets", () => {
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: {
				source: { kind: "index" },
				transform: { kind: "linear", scale: 1 },
			},
			axis2: {
				source: { kind: "const", value: 0 },
				transform: { kind: "linear", scale: 1 },
			},
		};
		const result = coordinateOffsets([], new Map(), [], layout, baseCtx());
		expect(result.offsets.size).toBe(0);
	});

	it("cartesian with shape-fill produces grid-like positions", () => {
		const nodes = Array.from({ length: 9 }, (_, i) => makeNode(`n${i}`));
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: {
				source: { kind: "index" },
				transform: { kind: "shape-fill", shape: "square", axis: 1 },
			},
			axis2: {
				source: { kind: "index" },
				transform: { kind: "shape-fill", shape: "square", axis: 2 },
			},
		};
		const result = coordinateOffsets(nodes, new Map(), [], layout, baseCtx());
		expect(result.offsets.size).toBe(9);
		// Guide should have coordinate type
		expect((result as any).guide.type).toBe("coordinate");
	});
});

// ---------------------------------------------------------------------------
// computeAutoFitSpacing
// ---------------------------------------------------------------------------
describe("computeAutoFitSpacing (cycle154)", () => {
	it("returns spacing values for small graph", () => {
		const nodes: GraphNode[] = [];
		for (let i = 0; i < 10; i++) {
			nodes.push({
				id: `n${i}`,
				label: `Node ${i}`,
				x: Math.random() * 100,
				y: Math.random() * 100,
				vx: 0,
				vy: 0,
				tags: i % 2 === 0 ? ["even"] : ["odd"],
				category: i % 3 === 0 ? "A" : "B",
			} as GraphNode);
		}
		const edges: GraphEdge[] = [makeEdge("n0", "n1"), makeEdge("n1", "n2"), makeEdge("n2", "n3")];
		const degrees = new Map<string, number>();
		for (const n of nodes) degrees.set(n.id, 1);

		const cfg = baseCfg({
			clusterArrangement: "phyllotaxis",
			groupRules: [{ groupBy: "tag:?", recursive: false }],
		});

		const result = computeAutoFitSpacing(nodes, edges, degrees, cfg);
		expect(result).toBeDefined();
		expect(result.nodeSpacing).toBeGreaterThan(0);
		expect(result.groupScale).toBeGreaterThan(0);
		expect(result.groupSpacing).toBeGreaterThan(0);
		// Should return rounded values
		expect(result.nodeSpacing).toBe(Math.round(result.nodeSpacing * 10) / 10);
	});

	it("handles empty node list without crash", () => {
		const result = computeAutoFitSpacing([], [], new Map(), baseCfg());
		expect(result).toBeDefined();
	});

	it("constrained mode (skipGroupOverlap) limits max spacing", () => {
		const nodes = Array.from(
			{ length: 5 },
			(_, i) =>
				({
					id: `n${i}`,
					label: `N${i}`,
					x: 0,
					y: 0,
					vx: 0,
					vy: 0,
					tags: ["t"],
					category: "A",
				}) as GraphNode,
		);
		const cfg = baseCfg({
			skipGroupOverlap: true,
			nodeSpacing: 20, // exceeds constrained max
			groupScale: 10,
			groupSpacing: 10,
		});
		const result = computeAutoFitSpacing(nodes, [], new Map(), cfg);
		// Constrained: MAX_NODE_SPACING=4, MAX_GROUP_SCALE=3, MAX_GROUP_SPACING=2
		expect(result.nodeSpacing).toBeLessThanOrEqual(4);
		expect(result.groupScale).toBeLessThanOrEqual(3);
		expect(result.groupSpacing).toBeLessThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// effectiveRadius — additional edge cases
// ---------------------------------------------------------------------------
describe("effectiveRadius additional (cycle154)", () => {
	it("super node with many members approaches maxNodeRadius cap", () => {
		const n = {
			id: "super",
			label: "Super",
			collapsedMembers: Array.from({ length: 100 }, (_, i) => `m${i}`),
		} as any as GraphNode;
		const r = effectiveRadius(n, 20, 5, 60, 15);
		// With 100 members: baseR * (1 + sqrt(100) * 0.5) = 20 * (1 + 5) = 120
		// But capped at maxNodeRadius=60
		expect(r).toBeLessThanOrEqual(60);
		expect(r).toBe(60);
	});

	it("super node with maxNodeRadius=0 means Infinity cap", () => {
		const n = {
			id: "super",
			label: "Super",
			collapsedMembers: Array.from({ length: 25 }, (_, i) => `m${i}`),
		} as any as GraphNode;
		const r = effectiveRadius(n, 20, 5, 0, 15);
		// maxNodeRadius=0 → cap = Infinity, so no capping
		// baseR=20, superR = 20 * (1 + sqrt(25) * 0.5) = 20 * 3.5 = 70
		expect(r).toBeCloseTo(70);
	});

	it("content scaling with large body boosts radius", () => {
		const n = makeNode("big");
		const rBase = effectiveRadius(n, 20, 5, 60, 15, 0, false, 0, 0, 0);
		const rBig = effectiveRadius(n, 20, 5, 60, 15, 0, false, 1000, 1000, 1.0);
		// With bodyLength=maxBodyLength and cardContentScale=1:
		// boost = 1 + 1.0 * log(1001)/log(1001) = 2.0
		expect(rBig).toBeGreaterThan(rBase);
		expect(rBig).toBeCloseTo(rBase * 2, 0);
	});

	it("sizeByDegree with maxDegree=0 returns base radius", () => {
		const r = nodeRadius(20, 50, 15, 0, true);
		expect(r).toBe(20);
	});
});

// ---------------------------------------------------------------------------
// applyTransform — expression with constants
// ---------------------------------------------------------------------------
describe("applyTransform expression (cycle154)", () => {
	it("invalid expression falls back to linear", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
		]);
		const t = applyTransform(raw, { kind: "expression", expr: ")))invalid(((", scale: 1 }, 10);
		// Fallback: v * spacing
		expect(t.get("a")).toBe(10);
		expect(t.get("b")).toBe(20);
	});

	it("expression with built-in pi constant", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
		]);
		const t = applyTransform(raw, { kind: "expression", expr: "pi", scale: 1 }, 1);
		// For all nodes: val = pi * scale * spacing
		expect(t.get("a")!).toBeCloseTo(Math.PI);
		expect(t.get("b")!).toBeCloseTo(Math.PI);
	});
});
