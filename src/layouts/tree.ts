import type { GraphData, TreeLayoutOptions } from "../types";
import { computeInDegree } from "../analysis/graph-analysis";
import { EDGE_TYPE_INHERITANCE, EDGE_TYPE_AGGREGATION } from "../constants";
import { pushToMapArray } from "../utils/map-helpers";

// ---------------------------------------------------------------------------
// Constants — default layout parameters
// ---------------------------------------------------------------------------

/** Default vertical spacing between tree levels (px) */
const DEFAULT_LEVEL_HEIGHT = 80;
/** Default horizontal spacing per node (px) */
const DEFAULT_NODE_WIDTH = 60;
/** Default extra spacing when grouping by category (px) */
const DEFAULT_CATEGORY_GAP = 40;
/** Default vertical gap between separate trees (px) */
const DEFAULT_TREE_GAP = 80;
/** Minimum fan-out per node (controls tree depth vs breadth) */
const MIN_FANOUT = 3;

export function applyTreeLayout(graph: GraphData, options?: TreeLayoutOptions): GraphData {
	if (graph.nodes.length === 0) {
		return { nodes: [], edges: graph.edges };
	}

	const {
		startX = 0,
		startY = 0,
		levelHeight = DEFAULT_LEVEL_HEIGHT,
		nodeWidth = DEFAULT_NODE_WIDTH,
		groupByCategory = false,
		categoryGap = DEFAULT_CATEGORY_GAP,
		treeGap = DEFAULT_TREE_GAP,
	} = options ?? {};

	const nodesMap = new Map(graph.nodes.map((n) => [n.id, { ...n }]));
	const { undirected, directed, structuralChildren } = _buildTreeAdjacency(graph);
	const components = _findConnectedComponents(graph.nodes, undirected);
	const inDegrees = computeInDegree(graph.nodes, graph.edges);

	const treeResults = components.map((comp) => {
		return _layoutTreeComponent(comp, options, undirected, directed, structuralChildren, inDegrees);
	});

	let offsetY = startY;
	for (const tr of treeResults) {
		_positionTreeLevels(
			tr,
			startX,
			offsetY,
			levelHeight,
			nodeWidth,
			groupByCategory,
			categoryGap,
			nodesMap,
			options,
		);
		offsetY += (tr.maxLevel + 1) * levelHeight + treeGap;
	}

	return { nodes: Array.from(nodesMap.values()), edges: graph.edges };
}

/** Build undirected, directed, and structural-children adjacency maps */
function _buildTreeAdjacency(graph: GraphData) {
	const undirected = new Map<string, Set<string>>();
	const directed = new Map<string, string[]>();
	const structuralChildren = new Map<string, string[]>();

	for (const n of graph.nodes) {
		undirected.set(n.id, new Set());
	}

	const sortedEdges = [...graph.edges].sort((a, b) => {
		const aS = a.type === EDGE_TYPE_INHERITANCE || a.type === EDGE_TYPE_AGGREGATION ? 0 : 1;
		const bS = b.type === EDGE_TYPE_INHERITANCE || b.type === EDGE_TYPE_AGGREGATION ? 0 : 1;
		return aS - bS;
	});

	for (const e of sortedEdges) {
		undirected.get(e.source)?.add(e.target);
		undirected.get(e.target)?.add(e.source);
		pushToMapArray(directed, e.source, e.target);

		if (e.type === EDGE_TYPE_INHERITANCE) {
			pushToMapArray(structuralChildren, e.target, e.source);
		} else if (e.type === EDGE_TYPE_AGGREGATION) {
			pushToMapArray(structuralChildren, e.source, e.target);
		}
	}

	return { undirected, directed, structuralChildren };
}

/** Find connected components via BFS */
function _findConnectedComponents(nodes: GraphData["nodes"], undirected: Map<string, Set<string>>): string[][] {
	const componentOf = new Map<string, number>();
	const components: string[][] = [];
	let compIdx = 0;

	for (const n of nodes) {
		if (componentOf.has(n.id)) continue;
		const comp: string[] = [];
		const q = [n.id];
		let qi = 0;
		componentOf.set(n.id, compIdx);
		while (qi < q.length) {
			const cur = q[qi++];
			comp.push(cur);
			for (const nb of undirected.get(cur) ?? []) {
				if (!componentOf.has(nb)) {
					componentOf.set(nb, compIdx);
					q.push(nb);
				}
			}
		}
		components.push(comp);
		compIdx++;
	}
	components.sort((a, b) => b.length - a.length);
	return components;
}

/** Pick the best root for a component */
function _pickTreeRoot(
	nodeIds: string[],
	nodeSet: Set<string>,
	options: TreeLayoutOptions | undefined,
	structuralChildren: Map<string, string[]>,
	directed: Map<string, string[]>,
	inDegrees: Map<string, number>,
): string {
	if (options?.rootId && nodeSet.has(options.rootId)) return options.rootId;

	const isChild = new Set<string>();
	for (const id of nodeIds) {
		const children = structuralChildren.get(id);
		if (children) {
			for (const c of children) isChild.add(c);
		}
	}
	const structuralRoots = nodeIds.filter((id) => (structuralChildren.get(id)?.length ?? 0) > 0 && !isChild.has(id));
	if (structuralRoots.length > 0) {
		structuralRoots.sort(
			(a, b) => (structuralChildren.get(b)?.length || 0) - (structuralChildren.get(a)?.length || 0),
		);
		return structuralRoots[0];
	}

	const candidates = nodeIds.filter((id) => (inDegrees.get(id) || 0) === 0);
	if (candidates.length > 0) {
		candidates.sort((a, b) => (directed.get(b)?.length || 0) - (directed.get(a)?.length || 0));
		return candidates[0];
	}

	const sorted = [...nodeIds].sort((a, b) => (directed.get(b)?.length || 0) - (directed.get(a)?.length || 0));
	return sorted[0];
}

/** BFS tree layout for a single connected component */
function _layoutTreeComponent(
	nodeIds: string[],
	options: TreeLayoutOptions | undefined,
	undirected: Map<string, Set<string>>,
	directed: Map<string, string[]>,
	structuralChildren: Map<string, string[]>,
	inDegrees: Map<string, number>,
) {
	const nodeSet = new Set(nodeIds);
	const rootId = _pickTreeRoot(nodeIds, nodeSet, options, structuralChildren, directed, inDegrees);
	const maxFanOut = Math.max(MIN_FANOUT, Math.ceil(Math.pow(nodeIds.length, 0.25)));

	const levels = new Map<string, number>();
	const visited = new Set<string>();
	const queue: { id: string; level: number }[] = [{ id: rootId, level: 0 }];
	let qIdx = 0;
	visited.add(rootId);
	levels.set(rootId, 0);
	const unvisited = new Set(nodeIds);
	unvisited.delete(rootId);
	const childCount = new Map<string, number>();

	while (qIdx < queue.length || unvisited.size > 0) {
		if (qIdx >= queue.length && unvisited.size > 0) {
			const { bestId, bestLevel } = _pickClosestUnvisited(unvisited, undirected, visited, levels);
			queue.push({ id: bestId, level: bestLevel + 1 });
			visited.add(bestId);
			unvisited.delete(bestId);
			levels.set(bestId, bestLevel + 1);
		}

		const item = queue[qIdx++];
		if (!item) continue;
		const { id, level } = item;
		const currentFanOut = childCount.get(id) ?? 0;
		const remaining = maxFanOut - currentFanOut;
		if (remaining <= 0) continue;

		const directedChildren = (directed.get(id) || []).filter((c) => !visited.has(c) && nodeSet.has(c));
		const undirectedNeighbors = [...(undirected.get(id) ?? [])].filter(
			(c) => !visited.has(c) && nodeSet.has(c) && !directedChildren.includes(c),
		);
		const candidates = [...directedChildren, ...undirectedNeighbors].slice(0, remaining);

		childCount.set(id, currentFanOut + candidates.length);
		for (const childId of candidates) {
			visited.add(childId);
			unvisited.delete(childId);
			levels.set(childId, level + 1);
			queue.push({ id: childId, level: level + 1 });
		}
	}

	const levelsArr: string[][] = [];
	let maxLevel = 0;
	for (const [, lvl] of levels) {
		if (lvl > maxLevel) maxLevel = lvl;
		if (!levelsArr[lvl]) levelsArr[lvl] = [];
	}
	for (const [id, lvl] of levels) {
		levelsArr[lvl].push(id);
	}

	return { levels: levelsArr, maxLevel };
}

/** Pick the unvisited node closest (by edges) to already-visited nodes */
function _pickClosestUnvisited(
	unvisited: Set<string>,
	undirected: Map<string, Set<string>>,
	visited: Set<string>,
	levels: Map<string, number>,
): { bestId: string; bestLevel: number } {
	let bestId: string | undefined;
	let bestLevel = 0;
	for (const uid of unvisited) {
		const neighbors = undirected.get(uid) ?? new Set<string>();
		for (const nb of neighbors) {
			if (visited.has(nb)) {
				const parentLvl = levels.get(nb) ?? 0;
				if (!bestId || parentLvl < bestLevel) {
					bestId = uid;
					bestLevel = parentLvl;
				}
				break;
			}
		}
	}
	if (!bestId) bestId = unvisited.values().next().value!;
	return { bestId, bestLevel };
}

/** Position nodes for each level of a tree result */
function _positionTreeLevels(
	tr: { levels: string[][]; maxLevel: number },
	treeCenterX: number,
	offsetY: number,
	levelHeight: number,
	nodeWidth: number,
	groupByCategory: boolean,
	categoryGap: number,
	nodesMap: Map<string, GraphData["nodes"][0]>,
	options?: TreeLayoutOptions,
) {
	for (let lvl = 0; lvl <= tr.maxLevel; lvl++) {
		const levelNodes = tr.levels[lvl];
		if (!levelNodes) continue;

		if (options?.sortComparator) {
			const cmp = options.sortComparator;
			levelNodes.sort((a, b) => {
				const na = nodesMap.get(a);
				const nb = nodesMap.get(b);
				if (!na || !nb) return 0;
				return cmp(na, nb);
			});
		}

		if (groupByCategory) {
			_positionLevelByCategory(
				levelNodes,
				treeCenterX,
				offsetY,
				lvl,
				levelHeight,
				nodeWidth,
				categoryGap,
				nodesMap,
			);
		} else {
			_positionLevelUniform(
				levelNodes,
				treeCenterX,
				offsetY,
				lvl,
				levelHeight,
				nodeWidth,
				nodesMap,
				options?.nodeSpacingMap,
			);
		}
	}
}

/** Position level nodes with category-based gaps */
function _positionLevelByCategory(
	levelNodes: string[],
	treeCenterX: number,
	offsetY: number,
	lvl: number,
	levelHeight: number,
	nodeWidth: number,
	categoryGap: number,
	nodesMap: Map<string, GraphData["nodes"][0]>,
) {
	levelNodes.sort((a, b) => {
		const catA = nodesMap.get(a)?.category || "";
		const catB = nodesMap.get(b)?.category || "";
		return catA.localeCompare(catB);
	});

	let numGaps = 0;
	for (let i = 1; i < levelNodes.length; i++) {
		const prevCat = nodesMap.get(levelNodes[i - 1])?.category || "";
		const curCat = nodesMap.get(levelNodes[i])?.category || "";
		if (curCat !== prevCat) numGaps++;
	}

	const levelW = levelNodes.length * nodeWidth + numGaps * categoryGap;
	let cx = treeCenterX - levelW / 2;

	levelNodes.forEach((nodeId, i) => {
		if (i > 0) {
			const prevCat = nodesMap.get(levelNodes[i - 1])?.category || "";
			const curCat = nodesMap.get(nodeId)?.category || "";
			if (curCat !== prevCat) cx += categoryGap;
		}
		const node = nodesMap.get(nodeId)!;
		node.x = cx + nodeWidth / 2;
		node.y = offsetY + lvl * levelHeight;
		cx += nodeWidth;
	});
}

/** Position level nodes with uniform or per-node spacing */
function _positionLevelUniform(
	levelNodes: string[],
	treeCenterX: number,
	offsetY: number,
	lvl: number,
	levelHeight: number,
	nodeWidth: number,
	nodesMap: Map<string, GraphData["nodes"][0]>,
	nsMap?: Map<string, number>,
) {
	const widths = levelNodes.map((id) => nodeWidth * (nsMap?.get(id) ?? 1.0));
	const levelW = widths.reduce((s, w) => s + w, 0);
	let cx = treeCenterX - levelW / 2;
	levelNodes.forEach((nodeId, ni) => {
		const node = nodesMap.get(nodeId)!;
		node.x = cx + widths[ni] / 2;
		node.y = offsetY + lvl * levelHeight;
		cx += widths[ni];
	});
}
