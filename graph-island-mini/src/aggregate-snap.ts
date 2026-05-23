import type { LaidOut, PositionedNode } from "./layout";
import {
	computeParentOf,
	computeTrulyAgg,
	nodeFootprint,
	buildCardAABBs,
	cellHitsAnyCard,
	findFreeCell,
} from "./aggregate-util";
import { simpleChannelRoute } from "./edge-routing";

export interface AggregateSnapResult {
	trulyAgg: Set<string>;
	aggregateCount: Map<string, number>;
	aggCenter: Map<string, { x: number; y: number }>;
}

export interface AggregateSnapInput {
	aggregatedLayers: string[];
	hiddenNodes: string[];
	inheritFrom: Record<string, string>;
}

const EMPTY_RESULT: AggregateSnapResult = {
	trulyAgg: new Set(),
	aggregateCount: new Map(),
	aggCenter: new Map(),
};

// Run the aggregate-stack snap. MUTATES laid:
//   - cluster.x / y / width / height for every aggregated cluster gets
//     overwritten with the 1-slot box that contains the badge.
//   - Each edge whose source or target is in trulyAgg has its path
//     re-routed to go through the corresponding stack centre instead of
//     the now-hidden card centre.
// Returns the trulyAgg set + per-cluster counts so the renderer can
// honour the same definition of "hidden because aggregated".
export function runAggregateSnap(
	laid: LaidOut,
	input: AggregateSnapInput,
): AggregateSnapResult {
	const aggSet = new Set(input.aggregatedLayers);
	if (aggSet.size === 0 || laid.nodes.length === 0) return EMPTY_RESULT;
	const slotW = laid.slotW;
	const slotH = laid.slotH;
	const parentOf = computeParentOf(
		laid.clusters.map((c) => c.groupKey),
		laid.nodes,
		input.inheritFrom,
	);
	const trulyAgg = computeTrulyAgg(laid.nodes, aggSet, parentOf);
	const aggregateCount = new Map<string, number>();
	const aggCenter = new Map<string, { x: number; y: number }>();

	// Reserve every cell currently holding a visible card — including
	// the FULL footprint of multi-cell (scaled) cards so an aggregate
	// stack never lands inside a giant card like a hub at scale 5x.
	// A truly-aggregated node is hidden, so its cells are free for
	// reuse. User-hidden nodes also free their cells.
	const hiddenSet = new Set(input.hiddenNodes);
	const occupied = new Set<string>();
	for (const n of laid.nodes) {
		if (trulyAgg.has(n.id)) continue;
		if (hiddenSet.has(n.id)) continue;
		const fp = nodeFootprint(n, slotW, slotH);
		for (let c = fp.startCol; c <= fp.endCol; c++) {
			for (let r = fp.startRow; r <= fp.endRow; r++) {
				occupied.add(`${c},${r}`);
			}
		}
	}
	// AABB rectangles of every visible card, used as a second-line
	// verification after the cell-snap spiral.
	const cardAABBs = buildCardAABBs(
		laid.nodes,
		(id) => trulyAgg.has(id) || hiddenSet.has(id),
	);
	const cellHitsCard = (col: number, row: number): boolean =>
		cellHitsAnyCard(col, row, cardAABBs, slotW, slotH);

	// Process clusters in a deterministic order so the spiral search is
	// stable across rebuilds.
	const sortedClusters = [...laid.clusters].sort((a, b) =>
		a.groupKey.localeCompare(b.groupKey),
	);
	for (const cluster of sortedClusters) {
		if (!aggSet.has(cluster.groupKey)) continue;
		let sx = 0,
			sy = 0,
			count = 0;
		for (const node of laid.nodes) {
			if (!trulyAgg.has(node.id)) continue;
			if (!node.memberships.includes(cluster.groupKey)) continue;
			sx += node.x;
			sy += node.y;
			count++;
		}
		if (count === 0) continue;
		// Snap stack centroid to the nearest free slot on the global
		// lattice. The cell must (a) not collide with the cell-snap
		// occupied set AND (b) its centre must not fall inside any card's
		// AABB. Both checks together close the gap where a float-
		// rounding mismatch let a badge land inside a card.
		const initCol = Math.floor(sx / count / slotW);
		const initRow = Math.floor(sy / count / slotH);
		const isBlocked = (c: number, r: number): boolean =>
			occupied.has(`${c},${r}`) || cellHitsCard(c, r);
		let { col, row } = findFreeCell(initCol, initRow, isBlocked);
		// Final guarantee: if spiral somehow failed (e.g. dense surround),
		// park the badge past the right edge of every visible card.
		if (isBlocked(col, row)) {
			let maxRightCol = col;
			for (const r of cardAABBs) {
				const rc = Math.ceil(r.right / slotW);
				if (rc > maxRightCol) maxRightCol = rc;
			}
			col = maxRightCol + 2;
			row = initRow;
		}
		occupied.add(`${col},${row}`);
		const snapCx = (col + 0.5) * slotW;
		const snapCy = (row + 0.5) * slotH;
		aggCenter.set(cluster.groupKey, { x: snapCx, y: snapCy });
		aggregateCount.set(cluster.groupKey, count);
		// Cluster bbox = full slot around the stack (channel margin
		// included). The stack itself stays within the inner card area
		// thanks to STACK_INSET in drawAggregateStack().
		cluster.x = snapCx - slotW / 2;
		cluster.y = snapCy - slotH / 2;
		cluster.width = slotW;
		cluster.height = slotH;
	}

	// Re-route every edge whose source or target is in trulyAgg so it
	// terminates at the aggregate stack centre, not the hidden card.
	const idToNode = new Map<string, PositionedNode>();
	for (const n of laid.nodes) idToNode.set(n.id, n);
	const aggForNode = (id: string): { x: number; y: number } | null => {
		if (!trulyAgg.has(id)) return null;
		const node = idToNode.get(id);
		if (!node) return null;
		for (const m of node.memberships) {
			const c = aggCenter.get(m);
			if (c) return c;
		}
		return null;
	};
	const keptEdges: typeof laid.edges = [];
	for (const e of laid.edges) {
		const sAgg = aggForNode(e.source);
		const tAgg = aggForNode(e.target);
		if (sAgg && tAgg && sAgg.x === tAgg.x && sAgg.y === tAgg.y) continue;
		if (sAgg || tAgg) {
			const start = sAgg ?? e.path[0];
			const end = tAgg ?? e.path[e.path.length - 1];
			e.path = simpleChannelRoute(start, end, slotW, slotH);
		}
		keptEdges.push(e);
	}
	laid.edges = keptEdges;

	return { trulyAgg, aggregateCount, aggCenter };
}
