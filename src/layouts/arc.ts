import type { GraphData, GraphNode, ArcLayoutOptions } from "../types";
import { computeNodeDegrees } from "../analysis/graph-analysis";

/**
 * Arc diagram — nodes spread horizontally with arcing edges.
 *
 * For left-right symmetry:
 * 1. Sort by degree descending
 * 2. Place highest-degree node at horizontal center
 * 3. Alternate remaining nodes left/right of center
 * 4. Y position uses a smooth bell curve based on array position,
 *    so the visual shape is always a symmetric arch regardless of
 *    the actual degree distribution.
 */
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
  const degrees = computeNodeDegrees(nodes, graph.edges);

  // Sort by custom comparator or fallback to sortBy option
  if (options?.sortComparator) {
    nodes.sort(options.sortComparator);
  } else if (sortBy === "degree") {
    nodes.sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
  } else if (sortBy === "category") {
    nodes.sort((a, b) => (a.category || "").localeCompare(b.category || ""));
  } else {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
  }

  // Rearrange for left-right symmetry
  const symmetric = symmetricArrange(nodes);

  const n = symmetric.length;
  // Ensure minimum spacing so nodes don't overlap, then let autoFitView scale
  const minSpacing = 6;
  const width = Math.max(radius * 2, n * minSpacing);
  const height = width * 0.4;
  const xStep = width / Math.max(n - 1, 1);
  const startX = centerX - width / 2;
  const mid = (n - 1) / 2;

  symmetric.forEach((node, i) => {
    node.x = startX + i * xStep;
    // Bell curve: y based on distance from center of array
    // Nodes near center are high (low y), edges are low (high y)
    const distFromCenter = Math.abs(i - mid) / Math.max(mid, 1);
    // Smooth cosine curve: 1 at center, 0 at edges
    const curve = (1 + Math.cos(distFromCenter * Math.PI)) / 2;
    node.y = centerY + height / 2 - curve * height;
  });

  return { nodes: symmetric, edges: graph.edges };
}

/**
 * Place the most important elements at the center and pair remaining
 * elements symmetrically outward.
 *
 * - Odd count:  single center node + pairs at equal distances
 * - Even count: center pair + pairs at equal distances
 *
 * This ensures left and right halves always have equal node counts,
 * and each mirror-pair consists of adjacent items in the sorted input.
 */
function symmetricArrange<T>(sorted: T[]): T[] {
  if (sorted.length <= 1) return [...sorted];

  const n = sorted.length;
  const result = new Array<T>(n);

  if (n % 2 === 1) {
    const mid = Math.floor(n / 2);
    result[mid] = sorted[0];
    for (let k = 0; k < mid; k++) {
      const si = 1 + k * 2;
      result[mid - 1 - k] = sorted[si];
      if (si + 1 < n) result[mid + 1 + k] = sorted[si + 1];
    }
  } else {
    const midL = n / 2 - 1;
    const midR = n / 2;
    result[midL] = sorted[0];
    result[midR] = sorted[1];
    for (let k = 0; k < midL; k++) {
      const si = 2 + k * 2;
      result[midL - 1 - k] = sorted[si];
      if (si + 1 < n) result[midR + 1 + k] = sorted[si + 1];
    }
  }

  return result;
}
