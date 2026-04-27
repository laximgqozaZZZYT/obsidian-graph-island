import type { GraphEdge, GraphNode } from "../types";
import { jaccardSimilarity } from "./jaccard-similarity";

/**
 * Build an undirected adjacency map: node id -> set of neighbor ids.
 * Self-loops are skipped so a node is never considered its own neighbor.
 */
function buildAdjacencyMap(edges: GraphEdge[]): Map<string, Set<string>> {
	const adjacency = new Map<string, Set<string>>();
	for (const edge of edges) {
		const { source, target } = edge;
		if (source === target) continue;
		let sourceNeighbors = adjacency.get(source);
		if (!sourceNeighbors) {
			sourceNeighbors = new Set<string>();
			adjacency.set(source, sourceNeighbors);
		}
		sourceNeighbors.add(target);
		let targetNeighbors = adjacency.get(target);
		if (!targetNeighbors) {
			targetNeighbors = new Set<string>();
			adjacency.set(target, targetNeighbors);
		}
		targetNeighbors.add(source);
	}
	return adjacency;
}

/**
 * Find the top-N most similar nodes to a target, ranked by Jaccard similarity
 * over their neighbor-id sets.
 *
 * - The target itself is always excluded from the result.
 * - Candidates with score 0 (no shared neighbors) are filtered out.
 * - Results are sorted by score descending, with ties broken by node.id ascending.
 * - At most `topN` entries are returned; fewer if not enough scoring candidates exist.
 */
export function findTopSimilarNodes(
	target: GraphNode,
	candidates: GraphNode[],
	edges: GraphEdge[],
	topN: number = 3,
): { node: GraphNode; score: number }[] {
	const adjacency = buildAdjacencyMap(edges);
	const targetNeighbors = adjacency.get(target.id) ?? new Set<string>();

	const scored: { node: GraphNode; score: number }[] = [];
	for (const candidate of candidates) {
		if (candidate.id === target.id) continue;
		const candidateNeighbors = adjacency.get(candidate.id) ?? new Set<string>();
		const score = jaccardSimilarity(targetNeighbors, candidateNeighbors);
		if (score <= 0) continue;
		scored.push({ node: candidate, score });
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		if (a.node.id < b.node.id) return -1;
		if (a.node.id > b.node.id) return 1;
		return 0;
	});

	return scored.slice(0, Math.max(0, topN));
}
