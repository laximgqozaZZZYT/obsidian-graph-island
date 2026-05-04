import { describe, it, expect, vi } from "vitest";
import { accumulateDensityGrid, renderDensityHeatmap } from "../../src/utils/density-heatmap";
import { GVC_HEATMAP_CELL_SIZE, GVC_HEATMAP_GAUSSIAN_RADIUS, GVC_HEATMAP_MIN_VALUE } from "../../src/constants";

describe("accumulateDensityGrid", () => {
	it("returns an empty grid when there are no nodes", () => {
		const grid = accumulateDensityGrid([], 4, 4, 10, 0, 0, 1);
		expect(grid.length).toBe(16);
		expect(Array.from(grid).every((v) => v === 0)).toBe(true);
	});

	it("skips invisible nodes", () => {
		const grid = accumulateDensityGrid([{ x: 20, y: 20, visible: false }], 4, 4, 10, 0, 0, 1);
		expect(Array.from(grid).every((v) => v === 0)).toBe(true);
	});

	it("returns a zero grid when cols/rows/cell are non-positive", () => {
		expect(accumulateDensityGrid([{ x: 0, y: 0, visible: true }], 0, 4, 10, 0, 0, 1).length).toBe(0);
		expect(accumulateDensityGrid([{ x: 0, y: 0, visible: true }], 4, 0, 10, 0, 0, 1).length).toBe(0);
		const grid = accumulateDensityGrid([{ x: 0, y: 0, visible: true }], 4, 4, 0, 0, 0, 1);
		expect(grid.length).toBe(16);
		expect(Array.from(grid).every((v) => v === 0)).toBe(true);
	});

	it("places maximum density at the cell containing the node", () => {
		// node at (50,50), cell=10 → ci=5, ri=5
		const grid = accumulateDensityGrid([{ x: 50, y: 50, visible: true }], 11, 11, 10, 0, 0, 1);
		const center = grid[5 * 11 + 5];
		// All other cells must be ≤ center (Gaussian falls off radially)
		for (let i = 0; i < grid.length; i++) {
			expect(grid[i]).toBeLessThanOrEqual(center + 1e-9);
		}
		expect(center).toBeCloseTo(1, 6);
	});

	it("applies world translation and scale before binning", () => {
		// node world (5, 5), ws=2, wx=10, wy=10 → screen (20, 20), cell=10 → ci=2, ri=2
		const grid = accumulateDensityGrid([{ x: 5, y: 5, visible: true }], 6, 6, 10, 10, 10, 2);
		expect(grid[2 * 6 + 2]).toBeCloseTo(1, 6);
	});

	it("drops contributions outside grid bounds", () => {
		// node far off the grid — center cell would be (-1, -1), all contributions dropped
		const grid = accumulateDensityGrid([{ x: -1000, y: -1000, visible: true }], 4, 4, 10, 0, 0, 1);
		expect(Array.from(grid).every((v) => v === 0)).toBe(true);
	});

	it("uses the configured Gaussian radius footprint", () => {
		const grid = accumulateDensityGrid([{ x: 100, y: 100, visible: true }], 21, 21, 10, 0, 0, 1);
		const ci = 10;
		const ri = 10;
		// Cells within ±radius receive a non-zero contribution
		const r = GVC_HEATMAP_GAUSSIAN_RADIUS;
		expect(grid[(ri + r) * 21 + (ci + r)]).toBeGreaterThan(0);
		// Cells outside the radius footprint receive nothing
		expect(grid[(ri + r + 1) * 21 + (ci + r + 1)]).toBe(0);
	});

	it("accumulates multiple nodes into the same cell", () => {
		const single = accumulateDensityGrid([{ x: 50, y: 50, visible: true }], 11, 11, 10, 0, 0, 1);
		const double = accumulateDensityGrid(
			[
				{ x: 50, y: 50, visible: true },
				{ x: 50, y: 50, visible: true },
			],
			11,
			11,
			10,
			0,
			0,
			1,
		);
		expect(double[5 * 11 + 5]).toBeCloseTo(single[5 * 11 + 5] * 2, 6);
	});
});

describe("renderDensityHeatmap", () => {
	type FillCall = { x: number; y: number; w: number; h: number; style: string };

	function makeMockCtx(): { ctx: CanvasRenderingContext2D; calls: FillCall[]; styles: string[] } {
		const calls: FillCall[] = [];
		const styles: string[] = [];
		let currentStyle = "";
		const ctx = {
			get fillStyle() {
				return currentStyle;
			},
			set fillStyle(v: string) {
				currentStyle = v;
				styles.push(v);
			},
			fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
				calls.push({ x, y, w, h, style: currentStyle });
			}),
		} as unknown as CanvasRenderingContext2D;
		return { ctx, calls, styles };
	}

	it("does nothing when there are no visible nodes (maxD === 0)", () => {
		const { ctx, calls } = makeMockCtx();
		renderDensityHeatmap(ctx, [], 100, 100, 0, 0, 1);
		expect(calls.length).toBe(0);
	});

	it("does nothing when the canvas is degenerate", () => {
		const { ctx, calls } = makeMockCtx();
		renderDensityHeatmap(ctx, [{ x: 50, y: 50, visible: true }], 0, 100, 0, 0, 1);
		renderDensityHeatmap(ctx, [{ x: 50, y: 50, visible: true }], 100, 0, 0, 0, 1);
		expect(calls.length).toBe(0);
	});

	it("draws cells at multiples of the cell size", () => {
		const { ctx, calls } = makeMockCtx();
		const cell = GVC_HEATMAP_CELL_SIZE;
		renderDensityHeatmap(ctx, [{ x: cell * 2.5, y: cell * 2.5, visible: true }], cell * 6, cell * 6, 0, 0, 1);
		expect(calls.length).toBeGreaterThan(0);
		for (const c of calls) {
			expect(c.w).toBe(cell);
			expect(c.h).toBe(cell);
			expect(c.x % cell).toBe(0);
			expect(c.y % cell).toBe(0);
		}
	});

	it("emits HSL color strings with hue 0..240 and alpha ≤ 0.25", () => {
		const { ctx, styles } = makeMockCtx();
		renderDensityHeatmap(ctx, [{ x: 50, y: 50, visible: true }], 100, 100, 0, 0, 1);
		expect(styles.length).toBeGreaterThan(0);
		for (const s of styles) {
			const m = s.match(/^hsla\((\d+(?:\.\d+)?), 80%, 50%, (\d+(?:\.\d+)?)\)$/);
			expect(m).not.toBeNull();
			const hue = Number(m![1]);
			const alpha = Number(m![2]);
			expect(hue).toBeGreaterThanOrEqual(0);
			expect(hue).toBeLessThanOrEqual(240);
			expect(alpha).toBeGreaterThan(0);
			expect(alpha).toBeLessThanOrEqual(0.25);
		}
	});

	it("only draws cells whose normalized density exceeds GVC_HEATMAP_MIN_VALUE", () => {
		// Two nodes: one tight cluster (dense), one isolated (sparse).
		// After normalization the isolated node's cells should fall below the
		// MIN_VALUE threshold and be dropped.
		const { ctx, calls } = makeMockCtx();
		const cluster = Array.from({ length: 20 }, () => ({ x: 50, y: 50, visible: true as const }));
		const isolated = { x: 250, y: 250, visible: true as const };
		renderDensityHeatmap(ctx, [...cluster, isolated], 300, 300, 0, 0, 1);
		// All emitted cells must encode a value ≥ MIN_VALUE — verify by re-deriving
		// the normalized v from alpha (alpha = v * 0.25).
		for (const c of calls) {
			const m = c.style.match(/, (\d+(?:\.\d+)?)\)$/);
			const alpha = Number(m![1]);
			const v = alpha / 0.25;
			expect(v).toBeGreaterThanOrEqual(GVC_HEATMAP_MIN_VALUE - 1e-9);
		}
	});
});
