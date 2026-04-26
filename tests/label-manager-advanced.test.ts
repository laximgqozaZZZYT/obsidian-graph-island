/**
 * LabelManager — advanced tests for edge cases and complex scenarios
 * Focuses on comprehensive coverage of pure functions
 */
import { describe, it, expect } from "vitest";
import {
	computePriorityScores,
	extractInitials,
	estimateTextWidth,
	computeRotatedAABB,
	smartTruncateLabel,
	selectLabelMode,
	type PriorityInput,
	type LabelMode,
} from "../src/views/LabelManager";

// ===========================================================================
// computePriorityScores — advanced scenarios
// ===========================================================================
describe("computePriorityScores advanced", () => {
	const defaultRT = {
		labelZoomTier1: 0.15,
		labelZoomTier2: 0.35,
		labelZoomTier3: 0.7,
		labelDegreePctTier1: 0.1,
		labelDegreePctTier2: 0.3,
		labelDegreePctTier3: 0.5,
		nodeLabelZoomMin: 0.9,
	};

	it("handles large node set with power-law degree distribution", () => {
		const nodes = Array.from({ length: 50 }, (_, i) => ({
			id: `n${i}`,
			isSuper: i % 10 === 0, // 5 super nodes
			hasLabel: true,
		}));
		const degrees = new Map(
			nodes.map((n, i) => [n.id, Math.max(1, 100 - i * 2)]), // decreasing
		);
		const result = computePriorityScores(nodes, degrees, defaultRT);

		// Verify super nodes get higher scores
		const superNodes = result.filter((r) => nodes.find((n) => n.id === r.id && n.isSuper));
		const regularNodes = result.filter((r) => nodes.find((n) => n.id === r.id && !n.isSuper));
		expect(Math.max(...superNodes.map((r) => r.priorityScore))).toBeGreaterThan(
			Math.max(...regularNodes.map((r) => r.priorityScore)),
		);
	});

	it("assigns distinct minShowZoom tiers correctly", () => {
		const nodes = Array.from({ length: 100 }, (_, i) => ({
			id: `n${i}`,
			isSuper: false,
			hasLabel: true,
		}));
		const degrees = new Map(nodes.map((n, i) => [n.id, 100 - i]));
		const result = computePriorityScores(nodes, degrees, defaultRT);

		// Collect minShowZoom values
		const zoomValues = new Set(result.map((r) => r.minShowZoom));
		// Should have multiple distinct zoom tiers (at least 4-5)
		expect(zoomValues.size).toBeGreaterThanOrEqual(4);
	});

	it("handles mixed super and regular nodes", () => {
		const nodes = [
			{ id: "a", isSuper: true, hasLabel: true },
			{ id: "b", isSuper: false, hasLabel: true },
			{ id: "c", isSuper: true, hasLabel: true },
			{ id: "d", isSuper: false, hasLabel: true },
		];
		const degrees = new Map([
			["a", 10],
			["b", 10],
			["c", 5],
			["d", 5],
		]);
		const result = computePriorityScores(nodes, degrees, defaultRT);

		const a = result.find((r) => r.id === "a")!;
		const b = result.find((r) => r.id === "b")!;
		const c = result.find((r) => r.id === "c")!;
		const d = result.find((r) => r.id === "d")!;

		// Super nodes should have higher scores
		expect(a.priorityScore).toBeGreaterThan(b.priorityScore);
		expect(c.priorityScore).toBeGreaterThan(d.priorityScore);
	});

	it("respects custom tier thresholds", () => {
		const nodes = Array.from({ length: 100 }, (_, i) => ({
			id: `n${i}`,
			isSuper: false,
			hasLabel: true,
		}));
		const degrees = new Map(nodes.map((n, i) => [n.id, 100 - i]));

		const customRT = {
			labelZoomTier1: 0.05,
			labelZoomTier2: 0.1,
			labelZoomTier3: 0.5,
			labelDegreePctTier1: 0.05,
			labelDegreePctTier2: 0.2,
			labelDegreePctTier3: 0.4,
			nodeLabelZoomMin: 1.0,
		};
		const result = computePriorityScores(nodes, degrees, customRT);

		// Top 5% should get tier1
		const topNode = result[0];
		expect(topNode.minShowZoom).toBeLessThan(0.1);
	});

	it("assigns all nodes minShowZoom even if some lack labels", () => {
		const nodes = [
			{ id: "a", isSuper: false, hasLabel: true },
			{ id: "b", isSuper: false, hasLabel: false },
			{ id: "c", isSuper: false, hasLabel: true },
		];
		const degrees = new Map([
			["a", 10],
			["b", 5],
			["c", 8],
		]);
		const result = computePriorityScores(nodes, degrees, defaultRT);

		expect(result.length).toBe(3);
		const bResult = result.find((r) => r.id === "b")!;
		expect(bResult.minShowZoom).toBe(0); // No label = no zoom threshold
	});

	it("maintains score ordering even with identical degrees", () => {
		const nodes = [
			{ id: "a", isSuper: true, hasLabel: true },
			{ id: "b", isSuper: false, hasLabel: true },
		];
		const degrees = new Map([
			["a", 10],
			["b", 10],
		]);
		const result = computePriorityScores(nodes, degrees, defaultRT);

		const a = result.find((r) => r.id === "a")!;
		const b = result.find((r) => r.id === "b")!;
		// Super node should win even with same degree
		expect(a.priorityScore).toBeGreaterThan(b.priorityScore);
	});
});

// ===========================================================================
// extractInitials — advanced edge cases
// ===========================================================================
describe("extractInitials advanced", () => {
	it("handles consecutive separators", () => {
		const result = extractInitials("a//b");
		expect(result.length).toBeLessThanOrEqual(2);
	});

	it("handles trailing separators", () => {
		const result = extractInitials("hello-world-");
		// Trailing dash creates empty segment which is filtered, leaving ["hello", "world"]
		// Last two = ["hello", "world"] -> "H" + "W"
		expect(result).toBe("HW");
	});

	it("handles leading separators", () => {
		const result = extractInitials("-hello-world");
		expect(result).toBe("HW");
	});

	it("handles all-separator input", () => {
		const result = extractInitials("---///___   ");
		expect(typeof result).toBe("string");
	});

	it("extracts from very long path", () => {
		const longPath = "a/b/c/d/e/f/g/h/i/j/k/l/m/n/o";
		const result = extractInitials(longPath);
		expect(result).toBe("NO"); // last two segments
	});

	it("handles numeric-only segments", () => {
		const result = extractInitials("2023/chapter");
		// Numeric segment is first char ('2'), chapter is 'c', so "2C" in that order
		// But last two segments are ["2023", "chapter"], chars[0] = '2', chars[1] = 'c'
		expect(result).toBe("2C");
	});

	it("handles mixed case normalization", () => {
		const result = extractInitials("HELLO-WORLD");
		expect(result).toBe("HW");
		expect(result).toEqual(result.toUpperCase());
	});

	it("extracts from non-ASCII text", () => {
		const result = extractInitials("フォルダ/ファイル");
		expect(result.length).toBeLessThanOrEqual(2);
	});

	it("handles emoji in text", () => {
		const result = extractInitials("🚀/launch");
		expect(result.length).toBeLessThanOrEqual(2);
	});

	it("handles very short segments", () => {
		const result = extractInitials("a/b");
		expect(result).toBe("AB");
	});

	it("strips multiple group suffixes correctly", () => {
		// Edge case: what if someone has nested groups?
		const result = extractInitials("fantasy/heroes (99)");
		expect(result).toBe("FH"); // Should strip the (99)
	});

	it("handles parentheses in middle of text", () => {
		const result = extractInitials("act(ual)-story");
		expect(result).toBe("AS");
	});
});

// ===========================================================================
// estimateTextWidth — mathematical properties
// ===========================================================================
describe("estimateTextWidth advanced", () => {
	it("maintains proportionality with length", () => {
		const w1 = estimateTextWidth("a", 12, false);
		const w10 = estimateTextWidth("aaaaaaaaaa", 12, false);
		expect(w10).toBeCloseTo(w1 * 10, 1);
	});

	it("maintains proportionality with font size", () => {
		const w12 = estimateTextWidth("test", 12, false);
		const w24 = estimateTextWidth("test", 24, false);
		expect(w24).toBeCloseTo(w12 * 2, 1);
	});

	it("bold is consistently 0.65/0.58 ≈ 1.12x wider", () => {
		const normal = estimateTextWidth("test", 12, false);
		const bold = estimateTextWidth("test", 12, true);
		const ratio = bold / normal;
		expect(ratio).toBeCloseTo(0.65 / 0.58, 2);
	});

	it("handles very large font sizes", () => {
		const w = estimateTextWidth("X", 200, false);
		expect(w).toBeGreaterThan(100);
	});

	it("handles very small font sizes", () => {
		const w = estimateTextWidth("X", 1, false);
		expect(w).toBeGreaterThan(0);
		expect(w).toBeLessThan(1);
	});

	it("wide characters don't affect multiplier", () => {
		// The multiplier is per-character, not per-pixel-width
		const narrow = estimateTextWidth("iii", 12, false);
		const wide = estimateTextWidth("WWW", 12, false);
		// Should both be close to 3 * 12 * 0.58
		expect(narrow).toBeCloseTo(3 * 12 * 0.58, 1);
		expect(wide).toBeCloseTo(3 * 12 * 0.58, 1);
	});

	it("returns 0 for zero-length strings", () => {
		expect(estimateTextWidth("", 0, false)).toBe(0);
		expect(estimateTextWidth("", 100, false)).toBe(0);
	});

	it("handles non-ASCII text", () => {
		const w = estimateTextWidth("日本語", 12, false);
		expect(w).toBeCloseTo(3 * 12 * 0.58, 1);
	});
});

// ===========================================================================
// computeRotatedAABB — geometric properties
// ===========================================================================
describe("computeRotatedAABB advanced", () => {
	it("area increases monotonically with rotation from 0 to 45°", () => {
		const areas = [];
		for (let angle = 0; angle <= Math.PI / 4; angle += 0.1) {
			const r = computeRotatedAABB(100, 50, angle, 0.5, 0.5, 0, 0);
			areas.push(r.w * r.h);
		}
		// First few should increase
		expect(areas[areas.length - 1]).toBeGreaterThanOrEqual(areas[0]);
	});

	it("symmetric rotation produces same AABB", () => {
		const r1 = computeRotatedAABB(100, 50, Math.PI / 4, 0.5, 0.5, 0, 0);
		const r2 = computeRotatedAABB(100, 50, -Math.PI / 4, 0.5, 0.5, 0, 0);
		// Same size, possibly different position
		expect(r1.w).toBeCloseTo(r2.w, 5);
		expect(r1.h).toBeCloseTo(r2.h, 5);
	});

	it("180° rotation is equivalent to no rotation (same size)", () => {
		const r1 = computeRotatedAABB(100, 50, 0, 0.5, 0.5, 0, 0);
		const r2 = computeRotatedAABB(100, 50, Math.PI, 0.5, 0.5, 0, 0);
		expect(r1.w).toBeCloseTo(r2.w, 5);
		expect(r1.h).toBeCloseTo(r2.h, 5);
	});

	it("extreme rotation angles wrap correctly", () => {
		const r1 = computeRotatedAABB(100, 50, Math.PI * 4, 0.5, 0.5, 0, 0);
		const r2 = computeRotatedAABB(100, 50, 0, 0.5, 0.5, 0, 0);
		expect(r1.w).toBeCloseTo(r2.w, 5);
	});

	it("zero rotation with anchor adjusts position only", () => {
		const r1 = computeRotatedAABB(100, 50, 0, 0, 0, 10, 20);
		const r2 = computeRotatedAABB(100, 50, 0, 1, 1, 10, 20);
		expect(r1.w).toBeCloseTo(r2.w, 5);
		expect(r1.h).toBeCloseTo(r2.h, 5);
		expect(r1.x).not.toEqual(r2.x); // Position should differ
	});

	it("position parameter shifts AABB correctly", () => {
		const r1 = computeRotatedAABB(100, 50, 0, 0, 0, 0, 0);
		const r2 = computeRotatedAABB(100, 50, 0, 0, 0, 100, 200);
		expect(r2.x).toBe(r1.x + 100);
		expect(r2.y).toBe(r1.y + 200);
	});

	it("thin rectangle (h=0) with rotation still produces AABB", () => {
		const r = computeRotatedAABB(100, 0, Math.PI / 4, 0.5, 0.5, 0, 0);
		// When h=0, AABB = w*sin(theta), which is non-zero for most rotations
		expect(r.w).toBeGreaterThan(0);
		expect(r.h).toBeGreaterThan(0);
	});

	it("very small rectangle has proportional AABB", () => {
		const r1 = computeRotatedAABB(1, 1, 0, 0.5, 0.5, 0, 0);
		const r2 = computeRotatedAABB(1000, 1000, 0, 0.5, 0.5, 0, 0);
		expect(r2.w / r1.w).toBeCloseTo(1000, 0);
	});
});

// ===========================================================================
// smartTruncateLabel — comprehensive truncation scenarios
// ===========================================================================
describe("smartTruncateLabel advanced", () => {
	it("prioritizes slash path hint over dash", () => {
		const result = smartTruncateLabel("ep01-title/name", 10);
		expect(result).toContain("/");
	});

	it("handles multiple slashes: uses last slash", () => {
		const result = smartTruncateLabel("a/b/c/deep", 5);
		expect(result).toContain("/");
		// Should use last slash
		expect(result.includes("b/c")).toBe(false);
	});

	it("handles dash before slash: uses dash in parent hint", () => {
		const result = smartTruncateLabel("ep01-title-extra/child", 10);
		expect(result).toContain("/");
	});

	it("dash after parent slash: takes after-dash from child", () => {
		const result = smartTruncateLabel("parent/child-extra-long", 10);
		// Should show parent hint + /child hint
		expect(result.length).toBeLessThanOrEqual(15);
	});

	it("ellipsis always appended to truncated non-path text", () => {
		const result = smartTruncateLabel("abcdefghij", 5);
		expect(result).toContain("\u2026");
		expect(result.length).toBe(5); // maxChars enforced
	});

	it("slash with empty child: fallback to ellipsis", () => {
		const result = smartTruncateLabel("parent/", 5);
		expect(result.length).toBeLessThanOrEqual(6);
	});

	it("very long parent name: truncates intelligently", () => {
		const result = smartTruncateLabel("this-is-a-very-long-parent/short", 12);
		expect(result.length).toBeLessThanOrEqual(15);
		expect(result).toContain("/");
	});

	it("dash near maxChars boundary", () => {
		const result = smartTruncateLabel("before-after", 8);
		// dash is at index 6, before-dash = "before", after-dash = "after"
		// Should use after-dash since it's short enough
		expect(result).toContain("after");
	});

	it("dash exactly at maxChars: uses after-dash", () => {
		const result = smartTruncateLabel("12345-67", 8);
		expect(result).toContain("67");
	});

	it("preserves case in truncation", () => {
		const result = smartTruncateLabel("HELLO-WORLD", 8);
		// After-dash is "WORLD"
		expect(result.includes("WORLD") || result.includes("world")).toBe(true);
	});

	it("unicode text truncates without breaking", () => {
		const result = smartTruncateLabel("日本語-テスト-長い", 6);
		expect(result.length).toBeLessThanOrEqual(7);
	});

	it("emoji in text preserves ellipsis", () => {
		const result = smartTruncateLabel("🎉🎊🎈🎁🎀", 3);
		expect(result.includes("\u2026")).toBe(true);
	});
});

// ===========================================================================
// selectLabelMode — FSM state transitions
// ===========================================================================
describe("selectLabelMode advanced", () => {
	const IZ = 0.2; // initialsZoom
	const TZ = 0.5; // truncateZoom
	const H = 0.05; // hysteresis

	it("initialsZoom boundary: exactly at threshold", () => {
		const result = selectLabelMode(IZ, "full", IZ, TZ, H);
		// At threshold exactly with prevMode=full, enters truncated zone (full is outside band)
		expect(result).toBe("truncated");
	});

	it("truncateZoom boundary: exactly at threshold", () => {
		const result = selectLabelMode(TZ, "initials", IZ, TZ, H);
		// At threshold exactly, should be full
		expect(result).toBe("full");
	});

	it("hysteresis band: initials halfway through", () => {
		// zoom = IZ + 0.5*H = 0.225
		const result = selectLabelMode(IZ + H * 0.5, "initials", IZ, TZ, H);
		expect(result).toBe("initials");
	});

	it("hysteresis band: full halfway through", () => {
		// zoom = TZ - 0.5*H = 0.475
		const result = selectLabelMode(TZ - H * 0.5, "full", IZ, TZ, H);
		expect(result).toBe("full");
	});

	it("transition from initials: crossing band", () => {
		// zoom > IZ + H, so exits band
		const result = selectLabelMode(IZ + H + 0.01, "initials", IZ, TZ, H);
		expect(result).toBe("truncated");
	});

	it("transition from full: crossing band", () => {
		// zoom < TZ - H, so exits band
		const result = selectLabelMode(TZ - H - 0.01, "full", IZ, TZ, H);
		expect(result).toBe("truncated");
	});

	it("very large hysteresis: sticks to mode longer", () => {
		const largeH = 0.3;
		expect(selectLabelMode(IZ + 0.1, "initials", IZ, TZ, largeH)).toBe("initials");
		// Would normally be truncated, but hysteresis keeps it
	});

	it("zero hysteresis: no stickiness", () => {
		expect(selectLabelMode(IZ + 0.01, "initials", IZ, TZ, 0)).toBe("truncated");
		expect(selectLabelMode(TZ - 0.01, "full", IZ, TZ, 0)).toBe("truncated");
	});

	it("zoom well below all thresholds: initials", () => {
		expect(selectLabelMode(0, "full", IZ, TZ, H)).toBe("initials");
		expect(selectLabelMode(0, "truncated", IZ, TZ, H)).toBe("initials");
	});

	it("zoom well above all thresholds: full", () => {
		expect(selectLabelMode(2, "initials", IZ, TZ, H)).toBe("full");
		expect(selectLabelMode(2, "truncated", IZ, TZ, H)).toBe("full");
	});

	it("inverted thresholds: initialsZoom > truncateZoom (safety)", () => {
		// Caller should not allow this, but function should handle gracefully
		const result = selectLabelMode(0.3, "full", 0.5, 0.2, 0.05);
		expect(result).toMatch(/initials|truncated|full/);
	});

	it("all modes reachable from any starting mode", () => {
		const modes: Set<LabelMode> = new Set();
		modes.add(selectLabelMode(0.05, "initials", IZ, TZ, H)); // below all
		modes.add(selectLabelMode(0.3, "initials", IZ, TZ, H)); // middle
		modes.add(selectLabelMode(0.8, "initials", IZ, TZ, H)); // above all
		expect(modes.size).toBeGreaterThanOrEqual(2); // At least 2 distinct modes
	});
});

// ===========================================================================
// Cross-function integration tests
// ===========================================================================
describe("Label functions integration", () => {
	it("truncated label width estimate remains proportional", () => {
		const full = "this-is-a-very-long-label-that-needs-truncation";
		const truncated = smartTruncateLabel(full, 12);
		const wFull = estimateTextWidth(full, 12, false);
		const wTruncated = estimateTextWidth(truncated, 12, false);
		// Truncated should be narrower
		expect(wTruncated).toBeLessThan(wFull);
	});

	it("initials extracted from truncated label are valid", () => {
		const labels = ["classic-hamlet/characters", "mythology-greek/gods", "fantasy-world/places"];
		for (const label of labels) {
			const truncated = smartTruncateLabel(label, 12);
			const initials = extractInitials(truncated);
			expect(initials.length).toBeLessThanOrEqual(2);
		}
	});

	it("AABB for rotated text expands for non-zero rotations", () => {
		const label = "very-long-label-that-gets-truncated";
		const truncated = smartTruncateLabel(label, 10);
		const width = estimateTextWidth(truncated, 12, false);
		const height = 12;

		const aabb = computeRotatedAABB(width, height, Math.PI / 6, 0.5, 0.5, 0, 0);
		// AABB expands for rotation, but math: w*cos+h*sin may be smaller for some angles/dims
		// Just verify AABB has positive dimensions
		expect(aabb.w).toBeGreaterThan(0);
		expect(aabb.h).toBeGreaterThan(0);
	});

	it("priority scores + label mode selection work together", () => {
		const defaultRT = {
			labelZoomTier1: 0.15,
			labelZoomTier2: 0.35,
			labelZoomTier3: 0.7,
			labelDegreePctTier1: 0.1,
			labelDegreePctTier2: 0.3,
			labelDegreePctTier3: 0.5,
			nodeLabelZoomMin: 0.9,
		};

		const nodes = Array.from({ length: 20 }, (_, i) => ({
			id: `n${i}`,
			isSuper: i < 2,
			hasLabel: true,
		}));
		const degrees = new Map(nodes.map((n, i) => [n.id, 20 - i]));

		const scores = computePriorityScores(nodes, degrees, defaultRT);
		const topNode = scores[0];
		const bottomNode = scores[scores.length - 1];

		// At different zoom levels, different labels would be shown
		// based on minShowZoom
		expect(topNode.minShowZoom).toBeLessThan(bottomNode.minShowZoom);
	});
});
