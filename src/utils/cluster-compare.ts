import type { GraphEdge } from "../types";
import { edgeSourceId, edgeTargetId } from "./graph-helpers";

/**
 * Count edges that bridge two cluster sets and collect every endpoint
 * touched by such an edge as a "bridge node".
 * Pure function: caller supplies edges + cluster membership sets.
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
 * Collect the union of tags assigned to a list of node IDs.
 * Pure function: tag lookup is supplied as a callback so the caller controls
 * the data source (e.g. PixiNode map, raw node array, custom adapter).
 */
export function collectMemberTags(
	memberIds: Iterable<string>,
	getTags: (id: string) => ReadonlyArray<string> | undefined,
): Set<string> {
	const tags = new Set<string>();
	for (const id of memberIds) {
		const t = getTags(id);
		if (t) for (const x of t) tags.add(x);
	}
	return tags;
}
