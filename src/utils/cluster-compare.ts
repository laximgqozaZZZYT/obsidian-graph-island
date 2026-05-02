import type { GraphEdge } from "../types";
import { edgeSourceId, edgeTargetId } from "./graph-helpers";

/**
 * Count edges that bridge two cluster sets and collect the IDs of
 * endpoint nodes that participate in any bridge.
 *
 * Pure: caller owns the edge list and set membership.
 */
export function countInterClusterEdges(
	edges: readonly GraphEdge[],
	setA: ReadonlySet<string>,
	setB: ReadonlySet<string>,
): { interEdges: number; bridgeNodes: Set<string> } {
	let interEdges = 0;
	const bridgeNodes = new Set<string>();
	for (const e of edges) {
		const src = edgeSourceId(e);
		const tgt = edgeTargetId(e);
		if ((setA.has(src) && setB.has(tgt)) || (setB.has(src) && setA.has(tgt))) {
			interEdges++;
			bridgeNodes.add(src);
			bridgeNodes.add(tgt);
		}
	}
	return { interEdges, bridgeNodes };
}

/**
 * Collect the union of tags across the given member IDs.
 * The tag-source lookup is supplied by the caller so this stays
 * decoupled from any view's internal node store.
 */
export function collectMemberTags(
	memberIds: readonly string[],
	getTags: (id: string) => readonly string[] | undefined,
): Set<string> {
	const tags = new Set<string>();
	for (const id of memberIds) {
		const t = getTags(id);
		if (!t) continue;
		for (const tag of t) tags.add(tag);
	}
	return tags;
}
