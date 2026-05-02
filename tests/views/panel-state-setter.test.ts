/**
 * Tests for src/views/panel-state-setter.ts
 *
 * panel-state-setter.ts is a pure-function module that centralizes
 * type-safe panel field assignment and unknown→union narrowing helpers.
 * It has zero DOM/Obsidian dependencies, so 100% statement coverage is
 * the realistic target.
 *
 * Strategy
 * --------
 *  • Setter helpers (`setPanelField`, `setEdgeTypeFlag`, `setHoverEdgeTypeFlag`)
 *    are exercised against a real `createDefaultPanel()` PanelState so the
 *    keyof-constrained writes also serve as a structural sanity check —
 *    if a key is renamed in PanelState, this file fails to compile.
 *  • Narrowing helpers (`asNodeShape`, `asNodeColorMode`, …) all share the
 *    "valid literal → value, anything else → null" shape, so they're
 *    table-tested with the same battery of invalid inputs (number, null,
 *    undefined, object, empty string, mismatched literal).
 */
import { describe, it, expect } from "vitest";
import { createDefaultPanel } from "../../src/views/PanelBuilder";
import {
	setPanelField,
	asNodeShape,
	asNodeColorMode,
	asEdgeDirectionFilter,
	asNodeDisplayMode,
	asImportanceMetric,
	asClusterLabelDetail,
	asAnalysisOverlay,
	asCableBundleMode,
	asLabelModeOverride,
	asEnclosureLabelPosition,
	asClusterArrangement,
	asClusterGroupArrangement,
	asCoordinateSystem,
	asGridStyle,
	asGridLabelPlacement,
	asCardPreset,
	asHeaderStyle,
	asFieldFormat,
	asHoverEdgeTypeKey,
	EDGE_TYPE_KEYS,
	setEdgeTypeFlag,
	getEdgeTypeFlag,
	setHoverEdgeTypeFlag,
	getHoverEdgeTypeFlag,
} from "../../src/views/panel-state-setter";

// Common battery of values that must NOT narrow to a union literal.
// Covers: wrong-type primitives, structural types, and a string that
// is plausibly a literal but not actually in any of the union sets.
const INVALID_INPUTS: readonly unknown[] = [
	undefined,
	null,
	0,
	1,
	NaN,
	true,
	false,
	"",
	"not-a-real-literal",
	{},
	[],
	() => undefined,
];

describe("panel-state-setter — setPanelField", () => {
	it("assigns a boolean field through the keyof-constrained setter", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "showOrphans", true);
		expect(panel.showOrphans).toBe(true);
		setPanelField(panel, "showOrphans", false);
		expect(panel.showOrphans).toBe(false);
	});

	it("assigns a numeric field", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "minDegreeFilter", 5);
		expect(panel.minDegreeFilter).toBe(5);
	});

	it("assigns a string field", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "searchQuery", "hello world");
		expect(panel.searchQuery).toBe("hello world");
	});
});

describe("panel-state-setter — narrowing helpers (valid)", () => {
	// Each entry: [function under test, sample valid literals]. The lists
	// are full (every literal in the union) so coverage of the inSet path
	// is exhaustive, not just "first item works".
	const cases: ReadonlyArray<readonly [(v: unknown) => unknown, readonly string[]]> = [
		[asNodeShape, ["circle", "triangle", "diamond", "hexagon", "square"]],
		[asNodeColorMode, ["default", "category", "heatmap", "community", "field"]],
		[asEdgeDirectionFilter, ["all", "bidirectional", "unidirectional"]],
		[asNodeDisplayMode, ["node", "card", "donut", "sunburst-segment"]],
		[asImportanceMetric, ["degree", "betweenness", "pagerank"]],
		[asClusterLabelDetail, ["minimal", "standard", "detailed", "rich"]],
		[asAnalysisOverlay, ["off", "bridges", "entropy", "gaps", "missing", "density", "all"]],
		[asCableBundleMode, ["auto", "always", "never"]],
		[asLabelModeOverride, ["auto", "initials", "truncated", "full"]],
		[asEnclosureLabelPosition, ["top", "center", "bottom"]],
		[
			asClusterArrangement,
			[
				"inherit",
				"concentric",
				"radial",
				"phyllotaxis",
				"grid",
				"triangle",
				"random",
				"timeline",
				"custom",
				"ego",
			],
		],
		[asClusterGroupArrangement, ["auto", "circle", "horizontal", "vertical", "concentric", "grid"]],
		[asCoordinateSystem, ["cartesian", "polar"]],
		[asGridStyle, ["lines", "table"]],
		[asGridLabelPlacement, ["on-line", "between"]],
		[asCardPreset, ["custom", "compact", "detailed", "full"]],
		[asHeaderStyle, ["plain", "table"]],
		[asFieldFormat, ["key-value", "value-only"]],
		[asHoverEdgeTypeKey, ["link", "semantic", "tag", "hasTag", "similar", "sibling", "sequence", "inheritance", "aggregation"]],
	];

	for (const [fn, valid] of cases) {
		describe(fn.name, () => {
			it.each(valid)("returns %s unchanged", (v) => {
				expect(fn(v)).toBe(v);
			});
			it.each(INVALID_INPUTS)("returns null for invalid input %p", (v) => {
				expect(fn(v)).toBeNull();
			});
		});
	}
});

describe("panel-state-setter — EDGE_TYPE_KEYS", () => {
	it("exposes all known edge-type flag keys", () => {
		expect(EDGE_TYPE_KEYS).toEqual([
			"showLinks",
			"showTagEdges",
			"showCategoryEdges",
			"showSemanticEdges",
			"showInheritance",
			"showAggregation",
			"showSimilar",
			"showSibling",
			"showSequence",
			"showInlineRelation",
		]);
	});

	it("has no duplicate keys", () => {
		expect(new Set(EDGE_TYPE_KEYS).size).toBe(EDGE_TYPE_KEYS.length);
	});

	it("setEdgeTypeFlag/getEdgeTypeFlag round-trip on every key", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			setEdgeTypeFlag(panel, key, true);
			expect(getEdgeTypeFlag(panel, key)).toBe(true);
			setEdgeTypeFlag(panel, key, false);
			expect(getEdgeTypeFlag(panel, key)).toBe(false);
		}
	});

	it("setEdgeTypeFlag does not affect unrelated keys", () => {
		const panel = createDefaultPanel();
		const before = panel.showSimilar;
		setEdgeTypeFlag(panel, "showLinks", !panel.showLinks);
		expect(panel.showSimilar).toBe(before);
	});
});

describe("panel-state-setter — hover edge-type flags", () => {
	const HOVER_KEYS = [
		"link",
		"semantic",
		"tag",
		"hasTag",
		"similar",
		"sibling",
		"sequence",
		"inheritance",
		"aggregation",
	] as const;

	it("set/get round-trip on every hover edge-type key", () => {
		const panel = createDefaultPanel();
		for (const key of HOVER_KEYS) {
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, key, true);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, key)).toBe(true);
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, key, false);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, key)).toBe(false);
		}
	});

	it("setHoverEdgeTypeFlag does not leak to other keys", () => {
		const panel = createDefaultPanel();
		const beforeSemantic = panel.hoverEdgeTypes.semantic;
		setHoverEdgeTypeFlag(panel.hoverEdgeTypes, "link", !panel.hoverEdgeTypes.link);
		expect(panel.hoverEdgeTypes.semantic).toBe(beforeSemantic);
	});
});
