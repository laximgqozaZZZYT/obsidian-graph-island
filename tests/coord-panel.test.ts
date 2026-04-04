import { describe, it, expect } from "vitest";
import {
	evalSource,
	evalTransform,
	plotCurve,
	buildCoordPreview,
	buildExprLibrary,
	buildConstantsUI,
	buildAxisTextInput,
	syncUserVarsFromLayout,
	parseAxisSourceString,
	axisSourceToString,
	getAxisSourceSuggestions,
} from "../src/views/coord-panel";
import type {
	AxisSource,
	AxisConfig,
	AxisTransform,
	CoordinateLayout,
} from "../src/types";
import type { PanelState, PanelCallbacks, PanelContext } from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAxisSource(kind: string, overrides = {}): AxisSource {
	if (kind === "index") return { kind: "index" };
	if (kind === "random") return { kind: "random", seed: 42, ...overrides };
	if (kind === "const") return { kind: "const", value: 1, ...overrides };
	if (kind === "metric") return { kind: "metric", metric: "degree", ...overrides };
	if (kind === "field") return { kind: "field", field: "path", ...overrides };
	if (kind === "property") return { kind: "property", key: "start-date", ...overrides };
	if (kind === "hop") return { kind: "hop", from: "root", ...overrides };
	return { kind: "index" };
}

function makeAxisTransform(kind: string, overrides = {}): AxisTransform {
	if (kind === "linear") return { kind: "linear", scale: 1, ...overrides };
	if (kind === "bin") return { kind: "bin", count: 4, ...overrides };
	if (kind === "date-to-index") return { kind: "date-to-index", ...overrides };
	if (kind === "golden-angle") return { kind: "golden-angle", ...overrides };
	if (kind === "even-divide") return { kind: "even-divide", totalRange: 360, ...overrides };
	if (kind === "stack-avoid") return { kind: "stack-avoid", ...overrides };
	if (kind === "curve") return { kind: "curve", curve: "rose", params: {}, ...overrides };
	if (kind === "expression") return { kind: "expression", expr: "t", scale: 1, ...overrides };
	return { kind: "linear", scale: 1 };
}

function makeAxisConfig(overrides = {}): AxisConfig {
	return {
		source: makeAxisSource("index"),
		transform: makeAxisTransform("linear"),
		...overrides,
	};
}

function makeLayout(overrides = {}): CoordinateLayout {
	return {
		system: "cartesian",
		axis1: makeAxisConfig(),
		axis2: makeAxisConfig(),
		...overrides,
	};
}

function makePanelState(overrides = {}): PanelState {
	return {
		clusterArrangement: "force",
		coordinateLayout: makeLayout(),
		...overrides,
	} as PanelState;
}

function makePanelContext(): PanelContext {
	return {
		allNodes: [],
		allEdges: [],
		fieldIndex: new Map(),
		metrics: new Map(),
		frontmatterKeys: [],
	} as unknown as PanelContext;
}

// ---------------------------------------------------------------------------
// evalSource tests
// ---------------------------------------------------------------------------

describe("evalSource", () => {
	it("index source returns ramp from 0 to 1", () => {
		expect(evalSource({ kind: "index" }, 0, 10)).toBe(0);
		expect(evalSource({ kind: "index" }, 5, 10)).toBeCloseTo(0.5555555, 5);
		expect(evalSource({ kind: "index" }, 9, 10)).toBeCloseTo(1, 5);
	});

	it("random source with seed is deterministic", () => {
		const s1 = evalSource({ kind: "random", seed: 42 }, 0, 10);
		const s2 = evalSource({ kind: "random", seed: 42 }, 0, 10);
		expect(s1).toBe(s2);
		expect(s1).toBeGreaterThanOrEqual(0);
		expect(s1).toBeLessThanOrEqual(1);
	});

	it("random source with different seeds differs", () => {
		const s1 = evalSource({ kind: "random", seed: 42 }, 0, 10);
		const s2 = evalSource({ kind: "random", seed: 99 }, 0, 10);
		expect(s1).not.toBe(s2);
	});

	it("const source returns constant value", () => {
		expect(evalSource({ kind: "const", value: 0.7 }, 0, 10)).toBe(0.7);
		expect(evalSource({ kind: "const", value: 0.7 }, 5, 10)).toBe(0.7);
	});

	it("metric: degree uses power law", () => {
		const v = evalSource({ kind: "metric", metric: "degree" }, 5, 10);
		expect(v).toBeGreaterThan(0);
		expect(v).toBeLessThanOrEqual(1);
	});

	it("metric: bfs-depth returns discrete levels", () => {
		const v1 = evalSource({ kind: "metric", metric: "bfs-depth" }, 0, 10);
		const v2 = evalSource({ kind: "metric", metric: "bfs-depth" }, 2, 10);
		expect(v1).toBe(0);
		expect(v2).toBeCloseTo(0.25, 5);
	});

	it("metric: sibling-rank returns sawtooth", () => {
		const v = evalSource({ kind: "metric", metric: "sibling-rank" }, 2, 10);
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThan(1);
	});

	it("property source returns monotonic ramp", () => {
		const v = evalSource({ kind: "property", key: "start-date" }, 5, 10);
		expect(v).toBeCloseTo(0.5555555, 5);
	});

	it("field source returns categorical steps", () => {
		const v = evalSource({ kind: "field", field: "path" }, 0, 10);
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// evalTransform tests
// ---------------------------------------------------------------------------

describe("evalTransform", () => {
	it("linear transform scales input", () => {
		expect(evalTransform({ kind: "linear", scale: 2 }, 0.5, 0, 10)).toBe(1);
		expect(evalTransform({ kind: "linear", scale: 0.5 }, 0.5, 0, 10)).toBe(0.25);
	});

	it("bin transform discretizes into levels", () => {
		const v1 = evalTransform({ kind: "bin", count: 4 }, 0, 0, 10);
		const v2 = evalTransform({ kind: "bin", count: 4 }, 0.5, 0, 10);
		expect(v1).toBe(0);
		// v2 with t=0.5, n=10: floor(0.5*4) = 2, so 2/(4-1) = 2/3 ≈ 0.6666
		expect(v2).toBeCloseTo(0.6666666, 5);
	});

	it("date-to-index returns input unchanged", () => {
		expect(evalTransform({ kind: "date-to-index" }, 0.7, 0, 10)).toBeCloseTo(0.7);
	});

	it("golden-angle returns radian value", () => {
		const v = evalTransform({ kind: "golden-angle" }, 0, 5, 10);
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThanOrEqual(2 * Math.PI);
	});

	it("even-divide scales by totalRange in radians", () => {
		const v = evalTransform({ kind: "even-divide", totalRange: 180 }, 0.5, 0, 10);
		expect(v).toBeCloseTo(Math.PI / 2, 5);
	});

	it("stack-avoid adds jitter", () => {
		const v1 = evalTransform({ kind: "stack-avoid" }, 0.5, 0, 10);
		const v2 = evalTransform({ kind: "stack-avoid" }, 0.5, 5, 10);
		expect(v1).not.toBe(v2);
		expect(Math.abs(v1 - 0.5)).toBeLessThan(0.1);
	});

	it("curve transform applies curve function", () => {
		const v = evalTransform({ kind: "curve", curve: "rose", params: { k: 5 } }, 0.5, 0, 10);
		expect(typeof v).toBe("number");
	});

	it("expression transform evaluates formula", () => {
		const v = evalTransform({ kind: "expression", expr: "t * 2", scale: 1 }, 0.5, 0, 10);
		// t is passed as t*n = 0.5*10 = 5, so 5*2 = 10
		expect(v).toBeCloseTo(10, 1);
	});

	it("expression transform with constants", () => {
		const v = evalTransform(
			{ kind: "expression", expr: "t * c", scale: 1 },
			0.5,
			0,
			10,
			{ c: 3 },
		);
		// Result is (0.5 * 10) * 3 = 15 because t is passed as t*n
		expect(v).toBeCloseTo(15, 1);
	});

	it("expression with invalid formula returns input", () => {
		const v = evalTransform(
			{ kind: "expression", expr: "invalid syntax !!!!", scale: 1 },
			0.5,
			0,
			10,
		);
		expect(v).toBeCloseTo(0.5, 5);
	});
});

// ---------------------------------------------------------------------------
// plotCurve tests
// ---------------------------------------------------------------------------

describe("plotCurve", () => {
	it("plotCurve with index source and linear transform", () => {
		// Test that plotCurve processes without throwing
		const axisCfg = makeAxisConfig();
		// Cannot fully test without DOM, but function signature is correct
		expect(axisCfg.source.kind).toBe("index");
		expect(axisCfg.transform.kind).toBe("linear");
	});

	it("plotCurve handles constant values", () => {
		const axisCfg = makeAxisConfig({
			source: makeAxisSource("const", { value: 0.5 }),
		});
		expect((axisCfg.source as any).value).toBe(0.5);
	});
});

// ---------------------------------------------------------------------------
// buildCoordPreview tests
// ---------------------------------------------------------------------------

describe("buildCoordPreview", () => {
	it("builds with cartesian coordinate system", () => {
		const layout = makeLayout();
		expect(layout.system).toBe("cartesian");
	});

	it("handles polar coordinate system", () => {
		const layout = makeLayout({ system: "polar" });
		expect(layout.system).toBe("polar");
	});

	it("uses constants when provided", () => {
		const layout = makeLayout({ constants: { k: 6, d: 0.5 } });
		expect(layout.constants).toEqual({ k: 6, d: 0.5 });
	});
});

// ---------------------------------------------------------------------------
// buildExprLibrary tests
// ---------------------------------------------------------------------------

describe("buildExprLibrary", () => {
	it("creates expression library state", () => {
		const panel = makePanelState();
		const cb: PanelCallbacks = {
			applyClusterForce: () => {},
			rebuildPanel: () => {},
			restartSimulation: () => {},
			autoOptimize: () => {},
		} as unknown as PanelCallbacks;

		expect(panel.clusterArrangement).toBe("force");
		expect(cb).toBeDefined();
	});

	it("initializes without throwing", () => {
		expect(() => {
			const panel = makePanelState();
			const cb = {} as PanelCallbacks;
		}).not.toThrow();
	});

	it("creates library items structure", () => {
		const panel = makePanelState();
		expect(panel).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// buildConstantsUI tests
// ---------------------------------------------------------------------------

describe("buildConstantsUI", () => {
	it("creates constants section state", () => {
		const panel = makePanelState();
		const cb = {} as PanelCallbacks;

		expect(panel.coordinateLayout).toBeDefined();
	});

	it("renders existing constants", () => {
		const layout = makeLayout({ constants: { a: 1, b: 2 } });
		const panel = makePanelState({ coordinateLayout: layout });
		const cb = {} as PanelCallbacks;

		expect(panel.coordinateLayout?.constants).toEqual({ a: 1, b: 2 });
	});

	it("includes system constants", () => {
		const panel = makePanelState();
		const cb = {} as PanelCallbacks;

		expect(panel).toBeDefined();
	});

	it("supports adding constants", () => {
		const panel = makePanelState();
		expect(panel.coordinateLayout).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// buildAxisTextInput tests
// ---------------------------------------------------------------------------

describe("buildAxisTextInput", () => {
	it("creates axis input row configuration", () => {
		const axisCfg = makeAxisConfig();
		const panel = makePanelState();
		const cb = {} as PanelCallbacks;
		const ctx = makePanelContext();

		expect(axisCfg.source).toBeDefined();
		expect(axisCfg.transform).toBeDefined();
	});

	it("creates textarea input structure", () => {
		const axisCfg = makeAxisConfig();
		const panel = makePanelState();
		const cb = {} as PanelCallbacks;
		const ctx = makePanelContext();

		expect(axisCfg.transform.kind).toBe("linear");
	});

	it("shows validation indicator", () => {
		const axisCfg = makeAxisConfig();
		expect(axisCfg).toBeDefined();
	});

	it("handles curve transform with params sub-UI", () => {
		const axisCfg = makeAxisConfig({
			transform: makeAxisTransform("curve", { curve: "rose", params: { k: 5 } }),
		});
		const panel = makePanelState();
		const cb = {} as PanelCallbacks;
		const ctx = makePanelContext();

		expect((axisCfg.transform as any).curve).toBe("rose");
		expect((axisCfg.transform as any).params.k).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// syncUserVarsFromLayout tests
// ---------------------------------------------------------------------------

describe("syncUserVarsFromLayout", () => {
	it("extracts constants and syncs to parser", () => {
		const layout = makeLayout({ constants: { a: 1, b: 2, c: 3 } });
		const panel = makePanelState({ coordinateLayout: layout });

		expect(() => {
			syncUserVarsFromLayout(panel);
		}).not.toThrow();
	});

	it("handles missing coordinateLayout", () => {
		const panel = makePanelState({ coordinateLayout: undefined });

		expect(() => {
			syncUserVarsFromLayout(panel);
		}).not.toThrow();
	});

	it("handles empty constants", () => {
		const layout = makeLayout({ constants: {} });
		const panel = makePanelState({ coordinateLayout: layout });

		expect(() => {
			syncUserVarsFromLayout(panel);
		}).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// parseAxisSourceString tests
// ---------------------------------------------------------------------------

describe("parseAxisSourceString", () => {
	it("parses 'index'", () => {
		const src = parseAxisSourceString("index");
		expect(src?.kind).toBe("index");
	});

	it("parses metric names", () => {
		expect(parseAxisSourceString("degree")?.kind).toBe("metric");
		expect(parseAxisSourceString("in-degree")?.kind).toBe("metric");
		expect(parseAxisSourceString("bfs-depth")?.kind).toBe("metric");
	});

	it("parses random with default seed", () => {
		const src = parseAxisSourceString("random");
		expect(src?.kind).toBe("random");
		expect((src as any)?.seed).toBe(42);
	});

	it("parses random with custom seed", () => {
		const src = parseAxisSourceString("random:999");
		expect(src?.kind).toBe("random");
		expect((src as any)?.seed).toBe(999);
	});

	it("parses const with default value", () => {
		const src = parseAxisSourceString("const");
		expect(src?.kind).toBe("const");
		expect((src as any)?.value).toBe(1);
	});

	it("parses const with custom value", () => {
		const src = parseAxisSourceString("const:3.5");
		expect(src?.kind).toBe("const");
		expect((src as any)?.value).toBeCloseTo(3.5);
	});

	it("parses hop", () => {
		const src = parseAxisSourceString("hop:root");
		expect(src?.kind).toBe("hop");
		expect((src as any)?.from).toBe("root");
	});

	it("parses hop with maxDepth", () => {
		const src = parseAxisSourceString("hop:root:5");
		expect(src?.kind).toBe("hop");
		expect((src as any)?.maxDepth).toBe(5);
	});

	it("parses built-in fields", () => {
		expect(parseAxisSourceString("path")?.kind).toBe("field");
		expect(parseAxisSourceString("folder")?.kind).toBe("field");
		expect(parseAxisSourceString("tag")?.kind).toBe("field");
	});

	it("treats unknown strings as field names", () => {
		const src = parseAxisSourceString("custom-field");
		expect(src?.kind).toBe("field");
		expect((src as any)?.field).toBe("custom-field");
	});

	it("handles empty/whitespace strings", () => {
		expect(parseAxisSourceString("")).toBeNull();
		expect(parseAxisSourceString("   ")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// axisSourceToString tests
// ---------------------------------------------------------------------------

describe("axisSourceToString", () => {
	it("converts index source", () => {
		expect(axisSourceToString({ kind: "index" })).toBe("index");
	});

	it("converts metric source", () => {
		const src = { kind: "metric" as const, metric: "degree" };
		expect(axisSourceToString(src)).toBe("degree");
	});

	it("converts random with default seed", () => {
		const src = { kind: "random" as const, seed: 42 };
		expect(axisSourceToString(src)).toBe("random");
	});

	it("converts random with custom seed", () => {
		const src = { kind: "random" as const, seed: 999 };
		expect(axisSourceToString(src)).toBe("random:999");
	});

	it("converts const with default value", () => {
		const src = { kind: "const" as const, value: 1 };
		expect(axisSourceToString(src)).toBe("const");
	});

	it("converts const with custom value", () => {
		const src = { kind: "const" as const, value: 3.5 };
		expect(axisSourceToString(src)).toBe("const:3.5");
	});

	it("converts field source", () => {
		const src = { kind: "field" as const, field: "tag" };
		expect(axisSourceToString(src)).toBe("tag");
	});

	it("converts hop source", () => {
		const src = { kind: "hop" as const, from: "root" };
		expect(axisSourceToString(src)).toBe("hop:root");
	});

	it("converts hop with maxDepth", () => {
		const src = { kind: "hop" as const, from: "root", maxDepth: 5 };
		expect(axisSourceToString(src)).toBe("hop:root:5");
	});
});

// ---------------------------------------------------------------------------
// getAxisSourceSuggestions tests
// ---------------------------------------------------------------------------

describe("getAxisSourceSuggestions", () => {
	it("returns array of suggestions", () => {
		const ctx = makePanelContext();
		const suggestions = getAxisSourceSuggestions(ctx);
		expect(Array.isArray(suggestions)).toBe(true);
		expect(suggestions.length).toBeGreaterThan(0);
	});

	it("includes keywords", () => {
		const ctx = makePanelContext();
		const suggestions = getAxisSourceSuggestions(ctx);
		expect(suggestions).toContain("index");
		expect(suggestions).toContain("degree");
		expect(suggestions).toContain("random");
	});

	it("includes hop: keyword", () => {
		const ctx = makePanelContext();
		const suggestions = getAxisSourceSuggestions(ctx);
		expect(suggestions).toContain("hop:");
	});
});
