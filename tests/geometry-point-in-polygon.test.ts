import { describe, it, expect } from "vitest";
import { pointInPolygon } from "../src/utils/geometry";

describe("pointInPolygon", () => {
	const square = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 },
	];

	it("returns true for point inside square", () => {
		expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
	});

	it("returns false for point outside square", () => {
		expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
	});

	it("returns false for point above square", () => {
		expect(pointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
	});

	it("handles triangle", () => {
		const triangle = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 5, y: 10 },
		];
		expect(pointInPolygon({ x: 5, y: 3 }, triangle)).toBe(true);
		expect(pointInPolygon({ x: 0, y: 10 }, triangle)).toBe(false);
	});

	it("handles concave polygon (L-shape)", () => {
		const lShape = [
			{ x: 0, y: 0 },
			{ x: 5, y: 0 },
			{ x: 5, y: 5 },
			{ x: 10, y: 5 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(pointInPolygon({ x: 2, y: 2 }, lShape)).toBe(true);
		expect(pointInPolygon({ x: 8, y: 2 }, lShape)).toBe(false);
		expect(pointInPolygon({ x: 8, y: 8 }, lShape)).toBe(true);
	});

	it("returns false for empty polygon", () => {
		expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
	});

	it("returns false for single-point polygon", () => {
		expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
	});

	it("returns false for two-point polygon (line)", () => {
		expect(
			pointInPolygon({ x: 5, y: 0 }, [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
			]),
		).toBe(false);
	});
});
