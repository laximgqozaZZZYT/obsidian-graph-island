/**
 * Density heatmap grid accumulation — pure function extracted from
 * GraphViewContainer to avoid per-frame intermediate allocations.
 *
 * The projector + iterator API avoids materializing a `DensityPoint[]`
 * snapshot of visible nodes: callers iterate their own collection and
 * project on-the-fly.
 */

export interface NodeProjection {
	sx: number;
	sy: number;
	visible: boolean;
}

export type NodeProjector = (node: unknown) => NodeProjection | null;

/**
 * Accumulate Gaussian density contributions from visible nodes into a grid.
 *
 * @param sigmaFactor Divisor factor in `exp(-d² / (radius * sigmaFactor))`.
 *   Higher values widen the Gaussian falloff per cell.
 */
export function accumulateDensityGrid(
	nodes: Iterable<unknown>,
	project: NodeProjector,
	cols: number,
	rows: number,
	cell: number,
	radius: number,
	sigmaFactor: number,
): Float32Array {
	const grid = new Float32Array(cols * rows);
	const denom = radius * sigmaFactor;
	for (const node of nodes) {
		const p = project(node);
		if (!p || !p.visible) continue;
		const ci = Math.floor(p.sx / cell);
		const ri = Math.floor(p.sy / cell);
		for (let dr = -radius; dr <= radius; dr++) {
			for (let dc = -radius; dc <= radius; dc++) {
				const r = ri + dr;
				const c = ci + dc;
				if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
				grid[r * cols + c] += Math.exp(-(dr * dr + dc * dc) / denom);
			}
		}
	}
	return grid;
}
