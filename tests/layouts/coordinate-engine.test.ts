import { describe, it, expect } from "vitest";
import {
	resolveAxisValues,
	applyTransform,
	toCartesian,
	resolveAxisCategories,
	formatGridValue,
	type CoordinateContext,
} from "../../src/layouts/coordinate-engine";
import type { GraphNode, GraphEdge, AxisSource, AxisTransform } from "../../src/types";
import {
	SOURCE_INDEX,
	SOURCE_FIELD,
	SOURCE_PROPERTY,
	SOURCE_METRIC,
	SOURCE_HOP,
	SOURCE_RANDOM,
	SOURCE_CONST,
	TRANSFORM_LINEAR,
	TRANSFORM_BIN,
	TRANSFORM_DATE_INDEX,
	TRANSFORM_GOLDEN,
	TRANSFORM_EVEN_DIVIDE,
	TRANSFORM_STACK_AVOID,
	TRANSFORM_CURVE,
	TRANSFORM_SHAPE_FILL,
	TRANSFORM_EXPRESSION,
	SHAPE_FILL_SQUARE,
	SHAPE_FILL_TRIANGLE,
	SHAPE_FILL_HEXAGON,
	SHAPE_FILL_DIAMOND,
	SHAPE_FILL_CIRCLE,
	LAYOUT_GOLDEN_ANGLE,
} from "../../src/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function makeCtx(overrides?: Partial<CoordinateContext>): CoordinateContext {
	return {
		degrees: new Map(),
		edges: [],
		nodeSize: 10,
		nodeSpacing: 1,
		groupScale: 1,
		...overrides,
	};
}

function makeEdge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target };
}

// ---------------------------------------------------------------------------
// formatGridValue
// ---------------------------------------------------------------------------

describe("formatGridValue", () => {
	it("returns integer string when value is a clean multiple of spacing", () => {
		expect(formatGridValue(20, 10)).toBe("2");
		expect(formatGridValue(0, 10)).toBe("0");
		expect(formatGridValue(-30, 10)).toBe("-3");
	});

	it("falls back to fixed-point on raw value when not a clean multiple of spacing", () => {
		// 5 / 10 = 0.5 → not within integer threshold; falls back to v.toFixed(1)
		// Note: fallback uses raw v (not normalized), so 5 → "5.0" not "0.5"
		expect(formatGridValue(5, 10)).toBe("5.0");
	});

	it("uses 1-decimal format for small magnitudes (|v| < 10)", () => {
		// Spacing 0 forces fallback path; 3.7 < 10 → toFixed(1)
		expect(formatGridValue(3.7, 0)).toBe("3.7");
		expect(formatGridValue(-9.99, 0)).toBe("-10.0");
	});

	it("uses 0-decimal format for large magnitudes (|v| >= 10)", () => {
		// Spacing 0 forces fallback; 123.4 >= 10 → toFixed(0)
		expect(formatGridValue(123.4, 0)).toBe("123");
		expect(formatGridValue(-50, 0)).toBe("-50");
	});

	it("treats spacing of 0 as fallback (no normalization)", () => {
		// Branch: spacing > 0 is false → skip normalization
		expect(formatGridValue(7, 0)).toBe("7.0");
	});
});

// ---------------------------------------------------------------------------
// toCartesian
// ---------------------------------------------------------------------------

describe("toCartesian", () => {
	it("returns empty map for empty inputs", () => {
		const out = toCartesian(new Map(), new Map(), "cartesian");
		expect(out.size).toBe(0);
	});

	it("places single node at origin after centroid normalization (cartesian)", () => {
		const a1 = new Map([["a", 5]]);
		const a2 = new Map([["a", 7]]);
		const out = toCartesian(a1, a2, "cartesian");
		expect(out.get("a")).toEqual({ dx: 0, dy: 0 });
	});

	it("centers two-node cartesian inputs around origin", () => {
		const a1 = new Map([
			["a", 0],
			["b", 10],
		]);
		const a2 = new Map([
			["a", 0],
			["b", 0],
		]);
		const out = toCartesian(a1, a2, "cartesian");
		expect(out.get("a")).toEqual({ dx: -5, dy: 0 });
		expect(out.get("b")).toEqual({ dx: 5, dy: 0 });
	});

	it("uses polar conversion: axis1=r, axis2=angle (radians)", () => {
		// Single node at r=10, angle=0 → (10, 0); centroid normalization makes it (0, 0)
		const a1 = new Map([["a", 10]]);
		const a2 = new Map([["a", 0]]);
		const out = toCartesian(a1, a2, "polar");
		expect(out.get("a")).toEqual({ dx: 0, dy: 0 });
	});

	it("converts polar coordinates correctly for two opposing nodes", () => {
		// Node a at (r=10, θ=0) → (10, 0); node b at (r=10, θ=π) → (-10, 0)
		// Centroid is (0, 0), so values stay the same.
		const a1 = new Map([
			["a", 10],
			["b", 10],
		]);
		const a2 = new Map([
			["a", 0],
			["b", Math.PI],
		]);
		const out = toCartesian(a1, a2, "polar");
		expect(out.get("a")!.dx).toBeCloseTo(10, 5);
		expect(out.get("a")!.dy).toBeCloseTo(0, 5);
		expect(out.get("b")!.dx).toBeCloseTo(-10, 5);
		expect(out.get("b")!.dy).toBeCloseTo(0, 5);
	});

	it("defaults missing axis2 values to 0", () => {
		// "b" only in axis1; axis2 lookup returns undefined → 0
		const a1 = new Map([
			["a", 0],
			["b", 4],
		]);
		const a2 = new Map([["a", 0]]);
		const out = toCartesian(a1, a2, "cartesian");
		// b: dx=4, dy=0; centroid: (2, 0); after shift: a=(-2,0), b=(2,0)
		expect(out.get("b")).toEqual({ dx: 2, dy: 0 });
		expect(out.get("a")).toEqual({ dx: -2, dy: 0 });
	});
});

// ---------------------------------------------------------------------------
// resolveAxisValues
// ---------------------------------------------------------------------------

describe("resolveAxisValues", () => {
	it("returns empty map for empty members (index source)", () => {
		const out = resolveAxisValues([], { kind: SOURCE_INDEX }, makeCtx());
		expect(out.size).toBe(0);
	});

	it("assigns sequential indices for SOURCE_INDEX", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c")];
		const out = resolveAxisValues(members, { kind: SOURCE_INDEX }, makeCtx());
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(1);
		expect(out.get("c")).toBe(2);
	});

	it("assigns numeric category values for SOURCE_FIELD when all values are numeric", () => {
		const members = [makeNode("a", { meta: { score: "10" } }), makeNode("b", { meta: { score: "20" } })];
		const source: AxisSource = { kind: SOURCE_FIELD, field: "score" };
		const out = resolveAxisValues(members, source, makeCtx());
		expect(out.get("a")).toBe(10);
		expect(out.get("b")).toBe(20);
	});

	it("assigns lexicographic indices for SOURCE_FIELD with non-numeric values", () => {
		const members = [
			makeNode("a", { category: "zebra" }),
			makeNode("b", { category: "apple" }),
			makeNode("c", { category: "mango" }),
		];
		const source: AxisSource = { kind: SOURCE_FIELD, field: "category" };
		const out = resolveAxisValues(members, source, makeCtx());
		// Sorted: ["apple", "mango", "zebra"] → indices 0, 1, 2
		expect(out.get("b")).toBe(0); // apple
		expect(out.get("c")).toBe(1); // mango
		expect(out.get("a")).toBe(2); // zebra
	});

	it("places SOURCE_FIELD nodes with missing values past max + range gap", () => {
		const members = [
			makeNode("a", { meta: { score: "5" } }),
			makeNode("b", { meta: { score: "15" } }),
			makeNode("c"), // missing
		];
		const source: AxisSource = { kind: SOURCE_FIELD, field: "score" };
		const out = resolveAxisValues(members, source, makeCtx());
		expect(out.get("a")).toBe(5);
		expect(out.get("b")).toBe(15);
		// max=15, range=10, gap=10*0.15=1.5 → c=16.5
		expect(out.get("c")).toBeCloseTo(16.5, 5);
	});

	it("assigns SOURCE_FIELD missing-only nodes to 0", () => {
		const members = [makeNode("a"), makeNode("b")];
		const source: AxisSource = { kind: SOURCE_FIELD, field: "missing" };
		const out = resolveAxisValues(members, source, makeCtx());
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(0);
	});

	it("uses ctx.getNodeProperty for SOURCE_PROPERTY when provided", () => {
		const members = [makeNode("a"), makeNode("b")];
		const ctx = makeCtx({
			getNodeProperty: (id, key) => (key === "rank" ? (id === "a" ? "1" : "2") : undefined),
		});
		const source: AxisSource = { kind: SOURCE_PROPERTY, key: "rank" };
		const out = resolveAxisValues(members, source, ctx);
		expect(out.get("a")).toBe(1);
		expect(out.get("b")).toBe(2);
	});

	it("falls back to node.meta for SOURCE_PROPERTY when accessor unset", () => {
		const members = [makeNode("a", { meta: { weight: 3 } }), makeNode("b", { meta: { weight: "7" } })];
		const source: AxisSource = { kind: SOURCE_PROPERTY, key: "weight" };
		const out = resolveAxisValues(members, source, makeCtx());
		expect(out.get("a")).toBe(3);
		expect(out.get("b")).toBe(7);
	});

	it("assigns SOURCE_METRIC degree from ctx.degrees", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c")];
		const ctx = makeCtx({
			degrees: new Map([
				["a", 5],
				["b", 2],
			]),
		});
		const source: AxisSource = { kind: SOURCE_METRIC, metric: "degree" };
		const out = resolveAxisValues(members, source, ctx);
		expect(out.get("a")).toBe(5);
		expect(out.get("b")).toBe(2);
		expect(out.get("c")).toBe(0); // missing → 0
	});

	it("counts directed in-degree for SOURCE_METRIC=in-degree", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c")];
		const ctx = makeCtx({
			edges: [makeEdge("a", "b"), makeEdge("c", "b"), makeEdge("a", "c")],
		});
		const source: AxisSource = { kind: SOURCE_METRIC, metric: "in-degree" };
		const out = resolveAxisValues(members, source, ctx);
		// Targets: b (2x), c (1x)
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(2);
		expect(out.get("c")).toBe(1);
	});

	it("computes BFS depth for SOURCE_METRIC=bfs-depth from highest-degree root", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c")];
		const ctx = makeCtx({
			degrees: new Map([
				["a", 2],
				["b", 1],
				["c", 1],
			]),
			edges: [makeEdge("a", "b"), makeEdge("a", "c")],
		});
		const source: AxisSource = { kind: SOURCE_METRIC, metric: "bfs-depth" };
		const out = resolveAxisValues(members, source, ctx);
		// Root=a (deg 2); a=0, b=1, c=1
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(1);
		expect(out.get("c")).toBe(1);
	});

	it("falls back to sequential indices when SOURCE_HOP root pattern not found", () => {
		const members = [makeNode("a"), makeNode("b")];
		const source: AxisSource = { kind: SOURCE_HOP, from: "nonexistent" };
		const out = resolveAxisValues(members, source, makeCtx());
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(1);
	});

	it("computes BFS distance for SOURCE_HOP from matching root", () => {
		const members = [makeNode("root"), makeNode("b"), makeNode("c")];
		const ctx = makeCtx({ edges: [makeEdge("root", "b"), makeEdge("b", "c")] });
		const source: AxisSource = { kind: SOURCE_HOP, from: "root" };
		const out = resolveAxisValues(members, source, ctx);
		expect(out.get("root")).toBe(0);
		expect(out.get("b")).toBe(1);
		expect(out.get("c")).toBe(2);
	});

	it("clamps SOURCE_HOP at maxDepth, assigning fallback to unreachable nodes", () => {
		const members = [makeNode("root"), makeNode("b"), makeNode("c"), makeNode("d")];
		const ctx = makeCtx({ edges: [makeEdge("root", "b"), makeEdge("b", "c"), makeEdge("c", "d")] });
		const source: AxisSource = { kind: SOURCE_HOP, from: "root", maxDepth: 1 };
		const out = resolveAxisValues(members, source, ctx);
		expect(out.get("root")).toBe(0);
		expect(out.get("b")).toBe(1);
		// c, d unreachable due to maxDepth → max(depth)+1 = 2
		expect(out.get("c")).toBe(2);
		expect(out.get("d")).toBe(2);
	});

	it("returns deterministic values for SOURCE_RANDOM with same seed", () => {
		const members = [makeNode("a"), makeNode("b")];
		const source: AxisSource = { kind: SOURCE_RANDOM, seed: 42 };
		const out1 = resolveAxisValues(members, source, makeCtx());
		const out2 = resolveAxisValues(members, source, makeCtx());
		expect(out1.get("a")).toBe(out2.get("a"));
		expect(out1.get("b")).toBe(out2.get("b"));
		// Values are in [0, 1)
		expect(out1.get("a")).toBeGreaterThanOrEqual(0);
		expect(out1.get("a")).toBeLessThan(1);
	});

	it("assigns same constant to all nodes for SOURCE_CONST", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c")];
		const source: AxisSource = { kind: SOURCE_CONST, value: 7.5 };
		const out = resolveAxisValues(members, source, makeCtx());
		expect(out.get("a")).toBe(7.5);
		expect(out.get("b")).toBe(7.5);
		expect(out.get("c")).toBe(7.5);
	});
});

// ---------------------------------------------------------------------------
// applyTransform
// ---------------------------------------------------------------------------

describe("applyTransform", () => {
	it("returns empty map for empty input", () => {
		const out = applyTransform(new Map(), { kind: TRANSFORM_LINEAR, scale: 1 }, 10);
		expect(out.size).toBe(0);
	});

	it("scales values for TRANSFORM_LINEAR", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_LINEAR, scale: 3 }, 10);
		// linear: v * scale * spacing = 1 * 3 * 10 = 30
		expect(out.get("a")).toBe(30);
		expect(out.get("b")).toBe(60);
	});

	it("buckets values for TRANSFORM_BIN with (bin+1)*spacing positioning", () => {
		const raw = new Map([
			["a", 0],
			["b", 5],
			["c", 10],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_BIN, count: 2 }, 10);
		// min=0, max=10, range=10, binCount=2
		// a: floor(0/10*2)=0 → (0+1)*10 = 10
		// b: floor(5/10*2)=1 → (1+1)*10 = 20
		// c: floor(10/10*2)=2 → clamped to binCount-1=1 → (1+1)*10 = 20
		expect(out.get("a")).toBe(10);
		expect(out.get("b")).toBe(20);
		expect(out.get("c")).toBe(20);
	});

	it("clamps TRANSFORM_BIN count to minimum of 1", () => {
		const raw = new Map([
			["a", 0],
			["b", 100],
		]);
		// count=0 should be clamped to 1
		const out = applyTransform(raw, { kind: TRANSFORM_BIN, count: 0 }, 5);
		// All in single bin → both at (0+1)*5 = 5
		expect(out.get("a")).toBe(5);
		expect(out.get("b")).toBe(5);
	});

	it("orders nodes by raw value for TRANSFORM_DATE_INDEX", () => {
		const raw = new Map([
			["c", 30],
			["a", 10],
			["b", 20],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_DATE_INDEX }, 10);
		// Sorted: a, b, c → indices 0, 1, 2 → 0, 10, 20
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(10);
		expect(out.get("c")).toBe(20);
	});

	it("multiplies by golden angle for TRANSFORM_GOLDEN", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_GOLDEN }, 10);
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBeCloseTo(LAYOUT_GOLDEN_ANGLE, 10);
		expect(out.get("c")).toBeCloseTo(LAYOUT_GOLDEN_ANGLE * 2, 10);
	});

	it("distributes nodes evenly across totalRange for TRANSFORM_EVEN_DIVIDE (no other axis)", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
			["c", 2],
		]);
		// 360 deg = 2π; max=2 → divisor = 3; values = (v/3) * 2π
		const out = applyTransform(raw, { kind: TRANSFORM_EVEN_DIVIDE, totalRange: 360 }, 1);
		expect(out.get("a")).toBeCloseTo(0, 5);
		expect(out.get("b")).toBeCloseTo((1 / 3) * 2 * Math.PI, 5);
		expect(out.get("c")).toBeCloseTo((2 / 3) * 2 * Math.PI, 5);
	});

	it("distributes per-ring for TRANSFORM_EVEN_DIVIDE with otherAxisValues", () => {
		const raw = new Map([
			["a", 0],
			["b", 0],
			["c", 0],
			["d", 0],
		]);
		// Two rings: [a,b] in ring 0, [c,d] in ring 1
		const other = new Map([
			["a", 100],
			["b", 100],
			["c", 200],
			["d", 200],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_EVEN_DIVIDE, totalRange: 360 }, 1, other);
		// Per ring: 2 nodes → angles (0, π)
		expect(out.get("a")).toBeCloseTo(0, 5);
		expect(out.get("b")).toBeCloseTo(Math.PI, 5);
		expect(out.get("c")).toBeCloseTo(0, 5);
		expect(out.get("d")).toBeCloseTo(Math.PI, 5);
	});

	it("falls back to linear spacing for TRANSFORM_STACK_AVOID without otherAxisValues", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_STACK_AVOID }, 10);
		// fallback: v * spacing
		expect(out.get("a")).toBe(10);
		expect(out.get("b")).toBe(20);
	});

	it("groups same-column nodes vertically for TRANSFORM_STACK_AVOID", () => {
		const raw = new Map([
			["a", 0],
			["b", 0],
			["c", 0],
		]);
		// All in same column (other-axis bin)
		const other = new Map([
			["a", 0],
			["b", 0],
			["c", 0],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_STACK_AVOID }, 10, other);
		// 3 nodes centered: offsets -1, 0, 1 → -10, 0, 10
		expect(out.get("a")).toBe(-10);
		expect(out.get("b")).toBe(0);
		expect(out.get("c")).toBe(10);
	});

	it("falls back to linear when TRANSFORM_CURVE references unknown curve", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
		]);
		const out = applyTransform(
			raw,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			{ kind: TRANSFORM_CURVE, curve: "nonexistent" as any },
			10,
		);
		// Fallback: v * spacing
		expect(out.get("a")).toBe(10);
		expect(out.get("b")).toBe(20);
	});

	it("applies a registered TRANSFORM_CURVE (archimedean spiral)", () => {
		const raw = new Map([
			["a", 0],
			["b", 1],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_CURVE, curve: "archimedean" }, 10);
		// Should produce two distinct numeric values
		expect(out.get("a")).toBeTypeOf("number");
		expect(out.get("b")).toBeTypeOf("number");
		expect(Number.isFinite(out.get("a")!)).toBe(true);
		expect(Number.isFinite(out.get("b")!)).toBe(true);
	});

	it("falls back to linear on invalid TRANSFORM_EXPRESSION", () => {
		const raw = new Map([
			["a", 1],
			["b", 2],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_EXPRESSION, expr: "@@@invalid@@@" }, 10);
		// Invalid → fallback v * spacing
		expect(out.get("a")).toBe(10);
		expect(out.get("b")).toBe(20);
	});

	it("evaluates a valid TRANSFORM_EXPRESSION using normalized t", () => {
		const raw = new Map([
			["a", 0],
			["b", 10],
		]);
		// expr "t" → normalized t in [0, 1]
		const out = applyTransform(raw, { kind: TRANSFORM_EXPRESSION, expr: "t" }, 100);
		// a: t=0 → 0; b: t=1 → 1 * 1 (default scale) * 100 = 100
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(100);
	});

	it("returns x-coords for TRANSFORM_SHAPE_FILL with axis=1 (square)", () => {
		const raw = new Map([
			["a", 0],
			["b", 0],
			["c", 0],
			["d", 0],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_SHAPE_FILL, shape: SHAPE_FILL_SQUARE, axis: 1 }, 10);
		// Square fill: 4 nodes in 2x2 grid → cols=2, rows=2; cx=0.5, cy=0.5
		// a: col 0, row 0 → x = (0-0.5)*10 = -5
		// b: col 1, row 0 → x = (1-0.5)*10 = 5
		expect(out.get("a")).toBe(-5);
		expect(out.get("b")).toBe(5);
	});

	it("returns y-coords for TRANSFORM_SHAPE_FILL with axis=2", () => {
		const raw = new Map([
			["a", 0],
			["b", 0],
			["c", 0],
			["d", 0],
		]);
		const out = applyTransform(raw, { kind: TRANSFORM_SHAPE_FILL, shape: SHAPE_FILL_SQUARE, axis: 2 }, 10);
		// Square: 2x2 grid; row 0 → y = -5; row 1 → y = 5
		expect(out.get("a")).toBe(-5);
		expect(out.get("c")).toBe(5);
	});

	it("handles single-node TRANSFORM_SHAPE_FILL for each shape", () => {
		const raw = new Map([["a", 0]]);
		for (const shape of [
			SHAPE_FILL_SQUARE,
			SHAPE_FILL_TRIANGLE,
			SHAPE_FILL_HEXAGON,
			SHAPE_FILL_DIAMOND,
			SHAPE_FILL_CIRCLE,
		] as const) {
			const out = applyTransform(raw, { kind: TRANSFORM_SHAPE_FILL, shape, axis: 1 }, 10);
			expect(out.size).toBe(1);
			expect(Number.isFinite(out.get("a")!)).toBe(true);
		}
	});

	it("places hexagon center node at origin (single node)", () => {
		const raw = new Map([["a", 0]]);
		const out = applyTransform(raw, { kind: TRANSFORM_SHAPE_FILL, shape: SHAPE_FILL_HEXAGON, axis: 1 }, 10);
		expect(out.get("a")).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// resolveAxisCategories
// ---------------------------------------------------------------------------

describe("resolveAxisCategories", () => {
	it("returns undefined for empty members (field source)", () => {
		const out = resolveAxisCategories([], { kind: SOURCE_FIELD, field: "category" }, makeCtx());
		expect(out).toBeUndefined();
	});

	it("returns undefined when all field values are numeric", () => {
		const members = [makeNode("a", { meta: { score: "10" } }), makeNode("b", { meta: { score: "20" } })];
		const out = resolveAxisCategories(members, { kind: SOURCE_FIELD, field: "score" }, makeCtx());
		expect(out).toBeUndefined();
	});

	it("returns sorted unique categories for non-numeric field values", () => {
		const members = [
			makeNode("a", { category: "zebra" }),
			makeNode("b", { category: "apple" }),
			makeNode("c", { category: "apple" }), // duplicate
		];
		const out = resolveAxisCategories(members, { kind: SOURCE_FIELD, field: "category" }, makeCtx());
		expect(out).toEqual(["apple", "zebra"]);
	});

	it("returns sorted unique categories for SOURCE_PROPERTY", () => {
		const members = [
			makeNode("a", { meta: { region: "east" } }),
			makeNode("b", { meta: { region: "west" } }),
			makeNode("c", { meta: { region: "east" } }),
		];
		const out = resolveAxisCategories(members, { kind: SOURCE_PROPERTY, key: "region" }, makeCtx());
		expect(out).toEqual(["east", "west"]);
	});

	it("returns undefined for non-field/property sources (e.g. index)", () => {
		const members = [makeNode("a"), makeNode("b")];
		// SOURCE_INDEX has no raw entries → empty entries → undefined
		const out = resolveAxisCategories(members, { kind: SOURCE_INDEX }, makeCtx());
		expect(out).toBeUndefined();
	});
});
