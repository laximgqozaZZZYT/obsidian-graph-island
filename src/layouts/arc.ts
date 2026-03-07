import type { GraphData, GraphNode, ArcLayoutOptions } from "../types";
import { computeNodeDegrees } from "../analysis/graph-analysis";

export function applyArcLayout(
  graph: GraphData,
  options?: ArcLayoutOptions
): GraphData {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: graph.edges };
  }

  const {
    centerX = 0,
    centerY = 0,
    radius = 250,
    sortBy = "degree",
  } = options ?? {};

  const nodes: GraphNode[] = graph.nodes.map((n) => ({ ...n }));

  if (sortBy === "degree") {
    const degrees = computeNodeDegrees(nodes, graph.edges);
    nodes.sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
  } else if (sortBy === "category") {
    nodes.sort((a, b) => (a.category || "").localeCompare(b.category || ""));
  } else {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
  }

  const angleStep = (2 * Math.PI) / nodes.length;
  nodes.forEach((node, i) => {
    const angle = i * angleStep - Math.PI / 2;
    node.x = centerX + radius * Math.cos(angle);
    node.y = centerY + radius * Math.sin(angle);
  });

  return { nodes, edges: graph.edges };
}
