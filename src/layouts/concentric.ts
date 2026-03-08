import type { GraphData, GraphNode, ConcentricLayoutOptions, ConcentricLayoutResult, ShellInfo } from "../types";
import { computeNodeDegrees, computeInDegree } from "../analysis/graph-analysis";

export function applyConcentricLayout(
  graph: GraphData,
  options?: ConcentricLayoutOptions
): ConcentricLayoutResult {
  if (graph.nodes.length === 0) {
    return { data: { nodes: [], edges: graph.edges }, shells: [] };
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

  const shellNodes: GraphNode[][] = [];
  let currentShell: GraphNode[] = [];
  let shellCapacity = 1;

  for (const node of nodes) {
    currentShell.push(node);
    if (currentShell.length >= shellCapacity) {
      shellNodes.push(currentShell);
      currentShell = [];
      shellCapacity = Math.floor(shellCapacity * 2.5);
    }
  }
  if (currentShell.length > 0) shellNodes.push(currentShell);

  const shells: ShellInfo[] = [];

  shellNodes.forEach((shell, i) => {
    const radius = i === 0 && shell.length === 1 ? 0 : minRadius + i * radiusStep;
    const angleStep = (2 * Math.PI) / shell.length;

    shell.forEach((node, j) => {
      const angle = j * angleStep - Math.PI / 2;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });

    shells.push({
      radius,
      nodeIds: shell.map((n) => n.id),
      centerX,
      centerY,
      angleOffset: 0,
      rotationSpeed: 0.08,
      rotationDirection: i % 2 === 0 ? 1 : -1,
    });
  });

  return { data: { nodes, edges: graph.edges }, shells };
}

/**
 * Reposition nodes in a shell after rotation or radius change.
 */
export function repositionShell(
  shell: ShellInfo,
  nodes: Map<string, GraphNode>
): void {
  const count = shell.nodeIds.length;
  if (count === 0) return;
  const angleStep = (2 * Math.PI) / count;

  shell.nodeIds.forEach((id, j) => {
    const node = nodes.get(id);
    if (!node) return;
    const angle = j * angleStep - Math.PI / 2 + shell.angleOffset;
    node.x = shell.centerX + shell.radius * Math.cos(angle);
    node.y = shell.centerY + shell.radius * Math.sin(angle);
  });
}
