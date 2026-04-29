/**
 * Pure helper functions for cluster comparison logic.
 * Extracted from GraphViewContainer to reduce God Object size.
 */
import type { GraphEdge } from "../types";
import { edgeSourceId, edgeTargetId } from "../utils/graph-helpers";

/**
 * Count edges that bridge two cluster sets and collect the bridge node IDs.
 *
 * An edge is a bridge if one endpoint is in setA and the other in setB
 * (in either direction). Returns the count of such edges and the set of
 * unique node IDs touched by them.
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
 * Collect the union of tags across the given member node IDs.
 * `getTags` resolves a node ID to its tag list (or undefined if missing).
 */
export function collectMemberTags(
	memberIds: readonly string[],
	getTags: (id: string) => readonly string[] | undefined,
): Set<string> {
	const tags = new Set<string>();
	for (const id of memberIds) {
		const t = getTags(id);
		if (t) for (const tag of t) tags.add(tag);
	}
	return tags;
}
