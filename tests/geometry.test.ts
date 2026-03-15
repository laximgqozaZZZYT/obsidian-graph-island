import { describe, it, expect } from "vitest";
import { convexHull, computeBoundingBox, computeBBoxWithCentroid, clamp } from "../src/utils/geometry";

describe("convexHull", () => {
  it("returns empty for no points", () => {
    expect(convexHull([])).toEqual([]);
  });

  it("returns single point unchanged", () => {
    expect(convexHull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });

  it("returns two points unchanged", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(convexHull(pts)).toEqual(pts);
  });

  it("computes triangle hull", () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(3);
    // All input points should be on the hull
    for (const p of pts) {
      expect(hull).toContainEqual(p);
    }
  });

  it("excludes interior points", () => {
    const pts = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 },
      { x: 2, y: 2 }, // interior
    ];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 2, y: 2 });
  });

  it("handles collinear points", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const hull = convexHull(pts);
    expect(hull.length).toBeLessThanOrEqual(3);
    expect(hull).toContainEqual({ x: 0, y: 0 });
    expect(hull).toContainEqual({ x: 2, y: 0 });
  });

  it("handles duplicate points", () => {
    const pts = [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 3 }, { x: 3, y: 3 }];
    const hull = convexHull(pts);
    expect(hull.length).toBeGreaterThanOrEqual(2);
  });
});

describe("computeBoundingBox", () => {
  it("computes bbox for multiple points", () => {
    const pts = [{ x: 1, y: 5 }, { x: -3, y: 2 }, { x: 4, y: -1 }];
    const bb = computeBoundingBox(pts);
    expect(bb).toEqual({ minX: -3, minY: -1, maxX: 4, maxY: 5 });
  });

  it("returns Infinity bounds for empty input", () => {
    const bb = computeBoundingBox([]);
    expect(bb.minX).toBe(Infinity);
    expect(bb.maxX).toBe(-Infinity);
  });

  it("handles single point", () => {
    const bb = computeBoundingBox([{ x: 7, y: 3 }]);
    expect(bb).toEqual({ minX: 7, minY: 3, maxX: 7, maxY: 3 });
  });
});

describe("computeBBoxWithCentroid", () => {
  it("computes bbox, centroid, and count", () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    const bb = computeBBoxWithCentroid(pts);
    expect(bb.minX).toBe(0);
    expect(bb.maxX).toBe(4);
    expect(bb.minY).toBe(0);
    expect(bb.maxY).toBe(4);
    expect(bb.cx).toBe(2);
    expect(bb.cy).toBe(2);
    expect(bb.count).toBe(4);
  });

  it("returns zero centroid for empty input", () => {
    const bb = computeBBoxWithCentroid([]);
    expect(bb.cx).toBe(0);
    expect(bb.cy).toBe(0);
    expect(bb.count).toBe(0);
  });
});

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it("handles negative ranges", () => {
    expect(clamp(-5, -10, -2)).toBe(-5);
    expect(clamp(-15, -10, -2)).toBe(-10);
    expect(clamp(0, -10, -2)).toBe(-2);
  });
});

