import { describe, it, expect } from "vitest";
import { coordinateOffsets, type CoordinateContext } from "../src/layouts/coordinate-engine";
import type { GraphNode, GraphEdge, CoordinateLayout } from "../src/types";

// =========================================================================
// Helpers
// =========================================================================

function makeNode(id: string, meta?: Record<string, unknown>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, meta };
}

function makeEdge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target };
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

/** Build a minimal layout that lets us focus on grid config */
function makeLayout(overrides: Partial<CoordinateLayout> = {}): CoordinateLayout {
	return {
		system: "cartesian",
		axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
		axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
		perGroup: true,
		...overrides,
	};
}

// =========================================================================
// resolveGridLinePositions — kind="count"
// =========================================================================
describe("grid positions: count", () => {
	const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
	const ctx = baseCtx();

	it("produces n+1 line positions across the transformed range", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "count", n: 4 },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		expect(result.guide?.gridInfo?.axis1Lines.length).toBe(5);
	});

	it("clamps n=0 to 1 (so divisor is non-zero)", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "count", n: 0 },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		// n=0 → max(0, 1) = 1 → 2 line positions
		expect(result.guide?.gridInfo?.axis1Lines.length).toBe(2);
	});
});

// =========================================================================
// resolveGridLinePositions — kind="step"
// =========================================================================
describe("grid positions: step", () => {
	const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d"), makeNode("e")];
	const ctx = baseCtx();

	it("emits lines from tMin to tMax in fixed steps", () => {
		// transformed values for index source with linear scale=1 and spacing=8*2*3=48
		// → 0, 48, 96, 144, 192, but centroid-shifted so range is symmetric around 0
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "step", step: 50 },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		expect(lines.length).toBeGreaterThanOrEqual(2);
		// Lines should be approximately step=50 apart
		const diffs = lines.slice(1).map((l, i) => l.position - lines[i].position);
		for (const d of diffs) expect(d).toBeCloseTo(50, 0);
	});

	it("treats step=0 as step=1 fallback", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "step", step: 0 },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		expect(lines.length).toBeGreaterThanOrEqual(2);
	});

	it("uses absolute value of step (negative step works)", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "step", step: -50 },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		expect(lines.length).toBeGreaterThanOrEqual(2);
	});
});

// =========================================================================
// resolveGridLinePositions — kind="values"
// =========================================================================
describe("grid positions: values", () => {
	const nodes = [makeNode("a"), makeNode("b")];
	const ctx = baseCtx();

	it("uses explicit values list verbatim", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [10, 20, 30] },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		expect(lines.length).toBe(3);
		// Cartesian centroid shift may apply — but relative differences preserved
		const diffs = lines.slice(1).map((l, i) => l.position - lines[i].position);
		expect(diffs[0]).toBeCloseTo(10, 5);
		expect(diffs[1]).toBeCloseTo(10, 5);
	});

	it("empty values produces no lines", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [] },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		expect(result.guide?.gridInfo?.axis1Lines.length).toBe(0);
	});
});

// =========================================================================
// resolveGridLinePositions — kind="field" / "property"
// =========================================================================
describe("grid positions: field/property → category positions", () => {
	const nodes = [
		makeNode("a", { type: "alpha" }),
		makeNode("b", { type: "beta" }),
		makeNode("c", { type: "alpha" }),
		makeNode("d", { type: "gamma" }),
	];

	it("field: produces one line per unique category", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "property", key: "type" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, baseCtx());
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// 3 unique categories: alpha, beta, gamma
		expect(lines.length).toBe(3);
		// Auto labels should be category names
		const labels = lines.map((l) => l.label).filter((l): l is string => l !== undefined);
		expect(labels.sort()).toEqual(["alpha", "beta", "gamma"]);
	});

	it("table style: produces N+1 boundary lines for N categories", () => {
		const layout = makeLayout({
			grid: {
				style: "table",
				axis1Grid: {
					positions: { kind: "property", key: "type" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, baseCtx());
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// 3 categories → 4 boundaries
		expect(lines.length).toBe(4);
	});

	it("table style with single category uses spacing/2 for boundary half-width", () => {
		const oneCat = [makeNode("a", { type: "only" }), makeNode("b", { type: "only" })];
		const layout = makeLayout({
			grid: {
				style: "table",
				axis1Grid: {
					positions: { kind: "property", key: "type" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(oneCat, new Map(), [], layout, baseCtx());
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// 1 category → 2 boundaries (left + right wall)
		expect(lines.length).toBe(2);
		// Width = spacing = nodeSize*2*max(spacing,scale) = 8*2*3 = 48
		// halfFirst = halfLast = spacing/2 = 24, so total = 48
		const width = lines[1].position - lines[0].position;
		expect(width).toBeCloseTo(48, 0);
	});

	it("uses ctx.getNodeProperty when provided (overrides meta)", () => {
		const propMap = new Map([
			["a", "X"],
			["b", "Y"],
			["c", "X"],
		]);
		const ctx = baseCtx({
			getNodeProperty: (id, key) => (key === "category" ? propMap.get(id) : undefined),
		});
		const ns = [makeNode("a"), makeNode("b"), makeNode("c")];
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "property", key: "category" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(ns, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// 2 unique values from getNodeProperty: X, Y
		expect(lines.length).toBe(2);
	});

	it("field kind: built-in 'id' field categorises by node id", () => {
		const ns = [makeNode("a"), makeNode("b"), makeNode("c")];
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "field", field: "id" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(ns, new Map(), [], layout, baseCtx());
		// 3 unique ids → 3 lines (one per category)
		expect(result.guide?.gridInfo?.axis1Lines.length).toBe(3);
	});
});

// =========================================================================
// resolveGridLinePositions — kind="expression"
// =========================================================================
describe("grid positions: expression", () => {
	const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
	const ctx = baseCtx();

	it("samples valid expression at LAYOUT_GRID_EXPR_SAMPLES+1 points", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "expression", expr: "t" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// 21 sample points → unique sorted positions
		expect(lines.length).toBeGreaterThan(1);
		// Lines should be sorted ascending after centroid shift
		for (let i = 1; i < lines.length; i++) {
			expect(lines[i].position).toBeGreaterThanOrEqual(lines[i - 1].position);
		}
	});

	it("invalid expression falls back to coordinateGridDivisions", () => {
		const ctxDiv = baseCtx({ coordinateGridDivisions: 5 });
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "expression", expr: "this is not valid !!!" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctxDiv);
		// Fallback: divs+1 lines
		expect(result.guide?.gridInfo?.axis1Lines.length).toBe(6);
	});

	it("constant expression t produces deduplicated identical samples", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "expression", expr: "0" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		// All samples = 0 → deduplicated to a single line
		expect(result.guide?.gridInfo?.axis1Lines.length).toBe(1);
	});
});

// =========================================================================
// resolveGridLineLabels — non-auto sources
// =========================================================================
describe("grid labels", () => {
	const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
	const ctx = baseCtx();

	it("kind=custom: applies user-provided labels in order", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [0, 10, 20] },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "custom", values: ["low", "mid", "high"] } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		expect(lines.length).toBe(3);
		expect(lines.map((l) => l.label)).toEqual(["low", "mid", "high"]);
	});

	it("kind=field: pulls categorical labels from the named field", () => {
		const ns = [makeNode("a", { tier: "S" }), makeNode("b", { tier: "A" }), makeNode("c", { tier: "B" })];
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [0, 10, 20] },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "field", field: "tier" } },
				},
			},
		});
		const result = coordinateOffsets(ns, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// Sorted unique tier values: A, B, S
		expect(lines.map((l) => l.label).sort()).toEqual(["A", "B", "S"]);
	});

	it("ticks.show=false suppresses labels (label undefined)", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [0, 10, 20] },
					shape: { kind: "line" },
					ticks: { show: false, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		expect(lines.length).toBe(3);
		for (const l of lines) {
			expect(l.label).toBeUndefined();
		}
	});

	it("kind=field with numeric field falls back to formatted positions", () => {
		// Numeric field returns undefined cats → labels stay as autoLabels (from positions)
		const ns = [makeNode("a", { score: 1 }), makeNode("b", { score: 2 })];
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [0, 5, 10] },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "field", field: "score" } },
				},
			},
		});
		const result = coordinateOffsets(ns, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// Field had numeric values → cats=undefined → fallback formats positions
		expect(lines.length).toBe(3);
		for (const l of lines) expect(l.label).toBeDefined();
	});
});

// =========================================================================
// Cartesian centroid shift extends bounds
// =========================================================================
describe("cartesian centroid shift", () => {
	const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
	const ctx = baseCtx();

	it("explicit grid values get centroid-shifted toward the data centroid", () => {
		// With cartesian + offsets > 0, grid lines are shifted by the data centroid
		// so they align with the actual node positions.
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [0, 100] },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const lines = result.guide?.gridInfo?.axis1Lines ?? [];
		// Distance between the two values is preserved
		expect(lines[1].position - lines[0].position).toBeCloseTo(100, 5);
	});

	it("guide.bounds is extended to include grid lines outside data range", () => {
		// Place a grid line far outside the data range
		const layout = makeLayout({
			grid: {
				style: "lines",
				axis1Grid: {
					positions: { kind: "values", values: [-10000, 10000] },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const b = result.guide?.bounds;
		expect(b).toBeDefined();
		// Bounds should now include the extreme grid line positions
		expect(b!.xMin).toBeLessThan(-1000);
		expect(b!.xMax).toBeGreaterThan(1000);
	});
});

// =========================================================================
// gridInfo defaults
// =========================================================================
describe("gridInfo default config", () => {
	const nodes = [makeNode("a"), makeNode("b")];
	const ctx = baseCtx();

	it("layout without grid still emits gridInfo with default 'lines' style", () => {
		const layout = makeLayout(); // no grid override
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		// gridInfo defaults to style="lines" with auto positions
		expect(result.guide?.gridInfo).toBeDefined();
		expect(result.guide?.gridInfo?.style).toBe("lines");
		expect(result.guide?.gridInfo?.cellShading).toBe(false);
	});

	it("polar layout uses 'circle' shape for axis1 and 'radial' for axis2 by default", () => {
		const layout = makeLayout({ system: "polar" });
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		const gi = result.guide?.gridInfo;
		expect(gi).toBeDefined();
		expect(gi?.axis1Shape.kind).toBe("circle");
		expect(gi?.axis2Shape.kind).toBe("radial");
	});

	it("explicit cellShading=true is preserved", () => {
		const layout = makeLayout({
			grid: {
				style: "lines",
				cellShading: true,
				axis1Grid: {
					positions: { kind: "auto" },
					shape: { kind: "line" },
					ticks: { show: true, labels: { kind: "auto" } },
				},
			},
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, ctx);
		expect(result.guide?.gridInfo?.cellShading).toBe(true);
	});
});

// =========================================================================
// applyTransform via coordinateOffsets — axis1 stack-avoid path
// =========================================================================
describe("axis1 stack-avoid uses axis2 values", () => {
	it("stack-avoid on axis1 receives transformed axis2 values for binning", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		// All nodes share index source on axis1 → transformed values 0,1,2,3
		// stack-avoid on axis1 uses axis2 values (also index) for bin keys.
		// Each node has unique axis2 value → each is in its own bin → linear-like spread.
		const layout = makeLayout({
			axis1: { source: { kind: "index" }, transform: { kind: "stack-avoid" } },
			axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
		});
		const result = coordinateOffsets(nodes, new Map(), [], layout, baseCtx());
		expect(result.offsets.size).toBe(4);
		// All nodes should have finite coordinates
		for (const { dx, dy } of result.offsets.values()) {
			expect(Number.isFinite(dx)).toBe(true);
			expect(Number.isFinite(dy)).toBe(true);
		}
	});
});
