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
 *
 * When the provided root hierarchy has poor coverage of graph nodes
 * (e.g. most nodes in "Uncategorized"), builds a fallback hierarchy
 * from graph nodes using category → folder as grouping levels.
 */
export function applySunburstLayout(
  gd: GraphData,
  root: SunburstData,
  opts: SunburstLayoutOptions,
): SunburstLayoutResult {
  const cx = opts.centerX ?? opts.width / 2;
  const cy = opts.centerY ?? opts.height / 2;

  // Check coverage: how many graph nodes match the provided root hierarchy?
  const rootFilePaths = collectFilePaths(root);
  const graphFilePaths = new Set(gd.nodes.map(n => n.filePath).filter(Boolean));
  let matched = 0;
  for (const fp of graphFilePaths) {
    if (fp && rootFilePaths.has(fp)) matched++;
  }

  // If less than 50% coverage or root has only 1 group ("Uncategorized"), use fallback
  const effectiveRoot = (matched < graphFilePaths.size * 0.5 || countDirectChildren(root) <= 1)
    ? buildSunburstFromGraphNodes(gd.nodes)
    : root;

  const arcs = computeSunburstArcs(effectiveRoot, opts.width, opts.height);

  // Build a map from filePath to arc info for positioning nodes
  const fileArcMap = new Map<string, SunburstArc>();
  for (const arc of arcs) {
    if (arc.filePath) {
      fileArcMap.set(arc.filePath, arc);
    }
  }

  // Position each node at the centroid of its arc
  const outerRadius = Math.min(opts.width, opts.height) / 2;
  let unmatchedIdx = 0;
  const unmatchedTotal = gd.nodes.filter(n => !n.filePath || !fileArcMap.has(n.filePath)).length;

  const nodes = gd.nodes.map(n => {
    const arc = n.filePath ? fileArcMap.get(n.filePath) : undefined;
    if (arc) {
      const midAngle = (arc.x0 + arc.x1) / 2;
      const midRadius = (arc.y0 + arc.y1) / 2;
      return {
        ...n,
        x: cx + midRadius * Math.cos(midAngle - Math.PI / 2),
        y: cy + midRadius * Math.sin(midAngle - Math.PI / 2),
      };
    }
    // Nodes without an arc — distribute evenly around the outermost ring
    const angle = unmatchedTotal > 0
      ? (unmatchedIdx++ / unmatchedTotal) * 2 * Math.PI
      : 0;
    return {
      ...n,
      x: cx + outerRadius * 0.95 * Math.cos(angle - Math.PI / 2),
      y: cy + outerRadius * 0.95 * Math.sin(angle - Math.PI / 2),
    };
  });

  return {
    data: { nodes, edges: gd.edges },
    arcs,
    cx,
    cy,
  };
}

/** Collect all filePaths from a SunburstData tree */
function collectFilePaths(node: SunburstData): Set<string> {
  const paths = new Set<string>();
  if (node.filePath) paths.add(node.filePath);
  if (node.children) {
    for (const child of node.children) {
      for (const fp of collectFilePaths(child)) paths.add(fp);
    }
  }
  return paths;
}

/** Count direct children of a SunburstData node */
function countDirectChildren(node: SunburstData): number {
  return node.children?.length ?? 0;
}

/**
 * Build a SunburstData hierarchy directly from graph nodes.
 * Uses a trie-based approach on file paths to create deep multi-level hierarchies.
 * Falls back to category + first-letter grouping when paths are flat.
 */
function buildSunburstFromGraphNodes(nodes: GraphNode[]): SunburstData {
  // Strategy: build a trie from file path segments for deep hierarchy
  interface TrieNode {
    name: string;
    children: Map<string, TrieNode>;
    leafNodes: GraphNode[];
  }

  const root: TrieNode = { name: "Graph", children: new Map(), leafNodes: [] };

  for (const n of nodes) {
    const pathParts = getGroupingPath(n);
    let current = root;
    for (const part of pathParts) {
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, children: new Map(), leafNodes: [] });
      }
      current = current.children.get(part)!;
    }
    current.leafNodes.push(n);
  }

  // Collapse trie nodes that have only 1 child (no branching)
  function collapseAndConvert(trie: TrieNode): SunburstData {
    const children: SunburstData[] = [];

    // Add sub-branches
    for (const [, child] of [...trie.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      // Skip single-child chains
      let effective = child;
      while (effective.children.size === 1 && effective.leafNodes.length === 0) {
        const [, only] = [...effective.children.entries()][0];
        effective = { ...only, name: `${effective.name}/${only.name}` };
      }
      children.push(collapseAndConvert(effective));
    }

    // Add leaf nodes
    for (const n of trie.leafNodes) {
      children.push({
        name: n.id.split("/").pop() || n.id,
        value: 1,
        filePath: n.filePath,
      });
    }

    if (children.length === 0) {
      return { name: trie.name, value: 1 };
    }
    return { name: trie.name, children };
  }

  return collapseAndConvert(root);
}

/**
 * Determine the grouping path for a node.
 * Uses: category (if present) → folder path segments → first letter fallback.
 */
function getGroupingPath(n: GraphNode): string[] {
  const parts: string[] = [];

  // Add category as first level if present
  if (n.category) {
    parts.push(n.category);
  }

  // Add folder path segments
  if (n.filePath) {
    const segments = n.filePath.split("/").slice(0, -1); // remove filename
    for (const seg of segments) {
      if (seg) parts.push(seg);
    }
  }

  // If no grouping info at all, use first letter of ID
  if (parts.length === 0) {
    const firstChar = (n.id.charAt(0) || "?").toUpperCase();
    parts.push(firstChar);
  }

  return parts;
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
