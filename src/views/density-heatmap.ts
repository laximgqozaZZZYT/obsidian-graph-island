/**
 * Density-heatmap utilities for the analysis overlay.
 *
 * Operates entirely on screen-space points and a flat Float32Array grid so
 * the algorithms can be exercised without Pixi/DOM scaffolding.
 */
import {
	GVC_HEATMAP_CELL_SIZE as DEFAULT_CELL,
	GVC_HEATMAP_GAUSSIAN_RADIUS as DEFAULT_RADIUS,
	GVC_HEATMAP_MIN_VALUE as DEFAULT_MIN,
} from "../constants";

/** A single screen-space point that contributes density. */
export interface DensityPoint {
	sx: number;
	sy: number;
}

/**
 * Accumulate Gaussian density contributions from screen-space points into a
 * `cols × rows` cell grid (row-major Float32Array). Each point spreads a
 * Gaussian blob of `gaussianRadius` cells in either direction.
 */
export function accumulateDensityGrid(
	points: Iterable<DensityPoint>,
	cols: number,
	rows: number,
	cell: number = DEFAULT_CELL,
	gaussianRadius: number = DEFAULT_RADIUS,
): Float32Array {
	const grid = new Float32Array(cols * rows);
	if (cols <= 0 || rows <= 0 || cell <= 0 || gaussianRadius < 0) return grid;
	const sigmaSq = gaussianRadius * 0.8;
	for (const { sx, sy } of points) {
		const ci = Math.floor(sx / cell);
		const ri = Math.floor(sy / cell);
		for (let dr = -gaussianRadius; dr <= gaussianRadius; dr++) {
			for (let dc = -gaussianRadius; dc <= gaussianRadius; dc++) {
				const r = ri + dr;
				const c = ci + dc;
				if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
				grid[r * cols + c] += Math.exp(-(dr * dr + dc * dc) / sigmaSq);
			}
		}
	}
	return grid;
}

/** Maximum value across a flat grid. Returns 0 for empty grids. */
export function gridMax(grid: Float32Array): number {
	let m = 0;
	for (let i = 0; i < grid.length; i++) {
		if (grid[i] > m) m = grid[i];
	}
	return m;
}

/**
 * Paint a normalised density heatmap to a 2D canvas context. Cells whose
 * normalised value falls below `minValue` are skipped. Returns the maximum
 * raw density (0 means nothing was drawn).
 */
export function drawDensityHeatmap(
	ctx: CanvasRenderingContext2D,
	grid: Float32Array,
	cols: number,
	rows: number,
	cell: number = DEFAULT_CELL,
	minValue: number = DEFAULT_MIN,
): number {
	const maxD = gridMax(grid);
	if (maxD === 0) return 0;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const v = grid[r * cols + c] / maxD;
			if (v < minValue) continue;
			const h = (1 - v) * 240;
			const a = v * 0.25;
			ctx.fillStyle = `hsla(${h}, 80%, 50%, ${a})`;
			ctx.fillRect(c * cell, r * cell, cell, cell);
		}
	}
	return maxD;
}
