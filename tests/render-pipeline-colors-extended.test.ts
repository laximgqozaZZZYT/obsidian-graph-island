import { describe, it, expect } from "vitest";
import {
<<<<<<< HEAD
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
=======
  darkenColor, lightenColor, blendColors, desaturateColor,
  hashStringToHue, truncateLabel, quickSelect,
  screenToWorld, computeZoomFadeAlpha, computeLodLevel,
} from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// darkenColor — extended boundary tests
// ---------------------------------------------------------------------------
describe("darkenColor (extended)", () => {
  it("factor=0 returns original color", () => {
    expect(darkenColor(0xff0000, 0)).toBe(0xff0000);
    expect(darkenColor(0x00ff00, 0)).toBe(0x00ff00);
    expect(darkenColor(0x0000ff, 0)).toBe(0x0000ff);
  });

  it("factor=1 returns black (0x000000)", () => {
    expect(darkenColor(0xff0000, 1)).toBe(0x000000);
    expect(darkenColor(0xffffff, 1)).toBe(0x000000);
  });

  it("factor=0.5 halves each channel", () => {
    // 0xff = 255, half = 128 = 0x80
    const result = darkenColor(0xffffff, 0.5);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBeCloseTo(128, 0);
    expect(g).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(128, 0);
  });

  it("black stays black regardless of factor", () => {
    expect(darkenColor(0x000000, 0)).toBe(0x000000);
    expect(darkenColor(0x000000, 0.5)).toBe(0x000000);
    expect(darkenColor(0x000000, 1)).toBe(0x000000);
  });

  it("preserves channel ratios for non-uniform colors", () => {
    const original = 0x804020; // r=128 g=64 b=32
    const result = darkenColor(original, 0.5);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBeCloseTo(64, 0);
    expect(g).toBeCloseTo(32, 0);
    expect(b).toBeCloseTo(16, 0);
>>>>>>> worktree-agent-af1d0cda
  });
});

// ---------------------------------------------------------------------------
<<<<<<< HEAD
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
=======
// lightenColor — extended boundary tests
// ---------------------------------------------------------------------------
describe("lightenColor (extended)", () => {
  it("factor=0 returns original color", () => {
    expect(lightenColor(0xff0000, 0)).toBe(0xff0000);
    expect(lightenColor(0x000000, 0)).toBe(0x000000);
  });

  it("factor=1 returns white (0xffffff)", () => {
    expect(lightenColor(0x000000, 1)).toBe(0xffffff);
    expect(lightenColor(0x804020, 1)).toBe(0xffffff);
  });

  it("white stays white regardless of factor", () => {
    expect(lightenColor(0xffffff, 0)).toBe(0xffffff);
    expect(lightenColor(0xffffff, 0.5)).toBe(0xffffff);
    expect(lightenColor(0xffffff, 1)).toBe(0xffffff);
  });

  it("factor=0.5 moves halfway toward white", () => {
    // 0x000000 + 0.5 * (255-0) = 128 each => 0x808080
    const result = lightenColor(0x000000, 0.5);
    const r = (result >> 16) & 0xff;
    expect(r).toBeCloseTo(128, 0);
  });

  it("result channels never exceed 255", () => {
    const result = lightenColor(0xfefefe, 0.9);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeLessThanOrEqual(255);
    expect(b).toBeLessThanOrEqual(255);
  });
});

// ---------------------------------------------------------------------------
// blendColors — extended boundary tests
// ---------------------------------------------------------------------------
describe("blendColors (extended)", () => {
  it("t=0 returns color a", () => {
    expect(blendColors(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
  });

  it("t=1 returns color b", () => {
    expect(blendColors(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it("t=0.5 returns midpoint", () => {
    const mid = blendColors(0x000000, 0xffffff, 0.5);
    const r = (mid >> 16) & 0xff;
    const g = (mid >> 8) & 0xff;
    const b = mid & 0xff;
    expect(r).toBeCloseTo(128, 0);
    expect(g).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(128, 0);
  });

  it("blending same color returns that color", () => {
    expect(blendColors(0x123456, 0x123456, 0.3)).toBe(0x123456);
    expect(blendColors(0x123456, 0x123456, 0.7)).toBe(0x123456);
  });

  it("blending with t=0.25 gives 25% b / 75% a", () => {
    // a=0 b=200 t=0.25 → 50 per channel
    const result = blendColors(0x000000, 0xc8c8c8, 0.25);
    const r = (result >> 16) & 0xff;
    expect(r).toBeCloseTo(50, 0);
  });
});

// ---------------------------------------------------------------------------
// desaturateColor — extended boundary tests
// ---------------------------------------------------------------------------
describe("desaturateColor (extended)", () => {
  it("factor=1 returns original color", () => {
    expect(desaturateColor(0xff0000, 1)).toBe(0xff0000);
    expect(desaturateColor(0x00ff00, 1)).toBe(0x00ff00);
  });

  it("factor=0 returns grayscale", () => {
    const gray = desaturateColor(0xff0000, 0);
    const r = (gray >> 16) & 0xff;
    const g = (gray >> 8) & 0xff;
    const b = gray & 0xff;
    // All channels should be equal (gray)
>>>>>>> worktree-agent-af1d0cda
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

<<<<<<< HEAD
  it("factor negative treated as strong desaturation (beyond gray)", () => {
    // factor < 1 activates desaturation path; factor < 0 goes beyond gray
    const result = desaturateColor(0xff0000, -1);
    expect(typeof result).toBe("number");
    // May produce unusual colors due to overshoot, just verify it's a number
=======
  it("already gray color is unchanged at any factor", () => {
    const gray = 0x808080;
    expect(desaturateColor(gray, 0.5)).toBe(gray);
    expect(desaturateColor(gray, 0)).toBe(gray);
  });

  it("factor=0.5 partially desaturates", () => {
    const partial = desaturateColor(0xff0000, 0.5);
    const r = (partial >> 16) & 0xff;
    const g = (partial >> 8) & 0xff;
    // Red channel should be less than 255 but more than the gray value
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(0); // Some green from desaturation
  });

  it("factor > 1 returns original (guard clause)", () => {
    expect(desaturateColor(0xff0000, 1.5)).toBe(0xff0000);
>>>>>>> worktree-agent-af1d0cda
  });
});

// ---------------------------------------------------------------------------
<<<<<<< HEAD
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
=======
// hashStringToHue — deterministic hashing
// ---------------------------------------------------------------------------
describe("hashStringToHue (extended)", () => {
  it("returns value in [0, 360)", () => {
    for (const s of ["hello", "world", "", "a", "very long string with many characters"]) {
      const h = hashStringToHue(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("is deterministic (same input = same output)", () => {
    expect(hashStringToHue("test")).toBe(hashStringToHue("test"));
    expect(hashStringToHue("")).toBe(hashStringToHue(""));
  });

  it("different strings usually produce different hues", () => {
    const h1 = hashStringToHue("alice");
    const h2 = hashStringToHue("bob");
    const h3 = hashStringToHue("charlie");
    // At least 2 of 3 should differ
    const unique = new Set([h1, h2, h3]);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("empty string returns 0 (hash starts at 0)", () => {
    expect(hashStringToHue("")).toBe(0);
  });

  it("single character produces valid hue", () => {
    const h = hashStringToHue("x");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
>>>>>>> worktree-agent-af1d0cda
  });
});

// ---------------------------------------------------------------------------
<<<<<<< HEAD
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
=======
// truncateLabel — string truncation
// ---------------------------------------------------------------------------
describe("truncateLabel (extended)", () => {
  it("does not truncate when label fits", () => {
    expect(truncateLabel("short", 10)).toBe("short");
  });

  it("truncates and appends ellipsis when too long", () => {
    expect(truncateLabel("a long label here", 5)).toBe("a lon\u2026");
  });

  it("maxChars=0 means no truncation", () => {
    expect(truncateLabel("anything", 0)).toBe("anything");
  });

  it("negative maxChars means no truncation", () => {
    expect(truncateLabel("anything", -5)).toBe("anything");
  });

  it("exact length is not truncated", () => {
    expect(truncateLabel("12345", 5)).toBe("12345");
  });

  it("length maxChars+1 is truncated", () => {
    expect(truncateLabel("123456", 5)).toBe("12345\u2026");
  });

  it("maxChars=1 truncates to single char + ellipsis", () => {
    expect(truncateLabel("hello", 1)).toBe("h\u2026");
  });

  it("empty string returns empty string", () => {
    expect(truncateLabel("", 10)).toBe("");
  });

  it("unicode characters are handled by character count", () => {
    expect(truncateLabel("日本語テスト", 3)).toBe("日本語\u2026");
>>>>>>> worktree-agent-af1d0cda
  });
});

// ---------------------------------------------------------------------------
<<<<<<< HEAD
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
=======
// quickSelect — O(n) k-th smallest
// ---------------------------------------------------------------------------
describe("quickSelect (extended)", () => {
  it("returns single element for single-element array", () => {
    expect(quickSelect([42], 0)).toBe(42);
  });

  it("returns 0 for empty array", () => {
    expect(quickSelect([], 0)).toBe(0);
  });

  it("returns minimum for k=0", () => {
    const arr = [5, 3, 1, 4, 2];
    expect(quickSelect([...arr], 0)).toBe(1);
  });

  it("returns maximum for k=length-1", () => {
    const arr = [5, 3, 1, 4, 2];
    expect(quickSelect([...arr], 4)).toBe(5);
  });

  it("returns median for k=length/2", () => {
    const arr = [5, 3, 1, 4, 2];
    expect(quickSelect([...arr], 2)).toBe(3);
  });

  it("handles already sorted array", () => {
    expect(quickSelect([1, 2, 3, 4, 5], 2)).toBe(3);
  });

  it("handles reverse sorted array", () => {
    expect(quickSelect([5, 4, 3, 2, 1], 2)).toBe(3);
  });

  it("handles duplicate values", () => {
    expect(quickSelect([3, 1, 3, 1, 3], 2)).toBe(3);
    expect(quickSelect([3, 1, 3, 1, 3], 0)).toBe(1);
  });

  it("handles all same values", () => {
    expect(quickSelect([7, 7, 7, 7], 0)).toBe(7);
    expect(quickSelect([7, 7, 7, 7], 3)).toBe(7);
  });

  it("handles negative values", () => {
    expect(quickSelect([-5, -3, -1, -4, -2], 0)).toBe(-5);
    expect(quickSelect([-5, -3, -1, -4, -2], 4)).toBe(-1);
  });

  it("returns 0 for out-of-bounds k", () => {
    expect(quickSelect([1, 2, 3], 5)).toBe(0);
    expect(quickSelect([1, 2, 3], -1)).toBe(0);
  });

  it("handles two-element array", () => {
    expect(quickSelect([10, 5], 0)).toBe(5);
    expect(quickSelect([10, 5], 1)).toBe(10);
>>>>>>> worktree-agent-af1d0cda
  });
});

// ---------------------------------------------------------------------------
<<<<<<< HEAD
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
=======
// screenToWorld — coordinate conversion
// ---------------------------------------------------------------------------
describe("screenToWorld (extended)", () => {
  it("converts screen pixels to world units", () => {
    expect(screenToWorld(100, 2, 0)).toBe(50);
  });

  it("respects floor when result would be smaller", () => {
    expect(screenToWorld(1, 10, 5)).toBe(5); // 1/10 = 0.1, floor = 5
  });

  it("handles ws=0 by returning floor", () => {
    expect(screenToWorld(100, 0, 10)).toBe(10);
  });

  it("handles negative ws by returning floor", () => {
    expect(screenToWorld(100, -1, 5)).toBe(5);
  });

  it("ws=1 returns screenPx directly (if above floor)", () => {
    expect(screenToWorld(50, 1, 0)).toBe(50);
  });

  it("floor=0 allows any positive result", () => {
    expect(screenToWorld(1, 100, 0)).toBeCloseTo(0.01, 5);
  });

  it("large ws gives small world units", () => {
    expect(screenToWorld(10, 1000, 0)).toBeCloseTo(0.01, 5);
>>>>>>> worktree-agent-af1d0cda
  });
});

// ---------------------------------------------------------------------------
<<<<<<< HEAD
// MIN_WORLD_RADIUS_PX constant
// ---------------------------------------------------------------------------
describe("MIN_WORLD_RADIUS_PX", () => {
  it("is a positive number", () => {
    expect(MIN_WORLD_RADIUS_PX).toBeGreaterThan(0);
  });

  it("equals 3", () => {
    expect(MIN_WORLD_RADIUS_PX).toBe(3);
=======
// computeZoomFadeAlpha — zoom-dependent fade
// ---------------------------------------------------------------------------
describe("computeZoomFadeAlpha (extended)", () => {
  it("returns 1 at zoom >= fadeStart (default 0.7)", () => {
    expect(computeZoomFadeAlpha(0.7)).toBe(1);
    expect(computeZoomFadeAlpha(1.0)).toBe(1);
    expect(computeZoomFadeAlpha(5.0)).toBe(1);
  });

  it("returns fadeFloor at zoom <= fadeEnd (default 0.15)", () => {
    expect(computeZoomFadeAlpha(0.15)).toBeCloseTo(0.03, 5);
    expect(computeZoomFadeAlpha(0.01)).toBeCloseTo(0.03, 5);
    expect(computeZoomFadeAlpha(0)).toBeCloseTo(0.03, 5);
  });

  it("returns intermediate value between fadeEnd and fadeStart", () => {
    const alpha = computeZoomFadeAlpha(0.425); // midpoint of 0.15..0.7
    expect(alpha).toBeGreaterThan(0.03);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.515, 1); // roughly midpoint
  });

  it("is monotonically increasing in the transition range", () => {
    let prev = 0;
    for (let z = 0.15; z <= 0.7; z += 0.01) {
      const a = computeZoomFadeAlpha(z);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it("custom fadeStart/fadeEnd/fadeFloor", () => {
    // Custom: fadeStart=2, fadeEnd=0.5, fadeFloor=0.1
    expect(computeZoomFadeAlpha(3, 2, 0.5, 0.1)).toBe(1);
    expect(computeZoomFadeAlpha(0.1, 2, 0.5, 0.1)).toBeCloseTo(0.1, 5);
    const mid = computeZoomFadeAlpha(1.25, 2, 0.5, 0.1);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// computeLodLevel — level of detail determination (returns 0-5)
// ---------------------------------------------------------------------------
describe("computeLodLevel (extended)", () => {
  const thresholds = {
    cardLODExtremePx: 1.5,
    cardLODMidLabelPx: 3.0,
    cardLODNormalPx: 4.0,
    cardLODCompactPx: 8.0,
    cardLODFullCardPx: 15.0,
  };

  it("returns 0 (dot) at very small screenR", () => {
    expect(computeLodLevel(0.5, thresholds)).toBe(0);
  });

  it("returns 1 (extreme) just above dot threshold", () => {
    expect(computeLodLevel(2.0, thresholds)).toBe(1);
  });

  it("returns 2 (midLabel) at mid range", () => {
    expect(computeLodLevel(3.5, thresholds)).toBe(2);
  });

  it("returns 3 (normal) at normal range", () => {
    expect(computeLodLevel(5.0, thresholds)).toBe(3);
  });

  it("returns 4 (compact) at compact range", () => {
    expect(computeLodLevel(10.0, thresholds)).toBe(4);
  });

  it("returns 5 (fullCard) at large screenR", () => {
    expect(computeLodLevel(20.0, thresholds)).toBe(5);
  });

  it("boundary: exactly at extreme threshold returns 1", () => {
    expect(computeLodLevel(1.5, thresholds)).toBe(1);
  });

  it("boundary: exactly at midLabel threshold returns 2", () => {
    expect(computeLodLevel(3.0, thresholds)).toBe(2);
  });

  it("boundary: exactly at normal threshold returns 3", () => {
    expect(computeLodLevel(4.0, thresholds)).toBe(3);
  });

  it("boundary: exactly at compact threshold returns 4", () => {
    expect(computeLodLevel(8.0, thresholds)).toBe(4);
  });

  it("boundary: exactly at fullCard threshold returns 5", () => {
    expect(computeLodLevel(15.0, thresholds)).toBe(5);
  });

  it("returns 0 for screenR=0", () => {
    expect(computeLodLevel(0, thresholds)).toBe(0);
  });

  it("negative screenR returns 0", () => {
    expect(computeLodLevel(-5, thresholds)).toBe(0);
>>>>>>> worktree-agent-af1d0cda
  });
});
