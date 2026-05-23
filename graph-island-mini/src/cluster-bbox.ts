import type { PositionedNode, ClusterRect } from "./layout";
import { isSubset } from "./subgroup-packing";

export interface ClusterBBoxOptions {
	clusterKeys: string[];
	labels: Map<string, string>;
	slotW: number;
	slotH: number;
	channelW: number;
	channelH: number;
	clusterSpacing: number;
}

// Compute one bbox per cluster as the min/max of every member card's
// FOOTPRINT cells (= ceil(w/slotW) × ceil(h/slotH) cells centred on each
// card's snapped (x, y)). Nested clusters get a per-level padding boost
// so a containing layer always sits clearly outside the layers it
// encloses. Returns the resulting ClusterRect list AND the per-cluster
// member set + nesting depth so callers (e.g. the B2 clamp) can reuse
// them without recomputing.
export function computeClusterBBoxes(
	positionedNodes: PositionedNode[],
	opts: ClusterBBoxOptions,
): {
	clusters: ClusterRect[];
	memberSets: Map<string, Set<string>>;
	nestingDepth: Map<string, number>;
} {
	const { clusterKeys, labels, slotW, slotH, channelW, channelH } = opts;
	// Member set per cluster — used by the nesting-depth detector and
	// returned for downstream callers (B2 clamp).
	const memberSets = new Map<string, Set<string>>();
	for (const key of clusterKeys) {
		const set = new Set<string>();
		for (const n of positionedNodes) {
			if (n.memberships.includes(key)) set.add(n.id);
		}
		memberSets.set(key, set);
	}
	const nestingDepth = new Map<string, number>();
	for (const x of clusterKeys) {
		const xs = memberSets.get(x)!;
		let depth = 0;
		for (const y of clusterKeys) {
			if (x === y) continue;
			const ys = memberSets.get(y)!;
			if (ys.size < xs.size && isSubset(ys, xs)) depth++;
		}
		nestingDepth.set(x, depth);
	}

	// Base padding around member cards, plus per-nesting-level boost so
	// each containing layer sits clearly outside the layers it encloses.
	const BASE_PAD = Math.max(24, opts.clusterSpacing / 2);
	const NEST_PAD = 18;
	const basePadCellsX = Math.max(0, Math.ceil((BASE_PAD - channelW / 2) / slotW));
	const basePadCellsY = Math.max(0, Math.ceil((BASE_PAD - channelH / 2) / slotH));
	const nestPadCellsX = Math.max(1, Math.ceil(NEST_PAD / slotW));
	const nestPadCellsY = Math.max(1, Math.ceil(NEST_PAD / slotH));
	const clusters: ClusterRect[] = [];
	for (const key of clusterKeys) {
		let cellMinCol = Infinity;
		let cellMaxCol = -Infinity;
		let cellMinRow = Infinity;
		let cellMaxRow = -Infinity;
		let count = 0;
		// Every member of this group affects the bbox — multi-tag nodes
		// belong to all their groups' enclosures (Euler-style), so
		// excluding them from any one group's bbox would visually orphan
		// them.
		for (const n of positionedNodes) {
			if (!n.memberships.includes(key)) continue;
			count++;
			const colSpan = Math.max(1, Math.ceil(n.width / slotW));
			const rowSpan = Math.max(1, Math.ceil(n.height / slotH));
			const startCol = Math.round(n.x / slotW - colSpan / 2);
			const startRow = Math.round(n.y / slotH - rowSpan / 2);
			const endCol = startCol + colSpan - 1;
			const endRow = startRow + rowSpan - 1;
			if (startCol < cellMinCol) cellMinCol = startCol;
			if (endCol > cellMaxCol) cellMaxCol = endCol;
			if (startRow < cellMinRow) cellMinRow = startRow;
			if (endRow > cellMaxRow) cellMaxRow = endRow;
		}
		if (count === 0) continue;
		const nest = nestingDepth.get(key) ?? 0;
		const padCellsX = basePadCellsX + nest * nestPadCellsX;
		const padCellsY = basePadCellsY + nest * nestPadCellsY;
		const left = (cellMinCol - padCellsX) * slotW;
		const right = (cellMaxCol + 1 + padCellsX) * slotW;
		const top = (cellMinRow - padCellsY) * slotH;
		const bottom = (cellMaxRow + 1 + padCellsY) * slotH;
		clusters.push({
			groupKey: key,
			label: labels.get(key) ?? key,
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
			memberCount: count,
		});
	}
	return { clusters, memberSets, nestingDepth };
}

// Clamp every cluster's left/top to the CHANNEL between column A and
// column B (resp. row 1 and row 2). Column A and row 1 stay completely
// empty — no enclosure border may enter them. The leftmost card cell
// is at globalMinCol, so the clamp boundary is globalMinCol * slotW
// (the channel just to the left of card B / above row 2).
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
		const colSpan = Math.max(1, Math.ceil(n.width / slotW));
		const rowSpan = Math.max(1, Math.ceil(n.height / slotH));
		const startCol = Math.round(n.x / slotW - colSpan / 2);
		const startRow = Math.round(n.y / slotH - rowSpan / 2);
		if (startCol < globalMinCol) globalMinCol = startCol;
		if (startRow < globalMinRow) globalMinRow = startRow;
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
