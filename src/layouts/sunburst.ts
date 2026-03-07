import type { SunburstData } from "../types";

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
