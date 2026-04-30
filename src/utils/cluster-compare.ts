import { edgeSourceId, edgeTargetId } from "./graph-helpers";

/**
 * Count edges that bridge two cluster sets and collect the IDs of
 * nodes participating in those bridges.
 *
 * An edge is "inter-cluster" when one endpoint is in `setA` and the
 * other is in `setB` (in either direction).  Bridge nodes are the
 * union of all endpoints that appear on at least one inter-cluster
 * edge.
 */
export function countInterClusterEdges(
	edges: Iterable<{ source: string | { id: string }; target: string | { id: string } }>,
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
 * `getTags` returns the tag list for a given node id, or undefined when
 * the node is unknown / has no tags.
 */
export function collectMemberTags(
	memberIds: readonly string[],
	getTags: (id: string) => readonly string[] | undefined,
): Set<string> {
	const tags = new Set<string>();
	for (const id of memberIds) {
		const list = getTags(id);
		if (list) for (const tag of list) tags.add(tag);
	}
	return tags;
}
