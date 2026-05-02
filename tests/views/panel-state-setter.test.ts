/**
 * Tests for src/views/panel-state-setter.ts
 *
 * Covers:
 *   - generic setPanelField() type-safe assignment
 *   - 18 as*() narrowing helpers (round-trip + invalid input → null)
 *   - edge-type flag get/set (panel.show* fields)
 *   - hover edge-type flag get/set (panel.hoverEdgeTypes.*)
 *
 * The narrowing helpers are pure (no DOM, no Obsidian deps) and form the
 * type-safe replacement for the ad-hoc `as Foo` and `as unknown as Record<...>`
 * casts that previously littered panel-sections*.ts dropdown callbacks.
 * Regressions here would re-open the door to runtime type confusion in those
 * callbacks, so the round-trip + reject-invalid coverage is the primary guard.
 */
import { describe, it, expect } from "vitest";
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
	setEdgeTypeFlag,
	getEdgeTypeFlag,
	setHoverEdgeTypeFlag,
	getHoverEdgeTypeFlag,
	EDGE_TYPE_KEYS,
} from "../../src/views/panel-state-setter";
import { createDefaultPanelState } from "../../src/views/panel-defaults";

// Common invalid-input cases that every narrowing helper must reject.
const INVALID_INPUTS: ReadonlyArray<readonly [string, unknown]> = [
	["null", null],
	["undefined", undefined],
	["empty string", ""],
	["unrelated string", "definitely-not-a-valid-value"],
	["number", 42],
	["boolean true", true],
	["object", { value: "circle" }],
	["array", ["circle"]],
];

describe("panel-state-setter — setPanelField", () => {
	it("assigns a primitive field on PanelState", () => {
		const panel = createDefaultPanelState();
		setPanelField(panel, "showOrphans", !panel.showOrphans);
		expect(panel.showOrphans).toBe(true === !createDefaultPanelState().showOrphans);
	});

	it("assigns an object/Set field by reference (no clone)", () => {
		const panel = createDefaultPanelState();
		const fresh = new Set<string>(["a", "b"]);
		setPanelField(panel, "collapsedGroups", fresh);
		expect(panel.collapsedGroups).toBe(fresh);
	});

	it("does not mutate keys other than the one assigned", () => {
		const panel = createDefaultPanelState();
		const before = { ...panel };
		setPanelField(panel, "minDeg", 5);
		expect(panel.minDeg).toBe(5);
		// Spot check that unrelated fields are untouched.
		expect(panel.showOrphans).toBe(before.showOrphans);
		expect(panel.layoutType).toBe(before.layoutType);
	});
});

// Each entry: helper, list of valid literals, label for diagnostic output.
type Helper = (v: unknown) => unknown;
const HELPER_CASES: ReadonlyArray<{ name: string; fn: Helper; valid: readonly string[] }> = [
	{ name: "asNodeShape", fn: asNodeShape, valid: ["circle", "triangle", "diamond", "hexagon", "square"] },
	{ name: "asNodeColorMode", fn: asNodeColorMode, valid: ["default", "category", "heatmap", "community", "field"] },
	{ name: "asEdgeDirectionFilter", fn: asEdgeDirectionFilter, valid: ["all", "bidirectional", "unidirectional"] },
	{ name: "asNodeDisplayMode", fn: asNodeDisplayMode, valid: ["node", "card", "donut", "sunburst-segment"] },
	{ name: "asImportanceMetric", fn: asImportanceMetric, valid: ["degree", "betweenness", "pagerank"] },
	{ name: "asClusterLabelDetail", fn: asClusterLabelDetail, valid: ["minimal", "standard", "detailed", "rich"] },
	{
		name: "asAnalysisOverlay",
		fn: asAnalysisOverlay,
		valid: ["off", "bridges", "entropy", "gaps", "missing", "density", "all"],
	},
	{ name: "asCableBundleMode", fn: asCableBundleMode, valid: ["auto", "always", "never"] },
	{ name: "asLabelModeOverride", fn: asLabelModeOverride, valid: ["auto", "initials", "truncated", "full"] },
	{ name: "asEnclosureLabelPosition", fn: asEnclosureLabelPosition, valid: ["top", "center", "bottom"] },
	{
		name: "asClusterArrangement",
		fn: asClusterArrangement,
		valid: [
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
	},
	{
		name: "asClusterGroupArrangement",
		fn: asClusterGroupArrangement,
		valid: ["auto", "circle", "horizontal", "vertical", "concentric", "grid"],
	},
	{ name: "asCoordinateSystem", fn: asCoordinateSystem, valid: ["cartesian", "polar"] },
	{ name: "asGridStyle", fn: asGridStyle, valid: ["lines", "table"] },
	{ name: "asGridLabelPlacement", fn: asGridLabelPlacement, valid: ["on-line", "between"] },
	{ name: "asCardPreset", fn: asCardPreset, valid: ["custom", "compact", "detailed", "full"] },
	{ name: "asHeaderStyle", fn: asHeaderStyle, valid: ["plain", "table"] },
	{ name: "asFieldFormat", fn: asFieldFormat, valid: ["key-value", "value-only"] },
	{
		name: "asHoverEdgeTypeKey",
		fn: asHoverEdgeTypeKey,
		valid: ["link", "semantic", "tag", "hasTag", "similar", "sibling", "sequence", "inheritance", "aggregation"],
	},
];

describe("panel-state-setter — narrowing helpers", () => {
	for (const { name, fn, valid } of HELPER_CASES) {
		describe(name, () => {
			it.each(valid)(`accepts %j and returns it unchanged`, (literal) => {
				expect(fn(literal)).toBe(literal);
			});

			it.each(INVALID_INPUTS)("rejects %s → null", (_label, value) => {
				expect(fn(value)).toBeNull();
			});

			it("rejects case-mismatched variants (case-sensitive guard)", () => {
				const upper = valid[0].toUpperCase();
				// Only assert when uppercase is actually different (skip e.g. all-numeric literals).
				if (upper !== valid[0]) {
					expect(fn(upper)).toBeNull();
				}
			});
		});
	}
});

describe("panel-state-setter — edge-type flag get/set", () => {
	it("EDGE_TYPE_KEYS lists the 10 documented panel show* fields", () => {
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

	it("setEdgeTypeFlag flips the targeted key only", () => {
		const panel = createDefaultPanelState();
		const before = { ...panel };
		setEdgeTypeFlag(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
		// Other flags stay at their defaults.
		expect(panel.showTagEdges).toBe(before.showTagEdges);
		expect(panel.showSemanticEdges).toBe(before.showSemanticEdges);
	});

	it("getEdgeTypeFlag round-trips with setEdgeTypeFlag", () => {
		const panel = createDefaultPanelState();
		for (const key of EDGE_TYPE_KEYS) {
			setEdgeTypeFlag(panel, key, true);
			expect(getEdgeTypeFlag(panel, key)).toBe(true);
			setEdgeTypeFlag(panel, key, false);
			expect(getEdgeTypeFlag(panel, key)).toBe(false);
		}
	});
});

describe("panel-state-setter — hover edge-type flag get/set", () => {
	it("setHoverEdgeTypeFlag mutates the supplied hoverEdgeTypes object in place", () => {
		const panel = createDefaultPanelState();
		const het = panel.hoverEdgeTypes;
		setHoverEdgeTypeFlag(het, "tag", true);
		expect(het.tag).toBe(true);
		expect(panel.hoverEdgeTypes.tag).toBe(true); // same reference
	});

	it("getHoverEdgeTypeFlag round-trips for every key", () => {
		const panel = createDefaultPanelState();
		const keys = [
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
		for (const key of keys) {
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, key, true);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, key)).toBe(true);
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, key, false);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, key)).toBe(false);
		}
	});

	it("setting one hover flag does not affect others", () => {
		const panel = createDefaultPanelState();
		const before = { ...panel.hoverEdgeTypes };
		setHoverEdgeTypeFlag(panel.hoverEdgeTypes, "similar", !before.similar);
		expect(panel.hoverEdgeTypes.similar).toBe(!before.similar);
		// Spot check unrelated keys.
		expect(panel.hoverEdgeTypes.link).toBe(before.link);
		expect(panel.hoverEdgeTypes.tag).toBe(before.tag);
		expect(panel.hoverEdgeTypes.aggregation).toBe(before.aggregation);
	});
});
