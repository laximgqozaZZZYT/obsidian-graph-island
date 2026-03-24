import { describe, it, expect } from "vitest";
import {
  computeDensityScale,
  computeDensityMinDist,
  computeLodLevel,
  screenToWorld,
  truncateLabel,
  generateDisplacementOffsets,
} from "../src/views/RenderPipeline";

// =========================================================================
// computeDensityScale — label spacing scale factor
// =========================================================================
describe("computeDensityScale (label density)", () => {
  const T = 0.6; // typical labelDensityZoomThreshold

  it("returns > 1 at low zoom (aggressive spacing)", () => {
    expect(computeDensityScale(0.2, T)).toBeGreaterThan(1);
    expect(computeDensityScale(0.1, T)).toBeGreaterThan(1);
  });

  it("returns ~1 at threshold zoom", () => {
    const s = computeDensityScale(T, T);
    expect(s).toBeCloseTo(1, 0);
  });

  it("returns < 1 at high zoom (lenient spacing)", () => {
    expect(computeDensityScale(1.0, T)).toBeLessThan(1);
    expect(computeDensityScale(2.0, T)).toBeLessThan(1);
  });

  it("never goes below 0.3", () => {
    expect(computeDensityScale(5.0, T)).toBeGreaterThanOrEqual(0.3);
    expect(computeDensityScale(100.0, T)).toBeGreaterThanOrEqual(0.3);
  });

  it("is monotonically decreasing as zoom increases", () => {
    const zooms = [0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0];
    for (let i = 1; i < zooms.length; i++) {
      expect(computeDensityScale(zooms[i], T))
        .toBeLessThanOrEqual(computeDensityScale(zooms[i - 1], T));
    }
  });

  it("is continuous at threshold boundary", () => {
    const below = computeDensityScale(T - 0.001, T);
    const above = computeDensityScale(T + 0.001, T);
    expect(Math.abs(below - above)).toBeLessThan(0.1);
  });
});

// =========================================================================
// computeDensityMinDist — clamped minimum distance
// =========================================================================
describe("computeDensityMinDist", () => {
  it("scales baseDist by density factor", () => {
    const d = computeDensityMinDist(40, 200, 0.2, 0.6);
    expect(d).toBeGreaterThan(40); // low zoom = aggressive = larger distance
    expect(d).toBeLessThanOrEqual(200); // capped by maxDist
  });

  it("never exceeds maxDist", () => {
    expect(computeDensityMinDist(40, 100, 0.1, 0.6)).toBeLessThanOrEqual(100);
    expect(computeDensityMinDist(400, 100, 0.1, 0.6)).toBeLessThanOrEqual(100);
  });

  it("returns smaller distance at high zoom", () => {
    const low = computeDensityMinDist(40, 200, 0.2, 0.6);
    const high = computeDensityMinDist(40, 200, 2.0, 0.6);
    expect(high).toBeLessThan(low);
  });
});

// =========================================================================
// computeLodLevel — already exported, add edge case coverage
// =========================================================================
describe("computeLodLevel", () => {
  const thresholds = {
    cardLODExtremePx: 2,
    cardLODMidLabelPx: 4,
    cardLODNormalPx: 8,
    cardLODCompactPx: 16,
    cardLODFullCardPx: 32,
  };

  it("returns 0 for extreme zoom out", () => {
    expect(computeLodLevel(1, thresholds)).toBe(0);
    expect(computeLodLevel(0, thresholds)).toBe(0);
  });

  it("returns 5 for extreme zoom in", () => {
    expect(computeLodLevel(100, thresholds)).toBe(5);
    expect(computeLodLevel(32, thresholds)).toBe(5);
  });

  it("returns monotonically increasing levels", () => {
    const sizes = [1, 3, 5, 10, 20, 50];
    let prev = -1;
    for (const s of sizes) {
      const lod = computeLodLevel(s, thresholds);
      expect(lod).toBeGreaterThanOrEqual(prev);
      prev = lod;
    }
  });

  it("covers all 6 levels (0-5)", () => {
    const levels = new Set<number>();
    for (let px = 0; px <= 40; px++) {
      levels.add(computeLodLevel(px, thresholds));
    }
    expect(levels.size).toBe(6);
  });
});

// =========================================================================
// screenToWorld — coordinate transform
// =========================================================================
describe("screenToWorld", () => {
  it("divides screen px by world scale", () => {
    expect(screenToWorld(100, 2, 0)).toBe(50);
  });

  it("respects floor", () => {
    expect(screenToWorld(10, 2, 10)).toBe(10); // 10/2=5, floor=10 → 10
  });

  it("returns floor when result is below floor", () => {
    expect(screenToWorld(1, 10, 5)).toBe(5); // 1/10=0.1, floor=5 → 5
  });
});

// =========================================================================
// truncateLabel
// =========================================================================
describe("truncateLabel", () => {
  it("returns full text when short enough", () => {
    expect(truncateLabel("abc", 10)).toBe("abc");
  });

  it("truncates long text with ellipsis", () => {
    const result = truncateLabel("abcdefghijklm", 8);
    expect(result.length).toBeLessThanOrEqual(9); // 8 + "…"
    expect(result).toContain("…");
  });

  it("handles empty string", () => {
    expect(truncateLabel("", 5)).toBe("");
  });
});

// =========================================================================
// generateDisplacementOffsets
// =========================================================================
describe("generateDisplacementOffsets", () => {
  it("returns 12 offset candidates", () => {
    const offsets = generateDisplacementOffsets(60, 14, 10);
    expect(offsets).toHaveLength(12);
  });

  it("all offsets have dx and dy", () => {
    const offsets = generateDisplacementOffsets(60, 14, 10);
    for (const o of offsets) {
      expect(typeof o.dx).toBe("number");
      expect(typeof o.dy).toBe("number");
      expect(Number.isFinite(o.dx)).toBe(true);
      expect(Number.isFinite(o.dy)).toBe(true);
    }
  });

  it("offsets cover all 4 quadrants", () => {
    const offsets = generateDisplacementOffsets(50, 12, 8);
    const hasTopRight = offsets.some(o => o.dx > 0 && o.dy < 0);
    const hasTopLeft = offsets.some(o => o.dx < 0 && o.dy < 0);
    const hasBottomRight = offsets.some(o => o.dx > 0 && o.dy > 0);
    const hasBottomLeft = offsets.some(o => o.dx < 0 && o.dy > 0);
    expect(hasTopRight).toBe(true);
    expect(hasTopLeft).toBe(true);
    expect(hasBottomRight).toBe(true);
    expect(hasBottomLeft).toBe(true);
  });

  it("offsets scale with node radius", () => {
    const small = generateDisplacementOffsets(50, 12, 5);
    const large = generateDisplacementOffsets(50, 12, 20);
    // Larger radius should produce larger offsets (at least first entry)
    expect(Math.abs(large[0].dx) + Math.abs(large[0].dy))
      .toBeGreaterThan(Math.abs(small[0].dx) + Math.abs(small[0].dy));
  });

  it("offsets scale with label width", () => {
    const narrow = generateDisplacementOffsets(30, 12, 10);
    const wide = generateDisplacementOffsets(100, 12, 10);
    // Wider label should produce different offsets
    expect(wide[0].dx).not.toBe(narrow[0].dx);
  });
});

// =========================================================================
// LOD + density integration: zoom sweep
// =========================================================================
describe("LOD transition sweep", () => {
  const thresholds = {
    cardLODExtremePx: 2,
    cardLODMidLabelPx: 4,
    cardLODNormalPx: 8,
    cardLODCompactPx: 16,
    cardLODFullCardPx: 32,
  };
  const BASE_PX = 15; // typical NODE_SCREEN_PX_BASE

  it("LOD level is monotonically non-decreasing across zoom 0.1→5.0", () => {
    const zooms = [0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0];
    let prevLod = -1;
    for (const z of zooms) {
      const screenPx = BASE_PX * z;
      const lod = computeLodLevel(screenPx, thresholds);
      expect(lod).toBeGreaterThanOrEqual(prevLod);
      prevLod = lod;
    }
  });

  it("density scale is monotonically non-increasing across zoom sweep", () => {
    const T = 0.6;
    const zooms = [0.1, 0.2, 0.3, 0.5, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0];
    let prevScale = Infinity;
    for (const z of zooms) {
      const scale = computeDensityScale(z, T);
      expect(scale).toBeLessThanOrEqual(prevScale + 0.001); // tolerance for float
      prevScale = scale;
    }
  });

  it("LOD + density combination: low zoom = high density scale + low LOD", () => {
    const lowZoom = 0.15;
    const highZoom = 3.0;
    const T = 0.6;
    const lodLow = computeLodLevel(BASE_PX * lowZoom, thresholds);
    const lodHigh = computeLodLevel(BASE_PX * highZoom, thresholds);
    const densLow = computeDensityScale(lowZoom, T);
    const densHigh = computeDensityScale(highZoom, T);
    expect(lodLow).toBeLessThan(lodHigh);
    expect(densLow).toBeGreaterThan(densHigh);
  });

  it("all LOD levels reachable in sweep", () => {
    const levels = new Set<number>();
    for (let px = 0; px <= 50; px++) {
      levels.add(computeLodLevel(px, thresholds));
    }
    expect(levels.size).toBe(6); // 0-5
  });
});
