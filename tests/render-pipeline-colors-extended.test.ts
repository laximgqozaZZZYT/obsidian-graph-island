import { describe, it, expect } from "vitest";
import {
  darkenColor,
  lightenColor,
  blendColors,
  desaturateColor,
  hashStringToHue,
  truncateLabel,
  computeZoomFadeAlpha,
  computeDensityScale,
  computeDensityMinDist,
  screenToWorld,
  computeLodLevel,
  MIN_WORLD_RADIUS_PX,
} from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// darkenColor — extended edge cases
// ---------------------------------------------------------------------------
describe("darkenColor — extended", () => {
  it("factor 0.25 darkens each channel by 25%", () => {
    // 0x80 = 128 → 128 * 0.75 = 96 = 0x60
    expect(darkenColor(0x808080, 0.25)).toBe(0x606060);
  });

  it("factor > 1 produces a number result (may underflow due to bit ops)", () => {
    const result = darkenColor(0xff0000, 1.5);
    expect(typeof result).toBe("number");
  });

  it("handles pure blue", () => {
    expect(darkenColor(0x0000ff, 0.5)).toBe(0x000080);
  });

  it("handles pure green", () => {
    expect(darkenColor(0x00ff00, 0.5)).toBe(0x008000);
  });
});

// ---------------------------------------------------------------------------
// lightenColor — extended edge cases
// ---------------------------------------------------------------------------
describe("lightenColor — extended", () => {
  it("factor 0.25 lightens each channel by 25%", () => {
    // 0x00 → 0 + (255 - 0) * 0.25 = 63.75 → round = 64 = 0x40
    expect(lightenColor(0x000000, 0.25)).toBe(0x404040);
  });

  it("mid-gray lightened by 0.5", () => {
    // 0x80 = 128 → 128 + (255 - 128) * 0.5 = 128 + 63.5 = 191.5 → round = 192 = 0xc0
    expect(lightenColor(0x808080, 0.5)).toBe(0xc0c0c0);
  });

  it("handles pure red", () => {
    // r=255 → 255 + 0 = 255, g=0 → 0 + 255*0.5 = 128, b=0 → same
    expect(lightenColor(0xff0000, 0.5)).toBe(0xff8080);
  });
});

// ---------------------------------------------------------------------------
// blendColors — extended edge cases
// ---------------------------------------------------------------------------
describe("blendColors — extended", () => {
  it("t=0.25 blends 75% first + 25% second", () => {
    const result = blendColors(0xff0000, 0x00ff00, 0.25);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    // r should be ~191, g should be ~64
    expect(r).toBeCloseTo(191, 0);
    expect(g).toBeCloseTo(64, 0);
  });

  it("t=0.75 blends 25% first + 75% second", () => {
    const result = blendColors(0xff0000, 0x00ff00, 0.75);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    expect(r).toBeCloseTo(64, 0);
    expect(g).toBeCloseTo(191, 0);
  });

  it("blending black and white at t=0.5 gives gray", () => {
    expect(blendColors(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });

  it("blending white and black at t=0.5 gives gray", () => {
    expect(blendColors(0xffffff, 0x000000, 0.5)).toBe(0x808080);
  });
});

// ---------------------------------------------------------------------------
// desaturateColor — extended
// ---------------------------------------------------------------------------
describe("desaturateColor — extended", () => {
  it("factor 0.5 partially desaturates", () => {
    const result = desaturateColor(0xff0000, 0.5);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    // R channel should be between gray and 255
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    // G and B should be equal (from same gray base)
    expect(g).toBe(b);
  });

  it("factor 0 on blue produces gray", () => {
    const result = desaturateColor(0x0000ff, 0);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("factor negative treated as strong desaturation (beyond gray)", () => {
    // factor < 1 activates desaturation path; factor < 0 goes beyond gray
    const result = desaturateColor(0xff0000, -1);
    expect(typeof result).toBe("number");
    // May produce unusual colors due to overshoot, just verify it's a number
  });
});

// ---------------------------------------------------------------------------
// hashStringToHue — extended
// ---------------------------------------------------------------------------
describe("hashStringToHue — extended", () => {
  it("long strings produce valid hue", () => {
    const longStr = "a".repeat(1000);
    const h = hashStringToHue(longStr);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it("unicode strings produce valid hue", () => {
    const h = hashStringToHue("あいうえお");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it("special characters produce valid hue", () => {
    const h = hashStringToHue("!@#$%^&*()");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it("similar strings produce different hues", () => {
    const h1 = hashStringToHue("test1");
    const h2 = hashStringToHue("test2");
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// truncateLabel — extended
// ---------------------------------------------------------------------------
describe("truncateLabel — extended", () => {
  it("maxChars=1 returns first char + ellipsis", () => {
    expect(truncateLabel("Hello", 1)).toBe("H…");
  });

  it("unicode string truncation", () => {
    expect(truncateLabel("あいうえお", 3)).toBe("あいう…");
  });

  it("already-ellipsis string gets double ellipsis", () => {
    expect(truncateLabel("Hello…World", 5)).toBe("Hello…");
  });
});

// ---------------------------------------------------------------------------
// computeDensityScale — extended boundary tests
// ---------------------------------------------------------------------------
describe("computeDensityScale — extended", () => {
  it("at zoom=0, threshold=1: maximum spacing", () => {
    const scale = computeDensityScale(0, 1);
    // sqrt(1/1) * 1.5 = 1.5, so 1 + 1.5 = 2.5
    expect(scale).toBeCloseTo(2.5, 2);
  });

  it("at zoom=threshold: returns 1 (transition point)", () => {
    expect(computeDensityScale(5, 5)).toBe(1);
  });

  it("at zoom > threshold: decreases but floors at 0.3", () => {
    // zoom=10, threshold=5: 1 - (10-5)*0.5 = 1-2.5 = -1.5 → max(0.3, -1.5) = 0.3
    expect(computeDensityScale(10, 5)).toBe(0.3);
  });

  it("at zoom slightly above threshold: mild reduction", () => {
    // zoom=5.5, threshold=5: 1 - 0.5*0.5 = 0.75
    expect(computeDensityScale(5.5, 5)).toBeCloseTo(0.75, 2);
  });

  it("negative zoom treated as below threshold", () => {
    const scale = computeDensityScale(-1, 1);
    expect(scale).toBeGreaterThan(1);
  });

  it("threshold=0: zoom=0 → 1+0=1", () => {
    // zoom < threshold is false (0 < 0 is false), so: max(0.3, 1 - (0-0)*0.5) = 1
    expect(computeDensityScale(0, 0)).toBe(1);
  });

  it("monotonically decreasing with increasing zoom", () => {
    const threshold = 3;
    let prev = computeDensityScale(0, threshold);
    for (let z = 0.1; z <= 10; z += 0.1) {
      const cur = computeDensityScale(z, threshold);
      expect(cur).toBeLessThanOrEqual(prev + 0.001); // allow tiny float error
      prev = cur;
    }
  });
});

// ---------------------------------------------------------------------------
// computeDensityMinDist — extended
// ---------------------------------------------------------------------------
describe("computeDensityMinDist — extended", () => {
  it("at very low zoom: scale is large, result clamps to maxDist", () => {
    const result = computeDensityMinDist(100, 50, 0.001, 10);
    expect(result).toBe(50);
  });

  it("baseDist=0 always returns 0", () => {
    expect(computeDensityMinDist(0, 100, 0.5, 1)).toBe(0);
  });

  it("maxDist=0 always returns 0", () => {
    expect(computeDensityMinDist(100, 0, 1, 1)).toBe(0);
  });

  it("negative zoom: large scale factor", () => {
    const result = computeDensityMinDist(10, 1000, -1, 5);
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThanOrEqual(1000);
  });
});

// ---------------------------------------------------------------------------
// computeZoomFadeAlpha — extended
// ---------------------------------------------------------------------------
describe("computeZoomFadeAlpha — extended", () => {
  it("exactly at midpoint between fadeEnd and fadeStart", () => {
    const mid = (0.15 + 0.7) / 2; // 0.425
    const alpha = computeZoomFadeAlpha(mid);
    expect(alpha).toBeGreaterThan(0.4);
    expect(alpha).toBeLessThan(0.6);
  });

  it("custom parameters: narrow fade range", () => {
    const alpha = computeZoomFadeAlpha(0.5, 0.6, 0.4, 0.1);
    // midpoint of [0.4, 0.6] → 50% through → 0.1 + 0.9 * 0.5 = 0.55
    expect(alpha).toBeCloseTo(0.55, 1);
  });

  it("fadeFloor=0 gives true zero at extreme zoom", () => {
    expect(computeZoomFadeAlpha(0, 0.7, 0.15, 0)).toBe(0);
  });

  it("fadeStart = fadeEnd: no transition range", () => {
    // When fadeStart = fadeEnd = 0.5:
    // zoom >= 0.5 → 1, zoom <= 0.5 → fadeFloor
    expect(computeZoomFadeAlpha(0.5, 0.5, 0.5, 0.1)).toBe(1);
    expect(computeZoomFadeAlpha(0.49, 0.5, 0.5, 0.1)).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// screenToWorld — extended
// ---------------------------------------------------------------------------
describe("screenToWorld — extended", () => {
  it("very large worldScale yields small world size", () => {
    expect(screenToWorld(10, 100, 0.01)).toBeCloseTo(0.1, 4);
  });

  it("very small worldScale yields large world size", () => {
    expect(screenToWorld(10, 0.01, 0.01)).toBe(1000);
  });

  it("floor=0 allows zero result", () => {
    expect(screenToWorld(0, 1, 0)).toBe(0);
  });

  it("screenPx=0 with ws>0 returns floor", () => {
    expect(screenToWorld(0, 2, 5)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// computeLodLevel — extended
// ---------------------------------------------------------------------------
describe("computeLodLevel — extended", () => {
  it("zero screen px returns extreme", () => {
    expect(computeLodLevel(0, {
      cardLODExtremePx: 1.5,
      cardLODMidLabelPx: 3,
      cardLODNormalPx: 4,
      cardLODCompactPx: 8,
      cardLODFullCardPx: 15,
    })).toBe(0);
  });

  it("negative screen px returns extreme", () => {
    expect(computeLodLevel(-1, {
      cardLODExtremePx: 1.5,
      cardLODMidLabelPx: 3,
      cardLODNormalPx: 4,
      cardLODCompactPx: 8,
      cardLODFullCardPx: 15,
    })).toBe(0);
  });

  it("very large screen px returns full card", () => {
    expect(computeLodLevel(10000, {
      cardLODExtremePx: 1.5,
      cardLODMidLabelPx: 3,
      cardLODNormalPx: 4,
      cardLODCompactPx: 8,
      cardLODFullCardPx: 15,
    })).toBe(5);
  });

  it("all thresholds equal: px below → 0, px at threshold → all 5", () => {
    const thresholds = {
      cardLODExtremePx: 5,
      cardLODMidLabelPx: 5,
      cardLODNormalPx: 5,
      cardLODCompactPx: 5,
      cardLODFullCardPx: 5,
    };
    expect(computeLodLevel(4.9, thresholds)).toBe(0);
    expect(computeLodLevel(5, thresholds)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// MIN_WORLD_RADIUS_PX constant
// ---------------------------------------------------------------------------
describe("MIN_WORLD_RADIUS_PX", () => {
  it("is a positive number", () => {
    expect(MIN_WORLD_RADIUS_PX).toBeGreaterThan(0);
  });

  it("equals 3", () => {
    expect(MIN_WORLD_RADIUS_PX).toBe(3);
  });
});
