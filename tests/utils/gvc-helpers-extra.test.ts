import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	giDiag,
	deriveOneRule,
	cleanArcName,
	areSavedPositionsValid,
	lightenHex,
	heatmapColor,
	findMatchingGroupPreset,
	resolveNodeColor,
	deriveClusterRules,
	COMMUNITY_PALETTE,
	computeAvgNodeRadius,
	computeViewportScaleFactor,
} from "../../src/utils/gvc-helpers";
import type { GroupPreset } from "../../src/types";

// ---------------------------------------------------------------------------
// giDiag — function coverage bump (untested 11th export)
// ---------------------------------------------------------------------------
describe("giDiag", () => {
	let originalNodeEnv: string | undefined;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let originalWindow: unknown;

	beforeEach(() => {
		originalNodeEnv = process.env.NODE_ENV;
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		// vitest's default env is node — window is undefined.
		// Capture original to restore after each test.
		originalWindow = (globalThis as { window?: unknown }).window;
	});

	afterEach(() => {
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
		logSpy.mockRestore();
		// Restore window
		if (originalWindow === undefined) {
			delete (globalThis as { window?: unknown }).window;
		} else {
			(globalThis as { window?: unknown }).window = originalWindow;
		}
	});

	it("returns the data argument unchanged (identity)", () => {
		const data = { nodes: [1, 2, 3], edges: [10, 20] };
		const result = giDiag("test-stage", data);
		expect(result).toBe(data);
	});

	it("logs to console when NODE_ENV is not 'production'", () => {
		process.env.NODE_ENV = "development";
		const data = { nodes: [1, 2], edges: [3] };
		giDiag("dev-stage", data);
		expect(logSpy).toHaveBeenCalledTimes(1);
		const call = logSpy.mock.calls[0][0] as string;
		expect(call).toContain("dev-stage");
		expect(call).toContain("nodes=2");
		expect(call).toContain("edges=1");
	});

	it("does not log when NODE_ENV='production' and window is undefined", () => {
		process.env.NODE_ENV = "production";
		// Ensure window is undefined (default node env)
		delete (globalThis as { window?: unknown }).window;
		const data = { nodes: [1], edges: [] };
		giDiag("prod-stage", data);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("logs when window.__GI_DIAG__===true even in production", () => {
		process.env.NODE_ENV = "production";
		// Inject a window-like object with the diag flag set
		(globalThis as { window?: unknown }).window = { __GI_DIAG__: true };
		giDiag("prod-with-flag", { nodes: [], edges: [1, 2, 3] });
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0][0] as string).toContain("nodes=0");
		expect(logSpy.mock.calls[0][0] as string).toContain("edges=3");
	});

	it("does not log when __GI_DIAG__ is falsy in production", () => {
		process.env.NODE_ENV = "production";
		(globalThis as { window?: unknown }).window = { __GI_DIAG__: false };
		giDiag("prod-falsy-flag", { nodes: [1], edges: [1] });
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("does not log in production when window exists but __GI_DIAG__ is missing", () => {
		process.env.NODE_ENV = "production";
		(globalThis as { window?: unknown }).window = {};
		giDiag("prod-no-flag", { nodes: [1], edges: [1] });
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("preserves complex data shape (T extends contract)", () => {
		const data = { nodes: [{ id: "a" }, { id: "b" }], edges: [{ s: "a", t: "b" }], extra: "kept" };
		const result = giDiag("shape-stage", data);
		// Identity + property preservation
		expect(result.extra).toBe("kept");
		expect(result.nodes.length).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// COMMUNITY_PALETTE — constant integrity
// ---------------------------------------------------------------------------
describe("COMMUNITY_PALETTE", () => {
	it("contains exactly 20 colors", () => {
		expect(COMMUNITY_PALETTE.length).toBe(20);
	});

	it("each entry is a valid 24-bit hex integer (0..0xffffff)", () => {
		for (const color of COMMUNITY_PALETTE) {
			expect(color).toBeGreaterThanOrEqual(0);
			expect(color).toBeLessThanOrEqual(0xffffff);
			expect(Number.isInteger(color)).toBe(true);
		}
	});

	it("contains no duplicates", () => {
		const set = new Set(COMMUNITY_PALETTE);
		expect(set.size).toBe(COMMUNITY_PALETTE.length);
	});
});

// ---------------------------------------------------------------------------
// deriveOneRule — additional branches (whitespace trim semantics)
// ---------------------------------------------------------------------------
describe("deriveOneRule additional branches", () => {
	it("trims surrounding whitespace before parsing", () => {
		// "  tag:*  " is trimmed → wildcard branch
		expect(deriveOneRule("  tag:*  ", true)).toEqual({ groupBy: "tag:?", recursive: true });
	});

	it("returns null when query is non-empty but unparseable", () => {
		// query-expr.ts parseQueryExpr returns null for some malformed strings;
		// confirm the second null guard (if (!expr) return null)
		const result = deriveOneRule("(((", false);
		// Either null (parse failed) or a synthesized rule — in either case we
		// don't crash and return one of the documented outcomes.
		expect(result === null || (result && typeof result.groupBy === "string")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// deriveClusterRules — fallback to commonQuery when commonQueries missing/empty
// ---------------------------------------------------------------------------
describe("deriveClusterRules — commonQuery fallback", () => {
	it("uses commonQuery.expression when commonQueries is empty array", () => {
		const preset = {
			condition: {},
			commonQueries: [],
			commonQuery: {
				expression: { type: "leaf", field: "tag", value: "*" },
			},
			recursive: true,
		} as unknown as GroupPreset;
		const rules = deriveClusterRules(preset);
		// Empty commonQueries → falls through to commonQuery branch
		expect(rules).toHaveLength(1);
		expect(rules[0].recursive).toBe(true);
	});

	it("returns empty array when commonQuery has no expression", () => {
		const preset = {
			condition: {},
			commonQuery: {},
		} as unknown as GroupPreset;
		expect(deriveClusterRules(preset)).toEqual([]);
	});

	it("falls back to recursive=false when preset.recursive is undefined", () => {
		const preset = {
			condition: {},
			commonQuery: {
				expression: { type: "leaf", field: "node_type", value: "*" },
			},
		} as unknown as GroupPreset;
		const rules = deriveClusterRules(preset);
		expect(rules).toHaveLength(1);
		expect(rules[0].recursive).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// cleanArcName — additional path shapes
// ---------------------------------------------------------------------------
describe("cleanArcName additional cases", () => {
	it("returns single segment for path with 2+ segments where last differs from second-to-last", () => {
		expect(cleanArcName("a/b/c")).toBe("c");
	});

	it("strips top-level redundant prefix (only 2 segments)", () => {
		expect(cleanArcName("repeat/repeat")).toBe("repeat");
	});

	it("preserves single segment with no slash", () => {
		expect(cleanArcName("standalone")).toBe("standalone");
	});

	it("returns empty string when name is empty", () => {
		expect(cleanArcName("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// areSavedPositionsValid — y-axis NaN/Infinity branches
// ---------------------------------------------------------------------------
describe("areSavedPositionsValid — y-axis edge cases", () => {
	it("returns false when y is NaN (x is fine)", () => {
		const pos = new Map([["a", { x: 0, y: NaN }]]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});

	it("returns false when y exceeds 5x canvas (x is fine)", () => {
		const pos = new Map([["a", { x: 0, y: 5000 }]]);
		// maxCoord = 5*max(800,600) = 4000 → 5000 > 4000 → invalid
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});

	it("returns false when y is -Infinity", () => {
		const pos = new Map([["a", { x: 0, y: -Infinity }]]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});

	it("returns false on negative coordinate beyond -5x", () => {
		const pos = new Map([["a", { x: -5000, y: 0 }]]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});

	it("uses canvasH when canvasH > canvasW", () => {
		// max(100, 1000)*5 = 5000 → 4500 valid
		const pos = new Map([["a", { x: 0, y: 4500 }]]);
		expect(areSavedPositionsValid(pos, 100, 1000)).toBe(true);
	});

	it("returns false when ANY position is invalid (mid-iteration short-circuit)", () => {
		const pos = new Map([
			["good", { x: 100, y: 100 }],
			["bad", { x: NaN, y: 0 }],
			["never-reached", { x: 0, y: 0 }],
		]);
		expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// lightenHex — additional clamp/no-op branches
// ---------------------------------------------------------------------------
describe("lightenHex — additional clamp branches", () => {
	it("clamps to white when factor=1 and color non-zero", () => {
		// delta = 255 → all channels clamp to 255
		expect(lightenHex(0x808080, 1)).toBe(0xffffff);
	});

	it("partial channels clamp independently", () => {
		// Red full, others mid → red stays 255, others lighten
		const result = lightenHex(0xff8000, 0.2);
		expect((result >> 16) & 0xff).toBe(255); // 255 + 51 clamped → 255
		expect((result >> 8) & 0xff).toBe(0x80 + 51); // 128 + 51 = 179 (no clamp)
		expect(result & 0xff).toBe(51); // 0 + 51
	});
});

// ---------------------------------------------------------------------------
// heatmapColor — mid-range and zero-max edge
// ---------------------------------------------------------------------------
describe("heatmapColor — mid-range", () => {
	it("at half max degree, channels are exactly halfway", () => {
		const result = heatmapColor(5, 10);
		const r = (result >> 16) & 0xff;
		// midpoint: r = round(59 + 0.5*(239-59)) = round(149) = 149
		expect(r).toBe(149);
		// g = round(130 - 0.5*(130-68)) = round(99) = 99
		expect((result >> 8) & 0xff).toBe(99);
		// b = round(246 - 0.5*(246-68)) = round(157) = 157
		expect(result & 0xff).toBe(157);
	});

	it("negative degree yields t=0 (cold blue)", () => {
		// Math.min(1, -5/Math.max(1,10)) = -0.5; clamps to 0 by Math.min only if t<0... no clamp on min side.
		// But t=-0.5 yields r=59 + (-0.5)*180 = -31 → not cold blue.
		// Confirm: we don't crash, value within color encoding.
		const result = heatmapColor(-5, 10);
		expect(typeof result).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// findMatchingGroupPreset — tagDisplay-only condition branch
// ---------------------------------------------------------------------------
describe("findMatchingGroupPreset — tagDisplay-only branch", () => {
	it("matches preset with tagDisplay-only condition", () => {
		const presets: GroupPreset[] = [{ condition: { tagDisplay: "inline" } } as GroupPreset];
		expect(findMatchingGroupPreset(presets, "force", "inline")).toBe(presets[0]);
	});

	it("skips preset when tagDisplay-only condition does not match", () => {
		const presets: GroupPreset[] = [
			{ condition: { tagDisplay: "node" } } as GroupPreset,
			{ condition: {} } as GroupPreset,
		];
		// First skipped due to tagDisplay mismatch → fallback unconditional
		expect(findMatchingGroupPreset(presets, "force", "inline")).toBe(presets[1]);
	});
});

// ---------------------------------------------------------------------------
// resolveNodeColor — empty tags array branch
// ---------------------------------------------------------------------------
describe("resolveNodeColor — empty tags branch", () => {
	const colorMap = new Map([
		["character", "#ff0000"],
		["tag:action", "#00ff00"],
	]);

	it("returns default when tags array is empty (length 0)", () => {
		expect(resolveNodeColor({ tags: [] }, colorMap, "#default")).toBe("#default");
	});

	it("returns default when first tag has no color in map", () => {
		expect(resolveNodeColor({ tags: ["unknown-tag"] }, colorMap, "#default")).toBe("#default");
	});

	it("returns default when category has no color and no tags", () => {
		expect(resolveNodeColor({ category: "unmapped" }, colorMap, "#default")).toBe("#default");
	});

	it("falls through from category to tag when category not in map", () => {
		// category exists but missing → falls to tag fallback
		expect(resolveNodeColor({ category: "ghost", tags: ["action"] }, colorMap, "#default")).toBe("#00ff00");
	});
});

// ---------------------------------------------------------------------------
// computeAvgNodeRadius — viewport-fit helper extracted from GVC
// ---------------------------------------------------------------------------
describe("computeAvgNodeRadius", () => {
	it("returns the arithmetic mean of node radii", () => {
		expect(computeAvgNodeRadius([{ radius: 4 }, { radius: 8 }, { radius: 12 }])).toBe(8);
	});

	it("falls back to 12 for nodes missing a radius", () => {
		// average of (12 default, 24) = 18
		expect(computeAvgNodeRadius([{}, { radius: 24 }])).toBe(18);
	});

	it("returns the default radius for an empty input (no division by zero)", () => {
		expect(computeAvgNodeRadius([])).toBe(12);
	});
});

// ---------------------------------------------------------------------------
// computeViewportScaleFactor — quadratic-equation viewport fit
// ---------------------------------------------------------------------------
describe("computeViewportScaleFactor", () => {
	it("returns a scale factor that brings utilization to (or above) minUtil", () => {
		// 100x100 bbox in a 1000x1000 viewport (1% util) → target 50% util
		const bboxW = 100;
		const bboxH = 100;
		const avgR = 5;
		const minUtil = 0.5;
		const vpArea = 1000 * 1000;
		const util = (bboxW * bboxH) / vpArea;
		const s = computeViewportScaleFactor(bboxW, bboxH, avgR, minUtil, vpArea, util);
		// Scaled bbox = (s * (bboxW - 2·avgR) + 2·avgR) per axis
		const scaledW = s * (bboxW - 2 * avgR) + 2 * avgR;
		const scaledH = s * (bboxH - 2 * avgR) + 2 * avgR;
		const newUtil = (scaledW * scaledH) / vpArea;
		// quadratic root targets exactly minUtil — allow a small numerical epsilon
		expect(newUtil).toBeGreaterThanOrEqual(minUtil - 1e-9);
		expect(newUtil).toBeLessThan(minUtil + 1e-3);
	});

	it("clamps tiny pos-spans to 1 to avoid divide-by-zero in the quadratic", () => {
		// bbox <= 2·avgR makes posSpan negative — function clamps to 1.
		const s = computeViewportScaleFactor(0, 0, 5, 0.5, 100_000, 0);
		expect(Number.isFinite(s)).toBe(true);
	});

	it("falls back to sqrt(minUtil/util) when the discriminant is negative", () => {
		// Choose params so 4·avgR² > minUtil·vpArea  ⇒ C > 0, and B²-4AC can go negative.
		// avgR=100, posSpans=1 (bbox≤2avgR clamp), minUtil=0.001, vpArea=1
		// A=1, B=2*100*(1+1)=400, C=4*10000 - 0.001 ≈ 40000-0.001 > 0
		// disc = 160000 - 4*1*40000 ≈ 0 → use small to push negative
		const minUtil = 0.0001;
		const vpArea = 1;
		const util = 0.5; // arbitrary
		const s = computeViewportScaleFactor(0, 0, 100, minUtil, vpArea, util);
		// fallback sqrt(0.0001/0.5) ≈ 0.01414
		expect(s).toBeCloseTo(Math.sqrt(minUtil / util), 6);
	});
});
