/**
 * EnclosureRenderer — boundary tests for filterOutliers, drawSmoothHull, drawCapsule
 */
import { describe, it, expect, vi } from "vitest";
import { filterOutliers } from "../src/views/EnclosureRenderer";

// ---------------------------------------------------------------------------
// filterOutliers — IQR-based spatial outlier removal
// ---------------------------------------------------------------------------
describe("filterOutliers boundary", () => {
  it("returns original when 3 or fewer points", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }];
    expect(filterOutliers(pts)).toBe(pts);
  });

  it("returns original for exactly 3 points", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(filterOutliers(pts)).toBe(pts);
  });

  it("returns original for 2 points", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(filterOutliers(pts)).toBe(pts);
  });

  it("returns original for 1 point", () => {
    const pts = [{ x: 5, y: 5 }];
    expect(filterOutliers(pts)).toBe(pts);
  });

  it("returns original for empty array", () => {
    const pts: { x: number; y: number }[] = [];
    expect(filterOutliers(pts)).toBe(pts);
  });

  it("keeps all points when no outliers", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    const result = filterOutliers(pts);
    expect(result).toHaveLength(4);
  });

  it("removes extreme outlier", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1000, y: 1000 }, // extreme outlier
    ];
    const result = filterOutliers(pts);
    expect(result.length).toBeLessThan(pts.length);
    expect(result.every(p => p.x < 100 && p.y < 100)).toBe(true);
  });

  it("respects iqrFactor — lower factor removes more", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 5, y: 5 }, // moderate distance
    ];
    const strict = filterOutliers(pts, 0.5);
    const lenient = filterOutliers(pts, 5.0);
    expect(strict.length).toBeLessThanOrEqual(lenient.length);
  });

  it("keeps at least 1 point even if all are outliers (returns original)", () => {
    // With very strict factor, if all would be removed, returns original
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    const result = filterOutliers(pts, 0);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("handles all points at same position", () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const result = filterOutliers(pts);
    // All distances are 0, IQR is 0, cutoff is 0
    expect(result.length).toBe(4);
  });

  it("preserves extra properties on points", () => {
    const pts = [
      { x: 0, y: 0, id: "a" },
      { x: 1, y: 0, id: "b" },
      { x: 0, y: 1, id: "c" },
      { x: 1, y: 1, id: "d" },
    ];
    const result = filterOutliers(pts);
    expect(result.every(p => "id" in p)).toBe(true);
  });
});
