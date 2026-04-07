import { describe, it, expect } from "vitest";
import {
	deriveOneRule,
	deriveClusterRulesFromQueries,
	deriveClusterRules,
	blendThemeLabel,
	cleanArcName,
	areSavedPositionsValid,
	lightenHex,
	heatmapColor,
	findMatchingGroupPreset,
	resolveNodeColor,
} from "../src/utils/gvc-helpers";
import type { GroupPreset } from "../src/types";

// ---- deriveOneRule ----
describe("deriveOneRule", () => {
	it("returns null for empty string", () => {
		expect(deriveOneRule("", false)).toBeNull();
	});

	it("returns null for whitespace-only", () => {
		expect(deriveOneRule("   ", true)).toBeNull();
	});

	it("derives wildcard rule from tag:*", () => {
		const rule = deriveOneRule("tag:*", false);
		expect(rule).toEqual({ groupBy: "tag:?", recursive: false });
	});

	it("derives wildcard rule with recursive flag", () => {
		const rule = deriveOneRule("tag:*", true);
		expect(rule).toEqual({ groupBy: "tag:?", recursive: true });
	});

	it("derives field rule from non-wildcard leaf", () => {
		const rule = deriveOneRule("node_type:character", false);
		expect(rule).toEqual({ groupBy: "node_type:?", recursive: false });
	});

	it("derives tag rule from compound expression", () => {
		const rule = deriveOneRule("tag:a OR tag:b", false);
		expect(rule).toEqual({ groupBy: "tag:?", recursive: false });
	});
});

// ---- deriveClusterRulesFromQueries ----
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
		expect(rules[0]).toEqual({ groupBy: "tag:?", recursive: true });
	});

	it("processes multiple valid queries", () => {
		const rules = deriveClusterRulesFromQueries([
			{ query: "tag:*", recursive: false },
			{ query: "node_type:char", recursive: true },
		]);
		expect(rules).toHaveLength(2);
	});
});

// ---- deriveClusterRules ----
describe("deriveClusterRules", () => {
	it("returns empty array when no commonQueries or commonQuery", () => {
		const preset = { condition: {} } as GroupPreset;
		expect(deriveClusterRules(preset)).toEqual([]);
	});

	it("uses commonQueries when present", () => {
		const preset = {
			condition: {},
			commonQueries: [{ query: "tag:*", recursive: false }],
		} as unknown as GroupPreset;
		const rules = deriveClusterRules(preset);
		expect(rules).toHaveLength(1);
	});
});

// ---- blendThemeLabel ----
describe("blendThemeLabel", () => {
	it("returns bg unchanged when nodeColor equals bg", () => {
		const color = 0x808080;
		expect(blendThemeLabel(color, color)).toBe(color);
	});

	it("blends black bg toward white nodeColor at 15%", () => {
		const result = blendThemeLabel(0x000000, 0xffffff);
		// 15% of 255 ≈ 38 → 0x262626
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBe(38);
		expect(g).toBe(38);
		expect(b).toBe(38);
	});

	it("blends white bg toward black nodeColor at 15%", () => {
		const result = blendThemeLabel(0xffffff, 0x000000);
		const r = (result >> 16) & 0xff;
		// 255 - 15% of 255 ≈ 217
		expect(r).toBe(217);
	});
});

// ---- cleanArcName ----
describe("cleanArcName", () => {
	it("returns simple name unchanged", () => {
		expect(cleanArcName("hello")).toBe("hello");
	});

	it("strips redundant prefix (same last two segments)", () => {
		expect(cleanArcName("bible-apocrypha/bible-apocrypha")).toBe("bible-apocrypha");
	});

	it("returns last segment for non-redundant path", () => {
		expect(cleanArcName("folder/subfolder/file")).toBe("file");
	});

	it("returns original name when last segment is empty", () => {
		// "foo/" → segments = ["foo", ""], last two differ → returns "" || name = "foo/"
		expect(cleanArcName("foo/")).toBe("foo/");
	});
});

// ---- areSavedPositionsValid ----
describe("areSavedPositionsValid", () => {
	it("returns false for empty map", () => {
		expect(areSavedPositionsValid(new Map(), 800, 600)).toBe(false);
	});

	it("returns true for positions within range", () => {
		const pos = new Map([["a", { x: 100, y: 200 }]]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(true);
	});

	it("returns false when position has NaN", () => {
		const pos = new Map([["a", { x: NaN, y: 0 }]]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});

	it("returns false when position exceeds 5x canvas", () => {
		const pos = new Map([["a", { x: 5000, y: 0 }]]);
		// maxCoord = max(800,600)*5 = 4000, 5000 > 4000 → false
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});

	it("returns true at boundary (exactly 5x)", () => {
		const pos = new Map([["a", { x: 4000, y: 0 }]]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(true);
	});

	it("returns false if Infinity", () => {
		const pos = new Map([["a", { x: Infinity, y: 0 }]]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});
});

// ---- lightenHex ----
describe("lightenHex", () => {
	it("lightens black by 50%", () => {
		const result = lightenHex(0x000000, 0.5);
		const r = (result >> 16) & 0xff;
		// 0 + round(255*0.5) = 128
		expect(r).toBe(128);
	});

	it("clamps to 255 when already white", () => {
		const result = lightenHex(0xffffff, 0.5);
		expect(result).toBe(0xffffff);
	});

	it("factor 0 returns same color", () => {
		expect(lightenHex(0x336699, 0)).toBe(0x336699);
	});
});

// ---- heatmapColor ----
describe("heatmapColor", () => {
	it("returns cold blue at degree 0", () => {
		const result = heatmapColor(0, 10);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBe(59); // 0x3b
		expect(g).toBe(130); // 0x82
		expect(b).toBe(246); // 0xf6
	});

	it("returns warm red at max degree", () => {
		const result = heatmapColor(10, 10);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBe(239); // 0xef
		expect(g).toBe(68); // 0x44
		expect(b).toBe(68); // 0x44
	});

	it("clamps at t=1 when degree exceeds maxDegree", () => {
		expect(heatmapColor(20, 10)).toBe(heatmapColor(10, 10));
	});

	it("handles maxDegree=0 gracefully", () => {
		// max(1, 0) = 1, so t = min(1, 5/1) = 1 → warm red
		const result = heatmapColor(5, 0);
		expect(result).toBe(heatmapColor(10, 10));
	});
});

// ---- findMatchingGroupPreset ----
describe("findMatchingGroupPreset", () => {
	const presets: GroupPreset[] = [
		{ condition: { layout: "force", tagDisplay: "node" } } as GroupPreset,
		{ condition: { layout: "cluster" } } as GroupPreset,
		{ condition: {} } as GroupPreset,
	];

	it("returns first matching preset", () => {
		expect(findMatchingGroupPreset(presets, "force", "node")).toBe(presets[0]);
	});

	it("skips non-matching layout", () => {
		expect(findMatchingGroupPreset(presets, "cluster", "node")).toBe(presets[1]);
	});

	it("matches unconditional preset as fallback", () => {
		expect(findMatchingGroupPreset(presets, "timeline", "inline")).toBe(presets[2]);
	});

	it("returns null for empty presets", () => {
		expect(findMatchingGroupPreset([], "force", "node")).toBeNull();
	});
});

// ---- resolveNodeColor ----
describe("resolveNodeColor", () => {
	const colorMap = new Map([
		["character", "#ff0000"],
		["tag:action", "#00ff00"],
	]);

	it("returns category color when present", () => {
		expect(resolveNodeColor({ category: "character" }, colorMap, "#999")).toBe("#ff0000");
	});

	it("falls back to first tag color", () => {
		expect(resolveNodeColor({ tags: ["action", "drama"] }, colorMap, "#999")).toBe("#00ff00");
	});

	it("returns default when no match", () => {
		expect(resolveNodeColor({ category: "unknown" }, colorMap, "#999")).toBe("#999");
	});

	it("returns default for empty node", () => {
		expect(resolveNodeColor({}, colorMap, "#999")).toBe("#999");
	});

	it("prefers category over tag", () => {
		expect(resolveNodeColor({ category: "character", tags: ["action"] }, colorMap, "#999")).toBe("#ff0000");
	});
});
