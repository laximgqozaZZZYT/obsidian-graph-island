/**
 * panel-state-setter.test.ts
 *
 * Unit tests for the type-safe setter and unknown→union narrowing helpers
 * in src/views/panel-state-setter.ts. The module is a pure-function island
 * (no DOM, no Obsidian deps) so we can exercise all branches directly via
 * createDefaultPanel() as a real PanelState fixture.
 */
import { describe, it, expect } from "vitest";
import { createDefaultPanel } from "../src/views/PanelBuilder";
import {
	setPanelField,
	setEdgeTypeFlag,
	getEdgeTypeFlag,
	EDGE_TYPE_KEYS,
	setHoverEdgeTypeFlag,
	getHoverEdgeTypeFlag,
	asHoverEdgeTypeKey,
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
} from "../src/views/panel-state-setter";

describe("setPanelField", () => {
	it("assigns a primitive value to a panel field", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "nodeSize", 42);
		expect(panel.nodeSize).toBe(42);
	});

	it("assigns a boolean to a boolean field", () => {
		const panel = createDefaultPanel();
		const before = panel.showLinks;
		setPanelField(panel, "showLinks", !before);
		expect(panel.showLinks).toBe(!before);
	});

	it("assigns a string to a string field", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "searchQuery", "tag:foo");
		expect(panel.searchQuery).toBe("tag:foo");
	});

	it("does not mutate other fields", () => {
		const panel = createDefaultPanel();
		const otherBefore = panel.nodeSize;
		setPanelField(panel, "showLinks", false);
		expect(panel.nodeSize).toBe(otherBefore);
	});
});

describe("EDGE_TYPE_KEYS", () => {
	it("lists exactly the 10 edge-type boolean keys", () => {
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

	it("contains only keys that exist on a default PanelState as booleans", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			expect(typeof panel[key]).toBe("boolean");
		}
	});
});

describe("setEdgeTypeFlag / getEdgeTypeFlag", () => {
	it("setting then getting returns the same boolean for every key", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			setEdgeTypeFlag(panel, key, true);
			expect(getEdgeTypeFlag(panel, key)).toBe(true);
			setEdgeTypeFlag(panel, key, false);
			expect(getEdgeTypeFlag(panel, key)).toBe(false);
		}
	});

	it("flipping one key does not affect other keys", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) setEdgeTypeFlag(panel, key, true);
		setEdgeTypeFlag(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
		expect(panel.showTagEdges).toBe(true);
		expect(panel.showSemanticEdges).toBe(true);
	});
});

describe("setHoverEdgeTypeFlag / getHoverEdgeTypeFlag", () => {
	it("toggles every hover edge-type sub-flag round-trip", () => {
		const panel = createDefaultPanel();
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
		for (const k of keys) {
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, k, true);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, k)).toBe(true);
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, k, false);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, k)).toBe(false);
		}
	});
});

describe("asHoverEdgeTypeKey", () => {
	it("accepts each known hover edge-type key", () => {
		for (const key of [
			"link",
			"semantic",
			"tag",
			"hasTag",
			"similar",
			"sibling",
			"sequence",
			"inheritance",
			"aggregation",
		]) {
			expect(asHoverEdgeTypeKey(key)).toBe(key);
		}
	});

	it("rejects unknown / wrong-typed inputs", () => {
		expect(asHoverEdgeTypeKey("Link")).toBeNull(); // case-sensitive
		expect(asHoverEdgeTypeKey("")).toBeNull();
		expect(asHoverEdgeTypeKey("unknown")).toBeNull();
		expect(asHoverEdgeTypeKey(0)).toBeNull();
		expect(asHoverEdgeTypeKey(null)).toBeNull();
		expect(asHoverEdgeTypeKey(undefined)).toBeNull();
		expect(asHoverEdgeTypeKey({})).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Each `as*()` narrowing helper: should return the exact string for valid
// inputs, and `null` for invalid / wrong-type inputs.
// ---------------------------------------------------------------------------
describe("union narrowing helpers", () => {
	const cases: Array<{
		name: string;
		fn: (v: unknown) => string | null;
		valid: readonly string[];
		invalid: readonly string[];
	}> = [
		{
			name: "asNodeShape",
			fn: asNodeShape,
			valid: ["circle", "triangle", "diamond", "hexagon", "square"],
			invalid: ["star", "Circle", ""],
		},
		{
			name: "asNodeColorMode",
			fn: asNodeColorMode,
			valid: ["default", "category", "heatmap", "community", "field"],
			invalid: ["custom", "DEFAULT"],
		},
		{
			name: "asEdgeDirectionFilter",
			fn: asEdgeDirectionFilter,
			valid: ["all", "bidirectional", "unidirectional"],
			invalid: ["both", "none"],
		},
		{
			name: "asNodeDisplayMode",
			fn: asNodeDisplayMode,
			valid: ["node", "card", "donut", "sunburst-segment"],
			invalid: ["sunburst", "label"],
		},
		{
			name: "asImportanceMetric",
			fn: asImportanceMetric,
			valid: ["degree", "betweenness", "pagerank"],
			invalid: ["closeness", ""],
		},
		{
			name: "asClusterLabelDetail",
			fn: asClusterLabelDetail,
			valid: ["minimal", "standard", "detailed", "rich"],
			invalid: ["none", "verbose"],
		},
		{
			name: "asAnalysisOverlay",
			fn: asAnalysisOverlay,
			valid: ["off", "bridges", "entropy", "gaps", "missing", "density", "all"],
			invalid: ["communities", "OFF"],
		},
		{
			name: "asCableBundleMode",
			fn: asCableBundleMode,
			valid: ["auto", "always", "never"],
			invalid: ["sometimes"],
		},
		{
			name: "asLabelModeOverride",
			fn: asLabelModeOverride,
			valid: ["auto", "initials", "truncated", "full"],
			invalid: ["short"],
		},
		{
			name: "asEnclosureLabelPosition",
			fn: asEnclosureLabelPosition,
			valid: ["top", "center", "bottom"],
			invalid: ["middle", "TOP"],
		},
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
			invalid: ["force", "spiral"],
		},
		{
			name: "asClusterGroupArrangement",
			fn: asClusterGroupArrangement,
			valid: ["auto", "circle", "horizontal", "vertical", "concentric", "grid"],
			invalid: ["diagonal", "AUTO"],
		},
		{
			name: "asCoordinateSystem",
			fn: asCoordinateSystem,
			valid: ["cartesian", "polar"],
			invalid: ["spherical", ""],
		},
		{
			name: "asGridStyle",
			fn: asGridStyle,
			valid: ["lines", "table"],
			invalid: ["dotted"],
		},
		{
			name: "asGridLabelPlacement",
			fn: asGridLabelPlacement,
			valid: ["on-line", "between"],
			invalid: ["above", "on_line"],
		},
		{
			name: "asCardPreset",
			fn: asCardPreset,
			valid: ["custom", "compact", "detailed", "full"],
			invalid: ["mini", "Detailed"],
		},
		{
			name: "asHeaderStyle",
			fn: asHeaderStyle,
			valid: ["plain", "table"],
			invalid: ["bold"],
		},
		{
			name: "asFieldFormat",
			fn: asFieldFormat,
			valid: ["key-value", "value-only"],
			invalid: ["key:value", "value_only"],
		},
	];

	for (const c of cases) {
		describe(c.name, () => {
			it("returns the exact value for every valid literal", () => {
				for (const v of c.valid) expect(c.fn(v)).toBe(v);
			});
			it("returns null for unknown strings", () => {
				for (const v of c.invalid) expect(c.fn(v)).toBeNull();
			});
			it("returns null for non-string types", () => {
				expect(c.fn(0)).toBeNull();
				expect(c.fn(true)).toBeNull();
				expect(c.fn(null)).toBeNull();
				expect(c.fn(undefined)).toBeNull();
				expect(c.fn({})).toBeNull();
				expect(c.fn([])).toBeNull();
			});
		});
	}
});
