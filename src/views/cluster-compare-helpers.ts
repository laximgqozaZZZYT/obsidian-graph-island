import { edgeSourceId, edgeTargetId } from "../utils/graph-helpers";
import type { GraphEdge } from "../types";

/**
 * Count edges that cross between two cluster sets and collect every node ID
 * that participates in such a crossing edge ("bridge nodes").
 *
 * Pure function — does not mutate inputs.
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
 * Collect the union of tags across a list of node IDs.
 * The lookup callback should return tags for a given id (or undefined if the
 * node is not present / has no tags).
 *
 * Pure function — does not mutate inputs.
 */
export function collectMemberTags(
	memberIds: readonly string[],
	getNodeTags: (id: string) => readonly string[] | undefined,
): Set<string> {
	const tags = new Set<string>();
	for (const id of memberIds) {
		const t = getNodeTags(id);
		if (t) for (const tag of t) tags.add(tag);
	}
	return tags;
}

/**
 * Intersection of two tag sets, returned as an array preserving the iteration
 * order of `tagsA`.
 *
 * Pure function — does not mutate inputs.
 */
export function computeSharedTags(
	tagsA: ReadonlySet<string>,
	tagsB: ReadonlySet<string>,
): string[] {
	const result: string[] = [];
	for (const t of tagsA) {
		if (tagsB.has(t)) result.push(t);
	}
	return result;
}
