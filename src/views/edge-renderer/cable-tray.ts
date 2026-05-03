// ---------------------------------------------------------------------------
// Cable-tray pure helpers: group bbox, perimeter routing, junction grid,
// and shared angle utilities. Extracted from EdgeRenderer.ts to keep that
// file under its god-object line budget. All functions here are pure
// (no canvas / ctx dependency) and depend only on plain geometry inputs.
// ---------------------------------------------------------------------------

/** Minimal position data needed for source/target lookups. */
interface Pos {
	x: number;
	y: number;
	id?: string;
}

// ---------------------------------------------------------------------------
// Group BBox & Perimeter routing helpers
// ---------------------------------------------------------------------------

/** Face of a bounding box */
export type BBoxFace = "N" | "S" | "E" | "W";

/** Bounding box with margin */
export interface GroupBBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Compute the graph-wide center from all cluster centroids */
export function computeGraphCenter(centroids: Map<string, { x: number; y: number }>): { x: number; y: number } {
	let sx = 0,
		sy = 0,
		n = 0;
	for (const c of centroids.values()) {
		sx += c.x;
		sy += c.y;
		n++;
	}
	if (n === 0) return { x: 0, y: 0 };
	return { x: sx / n, y: sy / n };
}

/**
 * Compute the bounding box of all nodes belonging to a group, with margin.
 * Returns null if no nodes found.
 */
export function computeGroupBBox(
	groupKey: string,
	resolvePos: (ref: string | object) => Pos | undefined,
	nodeClusterMap: Map<string, string>,
	margin: number,
): GroupBBox | null {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	let found = false;
	for (const [nid, gk] of nodeClusterMap) {
		if (gk !== groupKey) continue;
		const p = resolvePos(nid);
		if (!p) continue;
		found = true;
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	if (!found) return null;
	return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

/** Determine which face of the bbox is closest to the graph center */
export function computePortFace(bbox: GroupBBox, graphCenter: { x: number; y: number }): BBoxFace {
	const cx = (bbox.minX + bbox.maxX) / 2;
	const cy = (bbox.minY + bbox.maxY) / 2;
	// Face center candidates
	const faces: { face: BBoxFace; x: number; y: number }[] = [
		{ face: "N", x: cx, y: bbox.minY },
		{ face: "S", x: cx, y: bbox.maxY },
		{ face: "W", x: bbox.minX, y: cy },
		{ face: "E", x: bbox.maxX, y: cy },
	];
	let best = faces[0];
	let bestDist = (best.x - graphCenter.x) ** 2 + (best.y - graphCenter.y) ** 2;
	for (let i = 1; i < faces.length; i++) {
		const d = (faces[i].x - graphCenter.x) ** 2 + (faces[i].y - graphCenter.y) ** 2;
		if (d < bestDist) {
			bestDist = d;
			best = faces[i];
		}
	}
	return best.face;
}

/** Get the port position (center of the chosen face) */
export function faceCenter(bbox: GroupBBox, face: BBoxFace): { x: number; y: number } {
	const cx = (bbox.minX + bbox.maxX) / 2;
	const cy = (bbox.minY + bbox.maxY) / 2;
	switch (face) {
		case "N":
			return { x: cx, y: bbox.minY };
		case "S":
			return { x: cx, y: bbox.maxY };
		case "W":
			return { x: bbox.minX, y: cy };
		case "E":
			return { x: bbox.maxX, y: cy };
	}
}

/** Get the perpendicular (tangent) direction at a face */
export function facePerpendicular(face: BBoxFace): { perpX: number; perpY: number } {
	// Tangent along the face edge
	switch (face) {
		case "N":
		case "S":
			return { perpX: 1, perpY: 0 }; // horizontal face
		case "E":
		case "W":
			return { perpX: 0, perpY: 1 }; // vertical face
	}
}

/**
 * Build the counter-clockwise perimeter path starting from the port position.
 * Screen coordinates: Y-axis points down.
 *
 * Counter-clockwise (screen coords, Y-down):
 *   S face: port → right(SE) → up(NE) → left(NW) → down(SW) → back
 *   N face: port → left(NW) → down(SW) → right(SE) → up(NE) → back
 *   E face: port → up(NE) → left(NW) → down(SW) → right(SE) → back
 *   W face: port → down(SW) → right(SE) → up(NE) → left(NW) → back
 */
export function buildPerimeterPath(
	bbox: GroupBBox,
	portFace: BBoxFace,
	port: { x: number; y: number },
): { x: number; y: number }[] {
	// Corners: NW, NE, SE, SW (screen coords, Y-down)
	const NW = { x: bbox.minX, y: bbox.minY };
	const NE = { x: bbox.maxX, y: bbox.minY };
	const SE = { x: bbox.maxX, y: bbox.maxY };
	const SW = { x: bbox.minX, y: bbox.maxY };

	// CCW traversal limited to 2 faces: the port face + the next CCW-adjacent face.
	// Screen coords (Y-down): CCW rotation order of faces is S→E→N→W→S
	// So "next CCW face" from S is E, from E is N, from N is W, from W is S.
	switch (portFace) {
		case "S": // port face = bottom → next CCW = east face
			// Port → SE corner → NE corner (end of 2nd face)
			return [port, SE, NE];
		case "N": // port face = top → next CCW = west face
			// Port → NW corner → SW corner
			return [port, NW, SW];
		case "E": // port face = right → next CCW = north face
			// Port → NE corner → NW corner
			return [port, NE, NW];
		case "W": // port face = left → next CCW = south face
			// Port → SW corner → SE corner
			return [port, SW, SE];
	}
}

/**
 * Find the point on the perimeter path closest to the target position.
 * Returns the segment index and the projected point on that segment.
 */
export function findPerimeterBranchPoint(
	perimeterPath: { x: number; y: number }[],
	targetX: number,
	targetY: number,
): { index: number; point: { x: number; y: number } } {
	let bestDist = Infinity;
	let bestIdx = 0;
	let bestPt = perimeterPath[0];

	for (let i = 0; i < perimeterPath.length - 1; i++) {
		const a = perimeterPath[i];
		const b = perimeterPath[i + 1];
		// Project target onto segment a→b
		const abx = b.x - a.x,
			aby = b.y - a.y;
		const apx = targetX - a.x,
			apy = targetY - a.y;
		const ab2 = abx * abx + aby * aby;
		if (ab2 < 0.01) continue;
		let t = (apx * abx + apy * aby) / ab2;
		t = Math.max(0, Math.min(1, t));
		const px = a.x + abx * t;
		const py = a.y + aby * t;
		const d = (px - targetX) ** 2 + (py - targetY) ** 2;
		if (d < bestDist) {
			bestDist = d;
			bestIdx = i;
			bestPt = { x: px, y: py };
		}
	}
	return { index: bestIdx, point: bestPt };
}

// ---------------------------------------------------------------------------
// Junction grid: row/column gaps for axis-aligned wire routing inside groups
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Angle utilities (shared by cartesian + polar cable routing)
// ---------------------------------------------------------------------------

/** Shortest unsigned angle distance */
export function angleDist(a: number, b: number): number {
	let d = Math.abs(a - b);
	if (d > Math.PI) d = 2 * Math.PI - d;
	return d;
}

/** Shortest signed angle delta from a to b */
export function shortestAngleDelta(a: number, b: number): number {
	let d = b - a;
	if (d > Math.PI) d -= 2 * Math.PI;
	if (d < -Math.PI) d += 2 * Math.PI;
	return d;
}
