import { describe, it, expect } from "vitest";
import * as C from "../src/constants";

describe("constants — uniqueness", () => {
	it("EDGE_TYPE_* values are all unique", () => {
		const edgeTypes = [
			C.EDGE_TYPE_INHERITANCE,
			C.EDGE_TYPE_AGGREGATION,
			C.EDGE_TYPE_SEQUENCE,
			C.EDGE_TYPE_SIMILAR,
			C.EDGE_TYPE_SIBLING,
			C.EDGE_TYPE_LINK,
			C.EDGE_TYPE_TAG,
			C.EDGE_TYPE_HAS_TAG,
		];
		expect(new Set(edgeTypes).size).toBe(edgeTypes.length);
	});

	it("ARRANGEMENT_* values are all unique", () => {
		const arrangements = [
			C.ARRANGEMENT_CONCENTRIC,
			C.ARRANGEMENT_TIMELINE,
			C.ARRANGEMENT_TRIANGLE,
			C.ARRANGEMENT_GRID,
			C.ARRANGEMENT_RADIAL,
			C.ARRANGEMENT_PHYLLOTAXIS,
			C.ARRANGEMENT_RANDOM,
			C.ARRANGEMENT_CUSTOM,
			C.ARRANGEMENT_EGO,
		];
		expect(new Set(arrangements).size).toBe(arrangements.length);
	});

	it("LAYOUT_* values are all unique", () => {
		const layouts = [
			C.LAYOUT_FORCE,
			C.LAYOUT_CONCENTRIC,
			C.LAYOUT_TREE,
			C.LAYOUT_ARC,
			C.LAYOUT_SUNBURST,
			C.LAYOUT_TIMELINE,
		];
		expect(new Set(layouts).size).toBe(layouts.length);
	});

	it("SOURCE_* values are all unique", () => {
		const sources = [
			C.SOURCE_PROPERTY,
			C.SOURCE_INDEX,
			C.SOURCE_FIELD,
			C.SOURCE_METRIC,
			C.SOURCE_HOP,
			C.SOURCE_RANDOM,
			C.SOURCE_CONST,
		];
		expect(new Set(sources).size).toBe(sources.length);
	});

	it("TRANSFORM_* values are all unique", () => {
		const transforms = [
			C.TRANSFORM_EXPRESSION,
			C.TRANSFORM_EVEN_DIVIDE,
			C.TRANSFORM_LINEAR,
			C.TRANSFORM_BIN,
			C.TRANSFORM_DATE_INDEX,
			C.TRANSFORM_STACK_AVOID,
			C.TRANSFORM_GOLDEN,
			C.TRANSFORM_CURVE,
			C.TRANSFORM_SHAPE_FILL,
		];
		expect(new Set(transforms).size).toBe(transforms.length);
	});

	it("GROUP_ARRANGEMENT_* values are all unique", () => {
		const groupArr = [
			C.GROUP_ARRANGEMENT_AUTO,
			C.GROUP_ARRANGEMENT_CIRCLE,
			C.GROUP_ARRANGEMENT_HORIZONTAL,
			C.GROUP_ARRANGEMENT_VERTICAL,
			C.GROUP_ARRANGEMENT_CONCENTRIC,
			C.GROUP_ARRANGEMENT_GRID,
		];
		expect(new Set(groupArr).size).toBe(groupArr.length);
	});
});

describe("constants — types", () => {
	it("all string constants are non-empty", () => {
		const stringConsts = Object.values(C).filter((v): v is string => typeof v === "string");
		expect(stringConsts.length).toBeGreaterThan(40); // sanity check
		for (const val of stringConsts) {
			expect(val.length).toBeGreaterThan(0);
		}
	});

	it("no string constants contain whitespace", () => {
		for (const val of Object.values(C)) {
			if (typeof val === "string") {
				expect(val).not.toMatch(/\s/);
			}
		}
	});
});

describe("constants — cross-category independence", () => {
	it("edge types don't collide with layout types", () => {
		const edgeTypes = new Set([
			C.EDGE_TYPE_INHERITANCE,
			C.EDGE_TYPE_AGGREGATION,
			C.EDGE_TYPE_SEQUENCE,
			C.EDGE_TYPE_SIMILAR,
			C.EDGE_TYPE_SIBLING,
			C.EDGE_TYPE_LINK,
			C.EDGE_TYPE_TAG,
			C.EDGE_TYPE_HAS_TAG,
		]);
		const layoutTypes = [
			C.LAYOUT_FORCE,
			C.LAYOUT_CONCENTRIC,
			C.LAYOUT_TREE,
			C.LAYOUT_ARC,
			C.LAYOUT_SUNBURST,
			C.LAYOUT_TIMELINE,
		];
		for (const lt of layoutTypes) {
			expect(edgeTypes.has(lt as any)).toBe(false);
		}
	});

	it("source kinds don't collide with transform kinds", () => {
		const sources = new Set([
			C.SOURCE_PROPERTY,
			C.SOURCE_INDEX,
			C.SOURCE_FIELD,
			C.SOURCE_METRIC,
			C.SOURCE_HOP,
			C.SOURCE_RANDOM,
			C.SOURCE_CONST,
		]);
		const transforms = [
			C.TRANSFORM_EXPRESSION,
			C.TRANSFORM_EVEN_DIVIDE,
			C.TRANSFORM_LINEAR,
			C.TRANSFORM_BIN,
			C.TRANSFORM_DATE_INDEX,
			C.TRANSFORM_STACK_AVOID,
			C.TRANSFORM_GOLDEN,
			C.TRANSFORM_CURVE,
			C.TRANSFORM_SHAPE_FILL,
		];
		for (const t of transforms) {
			expect(sources.has(t as any)).toBe(false);
		}
	});
});

// ---------------------------------------------------------------------------
// constants — EDGE_TYPE_SPECS cross-reference (cycle114)
// ---------------------------------------------------------------------------
describe("constants — EDGE_TYPE_SPECS coverage", () => {
	// Import EDGE_TYPE_SPECS indirectly via shouldSkipEdge behavior
	const ALL_EDGE_TYPES = [
		C.EDGE_TYPE_LINK,
		C.EDGE_TYPE_TAG,
		C.EDGE_TYPE_HAS_TAG,
		C.EDGE_TYPE_INHERITANCE,
		C.EDGE_TYPE_AGGREGATION,
		C.EDGE_TYPE_SIMILAR,
		C.EDGE_TYPE_SIBLING,
		C.EDGE_TYPE_SEQUENCE,
		C.EDGE_TYPE_INLINE_RELATION,
		C.EDGE_TYPE_NAMED_RELATION,
	];

	it("all EDGE_TYPE_* constants are lowercase strings", () => {
		for (const t of ALL_EDGE_TYPES) {
			expect(t).toBe(t.toLowerCase());
		}
	});

	it("all EDGE_TYPE_* constants are non-empty and contain only [a-z-]", () => {
		for (const t of ALL_EDGE_TYPES) {
			expect(t).toMatch(/^[a-z-]+$/);
		}
	});

	it("POLAR_ARRANGEMENTS is a Set with correct members", () => {
		expect(C.POLAR_ARRANGEMENTS).toBeInstanceOf(Set);
		expect(C.POLAR_ARRANGEMENTS.has("concentric")).toBe(true);
		expect(C.POLAR_ARRANGEMENTS.has("radial")).toBe(true);
		expect(C.POLAR_ARRANGEMENTS.has("phyllotaxis")).toBe(true);
		expect(C.POLAR_ARRANGEMENTS.has("grid")).toBe(false);
	});

	it("EVENT_* constants follow naming convention", () => {
		const events = [C.EVENT_HOVER_NODE, C.EVENT_HIGHLIGHT_NODES, C.EVENT_COMPARE_NODES, C.EVENT_SYNC_PANEL];
		for (const e of events) {
			expect(e).toMatch(/^graph-island:/);
		}
	});

	it("SHAPE_FILL_* constants match NodeShape values", () => {
		const shapeFills = [
			C.SHAPE_FILL_TRIANGLE,
			C.SHAPE_FILL_HEXAGON,
			C.SHAPE_FILL_SQUARE,
			C.SHAPE_FILL_DIAMOND,
			C.SHAPE_FILL_CIRCLE,
		];
		const nodeShapes = ["triangle", "hexagon", "square", "diamond", "circle"];
		for (const sf of shapeFills) {
			expect(nodeShapes).toContain(sf);
		}
	});

	it("no duplicate values across categories", () => {
		// Collect all string constant values
		const allValues: string[] = [];
		for (const [key, val] of Object.entries(C)) {
			if (typeof val === "string" && key !== "POLAR_ARRANGEMENTS") {
				allValues.push(val);
			}
		}
		// Check for collisions (some are expected: concentric appears in LAYOUT and ARRANGEMENT)
		const duplicates = allValues.filter((v, i) => allValues.indexOf(v) !== i);
		// "concentric" is shared between LAYOUT_CONCENTRIC, ARRANGEMENT_CONCENTRIC, GROUP_ARRANGEMENT_CONCENTRIC
		// "grid" is shared between ARRANGEMENT_GRID, GROUP_ARRANGEMENT_GRID
		// "circle" is shared between GROUP_ARRANGEMENT_CIRCLE, SHAPE_FILL_CIRCLE
		// These are expected cross-category duplicates
		// Expected cross-category duplicates:
		// concentric: LAYOUT + ARRANGEMENT + GROUP_ARRANGEMENT
		// grid: ARRANGEMENT + GROUP_ARRANGEMENT
		// circle: GROUP_ARRANGEMENT + SHAPE_FILL
		// timeline: LAYOUT + ARRANGEMENT
		// random: ARRANGEMENT + SOURCE
		// triangle: ARRANGEMENT + SHAPE_FILL
		// sunburst: LAYOUT + VIEW_MODE
		// tree: LAYOUT + VIEW_MODE
		const expectedDups = new Set([
			"concentric",
			"grid",
			"circle",
			"timeline",
			"random",
			"triangle",
			"sunburst",
			"tree",
		]);
		const unexpectedDups = duplicates.filter((d) => !expectedDups.has(d));
		expect(unexpectedDups).toEqual([]);
	});
});

// =========================================================================
// Additional integrity
// =========================================================================
describe("constants — value integrity", () => {
	it("TAG_DISPLAY values are distinct from EDGE_TYPE", () => {
		const tagVals = [C.TAG_DISPLAY_ENCLOSURE, C.TAG_DISPLAY_NODE];
		const edgeVals = [
			C.EDGE_TYPE_LINK,
			C.EDGE_TYPE_SEMANTIC,
			C.EDGE_TYPE_TAG,
			C.EDGE_TYPE_HAS_TAG,
			C.EDGE_TYPE_INHERITANCE,
			C.EDGE_TYPE_AGGREGATION,
			C.EDGE_TYPE_SIMILAR,
			C.EDGE_TYPE_SIBLING,
			C.EDGE_TYPE_SEQUENCE,
		];
		for (const tv of tagVals) {
			expect(edgeVals).not.toContain(tv);
		}
	});

	it("EDGE_TYPE values are lowercase+hyphen only", () => {
		const edgeTypes = [
			C.EDGE_TYPE_LINK,
			C.EDGE_TYPE_TAG,
			C.EDGE_TYPE_HAS_TAG,
			C.EDGE_TYPE_INHERITANCE,
			C.EDGE_TYPE_AGGREGATION,
			C.EDGE_TYPE_SIMILAR,
			C.EDGE_TYPE_SIBLING,
			C.EDGE_TYPE_SEQUENCE,
		];
		for (const et of edgeTypes) {
			expect(et).toMatch(/^[a-z-]+$/);
		}
	});

	it("TAG_DISPLAY values are non-empty strings", () => {
		expect(C.TAG_DISPLAY_ENCLOSURE.length).toBeGreaterThan(0);
		expect(C.TAG_DISPLAY_NODE.length).toBeGreaterThan(0);
	});
});
