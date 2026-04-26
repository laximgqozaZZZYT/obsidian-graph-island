import { describe, it, expect } from "vitest";
import {
	interpolateZoom,
	accumulateZoomTarget,
	DEFAULT_ZOOM_SMOOTHING,
	DEFAULT_ZOOM_FACTOR,
} from "../../src/utils/zoom-interpolator";

describe("interpolateZoom — boundary values", () => {
	it("returns currentScale when dt=0 (no time passed)", () => {
		expect(interpolateZoom(1.0, 2.0, 0, DEFAULT_ZOOM_SMOOTHING)).toBe(1.0);
	});

	it("returns the same value when target equals current", () => {
		expect(interpolateZoom(1.5, 1.5, 1, DEFAULT_ZOOM_SMOOTHING)).toBe(1.5);
	});

	it("returns currentScale when smoothing=0 (no movement)", () => {
		expect(interpolateZoom(1.0, 5.0, 1, 0)).toBe(1.0);
	});

	it("snaps to targetScale when smoothing*dt >= 1", () => {
		// smoothing * dt = 0.4 * 2.5 = 1.0 → snap
		expect(interpolateZoom(1.0, 3.0, 2.5, DEFAULT_ZOOM_SMOOTHING)).toBe(3.0);
	});

	it("snaps to targetScale when smoothing*dt > 1 (over-saturated)", () => {
		expect(interpolateZoom(1.0, 3.0, 10, 1.0)).toBe(3.0);
	});

	it("clamps negative weight (negative dt) back to current", () => {
		// Defensive: negative dt is non-physical but should not overshoot.
		expect(interpolateZoom(2.0, 4.0, -1, DEFAULT_ZOOM_SMOOTHING)).toBe(2.0);
	});

	it("matches existing InteractionManager behavior at dt=1, smoothing=0.4", () => {
		// Historical: next = current + (target-current)*0.4
		// 1.0 + (2.0-1.0)*0.4 = 1.4
		expect(interpolateZoom(1.0, 2.0, 1, DEFAULT_ZOOM_SMOOTHING)).toBeCloseTo(1.4, 10);
	});

	it("interpolates symmetrically for zoom-out (target < current)", () => {
		// 2.0 + (1.0 - 2.0) * 0.5 = 1.5
		expect(interpolateZoom(2.0, 1.0, 1, 0.5)).toBeCloseTo(1.5, 10);
	});
});

describe("interpolateZoom — convergence over multiple steps", () => {
	it("converges toward target across many steps (zoom in)", () => {
		let scale = 1.0;
		const target = 4.0;
		for (let i = 0; i < 100; i++) {
			scale = interpolateZoom(scale, target, 1, DEFAULT_ZOOM_SMOOTHING);
		}
		expect(scale).toBeCloseTo(target, 6);
	});

	it("converges toward target across many steps (zoom out)", () => {
		let scale = 5.0;
		const target = 0.5;
		for (let i = 0; i < 100; i++) {
			scale = interpolateZoom(scale, target, 1, DEFAULT_ZOOM_SMOOTHING);
		}
		expect(scale).toBeCloseTo(target, 6);
	});

	it("each step strictly reduces |target - current| while not crossing target", () => {
		let scale = 1.0;
		const target = 3.0;
		let prevDist = Math.abs(target - scale);
		for (let i = 0; i < 20; i++) {
			scale = interpolateZoom(scale, target, 1, DEFAULT_ZOOM_SMOOTHING);
			const dist = Math.abs(target - scale);
			expect(dist).toBeLessThan(prevDist);
			expect(scale).toBeLessThanOrEqual(target);
			prevDist = dist;
		}
	});

	it("smaller smoothing → slower convergence (more steps to same epsilon)", () => {
		const stepsToConverge = (smoothing: number, eps = 0.01) => {
			let s = 1.0;
			let n = 0;
			while (Math.abs(2.0 - s) > eps && n < 10000) {
				s = interpolateZoom(s, 2.0, 1, smoothing);
				n++;
			}
			return n;
		};
		expect(stepsToConverge(0.1)).toBeGreaterThan(stepsToConverge(0.5));
	});
});

describe("accumulateZoomTarget — wheel delta sign convention", () => {
	it("zooms IN when wheelDelta is negative (multiply by zoomFactor)", () => {
		expect(accumulateZoomTarget(1.0, -100, DEFAULT_ZOOM_FACTOR, 0.02, 10)).toBeCloseTo(
			DEFAULT_ZOOM_FACTOR,
			10,
		);
	});

	it("zooms OUT when wheelDelta is positive (divide by zoomFactor)", () => {
		expect(accumulateZoomTarget(1.0, 100, DEFAULT_ZOOM_FACTOR, 0.02, 10)).toBeCloseTo(
			1.0 / DEFAULT_ZOOM_FACTOR,
			10,
		);
	});

	it("returns currentTarget unchanged when wheelDelta is zero", () => {
		expect(accumulateZoomTarget(1.5, 0, DEFAULT_ZOOM_FACTOR, 0.02, 10)).toBe(1.5);
	});

	it("zoom-in then zoom-out cancels out (×k then ÷k = identity)", () => {
		const start = 1.0;
		const afterIn = accumulateZoomTarget(start, -1, DEFAULT_ZOOM_FACTOR, 0.02, 10);
		const afterOut = accumulateZoomTarget(afterIn, 1, DEFAULT_ZOOM_FACTOR, 0.02, 10);
		expect(afterOut).toBeCloseTo(start, 10);
	});
});

describe("accumulateZoomTarget — min/max clamping", () => {
	it("clamps to maxScale on excessive zoom-in", () => {
		expect(accumulateZoomTarget(9.5, -1, DEFAULT_ZOOM_FACTOR, 0.02, 10)).toBe(10);
	});

	it("clamps to minScale on excessive zoom-out", () => {
		// Input chosen so a single zoom-out tick crosses minScale:
		//   0.021 / DEFAULT_ZOOM_FACTOR (1.1) = 0.01909... < 0.02 → clamps to 0.02.
		// Symmetric to the maxScale test above (9.5 × 1.1 = 10.45 > 10).
		expect(accumulateZoomTarget(0.021, 1, DEFAULT_ZOOM_FACTOR, 0.02, 10)).toBe(0.02);
	});

	it("clamps even when wheelDelta=0 if currentTarget is out of range (above)", () => {
		expect(accumulateZoomTarget(20, 0, DEFAULT_ZOOM_FACTOR, 0.02, 10)).toBe(10);
	});

	it("clamps even when wheelDelta=0 if currentTarget is out of range (below)", () => {
		expect(accumulateZoomTarget(0.001, 0, DEFAULT_ZOOM_FACTOR, 0.02, 10)).toBe(0.02);
	});

	it("does not clamp when result is strictly inside range", () => {
		const r = accumulateZoomTarget(1.0, -1, DEFAULT_ZOOM_FACTOR, 0.02, 10);
		expect(r).toBeGreaterThan(0.02);
		expect(r).toBeLessThan(10);
	});

	it("respects custom min/max bounds", () => {
		expect(accumulateZoomTarget(0.4, 1, DEFAULT_ZOOM_FACTOR, 0.5, 5)).toBe(0.5);
		expect(accumulateZoomTarget(4.9, -1, DEFAULT_ZOOM_FACTOR, 0.5, 5)).toBe(5);
	});
});

describe("accumulateZoomTarget — repeated wheel ticks", () => {
	it("accumulates multiple zoom-in ticks geometrically", () => {
		let target = 1.0;
		for (let i = 0; i < 5; i++) {
			target = accumulateZoomTarget(target, -1, DEFAULT_ZOOM_FACTOR, 0.02, 10);
		}
		expect(target).toBeCloseTo(Math.pow(DEFAULT_ZOOM_FACTOR, 5), 8);
	});

	it("zoom-in saturates at maxScale after enough ticks", () => {
		let target = 1.0;
		for (let i = 0; i < 100; i++) {
			target = accumulateZoomTarget(target, -1, DEFAULT_ZOOM_FACTOR, 0.02, 10);
		}
		expect(target).toBe(10);
	});

	it("zoom-out saturates at minScale after enough ticks", () => {
		let target = 1.0;
		for (let i = 0; i < 200; i++) {
			target = accumulateZoomTarget(target, 1, DEFAULT_ZOOM_FACTOR, 0.02, 10);
		}
		expect(target).toBe(0.02);
	});
});

describe("DEFAULT constants", () => {
	it("DEFAULT_ZOOM_SMOOTHING is in (0, 1] (sane lerp weight)", () => {
		expect(DEFAULT_ZOOM_SMOOTHING).toBeGreaterThan(0);
		expect(DEFAULT_ZOOM_SMOOTHING).toBeLessThanOrEqual(1);
	});

	it("DEFAULT_ZOOM_FACTOR is > 1 (otherwise zoom-in would shrink)", () => {
		expect(DEFAULT_ZOOM_FACTOR).toBeGreaterThan(1);
	});
});
