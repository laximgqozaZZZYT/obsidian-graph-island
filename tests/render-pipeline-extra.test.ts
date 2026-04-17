import { describe, it, expect } from "vitest";
import { generateDisplacementOffsets, computeDensityMinDist, computeDensityScale } from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// generateDisplacementOffsets — label overlap avoidance candidates
// ---------------------------------------------------------------------------
describe("generateDisplacementOffsets", () => {
	it("returns exactly 12 offset candidates", () => {
		const offsets = generateDisplacementOffsets(100, 20, 10);
		expect(offsets).toHaveLength(12);
	});

	it("all offsets have non-zero dx or dy", () => {
		const offsets = generateDisplacementOffsets(80, 16, 8);
		for (const { dx, dy } of offsets) {
			expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
		}
	});

	it("offsets scale with nodeScreenR", () => {
		const small = generateDisplacementOffsets(100, 20, 5);
		const large = generateDisplacementOffsets(100, 20, 30);
		// Larger nodeScreenR → offsets are farther from center
		const avgSmall = small.reduce((s, o) => s + Math.abs(o.dx) + Math.abs(o.dy), 0) / small.length;
		const avgLarge = large.reduce((s, o) => s + Math.abs(o.dx) + Math.abs(o.dy), 0) / large.length;
		expect(avgLarge).toBeGreaterThan(avgSmall);
	});

	it("offsets scale with labelW", () => {
		const narrow = generateDisplacementOffsets(40, 20, 10);
		const wide = generateDisplacementOffsets(200, 20, 10);
		const sumNarrow = narrow.reduce((s, o) => s + Math.abs(o.dx), 0);
		const sumWide = wide.reduce((s, o) => s + Math.abs(o.dx), 0);
		expect(sumWide).toBeGreaterThan(sumNarrow);
	});

	it("includes offsets in all four quadrants", () => {
		const offsets = generateDisplacementOffsets(100, 20, 10);
		const hasTopRight = offsets.some((o) => o.dx > 0 && o.dy < 0);
		const hasTopLeft = offsets.some((o) => o.dx < 0 && o.dy < 0);
		const hasBottomRight = offsets.some((o) => o.dx > 0 && o.dy > 0);
		const hasBottomLeft = offsets.some((o) => o.dx < 0 && o.dy > 0);
		expect(hasTopRight).toBe(true);
		expect(hasTopLeft).toBe(true);
		expect(hasBottomRight).toBe(true);
		expect(hasBottomLeft).toBe(true);
	});

	it("handles zero nodeScreenR", () => {
		const offsets = generateDisplacementOffsets(100, 20, 0);
		expect(offsets).toHaveLength(12);
		// pad = 0 + 2 = 2, so offsets still non-zero
		for (const { dx, dy } of offsets) {
			expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
		}
	});

	it("handles very small label dimensions", () => {
		const offsets = generateDisplacementOffsets(1, 1, 1);
		expect(offsets).toHaveLength(12);
	});
});

// ---------------------------------------------------------------------------
// computeDensityMinDist — zoom-dependent minimum distance clamping
// ---------------------------------------------------------------------------
describe("computeDensityMinDist", () => {
	it("returns baseDist * densityScale when under maxDist", () => {
		// At zoom=1 and typical threshold, densityScale is small → baseDist is dominant
		const result = computeDensityMinDist(10, 1000, 1, 3000);
		expect(result).toBeGreaterThanOrEqual(10);
		expect(result).toBeLessThanOrEqual(1000);
	});

	it("clamps to maxDist when densityScale * baseDist exceeds it", () => {
		// Very low zoom → densityScale is large → result capped at maxDist
		const result = computeDensityMinDist(100, 50, 0.001, 1);
		expect(result).toBe(50);
	});

	it("when zoom equals threshold, densityScale is 1 so result equals baseDist", () => {
		// At zoom === threshold, densityScale = 1
		const result = computeDensityMinDist(20, 200, 5, 5);
		expect(result).toBeCloseTo(20, 0);
	});

	it("when zoom > threshold, densityScale shrinks below 1", () => {
		// zoom=10, threshold=5 → scale = max(0.3, 1 - (10-5)*0.5) = max(0.3, -1.5) = 0.3
		const result = computeDensityMinDist(100, 200, 10, 5);
		expect(result).toBeCloseTo(30, 0); // 100 * 0.3
	});

	it("never exceeds maxDist", () => {
		for (const zoom of [0.01, 0.1, 0.5, 1, 2, 5]) {
			const result = computeDensityMinDist(50, 30, zoom, 500);
			expect(result).toBeLessThanOrEqual(30);
		}
	});

	it("baseDist of 0 returns 0 (or near zero)", () => {
		const result = computeDensityMinDist(0, 100, 1, 3000);
		expect(result).toBeCloseTo(0, 5);
	});
});
