/**
 * Road Network — auto-generated road system from coordinate grid lines.
 *
 * Generates a graph of intersections and segments from the coordinate engine's
 * grid lines (circle, radial, line, curve). Edges are then routed along these
 * roads using Dijkstra shortest path.
 *
 * Coordinate system mapping:
 *   polar  → ring roads (circles) + radial avenues (spokes) = Paris-style
 *   cartesian → horizontal + vertical streets = Manhattan-style
 */
import type { GraphNode } from "../types";

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

export interface RoadIntersection {
  id: number;
  x: number;
  y: number;
}

export interface RoadSegment {
  from: number;
  to: number;
  /** Intermediate waypoints for curved segments (ring arcs) */
  waypoints: { x: number; y: number }[];
  length: number;
}

export interface RoadNetwork {
  intersections: RoadIntersection[];
  segments: RoadSegment[];
  /** Node ID → nearest intersection ID */
  nodeAccess: Map<string, number>;
  /** Adjacency list: intersection ID → neighbors */
  adjacency: Map<number, { to: number; weight: number; segIdx: number }[]>;
  /** Coordinate system that generated this network */
  system: "polar" | "cartesian";
  /** Center of the road network (world coordinates) */
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------------------
// Road network generation
// ---------------------------------------------------------------------------

export interface GridLineInput {
  position: number;
  label?: string;
}

export interface RoadNetworkConfig {
  system: "polar" | "cartesian";
  axis1Lines: GridLineInput[];  // r values (polar) or x values (cartesian)
  axis2Lines: GridLineInput[];  // θ values in radians (polar) or y values (cartesian)
  axis1Shape: string;           // "circle" | "radial" | "line" | "curve"
  axis2Shape: string;
  cx: number;
  cy: number;
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number };
  nodes: GraphNode[];
}

/** Generate a road network from coordinate grid lines. */
export function buildRoadNetwork(cfg: RoadNetworkConfig): RoadNetwork {
  const intersections: RoadIntersection[] = [];
  const segments: RoadSegment[] = [];
  let nextId = 0;

  // Grid of intersection IDs: [axis1Idx][axis2Idx] → intersection ID
  const grid: number[][] = [];

  if (cfg.system === "polar") {
    // Polar: axis1 = r (circles), axis2 = θ (radials)
    const rValues = cfg.axis1Lines.map(l => l.position).filter(r => r > 0).sort((a, b) => a - b);
    const thetaValues = cfg.axis2Lines.map(l => l.position).sort((a, b) => a - b);

    if (rValues.length === 0 || thetaValues.length === 0) {
      return emptyNetwork(cfg);
    }

    // Add center intersection (r=0)
    const centerId = nextId++;
    intersections.push({ id: centerId, x: cfg.cx, y: cfg.cy });

    // Generate intersections at each (r, θ)
    for (let ri = 0; ri < rValues.length; ri++) {
      grid[ri] = [];
      const r = rValues[ri];
      for (let ti = 0; ti < thetaValues.length; ti++) {
        const theta = thetaValues[ti];
        const id = nextId++;
        const x = cfg.cx + r * Math.cos(theta);
        const y = cfg.cy + r * Math.sin(theta);
        intersections.push({ id, x, y });
        grid[ri][ti] = id;
      }
    }

    // Ring road segments (along same r, between adjacent θ)
    for (let ri = 0; ri < rValues.length; ri++) {
      const r = rValues[ri];
      const n = thetaValues.length;
      for (let ti = 0; ti < n; ti++) {
        const nextTi = (ti + 1) % n;
        const fromId = grid[ri][ti];
        const toId = grid[ri][nextTi];
        const theta1 = thetaValues[ti];
        const theta2 = ti + 1 < n ? thetaValues[nextTi] : thetaValues[0] + Math.PI * 2;

        // Arc waypoints for smooth ring road
        const arcWaypoints = generateArcWaypoints(cfg.cx, cfg.cy, r, theta1, theta2, 8);
        const arcLen = arcLength(r, theta1, theta2);
        segments.push({ from: fromId, to: toId, waypoints: arcWaypoints, length: arcLen });
      }
    }

    // Radial segments (along same θ, between adjacent r)
    for (let ti = 0; ti < thetaValues.length; ti++) {
      // Center → first ring
      const firstRingId = grid[0][ti];
      const centerDist = rValues[0];
      segments.push({ from: centerId, to: firstRingId, waypoints: [], length: centerDist });

      // Between rings
      for (let ri = 0; ri < rValues.length - 1; ri++) {
        const fromId = grid[ri][ti];
        const toId = grid[ri + 1][ti];
        const dist = rValues[ri + 1] - rValues[ri];
        segments.push({ from: fromId, to: toId, waypoints: [], length: dist });
      }
    }
  } else {
    // Cartesian: axis1 = x (vertical lines), axis2 = y (horizontal lines)
    const xValues = cfg.axis1Lines.map(l => l.position).sort((a, b) => a - b);
    const yValues = cfg.axis2Lines.map(l => l.position).sort((a, b) => a - b);

    if (xValues.length === 0 || yValues.length === 0) {
      return emptyNetwork(cfg);
    }

    // Generate intersections at each (x, y)
    for (let xi = 0; xi < xValues.length; xi++) {
      grid[xi] = [];
      for (let yi = 0; yi < yValues.length; yi++) {
        const id = nextId++;
        intersections.push({ id, x: cfg.cx + xValues[xi], y: cfg.cy + yValues[yi] });
        grid[xi][yi] = id;
      }
    }

    // Horizontal segments (same y, between adjacent x)
    for (let yi = 0; yi < yValues.length; yi++) {
      for (let xi = 0; xi < xValues.length - 1; xi++) {
        const fromId = grid[xi][yi];
        const toId = grid[xi + 1][yi];
        const dist = xValues[xi + 1] - xValues[xi];
        segments.push({ from: fromId, to: toId, waypoints: [], length: dist });
      }
    }

    // Vertical segments (same x, between adjacent y)
    for (let xi = 0; xi < xValues.length; xi++) {
      for (let yi = 0; yi < yValues.length - 1; yi++) {
        const fromId = grid[xi][yi];
        const toId = grid[xi][yi + 1];
        const dist = yValues[yi + 1] - yValues[yi];
        segments.push({ from: fromId, to: toId, waypoints: [], length: dist });
      }
    }
  }

  // Build adjacency list (bidirectional)
  const adjacency = new Map<number, { to: number; weight: number; segIdx: number }[]>();
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (!adjacency.has(seg.from)) adjacency.set(seg.from, []);
    if (!adjacency.has(seg.to)) adjacency.set(seg.to, []);
    adjacency.get(seg.from)!.push({ to: seg.to, weight: seg.length, segIdx: si });
    adjacency.get(seg.to)!.push({ to: seg.from, weight: seg.length, segIdx: si });
  }

  // Improved: Map each node to nearest point ON a road segment
  const nodeAccess = new Map<string, number>();
  for (const node of cfg.nodes) {
    let bestId = 0;
    let bestDist = Infinity;  // squared distance
    let bestSegIdx = -1;
    let bestT = 0;

    // Check existing intersections
    for (const isect of intersections) {
      const dx = node.x - isect.x;
      const dy = node.y - isect.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestId = isect.id;
        bestSegIdx = -1;
      }
    }

    // For cartesian systems: also check mid-segment points
    if (cfg.system === "cartesian") {
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        if (seg.waypoints.length > 0) continue; // skip arc segments
        const fromIsect = intersections[seg.from];
        const toIsect = intersections[seg.to];
        if (!fromIsect || !toIsect) continue;

        const sdx = toIsect.x - fromIsect.x;
        const sdy = toIsect.y - fromIsect.y;
        const lenSq = sdx * sdx + sdy * sdy;
        if (lenSq === 0) continue;

        let t = ((node.x - fromIsect.x) * sdx + (node.y - fromIsect.y) * sdy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        // Skip if near endpoints — existing intersections handle those
        if (t <= 0.05 || t >= 0.95) continue;

        const projX = fromIsect.x + t * sdx;
        const projY = fromIsect.y + t * sdy;
        const d = (node.x - projX) ** 2 + (node.y - projY) ** 2;

        if (d < bestDist) {
          bestDist = d;
          bestSegIdx = si;
          bestT = t;
        }
      }
    }

    if (bestSegIdx >= 0) {
      // Split the segment and create new intersection
      const seg = segments[bestSegIdx];
      const fromIsect = intersections[seg.from];
      const toIsect = intersections[seg.to];
      const newX = fromIsect.x + bestT * (toIsect.x - fromIsect.x);
      const newY = fromIsect.y + bestT * (toIsect.y - fromIsect.y);
      const newId = intersections.length;
      intersections.push({ id: newId, x: newX, y: newY });

      const oldLen = seg.length;
      const len1 = oldLen * bestT;
      const len2 = oldLen * (1 - bestT);

      // Remove old adjacency entries for this segment
      const removeAdj = (from: number, to: number, si: number) => {
        const adj = adjacency.get(from);
        if (adj) {
          const idx = adj.findIndex(a => a.to === to && a.segIdx === si);
          if (idx >= 0) adj.splice(idx, 1);
        }
      };
      removeAdj(seg.from, seg.to, bestSegIdx);
      removeAdj(seg.to, seg.from, bestSegIdx);

      // Add new segments
      const si1 = segments.length;
      segments.push({ from: seg.from, to: newId, waypoints: [], length: len1 });
      const si2 = segments.length;
      segments.push({ from: newId, to: seg.to, waypoints: [], length: len2 });

      if (!adjacency.has(newId)) adjacency.set(newId, []);
      adjacency.get(seg.from)!.push({ to: newId, weight: len1, segIdx: si1 });
      adjacency.get(newId)!.push({ to: seg.from, weight: len1, segIdx: si1 });
      adjacency.get(newId)!.push({ to: seg.to, weight: len2, segIdx: si2 });
      adjacency.get(seg.to)!.push({ to: newId, weight: len2, segIdx: si2 });

      nodeAccess.set(node.id, newId);
    } else {
      nodeAccess.set(node.id, bestId);
    }
  }

  return { intersections, segments, nodeAccess, adjacency, system: cfg.system, cx: cfg.cx, cy: cfg.cy };
}

// ---------------------------------------------------------------------------
// Dijkstra shortest path
// ---------------------------------------------------------------------------

/** Find shortest path between two intersections. Returns intersection ID sequence. */
export function findShortestPath(network: RoadNetwork, startId: number, endId: number): number[] {
  if (startId === endId) return [startId];

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const visited = new Set<number>();

  // Simple priority queue (adequate for graph sizes < 10000 intersections)
  const queue: { id: number; d: number }[] = [];
  dist.set(startId, 0);
  queue.push({ id: startId, d: 0 });

  while (queue.length > 0) {
    // Extract min
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].d < queue[minIdx].d) minIdx = i;
    }
    const { id: u } = queue.splice(minIdx, 1)[0];

    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endId) break;

    const neighbors = network.adjacency.get(u);
    if (!neighbors) continue;

    const du = dist.get(u) ?? Infinity;
    for (const { to: v, weight } of neighbors) {
      if (visited.has(v)) continue;
      const newDist = du + weight;
      if (newDist < (dist.get(v) ?? Infinity)) {
        dist.set(v, newDist);
        prev.set(v, u);
        queue.push({ id: v, d: newDist });
      }
    }
  }

  // Reconstruct path
  if (!prev.has(endId) && startId !== endId) return [];
  const path: number[] = [];
  let cur = endId;
  while (cur !== startId) {
    path.unshift(cur);
    const p = prev.get(cur);
    if (p == null) return []; // no path
    cur = p;
  }
  path.unshift(startId);
  return path;
}

/** Convert intersection path to waypoint coordinates (including arc waypoints). */
export function pathToWaypoints(network: RoadNetwork, path: number[]): { x: number; y: number }[] {
  if (path.length === 0) return [];
  const pts: { x: number; y: number }[] = [];

  // Add first intersection
  const first = network.intersections[path[0]];
  if (first) pts.push({ x: first.x, y: first.y });

  for (let i = 0; i < path.length - 1; i++) {
    const fromId = path[i];
    const toId = path[i + 1];
    // Find segment
    const seg = network.segments.find(s =>
      (s.from === fromId && s.to === toId) || (s.from === toId && s.to === fromId)
    );
    if (seg) {
      // Add waypoints (reverse if segment direction is opposite)
      const wps = seg.from === fromId ? seg.waypoints : [...seg.waypoints].reverse();
      for (const wp of wps) {
        pts.push({ x: wp.x, y: wp.y });
      }
    }
    // Add destination intersection
    const dest = network.intersections[toId];
    if (dest) pts.push({ x: dest.x, y: dest.y });
  }

  return pts;
}

/** Route a single edge along the road network. Returns waypoints or empty if no route. */
export function routeEdge(
  network: RoadNetwork,
  sourceNodeId: string,
  targetNodeId: string,
): { x: number; y: number }[] {
  const startIsect = network.nodeAccess.get(sourceNodeId);
  const endIsect = network.nodeAccess.get(targetNodeId);
  if (startIsect == null || endIsect == null) return [];

  // Same intersection: route through a neighbor to create a visible road path
  if (startIsect === endIsect) {
    const neighbors = network.adjacency.get(startIsect);
    if (!neighbors || neighbors.length === 0) return [];
    // Pick the neighbor whose intersection is closest to the midpoint of source/target nodes
    const sn = network.intersections[startIsect];
    if (!sn) return [];
    let bestNeighbor = neighbors[0].to;
    let bestDist = Infinity;
    for (const nb of neighbors) {
      const nbIsect = network.intersections[nb.to];
      if (!nbIsect) continue;
      // Prefer short segments (nearby intersections)
      if (nb.weight < bestDist) { bestDist = nb.weight; bestNeighbor = nb.to; }
    }
    // Route: start → neighbor → start (out and back via road)
    const outPath = pathToWaypoints(network, [startIsect, bestNeighbor]);
    if (outPath.length < 2) return [];
    // Return just the outward path (edge will curve through the neighbor)
    return outPath;
  }

  const path = findShortestPath(network, startIsect, endIsect);
  if (path.length < 2) return [];

  return pathToWaypoints(network, path);
}

/**
 * Add trunk roads connecting group centroids to the existing road network.
 * This ensures cross-group edges can be routed through the road system.
 */
export function addTrunkRoads(
  network: RoadNetwork,
  groupCentroids: { x: number; y: number }[],
): void {
  if (groupCentroids.length < 2) return;

  // For each centroid, find or create the nearest intersection
  const centroidIsects: number[] = [];
  for (const c of groupCentroids) {
    let bestId = -1;
    let bestDist = Infinity;
    for (const isect of network.intersections) {
      const dx = c.x - isect.x;
      const dy = c.y - isect.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestId = isect.id; }
    }
    if (bestId >= 0 && bestDist < 1e8) {
      centroidIsects.push(bestId);
    } else {
      // Create new intersection at centroid
      const id = network.intersections.length;
      network.intersections.push({ id, x: c.x, y: c.y });
      if (!network.adjacency.has(id)) network.adjacency.set(id, []);
      centroidIsects.push(id);
    }
  }

  // Connect consecutive centroids with trunk road segments
  for (let i = 0; i < centroidIsects.length - 1; i++) {
    const fromId = centroidIsects[i];
    const toId = centroidIsects[i + 1];
    if (fromId === toId) continue; // skip if same intersection
    const fromIsect = network.intersections[fromId];
    const toIsect = network.intersections[toId];
    if (!fromIsect || !toIsect) continue;

    const dx = toIsect.x - fromIsect.x;
    const dy = toIsect.y - fromIsect.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const segIdx = network.segments.length;
    network.segments.push({ from: fromId, to: toId, waypoints: [], length: dist });

    if (!network.adjacency.has(fromId)) network.adjacency.set(fromId, []);
    if (!network.adjacency.has(toId)) network.adjacency.set(toId, []);
    network.adjacency.get(fromId)!.push({ to: toId, weight: dist, segIdx });
    network.adjacency.get(toId)!.push({ to: fromId, weight: dist, segIdx });
  }

  // Also connect first and last for circular arrangements
  if (centroidIsects.length > 2) {
    const firstId = centroidIsects[0];
    const lastId = centroidIsects[centroidIsects.length - 1];
    if (firstId !== lastId) {
      const firstIsect = network.intersections[firstId];
      const lastIsect = network.intersections[lastId];
      if (firstIsect && lastIsect) {
        const dx = lastIsect.x - firstIsect.x;
        const dy = lastIsect.y - firstIsect.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const segIdx = network.segments.length;
        network.segments.push({ from: firstId, to: lastId, waypoints: [], length: dist });
        if (!network.adjacency.has(firstId)) network.adjacency.set(firstId, []);
        if (!network.adjacency.has(lastId)) network.adjacency.set(lastId, []);
        network.adjacency.get(firstId)!.push({ to: lastId, weight: dist, segIdx });
        network.adjacency.get(lastId)!.push({ to: firstId, weight: dist, segIdx });
      }
    }
  }
}

/** Find nearest intersection to an arbitrary (x, y) position. Returns intersection ID or -1. */
export function findNearestIntersection(network: RoadNetwork, x: number, y: number): number {
  let bestId = -1;
  let bestDist = Infinity;
  for (const isect of network.intersections) {
    const dx = x - isect.x;
    const dy = y - isect.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; bestId = isect.id; }
  }
  return bestId;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyNetwork(cfg: RoadNetworkConfig): RoadNetwork {
  return {
    intersections: [], segments: [], nodeAccess: new Map(),
    adjacency: new Map(), system: cfg.system, cx: cfg.cx, cy: cfg.cy,
  };
}

/** Generate waypoints along a circular arc from theta1 to theta2. */
function generateArcWaypoints(
  cx: number, cy: number, r: number,
  theta1: number, theta2: number, steps: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  // Skip first and last (those are the intersection points themselves)
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const theta = theta1 + (theta2 - theta1) * t;
    pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
  }
  return pts;
}

function arcLength(r: number, theta1: number, theta2: number): number {
  return Math.abs(r * (theta2 - theta1));
}

// ---------------------------------------------------------------------------
// Dynamic densification
// ---------------------------------------------------------------------------

/**
 * Densify grid lines by recursively adding midpoints.
 * @param lines Sorted array of grid line positions
 * @param rounds Number of densification rounds (each round doubles the line count)
 */
export function multiDensify(
  lines: { position: number; label?: string }[],
  rounds: number,
): { position: number; label?: string }[] {
  let result = [...lines].sort((a, b) => a.position - b.position);
  for (let r = 0; r < rounds; r++) {
    const next: { position: number; label?: string }[] = [];
    for (let i = 0; i < result.length; i++) {
      next.push(result[i]);
      if (i < result.length - 1) {
        next.push({ position: (result[i].position + result[i + 1].position) / 2 });
      }
    }
    result = next;
  }
  return result;
}

/**
 * Compute appropriate densification rounds based on node count.
 * Target: ~2-4 intersections per node for adequate routing granularity.
 */
export function densifyRounds(nodeCount: number, baseLineCount: number): number {
  if (baseLineCount === 0) return 0;
  const targetIntersections = nodeCount * 3;
  const currentIntersections = baseLineCount * baseLineCount;
  if (currentIntersections >= targetIntersections) return 0;
  const ratio = targetIntersections / currentIntersections;
  return Math.min(Math.ceil(Math.log2(Math.sqrt(ratio))), 3); // max 3 rounds
}
