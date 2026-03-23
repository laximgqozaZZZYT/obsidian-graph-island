/**
 * Road Network Metrics — quantify edge-to-road adherence.
 *
 * Measures how closely edges follow the road network by computing
 * the maximum distance from each edge waypoint to its nearest road segment.
 */

import type { RoadNetwork } from "./cable-tray";

/**
 * Compute the minimum distance from point (px, py) to line segment (ax, ay)-(bx, by).
 */
export function pointToSegmentDist(
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
export function pointToNearestRoad(
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

