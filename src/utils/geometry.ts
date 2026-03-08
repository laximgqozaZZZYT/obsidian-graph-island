export type Pt = { x: number; y: number };

/**
 * Compute the convex hull of a set of 2D points using Andrew's monotone chain.
 * Returns vertices in counter-clockwise order.
 */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;

  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Expand a convex hull outward by `pad` pixels along the bisector at each vertex.
 */
export function expandHull(hull: Pt[], pad: number): Pt[] {
  if (hull.length < 3) {
    return hull.map((p) => ({ x: p.x, y: p.y }));
  }
  const n = hull.length;
  const result: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = hull[(i - 1 + n) % n];
    const cur = hull[i];
    const next = hull[(i + 1) % n];
    const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
    const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const nx1 = -dy1 / len1, ny1 = dx1 / len1;
    const nx2 = -dy2 / len2, ny2 = dx2 / len2;
    let bx = nx1 + nx2, by = ny1 + ny2;
    const blen = Math.hypot(bx, by) || 1;
    bx /= blen;
    by /= blen;
    result.push({ x: cur.x + bx * pad, y: cur.y + by * pad });
  }
  return result;
}

/**
 * Polygon area via the shoelace formula (absolute value).
 */
export function polygonArea(pts: Pt[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}
