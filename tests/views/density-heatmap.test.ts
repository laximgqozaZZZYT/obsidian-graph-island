import { describe, it, expect } from "vitest";
import { accumulateDensityGrid, type DensityPoint } from "../../src/views/density-heatmap";

describe("accumulateDensityGrid", () => {
	it("returns an empty grid when there are no points", () => {
		const g = accumulateDensityGrid([], 4, 3, 10, 1);
		expect(g.length).toBe(12);
		for (const v of g) expect(v).toBe(0);
	});

	it("returns a zero-length buffer for non-positive dimensions", () => {
		expect(accumulateDensityGrid([{ sx: 0, sy: 0 }], 0, 5, 10, 1).length).toBe(0);
		expect(accumulateDensityGrid([{ sx: 0, sy: 0 }], 5, 0, 10, 1).length).toBe(0);
	});

	it("returns a zero-filled grid when cell size is non-positive", () => {
		const g = accumulateDensityGrid([{ sx: 0, sy: 0 }], 2, 2, 0, 1);
		expect(g.length).toBe(4);
		for (const v of g) expect(v).toBe(0);
	});

	it("places maximum density at the cell containing a single point", () => {
		const cell = 10;
		const radius = 1;
		const points: DensityPoint[] = [{ sx: 25, sy: 25 }];
		// 5x5 grid, point falls in cell (col=2, row=2)
		const g = accumulateDensityGrid(points, 5, 5, cell, radius);
		const center = g[2 * 5 + 2];
		// Center is exp(0) = 1, neighbors are exp(-1/0.8) and exp(-2/0.8)
		expect(center).toBeCloseTo(1, 5);
		// All 8 neighbors + center = 9 cells touched, rest must be zero
		const touched = (1 + 2 * radius) ** 2;
		const nonZero = g.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
		expect(nonZero).toBe(touched);
	});

	it("clips kernel contributions outside grid bounds", () => {
		// Point at top-left corner — kernel of radius 1 means 3 of 9 cells fall inside
		const g = accumulateDensityGrid([{ sx: 5, sy: 5 }], 3, 3, 10, 1);
		// In-grid cells touched: (0,0), (1,0), (0,1), (1,1) — 4 cells
		const nonZero = g.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
		expect(nonZero).toBe(4);
	});

	it("accumulates contributions additively from multiple points", () => {
		const cell = 10;
		const radius = 1;
		const single = accumulateDensityGrid([{ sx: 25, sy: 25 }], 5, 5, cell, radius);
		const doubled = accumulateDensityGrid(
			[
				{ sx: 25, sy: 25 },
				{ sx: 25, sy: 25 },
			],
			5,
			5,
			cell,
			radius,
		);
		for (let i = 0; i < single.length; i++) {
			expect(doubled[i]).toBeCloseTo(single[i] * 2, 5);
		}
	});

	it("decays radially: closer cells receive more weight than far cells", () => {
		const g = accumulateDensityGrid([{ sx: 25, sy: 25 }], 5, 5, 10, 2);
		const center = g[2 * 5 + 2];
		const adjacent = g[2 * 5 + 3]; // (col=3, row=2), dr=0 dc=1
		const diagonal = g[3 * 5 + 3]; // (col=3, row=3), dr=1 dc=1
		expect(center).toBeGreaterThan(adjacent);
		expect(adjacent).toBeGreaterThan(diagonal);
	});

	it("returns a grid of length cols*rows", () => {
		const g = accumulateDensityGrid([], 7, 11, 10, 2);
		expect(g.length).toBe(77);
	});
});
