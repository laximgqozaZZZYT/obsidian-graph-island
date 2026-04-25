import type { GraphEdge } from "../../types";
import { edgeSourceId, edgeTargetId } from "../../utils/graph-helpers";

/**
 * Count edges that connect a node in `setA` with a node in `setB` (in either
 * direction) and collect every endpoint of such crossing edges as a "bridge".
 *
 * Pure: result depends only on the arguments. No `this`, no DOM, no time.
 */
export function countInterClusterEdges(
	edges: GraphEdge[],
	setA: Set<string>,
	setB: Set<string>,
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
