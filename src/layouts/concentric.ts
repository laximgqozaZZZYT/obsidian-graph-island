import type { GraphData, GraphNode, ConcentricLayoutOptions } from "../types";
import { computeNodeDegrees, computeInDegree } from "../analysis/graph-analysis";

export function applyConcentricLayout(
  graph: GraphData,
  options?: ConcentricLayoutOptions
): GraphData {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: graph.edges };
  }

  const {
    centerX = 0,
    centerY = 0,
    minRadius = 50,
    radiusStep = 60,
    sortByInDegree = false,
  } = options ?? {};

  const nodes = graph.nodes.map((n) => ({ ...n }));
  const degrees = sortByInDegree
    ? computeInDegree(nodes, graph.edges)
    : computeNodeDegrees(nodes, graph.edges);

  nodes.sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));

  const shells: GraphNode[][] = [];
  let currentShell: GraphNode[] = [];
  let shellCapacity = 1;

  for (const node of nodes) {
    currentShell.push(node);
    if (currentShell.length >= shellCapacity) {
      shells.push(currentShell);
      currentShell = [];
      shellCapacity = Math.floor(shellCapacity * 2.5);
    }
  }
  if (currentShell.length > 0) shells.push(currentShell);

  shells.forEach((shell, i) => {
    const radius = i === 0 && shell.length === 1 ? 0 : minRadius + i * radiusStep;
    const angleStep = (2 * Math.PI) / shell.length;

    shell.forEach((node, j) => {
      const angle = j * angleStep - Math.PI / 2;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });
  });

  return { nodes, edges: graph.edges };
}
