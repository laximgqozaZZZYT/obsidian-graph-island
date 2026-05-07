/**
 * Pure helpers extracted from GraphViewContainer's "Cluster compare" feature.
 *
 * Both functions are intentionally free of any rendering / Pixi / settings
 * dependencies so they can be unit tested without spinning up the full view.
 */

import type { GraphEdge } from "../types";
import { edgeSourceId, edgeTargetId } from "../utils/graph-helpers";

/**
 * Count edges that bridge two cluster sets and collect the IDs of the bridge
 * endpoints (i.e. nodes that participate in at least one inter-cluster edge).
 *
 * An edge counts as inter-cluster when one endpoint is in `setA` and the
 * other is in `setB` (in either direction). Edges whose endpoints are both
 * inside the same set are ignored.
 */
export function countInterClusterEdges(
	edges: ReadonlyArray<GraphEdge>,
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
 * Collect the union of tags belonging to a list of node IDs. Resolution of
 * "tags for an ID" is delegated to the caller via `getTags`, keeping this
 * helper independent of the underlying node store (Pixi map, raw GraphData,
 * etc.).
 */
export function collectMemberTags(
	memberIds: ReadonlyArray<string>,
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
