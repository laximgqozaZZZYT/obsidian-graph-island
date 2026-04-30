/**
 * Tests for src/views/panel-state-setter.ts
 *
 * Pure type-narrowing helpers and panel-field setters — no DOM, no Obsidian.
 * Covers each `as*` guard's accept/reject behaviour at the boundary
 * (valid literal → returned as-is; everything else → null), the typed
 * setters, and the edge-type/hover-edge-type flag accessors.
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
	EDGE_TYPE_KEYS,
	setEdgeTypeFlag,
	getEdgeTypeFlag,
	setHoverEdgeTypeFlag,
	getHoverEdgeTypeFlag,
} from "../../src/views/panel-state-setter";
import { createDefaultPanel, type PanelState } from "../../src/views/PanelBuilder";

// Inputs that no `as*` guard should ever accept. Common rejection set.
const NON_STRING_INPUTS: readonly unknown[] = [
	null,
	undefined,
	0,
	1,
	NaN,
	true,
	false,
	{},
	[],
	() => "default",
	Symbol("default"),
];

describe("setPanelField", () => {
	it("assigns a value to a typed key", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "nodeSize", 42);
		expect(panel.nodeSize).toBe(42);
	});

	it("assigns boolean fields", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
	});

	it("assigns string fields", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "searchQuery", "kind:character");
		expect(panel.searchQuery).toBe("kind:character");
	});

	it("does not mutate other fields when assigning one", () => {
		const panel = createDefaultPanel();
		const before = panel.showOrphans;
		setPanelField(panel, "nodeSize", 99);
		expect(panel.showOrphans).toBe(before);
	});
});

// describe.each row label is fed by the function's `name`; pairing each
// guard with the literal set it should accept keeps the table tight.
const GUARDS: [(v: unknown) => unknown, readonly string[]][] = [
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
		["inherit", "concentric", "radial", "phyllotaxis", "grid", "triangle", "random", "timeline", "custom", "ego"],
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

describe.each(GUARDS)("%s", (guard, validList) => {
	it("returns the value unchanged for every valid literal", () => {
		for (const v of validList) {
			expect(guard(v)).toBe(v);
		}
	});

	it("returns null for empty string", () => {
		expect(guard("")).toBeNull();
	});

	it("is case-sensitive (uppercase variants rejected)", () => {
		for (const v of validList) {
			const upper = v.toUpperCase();
			if (upper !== v) {
				expect(guard(upper)).toBeNull();
			}
		}
	});

	it("returns null for unknown strings", () => {
		expect(guard("definitely-not-a-valid-literal-xyz")).toBeNull();
		expect(guard("nope")).toBeNull();
	});

	it("returns null for non-string inputs", () => {
		for (const v of NON_STRING_INPUTS) {
			expect(guard(v)).toBeNull();
		}
	});

	it("returns null for whitespace-padded valid literal", () => {
		// guard does strict equality, not trimming
		const padded = ` ${validList[0]} `;
		expect(guard(padded)).toBeNull();
	});
});

describe("EDGE_TYPE_KEYS", () => {
	it("lists all 10 edge-type panel flags", () => {
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

	it("every key is assignable on a default panel", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			// keyof PanelState — should never be undefined on default
			expect(typeof panel[key]).toBe("boolean");
		}
	});
});

describe("setEdgeTypeFlag / getEdgeTypeFlag", () => {
	it("setEdgeTypeFlag flips a single flag without affecting others", () => {
		const panel = createDefaultPanel();
		const otherKeys = EDGE_TYPE_KEYS.filter((k) => k !== "showLinks");
		const before: Record<string, boolean> = {};
		for (const k of otherKeys) before[k] = panel[k];

		setEdgeTypeFlag(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
		for (const k of otherKeys) expect(panel[k]).toBe(before[k]);
	});

	it("setEdgeTypeFlag(true) and (false) round-trip", () => {
		const panel = createDefaultPanel();
		setEdgeTypeFlag(panel, "showSimilar", true);
		expect(getEdgeTypeFlag(panel, "showSimilar")).toBe(true);
		setEdgeTypeFlag(panel, "showSimilar", false);
		expect(getEdgeTypeFlag(panel, "showSimilar")).toBe(false);
	});

	it("getEdgeTypeFlag reflects current panel state", () => {
		const panel = createDefaultPanel();
		panel.showInheritance = true;
		expect(getEdgeTypeFlag(panel, "showInheritance")).toBe(true);
		panel.showInheritance = false;
		expect(getEdgeTypeFlag(panel, "showInheritance")).toBe(false);
	});
});

describe("setHoverEdgeTypeFlag / getHoverEdgeTypeFlag", () => {
	const makeHet = (): PanelState["hoverEdgeTypes"] => createDefaultPanel().hoverEdgeTypes;

	it("setHoverEdgeTypeFlag flips a single flag without affecting siblings", () => {
		const het = makeHet();
		const before = { ...het };
		setHoverEdgeTypeFlag(het, "tag", true);
		expect(het.tag).toBe(true);
		// All other keys unchanged
		for (const k of Object.keys(before) as (keyof typeof before)[]) {
			if (k === "tag") continue;
			expect(het[k]).toBe(before[k]);
		}
	});

	it("round-trips true→false", () => {
		const het = makeHet();
		setHoverEdgeTypeFlag(het, "similar", true);
		expect(getHoverEdgeTypeFlag(het, "similar")).toBe(true);
		setHoverEdgeTypeFlag(het, "similar", false);
		expect(getHoverEdgeTypeFlag(het, "similar")).toBe(false);
	});

	it("getHoverEdgeTypeFlag returns default link=true, semantic=false", () => {
		const het = makeHet();
		expect(getHoverEdgeTypeFlag(het, "link")).toBe(true);
		expect(getHoverEdgeTypeFlag(het, "semantic")).toBe(false);
	});

	it("each hover edge key is independently writable", () => {
		const het = makeHet();
		const keys = ["link", "semantic", "tag", "hasTag", "similar", "sibling", "sequence", "inheritance", "aggregation"] as const;
		for (const k of keys) {
			setHoverEdgeTypeFlag(het, k, true);
			expect(getHoverEdgeTypeFlag(het, k)).toBe(true);
		}
		// All true now
		for (const k of keys) expect(het[k]).toBe(true);
	});
});
