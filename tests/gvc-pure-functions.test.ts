import { describe, it, expect, vi } from "vitest";

vi.mock("pixi.js", () => ({}));

import {
	deriveOneRule,
	deriveClusterRulesFromQueries,
	deriveClusterRules,
	blendThemeLabel,
	lightenHex,
	cleanArcName,
	areSavedPositionsValid,
} from "../src/utils/gvc-helpers";
import { hexToRgb } from "../src/utils/color";
import type { GroupPreset } from "../src/types";

// ---------------------------------------------------------------------------
// deriveOneRule — query string → ClusterGroupRule
// ---------------------------------------------------------------------------
describe("deriveOneRule", () => {
	it("returns null for empty string", () => {
		expect(deriveOneRule("", false)).toBeNull();
	});

	it("returns null for whitespace-only string", () => {
		expect(deriveOneRule("   ", true)).toBeNull();
	});

	it("handles wildcard pattern tag:*", () => {
		const rule = deriveOneRule("tag:*", false);
		expect(rule).not.toBeNull();
		expect(rule!.groupBy).toBe("tag:?");
		expect(rule!.recursive).toBe(false);
	});

	it("handles wildcard pattern category:*", () => {
		const rule = deriveOneRule("category:*", true);
		expect(rule).not.toBeNull();
		expect(rule!.groupBy).toBe("category:?");
		expect(rule!.recursive).toBe(true);
	});

	it("handles non-wildcard leaf query", () => {
		const rule = deriveOneRule("tag:character", false);
		expect(rule).not.toBeNull();
		expect(rule!.groupBy).toContain("tag:?");
	});

	it("preserves recursive flag", () => {
		const ruleTrue = deriveOneRule("tag:*", true);
		const ruleFalse = deriveOneRule("tag:*", false);
		expect(ruleTrue!.recursive).toBe(true);
		expect(ruleFalse!.recursive).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// deriveClusterRulesFromQueries — pipeline
// ---------------------------------------------------------------------------
describe("deriveClusterRulesFromQueries", () => {
	it("returns empty array for empty input", () => {
		expect(deriveClusterRulesFromQueries([])).toEqual([]);
	});

	it("filters out invalid queries", () => {
		const rules = deriveClusterRulesFromQueries([
			{ query: "", recursive: false },
			{ query: "tag:*", recursive: true },
		]);
		expect(rules).toHaveLength(1);
		expect(rules[0].recursive).toBe(true);
	});

	it("processes multiple valid queries", () => {
		const rules = deriveClusterRulesFromQueries([
			{ query: "tag:*", recursive: false },
			{ query: "category:*", recursive: true },
		]);
		expect(rules).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// deriveClusterRules — preset handler
// ---------------------------------------------------------------------------
describe("deriveClusterRules", () => {
	it("returns empty array for preset with no queries", () => {
		const preset: GroupPreset = {
			condition: {},
			groups: [],
		};
		expect(deriveClusterRules(preset)).toEqual([]);
	});

	it("uses commonQueries when present", () => {
		const preset: GroupPreset = {
			condition: {},
			groups: [],
			commonQueries: [{ query: "tag:*", recursive: true }],
		};
		const rules = deriveClusterRules(preset);
		expect(rules).toHaveLength(1);
		expect(rules[0].recursive).toBe(true);
	});

	it("prefers commonQueries over legacy commonQuery", () => {
		const preset: GroupPreset = {
			condition: {},
			groups: [],
			commonQueries: [{ query: "tag:*", recursive: false }],
			commonQuery: { expression: { type: "leaf", field: "category", value: "*" } },
		};
		const rules = deriveClusterRules(preset);
		// Should use commonQueries, not legacy
		expect(rules).toHaveLength(1);
		expect(rules[0].groupBy).toContain("tag");
	});

	it("falls back to legacy commonQuery when commonQueries is empty", () => {
		const preset: GroupPreset = {
			condition: {},
			groups: [],
			commonQueries: [],
			commonQuery: { expression: { type: "leaf", field: "tag", value: "*" } },
		};
		const rules = deriveClusterRules(preset);
		expect(rules).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// blendThemeLabel — 15% color blend
// ---------------------------------------------------------------------------
describe("blendThemeLabel", () => {
	it("blends black bg with white node → slight lightening", () => {
		const result = blendThemeLabel(0x000000, 0xffffff);
		const { r, g, b } = hexToRgb(result);
		// 0 + (255-0)*0.15 = 38.25 → 38
		expect(r).toBeCloseTo(38, 0);
		expect(g).toBeCloseTo(38, 0);
		expect(b).toBeCloseTo(38, 0);
	});

	it("blends white bg with black node → slight darkening", () => {
		const result = blendThemeLabel(0xffffff, 0x000000);
		const { r, g, b } = hexToRgb(result);
		// 255 + (0-255)*0.15 = 255 - 38.25 = 216.75 → 217
		expect(r).toBeCloseTo(217, 0);
		expect(g).toBeCloseTo(217, 0);
		expect(b).toBeCloseTo(217, 0);
	});

	it("same colors produce same color", () => {
		expect(blendThemeLabel(0x808080, 0x808080)).toBe(0x808080);
	});

	it("handles pure red channel blending", () => {
		const result = blendThemeLabel(0xff0000, 0x00ff00);
		const { r, g, b } = hexToRgb(result);
		// R: 255 + (0-255)*0.15 = 216.75 → 217
		// G: 0 + (255-0)*0.15 = 38.25 → 38
		expect(r).toBeCloseTo(217, 0);
		expect(g).toBeCloseTo(38, 0);
		expect(b).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// lightenHex — additive lightening
// ---------------------------------------------------------------------------
describe("lightenHex", () => {
	it("factor=0 returns original color", () => {
		expect(lightenHex(0x336699, 0)).toBe(0x336699);
	});

	it("factor=1 produces white", () => {
		expect(lightenHex(0x000000, 1)).toBe(0xffffff);
	});

	it("clamps at 255 for bright colors", () => {
		const result = lightenHex(0xffffff, 0.5);
		expect(result).toBe(0xffffff);
	});

	it("lightens dark color by 20%", () => {
		const result = lightenHex(0x000000, 0.2);
		const { r, g, b } = hexToRgb(result);
		// 0 + round(255*0.2) = 51
		expect(r).toBe(51);
		expect(g).toBe(51);
		expect(b).toBe(51);
	});

	it("partially lightens mid-tone color", () => {
		const orig = hexToRgb(0x808080);
		const result = lightenHex(0x808080, 0.1);
		const lit = hexToRgb(result);
		expect(lit.r).toBeGreaterThan(orig.r);
		expect(lit.g).toBeGreaterThan(orig.g);
		expect(lit.b).toBeGreaterThan(orig.b);
	});

	it("handles per-channel clamping independently", () => {
		// R=200, G=100, B=50 + factor=0.5 → R=min(255,200+128)=255, G=228, B=178
		const result = lightenHex(0xc86432, 0.5);
		const { r, g, b } = hexToRgb(result);
		expect(r).toBe(255); // clamped
		expect(g).toBeLessThan(255);
		expect(b).toBeLessThan(255);
	});
});

// ---------------------------------------------------------------------------
// cleanArcName — strip redundant path prefixes from sunburst arc names
// ---------------------------------------------------------------------------

describe("cleanArcName", () => {
	it("returns simple name unchanged", () => {
		expect(cleanArcName("Characters")).toBe("Characters");
	});

	it("strips redundant folder/folder pattern", () => {
		expect(cleanArcName("bible-apocrypha/bible-apocrypha")).toBe("bible-apocrypha");
	});

	it("returns last segment for distinct parent/child", () => {
		expect(cleanArcName("classic-hamlet/episodes")).toBe("episodes");
	});

	it("handles deeply nested paths", () => {
		expect(cleanArcName("a/b/c/c")).toBe("c");
	});

	it("handles deeply nested non-matching paths", () => {
		expect(cleanArcName("a/b/c/d")).toBe("d");
	});

	it("returns name if trailing slash leaves empty segment", () => {
		expect(cleanArcName("folder/")).toBe("folder/");
	});

	it("handles single character names", () => {
		expect(cleanArcName("A")).toBe("A");
	});

	it("handles Japanese names", () => {
		expect(cleanArcName("よ")).toBe("よ");
	});

	it("handles path with Japanese folder", () => {
		expect(cleanArcName("mythology-japanese/mythology-japanese")).toBe("mythology-japanese");
	});
});

// ---------------------------------------------------------------------------
// areSavedPositionsValid — detect extreme coordinates from non-force layouts
// ---------------------------------------------------------------------------

describe("areSavedPositionsValid", () => {
	it("returns false for empty map", () => {
		expect(areSavedPositionsValid(new Map(), 800, 600)).toBe(false);
	});

	it("returns true for positions within canvas range", () => {
		const positions = new Map([
			["a", { x: 100, y: 200 }],
			["b", { x: -300, y: 400 }],
		]);
		expect(areSavedPositionsValid(positions, 800, 600)).toBe(true);
	});

	it("returns false when any position has NaN", () => {
		const positions = new Map([
			["a", { x: 100, y: 200 }],
			["b", { x: NaN, y: 400 }],
		]);
		expect(areSavedPositionsValid(positions, 800, 600)).toBe(false);
	});

	it("returns false when any position has Infinity", () => {
		const positions = new Map([["a", { x: Infinity, y: 200 }]]);
		expect(areSavedPositionsValid(positions, 800, 600)).toBe(false);
	});

	it("returns false for extreme coordinates (sunburst-like)", () => {
		// Sunburst produces Y values like -82000 for 800x600 canvas
		const positions = new Map([["a", { x: -245, y: -82662 }]]);
		// maxCoord = 800 * 5 = 4000, |-82662| > 4000
		expect(areSavedPositionsValid(positions, 800, 600)).toBe(false);
	});

	it("returns true for positions at boundary of valid range", () => {
		// maxCoord = max(800,600)*5 = 4000
		const positions = new Map([["a", { x: 3999, y: -3999 }]]);
		expect(areSavedPositionsValid(positions, 800, 600)).toBe(true);
	});

	it("returns false when just over boundary", () => {
		const positions = new Map([["a", { x: 4001, y: 0 }]]);
		expect(areSavedPositionsValid(positions, 800, 600)).toBe(false);
	});

	it("uses larger dimension for threshold", () => {
		// Canvas 400x1000, maxCoord = 1000*5 = 5000
		const positions = new Map([["a", { x: 4500, y: 0 }]]);
		expect(areSavedPositionsValid(positions, 400, 1000)).toBe(true);
	});
});
