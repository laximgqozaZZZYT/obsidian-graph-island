/**
 * Junction-grid wire routing — pure helpers extracted from EdgeRenderer.
 *
 * The junction grid (碁盤) is computed from node positions within a group.
 * Wires routed via this grid run EXCLUSIVELY through column-gap (vertical)
 * and row-gap (horizontal) corridors, producing axis-aligned cable-tray
 * style paths that pass through deterministic midpoints.
 *
 * No DOM/Canvas dependency — every function is pure.
 */
import type { BBoxFace } from "./EdgeRenderer";

// Minimal position data needed for source/target nodes
interface Pos {
	x: number;
	y: number;
	id?: string;
}

/** Junction grid: row gap midpoints (Y) and column gap midpoints (X) between nodes */
export interface JunctionGrid {
	/** Sorted unique row Y values of nodes */
	rows: number[];
	/** Sorted unique column X values of nodes */
	cols: number[];
	/** Y midpoints between adjacent rows */
	rowGaps: number[];
	/** X midpoints between adjacent columns */
	colGaps: number[];
}

/**
 * Merge nearby values into clusters. Values within `minSpacing` of each other
 * are merged into one representative (average of cluster).
 */
export function mergeNearbyValues(sorted: number[], minSpacing: number): number[] {
	if (sorted.length === 0) return [];
	const result: number[] = [];
	let clusterStart = 0;
	for (let i = 1; i <= sorted.length; i++) {
		if (i === sorted.length || sorted[i] - sorted[i - 1] > minSpacing) {
			// End of cluster: compute average of cluster
			let sum = 0;
			for (let j = clusterStart; j < i; j++) sum += sorted[j];
			result.push(sum / (i - clusterStart));
			clusterStart = i;
		}
	}
	return result;
}

/** Compute junction grid from node positions within a group.
 *  Nearby rows/columns are merged to form a clean grid even when
 *  tag/category nodes are at irregular positions. */
export function computeJunctionGrid(
	groupKey: string,
	resolvePos: (ref: string | object) => Pos | undefined,
	nodeClusterMap: Map<string, string>,
): JunctionGrid {
	const xs: number[] = [];
	const ys: number[] = [];
	for (const [nid, gk] of nodeClusterMap) {
		if (gk !== groupKey) continue;
		const p = resolvePos(nid);
		if (p) {
			xs.push(Math.round(p.x));
			ys.push(Math.round(p.y));
		}
	}
	xs.sort((a, b) => a - b);
	ys.sort((a, b) => a - b);

	// Estimate minimum node spacing from the most common gap
	let minSpacing = 20; // fallback
	if (ys.length >= 2) {
		const gaps: number[] = [];
		for (let i = 1; i < ys.length; i++) {
			const g = ys[i] - ys[i - 1];
			if (g > 1) gaps.push(g);
		}
		if (gaps.length > 0) {
			gaps.sort((a, b) => a - b);
			// Use the median gap as the "normal" spacing
			minSpacing = gaps[Math.floor(gaps.length / 2)] * 0.4;
		}
	}

	// Merge nearby rows/columns to form a clean grid
	const rows = mergeNearbyValues(ys, minSpacing);
	const cols = mergeNearbyValues(xs, minSpacing);

	// Only create gaps between rows/columns that have sufficient spacing
	// (gaps narrower than minSpacing are likely between nodes that shouldn't have a gap)
	const rowGaps: number[] = [];
	for (let i = 0; i < rows.length - 1; i++) {
		if (rows[i + 1] - rows[i] > minSpacing) {
			rowGaps.push((rows[i] + rows[i + 1]) / 2);
		}
	}
	const colGaps: number[] = [];
	for (let i = 0; i < cols.length - 1; i++) {
		if (cols[i + 1] - cols[i] > minSpacing) {
			colGaps.push((cols[i] + cols[i + 1]) / 2);
		}
	}
	return { rows, cols, rowGaps, colGaps };
}

/**
 * Filter a JunctionGrid to exclude gaps adjacent to the port face.
 * Intra-group branch wires should avoid the port-face corridor so they
 * don't visually clash with external trunk / groupPortBranch wires.
 *
 * - Port on N → exclude the topmost rowGap (smallest Y)
 * - Port on S → exclude the bottommost rowGap (largest Y)
 * - Port on E → exclude the rightmost colGap (largest X)
 * - Port on W → exclude the leftmost colGap (smallest X)
 */
export function filterGridForPortFace(grid: JunctionGrid, face: BBoxFace): JunctionGrid {
	let { rowGaps, colGaps } = grid;
	switch (face) {
		case "N":
			// Drop the topmost rowGap (smallest Y) — it sits on the port face
			rowGaps = rowGaps.length > 0 ? rowGaps.slice(1) : [];
			break;
		case "S":
			// Drop the bottommost rowGap (largest Y) — it sits on the port face
			rowGaps = rowGaps.length > 0 ? rowGaps.slice(0, -1) : [];
			break;
		case "E":
			// Drop the rightmost colGap (largest X) — it sits on the port face
			colGaps = colGaps.length > 0 ? colGaps.slice(0, -1) : [];
			break;
		case "W":
			// Drop the leftmost colGap (smallest X) — it sits on the port face
			colGaps = colGaps.length > 0 ? colGaps.slice(1) : [];
			break;
	}
	return { rows: grid.rows, cols: grid.cols, rowGaps, colGaps };
}

/** Find the gap value nearest to the target coordinate */
export function findNearestGap(gaps: number[], target: number): number | null {
	if (gaps.length === 0) return null;
	let best = gaps[0];
	let bestDist = Math.abs(gaps[0] - target);
	for (let i = 1; i < gaps.length; i++) {
		const d = Math.abs(gaps[i] - target);
		if (d < bestDist) {
			bestDist = d;
			best = gaps[i];
		}
	}
	return best;
}

/**
 * Find a gap BETWEEN two coordinates (strictly between minV and maxV).
 * If none found strictly between, fall back to nearest gap overall.
 */
export function findGapBetween(gaps: number[], a: number, b: number): number | null {
	if (gaps.length === 0) return null;
	const lo = Math.min(a, b),
		hi = Math.max(a, b);
	// Prefer a gap strictly between a and b
	let best: number | null = null;
	let bestDist = Infinity;
	const mid = (a + b) / 2;
	for (const g of gaps) {
		if (g > lo + 1 && g < hi - 1) {
			const d = Math.abs(g - mid);
			if (d < bestDist) {
				bestDist = d;
				best = g;
			}
		}
	}
	if (best !== null) return best;
	// Same row/col: pick the gap just below or above
	return findNearestGap(gaps, mid);
}

/** Resolved gap positions around source/target for junction routing. */
interface JunctionGaps {
	srcCol: number | null;
	tgtCol: number | null;
	srcRow: number | null;
	tgtRow: number | null;
	midRow: number | null;
}

export function pushSrcEntry(pts: [number, number][], fx: number, fy: number, col: number, row: number | null): void {
	if (row !== null) pts.push([fx, row]);
	pts.push([col, row ?? fy]);
}

export function pushTgtExit(pts: [number, number][], tx: number, ty: number, col: number, row: number | null): void {
	if (row !== null) pts.push([col, row]);
	pts.push([tx, row ?? ty]);
}

export function computeJunctionWaypoints(
	from: { x: number; y: number },
	to: { x: number; y: number },
	g: JunctionGaps,
): [number, number][] {
	const pts: [number, number][] = [];
	const { srcCol, tgtCol, srcRow, tgtRow, midRow } = g;

	if (srcCol !== null && tgtCol !== null && midRow !== null) {
		pushSrcEntry(pts, from.x, from.y, srcCol, srcRow);
		pts.push([srcCol, midRow]);
		pts.push([tgtCol, midRow]);
		pushTgtExit(pts, to.x, to.y, tgtCol, tgtRow);
	} else if (srcCol !== null && midRow !== null) {
		pushSrcEntry(pts, from.x, from.y, srcCol, srcRow);
		pts.push([srcCol, midRow]);
		pts.push([to.x, midRow]);
	} else if (tgtCol !== null && midRow !== null) {
		pts.push([from.x, midRow]);
		pts.push([tgtCol, midRow]);
		pushTgtExit(pts, to.x, to.y, tgtCol, tgtRow);
	} else if (midRow !== null && srcRow !== null) {
		pts.push([from.x, srcRow]);
		pts.push([from.x, midRow]);
		pts.push([to.x, midRow]);
	} else if (srcCol !== null) {
		pushSrcEntry(pts, from.x, from.y, srcCol, srcRow);
		pts.push([srcCol, to.y]);
	} else if (srcRow !== null) {
		pts.push([from.x, srcRow]);
		pts.push([to.x, srcRow]);
	} else {
		const midY = (from.y + to.y) / 2;
		pts.push([from.x, midY]);
		pts.push([to.x, midY]);
	}

	return pts;
}

/**
 * Route between two points within a group using the junction grid (碁盤).
 * Wires run EXCLUSIVELY through column gaps (vertical runs) and row gaps (horizontal runs).
 * Every segment is axis-aligned and passes through junction midpoints.
 *
 * Path: from → srcColGap → rowGap → tgtColGap → to
 */
export function routeViaJunctionGrid(
	from: { x: number; y: number },
	to: { x: number; y: number },
	grid: JunctionGrid,
): { x: number; y: number }[] {
	if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1) {
		return [from, to];
	}

	const gaps: JunctionGaps = {
		srcCol: findNearestGap(grid.colGaps, from.x),
		tgtCol: findNearestGap(grid.colGaps, to.x),
		srcRow: findNearestGap(grid.rowGaps, from.y),
		tgtRow: findNearestGap(grid.rowGaps, to.y),
		midRow: findGapBetween(grid.rowGaps, from.y, to.y),
	};

	const waypoints = computeJunctionWaypoints(from, to, gaps);

	const path: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
	for (const [x, y] of waypoints) {
		const last = path[path.length - 1];
		if (Math.abs(x - last.x) > 1 || Math.abs(y - last.y) > 1) {
			path.push({ x, y });
		}
	}
	const last = path[path.length - 1];
	if (Math.abs(to.x - last.x) > 1 || Math.abs(to.y - last.y) > 1) {
		path.push({ x: to.x, y: to.y });
	}
	return path;
}
