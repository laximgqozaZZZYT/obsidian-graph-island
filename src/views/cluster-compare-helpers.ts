/**
 * Pure helper functions for cluster comparison logic.
 * Extracted from GraphViewContainer.updateClusterCompare().
 */
import { edgeSourceId, edgeTargetId } from "../utils/graph-helpers";
import type { GraphEdge } from "../types";

export interface ClusterCompareEdgeStats {
	interEdges: number;
	bridgeNodes: Set<string>;
}

/**
 * Count edges spanning two cluster sets and collect the IDs of nodes
 * participating in those bridging edges.
 *
 * An edge contributes when one endpoint is in `setA` and the other in `setB`
 * (regardless of direction). The two endpoints of every contributing edge are
 * added to `bridgeNodes`.
 */
export function countInterClusterEdges(
	edges: Iterable<GraphEdge>,
	setA: ReadonlySet<string>,
	setB: ReadonlySet<string>,
): ClusterCompareEdgeStats {
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
 * Collect the union of tags across a list of member node IDs.
 * Nodes without tags or unknown IDs are silently skipped.
 */
export function collectMemberTags(
	memberIds: Iterable<string>,
	getTags: (id: string) => readonly string[] | undefined,
): Set<string> {
	const tags = new Set<string>();
	for (const id of memberIds) {
		const memberTags = getTags(id);
		if (!memberTags) continue;
		for (const t of memberTags) tags.add(t);
	}
	return tags;
}
