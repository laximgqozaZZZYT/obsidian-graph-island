import type { GraphData, GraphNode, SunburstData } from "../types";

export interface SunburstArc {
  name: string;
  depth: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  value: number;
  filePath?: string;
}

/** Result of applying a sunburst layout: positioned nodes/edges plus arc metadata for rendering */
export interface SunburstLayoutResult {
  data: GraphData;
  arcs: SunburstArc[];
  cx: number;
  cy: number;
}

export interface SunburstLayoutOptions {
  centerX?: number;
  centerY?: number;
  width: number;
  height: number;
  groupField: string;
  /** Sort comparator for consistent node ordering */
  sortComparator?: (a: GraphNode, b: GraphNode) => number;
}

/**
 * Apply a sunburst layout to graph nodes.
 * Groups nodes by their category/groupField and positions them radially.
 * Returns the positioned data plus arc metadata for PIXI rendering.
 */
export function applySunburstLayout(
  gd: GraphData,
  root: SunburstData,
  opts: SunburstLayoutOptions,
): SunburstLayoutResult {
  const cx = opts.centerX ?? opts.width / 2;
  const cy = opts.centerY ?? opts.height / 2;
  const radius = Math.min(opts.width, opts.height) / 2 * 0.85;

  const arcs = computeSunburstArcs(root, opts.width, opts.height);

  // Build a map from filePath to arc info for positioning nodes
  const fileArcMap = new Map<string, SunburstArc>();
  for (const arc of arcs) {
    if (arc.filePath) {
      fileArcMap.set(arc.filePath, arc);
    }
  }

  // Position each node at the centroid of its arc
  const nodes = gd.nodes.map(n => {
    const arc = n.filePath ? fileArcMap.get(n.filePath) : undefined;
    if (arc && arc.depth > 0) {
      const midAngle = (arc.x0 + arc.x1) / 2;
      const midRadius = (arc.y0 + arc.y1) / 2;
      return {
        ...n,
        x: cx + midRadius * Math.cos(midAngle - Math.PI / 2),
        y: cy + midRadius * Math.sin(midAngle - Math.PI / 2),
      };
    }
    // Nodes without an arc (not in vault files) go to center
    return { ...n, x: cx, y: cy };
  });

  return {
    data: { nodes, edges: gd.edges },
    arcs,
    cx,
    cy,
  };
}

export function computeSunburstArcs(
  root: SunburstData,
  width: number,
  height: number
): SunburstArc[] {
  const radius = Math.min(width, height) / 2;
  const arcs: SunburstArc[] = [];

  assignValues(root);

  const totalValue = root.value ?? 1;

  function traverse(
    node: SunburstData,
    depth: number,
    startAngle: number,
    endAngle: number
  ) {
    const arc: SunburstArc = {
      name: node.name,
      depth,
      x0: startAngle,
      x1: endAngle,
      y0: (depth * radius) / maxDepth(root),
      y1: ((depth + 1) * radius) / maxDepth(root),
      value: node.value ?? 0,
      filePath: node.filePath,
    };
    arcs.push(arc);

    if (!node.children || node.children.length === 0) return;

    let currentAngle = startAngle;
    const span = endAngle - startAngle;

    for (const child of node.children) {
      const childValue = child.value ?? 0;
      const childSpan = totalValue > 0 ? (childValue / totalValue) * (2 * Math.PI) : 0;
      const childEnd = currentAngle + (childValue / (node.value ?? 1)) * span;
      traverse(child, depth + 1, currentAngle, childEnd);
      currentAngle = childEnd;
    }
  }

  traverse(root, 0, 0, 2 * Math.PI);
  return arcs;
}

function assignValues(node: SunburstData): number {
  if (!node.children || node.children.length === 0) {
    node.value = node.value ?? 1;
    return node.value;
  }
  let sum = 0;
  for (const child of node.children) {
    sum += assignValues(child);
  }
  node.value = sum;
  return sum;
}

function maxDepth(node: SunburstData, current = 0): number {
  if (!node.children || node.children.length === 0) return current + 1;
  let max = current + 1;
  for (const child of node.children) {
    max = Math.max(max, maxDepth(child, current + 1));
  }
  return max;
}
