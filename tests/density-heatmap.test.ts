import { describe, it, expect } from "vitest";
import { accumulateDensityGrid } from "../src/views/density-heatmap";

// All tests use ws=1, wx=0, wy=0 unless stated, so world coords == screen coords.

describe("accumulateDensityGrid", () => {
	it("returns a zero-filled grid of length cols*rows when no positions are given", () => {
		const grid = accumulateDensityGrid([], 4, 3, 40, 0, 0, 1, 3);
		expect(grid).toBeInstanceOf(Float32Array);
		expect(grid.length).toBe(12);
		for (const v of grid) expect(v).toBe(0);
	});

	it("places the maximum density at the cell containing the node", () => {
		// Node at world (60, 60), cell=40 → cell index (1, 1).
		const grid = accumulateDensityGrid([{ x: 60, y: 60 }], 4, 4, 40, 0, 0, 1, 3);
		const cellIdx = (r: number, c: number) => r * 4 + c;
		// The peak (dr=dc=0) is exp(0) = 1 — every other cell is strictly smaller.
		expect(grid[cellIdx(1, 1)]).toBeCloseTo(1, 6);
		// Check a couple of neighboring cells fall off
		expect(grid[cellIdx(1, 1)]).toBeGreaterThan(grid[cellIdx(0, 1)]);
		expect(grid[cellIdx(1, 1)]).toBeGreaterThan(grid[cellIdx(1, 0)]);
	});

	it("is symmetric around the node center", () => {
		// Place a node at the exact center of an odd-sized grid so symmetry is clean.
		const grid = accumulateDensityGrid([{ x: 200, y: 200 }], 9, 9, 40, 0, 0, 1, 3);
		const at = (r: number, c: number) => grid[r * 9 + c];
		// Center is (5, 5) since x=200 → ci=floor(200/40)=5.
		// Diagonal symmetry: (5+dr, 5+dc) == (5-dr, 5-dc)
		for (let d = 1; d <= 3; d++) {
			expect(at(5 + d, 5)).toBeCloseTo(at(5 - d, 5), 6);
			expect(at(5, 5 + d)).toBeCloseTo(at(5, 5 - d), 6);
			expect(at(5 + d, 5 + d)).toBeCloseTo(at(5 - d, 5 - d), 6);
		}
	});

	it("clips contributions outside the grid (no out-of-bounds writes)", () => {
		// Node near top-left so much of the Gaussian falls outside.
		const cols = 5;
		const rows = 5;
		const grid = accumulateDensityGrid([{ x: 0, y: 0 }], cols, rows, 40, 0, 0, 1, 3);
		// Anything inside the grid must remain finite and >= 0.
		for (const v of grid) {
			expect(Number.isFinite(v)).toBe(true);
			expect(v).toBeGreaterThanOrEqual(0);
		}
		// (0,0) is the node cell (ri=0, ci=0): it gets the dr=dc=0 contribution = 1.
		expect(grid[0]).toBeCloseTo(1, 6);
	});

	it("accumulates contributions from multiple nodes additively", () => {
		const single = accumulateDensityGrid([{ x: 60, y: 60 }], 4, 4, 40, 0, 0, 1, 3);
		const both = accumulateDensityGrid(
			[
				{ x: 60, y: 60 },
				{ x: 60, y: 60 },
			],
			4,
			4,
			40,
			0,
			0,
			1,
			3,
		);
		for (let i = 0; i < single.length; i++) {
			expect(both[i]).toBeCloseTo(single[i] * 2, 6);
		}
	});

	it("applies world transform: ws scales coordinates and wx/wy translate them", () => {
		// World (10, 20) with ws=4, wx=20, wy=0 → screen (60, 80) → cell (1, 2)
		const grid = accumulateDensityGrid([{ x: 10, y: 20 }], 4, 4, 40, 20, 0, 4, 3);
		const peak = grid[2 * 4 + 1]; // r=2, c=1
		expect(peak).toBeCloseTo(1, 6);
		// Verify the same node without world transform peaks elsewhere.
		const grid0 = accumulateDensityGrid([{ x: 10, y: 20 }], 4, 4, 40, 0, 0, 1, 3);
		expect(grid0[0 * 4 + 0]).toBeCloseTo(1, 6); // cell (0, 0)
	});

	it("respects the provided gaussianRadius (no contribution beyond it)", () => {
		// gaussianRadius=1 means only a 3×3 stamp around the cell receives contributions.
		const cols = 7;
		const rows = 7;
		const grid = accumulateDensityGrid([{ x: 140, y: 140 }], cols, rows, 40, 0, 0, 1, 1);
		// Center cell index (3, 3). Anything > 1 cell away must be 0.
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				if (Math.abs(r - 3) > 1 || Math.abs(c - 3) > 1) {
					expect(grid[r * cols + c]).toBe(0);
				}
			}
		}
	});

	it("uses denom = gaussianRadius * 0.8 (matches original GVC formula)", () => {
		const grid = accumulateDensityGrid([{ x: 60, y: 60 }], 4, 4, 40, 0, 0, 1, 3);
		// Node cell (1, 1). The neighbor (1, 0) has dr=0, dc=-1 → exp(-1 / (3 * 0.8)) = exp(-1/2.4)
		const expected = Math.exp(-1 / (3 * 0.8));
		expect(grid[1 * 4 + 0]).toBeCloseTo(expected, 6);
	});

	it("returns a Float32Array of exactly cols*rows length", () => {
		const grid = accumulateDensityGrid([], 17, 23, 40, 0, 0, 1, 3);
		expect(grid).toBeInstanceOf(Float32Array);
		expect(grid.length).toBe(17 * 23);
	});

	it("handles an iterable (generator) source, not just an array", () => {
		function* gen() {
			yield { x: 60, y: 60 };
			yield { x: 60, y: 60 };
		}
		const grid = accumulateDensityGrid(gen(), 4, 4, 40, 0, 0, 1, 3);
		// Two coincident nodes → peak exactly 2.
		expect(grid[1 * 4 + 1]).toBeCloseTo(2, 6);
	});
});
