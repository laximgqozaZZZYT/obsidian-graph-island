import { describe, it, expect } from "vitest";
import {
	computeGlowParams,
	computeLabelColors,
	isDensityTooClose,
	computeTimelineFilteredSet,
	computeZonePlacementFromAngles,
	GLOW_ATTENUATE_THRESHOLD,
	GLOW_ATTENUATE_RANGE,
	GLOW_RADIUS_ATTENUATE_FACTOR,
	LABEL_Y_OFFSET_FACTOR,
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

// ---------------------------------------------------------------------------
// computeZonePlacementFromAngles
// ---------------------------------------------------------------------------
const defaultGapParams = {
	narrowThreshold: Math.PI / 4,
	mediumThreshold: Math.PI / 2,
	narrowFactor: 0.6,
	mediumFactor: 0.8,
};

describe("computeZonePlacementFromAngles", () => {
	it("returns default right-side placement when no angles provided", () => {
		const result = computeZonePlacementFromAngles([], 10, 5, defaultGapParams);
		expect(result.x).toBe(15); // nodeRadius + offset
		expect(result.y).toBeCloseTo(-(10 * LABEL_Y_OFFSET_FACTOR));
		expect(result.anchorX).toBe(0);
	});

	it("places label opposite a single neighbor (largest gap)", () => {
		// Neighbor to the right (angle = 0) → label should go left (angle ≈ π)
		const result = computeZonePlacementFromAngles([0], 10, 5, defaultGapParams);
		// Gap is 2π centered at π, so label goes to the left
		expect(result.x).toBeLessThan(0);
		expect(result.anchorX).toBe(1); // left anchor
	});

	it("places label in the largest gap between two neighbors", () => {
		// Neighbors at 0 and π/2 (right and down) → largest gap is from π/2 to 2π
		// Gap mid-angle ≈ π/2 + (2π - π/2)/2 = π/2 + 3π/4 ≈ 5π/4
		const angles = [0, Math.PI / 2];
		const result = computeZonePlacementFromAngles(angles, 10, 5, defaultGapParams);
		// 5π/4 in canvas coords: cos < 0 (left), sin < 0 (upper)
		expect(result.x).toBeLessThan(0);
		expect(result.y).toBeLessThan(0);
	});

	it("places label above when neighbors are below", () => {
		// Neighbor directly below (angle = π/2)
		const result = computeZonePlacementFromAngles([Math.PI / 2], 10, 5, defaultGapParams);
		// Largest gap wraps around from π/2 to π/2+2π, mid at π/2+π = 3π/2 = -π/2 (above)
		expect(result.y).toBeLessThan(0);
	});

	it("applies narrow gap scaling when gap is small", () => {
		// Four evenly-spaced neighbors → each gap is π/2
		// With narrowThreshold = π/4, mediumThreshold = π/2,
		// gap of π/2 is NOT < narrowThreshold, so narrowFactor doesn't apply
		// But it equals mediumThreshold, so gapScale = 1.0 (>= medium)
		const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
		const result = computeZonePlacementFromAngles(angles, 10, 5, defaultGapParams);
		const dist = Math.sqrt(result.x ** 2 + result.y ** 2);
		expect(dist).toBeCloseTo(15); // full distance (nodeRadius + offset) * 1.0
	});

	it("applies narrow gap factor for very dense layouts", () => {
		// Eight evenly-spaced neighbors → each gap is π/4
		// π/4 is NOT < π/4 (narrowThreshold), but it IS < π/2 (mediumThreshold)
		// So gapScale = mediumFactor = 0.8
		const angles = Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8);
		const result = computeZonePlacementFromAngles(angles, 10, 5, defaultGapParams);
		const dist = Math.sqrt(result.x ** 2 + result.y ** 2);
		expect(dist).toBeCloseTo(15 * 0.8);
	});

	it("applies narrow factor for extremely dense layouts", () => {
		// 16 evenly-spaced → each gap ≈ π/8 < narrowThreshold (π/4)
		const angles = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);
		const result = computeZonePlacementFromAngles(angles, 10, 5, defaultGapParams);
		const dist = Math.sqrt(result.x ** 2 + result.y ** 2);
		expect(dist).toBeCloseTo(15 * 0.6); // narrowFactor
	});

	it("sets anchorX=0.5 for vertical placement", () => {
		// Neighbors left and right → gap above and below (mid angle ≈ π/2 or -π/2)
		const result = computeZonePlacementFromAngles([0, Math.PI], 10, 5, defaultGapParams);
		// Largest gap from π to 2π, mid at 3π/2 → cos(3π/2)=0 → anchorX=0.5
		expect(result.anchorX).toBe(0.5);
	});

	it("does not mutate the input angles array", () => {
		const angles = [Math.PI, 0, Math.PI / 2];
		const copy = [...angles];
		computeZonePlacementFromAngles(angles, 10, 5, defaultGapParams);
		expect(angles).toEqual(copy);
	});

	it("handles single angle at π (neighbor to the left)", () => {
		const result = computeZonePlacementFromAngles([Math.PI], 10, 5, defaultGapParams);
		// Largest gap wraps from π to π+2π → mid at 2π → direction = 0 (right)
		expect(result.x).toBeGreaterThan(0);
		expect(result.anchorX).toBe(0); // right anchor
	});

	it("returns consistent results for duplicate angles", () => {
		const result = computeZonePlacementFromAngles([0, 0, 0], 10, 5, defaultGapParams);
		// All angles at 0 → gap from 0 to 2π, mid at π → label goes left
		expect(result.x).toBeLessThan(0);
	});
});
