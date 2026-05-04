// ---------------------------------------------------------------------------
// density-heatmap.ts — Pure density-heatmap accumulation + Canvas2D rendering
// ---------------------------------------------------------------------------
// Extracted from GraphViewContainer to enable unit testing without
// GVC/PixiJS dependencies. The accumulator is a pure Float32Array producer;
// the renderer is the only piece that touches a CanvasRenderingContext2D.
// ---------------------------------------------------------------------------

import { GVC_HEATMAP_CELL_SIZE, GVC_HEATMAP_GAUSSIAN_RADIUS, GVC_HEATMAP_MIN_VALUE } from "../constants";

/** A point with on-screen-eligible visibility used by the heatmap. */
export interface DensityNodePoint {
	/** World-space x */
	x: number;
	/** World-space y */
	y: number;
	/** When false, the node is skipped (off-LOD, hidden, etc.) */
	visible: boolean;
}

/**
 * Accumulate Gaussian density contributions from visible nodes into a
 * `cols × rows` grid (row-major Float32Array).
 *
 * World→screen mapping is `screen = world * ws + (wx, wy)`, so the caller
 * supplies the world container's translation/scale. Out-of-bounds cells are
 * dropped silently — this is rendering-only data.
 */
export function accumulateDensityGrid(
	nodes: Iterable<DensityNodePoint>,
	cols: number,
	rows: number,
	cell: number,
	wx: number,
	wy: number,
	ws: number,
): Float32Array {
	const grid = new Float32Array(cols * rows);
	if (cols <= 0 || rows <= 0 || cell <= 0) return grid;
	const radius = GVC_HEATMAP_GAUSSIAN_RADIUS;
	const sigma = radius * 0.8;
	for (const n of nodes) {
		if (!n.visible) continue;
		const sx = n.x * ws + wx;
		const sy = n.y * ws + wy;
		const ci = Math.floor(sx / cell);
		const ri = Math.floor(sy / cell);
		for (let dr = -radius; dr <= radius; dr++) {
			const r = ri + dr;
			if (r < 0 || r >= rows) continue;
			for (let dc = -radius; dc <= radius; dc++) {
				const c = ci + dc;
				if (c < 0 || c >= cols) continue;
				grid[r * cols + c] += Math.exp(-(dr * dr + dc * dc) / sigma);
			}
		}
	}
	return grid;
}

/**
 * Render a normalized density heatmap onto a Canvas2D context using
 * blue→red HSL bands. Cells below `GVC_HEATMAP_MIN_VALUE` (after
 * normalization) are dropped to avoid washed-out background noise.
 */
export function renderDensityHeatmap(
	ctx: CanvasRenderingContext2D,
	nodes: Iterable<DensityNodePoint>,
	canvasW: number,
	canvasH: number,
	wx: number,
	wy: number,
	ws: number,
	cell: number = GVC_HEATMAP_CELL_SIZE,
): void {
	if (canvasW <= 0 || canvasH <= 0 || cell <= 0) return;
	const cols = Math.ceil(canvasW / cell);
	const rows = Math.ceil(canvasH / cell);
	const grid = accumulateDensityGrid(nodes, cols, rows, cell, wx, wy, ws);

	let maxD = 0;
	for (let i = 0; i < grid.length; i++) {
		if (grid[i] > maxD) maxD = grid[i];
	}
	if (maxD === 0) return;

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const v = grid[r * cols + c] / maxD;
			if (v < GVC_HEATMAP_MIN_VALUE) continue;
			const h = (1 - v) * 240;
			const a = v * 0.25;
			ctx.fillStyle = `hsla(${h}, 80%, 50%, ${a})`;
			ctx.fillRect(c * cell, r * cell, cell, cell);
		}
	}
}
