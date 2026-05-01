/**
 * Tests for src/views/panel-state-setter.ts
 *
 * Why these matter:
 *   - This module replaces dozens of `(panel as unknown as Record<string, unknown>)[key] = v`
 *     casts scattered through panel-sections*.ts dropdown / toggle callbacks.
 *   - If the union-literal sets here drift out of sync with PanelState's actual
 *     types, dropdown options will silently coerce to `null` (early-return) and
 *     the corresponding setting becomes a no-op. We want to catch that.
 *   - The narrowing helpers (`as*`) are pure functions over `unknown` — perfect
 *     for boundary-value testing (string mismatch, wrong type, empty string,
 *     literal-with-trailing-space, etc.).
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
import { createDefaultPanelState } from "../../src/views/panel-defaults";
import { ALL_SHAPES } from "../../src/utils/node-shapes";

// ---------------------------------------------------------------------------
// setPanelField — type-safe assignment
// ---------------------------------------------------------------------------
describe("setPanelField", () => {
	it("assigns a primitive field", () => {
		const panel = createDefaultPanelState();
		setPanelField(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
	});

	it("assigns a string-literal-union field", () => {
		const panel = createDefaultPanelState();
		setPanelField(panel, "nodeShape", "hexagon");
		expect(panel.nodeShape).toBe("hexagon");
	});

	it("does not affect unrelated fields", () => {
		const panel = createDefaultPanelState();
		const before = panel.showSemanticEdges;
		setPanelField(panel, "showLinks", !panel.showLinks);
		expect(panel.showSemanticEdges).toBe(before);
	});
});

// ---------------------------------------------------------------------------
// Narrowing helpers — accept all valid literals, reject invalid input.
// One parametrized table per helper keeps the surface auditable.
// ---------------------------------------------------------------------------
type Narrower<T> = (v: unknown) => T | null;

function checkNarrower<T extends string>(
	name: string,
	fn: Narrower<T>,
	valid: readonly T[],
	invalid: readonly unknown[],
) {
	describe(name, () => {
		for (const v of valid) {
			it(`accepts "${v}"`, () => {
				expect(fn(v)).toBe(v);
			});
		}
		for (const v of invalid) {
			it(`rejects ${JSON.stringify(v)}`, () => {
				expect(fn(v)).toBeNull();
			});
		}
	});
}

// Common invalid inputs covering all the boundary cases:
//   - non-string types (number, boolean, null, undefined, object, array)
//   - empty string
//   - close-but-wrong literal (case mismatch / trailing space / typo)
const COMMON_INVALID: readonly unknown[] = ["", "   ", "BOGUS", 123, true, false, null, undefined, {}, []];

checkNarrower("asNodeShape", asNodeShape, ALL_SHAPES, [...COMMON_INVALID, "Circle", "circle "]);

checkNarrower(
	"asNodeColorMode",
	asNodeColorMode,
	["default", "category", "heatmap", "community", "field"] as const,
	COMMON_INVALID,
);

checkNarrower(
	"asEdgeDirectionFilter",
	asEdgeDirectionFilter,
	["all", "bidirectional", "unidirectional"] as const,
	COMMON_INVALID,
);

checkNarrower(
	"asNodeDisplayMode",
	asNodeDisplayMode,
	["node", "card", "donut", "sunburst-segment"] as const,
	COMMON_INVALID,
);

checkNarrower("asImportanceMetric", asImportanceMetric, ["degree", "betweenness", "pagerank"] as const, COMMON_INVALID);

checkNarrower(
	"asClusterLabelDetail",
	asClusterLabelDetail,
	["minimal", "standard", "detailed", "rich"] as const,
	COMMON_INVALID,
);

checkNarrower(
	"asAnalysisOverlay",
	asAnalysisOverlay,
	["off", "bridges", "entropy", "gaps", "missing", "density", "all"] as const,
	COMMON_INVALID,
);

checkNarrower("asCableBundleMode", asCableBundleMode, ["auto", "always", "never"] as const, COMMON_INVALID);

checkNarrower(
	"asLabelModeOverride",
	asLabelModeOverride,
	["auto", "initials", "truncated", "full"] as const,
	COMMON_INVALID,
);

checkNarrower(
	"asEnclosureLabelPosition",
	asEnclosureLabelPosition,
	["top", "center", "bottom"] as const,
	COMMON_INVALID,
);

checkNarrower(
	"asClusterArrangement",
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
	] as const,
	COMMON_INVALID,
);

checkNarrower(
	"asClusterGroupArrangement",
	asClusterGroupArrangement,
	["auto", "circle", "horizontal", "vertical", "concentric", "grid"] as const,
	COMMON_INVALID,
);

checkNarrower("asCoordinateSystem", asCoordinateSystem, ["cartesian", "polar"] as const, COMMON_INVALID);

checkNarrower("asGridStyle", asGridStyle, ["lines", "table"] as const, COMMON_INVALID);

checkNarrower("asGridLabelPlacement", asGridLabelPlacement, ["on-line", "between"] as const, COMMON_INVALID);

checkNarrower("asCardPreset", asCardPreset, ["custom", "compact", "detailed", "full"] as const, COMMON_INVALID);

checkNarrower("asHeaderStyle", asHeaderStyle, ["plain", "table"] as const, COMMON_INVALID);

checkNarrower("asFieldFormat", asFieldFormat, ["key-value", "value-only"] as const, COMMON_INVALID);

checkNarrower(
	"asHoverEdgeTypeKey",
	asHoverEdgeTypeKey,
	["link", "semantic", "tag", "hasTag", "similar", "sibling", "sequence", "inheritance", "aggregation"] as const,
	COMMON_INVALID,
);

// ---------------------------------------------------------------------------
// Edge-type flags — flip + read pair; covers every key in EDGE_TYPE_KEYS to
// guarantee no key in the registry is silently absent from PanelState (which
// would slip past TypeScript only if the `satisfies` constraint regressed).
// ---------------------------------------------------------------------------
describe("setEdgeTypeFlag / getEdgeTypeFlag", () => {
	it("EDGE_TYPE_KEYS contains the expected 10 entries", () => {
		expect(EDGE_TYPE_KEYS.length).toBe(10);
		// Sanity: no duplicates.
		expect(new Set(EDGE_TYPE_KEYS).size).toBe(EDGE_TYPE_KEYS.length);
	});

	for (const key of EDGE_TYPE_KEYS) {
		it(`round-trips ${key}`, () => {
			const panel = createDefaultPanelState();
			setEdgeTypeFlag(panel, key, true);
			expect(getEdgeTypeFlag(panel, key)).toBe(true);
			setEdgeTypeFlag(panel, key, false);
			expect(getEdgeTypeFlag(panel, key)).toBe(false);
		});
	}

	it("flipping one edge-type flag does not leak into another", () => {
		const panel = createDefaultPanelState();
		// Capture full edge-flag snapshot, flip just one, re-check the rest.
		const snapshot = EDGE_TYPE_KEYS.map((k) => [k, getEdgeTypeFlag(panel, k)] as const);
		setEdgeTypeFlag(panel, "showLinks", !getEdgeTypeFlag(panel, "showLinks"));
		for (const [k, before] of snapshot) {
			if (k === "showLinks") continue;
			expect(getEdgeTypeFlag(panel, k)).toBe(before);
		}
	});
});

// ---------------------------------------------------------------------------
// Hover edge-type flags — same shape but on panel.hoverEdgeTypes sub-object.
// ---------------------------------------------------------------------------
describe("setHoverEdgeTypeFlag / getHoverEdgeTypeFlag", () => {
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

	for (const key of HOVER_KEYS) {
		it(`round-trips hoverEdgeTypes.${key}`, () => {
			const panel = createDefaultPanelState();
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, key, true);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, key)).toBe(true);
			setHoverEdgeTypeFlag(panel.hoverEdgeTypes, key, false);
			expect(getHoverEdgeTypeFlag(panel.hoverEdgeTypes, key)).toBe(false);
		});
	}

	it("does not mutate sibling keys", () => {
		const panel = createDefaultPanelState();
		const het = panel.hoverEdgeTypes;
		const before: Record<string, boolean> = {};
		for (const k of HOVER_KEYS) before[k] = getHoverEdgeTypeFlag(het, k);
		setHoverEdgeTypeFlag(het, "tag", !before.tag);
		for (const k of HOVER_KEYS) {
			if (k === "tag") continue;
			expect(getHoverEdgeTypeFlag(het, k)).toBe(before[k]);
		}
	});
});
