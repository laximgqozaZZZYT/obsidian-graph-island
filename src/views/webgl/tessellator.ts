/**
 * Pure math functions that convert Canvas 2D drawing commands into
 * triangle vertex arrays suitable for WebGL rendering.
 *
 * All functions are pure: no side effects, no global state.
 * Vertex data is returned as Float32Array (WebGL-ready).
 */

// ── Circle ──────────────────────────────────────────────────────────

/**
 * Fan triangulation of a filled circle from center.
 * Returns interleaved [x1,y1, x2,y2, x3,y3, ...] for `segments * 3 * 2` floats.
 * Each triangle: (center, point_i, point_i+1).
 */
export function tessellateCircle(
  cx: number,
  cy: number,
  r: number,
  segments = 24,
): Float32Array {
  const floatCount = segments * 3 * 2;
  const out = new Float32Array(floatCount);
  const step = (Math.PI * 2) / segments;
  let idx = 0;
  for (let i = 0; i < segments; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    // center
    out[idx++] = cx;
    out[idx++] = cy;
    // point i
    out[idx++] = cx + r * Math.cos(a0);
    out[idx++] = cy + r * Math.sin(a0);
    // point i+1
    out[idx++] = cx + r * Math.cos(a1);
    out[idx++] = cy + r * Math.sin(a1);
  }
  return out;
}

// ── Rectangle ───────────────────────────────────────────────────────

/**
 * Two triangles for a filled rectangle.
 * Triangle 1: TL, TR, BL; Triangle 2: TR, BR, BL.
 * Returns 12 floats.
 */
export function tessellateRect(
  x: number,
  y: number,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(12);
  // TL, TR, BL
  out[0] = x;
  out[1] = y;
  out[2] = x + w;
  out[3] = y;
  out[4] = x;
  out[5] = y + h;
  // TR, BR, BL
  out[6] = x + w;
  out[7] = y;
  out[8] = x + w;
  out[9] = y + h;
  out[10] = x;
  out[11] = y + h;
  return out;
}

// ── Rounded Rectangle ──────────────────────────────────────────────

const CORNER_SEGMENTS = 8;

/**
 * Rectangle body + 4 corner arc fans (8 segments per corner).
 * Clamps radius to half of the smaller dimension.
 */
export function tessellateRoundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): Float32Array {
  // Clamp radius
  r = Math.min(r, w / 2, h / 2);

  const triangles: number[] = [];

  // Helper to push a triangle
  const tri = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ) => {
    triangles.push(x1, y1, x2, y2, x3, y3);
  };

  // Center cross: vertical strip (full height, excluding corners width)
  // Top-left of inner rect
  const ix = x + r;
  const iy = y + r;
  const ix2 = x + w - r;
  const iy2 = y + h - r;

  // Decompose body into 3 rectangles (cross shape):
  // 1. Center rect (full width minus corners, full height minus corners)
  tri(ix, y, ix2, y, ix, y + h);
  tri(ix2, y, ix2, y + h, ix, y + h);

  // 2. Left strip
  tri(x, iy, ix, iy, x, iy2);
  tri(ix, iy, ix, iy2, x, iy2);

  // 3. Right strip
  tri(ix2, iy, x + w, iy, ix2, iy2);
  tri(x + w, iy, x + w, iy2, ix2, iy2);

  // 4 corner arcs (fan from corner center)
  const corners: [number, number, number][] = [
    [ix, iy, Math.PI], // top-left: PI to 1.5PI
    [ix2, iy, 1.5 * Math.PI], // top-right: 1.5PI to 2PI
    [ix2, iy2, 0], // bottom-right: 0 to 0.5PI
    [ix, iy2, 0.5 * Math.PI], // bottom-left: 0.5PI to PI
  ];

  for (const [ccx, ccy, startAngle] of corners) {
    const spanAngle = Math.PI / 2;
    const step = spanAngle / CORNER_SEGMENTS;
    for (let i = 0; i < CORNER_SEGMENTS; i++) {
      const a0 = startAngle + i * step;
      const a1 = startAngle + (i + 1) * step;
      tri(
        ccx,
        ccy,
        ccx + r * Math.cos(a0),
        ccy + r * Math.sin(a0),
        ccx + r * Math.cos(a1),
        ccy + r * Math.sin(a1),
      );
    }
  }

  return new Float32Array(triangles);
}

// ── Bezier Flattening (Cubic) ───────────────────────────────────────

/**
 * Adaptive subdivision of a cubic Bezier curve.
 * Splits until segment deviation from the curve < tolerance.
 * Returns polyline points including start and end.
 */
export function flattenBezier(
  x0: number,
  y0: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  x1: number,
  y1: number,
  tolerance = 1.0,
): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [{ x: x0, y: y0 }];
  subdivCubic(x0, y0, cp1x, cp1y, cp2x, cp2y, x1, y1, tolerance, result, 0);
  result.push({ x: x1, y: y1 });
  return result;
}

function subdivCubic(
  x0: number,
  y0: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  x1: number,
  y1: number,
  tol: number,
  out: { x: number; y: number }[],
  depth: number,
): void {
  // Flatness test: max distance of control points from the line (x0,y0)-(x1,y1)
  const d1 = pointLineDistance(cp1x, cp1y, x0, y0, x1, y1);
  const d2 = pointLineDistance(cp2x, cp2y, x0, y0, x1, y1);

  if ((d1 + d2 < tol) || depth > 16) {
    // Flat enough — midpoint already covered by endpoints in parent
    return;
  }

  // De Casteljau split at t=0.5
  const mx01 = (x0 + cp1x) / 2;
  const my01 = (y0 + cp1y) / 2;
  const mx12 = (cp1x + cp2x) / 2;
  const my12 = (cp1y + cp2y) / 2;
  const mx23 = (cp2x + x1) / 2;
  const my23 = (cp2y + y1) / 2;
  const mx012 = (mx01 + mx12) / 2;
  const my012 = (my01 + my12) / 2;
  const mx123 = (mx12 + mx23) / 2;
  const my123 = (my12 + my23) / 2;
  const mx0123 = (mx012 + mx123) / 2;
  const my0123 = (my012 + my123) / 2;

  subdivCubic(x0, y0, mx01, my01, mx012, my012, mx0123, my0123, tol, out, depth + 1);
  out.push({ x: mx0123, y: my0123 });
  subdivCubic(mx0123, my0123, mx123, my123, mx23, my23, x1, y1, tol, out, depth + 1);
}

// ── Bezier Flattening (Quadratic) ───────────────────────────────────

/**
 * Adaptive subdivision of a quadratic Bezier curve.
 * Returns polyline points including start and end.
 */
export function flattenQuadratic(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  tolerance = 1.0,
): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [{ x: x0, y: y0 }];
  subdivQuadratic(x0, y0, cx, cy, x1, y1, tolerance, result, 0);
  result.push({ x: x1, y: y1 });
  return result;
}

function subdivQuadratic(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  tol: number,
  out: { x: number; y: number }[],
  depth: number,
): void {
  const d = pointLineDistance(cx, cy, x0, y0, x1, y1);

  if (d < tol || depth > 16) {
    return;
  }

  // De Casteljau split at t=0.5
  const mx01 = (x0 + cx) / 2;
  const my01 = (y0 + cy) / 2;
  const mx12 = (cx + x1) / 2;
  const my12 = (cy + y1) / 2;
  const mid_x = (mx01 + mx12) / 2;
  const mid_y = (my01 + my12) / 2;

  subdivQuadratic(x0, y0, mx01, my01, mid_x, mid_y, tol, out, depth + 1);
  out.push({ x: mid_x, y: mid_y });
  subdivQuadratic(mid_x, mid_y, mx12, my12, x1, y1, tol, out, depth + 1);
}

// ── Line Strip Expansion ────────────────────────────────────────────

/**
 * Expand a polyline into screen-aligned quads (2 triangles per segment).
 * For each segment: compute perpendicular normal, offset +/- width/2.
 * Returns triangle vertices as Float32Array.
 */
export function expandLineStrip(
  points: { x: number; y: number }[],
  width: number,
): Float32Array {
  if (points.length < 2) return new Float32Array(0);

  const segCount = points.length - 1;
  // 2 triangles per segment, 3 vertices each, 2 floats per vertex
  const out = new Float32Array(segCount * 2 * 3 * 2);
  const hw = width / 2;
  let idx = 0;

  for (let i = 0; i < segCount; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      // Degenerate segment — produce zero-area triangles
      for (let j = 0; j < 12; j++) out[idx++] = p0.x;
      continue;
    }

    // Perpendicular normal
    const nx = -dy / len * hw;
    const ny = dx / len * hw;

    // Four corners of the quad
    const ax = p0.x + nx, ay = p0.y + ny;
    const bx = p0.x - nx, by = p0.y - ny;
    const cx = p1.x + nx, cy = p1.y + ny;
    const ddx = p1.x - nx, ddy = p1.y - ny;

    // Triangle 1: a, c, b
    out[idx++] = ax; out[idx++] = ay;
    out[idx++] = cx; out[idx++] = cy;
    out[idx++] = bx; out[idx++] = by;
    // Triangle 2: c, d, b
    out[idx++] = cx; out[idx++] = cy;
    out[idx++] = ddx; out[idx++] = ddy;
    out[idx++] = bx; out[idx++] = by;
  }

  return out;
}

// ── Arc ─────────────────────────────────────────────────────────────

/**
 * Fan triangulation from center for an arc sector.
 * Auto-computes segments from angle span if not specified (~1 segment per 15 degrees).
 */
export function tessellateArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  ccw = false,
  segments?: number,
): Float32Array {
  // Normalize the sweep
  let sweep = endAngle - startAngle;
  if (ccw) {
    if (sweep > 0) sweep -= Math.PI * 2;
    if (sweep === 0) sweep = -Math.PI * 2;
  } else {
    if (sweep < 0) sweep += Math.PI * 2;
    if (sweep === 0) sweep = Math.PI * 2;
  }

  const absSweep = Math.abs(sweep);
  const segs =
    segments ?? Math.max(1, Math.ceil(absSweep / (Math.PI / 12)));
  const step = sweep / segs;

  const out = new Float32Array(segs * 3 * 2);
  let idx = 0;

  for (let i = 0; i < segs; i++) {
    const a0 = startAngle + i * step;
    const a1 = startAngle + (i + 1) * step;
    out[idx++] = cx;
    out[idx++] = cy;
    out[idx++] = cx + r * Math.cos(a0);
    out[idx++] = cy + r * Math.sin(a0);
    out[idx++] = cx + r * Math.cos(a1);
    out[idx++] = cy + r * Math.sin(a1);
  }

  return out;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Distance from point (px,py) to line segment (lx0,ly0)-(lx1,ly1). */
function pointLineDistance(
  px: number,
  py: number,
  lx0: number,
  ly0: number,
  lx1: number,
  ly1: number,
): number {
  const dx = lx1 - lx0;
  const dy = ly1 - ly0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Line is a point
    const ex = px - lx0;
    const ey = py - ly0;
    return Math.sqrt(ex * ex + ey * ey);
  }
  // Perpendicular distance from point to infinite line
  return Math.abs(dy * px - dx * py + lx1 * ly0 - ly1 * lx0) / Math.sqrt(lenSq);
}
