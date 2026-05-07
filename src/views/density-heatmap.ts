/**
 * Pure helpers for the density heatmap overlay.
 * Extracted from GraphViewContainer to reduce its size and enable unit testing.
 */

/**
 * Accumulate Gaussian density contributions from visible node positions into a grid.
 *
 * For each input position (in world coordinates), the function projects it to screen
 * space via `screenX = x * ws + wx` (likewise for y), determines the cell it falls in,
 * and adds an exponential-falloff contribution to all cells within `gaussianRadius`.
 * The denominator preserves the original GVC formula `gaussianRadius * 0.8`.
 *
 * The returned `Float32Array` is row-major: `grid[r * cols + c]` is the density at
 * row r, column c. Cells outside the grid are silently skipped.
 *
 * Why pure: caller iterates `pixiNodes` and supplies just the world-space (x, y)
 * positions of visible nodes. No DOM, no canvas, no PixiNode internals.
 */
export function accumulateDensityGrid(
	positions: Iterable<{ x: number; y: number }>,
	cols: number,
	rows: number,
	cell: number,
	wx: number,
	wy: number,
	ws: number,
	gaussianRadius: number,
): Float32Array {
	const grid = new Float32Array(cols * rows);
	const denom = gaussianRadius * 0.8;
	for (const p of positions) {
		const sx = p.x * ws + wx;
		const sy = p.y * ws + wy;
		const ci = Math.floor(sx / cell);
		const ri = Math.floor(sy / cell);
		for (let dr = -gaussianRadius; dr <= gaussianRadius; dr++) {
			for (let dc = -gaussianRadius; dc <= gaussianRadius; dc++) {
				const r = ri + dr;
				const c = ci + dc;
				if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
				grid[r * cols + c] += Math.exp(-(dr * dr + dc * dc) / denom);
			}
		}
	}
	return grid;
}
