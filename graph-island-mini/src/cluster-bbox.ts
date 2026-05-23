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
	const clusters: ClusterRect[] = [];
	for (const key of clusterKeys) {
		const range = computeClusterCellRange(key, positionedNodes, slotW, slotH);
		if (!range) continue;
		const nest = nestingDepth.get(key) ?? 0;
		const padCellsX = basePadCellsX + nest * nestPadCellsX;
		const padCellsY = basePadCellsY + nest * nestPadCellsY;
		clusters.push(
			cellRangeToClusterRect(
				key,
				labels.get(key) ?? key,
				range,
				padCellsX,
				padCellsY,
				slotW,
				slotH,
				range.count,
			),
		);
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
