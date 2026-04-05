import { describe, it, expect } from "vitest";
import {
	computeGlowParams,
	computeLabelColors,
	isDensityTooClose,
	computeTimelineFilteredSet,
	GLOW_ATTENUATE_THRESHOLD,
	GLOW_ATTENUATE_RANGE,
	GLOW_RADIUS_ATTENUATE_FACTOR,
} from "../src/views/render-pipeline-utils";

// ---------------------------------------------------------------------------
// computeGlowParams
// ---------------------------------------------------------------------------
describe("computeGlowParams", () => {
	it("returns base values when nodeCount < threshold", () => {
		const { glowAlpha, glowRadius } = computeGlowParams(100, 0.8, 5);
		expect(glowAlpha).toBe(0.8);
		expect(glowRadius).toBe(5);
	});

	it("returns base values at exactly threshold", () => {
		const { glowAlpha, glowRadius } = computeGlowParams(GLOW_ATTENUATE_THRESHOLD, 0.8, 5);
		expect(glowAlpha).toBe(0.8);
		expect(glowRadius).toBe(5);
	});

	it("attenuates alpha linearly above threshold", () => {
		const mid = GLOW_ATTENUATE_THRESHOLD + GLOW_ATTENUATE_RANGE / 2;
		const { glowAlpha } = computeGlowParams(mid, 1.0, 5);
		expect(glowAlpha).toBeCloseTo(0.5, 5);
	});

	it("attenuates radius linearly above threshold", () => {
		const mid = GLOW_ATTENUATE_THRESHOLD + GLOW_ATTENUATE_RANGE / 2;
		const { glowRadius } = computeGlowParams(mid, 1.0, 5);
		const expected = 5 - GLOW_RADIUS_ATTENUATE_FACTOR * 0.5;
		expect(glowRadius).toBeCloseTo(expected, 5);
	});

	it("fully attenuates at threshold + range", () => {
		const full = GLOW_ATTENUATE_THRESHOLD + GLOW_ATTENUATE_RANGE;
		const { glowAlpha } = computeGlowParams(full, 1.0, 5);
		expect(glowAlpha).toBeCloseTo(0, 5);
	});

	it("goes negative beyond range (caller clamps if needed)", () => {
		const beyond = GLOW_ATTENUATE_THRESHOLD + GLOW_ATTENUATE_RANGE * 2;
		const { glowAlpha } = computeGlowParams(beyond, 1.0, 5);
		expect(glowAlpha).toBeLessThan(0);
	});
});

// ---------------------------------------------------------------------------
// computeLabelColors
// ---------------------------------------------------------------------------
describe("computeLabelColors", () => {
	const baseRt = {
		labelBgColor: 0x1e1e1e,
		labelBgColorLight: 0xfafafa,
		labelBgColorSync: false,
		labelTextColorSync: false,
	};

	it("uses dark theme bg for dark mode", () => {
		const { labelBg } = computeLabelColors(true, baseRt, false, 0xff0000);
		expect(labelBg).toBe(0x1e1e1e);
	});

	it("uses light theme bg for light mode", () => {
		const { labelBg } = computeLabelColors(false, baseRt, false, 0xff0000);
		expect(labelBg).toBe(0xfafafa);
	});

	it("super nodes get darkened node color as bg", () => {
		const { labelBg } = computeLabelColors(true, baseRt, true, 0xff0000);
		// darkenColor(0xff0000, 0.6) → red * 0.4 = ~0x660000
		expect(labelBg).toBe(0x660000);
	});

	it("super nodes get white text fill", () => {
		const { labelFill } = computeLabelColors(true, baseRt, true, 0xff0000);
		expect(labelFill).toBe(0xffffff);
	});

	it("syncs bg color by blending node color at 15%", () => {
		const syncRt = { ...baseRt, labelBgColorSync: true };
		const { labelBg } = computeLabelColors(true, syncRt, false, 0xff0000);
		// blendColors(0x1e1e1e, 0xff0000, 0.15) — red channel increases
		const r = (labelBg >> 16) & 0xff;
		expect(r).toBeGreaterThan(0x1e);
	});

	it("syncs text color in dark mode (lighten)", () => {
		const syncRt = { ...baseRt, labelTextColorSync: true };
		const { labelFill } = computeLabelColors(true, syncRt, false, 0x0000ff);
		// lightenColor(0x0000ff, 0.55) — blue channel should be high
		const b = labelFill & 0xff;
		expect(b).toBeGreaterThan(0x70);
	});

	it("syncs text color in light mode (darken)", () => {
		const syncRt = { ...baseRt, labelTextColorSync: true };
		const { labelFill } = computeLabelColors(false, syncRt, false, 0xff0000);
		// darkenColor(0xff0000, 0.35) → red * 0.65 ≈ 0xa60000
		const r = (labelFill >> 16) & 0xff;
		expect(r).toBeLessThan(0xff);
		expect(r).toBeGreaterThan(0x80);
	});

	it("falls back to contrastColor when WCAG ratio < 4.5", () => {
		// Use a bg that's very close to the text color to trigger fallback
		const lowContrastRt = {
			...baseRt,
			labelTextColorSync: true,
			labelBgColor: 0x808080,
		};
		const { labelFill, labelBg } = computeLabelColors(true, lowContrastRt, false, 0x808080);
		// Should pick a contrasting color (black or white)
		expect(labelFill === 0x000000 || labelFill === 0xffffff).toBe(true);
	});

	it("super node with null color uses theme bg", () => {
		const { labelBg } = computeLabelColors(true, baseRt, true, null as unknown as number);
		expect(labelBg).toBe(0x1e1e1e);
	});
});

// ---------------------------------------------------------------------------
// isDensityTooClose
// ---------------------------------------------------------------------------
describe("isDensityTooClose", () => {
	it("returns false for empty grid", () => {
		const grid = new Map<string, { cx: number; cy: number }[]>();
		expect(isDensityTooClose(0, 0, 100, 25, grid)).toBe(false);
	});

	it("returns true when point is within minDist of neighbor", () => {
		const grid = new Map<string, { cx: number; cy: number }[]>();
		grid.set("0,0", [{ cx: 5, cy: 5 }]);
		// distance² = 25 + 25 = 50, minDist² = 100 → too close
		expect(isDensityTooClose(10, 10, 100, 100, grid)).toBe(true);
	});

	it("returns false when point is beyond minDist of neighbor", () => {
		const grid = new Map<string, { cx: number; cy: number }[]>();
		grid.set("0,0", [{ cx: 0, cy: 0 }]);
		// distance² = 10000 + 10000 = 20000, minDist² = 100
		expect(isDensityTooClose(100, 100, 50, 100, grid)).toBe(false);
	});

	it("checks adjacent grid cells", () => {
		const grid = new Map<string, { cx: number; cy: number }[]>();
		// Point in cell (1,0) should check neighbor (0,0)
		grid.set("0,0", [{ cx: 95, cy: 5 }]);
		// query point at (105, 5) → cell (1,0), neighbor at (95,5) → dist²=100
		expect(isDensityTooClose(105, 5, 100, 200, grid)).toBe(true);
	});

	it("handles multiple neighbors in same cell", () => {
		const grid = new Map<string, { cx: number; cy: number }[]>();
		grid.set("0,0", [
			{ cx: 50, cy: 50 },
			{ cx: 3, cy: 3 },
		]);
		// Close to second neighbor: dist² = 9 + 9 = 18
		expect(isDensityTooClose(0, 0, 100, 25, grid)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// computeTimelineFilteredSet
// ---------------------------------------------------------------------------
describe("computeTimelineFilteredSet", () => {
	it("filters nodes outside range", () => {
		const positions = [{ x: 0 }, { x: 100 }];
		const visible = [
			{ id: "a", x: 10 },
			{ id: "b", x: 50 },
			{ id: "c", x: 90 },
		];
		// range 0.2–0.6 → [20, 60] — a(10) outside, c(90) outside
		const filtered = computeTimelineFilteredSet(positions, visible, 0.2, 0.6);
		expect(filtered.has("a")).toBe(true);
		expect(filtered.has("b")).toBe(false);
		expect(filtered.has("c")).toBe(true);
	});

	it("returns empty set for full range", () => {
		const positions = [{ x: 0 }, { x: 100 }];
		const visible = [
			{ id: "a", x: 0 },
			{ id: "b", x: 50 },
			{ id: "c", x: 100 },
		];
		const filtered = computeTimelineFilteredSet(positions, visible, 0, 1);
		expect(filtered.size).toBe(0);
	});

	it("filters all nodes for zero-width range", () => {
		const positions = [{ x: 0 }, { x: 100 }];
		const visible = [
			{ id: "a", x: 10 },
			{ id: "b", x: 50 },
		];
		// range 0.5–0.5 → [50, 50] — only exactly 50 passes
		const filtered = computeTimelineFilteredSet(positions, visible, 0.5, 0.5);
		expect(filtered.has("a")).toBe(true);
		expect(filtered.has("b")).toBe(false);
	});

	it("handles single-position span (all same x)", () => {
		const positions = [{ x: 50 }, { x: 50 }];
		const visible = [{ id: "a", x: 50 }];
		// span = 0, so tlMinX = tlMaxX = 50
		const filtered = computeTimelineFilteredSet(positions, visible, 0, 1);
		expect(filtered.size).toBe(0);
	});

	it("handles empty visible nodes", () => {
		const positions = [{ x: 0 }, { x: 100 }];
		const filtered = computeTimelineFilteredSet(positions, [], 0.2, 0.8);
		expect(filtered.size).toBe(0);
	});
});
