/**
 * Density heatmap grid accumulation — pure, allocation-free per-frame.
 *
 * The caller provides an iterable of nodes plus a projector callback. The
 * function never builds an intermediate array of points; the only allocation
 * is the returned Float32Array grid. This keeps GC pressure flat for what is
 * a per-frame render-loop helper.
 */

export interface NodeProjector {
	(node: unknown): { sx: number; sy: number; visible: boolean } | null;
}

/** Accumulate Gaussian density contributions from visible nodes into a grid. */
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
	const sigmaDenom = radius * sigmaFactor;
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
				grid[r * cols + c] += Math.exp(-(dr * dr + dc * dc) / sigmaDenom);
			}
		}
	}
	return grid;
}
