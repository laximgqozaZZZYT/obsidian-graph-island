import type { GraphData, GraphNode, TreeLayoutOptions } from "../types";
import { computeInDegree } from "../analysis/graph-analysis";

export function applyTreeLayout(
  graph: GraphData,
  options?: TreeLayoutOptions
): GraphData {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: graph.edges };
  }

  const {
    startX = 0,
    startY = 0,
    levelHeight = 80,
    nodeWidth = 60,
    groupByCategory = false,
    categoryGap = 40,
    treeGap = 80,
  } = options ?? {};

  const nodesMap = new Map(graph.nodes.map((n) => [n.id, { ...n }]));

  // Build adjacency — prioritize inheritance/aggregation edges for tree structure
  const undirected = new Map<string, Set<string>>();
  const directed = new Map<string, string[]>();
  // Track which edges are structural (inheritance/aggregation) for root selection
  const structuralChildren = new Map<string, string[]>();

  for (const n of graph.nodes) {
    undirected.set(n.id, new Set());
  }

  // Sort edges: inheritance/aggregation first so they define primary tree shape
  const sortedEdges = [...graph.edges].sort((a, b) => {
    const aStructural = a.type === "inheritance" || a.type === "aggregation" ? 0 : 1;
    const bStructural = b.type === "inheritance" || b.type === "aggregation" ? 0 : 1;
    return aStructural - bStructural;
  });

  for (const e of sortedEdges) {
    undirected.get(e.source)?.add(e.target);
    undirected.get(e.target)?.add(e.source);
    if (!directed.has(e.source)) directed.set(e.source, []);
    directed.get(e.source)!.push(e.target);

    if (e.type === "inheritance" || e.type === "aggregation") {
      // For inheritance: source extends target, so target is parent
      // For aggregation: source contains target, so source is parent
      if (e.type === "inheritance") {
        if (!structuralChildren.has(e.target)) structuralChildren.set(e.target, []);
        structuralChildren.get(e.target)!.push(e.source);
      } else {
        if (!structuralChildren.has(e.source)) structuralChildren.set(e.source, []);
        structuralChildren.get(e.source)!.push(e.target);
      }
    }
  }

  // Connected components
  const componentOf = new Map<string, number>();
  const components: string[][] = [];
  let compIdx = 0;

  for (const n of graph.nodes) {
    if (componentOf.has(n.id)) continue;
    const comp: string[] = [];
    const q = [n.id];
    componentOf.set(n.id, compIdx);
    while (q.length > 0) {
      const cur = q.shift()!;
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

  const inDegrees = computeInDegree(graph.nodes, graph.edges);

  function layoutComponent(nodeIds: string[]) {
    const nodeSet = new Set(nodeIds);

    let rootId: string | undefined;
    if (options?.rootId && nodeSet.has(options.rootId)) {
      rootId = options.rootId;
    }
    if (!rootId) {
      // Prefer nodes that are structural parents (inheritance targets / aggregation sources)
      const structuralRoots = nodeIds.filter(
        (id) => (structuralChildren.get(id)?.length ?? 0) > 0
          && !nodeIds.some((other) => structuralChildren.get(other)?.includes(id))
      );
      if (structuralRoots.length > 0) {
        structuralRoots.sort(
          (a, b) => (structuralChildren.get(b)?.length || 0) - (structuralChildren.get(a)?.length || 0)
        );
        rootId = structuralRoots[0];
      }
    }
    if (!rootId) {
      const candidates = nodeIds.filter((id) => (inDegrees.get(id) || 0) === 0);
      if (candidates.length > 0) {
        candidates.sort(
          (a, b) =>
            (directed.get(b)?.length || 0) - (directed.get(a)?.length || 0)
        );
        rootId = candidates[0];
      } else {
        const sorted = [...nodeIds].sort(
          (a, b) =>
            (directed.get(b)?.length || 0) - (directed.get(a)?.length || 0)
        );
        rootId = sorted[0];
      }
    }

    const levels = new Map<string, number>();
    const visited = new Set<string>();
    const queue: { id: string; level: number }[] = [
      { id: rootId!, level: 0 },
    ];
    visited.add(rootId!);
    levels.set(rootId!, 0);
    const unvisited = new Set(nodeIds);
    unvisited.delete(rootId!);

    while (queue.length > 0 || unvisited.size > 0) {
      if (queue.length === 0 && unvisited.size > 0) {
        const nextId = unvisited.values().next().value!;
        const parentLevel = 0;
        queue.push({ id: nextId, level: parentLevel + 1 });
        visited.add(nextId);
        unvisited.delete(nextId);
        levels.set(nextId, parentLevel + 1);
      }

      const item = queue.shift();
      if (!item) continue;
      const { id, level } = item;
      const children = directed.get(id) || [];
      for (const childId of children) {
        if (!visited.has(childId) && nodeSet.has(childId)) {
          visited.add(childId);
          unvisited.delete(childId);
          levels.set(childId, level + 1);
          queue.push({ id: childId, level: level + 1 });
        }
      }
    }

    const levelsArr: string[][] = [];
    let maxLevel = 0;
    for (const [id, lvl] of levels) {
      if (lvl > maxLevel) maxLevel = lvl;
      if (!levelsArr[lvl]) levelsArr[lvl] = [];
      levelsArr[lvl].push(id);
    }

    return { levels: levelsArr, maxLevel };
  }

  const treeResults = components.map((comp) => layoutComponent(comp));
  let offsetY = startY;

  for (const tr of treeResults) {
    const treeCenterX = startX;

    for (let lvl = 0; lvl <= tr.maxLevel; lvl++) {
      const levelNodes = tr.levels[lvl];
      if (!levelNodes) continue;

      if (groupByCategory) {
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

        const levelW =
          levelNodes.length * nodeWidth + numGaps * categoryGap;
        let cx = treeCenterX - levelW / 2;

        levelNodes.forEach((nodeId, i) => {
          if (i > 0) {
            const prevCat =
              nodesMap.get(levelNodes[i - 1])?.category || "";
            const curCat = nodesMap.get(nodeId)?.category || "";
            if (curCat !== prevCat) cx += categoryGap;
          }
          const node = nodesMap.get(nodeId)!;
          node.x = cx + nodeWidth / 2;
          node.y = offsetY + lvl * levelHeight;
          cx += nodeWidth;
        });
      } else {
        const levelW = levelNodes.length * nodeWidth;
        let cx = treeCenterX - levelW / 2;
        levelNodes.forEach((nodeId) => {
          const node = nodesMap.get(nodeId)!;
          node.x = cx + nodeWidth / 2;
          node.y = offsetY + lvl * levelHeight;
          cx += nodeWidth;
        });
      }
    }

    const treeHeight = (tr.maxLevel + 1) * levelHeight;
    offsetY += treeHeight + treeGap;
  }

  return { nodes: Array.from(nodesMap.values()), edges: graph.edges };
}
