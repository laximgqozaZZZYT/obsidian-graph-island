import type { GraphNode } from "./types";

// Build per-cluster parent set. A cluster P is the "parent" of cluster
// C when (a) inheritFrom[C] === P, or (b) P's member set strictly
// contains C's member set. Parents are excluded from the aggregation
// check (per the user's spec): the child's aggregation already accounts
// for the parent's containment, so listing the parent in a node's
// memberships shouldn't block the child from being considered fully
// aggregated.
export function computeParentOf(
	clusterKeys: Iterable<string>,
	nodes: { id: string; memberships: string[] }[],
	inheritFrom: Record<string, string>,
): Map<string, Set<string>> {
	const memberSets = new Map<string, Set<string>>();
	for (const key of clusterKeys) {
		const s = new Set<string>();
		for (const n of nodes) if (n.memberships.includes(key)) s.add(n.id);
		memberSets.set(key, s);
	}
	const parentOf = new Map<string, Set<string>>();
	for (const [key, mems] of memberSets) {
		const parents = new Set<string>();
		const inhSource = inheritFrom[key];
		if (inhSource && inhSource !== key) parents.add(inhSource);
		for (const [otherKey, otherMems] of memberSets) {
			if (otherKey === key) continue;
			if (otherMems.size <= mems.size) continue; // strict superset only
			let isSuper = true;
			for (const m of mems) {
				if (!otherMems.has(m)) {
					isSuper = false;
					break;
				}
			}
			if (isSuper) parents.add(otherKey);
		}
		parentOf.set(key, parents);
	}
	return parentOf;
}

// A node is "truly aggregated" when every EFFECTIVE membership (= every
// membership that isn't a parent of another membership the node also
// holds) is in aggSet. This is the single source of truth used by both
// the aggregate-snap spiral and the draw-layer skipNode test.
export function computeTrulyAgg(
	nodes: GraphNode[],
	aggSet: Set<string>,
	parentOf: Map<string, Set<string>>,
): Set<string> {
	const trulyAgg = new Set<string>();
	for (const n of nodes) {
		if (n.memberships.length === 0) continue;
		let allEffectiveAgg = true;
		let hasEffective = false;
		for (const m of n.memberships) {
			let isParentOfOther = false;
			for (const o of n.memberships) {
				if (o === m) continue;
				const oParents = parentOf.get(o);
				if (oParents && oParents.has(m)) {
					isParentOfOther = true;
					break;
				}
			}
			if (isParentOfOther) continue;
			hasEffective = true;
			if (!aggSet.has(m)) {
				allEffectiveAgg = false;
				break;
			}
		}
		if (hasEffective && allEffectiveAgg) trulyAgg.add(n.id);
	}
	return trulyAgg;
}

// Card AABB used by the badge-snap "hit any card" test.
export interface CardAABB {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

// Footprint cell range used by the badge-snap "occupied" reservation.
export interface FootprintCells {
	startCol: number;
	endCol: number;
	startRow: number;
	endRow: number;
}

export function nodeFootprint(
	n: { x: number; y: number; width: number; height: number },
	slotW: number,
	slotH: number,
): FootprintCells {
	const colSpan = Math.max(1, Math.ceil(n.width / slotW));
	const rowSpan = Math.max(1, Math.ceil(n.height / slotH));
	const startCol = Math.round(n.x / slotW - colSpan / 2);
	const startRow = Math.round(n.y / slotH - rowSpan / 2);
	return {
		startCol,
		endCol: startCol + colSpan - 1,
		startRow,
		endRow: startRow + rowSpan - 1,
	};
}
