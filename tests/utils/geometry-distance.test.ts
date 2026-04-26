import { describe, it, expect } from "vitest";
import { squaredDistance, distance, findNearestIndex } from "../../src/utils/geometry";

describe("squaredDistance", () => {
	it("returns 0 for same point", () => {
		expect(squaredDistance(1, 2, 1, 2)).toBe(0);
	});

	it("returns correct squared distance", () => {
		expect(squaredDistance(0, 0, 3, 4)).toBe(25);
	});

	it("is symmetric", () => {
		expect(squaredDistance(1, 2, 3, 4)).toBe(squaredDistance(3, 4, 1, 2));
	});
});

describe("distance", () => {
	it("returns 0 for same point", () => {
		expect(distance(5, 5, 5, 5)).toBe(0);
	});

	it("returns correct euclidean distance", () => {
		expect(distance(0, 0, 3, 4)).toBe(5);
	});

	it("handles negative coordinates", () => {
		expect(distance(-1, -1, 2, 3)).toBe(5);
	});
});

describe("findNearestIndex", () => {
	it("returns -1 for empty array", () => {
		expect(findNearestIndex([], 0, 0)).toBe(-1);
	});

	it("returns 0 for single point", () => {
		expect(findNearestIndex([{ x: 5, y: 5 }], 0, 0)).toBe(0);
	});

	it("finds nearest point", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 10, y: 10 },
			{ x: 3, y: 4 },
		];
		expect(findNearestIndex(points, 2, 3)).toBe(2);
	});

	it("returns first when equidistant", () => {
		const points = [
			{ x: 1, y: 0 },
			{ x: -1, y: 0 },
		];
		expect(findNearestIndex(points, 0, 0)).toBe(0);
	});
});
