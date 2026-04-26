import { describe, it, expect } from "vitest";
import { computeLabelScreenFontSize } from "../src/views/labels/label-font-size";

describe("computeLabelScreenFontSize", () => {
	it("returns rawFontSize at zoom=1 (no scaling needed)", () => {
		expect(computeLabelScreenFontSize(11, 1, 8)).toBe(11);
	});

	it("scales up linearly with zoom-in", () => {
		expect(computeLabelScreenFontSize(11, 2, 8)).toBe(22);
		expect(computeLabelScreenFontSize(10, 3, 8)).toBe(30);
	});

	it("clamps to minPx at zoom-out below the floor", () => {
		// natural: 11 * 0.05 = 0.55, but minPx=11 → returns 11
		expect(computeLabelScreenFontSize(11, 0.05, 11)).toBe(11);
	});

	it("returns natural size when above the floor", () => {
		// natural: 11 * 0.5 = 5.5, minPx=4 → returns 5.5
		expect(computeLabelScreenFontSize(11, 0.5, 4)).toBe(5.5);
	});

	it("respects an arbitrary higher minimum readable px", () => {
		expect(computeLabelScreenFontSize(11, 0.1, 14)).toBe(14);
	});

	it("returns safe minPx for non-finite rawFontSize", () => {
		expect(computeLabelScreenFontSize(NaN, 1, 11)).toBe(11);
		expect(computeLabelScreenFontSize(Infinity, 1, 11)).toBe(11);
	});

	it("returns safe minPx for non-finite worldScale", () => {
		expect(computeLabelScreenFontSize(11, NaN, 11)).toBe(11);
		expect(computeLabelScreenFontSize(11, Infinity, 11)).toBe(11);
	});

	it("returns safe minPx for non-positive rawFontSize / worldScale", () => {
		expect(computeLabelScreenFontSize(0, 1, 11)).toBe(11);
		expect(computeLabelScreenFontSize(-5, 1, 11)).toBe(11);
		expect(computeLabelScreenFontSize(11, 0, 11)).toBe(11);
		expect(computeLabelScreenFontSize(11, -0.5, 11)).toBe(11);
	});

	it("returns 0 when all inputs are invalid (degenerate but defined)", () => {
		expect(computeLabelScreenFontSize(0, 0, 0)).toBe(0);
		expect(computeLabelScreenFontSize(0, 0, -1)).toBe(0);
	});

	it("is monotonically non-decreasing in worldScale", () => {
		const a = computeLabelScreenFontSize(11, 0.2, 5);
		const b = computeLabelScreenFontSize(11, 1, 5);
		const c = computeLabelScreenFontSize(11, 2, 5);
		expect(b).toBeGreaterThanOrEqual(a);
		expect(c).toBeGreaterThanOrEqual(b);
	});

	it("never drops below minPx for any finite positive scale", () => {
		const minPx = 11;
		for (const zoom of [0.001, 0.01, 0.1, 0.5, 1, 2, 10]) {
			const result = computeLabelScreenFontSize(11, zoom, minPx);
			expect(result).toBeGreaterThanOrEqual(minPx);
		}
	});
});
