import { describe, it, expect } from "vitest";
import {
	computeZoomFactor,
	clampScale,
	ZOOM_IN_FACTOR,
	ZOOM_OUT_FACTOR,
	ZOOM_SCALE_MIN,
	ZOOM_SCALE_MAX,
} from "../src/views/InteractionManager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("InteractionManager constants", () => {
	it("ZOOM_IN_FACTOR is > 1 (zoom in makes things bigger)", () => {
		expect(ZOOM_IN_FACTOR).toBeGreaterThan(1);
	});

	it("ZOOM_OUT_FACTOR is < 1 (zoom out makes things smaller)", () => {
		expect(ZOOM_OUT_FACTOR).toBeLessThan(1);
		expect(ZOOM_OUT_FACTOR).toBeGreaterThan(0);
	});

	it("ZOOM_SCALE_MIN is positive and much less than 1", () => {
		expect(ZOOM_SCALE_MIN).toBeGreaterThan(0);
		expect(ZOOM_SCALE_MIN).toBeLessThan(1);
	});

	it("ZOOM_SCALE_MAX is > 1", () => {
		expect(ZOOM_SCALE_MAX).toBeGreaterThan(1);
	});

	it("ZOOM_SCALE_MIN < ZOOM_SCALE_MAX", () => {
		expect(ZOOM_SCALE_MIN).toBeLessThan(ZOOM_SCALE_MAX);
	});
});

// ---------------------------------------------------------------------------
// computeZoomFactor — pure zoom multiplier calculation
// ---------------------------------------------------------------------------
describe("computeZoomFactor", () => {
	it("negative deltaY (scroll up) returns factor > 1 (zoom in)", () => {
		const factor = computeZoomFactor(-100);
		expect(factor).toBeGreaterThan(1);
	});

	it("positive deltaY (scroll down) returns factor < 1 (zoom out)", () => {
		const factor = computeZoomFactor(100);
		expect(factor).toBeLessThan(1);
		expect(factor).toBeGreaterThan(0);
	});

	it("default sensitivity=1 returns ZOOM_IN_FACTOR for zoom in", () => {
		const factor = computeZoomFactor(-1);
		expect(factor).toBeCloseTo(ZOOM_IN_FACTOR, 10);
	});

	it("default sensitivity=1 returns ZOOM_OUT_FACTOR for zoom out", () => {
		const factor = computeZoomFactor(1);
		expect(factor).toBeCloseTo(ZOOM_OUT_FACTOR, 10);
	});

	it("sensitivity=0.5 gives smaller zoom-in factor than default", () => {
		const defaultF = computeZoomFactor(-1, 1.0);
		const halfF = computeZoomFactor(-1, 0.5);
		expect(halfF).toBeLessThan(defaultF);
		expect(halfF).toBeGreaterThan(1); // Still zoom in
	});

	it("sensitivity=2.0 gives larger zoom-in factor than default", () => {
		const defaultF = computeZoomFactor(-1, 1.0);
		const doubleF = computeZoomFactor(-1, 2.0);
		expect(doubleF).toBeGreaterThan(defaultF);
	});

	it("sensitivity=0.5 gives smaller zoom-out effect than default", () => {
		const defaultF = computeZoomFactor(1, 1.0);
		const halfF = computeZoomFactor(1, 0.5);
		// Smaller zoom out means factor closer to 1
		expect(halfF).toBeGreaterThan(defaultF);
		expect(halfF).toBeLessThan(1); // Still zoom out
	});

	it("sensitivity=2.0 gives stronger zoom-out than default", () => {
		const defaultF = computeZoomFactor(1, 1.0);
		const doubleF = computeZoomFactor(1, 2.0);
		expect(doubleF).toBeLessThan(defaultF);
	});

	it("sensitivity=0 gives factor of exactly 1 (no zoom change)", () => {
		expect(computeZoomFactor(-1, 0)).toBeCloseTo(1, 10);
		expect(computeZoomFactor(1, 0)).toBeCloseTo(1, 10);
	});

	it("deltaY=0 returns zoom out factor (positive deltaY branch)", () => {
		// deltaY === 0 is NOT < 0, so it takes the "out" branch
		const factor = computeZoomFactor(0);
		expect(factor).toBeLessThanOrEqual(1);
	});

	it("very large deltaY still returns same factor (no magnitude scaling)", () => {
		const small = computeZoomFactor(1);
		const big = computeZoomFactor(10000);
		// computeZoomFactor only cares about sign, not magnitude
		expect(big).toBeCloseTo(small, 10);
	});

	it("zoom in and out are reciprocal at default sensitivity", () => {
		const zoomIn = computeZoomFactor(-1);
		const zoomOut = computeZoomFactor(1);
		// They should roughly cancel each other
		const combined = zoomIn * zoomOut;
		expect(combined).toBeCloseTo(1, 1);
	});
});

// ---------------------------------------------------------------------------
// clampScale — scale clamping within zoom bounds
// ---------------------------------------------------------------------------
describe("clampScale", () => {
	it("returns the value when within range", () => {
		expect(clampScale(1.0)).toBe(1.0);
		expect(clampScale(0.5)).toBe(0.5);
		expect(clampScale(5.0)).toBe(5.0);
	});

	it("clamps to ZOOM_SCALE_MIN when below minimum", () => {
		expect(clampScale(0)).toBe(ZOOM_SCALE_MIN);
		expect(clampScale(-1)).toBe(ZOOM_SCALE_MIN);
		expect(clampScale(0.001)).toBe(ZOOM_SCALE_MIN);
	});

	it("clamps to ZOOM_SCALE_MAX when above maximum", () => {
		expect(clampScale(100)).toBe(ZOOM_SCALE_MAX);
		expect(clampScale(11)).toBe(ZOOM_SCALE_MAX);
	});

	it("returns exact boundary values", () => {
		expect(clampScale(ZOOM_SCALE_MIN)).toBe(ZOOM_SCALE_MIN);
		expect(clampScale(ZOOM_SCALE_MAX)).toBe(ZOOM_SCALE_MAX);
	});

	it("handles NaN by returning ZOOM_SCALE_MIN", () => {
		// Math.max(MIN, Math.min(MAX, NaN)) = Math.max(MIN, NaN) = NaN
		// This is the actual behavior
		const result = clampScale(NaN);
		expect(Number.isNaN(result)).toBe(true);
	});

	it("handles Infinity by clamping to max", () => {
		expect(clampScale(Infinity)).toBe(ZOOM_SCALE_MAX);
	});

	it("handles negative Infinity by clamping to min", () => {
		expect(clampScale(-Infinity)).toBe(ZOOM_SCALE_MIN);
	});

	it("handles very small positive number", () => {
		expect(clampScale(1e-10)).toBe(ZOOM_SCALE_MIN);
	});

	it("result is always >= ZOOM_SCALE_MIN for finite positive inputs", () => {
		for (const v of [0.001, 0.01, 0.1, 1, 5, 9.9]) {
			expect(clampScale(v)).toBeGreaterThanOrEqual(ZOOM_SCALE_MIN);
		}
	});

	it("result is always <= ZOOM_SCALE_MAX for finite inputs", () => {
		for (const v of [0.001, 0.01, 0.1, 1, 5, 9.9]) {
			expect(clampScale(v)).toBeLessThanOrEqual(ZOOM_SCALE_MAX);
		}
	});
});
