// ---------------------------------------------------------------------------
// SearchOrchestrator.ts — Pure search/filter logic extracted from GVC
// ---------------------------------------------------------------------------
// Contains hop-filter parsing, BFS hop computation, search-expression
// filtering, and search-highlight classification.  All functions are pure
// (no PixiJS / Obsidian dependencies) to enable unit testing.
// ---------------------------------------------------------------------------

import type { App } from "obsidian";
import type { GraphNode, GraphEdge } from "../types";
import { evaluateExpr, parseQueryExpr } from "../utils/query-expr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single parsed hop filter entry, e.g. hop:alice:2 */
interface HopFilterEntry {
	name: string; // lowercase node-name fragment
	hops: number; // BFS depth
}

/** Result of parsing a raw search query for hop filters */
interface ParsedSearchQuery {
	hopFilters: HopFilterEntry[];
	/** The remaining text after hop:x:n patterns are removed (lowercased, trimmed) */
	remainingText: string;
}

/** Result of applying search expression to a node list */
interface SearchFilterResult {
	nodes: GraphNode[];
	/** Non-null when searchMode === "highlight" — set of matched node IDs */
	highlightSet: Set<string> | null;
}

/** Per-node search match classification */
interface SearchMatchResult {
	isMatch: boolean;
	hopMatch: boolean;
	textMatch: boolean;
}

/** Card halo geometry for search highlight rendering */
interface CardHaloGeometry {
	halfW: number;
	halfH: number;
	outset: number;
	cornerRadius: number;
}

// ---------------------------------------------------------------------------
// Hop-filter parsing
// ---------------------------------------------------------------------------

const HOP_PATTERN = /hop:([^:,]+):(\d+)/gi;

/**
 * Parse hop:name:n patterns from a raw search query string.
 * Returns the parsed hop entries and the remaining text query.
 */
export function parseHopFilters(raw: string): ParsedSearchQuery {
	const hopFilters: HopFilterEntry[] = [];
	const matches = [...raw.matchAll(HOP_PATTERN)];
	let remaining = raw;
	for (const m of matches) {
		hopFilters.push({ name: m[1].toLowerCase(), hops: parseInt(m[2], 10) });
		remaining = remaining.replace(m[0], "");
	}
	const remainingText = remaining.replace(/,/g, " ").trim().toLowerCase();
	return { hopFilters, remainingText };
}

// ---------------------------------------------------------------------------
// Hop BFS computation
// ---------------------------------------------------------------------------

/**
 * Compute the set of node IDs reachable within N hops of specified origins.
 *
 * @param hopFilters  Parsed hop filter entries
 * @param nodeLabels  Map from node ID to its display label (lowercase)
 * @param adj        Adjacency list (node ID -> Set of neighbor IDs)
 * @returns Set of node IDs within hop range, or null if no hop filters
 */
export function computeHopSet(
	hopFilters: HopFilterEntry[],
	nodeLabels: Map<string, string>,
	adj: Map<string, Set<string>>,
): Set<string> | null {
	if (hopFilters.length === 0) return null;

	const hopSet = new Set<string>();

	for (const { name, hops } of hopFilters) {
		// Find origin node(s) by partial name match
		const origins: string[] = [];
		for (const [id, label] of nodeLabels) {
			if (label.includes(name)) origins.push(id);
		}

		// BFS from each origin
		for (const origin of origins) {
			hopSet.add(origin);
			let frontier = [origin];
			for (let h = 0; h < hops && frontier.length > 0; h++) {
				const next: string[] = [];
				for (const id of frontier) {
					const nb = adj.get(id);
					if (nb) {
						for (const n of nb) {
							if (!hopSet.has(n)) {
								hopSet.add(n);
								next.push(n);
							}
						}
					}
				}
				frontier = next;
			}
		}
	}

	return hopSet;
}

// ---------------------------------------------------------------------------
// Search-expression filtering (data pipeline)
// ---------------------------------------------------------------------------

/**
 * Apply search query expression to filter or highlight nodes.
 * This is the pure logic previously in GVC._filterByQuery (search part).
 *
 * @param nodes       Current node list
 * @param searchQuery Raw search query string
 * @param searchMode  "filter" (default) removes non-matching; "highlight" keeps all
 * @returns Filtered nodes and optional highlight set
 */
export function filterBySearchExpr(
	nodes: GraphNode[],
	searchQuery: string,
	searchMode: string | undefined,
): SearchFilterResult {
	// Strip hop filters — they're handled separately in applySearch
	const remaining = searchQuery.replace(HOP_PATTERN, "").replace(/,/g, " ").trim();
	if (!remaining) return { nodes, highlightSet: null };

	const expr = parseQueryExpr(remaining);
	if (!expr) return { nodes, highlightSet: null };

	const matchedIds = new Set(nodes.filter((n) => evaluateExpr(expr, n)).map((n) => n.id));

	if (searchMode === "highlight") {
		// Keep all nodes; store matched IDs for visual dimming
		return { nodes, highlightSet: matchedIds };
	}

	// Default filter mode — remove non-matching nodes
	return {
		nodes: nodes.filter((n) => matchedIds.has(n.id)),
		highlightSet: null,
	};
}


// ---------------------------------------------------------------------------
// Search match classification
// ---------------------------------------------------------------------------

/**
 * Classify whether a node matches the current search/hop filters.
 *
 * @param nodeId  The node ID to check
 * @param hopSet  Set of IDs within hop range (null = no hop filter active)
 * @param hlSet   Set of IDs matching text search (null = no text search active)
 */
export function classifySearchMatch(
	nodeId: string,
	hopSet: Set<string> | null,
	hlSet: Set<string> | null,
): SearchMatchResult {
	const hopMatch = hopSet === null || hopSet.has(nodeId);
	const textMatch = hlSet === null || hlSet.has(nodeId);
	return { isMatch: hopMatch && textMatch, hopMatch, textMatch };
}

/**
 * Count matched nodes from a set of node IDs.
 */
export function countSearchMatches(
	nodeIds: Iterable<string>,
	hopSet: Set<string> | null,
	hlSet: Set<string> | null,
): number {
	let count = 0;
	for (const id of nodeIds) {
		const { isMatch } = classifySearchMatch(id, hopSet, hlSet);
		if (isMatch) count++;
	}
	return count;
}

// ---------------------------------------------------------------------------
// Local graph expanded-node neighbor inclusion
// ---------------------------------------------------------------------------

/**
 * Expand a local-graph BFS result to include neighbors of manually expanded nodes.
 * Pure function extracted from GVC._filterLocalGraph.
 *
 * @param allNodes      Full node list (before local-graph filter)
 * @param allEdges      Full edge list (before local-graph filter)
 * @param bfsNodes      Nodes already included by BFS hop filter
 * @param expandedNodes Node IDs that were manually expanded
 * @returns Expanded { nodes, edges }
 */
export function expandLocalGraphNeighbors(
	allNodes: GraphNode[],
	allEdges: GraphEdge[],
	bfsNodes: GraphNode[],
	expandedNodes: string[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (!expandedNodes.length) return { nodes: bfsNodes, edges: allEdges };

	const adj = new Map<string, Set<string>>();
	for (const e of allEdges) {
		if (!adj.has(e.source)) adj.set(e.source, new Set());
		if (!adj.has(e.target)) adj.set(e.target, new Set());
		adj.get(e.source)!.add(e.target);
		adj.get(e.target)!.add(e.source);
	}

	const reachable = new Set(bfsNodes.map((n) => n.id));
	for (const expandedId of expandedNodes) {
		if (!reachable.has(expandedId)) continue;
		const neighbors = adj.get(expandedId);
		if (neighbors) {
			for (const nbId of neighbors) reachable.add(nbId);
		}
	}

	return {
		nodes: allNodes.filter((n) => reachable.has(n.id)),
		edges: allEdges.filter((e) => reachable.has(e.source) && reachable.has(e.target)),
	};
}

// ---------------------------------------------------------------------------
// Mobile node cap
// ---------------------------------------------------------------------------

/**
 * Cap node count for mobile devices by keeping top-degree nodes.
 * Pure function extracted from GVC.getGraphData mobile logic.
 *
 * @param nodes    Node list to cap
 * @param edges    Edge list (filtered to surviving nodes)
 * @param degrees  Degree map for sorting
 * @param maxNodes Maximum number of nodes to keep
 * @returns Capped { nodes, edges }
 */
export function capNodesByDegree(
	nodes: GraphNode[],
	edges: GraphEdge[],
	degrees: Map<string, number>,
	maxNodes: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (nodes.length <= maxNodes) return { nodes, edges };

	const sorted = [...nodes].sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0));
	const capped = sorted.slice(0, maxNodes);
	const nodeSet = new Set(capped.map((n) => n.id));
	return {
		nodes: capped,
		edges: edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target)),
	};
}

// ---------------------------------------------------------------------------
// Rich status bar text
// ---------------------------------------------------------------------------

/** Minimal panel shape needed by buildRichStatus */
interface StatusPanelInfo {
	localGraphCenter?: string | null;
	focusLayout?: boolean;
	collapsedGroups?: { size: number };
	searchQuery?: string;
	searchMode?: string;
	viewMode?: string;
	groupBy?: string;
}

/**
 * Build a rich status bar string summarizing current graph state.
 * Pure function extracted from GVC.buildRichStatus.
 */
export function buildRichStatus(
	nodeCount: number,
	edgeCount: number,
	totalNodes: number,
	panel: StatusPanelInfo,
): string {
	const parts: string[] = [];
	if (panel.localGraphCenter) parts.push("Local");
	else if (panel.focusLayout) parts.push("Focus");
	if (totalNodes !== nodeCount) {
		parts.push(`${nodeCount} / ${totalNodes} nodes`);
	} else {
		parts.push(`${nodeCount} nodes`);
	}
	if (edgeCount > 0) parts.push(`${edgeCount} edges`);
	const groupCount = panel.collapsedGroups?.size ?? 0;
	if (groupCount > 0) parts.push(`${groupCount} groups`);
	if (panel.searchQuery) {
		const mode = panel.searchMode === "highlight" ? "HL" : "F";
		parts.push(`[${mode}: ${panel.searchQuery.slice(0, 20)}]`);
	}
	if (panel.viewMode && panel.viewMode !== "graph") {
		parts.push(panel.viewMode);
	}
	if (panel.groupBy && panel.groupBy !== "none") {
		parts.push(`by ${panel.groupBy}`);
	}
	return parts.join(" \u00B7 ");
}

// ---------------------------------------------------------------------------
// Pathfinder BFS
// ---------------------------------------------------------------------------

/** Result of a BFS shortest-path search */
export interface PathfinderResult {
	path: string[];
	nodeSet: Set<string>;
	edgeSet: Set<string>;
}

/**
 * BFS shortest path between two nodes, returning the path, node set, and edge set.
 * Pure function extracted from GVC.computePathfinderPath.
 *
 * @returns null if no path exists or start === end
 */
export function computePathfinderBFS(
	startId: string,
	endId: string,
	adj: Map<string, Set<string>>,
): PathfinderResult | null {
	if (!startId || !endId || startId === endId || !adj.size) return null;

	const visited = new Set<string>([startId]);
	const parent = new Map<string, string>();
	const queue: string[] = [startId];

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (current === endId) break;
		const neighbors = adj.get(current);
		if (!neighbors) continue;
		for (const n of neighbors) {
			if (!visited.has(n)) {
				visited.add(n);
				parent.set(n, current);
				queue.push(n);
			}
		}
	}

	if (!parent.has(endId)) return null;

	// Reconstruct path
	const path: string[] = [];
	let cur = endId;
	while (cur !== startId) {
		path.unshift(cur);
		cur = parent.get(cur)!;
	}
	path.unshift(startId);

	const nodeSet = new Set(path);
	const edgeSet = new Set<string>();
	for (let i = 0; i < path.length - 1; i++) {
		const a = path[i],
			b = path[i + 1];
		edgeSet.add(`${a}\u2192${b}`);
		edgeSet.add(`${b}\u2192${a}`);
	}

	return { path, nodeSet, edgeSet };
}

// ---------------------------------------------------------------------------
// Entropy scores
// ---------------------------------------------------------------------------

/**
 * Compute per-node entropy scores (knowledge diversity).
 * entropy = uniqueTagCount(neighbors) / neighborCount
 * Pure function extracted from GVC.updateEntropyScores.
 *
 * @param adj        Adjacency list
 * @param nodeTags   Map from node ID to its tags array
 * @returns Map of node ID to entropy score (0..1)
 */
export function computeEntropyScores(
	adj: Map<string, Set<string>>,
	nodeTags: Map<string, string[]>,
): Map<string, number> {
	const scores = new Map<string, number>();
	for (const [nodeId, neighbors] of adj) {
		if (neighbors.size === 0) continue;
		const allTags = new Set<string>();
		for (const nbId of neighbors) {
			const tags = nodeTags.get(nbId);
			if (tags) {
				for (const tag of tags) allTags.add(tag);
			}
		}
		const entropy = allTags.size / neighbors.size;
		scores.set(nodeId, Math.min(1, entropy));
	}
	return scores;
}

// ---------------------------------------------------------------------------
// Card halo geometry
// ---------------------------------------------------------------------------

/**
 * Compute the halo rectangle geometry for card-mode search highlights.
 *
 * @param radius         Node radius
 * @param cardAspectRatio  Card aspect ratio (default 1.618 golden ratio)
 * @param cardCornerRadius Card corner radius (default 6)
 */
export function computeCardHaloGeometry(
	radius: number,
	cardAspectRatio: number,
	cardCornerRadius: number,
): CardHaloGeometry {
	const ar = cardAspectRatio > 0 ? cardAspectRatio : 1.618;
	const baseH = radius * 2;
	const halfH = baseH;
	const halfW = Math.max(20, (baseH * ar) / 2);
	return { halfW, halfH, outset: 4, cornerRadius: cardCornerRadius ?? 6 };
}
