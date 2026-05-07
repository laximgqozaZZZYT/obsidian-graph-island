// ---------------------------------------------------------------------------
// cluster-compare-helpers.ts — Pure helpers for "cluster compare" feature.
// Extracted from GraphViewContainer to enable unit testing without PixiJS
// or Obsidian dependencies.
// ---------------------------------------------------------------------------

import type { GraphEdge } from "../types";
import { edgeSourceId, edgeTargetId } from "../utils/graph-helpers";

/** Result of {@link countInterClusterEdges}. */
export interface InterClusterEdgeStats {
	/** Number of edges with one endpoint in setA and the other in setB. */
	interEdges: number;
	/** Distinct node IDs that participate in any inter-cluster edge. */
	bridgeNodes: Set<string>;
}

/**
 * Count edges that bridge two cluster sets and collect the bridge node IDs.
 * Direction-agnostic: an edge counts whether its source is in A and target in B
 * or vice versa.
 */
export function countInterClusterEdges(
	edges: readonly GraphEdge[],
	setA: ReadonlySet<string>,
	setB: ReadonlySet<string>,
): InterClusterEdgeStats {
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
 * `getTags(id)` may return undefined for nodes without tag data.
 */
export function collectMemberTags(
	memberIds: readonly string[],
	getTags: (id: string) => readonly string[] | undefined,
): Set<string> {
	const tags = new Set<string>();
	for (const id of memberIds) {
		const list = getTags(id);
		if (list) for (const t of list) tags.add(t);
	}
	return tags;
}
