import type { GraphData, ForceLayoutOptions, GraphNode, DirectionalGravityRule } from "../types";

/**
 * Async force layout. Computes layout without touching DOM.
 * Yields to the browser every batch so the UI stays responsive.
 * Reports progress via onProgress callback.
 */
export async function applyForceDirectedLayoutAsync(
  graph: GraphData,
  options: ForceLayoutOptions & {
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  }
): Promise<GraphData> {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: graph.edges };
  }

  const n = graph.nodes.length;

  // Adaptive parameters based on graph size
  const totalIterations = n > 2000 ? 8 : n > 1000 ? 12 : n > 500 ? 20 : 50;
  const batchSize = n > 1000 ? 1 : n > 500 ? 2 : 5;

  const {
    repulsionStrength = 200,
    attractionStrength = 0.01,
    damping = 0.9,
    idealEdgeLength = n > 1000 ? 80 : 150,
    gravity = 0,
    centerX = 0,
    centerY = 0,
  } = options ?? {};

  const nodes: GraphNode[] = graph.nodes.map((nd) => ({ ...nd }));
  const edges = graph.edges;

  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    nodeIndex.set(nodes[i].id, i);
  }

  // Use grid-based spatial hashing for O(n) approximate repulsion
  const useGrid = n > 300;
  const cellSize = idealEdgeLength * 2;

  for (let iter = 0; iter < totalIterations; iter++) {
    if (options.signal?.aborted) break;

    // Reset velocities
    for (let i = 0; i < n; i++) {
      nodes[i].vx = 0;
      nodes[i].vy = 0;
    }

    // --- Repulsion ---
    if (useGrid) {
      applyGridRepulsion(nodes, repulsionStrength, cellSize);
    } else {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          repulsePair(nodes[i], nodes[j], repulsionStrength);
        }
      }
    }

    // --- Attraction along edges ---
    for (const edge of edges) {
      const ai = nodeIndex.get(edge.source);
      const bi = nodeIndex.get(edge.target);
      if (ai === undefined || bi === undefined) continue;
      const a = nodes[ai];
      const b = nodes[bi];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const displacement = dist - idealEdgeLength;
      const force = attractionStrength * displacement;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // --- Center gravity ---
    if (gravity > 0) {
      for (let i = 0; i < n; i++) {
        nodes[i].vx += (centerX - nodes[i].x) * gravity;
        nodes[i].vy += (centerY - nodes[i].y) * gravity;
      }
    }

    // --- Directional gravity ---
    if (options.directionalGravity) {
      for (const rule of options.directionalGravity) {
        const dir = resolveDirection(rule.direction);
        const ddx = Math.cos(dir);
        const ddy = Math.sin(dir);
        const str = rule.strength ?? 0.1;
        for (let i = 0; i < n; i++) {
          if (!matchesFilter(nodes[i], rule.filter)) continue;
          nodes[i].vx += ddx * str * 100;
          nodes[i].vy += ddy * str * 100;
        }
      }
    }

    // --- Apply velocity ---
    for (let i = 0; i < n; i++) {
      nodes[i].x += nodes[i].vx * damping;
      nodes[i].y += nodes[i].vy * damping;
    }

    // Yield every batchSize iterations
    if (iter % batchSize === 0) {
      options.onProgress?.(Math.round(((iter + 1) / totalIterations) * 100));
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  options.onProgress?.(100);
  return { nodes, edges };
}

/**
 * Grid-based approximate repulsion — O(n) per iteration.
 * Only repels nodes within neighboring cells.
 */
function applyGridRepulsion(
  nodes: GraphNode[],
  strength: number,
  cellSize: number
) {
  const grid = new Map<string, number[]>();

  // Bin nodes into grid cells
  for (let i = 0; i < nodes.length; i++) {
    const cx = Math.floor(nodes[i].x / cellSize);
    const cy = Math.floor(nodes[i].y / cellSize);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(i);
  }

  // For each cell, repel against nodes in same + neighboring cells
  for (const [key, indices] of grid) {
    const [cx, cy] = key.split(",").map(Number);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborKey = `${cx + dx},${cy + dy}`;
        const neighbors = grid.get(neighborKey);
        if (!neighbors) continue;

        for (const i of indices) {
          for (const j of neighbors) {
            if (j <= i) continue;
            repulsePair(nodes[i], nodes[j], strength);
          }
        }
      }
    }
  }
}

function repulsePair(a: GraphNode, b: GraphNode, strength: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let dist = dx * dx + dy * dy;
  if (dist < 1) dist = 1;
  const distSqrt = Math.sqrt(dist);
  const force = strength / dist;
  const fx = (dx / distSqrt) * force;
  const fy = (dy / distSqrt) * force;
  a.vx -= fx;
  a.vy -= fy;
  b.vx += fx;
  b.vy += fy;
}

/**
 * Convert a direction preset or radian value to radians.
 */
export function resolveDirection(dir: DirectionalGravityRule["direction"]): number {
  if (typeof dir === "number") return dir;
  switch (dir) {
    case "top": return -Math.PI / 2;
    case "bottom": return Math.PI / 2;
    case "left": return Math.PI;
    case "right": return 0;
  }
}

/**
 * Check whether a node matches a directional gravity filter string.
 * Supported filters:
 *   "*"              - all nodes
 *   "tag:<name>"     - nodes with a specific tag
 *   "category:<name>"- nodes with a specific category
 *   "label:<substr>" - nodes whose label contains the substring
 *   "isTag"          - virtual tag nodes
 *   "<other>"        - treated as a tag name
 */
export function matchesFilter(node: GraphNode, filter: string): boolean {
  if (filter === "*") return true;
  if (filter.startsWith("tag:")) {
    const tag = filter.slice(4);
    return node.tags?.includes(tag) ?? false;
  }
  if (filter.startsWith("category:")) {
    return node.category === filter.slice(9);
  }
  if (filter.startsWith("label:")) {
    return node.label.includes(filter.slice(6));
  }
  if (filter === "isTag") return node.isTag === true;
  // Default: treat as tag
  return node.tags?.includes(filter) ?? false;
}
