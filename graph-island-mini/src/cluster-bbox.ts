import type { PositionedNode, ClusterRect } from "./layout";
import { isSubset } from "./subgroup-packing";
import { nodeFootprint } from "./aggregate-util";

export interface ClusterBBoxOptions {
	clusterKeys: string[];
	labels: Map<string, string>;
	slotW: number;
	slotH: number;
	channelW: number;
	channelH: number;
	clusterSpacing: number;
}

// Per-cluster member id set. Used both by the nesting-depth detector
// (= an outer cluster contains every member of its inner cluster) and
// by the bbox loop. Exposed so callers can re-use it without scanning
// positionedNodes twice.
export function computeMemberSetsForClusters(
	positionedNodes: PositionedNode[],
	clusterKeys: string[],
): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	for (const key of clusterKeys) {
		const set = new Set<string>();
		for (const n of positionedNodes) {
			if (n.memberships.includes(key)) set.add(n.id);
		}
		out.set(key, set);
	}
	return out;
}

// Nesting depth = # of clusters whose member set is a STRICT subset of
// this cluster's member set. A higher depth ⇒ this cluster engulfs more
// inner layers, so it deserves extra padding so the inner enclosures
// sit clearly inside its border instead of riding it.
export function computeNestingDepth(
	memberSets: Map<string, Set<string>>,
	clusterKeys: string[],
): Map<string, number> {
	const out = new Map<string, number>();
	for (const x of clusterKeys) {
		const xs = memberSets.get(x)!;
		let depth = 0;
		for (const y of clusterKeys) {
			if (x === y) continue;
			const ys = memberSets.get(y)!;
			if (ys.size < xs.size && isSubset(ys, xs)) depth++;
		}
		out.set(x, depth);
	}
	return out;
}

// Footprint-aware bbox for a single cluster. Loops over every member
// card's full N × M footprint cells (= ceil(w/slotW) × ceil(h/slotH))
// and returns the min/max cell range — null when the cluster has no
// members in positionedNodes.
//
// Bug-fix anchor: this is the function bug #3 ("unrelated nodes in
// groups") routes through. A multi-tag node positioned at the centroid
// between two anchors lands in a cell that BOTH clusters' bboxes will
// engulf, even though only one of those clusters genuinely "owns" the
// card. The fix lives in subgroup placement, NOT here — but isolating
// this loop made the diagnosis obvious.
export function computeClusterCellRange(
	key: string,
	positionedNodes: PositionedNode[],
	slotW: number,
	slotH: number,
): {
	minCol: number;
	maxCol: number;
	minRow: number;
	maxRow: number;
	count: number;
} | null {
	let minCol = Infinity;
	let maxCol = -Infinity;
	let minRow = Infinity;
	let maxRow = -Infinity;
	let count = 0;
	for (const n of positionedNodes) {
		if (!n.memberships.includes(key)) continue;
		count++;
		const fp = nodeFootprint(n, slotW, slotH);
		if (fp.startCol < minCol) minCol = fp.startCol;
		if (fp.endCol > maxCol) maxCol = fp.endCol;
		if (fp.startRow < minRow) minRow = fp.startRow;
		if (fp.endRow > maxRow) maxRow = fp.endRow;
	}
	if (count === 0) return null;
	return { minCol, maxCol, minRow, maxRow, count };
}

// Wrap a cell range + per-side cell padding into the final pixel-space
// ClusterRect. Enclosure edges ride the channels between slots so the
// outer cells reserved for column A / row 1 stay visually empty.
export function cellRangeToClusterRect(
	groupKey: string,
	label: string,
	range: { minCol: number; maxCol: number; minRow: number; maxRow: number },
	padCellsX: number,
	padCellsY: number,
	slotW: number,
	slotH: number,
	memberCount: number,
): ClusterRect {
	const left = (range.minCol - padCellsX) * slotW;
	const right = (range.maxCol + 1 + padCellsX) * slotW;
	const top = (range.minRow - padCellsY) * slotH;
	const bottom = (range.maxRow + 1 + padCellsY) * slotH;
	return {
		groupKey,
		label,
		x: left,
		y: top,
		width: right - left,
		height: bottom - top,
		memberCount,
	};
}

// Per-cluster owned-cell map. A cell is "owned by cluster X" iff at
// least one card whose memberships include X has a footprint cell at
// that grid position. A multi-membership card (e.g. {A, B}) contributes
// to BOTH A's and B's owned sets, so their outlines naturally overlap
// on that cell — exactly the Euler-diagram intersection.
export function computeClusterOwnedCells(
	positionedNodes: PositionedNode[],
	clusterKeys: string[],
	slotW: number,
	slotH: number,
): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	for (const key of clusterKeys) out.set(key, new Set());
	for (const n of positionedNodes) {
		const fp = nodeFootprint(n, slotW, slotH);
		for (const m of n.memberships) {
			const set = out.get(m);
			if (!set) continue;
			for (let c = fp.startCol; c <= fp.endCol; c++) {
				for (let r = fp.startRow; r <= fp.endRow; r++) {
					set.add(`${c},${r}`);
				}
			}
		}
	}
	return out;
}

// Compute outline segments for the polygon boundary of a cell set.
// For each cell, check its 4 neighbours; if a neighbour is NOT in
// the set, emit a line on the shared edge.
//
// Coordinate convention matches drawCardGrid (cell inner box from
// (col*W + padX, row*H + padY) to ((col+1)*W - padX, (row+1)*H - padY)).
export function computeOutlineSegments(
	cells: Set<string>,
	slotW: number,
	slotH: number,
	channelW: number,
	channelH: number,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
	const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
	const padX = channelW / 2;
	const padY = channelH / 2;
	for (const cellKey of cells) {
		const [colStr, rowStr] = cellKey.split(",");
		const col = parseInt(colStr, 10);
		const row = parseInt(rowStr, 10);
		const left = col * slotW + padX;
		const right = (col + 1) * slotW - padX;
		const top = row * slotH + padY;
		const bottom = (row + 1) * slotH - padY;
		if (!cells.has(`${col - 1},${row}`))
			segments.push({ x1: left, y1: top, x2: left, y2: bottom });
		if (!cells.has(`${col + 1},${row}`))
			segments.push({ x1: right, y1: top, x2: right, y2: bottom });
		if (!cells.has(`${col},${row - 1}`))
			segments.push({ x1: left, y1: top, x2: right, y2: top });
		if (!cells.has(`${col},${row + 1}`))
			segments.push({ x1: left, y1: bottom, x2: right, y2: bottom });
	}
	return segments;
}

// Find 4-connected components of a cell set. Returns one Set per
// component (each holds "col,row" keys).
function connectedComponents(cells: Set<string>): Set<string>[] {
	const components: Set<string>[] = [];
	const visited = new Set<string>();
	for (const start of cells) {
		if (visited.has(start)) continue;
		const comp = new Set<string>();
		const queue: string[] = [start];
		visited.add(start);
		while (queue.length > 0) {
			const cur = queue.shift()!;
			comp.add(cur);
			const [c, r] = cur.split(",").map(Number);
			for (const [dc, dr] of [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			]) {
				const k = `${c + dc},${r + dr}`;
				if (cells.has(k) && !visited.has(k)) {
					visited.add(k);
					queue.push(k);
				}
			}
		}
		components.push(comp);
	}
	return components;
}

// Fill all interior holes (= non-cell positions inside the AABB that
// are NOT reachable from the AABB boundary without crossing cells).
// After filling, the result has no internal holes.
function fillInteriorHoles(
	cells: Set<string>,
	range: { minCol: number; maxCol: number; minRow: number; maxRow: number },
): Set<string> {
	// Flood-fill from a virtual one-cell ring around the AABB so any
	// concavity touching the bbox boundary is reachable from "outside".
	const reachable = new Set<string>();
	const queue: [number, number][] = [];
	const seed = (c: number, r: number): void => {
		const k = `${c},${r}`;
		if (cells.has(k) || reachable.has(k)) return;
		reachable.add(k);
		queue.push([c, r]);
	};
	for (let c = range.minCol - 1; c <= range.maxCol + 1; c++) {
		seed(c, range.minRow - 1);
		seed(c, range.maxRow + 1);
	}
	for (let r = range.minRow - 1; r <= range.maxRow + 1; r++) {
		seed(range.minCol - 1, r);
		seed(range.maxCol + 1, r);
	}
	while (queue.length > 0) {
		const [c, r] = queue.shift()!;
		for (const [dc, dr] of [
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1],
		]) {
			const nc = c + dc;
			const nr = r + dr;
			if (nc < range.minCol - 1 || nc > range.maxCol + 1) continue;
			if (nr < range.minRow - 1 || nr > range.maxRow + 1) continue;
			const k = `${nc},${nr}`;
			if (cells.has(k) || reachable.has(k)) continue;
			reachable.add(k);
			queue.push([nc, nr]);
		}
	}
	// Any non-cell in the AABB that's NOT reachable = interior hole.
	const closed = new Set<string>(cells);
	for (let c = range.minCol; c <= range.maxCol; c++) {
		for (let r = range.minRow; r <= range.maxRow; r++) {
			const k = `${c},${r}`;
			if (cells.has(k)) continue;
			if (reachable.has(k)) continue;
			closed.add(k);
		}
	}
	return closed;
}

// Connect disconnected components by adding straight-line bridge cells
// (Manhattan path: horizontal then vertical) between every non-main
// component and the main (largest) component.
function bridgeComponents(cells: Set<string>): Set<string> {
	const comps = connectedComponents(cells);
	if (comps.length <= 1) return cells;
	comps.sort((a, b) => b.size - a.size);
	const out = new Set<string>(cells);
	for (let i = 1; i < comps.length; i++) {
		const comp = comps[i];
		let bestA = "";
		let bestB = "";
		let bestD = Infinity;
		for (const a of comp) {
			const [ac, ar] = a.split(",").map(Number);
			for (const b of comps[0]) {
				const [bc, br] = b.split(",").map(Number);
				const d = Math.abs(ac - bc) + Math.abs(ar - br);
				if (d < bestD) {
					bestD = d;
					bestA = a;
					bestB = b;
				}
			}
		}
		if (!bestA) continue;
		const [c1, r1] = bestA.split(",").map(Number);
		const [c2, r2] = bestB.split(",").map(Number);
		// Horizontal then vertical (L-shape).
		const dc = c2 > c1 ? 1 : c2 < c1 ? -1 : 0;
		const dr = r2 > r1 ? 1 : r2 < r1 ? -1 : 0;
		let cc = c1;
		let cr = r1;
		out.add(`${cc},${cr}`);
		while (cc !== c2) {
			cc += dc;
			out.add(`${cc},${cr}`);
		}
		while (cr !== r2) {
			cr += dr;
			out.add(`${cc},${cr}`);
		}
	}
	return out;
}

// Close a cell set into a single simply-connected rectilinear region:
// fill interior holes + bridge disconnected components. The resulting
// outline (via computeOutlineSegments) is a single closed loop with no
// inner loops — satisfies "no exclaves, no holes, polygon allowed".
export function closeToSimplyConnected(
	cells: Set<string>,
	range: { minCol: number; maxCol: number; minRow: number; maxRow: number },
): Set<string> {
	if (cells.size === 0) return cells;
	const bridged = bridgeComponents(cells);
	// Recompute range after bridging in case bridges extended it
	// (they shouldn't since bridge endpoints are within original cells'
	// AABB, but the line might pass through cells just inside).
	const filled = fillInteriorHoles(bridged, range);
	return filled;
}

// Orchestrator: one bbox per cluster + nesting-aware padding. Returns
// the bbox list AND the per-cluster member set + nesting depth so
// downstream callers (e.g. the B2 clamp) can reuse them without
// recomputing.
export function computeClusterBBoxes(
	positionedNodes: PositionedNode[],
	opts: ClusterBBoxOptions,
): {
	clusters: ClusterRect[];
	memberSets: Map<string, Set<string>>;
	nestingDepth: Map<string, number>;
} {
	const { clusterKeys, labels, slotW, slotH, channelW, channelH } = opts;
	const memberSets = computeMemberSetsForClusters(positionedNodes, clusterKeys);
	const nestingDepth = computeNestingDepth(memberSets, clusterKeys);

	const BASE_PAD = Math.max(24, opts.clusterSpacing / 2);
	const NEST_PAD = 18;
	const basePadCellsX = Math.max(0, Math.ceil((BASE_PAD - channelW / 2) / slotW));
	const basePadCellsY = Math.max(0, Math.ceil((BASE_PAD - channelH / 2) / slotH));
	const nestPadCellsX = Math.max(1, Math.ceil(NEST_PAD / slotW));
	const nestPadCellsY = Math.max(1, Math.ceil(NEST_PAD / slotH));
	const ownedCellsMap = computeClusterOwnedCells(
		positionedNodes,
		clusterKeys,
		slotW,
		slotH,
	);
	const clusters: ClusterRect[] = [];
	for (const key of clusterKeys) {
		const range = computeClusterCellRange(key, positionedNodes, slotW, slotH);
		if (!range) continue;
		const nest = nestingDepth.get(key) ?? 0;
		const padCellsX = basePadCellsX + nest * nestPadCellsX;
		const padCellsY = basePadCellsY + nest * nestPadCellsY;
		const rect = cellRangeToClusterRect(
			key,
			labels.get(key) ?? key,
			range,
			padCellsX,
			padCellsY,
			slotW,
			slotH,
			range.count,
		);
		// Outline = boundary of the AABB rectangle filled solid (= the
		// simplest "single connected, no holes, no exclaves" shape).
		// Per-cell rectilinear polygons (closeToSimplyConnected) ARE
		// single-connected but can have deep concavities that visually
		// read as separate pieces; the user reported those concavities
		// as 飛び地. AABB sidesteps that by being a literal rectangle.
		const owned = ownedCellsMap.get(key);
		if (owned && owned.size > 0) {
			const aabbCells = new Set<string>();
			for (let col = range.minCol; col <= range.maxCol; col++) {
				for (let row = range.minRow; row <= range.maxRow; row++) {
					aabbCells.add(`${col},${row}`);
				}
			}
			rect.outline = computeOutlineSegments(
				aabbCells,
				slotW,
				slotH,
				channelW,
				channelH,
			);
		}
		clusters.push(rect);
	}
	return { clusters, memberSets, nestingDepth };
}

// Clamp every cluster's left/top to the CHANNEL between column A and
// column B (resp. row 1 and row 2). Column A and row 1 stay completely
// empty — no enclosure border may enter them.
export function clampClustersToB2(
	clusters: ClusterRect[],
	positionedNodes: PositionedNode[],
	slotW: number,
	slotH: number,
): void {
	if (positionedNodes.length === 0 || clusters.length === 0) return;
	let globalMinCol = Infinity;
	let globalMinRow = Infinity;
	for (const n of positionedNodes) {
		const fp = nodeFootprint(n, slotW, slotH);
		if (fp.startCol < globalMinCol) globalMinCol = fp.startCol;
		if (fp.startRow < globalMinRow) globalMinRow = fp.startRow;
	}
	const gridLeft = globalMinCol * slotW;
	const gridTop = globalMinRow * slotH;
	for (const c of clusters) {
		if (c.x < gridLeft) {
			c.width = Math.max(slotW, c.width - (gridLeft - c.x));
			c.x = gridLeft;
		}
		if (c.y < gridTop) {
			c.height = Math.max(slotH, c.height - (gridTop - c.y));
			c.y = gridTop;
		}
	}
}

// Inheritance: each child cluster picks a parent (継承元) explicitly via
// the panel. The child's bbox grows to engulf the parent's bbox so the
// parent visually "joins" the child territory. Pre-snapshot the
// original bboxes so a chain (A → B → C) all references its pre-merge
// sibling, never the already-expanded version.
export function expandClustersByInheritance(
	clusters: ClusterRect[],
	inheritFrom: Record<string, string>,
): void {
	const inhKeys = Object.keys(inheritFrom);
	if (inhKeys.length === 0) return;
	const original = new Map<
		string,
		{ x: number; y: number; w: number; h: number }
	>();
	for (const c of clusters) {
		original.set(c.groupKey, { x: c.x, y: c.y, w: c.width, h: c.height });
	}
	for (const child of clusters) {
		const parentKey = inheritFrom[child.groupKey];
		if (!parentKey || parentKey === child.groupKey) continue;
		const p = original.get(parentKey);
		if (!p) continue;
		const minX = Math.min(child.x, p.x);
		const minY = Math.min(child.y, p.y);
		const maxX = Math.max(child.x + child.width, p.x + p.w);
		const maxY = Math.max(child.y + child.height, p.y + p.h);
		child.x = minX;
		child.y = minY;
		child.width = maxX - minX;
		child.height = maxY - minY;
	}
}
