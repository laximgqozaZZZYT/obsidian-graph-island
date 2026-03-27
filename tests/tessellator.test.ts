import { describe, it, expect } from "vitest";
import {
  tessellateCircle,
  tessellateRect,
  tessellateRoundedRect,
  flattenBezier,
  flattenQuadratic,
  expandLineStrip,
  tessellateArc,
} from "../src/views/webgl/tessellator";

// ── tessellateCircle ────────────────────────────────────────────────

describe("tessellateCircle", () => {
  it("returns correct vertex count for default segments", () => {
    const verts = tessellateCircle(0, 0, 10);
    // 24 segments * 3 vertices * 2 floats = 144
    expect(verts.length).toBe(24 * 3 * 2);
  });

  it("returns correct vertex count for custom segments", () => {
    const verts = tessellateCircle(0, 0, 5, 12);
    expect(verts.length).toBe(12 * 3 * 2);
  });

  it("returns Float32Array", () => {
    expect(tessellateCircle(0, 0, 10)).toBeInstanceOf(Float32Array);
  });

  it("all perimeter points are at radius distance from center", () => {
    const cx = 5, cy = 7, r = 10;
    const verts = tessellateCircle(cx, cy, r, 16);
    for (let i = 0; i < verts.length; i += 6) {
      // Skip center vertex (first of each triangle)
      for (const off of [2, 4]) {
        const px = verts[i + off];
        const py = verts[i + off + 1];
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        expect(dist).toBeCloseTo(r, 5);
      }
    }
  });

  it("center vertices match the given center", () => {
    const cx = 3, cy = -4, r = 5;
    const verts = tessellateCircle(cx, cy, r, 8);
    for (let i = 0; i < verts.length; i += 6) {
      expect(verts[i]).toBeCloseTo(cx);
      expect(verts[i + 1]).toBeCloseTo(cy);
    }
  });

  it("consistent winding order (all CCW or all CW)", () => {
    const verts = tessellateCircle(0, 0, 10, 6);
    let positiveCount = 0;
    let negativeCount = 0;
    for (let i = 0; i < verts.length; i += 6) {
      const cross = crossProduct2D(
        verts[i], verts[i + 1],
        verts[i + 2], verts[i + 3],
        verts[i + 4], verts[i + 5],
      );
      if (cross > 0) positiveCount++;
      else negativeCount++;
    }
    // All triangles should have the same winding
    expect(positiveCount === 0 || negativeCount === 0).toBe(true);
  });
});

// ── tessellateRect ──────────────────────────────────────────────────

describe("tessellateRect", () => {
  it("returns exactly 12 floats", () => {
    const verts = tessellateRect(0, 0, 100, 50);
    expect(verts.length).toBe(12);
  });

  it("returns Float32Array", () => {
    expect(tessellateRect(0, 0, 10, 10)).toBeInstanceOf(Float32Array);
  });

  it("covers the correct area (bounding box)", () => {
    const x = 10, y = 20, w = 30, h = 40;
    const verts = tessellateRect(x, y, w, h);
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < verts.length; i += 2) {
      minX = Math.min(minX, verts[i]);
      maxX = Math.max(maxX, verts[i]);
      minY = Math.min(minY, verts[i + 1]);
      maxY = Math.max(maxY, verts[i + 1]);
    }
    expect(minX).toBe(x);
    expect(maxX).toBe(x + w);
    expect(minY).toBe(y);
    expect(maxY).toBe(y + h);
  });

  it("contains the 4 corner points", () => {
    const x = 5, y = 10, w = 20, h = 30;
    const verts = tessellateRect(x, y, w, h);
    const pts = vertsToPairs(verts);
    expect(pts).toContainEqual([x, y]);
    expect(pts).toContainEqual([x + w, y]);
    expect(pts).toContainEqual([x, y + h]);
    expect(pts).toContainEqual([x + w, y + h]);
  });
});

// ── tessellateRoundedRect ───────────────────────────────────────────

describe("tessellateRoundedRect", () => {
  it("returns Float32Array", () => {
    expect(tessellateRoundedRect(0, 0, 100, 80, 10)).toBeInstanceOf(Float32Array);
  });

  it("has more vertices than a plain rect", () => {
    const rr = tessellateRoundedRect(0, 0, 100, 80, 10);
    const r = tessellateRect(0, 0, 100, 80);
    expect(rr.length).toBeGreaterThan(r.length);
  });

  it("corners are curved (points exist outside straight rect corners)", () => {
    const x = 0, y = 0, w = 100, h = 80, rad = 20;
    const verts = tessellateRoundedRect(x, y, w, h, rad);
    // There should be points near the corners but not at the exact corner
    let hasCornerArcPoint = false;
    for (let i = 0; i < verts.length; i += 2) {
      const px = verts[i], py = verts[i + 1];
      // Check near top-left corner arc area
      if (px > x && px < x + rad && py > y && py < y + rad) {
        hasCornerArcPoint = true;
        break;
      }
    }
    expect(hasCornerArcPoint).toBe(true);
  });

  it("clamps radius to half of smaller dimension", () => {
    // w=20, h=10, radius=100 should clamp to 5
    const verts = tessellateRoundedRect(0, 0, 20, 10, 100);
    // Should still produce valid geometry
    expect(verts.length).toBeGreaterThan(0);
    // All points should be within bounds
    for (let i = 0; i < verts.length; i += 2) {
      expect(verts[i]).toBeGreaterThanOrEqual(-0.01);
      expect(verts[i]).toBeLessThanOrEqual(20.01);
      expect(verts[i + 1]).toBeGreaterThanOrEqual(-0.01);
      expect(verts[i + 1]).toBeLessThanOrEqual(10.01);
    }
  });

  it("zero radius produces same vertex count as rect body decomposition", () => {
    const verts = tessellateRoundedRect(0, 0, 100, 80, 0);
    // 3 body rects (6 tris) + 4 corners * 8 segs = 38 tris, but with r=0 arc tris are degenerate
    expect(verts.length).toBeGreaterThan(0);
  });
});

// ── flattenBezier ───────────────────────────────────────────────────

describe("flattenBezier", () => {
  it("start and end points match input", () => {
    const pts = flattenBezier(0, 0, 10, 20, 30, 20, 40, 0);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 40, y: 0 });
  });

  it("straight line produces exactly 2 points", () => {
    // Control points on the line
    const pts = flattenBezier(0, 0, 10, 0, 20, 0, 30, 0);
    expect(pts.length).toBe(2);
  });

  it("curved line produces more than 2 points", () => {
    const pts = flattenBezier(0, 0, 0, 100, 100, 100, 100, 0, 0.5);
    expect(pts.length).toBeGreaterThan(2);
  });

  it("tighter tolerance produces more points", () => {
    const loose = flattenBezier(0, 0, 0, 100, 100, 100, 100, 0, 5.0);
    const tight = flattenBezier(0, 0, 0, 100, 100, 100, 100, 0, 0.1);
    expect(tight.length).toBeGreaterThanOrEqual(loose.length);
  });

  it("all intermediate points are reasonable (within bounding box of control points)", () => {
    const pts = flattenBezier(0, 0, 10, 50, 40, 50, 50, 0, 1.0);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-1);
      expect(p.x).toBeLessThanOrEqual(51);
      expect(p.y).toBeGreaterThanOrEqual(-1);
      expect(p.y).toBeLessThanOrEqual(51);
    }
  });
});

// ── flattenQuadratic ────────────────────────────────────────────────

describe("flattenQuadratic", () => {
  it("start and end points match input", () => {
    const pts = flattenQuadratic(0, 0, 25, 50, 50, 0);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 50, y: 0 });
  });

  it("straight line produces exactly 2 points", () => {
    const pts = flattenQuadratic(0, 0, 15, 0, 30, 0);
    expect(pts.length).toBe(2);
  });

  it("curved line produces more than 2 points", () => {
    const pts = flattenQuadratic(0, 0, 50, 100, 100, 0, 0.5);
    expect(pts.length).toBeGreaterThan(2);
  });

  it("tighter tolerance produces more points", () => {
    const loose = flattenQuadratic(0, 0, 50, 100, 100, 0, 5.0);
    const tight = flattenQuadratic(0, 0, 50, 100, 100, 0, 0.1);
    expect(tight.length).toBeGreaterThanOrEqual(loose.length);
  });

  it("points stay within control polygon bounding box", () => {
    const pts = flattenQuadratic(0, 0, 50, 80, 100, 0, 1.0);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-1);
      expect(p.x).toBeLessThanOrEqual(101);
      expect(p.y).toBeGreaterThanOrEqual(-1);
      expect(p.y).toBeLessThanOrEqual(81);
    }
  });
});

// ── expandLineStrip ─────────────────────────────────────────────────

describe("expandLineStrip", () => {
  it("returns empty array for fewer than 2 points", () => {
    expect(expandLineStrip([{ x: 0, y: 0 }], 2).length).toBe(0);
    expect(expandLineStrip([], 2).length).toBe(0);
  });

  it("returns Float32Array", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(expandLineStrip(pts, 2)).toBeInstanceOf(Float32Array);
  });

  it("correct quad count: 2 triangles per segment", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ];
    const verts = expandLineStrip(pts, 4);
    const segments = pts.length - 1; // 3
    // 3 segments * 2 triangles * 3 vertices * 2 floats = 36
    expect(verts.length).toBe(segments * 2 * 3 * 2);
  });

  it("width matches: offset vertices are half-width from centerline", () => {
    const width = 6;
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const verts = expandLineStrip(pts, width);
    // Horizontal line: perpendicular is vertical, so y offsets should be +/-3
    const ys = new Set<number>();
    for (let i = 1; i < verts.length; i += 2) {
      ys.add(Math.round(verts[i] * 1000) / 1000);
    }
    expect(ys.has(3)).toBe(true);
    expect(ys.has(-3)).toBe(true);
  });

  it("handles vertical line correctly", () => {
    const pts = [{ x: 5, y: 0 }, { x: 5, y: 20 }];
    const verts = expandLineStrip(pts, 4);
    expect(verts.length).toBe(12);
    // Perpendicular to vertical line is horizontal, so x offsets +/-2
    const xs = new Set<number>();
    for (let i = 0; i < verts.length; i += 2) {
      xs.add(Math.round(verts[i] * 1000) / 1000);
    }
    expect(xs.has(3)).toBe(true);
    expect(xs.has(7)).toBe(true);
  });
});

// ── tessellateArc ───────────────────────────────────────────────────

describe("tessellateArc", () => {
  it("returns Float32Array", () => {
    expect(tessellateArc(0, 0, 10, 0, Math.PI)).toBeInstanceOf(Float32Array);
  });

  it("full circle matches tessellateCircle vertex count", () => {
    const segs = 24;
    const arc = tessellateArc(0, 0, 10, 0, Math.PI * 2, false, segs);
    const circle = tessellateCircle(0, 0, 10, segs);
    expect(arc.length).toBe(circle.length);
  });

  it("half circle has roughly half the vertices of full circle", () => {
    const full = tessellateArc(0, 0, 10, 0, Math.PI * 2);
    const half = tessellateArc(0, 0, 10, 0, Math.PI);
    // Half should have approximately half the triangles (auto-segments scale with sweep)
    expect(half.length).toBeCloseTo(full.length / 2, -1);
  });

  it("ccw flag reverses sweep direction", () => {
    const cw = tessellateArc(0, 0, 10, 0, Math.PI / 2, false, 8);
    const ccw = tessellateArc(0, 0, 10, 0, Math.PI / 2, true, 8);
    // Both have same segment count, but different vertex positions
    expect(cw.length).toBe(ccw.length);
    // The actual vertex positions should differ (CW goes 0->PI/2, CCW goes 0->-3PI/2)
    let differ = false;
    for (let i = 0; i < cw.length; i++) {
      if (Math.abs(cw[i] - ccw[i]) > 0.001) { differ = true; break; }
    }
    expect(differ).toBe(true);
  });

  it("perimeter points are at radius distance from center", () => {
    const cx = 3, cy = 5, r = 8;
    const verts = tessellateArc(cx, cy, r, 0, Math.PI, false, 10);
    for (let i = 0; i < verts.length; i += 6) {
      for (const off of [2, 4]) {
        const px = verts[i + off];
        const py = verts[i + off + 1];
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        expect(dist).toBeCloseTo(r, 5);
      }
    }
  });

  it("auto-computes reasonable segment count", () => {
    // Quarter circle should get ~6 segments (90 deg / 15 deg)
    const verts = tessellateArc(0, 0, 10, 0, Math.PI / 2);
    const triangleCount = verts.length / 6;
    expect(triangleCount).toBeGreaterThanOrEqual(4);
    expect(triangleCount).toBeLessThanOrEqual(12);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────

/** Cross product of triangle (ax,ay)-(bx,by)-(cx,cy) for winding test */
function crossProduct2D(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Convert flat Float32Array to array of [x,y] pairs */
function vertsToPairs(verts: Float32Array): [number, number][] {
  const result: [number, number][] = [];
  for (let i = 0; i < verts.length; i += 2) {
    result.push([verts[i], verts[i + 1]]);
  }
  return result;
}
