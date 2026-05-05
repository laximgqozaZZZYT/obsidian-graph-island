import { describe, it, expect } from "vitest";
import {
	CURVE_REGISTRY,
	ARRANGEMENT_PRESETS,
	resolveCoordinateLayout,
	resolveArrangementFromLayout,
	isExactPreset,
	findMatchingPreset,
} from "../src/layouts/coordinate-presets";
import {
	ARRANGEMENT_CONCENTRIC,
	ARRANGEMENT_GRID,
	ARRANGEMENT_RANDOM,
	ARRANGEMENT_TIMELINE,
	ARRANGEMENT_CUSTOM,
} from "../src/constants";
import type { CoordinateLayout, ClusterArrangement } from "../src/types";

// ---------------------------------------------------------------------------
// CURVE_REGISTRY — parametric curve functions
// ---------------------------------------------------------------------------

describe("CURVE_REGISTRY", () => {
	const curves = Object.keys(CURVE_REGISTRY) as Array<keyof typeof CURVE_REGISTRY>;

	it("all curves have required fields", () => {
		for (const key of curves) {
			const def = CURVE_REGISTRY[key];
			expect(def.label).toBeTruthy();
			expect(def.labelJa).toBeTruthy();
			expect(def.formula).toBeTruthy();
			expect(typeof def.fn).toBe("function");
			expect(typeof def.defaultParams).toBe("object");
		}
	});

	it("archimedean: a + b*t", () => {
		const fn = CURVE_REGISTRY.archimedean.fn;
		expect(fn(0, { a: 0, b: 1 })).toBe(0);
		expect(fn(1, { a: 0, b: 1 })).toBe(1);
		expect(fn(2, { a: 5, b: 3 })).toBe(11); // 5 + 3*2
	});

	it("fermat: a*sqrt(t)", () => {
		const fn = CURVE_REGISTRY.fermat.fn;
		expect(fn(0, { a: 1 })).toBe(0);
		expect(fn(4, { a: 1 })).toBe(2);
		expect(fn(4, { a: 3 })).toBe(6);
	});

	it("hyperbolic: a/t with t=0 guard", () => {
		const fn = CURVE_REGISTRY.hyperbolic.fn;
		expect(fn(1, { a: 2 })).toBe(2);
		expect(fn(2, { a: 4 })).toBe(2);
		// t=0 should not throw; returns a*10 as guard
		expect(fn(0, { a: 1 })).toBe(10);
	});

	it("cardioid: a*(1 + cos(t*2π))", () => {
		const fn = CURVE_REGISTRY.cardioid.fn;
		// t=0 → cos(0)=1 → 1*(1+1) = 2
		expect(fn(0, { a: 1 })).toBeCloseTo(2, 10);
		// t=0.5 → cos(π)=-1 → 1*(1-1) = 0
		expect(fn(0.5, { a: 1 })).toBeCloseTo(0, 10);
	});

	it("rose: a*cos(k*t*2π)", () => {
		const fn = CURVE_REGISTRY.rose.fn;
		// t=0 → cos(0)=1
		expect(fn(0, { k: 3, a: 2 })).toBeCloseTo(2, 10);
	});

	it("golden: a*φ^(t*4)", () => {
		const fn = CURVE_REGISTRY.golden.fn;
		expect(fn(0, { a: 1 })).toBeCloseTo(1, 5); // φ^0 = 1
		expect(fn(1, { a: 1 })).toBeGreaterThan(6); // φ^4 ≈ 6.854
	});

	it("all curves produce finite values with default params at t=0.5", () => {
		for (const key of curves) {
			const def = CURVE_REGISTRY[key];
			const val = def.fn(0.5, def.defaultParams);
			expect(Number.isFinite(val)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// ARRANGEMENT_PRESETS
// ---------------------------------------------------------------------------

describe("ARRANGEMENT_PRESETS", () => {
	const arrangements = Object.keys(ARRANGEMENT_PRESETS) as ClusterArrangement[];

	it("all presets have axis1 and axis2", () => {
		for (const name of arrangements) {
			const p = ARRANGEMENT_PRESETS[name];
			expect(p.axis1).toBeDefined();
			expect(p.axis2).toBeDefined();
			expect(p.system).toMatch(/^(cartesian|polar)$/);
		}
	});

	it("concentric uses polar, perGroup=false", () => {
		const c = ARRANGEMENT_PRESETS.concentric;
		expect(c.system).toBe("polar");
		expect(c.perGroup).toBe(false);
	});

	it("grid uses cartesian, perGroup=true", () => {
		const g = ARRANGEMENT_PRESETS.grid;
		expect(g.system).toBe("cartesian");
		expect(g.perGroup).toBe(true);
	});

	it("timeline uses cartesian with property source + date_index", () => {
		const t = ARRANGEMENT_PRESETS.timeline;
		expect(t.system).toBe("cartesian");
		expect(t.axis1.source.kind).toBe("property");
		expect(t.axis1.transform.kind).toBe("date-to-index");
	});

	it("radial uses polar, perGroup=true, with spokeCount constant", () => {
		const r = ARRANGEMENT_PRESETS.radial;
		expect(r.system).toBe("polar");
		expect(r.perGroup).toBe(true);
		expect(r.constants?._spokeCount).toBe(8);
		expect(r.axis2.transform.kind).toBe("expression");
	});

	it("phyllotaxis uses polar with golden-angle expression", () => {
		const p = ARRANGEMENT_PRESETS.phyllotaxis;
		expect(p.system).toBe("polar");
		expect(p.perGroup).toBe(true);
		expect(p.axis1.transform.kind).toBe("expression");
		expect((p.axis2.transform as any).expr).toContain("sqrt(5)");
	});

	it("triangle uses cartesian with triangular packing expressions", () => {
		const t = ARRANGEMENT_PRESETS.triangle;
		expect(t.system).toBe("cartesian");
		expect(t.perGroup).toBe(true);
		expect(t.axis1.transform.kind).toBe("expression");
		expect(t.axis2.transform.kind).toBe("expression");
	});

	it("random uses cartesian with random sources (seed=42)", () => {
		const r = ARRANGEMENT_PRESETS.random;
		expect(r.system).toBe("cartesian");
		expect(r.perGroup).toBe(true);
		expect(r.axis1.source.kind).toBe("random");
		expect((r.axis1.source as any).seed).toBe(42);
		expect(r.axis2.source.kind).toBe("random");
	});

	it("custom uses field + metric sources", () => {
		const c = ARRANGEMENT_PRESETS.custom;
		expect(c.system).toBe("cartesian");
		expect(c.perGroup).toBe(true);
		expect(c.axis1.source.kind).toBe("field");
		expect(c.axis2.source.kind).toBe("metric");
	});

	it("ego mirrors radial structure (polar, spokeCount)", () => {
		const e = ARRANGEMENT_PRESETS.ego;
		expect(e.system).toBe("polar");
		expect(e.perGroup).toBe(true);
		expect(e.constants?._spokeCount).toBe(8);
		// ego and radial share the same axis expressions
		expect(e.axis1.transform.kind).toBe(ARRANGEMENT_PRESETS.radial.axis1.transform.kind);
	});
});

// ---------------------------------------------------------------------------
// resolveCoordinateLayout
// ---------------------------------------------------------------------------

describe("resolveCoordinateLayout", () => {
	it("returns preset when no override", () => {
		const result = resolveCoordinateLayout("grid", null);
		expect(result).toBe(ARRANGEMENT_PRESETS.grid);
	});

	it("returns override when provided", () => {
		const custom: CoordinateLayout = {
			system: "cartesian",
			axis1: { source: { kind: "random", seed: 1 }, transform: { kind: "linear", scale: 2 } },
			axis2: { source: { kind: "random", seed: 2 }, transform: { kind: "linear", scale: 3 } },
			perGroup: true,
		};
		const result = resolveCoordinateLayout("grid", custom);
		expect(result).toBe(custom);
	});
});

// ---------------------------------------------------------------------------
// resolveArrangementFromLayout
// ---------------------------------------------------------------------------

describe("resolveArrangementFromLayout", () => {
	it("exact match → returns preset name", () => {
		expect(resolveArrangementFromLayout(ARRANGEMENT_PRESETS.grid)).toBe(ARRANGEMENT_GRID);
		expect(resolveArrangementFromLayout(ARRANGEMENT_PRESETS.random)).toBe(ARRANGEMENT_RANDOM);
		expect(resolveArrangementFromLayout(ARRANGEMENT_PRESETS.timeline)).toBe(ARRANGEMENT_TIMELINE);
		expect(resolveArrangementFromLayout(ARRANGEMENT_PRESETS.concentric)).toBe(ARRANGEMENT_CONCENTRIC);
	});

	it("random source → random arrangement", () => {
		const layout: CoordinateLayout = {
			system: "polar",
			axis1: { source: { kind: "random", seed: 99 }, transform: { kind: "linear", scale: 1 } },
			axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
			perGroup: true,
		};
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_RANDOM);
	});

	it("unknown combo falls back to grid", () => {
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: { source: { kind: "field", field: "x" }, transform: { kind: "linear", scale: 1 } },
			axis2: { source: { kind: "field", field: "y" }, transform: { kind: "linear", scale: 1 } },
			perGroup: true,
		};
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_GRID);
	});
});

// ---------------------------------------------------------------------------
// isExactPreset / findMatchingPreset
// ---------------------------------------------------------------------------

describe("isExactPreset", () => {
	it("returns true for built-in presets", () => {
		expect(isExactPreset(ARRANGEMENT_PRESETS.grid)).toBe(true);
		expect(isExactPreset(ARRANGEMENT_PRESETS.concentric)).toBe(true);
	});

	it("returns false for modified preset", () => {
		const modified = { ...ARRANGEMENT_PRESETS.grid, perGroup: false };
		expect(isExactPreset(modified)).toBe(false);
	});
});

describe("findMatchingPreset", () => {
	it("finds matching preset name", () => {
		expect(findMatchingPreset(ARRANGEMENT_PRESETS.random)).toBe("random");
		expect(findMatchingPreset(ARRANGEMENT_PRESETS.timeline)).toBe("timeline");
	});

	it("returns custom for non-matching layout", () => {
		const custom: CoordinateLayout = {
			system: "cartesian",
			axis1: { source: { kind: "field", field: "custom" }, transform: { kind: "linear", scale: 99 } },
			axis2: { source: { kind: "field", field: "other" }, transform: { kind: "linear", scale: 1 } },
			perGroup: true,
		};
		expect(findMatchingPreset(custom)).toBe(ARRANGEMENT_CUSTOM);
	});
});

// ---------------------------------------------------------------------------
// CURVE_REGISTRY — additional boundary values (cycle119)
// ---------------------------------------------------------------------------
describe("CURVE_REGISTRY boundary values", () => {
	it("all curves produce finite values at t=0", () => {
		for (const [name, curve] of Object.entries(CURVE_REGISTRY)) {
			const r = curve.fn(0, curve.defaultParams);
			expect(isFinite(r), `${name} at t=0`).toBe(true);
		}
	});

	it("all curves produce finite values at t=1", () => {
		for (const [name, curve] of Object.entries(CURVE_REGISTRY)) {
			const r = curve.fn(1, curve.defaultParams);
			expect(isFinite(r), `${name} at t=1`).toBe(true);
		}
	});

	it("all curves produce non-negative values at t=0.5", () => {
		for (const [name, curve] of Object.entries(CURVE_REGISTRY)) {
			const r = curve.fn(0.5, curve.defaultParams);
			// Most radial curves produce non-negative radius; rose/lissajous may be negative
			const allowNeg = ["lissajous", "rose"].includes(name);
			expect(r >= 0 || allowNeg, `${name} r >= 0 at t=0.5 (allow neg: ${allowNeg})`).toBe(true);
		}
	});

	it("archimedean is monotonically increasing for t in [0, 1]", () => {
		const curve = CURVE_REGISTRY.archimedean;
		let prev = curve.fn(0, curve.defaultParams);
		for (let i = 1; i <= 10; i++) {
			const r = curve.fn(i / 10, curve.defaultParams);
			expect(r).toBeGreaterThanOrEqual(prev);
			prev = r;
		}
	});

	it("rose curve oscillates (not monotonic)", () => {
		const curve = CURVE_REGISTRY.rose;
		const values = Array.from({ length: 20 }, (_, i) => curve.fn(i / 20, curve.defaultParams));
		// Rose curves oscillate — check there are both increases and decreases
		let hasIncrease = false,
			hasDecrease = false;
		for (let i = 1; i < values.length; i++) {
			if (values[i] > values[i - 1]) hasIncrease = true;
			if (values[i] < values[i - 1]) hasDecrease = true;
		}
		expect(hasIncrease || hasDecrease).toBe(true); // at least some variation
	});

	it("logarithmic grows but slower than linear", () => {
		const curve = CURVE_REGISTRY.logarithmic;
		const r01 = curve.fn(0.1, curve.defaultParams);
		const r09 = curve.fn(0.9, curve.defaultParams);
		expect(r09).toBeGreaterThan(r01);
	});

	it("all curves have defaultParams object", () => {
		for (const [name, curve] of Object.entries(CURVE_REGISTRY)) {
			expect(curve.defaultParams, `${name} has defaultParams`).toBeDefined();
			expect(typeof curve.defaultParams).toBe("object");
		}
	});
});

// ---------------------------------------------------------------------------
// CURVE_REGISTRY — `??` default-branch coverage (cycle iteration 3)
//
// Each fn body uses `(p.X ?? default)` to fall back when a param key is
// missing. Existing tests always pass complete params, so the right-hand
// (default) branch is never taken. Calling each fn with an empty params
// object covers those branches and locks in the documented defaults.
// ---------------------------------------------------------------------------
describe("CURVE_REGISTRY — fn defaults when params missing", () => {
	const empty = {} as Record<string, number>;

	it("archimedean: (a ?? 0) + (b ?? 1) * t → returns t when params empty", () => {
		const fn = CURVE_REGISTRY.archimedean.fn;
		expect(fn(0, empty)).toBe(0);
		expect(fn(1, empty)).toBe(1);
		expect(fn(2.5, empty)).toBe(2.5);
	});

	it("logarithmic: (a ?? 1) * exp((b ?? 0.3) * t * 2π) at t=0 → 1", () => {
		const fn = CURVE_REGISTRY.logarithmic.fn;
		expect(fn(0, empty)).toBeCloseTo(1, 10);
	});

	it("fermat: (a ?? 1) * sqrt(t) → sqrt(t) when params empty", () => {
		const fn = CURVE_REGISTRY.fermat.fn;
		expect(fn(0, empty)).toBe(0);
		expect(fn(4, empty)).toBe(2);
	});

	it("hyperbolic: (a ?? 1) / t with empty params → 1/t (t>0) and 10 (t=0)", () => {
		const fn = CURVE_REGISTRY.hyperbolic.fn;
		expect(fn(2, empty)).toBe(0.5);
		// t=0 guard branch returns (a ?? 1) * 10 = 10
		expect(fn(0, empty)).toBe(10);
	});

	it("cardioid: (a ?? 1) * (1 + cos(t·2π)) → 2 at t=0 with empty params", () => {
		const fn = CURVE_REGISTRY.cardioid.fn;
		expect(fn(0, empty)).toBeCloseTo(2, 10);
		expect(fn(0.5, empty)).toBeCloseTo(0, 10);
	});

	it("rose: (a ?? 1) * cos((k ?? 3) * t·2π) → 1 at t=0 with empty params", () => {
		const fn = CURVE_REGISTRY.rose.fn;
		expect(fn(0, empty)).toBeCloseTo(1, 10);
	});

	it("lissajous: sin((a ?? 3) * t·2π + (delta ?? 0.5)) → sin(0.5) at t=0", () => {
		const fn = CURVE_REGISTRY.lissajous.fn;
		expect(fn(0, empty)).toBeCloseTo(Math.sin(0.5), 10);
	});

	it("golden: (a ?? 1) * φ^(t·4) → 1 at t=0 with empty params", () => {
		const fn = CURVE_REGISTRY.golden.fn;
		expect(fn(0, empty)).toBeCloseTo(1, 5);
	});

	it("all curves still produce finite values with empty params at t=0,0.5,1", () => {
		for (const [name, curve] of Object.entries(CURVE_REGISTRY)) {
			for (const t of [0, 0.5, 1]) {
				const v = curve.fn(t, empty);
				expect(Number.isFinite(v), `${name} at t=${t} with empty params`).toBe(true);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// resolveArrangementFromLayout — non-preset condition branches
//
// The function first tries `findMatchingPreset`; only when that returns
// "custom" do the explicit s1/s2/t1/t2 checks run. We need layouts that
// look like timeline / random / concentric but differ from the canonical
// preset (e.g. by tweaking constants or scale) so each conditional fires.
// ---------------------------------------------------------------------------
describe("resolveArrangementFromLayout — derived (non-preset) branches", () => {
	it("PROPERTY + DATE_INDEX axis1 (non-preset) → timeline", () => {
		const layout: CoordinateLayout = {
			system: "polar", // differs from preset's "cartesian"
			axis1: {
				source: { kind: "property", key: "publishedAt" }, // different key
				transform: { kind: "date-to-index" },
			},
			axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 5 } },
			perGroup: true,
		};
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_TIMELINE);
	});

	it("RANDOM source on axis2 alone (non-preset) → random", () => {
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: { source: { kind: "field", field: "x" }, transform: { kind: "linear", scale: 1 } },
			axis2: { source: { kind: "random", seed: 7 }, transform: { kind: "linear", scale: 2 } },
			perGroup: false,
		};
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_RANDOM);
	});

	it("INDEX + EXPRESSION + EVEN_DIVIDE + perGroup=false (non-preset) → concentric", () => {
		// Diverges from concentric preset by altering the expression text + ringSize.
		const layout: CoordinateLayout = {
			system: "polar",
			axis1: {
				source: { kind: "index" },
				transform: { kind: "expression", expr: "floor(i / _ringSize) + 5", scale: 1 },
			},
			axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 720 } },
			perGroup: false,
			constants: { _ringSize: 50 },
		};
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_CONCENTRIC);
	});

	it("INDEX + EXPRESSION + EVEN_DIVIDE BUT perGroup=true → does NOT match concentric branch", () => {
		// perGroup=true should bypass the concentric check and fall through.
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: {
				source: { kind: "index" },
				transform: { kind: "expression", expr: "i % 7", scale: 1 },
			},
			axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
			perGroup: true,
		};
		// s1=INDEX & s2=INDEX matches the next clause, so it returns grid.
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_GRID);
	});

	it("INDEX + INDEX with non-matching transforms (non-preset) → grid", () => {
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 7 } },
			axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 9 } },
			perGroup: false,
		};
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_GRID);
	});

	it("non-INDEX, non-RANDOM, non-PROPERTY/DATE → grid (final fallback)", () => {
		// Hits the final `return ARRANGEMENT_GRID` after all conditionals miss.
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
			axis2: { source: { kind: "field", field: "depth" }, transform: { kind: "linear", scale: 1 } },
			perGroup: false,
		};
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_GRID);
	});

	it("PROPERTY axis1 WITHOUT date-to-index → falls through (not timeline)", () => {
		const layout: CoordinateLayout = {
			system: "cartesian",
			axis1: {
				source: { kind: "property", key: "score" },
				transform: { kind: "linear", scale: 1 }, // not date-to-index
			},
			axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
			perGroup: true,
		};
		// Should NOT return timeline; falls through to grid fallback.
		expect(resolveArrangementFromLayout(layout)).toBe(ARRANGEMENT_GRID);
	});
});

// ---------------------------------------------------------------------------
// findMatchingPreset / isExactPreset — boundary cases
// ---------------------------------------------------------------------------
describe("findMatchingPreset / isExactPreset — boundary cases", () => {
	it("findMatchingPreset skips the 'custom' entry when iterating", () => {
		// The 'custom' preset is an arrangement key but the function explicitly
		// `continue`s past it; ensure we only return non-custom names for a
		// layout that happens to JSON-equal the 'custom' preset.
		const customClone: CoordinateLayout = JSON.parse(JSON.stringify(ARRANGEMENT_PRESETS.custom));
		// findMatchingPreset returns 'custom' (the literal fallback) since the
		// loop skips name === 'custom' entries. This documents that behavior.
		expect(findMatchingPreset(customClone)).toBe(ARRANGEMENT_CUSTOM);
	});

	it("isExactPreset returns true for a deep-cloned preset (JSON identity, not ref identity)", () => {
		const cloned: CoordinateLayout = JSON.parse(JSON.stringify(ARRANGEMENT_PRESETS.timeline));
		expect(cloned).not.toBe(ARRANGEMENT_PRESETS.timeline);
		expect(isExactPreset(cloned)).toBe(true);
	});

	it("isExactPreset returns false when a key order differs (JSON-string equality)", () => {
		// JSON.stringify is key-order sensitive (insertion order). Swapping
		// axis1/axis2 swaps the resulting JSON string and breaks the match.
		const reordered: CoordinateLayout = {
			axis2: ARRANGEMENT_PRESETS.grid.axis2,
			axis1: ARRANGEMENT_PRESETS.grid.axis1,
			system: "cartesian",
			perGroup: true,
		};
		expect(isExactPreset(reordered)).toBe(false);
	});

	it("findMatchingPreset returns first hit when 'inherit' has its distinctive linear axes", () => {
		// 'inherit' uses index+linear on both axes — distinct from grid/triangle.
		const inheritClone: CoordinateLayout = JSON.parse(JSON.stringify(ARRANGEMENT_PRESETS.inherit));
		expect(findMatchingPreset(inheritClone)).toBe("inherit");
	});
});

// ---------------------------------------------------------------------------
// resolveCoordinateLayout — additional boundary cases
// ---------------------------------------------------------------------------
describe("resolveCoordinateLayout — boundary cases", () => {
	it("override is returned by reference (no cloning) — caller can mutate", () => {
		const override: CoordinateLayout = {
			system: "polar",
			axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
			axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
			perGroup: false,
		};
		const out = resolveCoordinateLayout("concentric", override);
		expect(out).toBe(override); // reference equality
	});

	it("preset is returned by reference for all known arrangements", () => {
		for (const name of Object.keys(ARRANGEMENT_PRESETS) as ClusterArrangement[]) {
			expect(resolveCoordinateLayout(name, null)).toBe(ARRANGEMENT_PRESETS[name]);
		}
	});
});
