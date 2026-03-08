import { describe, it, expect } from "vitest";
import { convexHull, expandHull, polygonArea } from "../src/utils/geometry";

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

describe("expandHull", () => {
  it("returns copy for fewer than 3 points", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const result = expandHull(pts, 10);
    expect(result).toEqual(pts); // same values, different references
    expect(result[0]).not.toBe(pts[0]);
  });

  it("expands a triangle outward", () => {
    const tri = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }];
    const hull = convexHull(tri);
    const expanded = expandHull(hull, 5);

    expect(expanded).toHaveLength(hull.length);

    // Expanded hull should have larger area
    const origArea = polygonArea(hull);
    const expArea = polygonArea(expanded);
    expect(expArea).toBeGreaterThan(origArea);
  });

  it("moves vertices along bisector direction proportional to pad", () => {
    const hull = convexHull([
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 0, y: 100 },
    ]);
    const exp5 = expandHull(hull, 5);
    const exp10 = expandHull(hull, 10);

    // Larger padding should move vertices further from original
    const distFromOrig = (expanded: typeof hull) => {
      let sum = 0;
      for (let i = 0; i < hull.length; i++) {
        sum += Math.hypot(expanded[i].x - hull[i].x, expanded[i].y - hull[i].y);
      }
      return sum;
    };
    expect(distFromOrig(exp10)).toBeGreaterThan(distFromOrig(exp5));
  });
});

describe("polygonArea", () => {
  it("returns 0 for empty polygon", () => {
    expect(polygonArea([])).toBe(0);
  });

  it("computes area of unit square", () => {
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(polygonArea(square)).toBeCloseTo(1);
  });

  it("computes area of 3x4 rectangle", () => {
    const rect = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 4 }];
    expect(polygonArea(rect)).toBeCloseTo(12);
  });

  it("computes area of right triangle", () => {
    const tri = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }];
    expect(polygonArea(tri)).toBeCloseTo(6);
  });

  it("returns positive area regardless of winding order", () => {
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }];
    const ccw = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(polygonArea(cw)).toBeCloseTo(polygonArea(ccw));
    expect(polygonArea(cw)).toBeCloseTo(1);
  });
});
