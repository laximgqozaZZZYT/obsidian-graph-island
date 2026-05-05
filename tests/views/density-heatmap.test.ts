import { describe, it, expect } from "vitest";
import { accumulateDensityGrid, gridMax, drawDensityHeatmap, type DensityPoint } from "../../src/views/density-heatmap";

/** Minimal 2D context recorder for assertions. */
interface RecordedFill {
	style: string;
	x: number;
	y: number;
	w: number;
	h: number;
}
function mockCtx(): { ctx: CanvasRenderingContext2D; fills: RecordedFill[] } {
	const fills: RecordedFill[] = [];
	let style = "";
	const ctx = {
		set fillStyle(v: string) {
			style = v;
		},
		get fillStyle() {
			return style;
		},
		fillRect(x: number, y: number, w: number, h: number) {
			fills.push({ style, x, y, w, h });
		},
	} as unknown as CanvasRenderingContext2D;
	return { ctx, fills };
}

describe("accumulateDensityGrid", () => {
	it("returns an empty grid when no points are provided", () => {
		const g = accumulateDensityGrid([], 4, 3, 10, 1);
		expect(g.length).toBe(12);
		expect(gridMax(g)).toBe(0);
	});

	it("returns zero-length grid for non-positive dims", () => {
		expect(accumulateDensityGrid([{ sx: 0, sy: 0 }], 0, 5, 10, 1).length).toBe(0);
		expect(accumulateDensityGrid([{ sx: 0, sy: 0 }], 5, 0, 10, 1).length).toBe(0);
	});

	it("guards against zero/negative cell or radius", () => {
		const g1 = accumulateDensityGrid([{ sx: 0, sy: 0 }], 4, 4, 0, 1);
		expect(gridMax(g1)).toBe(0);
		const g2 = accumulateDensityGrid([{ sx: 0, sy: 0 }], 4, 4, 10, -1);
		expect(gridMax(g2)).toBe(0);
	});

	it("places the centre Gaussian peak at the cell containing the point", () => {
		const cols = 5;
		const rows = 5;
		const cell = 10;
		// Point lands in cell (col=2, row=2)
		const grid = accumulateDensityGrid([{ sx: 25, sy: 25 }], cols, rows, cell, 1);
		const center = grid[2 * cols + 2];
		const left = grid[2 * cols + 1];
		const top = grid[1 * cols + 2];
		expect(center).toBeGreaterThan(left);
		expect(center).toBeGreaterThan(top);
		// Centre value equals exp(0) = 1 from the single point.
		expect(center).toBeCloseTo(1, 6);
	});

	it("clips Gaussian contributions outside the grid", () => {
		const grid = accumulateDensityGrid([{ sx: 0, sy: 0 }], 3, 3, 10, 2);
		// All non-negative; corner cell (0,0) is the point itself.
		expect(grid[0]).toBeCloseTo(1, 6);
		// Out-of-grid cells are dropped — total mass < full Gaussian sum.
		const sum = Array.from(grid).reduce((a, b) => a + b, 0);
		expect(sum).toBeLessThan(5);
	});

	it("accumulates contributions linearly across multiple points", () => {
		const cell = 10;
		const cols = 3;
		const rows = 3;
		const single = accumulateDensityGrid([{ sx: 15, sy: 15 }], cols, rows, cell, 1);
		const doubled = accumulateDensityGrid(
			[
				{ sx: 15, sy: 15 },
				{ sx: 15, sy: 15 },
			],
			cols,
			rows,
			cell,
			1,
		);
		expect(doubled[1 * cols + 1]).toBeCloseTo(single[1 * cols + 1] * 2, 6);
	});

	it("places the point in the correct cell via Math.floor", () => {
		const cell = 10;
		// sx=29, cell=10 → col=2 (floor); sy=5 → row=0
		const grid = accumulateDensityGrid([{ sx: 29, sy: 5 }], 4, 2, cell, 1);
		// Peak is at the floored cell.
		const peak = grid[0 * 4 + 2];
		expect(peak).toBeCloseTo(1, 6);
		expect(grid[0 * 4 + 2]).toBeGreaterThan(grid[0 * 4 + 1]);
		expect(grid[0 * 4 + 2]).toBeGreaterThan(grid[0 * 4 + 3]);
	});
});

describe("gridMax", () => {
	it("returns 0 for an empty grid", () => {
		expect(gridMax(new Float32Array(0))).toBe(0);
	});

	it("returns 0 for an all-zero grid", () => {
		expect(gridMax(new Float32Array(10))).toBe(0);
	});

	it("returns the largest value", () => {
		const g = Float32Array.from([0, 1.5, 0.3, 2.7, 1]);
		expect(gridMax(g)).toBeCloseTo(2.7, 6);
	});
});

describe("drawDensityHeatmap", () => {
	it("returns 0 and skips drawing for empty grid", () => {
		const { ctx, fills } = mockCtx();
		const out = drawDensityHeatmap(ctx, new Float32Array(9), 3, 3, 10, 0.05);
		expect(out).toBe(0);
		expect(fills).toHaveLength(0);
	});

	it("skips cells below the minValue threshold", () => {
		const { ctx, fills } = mockCtx();
		// max=10, min=0.05 → cells normalised <0.05 are skipped (0..0.4 absolute).
		const grid = Float32Array.from([10, 1, 0.4, 0.5]);
		drawDensityHeatmap(ctx, grid, 2, 2, 10, 0.05);
		// Cells with value 10, 1, 0.5 pass; 0.4/10=0.04 < 0.05 is dropped.
		expect(fills).toHaveLength(3);
	});

	it("paints cell rects of the correct size at row-major positions", () => {
		const { ctx, fills } = mockCtx();
		const grid = Float32Array.from([1, 0, 0, 1]);
		drawDensityHeatmap(ctx, grid, 2, 2, 25, 0.1);
		const positions = fills.map((f) => `${f.x},${f.y},${f.w},${f.h}`).sort();
		expect(positions).toEqual(["0,0,25,25", "25,25,25,25"]);
	});

	it("uses an HSLA fill style derived from the normalised value", () => {
		const { ctx, fills } = mockCtx();
		drawDensityHeatmap(ctx, Float32Array.from([1]), 1, 1, 10, 0);
		expect(fills[0].style).toMatch(/^hsla\(0, 80%, 50%, 0\.25\)$/);
	});

	it("returns the raw maximum density it observed", () => {
		const { ctx } = mockCtx();
		const out = drawDensityHeatmap(ctx, Float32Array.from([0.1, 0.7, 2.4]), 3, 1, 10, 0);
		expect(out).toBeCloseTo(2.4, 6);
	});
});

describe("integration: accumulate → draw", () => {
	it("does not throw on a typical small grid with a few points", () => {
		const cols = 8;
		const rows = 6;
		const cell = 12;
		const points: DensityPoint[] = [
			{ sx: 30, sy: 20 },
			{ sx: 60, sy: 50 },
			{ sx: 90, sy: 30 },
		];
		const grid = accumulateDensityGrid(points, cols, rows, cell, 2);
		expect(gridMax(grid)).toBeGreaterThan(0);
		const { ctx, fills } = mockCtx();
		drawDensityHeatmap(ctx, grid, cols, rows, cell, 0.05);
		expect(fills.length).toBeGreaterThan(0);
	});
});
