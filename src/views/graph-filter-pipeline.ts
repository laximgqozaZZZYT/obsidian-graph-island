// ---------------------------------------------------------------------------
// graph-filter-pipeline.ts — Pure orchestration for the GVC filter pipeline
// ---------------------------------------------------------------------------
// Extracted from GraphViewContainer.getGraphData()'s three filter passes
// (_filterLocalGraph, _filterNodeVisibility, _filterByQuery) so the
// GraphViewContainer god object can stay under its line cap and so the
// orchestration itself can be unit-tested without mounting GVC.
//
// Each function takes only what it needs (the graph slice + the panel
// fields it touches + the App for vault access); side effects (like the
// search-highlight set assignment) are returned, not stored on `this`.
// ---------------------------------------------------------------------------

import type { App } from "obsidian";
import type { GraphNode, GraphEdge } from "../types";
import { addToMapSet } from "../utils/map-helpers";
import { applyVisibilityFilters, filterByLocalGraph } from "../utils/graph-filter";
import { evaluateExpr, parseQueryExpr } from "../utils/query-expr";
import { queryDataviewPages, filterNodesByDataview } from "../utils/dataview-source";

// ---------------------------------------------------------------------------
// Local graph (BFS N-hop + manually expanded neighbours)
// ---------------------------------------------------------------------------

export interface LocalGraphFilterOptions {
	localGraphCenter: string | null | undefined;
	localGraphHops: number;
	expandedNodes?: string[];
}

/**
 * BFS N-hop filter for local graph mode. Delegates the core BFS to
 * `filterByLocalGraph` (pure), then layers manually-expanded neighbours
 * on top so a user can incrementally widen the visible neighbourhood
 * without changing the hop radius.
 */
export function runLocalGraphFilter(
	nodes: GraphNode[],
	edges: GraphEdge[],
	opts: LocalGraphFilterOptions,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (!opts.localGraphCenter) return { nodes, edges };

	let result = filterByLocalGraph(nodes, edges, opts.localGraphCenter, opts.localGraphHops);

	// D1: also include neighbours of manually expanded nodes
	if (opts.expandedNodes?.length) {
		const adj = new Map<string, Set<string>>();
		for (const e of edges) {
			addToMapSet(adj, e.source, e.target);
			addToMapSet(adj, e.target, e.source);
		}
		const reachable = new Set(result.nodes.map((n) => n.id));
		for (const expandedId of opts.expandedNodes) {
			if (!reachable.has(expandedId)) continue;
			const neighbors = adj.get(expandedId);
			if (neighbors) {
				for (const nbId of neighbors) reachable.add(nbId);
			}
		}
		result = {
			nodes: nodes.filter((n) => reachable.has(n.id)),
			edges: edges.filter((e) => reachable.has(e.source) && reachable.has(e.target)),
		};
	}

	return result;
}

// ---------------------------------------------------------------------------
// Node visibility (orphans / attachments / tags / similar / existingOnly)
// ---------------------------------------------------------------------------

export interface VisibilityFilterOptions {
	showOrphans: boolean;
	showAttachments?: boolean;
	includeTagsInData?: boolean;
	showTagNodes?: boolean;
	tagDisplay?: string;
	showSimilar?: boolean;
	showNamedRelation?: boolean;
	existingOnly?: boolean;
}

/**
 * Apply visibility filters (orphans / attachments / tag nodes / similar
 * edges / named-relation edges) plus the `existingOnly` filter that needs
 * vault access. Pure except for the vault read.
 */
export function runVisibilityFilter(
	app: App,
	nodes: GraphNode[],
	edges: GraphEdge[],
	opts: VisibilityFilterOptions,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	({ nodes, edges } = applyVisibilityFilters(nodes, edges, {
		showOrphans: opts.showOrphans,
		showAttachments: opts.showAttachments ?? true,
		includeTagsInData: opts.includeTagsInData ?? true,
		showTagNodes: opts.showTagNodes ?? true,
		tagDisplay: opts.tagDisplay ?? "node",
		showSimilar: opts.showSimilar ?? true,
		showNamedRelation: opts.showNamedRelation ?? false,
	}));

	if (opts.existingOnly) {
		const existing = new Set(app.vault.getMarkdownFiles().map((f) => f.path));
		nodes = nodes.filter((n) => n.isTag || existing.has(n.id));
	}

	return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Dataview + search query filter
// ---------------------------------------------------------------------------

export interface QueryFilterOptions {
	dataviewQuery: string;
	searchQuery: string;
	searchMode: string;
	showTagNodes: boolean;
}

/**
 * Apply dataview source + search-query filters. In `highlight` search mode
 * matched IDs are returned as `highlightSet` instead of removing
 * non-matching nodes; the caller is responsible for forwarding that set
 * to the renderer (GVC stores it on `_searchHighlightSet`).
 */
export function runQueryFilter(
	app: App,
	nodes: GraphNode[],
	edges: GraphEdge[],
	opts: QueryFilterOptions,
): { nodes: GraphNode[]; edges: GraphEdge[]; highlightSet: Set<string> | null } {
	let highlightSet: Set<string> | null = null;

	if (opts.dataviewQuery.trim()) {
		const matchingPaths = queryDataviewPages(app, opts.dataviewQuery.trim());
		if (matchingPaths.size > 0) {
			nodes = filterNodesByDataview(nodes, matchingPaths, opts.showTagNodes);
		}
	}

	const remaining = opts.searchQuery
		.replace(/hop:[^:,]+:\d+/gi, "")
		.replace(/,/g, " ")
		.trim();
	if (remaining) {
		const searchExpr = parseQueryExpr(remaining);
		if (searchExpr) {
			const matchedIds = new Set(nodes.filter((n) => evaluateExpr(searchExpr, n)).map((n) => n.id));
			if (opts.searchMode === "highlight") {
				// N2: highlight mode — keep all nodes; renderer dims non-matches
				highlightSet = matchedIds;
			} else {
				nodes = nodes.filter((n) => matchedIds.has(n.id));
			}
		}
	}

	return { nodes, edges, highlightSet };
}
