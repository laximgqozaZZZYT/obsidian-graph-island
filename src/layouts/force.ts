import type { GraphData, ForceLayoutOptions, GraphNode } from "../types";

export function applyForceDirectedLayout(
  graph: GraphData,
  options?: ForceLayoutOptions
): GraphData {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: graph.edges };
  }

  const {
    iterations = 50,
    repulsionStrength = 200,
    attractionStrength = 0.01,
    damping = 0.9,
    idealEdgeLength = 150,
    gravity = 0,
    centerX = 0,
    centerY = 0,
  } = options ?? {};

  const nodes: GraphNode[] = graph.nodes.map((n) => ({ ...n }));
  const edges = graph.edges;

  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    nodeIndex.set(nodes[i].id, i);
  }

  for (let iter = 0; iter < iterations; iter++) {
    for (const node of nodes) {
      node.vx = 0;
      node.vy = 0;
    }

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;

        const force = repulsionStrength / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction along edges
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

    // Center gravity
    if (gravity > 0) {
      for (const node of nodes) {
        node.vx += (centerX - node.x) * gravity;
        node.vy += (centerY - node.y) * gravity;
      }
    }

    // Apply velocity
    for (const node of nodes) {
      node.x += node.vx * damping;
      node.y += node.vy * damping;
    }
  }

  return { nodes, edges };
}
