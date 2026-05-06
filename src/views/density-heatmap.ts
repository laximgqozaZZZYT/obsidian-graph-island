/**
 * Pure helpers for the density heatmap overlay.
 * Extracted from GraphViewContainer to keep render logic out of the god object.
 */

export interface DensityPoint {
	sx: number;
	sy: number;
}

/**
 * Accumulate Gaussian density contributions from screen-space points into a
 * row-major flat grid (length = cols * rows). Each input point contributes a
 * 2D falloff kernel `exp(-(dr² + dc²) / (gaussianRadius * 0.8))` over the
 * (2·gaussianRadius + 1)² neighborhood around its containing cell. Cells that
 * fall outside the grid bounds are skipped.
 *
 * The function is fully pure: callers project world→screen coordinates and
 * filter for visibility before passing points in.
 */
export function accumulateDensityGrid(
	points: Iterable<DensityPoint>,
	cols: number,
	rows: number,
	cell: number,
	gaussianRadius: number,
): Float32Array {
	const size = Math.max(0, cols) * Math.max(0, rows);
	const grid = new Float32Array(size);
	if (cols <= 0 || rows <= 0 || cell <= 0 || gaussianRadius < 0) return grid;

	const sigmaSq = gaussianRadius * 0.8;
	for (const p of points) {
		const ci = Math.floor(p.sx / cell);
		const ri = Math.floor(p.sy / cell);
		for (let dr = -gaussianRadius; dr <= gaussianRadius; dr++) {
			for (let dc = -gaussianRadius; dc <= gaussianRadius; dc++) {
				const r = ri + dr;
				const c = ci + dc;
				if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
				grid[r * cols + c] += sigmaSq > 0 ? Math.exp(-(dr * dr + dc * dc) / sigmaSq) : 1;
			}
		}
	}
	return grid;
}
