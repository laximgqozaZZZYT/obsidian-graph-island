import { describe, it, expect } from "vitest";
import {
	computeDensityScale,
	DENSITY_FULL_ALPHA_THRESHOLD,
	DENSITY_GENTLE_THRESHOLD,
	DENSITY_AGGRESSIVE_THRESHOLD,
	DENSITY_MIN_ALPHA,
	DEFAULT_DENSITY_FLOOR,
	ZOOM_FADE_THRESHOLD,
	ZOOM_FADE_MIN_ALPHA,
} from "../src/views/EdgeRenderer";

const noCfg = {};

describe("computeDensityScale", () => {
	// --- Density bands ---
	it("returns 1.0 for edge count at or below full-alpha threshold", () => {
		expect(computeDensityScale(noCfg, 0)).toBe(1);
		expect(computeDensityScale(noCfg, 50)).toBe(1);
		expect(computeDensityScale(noCfg, DENSITY_FULL_ALPHA_THRESHOLD)).toBe(1);
	});

	it("returns < 1.0 in gentle-fade band (100-500)", () => {
		const mid = (DENSITY_FULL_ALPHA_THRESHOLD + DENSITY_GENTLE_THRESHOLD) / 2;
		const s = computeDensityScale(noCfg, mid);
		expect(s).toBeLessThan(1);
		expect(s).toBeGreaterThan(0.5);
	});

	it("returns lower value in aggressive band (500-2000)", () => {
		const gentle = computeDensityScale(noCfg, DENSITY_GENTLE_THRESHOLD);
		const aggMid = (DENSITY_GENTLE_THRESHOLD + DENSITY_AGGRESSIVE_THRESHOLD) / 2;
		const agg = computeDensityScale(noCfg, aggMid);
		expect(agg).toBeLessThan(gentle);
		expect(agg).toBeGreaterThan(DENSITY_MIN_ALPHA);
	});

	it("returns DENSITY_MIN_ALPHA for edge count above aggressive threshold", () => {
		expect(computeDensityScale(noCfg, DENSITY_AGGRESSIVE_THRESHOLD + 1)).toBeCloseTo(DENSITY_MIN_ALPHA);
		expect(computeDensityScale(noCfg, 10000)).toBeCloseTo(DENSITY_MIN_ALPHA);
	});

	it("monotonically decreases within each band (before floor kicks in)", () => {
		// Within gentle band: 100 → 500
		const gentle1 = computeDensityScale(noCfg, 150);
		const gentle2 = computeDensityScale(noCfg, 400);
		expect(gentle2).toBeLessThan(gentle1);

		// Within aggressive band: 500 → 2000
		const agg1 = computeDensityScale(noCfg, 600);
		const agg2 = computeDensityScale(noCfg, 1800);
		expect(agg2).toBeLessThan(agg1);

		// Above aggressive: all equal to floor
		const floor1 = computeDensityScale(noCfg, 3000);
		const floor2 = computeDensityScale(noCfg, 10000);
		expect(floor1).toBeCloseTo(floor2);
	});

	it("is continuous at gentle-threshold boundary (500)", () => {
		const just_below = computeDensityScale(noCfg, DENSITY_GENTLE_THRESHOLD - 1);
		const at = computeDensityScale(noCfg, DENSITY_GENTLE_THRESHOLD);
		expect(Math.abs(just_below - at)).toBeLessThan(0.01);
	});

	// --- Zoom fade ---
	it("no zoom fade when worldScale >= threshold", () => {
		const s1 = computeDensityScale({ worldScale: 1.0 }, 50);
		const s2 = computeDensityScale({ worldScale: ZOOM_FADE_THRESHOLD }, 50);
		expect(s1).toBe(s2);
	});

	it("zoom fade reduces value below threshold", () => {
		const normal = computeDensityScale({ worldScale: 1.0 }, 50);
		const zoomed = computeDensityScale({ worldScale: ZOOM_FADE_THRESHOLD / 2 }, 50);
		expect(zoomed).toBeLessThan(normal);
	});

	it("zoom fade has minimum alpha floor", () => {
		const extreme = computeDensityScale({ worldScale: 0.001 }, 50);
		expect(extreme).toBeGreaterThanOrEqual(DEFAULT_DENSITY_FLOOR);
	});

	// --- edgeDensityFloor ---
	it("custom edgeDensityFloor overrides default floor", () => {
		const s = computeDensityScale({ edgeDensityFloor: 0.8 }, 10000);
		expect(s).toBeCloseTo(0.8);
	});

	it("edgeDensityFloor=0 allows full fadeout (but zoom fade min still applies)", () => {
		const s = computeDensityScale({ edgeDensityFloor: 0, worldScale: 0.001 }, 10000);
		// DENSITY_MIN_ALPHA * ZOOM_FADE_MIN_ALPHA but floor is 0
		// Result should be DENSITY_MIN_ALPHA * max(ZOOM_FADE_MIN_ALPHA, 0.001/0.05)
		expect(s).toBeGreaterThan(0);
	});
});
