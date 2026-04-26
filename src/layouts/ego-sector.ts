// ---------------------------------------------------------------------------
// Ego Sector Layout — classify neighbors by edge type and place on ring sectors
// ---------------------------------------------------------------------------
import type { EdgeType } from "../types";

/** Minimal edge shape needed by the ego sector algorithm */
interface EgoEdge {
	source: string;
	target: string;
	type?: EdgeType;
}

/** A positioned node output from the ego sector layout */
interface EgoPlacement {
	id: string;
	x: number;
	y: number;
}

/** Sector definition: angular region for a neighbor bucket */
interface SectorDef {
	key: string;
	centerAngle: number;
	spread: number;
}

const EGO_RING_RADIUS = 150;

const SECTOR_DEFS: SectorDef[] = [
	{ key: "inheritParent", centerAngle: (3 * Math.PI) / 2, spread: Math.PI / 3 },
	{ key: "inheritChild", centerAngle: Math.PI / 2, spread: Math.PI / 3 },
	{ key: "aggregation", centerAngle: Math.PI, spread: Math.PI / 3 },
	{ key: "similar", centerAngle: 0, spread: Math.PI / 3 },
	{ key: "other", centerAngle: Math.PI / 4, spread: Math.PI / 2 },
];

/**
 * Classify edges incident to `centerId` into typed neighbor buckets.
 * Only neighbors present in `validIds` are included.
 */
export function classifyEgoNeighbors(
	centerId: string,
	edges: readonly EgoEdge[],
	validIds: ReadonlySet<string>,
): Map<string, string[]> {
	const buckets = new Map<string, string[]>();
	for (const s of SECTOR_DEFS) buckets.set(s.key, []);

	for (const e of edges) {
		const isNeighbor = e.source === centerId || e.target === centerId;
		if (!isNeighbor) continue;
		const nbId = e.source === centerId ? e.target : e.source;
		if (!validIds.has(nbId)) continue;

		if (e.type === "inheritance") {
			if (e.target === centerId) buckets.get("inheritParent")!.push(nbId);
			else buckets.get("inheritChild")!.push(nbId);
		} else if (e.type === "aggregation") {
			buckets.get("aggregation")!.push(nbId);
		} else if (e.type === "similar" || e.type === "sibling") {
			buckets.get("similar")!.push(nbId);
		} else {
			buckets.get("other")!.push(nbId);
		}
	}

	return buckets;
}

/**
 * Compute ego-sector placements for neighbors around a center point.
 * Returns an array of {id, x, y} for each neighbor to be placed on the ring.
 */
export function computeEgoSectorPositions(
	centerId: string,
	cx: number,
	cy: number,
	edges: readonly EgoEdge[],
	validIds: ReadonlySet<string>,
	ringRadius: number = EGO_RING_RADIUS,
): EgoPlacement[] {
	const buckets = classifyEgoNeighbors(centerId, edges, validIds);
	const placed = new Set<string>([centerId]);
	const result: EgoPlacement[] = [];

	for (const sector of SECTOR_DEFS) {
		const ids = (buckets.get(sector.key) ?? []).filter((id) => !placed.has(id));
		if (ids.length === 0) continue;
		const startAngle = sector.centerAngle - sector.spread / 2;
		const step = ids.length > 1 ? sector.spread / (ids.length - 1) : 0;
		for (let i = 0; i < ids.length; i++) {
			const angle = startAngle + step * i;
			result.push({
				id: ids[i],
				x: cx + ringRadius * Math.cos(angle),
				y: cy + ringRadius * Math.sin(angle),
			});
			placed.add(ids[i]);
		}
	}

	return result;
}
