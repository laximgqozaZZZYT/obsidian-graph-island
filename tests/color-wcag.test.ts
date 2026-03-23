import { describe, it, expect } from "vitest";
import {
  hexToRgb, getLuminance, hexBrightness, adjustBrightness,
  wcagRelativeLuminance, wcagContrastRatio, contrastColor,
} from "../src/utils/color";

// hexToRgb tests consolidated in tests/color.test.ts

describe("getLuminance (BT.601)", () => {
  it("white = 255", () => {
    expect(getLuminance(255, 255, 255)).toBeCloseTo(255, 0);
  });
  it("black = 0", () => {
    expect(getLuminance(0, 0, 0)).toBe(0);
  });
  it("pure green has highest weight", () => {
    const green = getLuminance(0, 255, 0);
    const red = getLuminance(255, 0, 0);
    const blue = getLuminance(0, 0, 255);
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });
});

describe("wcagRelativeLuminance", () => {
  it("black = 0", () => {
    expect(wcagRelativeLuminance(0x000000)).toBeCloseTo(0, 3);
  });
  it("white = 1", () => {
    expect(wcagRelativeLuminance(0xffffff)).toBeCloseTo(1, 3);
  });
  it("mid-gray ≈ 0.2", () => {
    const lum = wcagRelativeLuminance(0x808080);
    expect(lum).toBeGreaterThan(0.15);
    expect(lum).toBeLessThan(0.25);
  });
});

describe("wcagContrastRatio", () => {
  it("black on white = 21:1", () => {
    const ratio = wcagContrastRatio(0x000000, 0xffffff);
    expect(ratio).toBeCloseTo(21, 0);
  });
  it("white on white = 1:1", () => {
    expect(wcagContrastRatio(0xffffff, 0xffffff)).toBeCloseTo(1, 1);
  });
  it("is commutative", () => {
    const r1 = wcagContrastRatio(0xff0000, 0x0000ff);
    const r2 = wcagContrastRatio(0x0000ff, 0xff0000);
    expect(r1).toBeCloseTo(r2, 5);
  });
  it("light text on dark bg meets 4.5:1", () => {
    // #e0e0e0 on #1a1a2e (our dark theme label colors)
    const ratio = wcagContrastRatio(0xe0e0e0, 0x1a1a2e);
    expect(ratio).toBeGreaterThan(4.5);
  });
  it("dark text on light bg meets 4.5:1", () => {
    // #222222 on #f0f0f4 (our light theme label colors)
    const ratio = wcagContrastRatio(0x222222, 0xf0f0f4);
    expect(ratio).toBeGreaterThan(4.5);
  });
});

describe("contrastColor", () => {
  it("returns black for white background", () => {
    expect(contrastColor(0xffffff)).toBe(0x000000);
  });
  it("returns white for black background", () => {
    expect(contrastColor(0x000000)).toBe(0xffffff);
  });
  it("returns white for dark blue background", () => {
    expect(contrastColor(0x1a1a2e)).toBe(0xffffff);
  });
  it("returns black for light gray background", () => {
    expect(contrastColor(0xf0f0f4)).toBe(0x000000);
  });
  it("always produces ratio >= 4.5:1", () => {
    const testColors = [0x000000, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0x808080, 0x1a1a2e, 0xf0f0f4];
    for (const bg of testColors) {
      const fg = contrastColor(bg);
      const ratio = wcagContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("returns white for medium-dark colors", () => {
    expect(contrastColor(0x333333)).toBe(0xffffff);
  });
  it("returns black for medium-light colors", () => {
    expect(contrastColor(0xcccccc)).toBe(0x000000);
  });
  it("handles pure red (high luminance → black)", () => {
    expect(contrastColor(0xff0000)).toBe(0x000000);
  });
  it("handles pure green (high luminance → black)", () => {
    expect(contrastColor(0x00ff00)).toBe(0x000000);
  });
});

describe("adjustBrightness", () => {
  it("factor 1 keeps color", () => {
    expect(adjustBrightness(0x808080, 1)).toBe(0x808080);
  });
  it("factor 2 doubles (capped at 255)", () => {
    expect(adjustBrightness(0x404040, 2)).toBe(0x808080);
  });
  it("factor 0 = black", () => {
    expect(adjustBrightness(0xffffff, 0)).toBe(0x000000);
  });
  it("brightens a dark color", () => {
    const result = adjustBrightness(0x333333, 2.0);
    const { r } = hexToRgb(result);
    expect(r).toBeGreaterThan(0x33);
  });
  it("darkens with factor < 1.0", () => {
    const result = adjustBrightness(0xaabbcc, 0.5);
    const orig = hexToRgb(0xaabbcc);
    const dark = hexToRgb(result);
    expect(dark.r).toBeLessThan(orig.r);
  });
});

// ---------------------------------------------------------------------------
// Edge cases (cycle110)
// ---------------------------------------------------------------------------
describe("wcagContrastRatio edge cases", () => {
  it("same color returns 1:1", () => {
    expect(wcagContrastRatio(0x336699, 0x336699)).toBeCloseTo(1, 2);
  });

  it("near-identical colors return ratio close to 1", () => {
    expect(wcagContrastRatio(0x808080, 0x818181)).toBeCloseTo(1, 1);
  });

  it("ratio is always >= 1", () => {
    const colors = [0x000000, 0x112233, 0xaabbcc, 0xffffff];
    for (const a of colors) {
      for (const b of colors) {
        expect(wcagContrastRatio(a, b)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("ratio range is [1, 21]", () => {
    expect(wcagContrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 0);
    expect(wcagContrastRatio(0x000000, 0x000000)).toBeCloseTo(1, 2);
  });
});

describe("wcagRelativeLuminance edge cases", () => {
  it("pure red has lower luminance than pure green", () => {
    expect(wcagRelativeLuminance(0xff0000)).toBeLessThan(wcagRelativeLuminance(0x00ff00));
  });

  it("returns value in [0, 1]", () => {
    for (const c of [0x000000, 0x808080, 0xff0000, 0xffffff]) {
      const l = wcagRelativeLuminance(c);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });
});

describe("hexBrightness edge cases", () => {
  it("returns 0 for black, ~255 for white", () => {
    expect(hexBrightness(0x000000)).toBe(0);
    expect(hexBrightness(0xffffff)).toBeCloseTo(255, 0);
  });

  it("green perceived brightest among primaries", () => {
    expect(hexBrightness(0x00ff00)).toBeGreaterThan(hexBrightness(0xff0000));
    expect(hexBrightness(0xff0000)).toBeGreaterThan(hexBrightness(0x0000ff));
  });
});
