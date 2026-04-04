import type { GraphNode, GraphEdge } from "../types";
import { incCounter, buildAdjFromEdges } from "../utils/graph-helpers";

// ---------------------------------------------------------------------------
// Graph Statistics (Feature CX)
// ---------------------------------------------------------------------------

export interface GraphStats {
	nodeCount: number;
	edgeCount: number;
	avgDegree: number;
	/** Graph density: edges / max possible edges (0–1) */
	density: number;
	/** Top N most-connected nodes: [nodeId, degree] */
	hubs: [string, number][];
	/** Number of connected components via BFS */
	componentCount: number;
	/** Fraction of nodes with degree 0 (0–1) */
	orphanRate: number;
	/** Fraction of nodes that have at least one tag (0–1) */
	tagCoverage: number;
	/** Edge count per edge type */
	edgeTypeCounts: Map<string, number>;
}

/**
 * Compute summary statistics for the current graph view.
 * @param nodes  Visible nodes
 * @param edges  Visible edges
 * @param degrees  Pre-computed degree map (from computeNodeDegrees)
 * @param hubCount  How many top hubs to return (default 5)
 */
export function computeGraphStats(
	nodes: GraphNode[],
	edges: GraphEdge[],
	degrees: Map<string, number>,
	hubCount = 5,
): GraphStats {
	const nodeCount = nodes.length;
	const edgeCount = edges.length;
	const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;
	const density = nodeCount > 1 ? (2 * edgeCount) / (nodeCount * (nodeCount - 1)) : 0;
	const hubs: [string, number][] = [...degrees.entries()].sort((a, b) => b[1] - a[1]).slice(0, hubCount);
	const componentCount = countConnectedComponents(nodes, edges);

	// Orphan rate: fraction of nodes with degree 0
	const orphanCount = nodes.filter((n) => (degrees.get(n.id) ?? 0) === 0).length;
	const orphanRate = nodeCount > 0 ? orphanCount / nodeCount : 0;

	// Tag coverage: fraction of nodes with at least one tag
	const taggedCount = nodes.filter((n) => n.tags && n.tags.length > 0).length;
	const tagCoverage = nodeCount > 0 ? taggedCount / nodeCount : 0;

	// Edge type distribution
	const edgeTypeCounts = new Map<string, number>();
	for (const e of edges) {
		const etype = e.type ?? "unknown";
		incCounter(edgeTypeCounts, etype);
	}

	return { nodeCount, edgeCount, avgDegree, density, hubs, componentCount, orphanRate, tagCoverage, edgeTypeCounts };
}

/**
 * Count connected components using BFS.
 */
export function countConnectedComponents(nodes: GraphNode[], edges: GraphEdge[]): number {
	if (nodes.length === 0) return 0;
	const adj = buildAdjFromEdges(nodes, edges);
	const visited = new Set<string>();
	let components = 0;
	for (const n of nodes) {
		if (visited.has(n.id)) continue;
		components++;
		// BFS from this node
		const queue = [n.id];
		visited.add(n.id);
		while (queue.length > 0) {
			const cur = queue.shift()!;
			for (const nb of adj.get(cur) ?? []) {
				if (!visited.has(nb)) {
					visited.add(nb);
					queue.push(nb);
				}
			}
		}
	}
	return components;
}

export function computeNodeDegrees(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
	const degrees = new Map<string, number>();
	for (const node of nodes) degrees.set(node.id, 0);
	for (const edge of edges) {
		degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
		degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
	}
	return degrees;
}

export function computeInDegree(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
	const inDegree = new Map<string, number>();
	for (const node of nodes) inDegree.set(node.id, 0);
	for (const edge of edges) {
		inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
	}
	return inDegree;
}

// ---------------------------------------------------------------------------
// Betweenness Centrality — Brandes algorithm O(V*E)
// ---------------------------------------------------------------------------

/**
 * Compute betweenness centrality for all nodes using Brandes' algorithm.
 * For unweighted, undirected graphs this runs in O(V*E).
 *
 * @param nodes  Graph nodes
 * @param edges  Graph edges (treated as undirected)
 * @param maxNodes  Skip computation if node count exceeds this (returns empty map)
 * @returns Map<nodeId, centrality> — normalized by 2/((V-1)(V-2)) for V≥3
 */
export function computeBetweennessCentrality(
	nodes: GraphNode[],
	edges: GraphEdge[],
	maxNodes = 5000,
): Map<string, number> {
	const bc = new Map<string, number>();
	const V = nodes.length;
	if (V === 0) return bc;
	for (const n of nodes) bc.set(n.id, 0);

	// Skip for very large graphs
	if (V > maxNodes) return bc;

	const adj = buildAdjFromEdges(nodes, edges);

	// Brandes: BFS from each source
	for (const s of nodes) {
		const stack: string[] = [];
		const pred = new Map<string, string[]>();
		for (const n of nodes) pred.set(n.id, []);
		const sigma = new Map<string, number>();
		for (const n of nodes) sigma.set(n.id, 0);
		sigma.set(s.id, 1);
		const dist = new Map<string, number>();
		for (const n of nodes) dist.set(n.id, -1);
		dist.set(s.id, 0);
		const queue: string[] = [s.id];

		// BFS
		while (queue.length > 0) {
			const v = queue.shift()!;
			stack.push(v);
			const dv = dist.get(v)!;
			for (const w of adj.get(v) ?? []) {
				const dw = dist.get(w)!;
				if (dw < 0) {
					// First visit
					dist.set(w, dv + 1);
					queue.push(w);
				}
				if (dist.get(w) === dv + 1) {
					sigma.set(w, sigma.get(w)! + sigma.get(v)!);
					pred.get(w)!.push(v);
				}
			}
		}

		// Accumulation
		const delta = new Map<string, number>();
		for (const n of nodes) delta.set(n.id, 0);
		while (stack.length > 0) {
			const w = stack.pop()!;
			for (const v of pred.get(w)!) {
				const d = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
				delta.set(v, delta.get(v)! + d);
			}
			if (w !== s.id) {
				bc.set(w, bc.get(w)! + delta.get(w)!);
			}
		}
	}

	// Normalize for undirected graph: divide by 2
	// (each pair counted twice in undirected BFS)
	if (V >= 3) {
		const norm = 2.0; // undirected
		for (const [id, val] of bc) {
			bc.set(id, val / norm);
		}
	}

	return bc;
}

// ---------------------------------------------------------------------------
// Connected component labeling
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Structural pattern detection (Phase 3d)
// ---------------------------------------------------------------------------

/**
 * Find articulation points (cut vertices) using Tarjan's DFS algorithm.
 * Removing an articulation point disconnects the graph.
 */
export function detectArticulationPoints(nodes: GraphNode[], edges: GraphEdge[]): Set<string> {
	const result = new Set<string>();
	if (nodes.length === 0) return result;

	const adj = buildAdjFromEdges(nodes, edges);

	const disc = new Map<string, number>();
	const low = new Map<string, number>();
	const parent = new Map<string, string | null>();
	let timer = 0;

	function dfs(u: string): void {
		disc.set(u, timer);
		low.set(u, timer);
		timer++;
		let children = 0;

		for (const v of adj.get(u) ?? []) {
			if (!disc.has(v)) {
				children++;
				parent.set(v, u);
				dfs(v);
				low.set(u, Math.min(low.get(u)!, low.get(v)!));
				// u is articulation point if:
				// 1) u is root and has 2+ children
				// 2) u is not root and low(v) >= disc(u)
				if (parent.get(u) === null && children > 1) result.add(u);
				if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) result.add(u);
			} else if (v !== parent.get(u)) {
				low.set(u, Math.min(low.get(u)!, disc.get(v)!));
			}
		}
	}

	for (const n of nodes) {
		if (!disc.has(n.id)) {
			parent.set(n.id, null);
			dfs(n.id);
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Structure Questions (Feature S4)
// ---------------------------------------------------------------------------

/**
 * Generate insight questions from graph structure.
 * @param nodes   Visible nodes
 * @param edges   Visible edges
 * @param degrees Pre-computed degree map
 * @param betweenness Optional betweenness centrality map
 */
/** Find the entry with the highest value in a map */
function findMaxEntry(map: Map<string, number>): [string, number] {
	let maxVal = 0;
	let maxId = "";
	for (const [id, val] of map) {
		if (val > maxVal) {
			maxVal = val;
			maxId = id;
		}
	}
	return [maxId, maxVal];
}

/** Hub and betweenness questions */
function hubQuestions(
	nodes: GraphNode[],
	degrees: Map<string, number>,
	betweenness: Map<string, number> | undefined,
): { questions: string[]; maxDegId: string; maxDeg: number } {
	const questions: string[] = [];
	const [maxDegId, maxDeg] = findMaxEntry(degrees);

	if (maxDegId) {
		const label = nodes.find((n) => n.id === maxDegId)?.label ?? maxDegId;
		questions.push(`Why is "${label}" so highly connected (${maxDeg} edges)?`);
	}

	if (betweenness && betweenness.size > 0) {
		const [maxBetId] = findMaxEntry(betweenness);
		if (maxBetId && maxBetId !== maxDegId) {
			const label = nodes.find((n) => n.id === maxBetId)?.label ?? maxBetId;
			questions.push(`What disconnects if "${label}" is removed? (highest betweenness)`);
		}
	}

	return { questions, maxDegId, maxDeg };
}

/** Coverage and density questions */
function coverageQuestions(
	nodes: GraphNode[],
	edges: GraphEdge[],
	degrees: Map<string, number>,
): { questions: string[]; orphanCount: number } {
	const questions: string[] = [];

	const orphanCount = nodes.filter((n) => (degrees.get(n.id) ?? 0) === 0).length;
	if (orphanCount > 3) {
		questions.push(`${orphanCount} orphan nodes — should they be linked?`);
	}

	const taggedCount = nodes.filter((n) => n.tags && n.tags.length > 0).length;
	const untaggedPct = nodes.length > 0 ? ((nodes.length - taggedCount) / nodes.length) * 100 : 0;
	if (untaggedPct > 30) {
		questions.push(`${untaggedPct.toFixed(0)}% of nodes are untagged — consider adding tags?`);
	}

	const density = nodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0;
	if (density < 0.01 && nodes.length > 10) {
		questions.push(`Graph density is very low (${density.toFixed(4)}) — are relations missing?`);
	}

	return { questions, orphanCount };
}

/** Build adjacency map and count connected components */
function componentQuestions(
	nodes: GraphNode[],
	edges: GraphEdge[],
): { questions: string[]; adj: Map<string, Set<string>> } {
	const questions: string[] = [];
	const adj = new Map<string, Set<string>>();
	for (const n of nodes) adj.set(n.id, new Set());
	for (const e of edges) {
		adj.get(e.source)?.add(e.target);
		adj.get(e.target)?.add(e.source);
	}
	const visited = new Set<string>();
	let componentCount = 0;
	for (const n of nodes) {
		if (visited.has(n.id)) continue;
		componentCount++;
		const queue = [n.id];
		while (queue.length > 0) {
			const cur = queue.pop()!;
			if (visited.has(cur)) continue;
			visited.add(cur);
			for (const nb of adj.get(cur) ?? []) {
				if (!visited.has(nb)) queue.push(nb);
			}
		}
	}
	if (componentCount > 1) {
		questions.push(`Graph has ${componentCount} disconnected components — what bridges are missing?`);
	}
	return { questions, adj };
}

/** Tag diversity question */
function tagDiversityQuestion(nodes: GraphNode[]): string | null {
	const tagFreq = new Map<string, number>();
	for (const n of nodes) {
		for (const t of n.tags ?? []) {
			incCounter(tagFreq, t);
		}
	}
	if (tagFreq.size === 0) return null;

	const [topTag, topTagCount] = findMaxEntry(tagFreq);
	const tagDominance = topTagCount / nodes.length;
	if (tagDominance > 0.5 && tagFreq.size < 5) {
		return `Tag "${topTag}" covers ${(tagDominance * 100).toFixed(0)}% of nodes — should it be split into sub-tags?`;
	}
	return null;
}

export function generateStructureQuestions(
	nodes: GraphNode[],
	edges: GraphEdge[],
	degrees: Map<string, number>,
	betweenness?: Map<string, number>,
): string[] {
	if (nodes.length === 0) return [];

	const hub = hubQuestions(nodes, degrees, betweenness);
	const cov = coverageQuestions(nodes, edges, degrees);
	const comp = componentQuestions(nodes, edges);

	const questions = [...hub.questions, ...cov.questions, ...comp.questions];

	// Resilience: what if the top hub is removed?
	if (hub.maxDegId && hub.maxDeg > 5) {
		const hubNeighbors = comp.adj.get(hub.maxDegId);
		if (hubNeighbors && hubNeighbors.size > 0) {
			const hubLabel = nodes.find((n) => n.id === hub.maxDegId)?.label ?? hub.maxDegId;
			questions.push(`If "${hubLabel}" were removed, would ${hubNeighbors.size} neighbors stay connected?`);
		}
	}

	// Opportunity: high orphan rate suggests linking potential
	const orphanRate = nodes.length > 0 ? cov.orphanCount / nodes.length : 0;
	if (orphanRate > 0.3 && cov.orphanCount > 5) {
		questions.push(
			`${(orphanRate * 100).toFixed(0)}% orphan rate — could metadata fields reveal hidden connections?`,
		);
	}

	// Tag diversity
	const tagQ = tagDiversityQuestion(nodes);
	if (tagQ) questions.push(tagQ);

	return questions;
}

// ---------------------------------------------------------------------------
// Similar Node Suggestions (Feature M3 — Jaccard similarity)
// ---------------------------------------------------------------------------

export interface SimilarNode {
	id: string;
	label: string;
	score: number;
}

/** Build a feature set of prefixed tags + neighbors for a node. */
function buildFeatureSet(node: GraphNode, neighbors: string[]): Set<string> {
	const features = new Set<string>();
	for (const tag of node.tags ?? []) features.add(`tag:${tag}`);
	for (const nb of neighbors) features.add(`nb:${nb}`);
	return features;
}

/** Jaccard similarity = |A ∩ B| / |A ∪ B|. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
	let intersection = 0;
	for (const f of a) {
		if (b.has(f)) intersection++;
	}
	const union = a.size + b.size - intersection;
	return union > 0 ? intersection / union : 0;
}

/**
 * Find similar nodes to the given node based on Jaccard similarity
 * of (tags ∪ neighbors).
 */
export function computeSimilarNodes(
	nodeId: string,
	nodes: GraphNode[],
	edges: GraphEdge[],
	topN = 3,
	threshold = 0.15,
): SimilarNode[] {
	const adj = buildAdjFromEdges(nodes, edges);

	const targetNode = nodes.find((n) => n.id === nodeId);
	if (!targetNode) return [];
	const targetFeatures = buildFeatureSet(targetNode, adj.get(nodeId) ?? []);
	if (targetFeatures.size === 0) return [];

	const linked = new Set(adj.get(nodeId) ?? []);

	const results: SimilarNode[] = [];
	for (const n of nodes) {
		if (n.id === nodeId || linked.has(n.id)) continue;

		const nFeatures = buildFeatureSet(n, adj.get(n.id) ?? []);
		if (nFeatures.size === 0) continue;

		const score = jaccardSimilarity(targetFeatures, nFeatures);
		if (score >= threshold) {
			results.push({ id: n.id, label: n.label, score });
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, topN);
}

export function computePropagatedImportance(nodes: GraphNode[], edges: GraphEdge[], decay = 0.5): Map<string, number> {
	const inDeg = new Map<string, number>();
	for (const n of nodes) inDeg.set(n.id, 0);
	for (const e of edges) {
		incCounter(inDeg, e.target);
	}

	const outgoing = new Map<string, string[]>();
	for (const n of nodes) outgoing.set(n.id, []);
	for (const e of edges) {
		outgoing.get(e.source)?.push(e.target);
	}

	const importance = new Map<string, number>();
	for (const n of nodes) {
		importance.set(n.id, inDeg.get(n.id) ?? 0);
	}

	for (let iter = 0; iter < 3; iter++) {
		let changed = false;
		for (const n of nodes) {
			const targets = outgoing.get(n.id) ?? [];
			if (targets.length === 0) continue;
			const childSum = targets.reduce((sum, tid) => sum + (importance.get(tid) ?? 0), 0);
			const newVal = (inDeg.get(n.id) ?? 0) + decay * childSum;
			const oldVal = importance.get(n.id) ?? 0;
			if (Math.abs(newVal - oldVal) > 0.001) {
				importance.set(n.id, newVal);
				changed = true;
			}
		}
		if (!changed) break;
	}

	return importance;
}
