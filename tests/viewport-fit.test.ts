import { describe, it, expect } from "vitest";
import { computeAvgRadius, spreadDegenerateAxis, computeViewportScaleFactor } from "../src/utils/viewport-fit";

const mkSpread = (coords: [number, number][]) => coords.map(([x, y]) => ({ data: { x, y } }));

describe("computeAvgRadius", () => {
	it("averages explicit radii", () => {
		expect(computeAvgRadius([{ radius: 4 }, { radius: 6 }, { radius: 8 }])).toBe(6);
	});

	it("uses fallback for missing/null radius", () => {
		expect(computeAvgRadius([{ radius: 10 }, {}, { radius: null }], 12)).toBe((10 + 12 + 12) / 3);
	});

	it("returns fallback for an empty input (no NaN)", () => {
		expect(computeAvgRadius([])).toBe(12);
		expect(computeAvgRadius([], 7)).toBe(7);
	});

	it("default fallback is 12", () => {
		expect(computeAvgRadius([{}, {}])).toBe(12);
	});
});

describe("spreadDegenerateAxis", () => {
	it("spreads along Y when bbox is wide-and-flat", () => {
		const nodes = mkSpread([
			[-100, 0],
			[0, 0],
			[100, 0],
		]);
		// bboxW=200 > threshold(40), bboxH=0 < threshold → should spread Y
		spreadDegenerateAxis(nodes, 0, 0, 200, 0, 40, 0.05, 1_000_000);
		expect(nodes[0].data.y).toBeLessThan(0);
		expect(nodes[1].data.y).toBe(0);
		expect(nodes[2].data.y).toBeGreaterThan(0);
		// X coordinates must remain unchanged
		expect(nodes.map((n) => n.data.x)).toEqual([-100, 0, 100]);
	});

	it("spreads along X when bbox is tall-and-thin", () => {
		const nodes = mkSpread([
			[0, -100],
			[0, 0],
			[0, 100],
		]);
		spreadDegenerateAxis(nodes, 0, 0, 0, 200, 40, 0.05, 1_000_000);
		expect(nodes[0].data.x).toBeLessThan(0);
		expect(nodes[2].data.x).toBeGreaterThan(0);
		// Y coordinates must remain unchanged
		expect(nodes.map((n) => n.data.y)).toEqual([-100, 0, 100]);
	});

	it("is a no-op when bbox is non-degenerate (both axes above threshold)", () => {
		const nodes = mkSpread([
			[0, 0],
			[100, 100],
		]);
		const before = nodes.map((n) => ({ ...n.data }));
		spreadDegenerateAxis(nodes, 50, 50, 100, 100, 40, 0.05, 1_000_000);
		expect(nodes.map((n) => n.data)).toEqual(before);
	});

	it("is a no-op when bbox is degenerate on both axes (single point)", () => {
		const nodes = mkSpread([
			[0, 0],
			[0, 0],
		]);
		spreadDegenerateAxis(nodes, 0, 0, 0, 0, 40, 0.05, 1_000_000);
		expect(nodes[0].data).toEqual({ x: 0, y: 0 });
		expect(nodes[1].data).toEqual({ x: 0, y: 0 });
	});

	it("collapses to t=0 when n=1 (avoids division by zero)", () => {
		const nodes = mkSpread([[100, 100]]);
		spreadDegenerateAxis(nodes, 50, 50, 200, 0, 40, 0.05, 1_000_000);
		// n=1 → t=0 → y stays at cy (50), not NaN
		expect(nodes[0].data.y).toBe(50);
	});

	it("targetH respects minUtil floor when bboxW is large", () => {
		// Force the (minUtil * vpArea) / bboxW branch to dominate over bboxW * 0.3
		const nodes = mkSpread([
			[-1000, 0],
			[1000, 0],
		]);
		const minUtil = 0.5;
		const vpArea = 1_000_000;
		const bboxW = 2000;
		spreadDegenerateAxis(nodes, 0, 0, bboxW, 0, 40, minUtil, vpArea);
		const expectedTargetH = Math.max(bboxW * 0.3, (minUtil * vpArea) / bboxW);
		// First node's t = -0.5 → y = -targetH/2
		expect(nodes[0].data.y).toBeCloseTo(-expectedTargetH / 2, 6);
	});
});

describe("computeViewportScaleFactor", () => {
	it("returns the positive root of the quadratic for a normal bbox", () => {
		// Square bbox 100x100, avgR=10, vpArea=1e6, minUtil=0.5
		// posSpan = 100 - 20 = 80
		// A = 6400, B = 20*(80+80)=3200, C = 400 - 500000 = -499600
		// disc = 3200^2 + 4*6400*499600 = positive
		// s = (-3200 + sqrt(...)) / 12800
		const s = computeViewportScaleFactor(100, 100, 10, 0.5, 1_000_000, 0.01);
		expect(s).toBeGreaterThan(0);
		// Verify it satisfies the constraint:
		//   (s*posSpan + 2*avgR) * (s*posSpan + 2*avgR) ≈ minUtil * vpArea
		const sideAfter = s * 80 + 20;
		expect(sideAfter * sideAfter).toBeCloseTo(0.5 * 1_000_000, -1);
	});

	it("returns scale > 1 when current util is far below target", () => {
		const s = computeViewportScaleFactor(100, 100, 10, 0.5, 1_000_000, 0.01);
		expect(s).toBeGreaterThan(1);
	});

	it("returns finite values across degenerate aspect ratios", () => {
		const s1 = computeViewportScaleFactor(20, 20, 10, 0.001, 100, 0.5);
		const s2 = computeViewportScaleFactor(20, 20, 10, 0.0004, 100, 0.5);
		expect(Number.isFinite(s1)).toBe(true);
		expect(Number.isFinite(s2)).toBe(true);
	});

	it("clamps bbox-radius span to a 1px floor (no division by zero)", () => {
		// bboxW = 2*avgR exactly → posSpan would be 0, must be clamped to 1
		const s = computeViewportScaleFactor(20, 20, 10, 0.5, 1_000_000, 0.0001);
		expect(Number.isFinite(s)).toBe(true);
		expect(s).toBeGreaterThan(0);
	});

	it("scales monotonically: larger minUtil → larger scale factor", () => {
		const a = computeViewportScaleFactor(100, 100, 10, 0.2, 1_000_000, 0.01);
		const b = computeViewportScaleFactor(100, 100, 10, 0.5, 1_000_000, 0.01);
		const c = computeViewportScaleFactor(100, 100, 10, 0.8, 1_000_000, 0.01);
		expect(a).toBeLessThan(b);
		expect(b).toBeLessThan(c);
	});
});
