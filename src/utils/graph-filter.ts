// ---------------------------------------------------------------------------
// graph-filter.ts — Pure filtering functions for the graph data pipeline
// ---------------------------------------------------------------------------
// Extracted from GraphViewContainer.getGraphData() to enable unit testing
// without GVC/Obsidian dependencies.
// ---------------------------------------------------------------------------

import type { GraphNode, GraphEdge } from "../types";
import { EDGE_TYPE_HAS_TAG, EDGE_TYPE_SIMILAR, TAG_DISPLAY_ENCLOSURE } from "../constants";
import { incCounter } from "./graph-helpers";
import { addToMapSet } from "./map-helpers";

/** Remove orphan nodes (nodes with no edges). */
export function filterOrphans(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
	const connected = new Set<string>();
	for (const e of edges) {
		connected.add(e.source);
		connected.add(e.target);
	}
	return nodes.filter((n) => connected.has(n.id));
}

/** Filter out attachment files by extension. */
const ATTACHMENT_EXTS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".webp",
	".bmp",
	".pdf",
	".mp3",
	".mp4",
	".webm",
	".wav",
	".ogg",
	".csv",
	".xlsx",
	".docx",
]);

export function filterAttachments(nodes: GraphNode[]): GraphNode[] {
	return nodes.filter((n) => {
		const p = n.filePath ?? n.id;
		if (!p) return true;
		const dot = p.lastIndexOf(".");
		if (dot < 0) return true;
		return !ATTACHMENT_EXTS.has(p.substring(dot).toLowerCase());
	});
}

/** Remove tag nodes and has-tag edges. */
export function filterTagNodes(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
	return {
		nodes: nodes.filter((n) => !n.isTag),
		edges: edges.filter((e) => e.type !== EDGE_TYPE_HAS_TAG),
	};
}

/** Remove similar-type edges. */
export function filterSimilarEdges(edges: GraphEdge[]): GraphEdge[] {
	return edges.filter((e) => e.type !== EDGE_TYPE_SIMILAR);
}

/** Filter nodes by degree (min/max bounds). */
export function filterByDegree(nodes: GraphNode[], edges: GraphEdge[], minDeg: number, maxDeg: number): GraphNode[] {
	if (minDeg <= 0 && maxDeg <= 0) return nodes;
	const degMap = new Map<string, number>();
	for (const e of edges) {
		incCounter(degMap, e.source);
		incCounter(degMap, e.target);
	}
	return nodes.filter((n) => {
		const d = degMap.get(n.id) ?? 0;
		if (minDeg > 0 && d < minDeg) return false;
		if (maxDeg > 0 && d > maxDeg) return false;
		return true;
	});
}

/** Remove edges that reference nodes not in the given set. */
export function filterEdgesByNodeSet(edges: GraphEdge[], nodeSet: Set<string>): GraphEdge[] {
	return edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
}

/** Remove manually excluded nodes and their edges. */
export function filterExcludedNodes(
	nodes: GraphNode[],
	edges: GraphEdge[],
	excludeIds: string[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (!excludeIds.length) return { nodes, edges };
	const excl = new Set(excludeIds);
	const filtered = nodes.filter((n) => !excl.has(n.id));
	const remaining = new Set(filtered.map((n) => n.id));
	return {
		nodes: filtered,
		edges: edges.filter((e) => remaining.has(e.source) && remaining.has(e.target)),
	};
}

/** Visibility filter options (subset of PanelState). */
export interface VisibilityOptions {
	showOrphans: boolean;
	showAttachments: boolean;
	includeTagsInData: boolean;
	showTagNodes: boolean;
	tagDisplay: string;
	showSimilar: boolean;
}

/** Apply all visibility filters in pipeline order. */
export function applyVisibilityFilters(
	nodes: GraphNode[],
	edges: GraphEdge[],
	opts: VisibilityOptions,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (!opts.showOrphans) nodes = filterOrphans(nodes, edges);
	if (!opts.showAttachments) nodes = filterAttachments(nodes);
	if (!opts.includeTagsInData || !opts.showTagNodes || opts.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
		({ nodes, edges } = filterTagNodes(nodes, edges));
	}
	if (!opts.showSimilar) edges = filterSimilarEdges(edges);
	return { nodes, edges };
}

/**
 * Filter graph data to only include nodes in the subgraph set.
 * Edges are kept only when both endpoints are in the set.
 * Returns unmodified data when subgraphIds is empty.
 */
export function filterBySubgraph<N extends { id: string }, E extends { source: string; target: string }>(
	nodes: N[],
	edges: E[],
	subgraphIds: string[],
): { nodes: N[]; edges: E[] } {
	if (subgraphIds.length === 0) return { nodes, edges };
	const idSet = new Set(subgraphIds);
	const filteredNodes = nodes.filter((n) => idSet.has(n.id));
	const filteredEdges = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));
	return { nodes: filteredNodes, edges: filteredEdges };
}

/**
 * BFS N-hop filter: keep only nodes within `hops` edges of `centerId`.
 * Returns unmodified data when centerId is not found among nodes.
 */
export function filterByLocalGraph<
	N extends { id: string; filePath?: string },
	E extends { source: string; target: string },
>(nodes: N[], edges: E[], centerId: string, hops: number): { nodes: N[]; edges: E[] } {
	const resolved = nodes.find((n) => n.filePath === centerId || n.id === centerId)?.id;
	if (!resolved) return { nodes, edges };

	const adj = new Map<string, Set<string>>();
	for (const e of edges) {
		addToMapSet(adj, e.source, e.target);
		addToMapSet(adj, e.target, e.source);
	}
	const reachable = new Set<string>([resolved]);
	let frontier = [resolved];
	for (let h = 0; h < hops && frontier.length > 0; h++) {
		const next: string[] = [];
		for (const id of frontier) {
			const nb = adj.get(id);
			if (nb)
				for (const n of nb) {
					if (!reachable.has(n)) {
						reachable.add(n);
						next.push(n);
					}
				}
		}
		frontier = next;
	}

	return {
		nodes: nodes.filter((n) => reachable.has(n.id)),
		edges: edges.filter((e) => reachable.has(e.source) && reachable.has(e.target)),
	};
}
