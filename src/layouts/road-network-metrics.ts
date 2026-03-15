/**
 * Road Network Metrics — quantify edge-to-road adherence.
 *
 * Measures how closely edges follow the road network by computing
 * the maximum distance from each edge waypoint to its nearest road segment.
 */

import type { RoadNetwork } from "./road-network";

export interface EdgeAdherenceResult {
  /** Fraction of edges that follow roads (all waypoints within threshold) */
  adherenceRate: number;
  /** Average max-deviation per edge (in world units) */
  avgMaxDeviation: number;
  /** Edges that violate the threshold */
  violations: {
    sourceId: string;
    targetId: string;
    maxDeviation: number;
  }[];
  /** Total edges analyzed */
  totalEdges: number;
}

/**
 * Compute the minimum distance from point (px, py) to line segment (ax, ay)-(bx, by).
 */
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Compute minimum distance from a point to any road segment in the network.
 */
function pointToNearestRoad(
  px: number, py: number,
  network: RoadNetwork,
): number {
  let minDist = Infinity;
  for (const seg of network.segments) {
    const fromIsect = network.intersections[seg.from];
    const toIsect = network.intersections[seg.to];
    if (!fromIsect || !toIsect) continue;

    // Check distance to the main segment line
    const d = pointToSegmentDist(px, py, fromIsect.x, fromIsect.y, toIsect.x, toIsect.y);
    if (d < minDist) minDist = d;

    // Also check waypoints (arc segments for polar roads)
    if (seg.waypoints.length > 0) {
      const pts = [
        { x: fromIsect.x, y: fromIsect.y },
        ...seg.waypoints,
        { x: toIsect.x, y: toIsect.y },
      ];
      for (let i = 0; i < pts.length - 1; i++) {
        const wd = pointToSegmentDist(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        if (wd < minDist) minDist = wd;
      }
    }
  }
  return minDist;
}

/**
 * Measure how closely routed edges follow the road network.
 *
 * @param network The road network
 * @param routedEdges Array of { sourceId, targetId, waypoints } from edge routing
 * @param threshold Maximum allowed deviation from road (in world units)
 */
export function measureEdgeAdherence(
  network: RoadNetwork,
  routedEdges: { sourceId: string; targetId: string; waypoints: { x: number; y: number }[] }[],
  threshold: number,
): EdgeAdherenceResult {
  const violations: EdgeAdherenceResult["violations"] = [];
  let totalMaxDev = 0;
  let adherentCount = 0;

  for (const edge of routedEdges) {
    let maxDev = 0;
    for (const wp of edge.waypoints) {
      const dist = pointToNearestRoad(wp.x, wp.y, network);
      if (dist > maxDev) maxDev = dist;
    }

    totalMaxDev += maxDev;
    if (maxDev <= threshold) {
      adherentCount++;
    } else {
      violations.push({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        maxDeviation: maxDev,
      });
    }
  }

  return {
    adherenceRate: routedEdges.length > 0 ? adherentCount / routedEdges.length : 1,
    avgMaxDeviation: routedEdges.length > 0 ? totalMaxDev / routedEdges.length : 0,
    violations,
    totalEdges: routedEdges.length,
  };
}
