import { describe, it, expect } from "vitest";
import { quickSelect } from "../src/views/RenderPipeline";

describe("quickSelect", () => {
	it("returns k-th smallest in sorted array", () => {
		expect(quickSelect([1, 2, 3, 4, 5], 0)).toBe(1);
		expect(quickSelect([1, 2, 3, 4, 5], 2)).toBe(3);
		expect(quickSelect([1, 2, 3, 4, 5], 4)).toBe(5);
	});

	it("returns k-th smallest in unsorted array", () => {
		expect(quickSelect([5, 3, 1, 4, 2], 0)).toBe(1);
		expect(quickSelect([5, 3, 1, 4, 2], 2)).toBe(3);
		expect(quickSelect([5, 3, 1, 4, 2], 4)).toBe(5);
	});

	it("handles single element array", () => {
		expect(quickSelect([42], 0)).toBe(42);
	});

	it("handles empty array", () => {
		expect(quickSelect([], 0)).toBe(0);
	});

	it("returns 0 for out-of-bounds k", () => {
		expect(quickSelect([1, 2, 3], 5)).toBe(0);
		expect(quickSelect([1, 2, 3], -1)).toBe(0);
	});

	it("handles duplicates", () => {
		expect(quickSelect([3, 1, 3, 1, 2], 2)).toBe(2);
		expect(quickSelect([5, 5, 5, 5], 0)).toBe(5);
		expect(quickSelect([5, 5, 5, 5], 3)).toBe(5);
	});

	it("finds median (p50)", () => {
		const arr = [10, 20, 30, 40, 50];
		expect(quickSelect([...arr], 2)).toBe(30);
	});

	it("finds p90 for degree distribution", () => {
		// Simulate degree array: 100 nodes, degrees 1-100
		const degrees = Array.from({ length: 100 }, (_, i) => i + 1);
		// Shuffle
		for (let i = degrees.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[degrees[i], degrees[j]] = [degrees[j], degrees[i]];
		}
		const p90Idx = Math.floor(degrees.length * 0.9);
		const result = quickSelect([...degrees], p90Idx);
		expect(result).toBe(p90Idx + 1); // 91st value
	});

	it("handles two-element array", () => {
		expect(quickSelect([2, 1], 0)).toBe(1);
		expect(quickSelect([2, 1], 1)).toBe(2);
	});

	it("handles negative values", () => {
		expect(quickSelect([-5, -3, -1, 0, 2], 0)).toBe(-5);
		expect(quickSelect([-5, -3, -1, 0, 2], 4)).toBe(2);
	});
});
