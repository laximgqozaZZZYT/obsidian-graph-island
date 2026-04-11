import { describe, it, expect } from "vitest";
import {
	computeZoomNodeBoost,
	computeBaseStrokeWidth,
	computeNodeAlpha,
	resolveNodeDrawColor,
} from "../../src/views/node-render-helpers";
import type { DenseStrokeConfig } from "../../src/views/node-render-helpers";

const DS: DenseStrokeConfig = { zoomLow: 0.3, zoomMid: 0.6, maxWidth: 6, midWidth: 2 };

describe("computeZoomNodeBoost", () => {
	it("returns 1 at worldScale >= 0.5", () => {
		expect(computeZoomNodeBoost(0.5)).toBe(1);
		expect(computeZoomNodeBoost(1)).toBe(1);
	});

	it("boosts at low zoom", () => {
		expect(computeZoomNodeBoost(0.0)).toBe(1.25);
		expect(computeZoomNodeBoost(0.25)).toBeCloseTo(1.125);
	});
});

describe("computeBaseStrokeWidth", () => {
	it("uses maxWidth cap at very low zoom", () => {
		expect(computeBaseStrokeWidth(0.1, false, DS)).toBeCloseTo(Math.min(20, 6));
	});

	it("uses midWidth in mid zoom range", () => {
		expect(computeBaseStrokeWidth(0.4, false, DS)).toBe(2);
	});

	it("returns 1 at high zoom", () => {
		expect(computeBaseStrokeWidth(0.8, false, DS)).toBe(1);
	});

	it("doubles for high contrast", () => {
		expect(computeBaseStrokeWidth(0.8, true, DS)).toBe(2);
		expect(computeBaseStrokeWidth(0.4, true, DS)).toBe(4);
	});
});

describe("computeNodeAlpha", () => {
	it("uses base alpha for non-filtered nodes", () => {
		expect(computeNodeAlpha(0.8, false, 0.3, 1, -1, 10, 0.2)).toBe(0.8);
	});

	it("dims filtered-out nodes", () => {
		expect(computeNodeAlpha(0.8, true, 0.3, 1, -1, 10, 0.2)).toBeCloseTo(0.24);
	});

	it("fades low-degree nodes at zoom-out", () => {
		const a = computeNodeAlpha(1, false, 0.3, 0.15, 25, 10, 0.2);
		expect(a).toBeLessThan(1);
		expect(a).toBeGreaterThan(0);
	});

	it("does not fade prominent nodes", () => {
		expect(computeNodeAlpha(1, false, 0.3, 0.15, 5, 10, 0.2)).toBe(1);
	});

	it("respects fadeLowDegreeFloor", () => {
		const a = computeNodeAlpha(1, false, 0.3, 0.01, 25, 10, 0.5);
		expect(a).toBeGreaterThanOrEqual(0.5);
	});
});

describe("resolveNodeDrawColor", () => {
	const desaturate = (c: number, s: number) => Math.round(c * s);

	it("returns original color for prominent nodes", () => {
		expect(resolveNodeDrawColor(0xff0000, 3, 10, 0.5, desaturate)).toBe(0xff0000);
	});

	it("desaturates non-prominent nodes", () => {
		const result = resolveNodeDrawColor(0xff0000, 15, 10, 0.5, desaturate);
		expect(result).not.toBe(0xff0000);
	});

	it("returns original for negative sortRank", () => {
		expect(resolveNodeDrawColor(0xff0000, -1, 10, 0.5, desaturate)).toBe(0xff0000);
	});
});
