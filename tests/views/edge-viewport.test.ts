/**
 * Unit tests for src/views/edge-viewport.ts
 *
 * Scope (subtask of 144-coverage-drop):
 *   Cover the previously-untested `computeEdgeViewport()` and
 *   `isBothEndpointsOutside()` helpers. Both are pure functions extracted
 *   from EdgeRenderer for viewport-based edge culling — they translate
 *   screen-space viewport metrics into world-space bounds and decide
 *   whether an edge can be skipped entirely.
 */
import { describe, it, expect } from "vitest";
import { computeEdgeViewport, isBothEndpointsOutside } from "../../src/views/edge-viewport";
import type { EdgeDrawConfig } from "../../src/views/EdgeRenderer";

function cfg(overrides: Partial<EdgeDrawConfig> = {}): EdgeDrawConfig {
	return overrides as EdgeDrawConfig;
}

describe("computeEdgeViewport", () => {
	it("returns default bounds (±200 margin, 0..10000) when all viewport fields are omitted", () => {
		const vp = computeEdgeViewport(cfg());
		expect(vp.left).toBe(-200);
		expect(vp.right).toBe(10200);
		expect(vp.top).toBe(-200);
		expect(vp.bottom).toBe(10200);
	});

	it("halves world-space extent when worldScale=2 but keeps margin in world units", () => {
		const vp = computeEdgeViewport(
			cfg({ worldScale: 2, viewportX: 0, viewportY: 0, viewportW: 1000, viewportH: 800 }),
		);
		expect(vp.left).toBe(-200);
		expect(vp.right).toBe(1000 / 2 + 200);
		expect(vp.top).toBe(-200);
		expect(vp.bottom).toBe(800 / 2 + 200);
	});

	it("applies viewportX / viewportY translation to left/right/top/bottom", () => {
		const vp = computeEdgeViewport(
			cfg({ worldScale: 1, viewportX: 500, viewportY: 300, viewportW: 1000, viewportH: 800 }),
		);
		expect(vp.left).toBe(-500 - 200);
		expect(vp.right).toBe((1000 - 500) / 1 + 200);
		expect(vp.top).toBe(-300 - 200);
		expect(vp.bottom).toBe((800 - 300) / 1 + 200);
	});

	it("respects margin=0 (no padding around viewport)", () => {
		const vp = computeEdgeViewport(
			cfg({ worldScale: 1, viewportX: 0, viewportY: 0, viewportW: 500, viewportH: 400 }),
			0,
		);
		// left/top compute `-0` via `-vx/ws - margin` when vx=0, margin=0 —
		// numerically equivalent to 0, so we compare with toBeCloseTo.
		expect(vp.left).toBeCloseTo(0);
		expect(vp.right).toBe(500);
		expect(vp.top).toBeCloseTo(0);
		expect(vp.bottom).toBe(400);
	});

	it("respects a large custom margin (1000)", () => {
		const vp = computeEdgeViewport(
			cfg({ worldScale: 1, viewportX: 0, viewportY: 0, viewportW: 500, viewportH: 400 }),
			1000,
		);
		expect(vp.left).toBe(-1000);
		expect(vp.right).toBe(500 + 1000);
		expect(vp.top).toBe(-1000);
		expect(vp.bottom).toBe(400 + 1000);
	});

	it("treats undefined worldScale as 1", () => {
		const vpUndef = computeEdgeViewport(
			cfg({ viewportX: 100, viewportY: 100, viewportW: 200, viewportH: 200 }),
		);
		const vpOne = computeEdgeViewport(
			cfg({ worldScale: 1, viewportX: 100, viewportY: 100, viewportW: 200, viewportH: 200 }),
		);
		expect(vpUndef).toEqual(vpOne);
	});

	it("combines worldScale, pan, and margin correctly", () => {
		const vp = computeEdgeViewport(
			cfg({ worldScale: 0.5, viewportX: 200, viewportY: 100, viewportW: 400, viewportH: 300 }),
			50,
		);
		// ws=0.5, vx=200 → left = -200/0.5 - 50 = -450
		expect(vp.left).toBe(-450);
		// (400-200)/0.5 + 50 = 450
		expect(vp.right).toBe(450);
		// -100/0.5 - 50 = -250
		expect(vp.top).toBe(-250);
		// (300-100)/0.5 + 50 = 450
		expect(vp.bottom).toBe(450);
	});
});

describe("isBothEndpointsOutside", () => {
	const vp = { left: 0, right: 100, top: 0, bottom: 100 };

	it("returns false when both endpoints are inside the viewport", () => {
		expect(isBothEndpointsOutside({ x: 10, y: 10 }, { x: 50, y: 50 }, vp)).toBe(false);
	});

	it("returns true when both endpoints are outside (same side)", () => {
		expect(isBothEndpointsOutside({ x: -10, y: 50 }, { x: -50, y: 50 }, vp)).toBe(true);
	});

	it("returns false when exactly one endpoint is outside (edge straddles viewport)", () => {
		expect(isBothEndpointsOutside({ x: -10, y: 50 }, { x: 50, y: 50 }, vp)).toBe(false);
	});

	it("treats a point on the viewport boundary as inside (not strictly outside)", () => {
		expect(isBothEndpointsOutside({ x: 0, y: 0 }, { x: 100, y: 100 }, vp)).toBe(false);
	});
});
