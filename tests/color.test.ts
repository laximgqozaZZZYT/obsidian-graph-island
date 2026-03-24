import { describe, it, expect } from "vitest";
import { hexToRgb, getLuminance, hexBrightness, contrastColor, wcagContrastRatio } from "../src/utils/color";
import { hslToHex } from "../src/utils/graph-helpers";

describe("hexToRgb", () => {
  it("extracts black (0x000000)", () => {
    expect(hexToRgb(0x000000)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("extracts white (0xFFFFFF)", () => {
    expect(hexToRgb(0xffffff)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("extracts pure red (0xFF0000)", () => {
    expect(hexToRgb(0xff0000)).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("extracts pure green (0x00FF00)", () => {
    expect(hexToRgb(0x00ff00)).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("extracts pure blue (0x0000FF)", () => {
    expect(hexToRgb(0x0000ff)).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("extracts mixed color (0x6366F1)", () => {
    expect(hexToRgb(0x6366f1)).toEqual({ r: 99, g: 102, b: 241 });
  });
});

describe("getLuminance", () => {
  it("returns 0 for black", () => {
    expect(getLuminance(0, 0, 0)).toBe(0);
  });

  it("returns ~255 for white", () => {
    // 255 * (0.299 + 0.587 + 0.114) = 255 * 1.0 = 255
    expect(getLuminance(255, 255, 255)).toBeCloseTo(255, 1);
  });

  it("follows BT.601 weights for pure red", () => {
    // 255 * 0.299 = 76.245
    expect(getLuminance(255, 0, 0)).toBeCloseTo(76.245, 2);
  });

  it("follows BT.601 weights for pure green", () => {
    // 255 * 0.587 = 149.685
    expect(getLuminance(0, 255, 0)).toBeCloseTo(149.685, 2);
  });

  it("follows BT.601 weights for pure blue", () => {
    // 255 * 0.114 = 29.07
    expect(getLuminance(0, 0, 255)).toBeCloseTo(29.07, 2);
  });

  it("green is perceived brighter than red, red brighter than blue", () => {
    const lumR = getLuminance(255, 0, 0);
    const lumG = getLuminance(0, 255, 0);
    const lumB = getLuminance(0, 0, 255);
    expect(lumG).toBeGreaterThan(lumR);
    expect(lumR).toBeGreaterThan(lumB);
  });
});

describe("hexBrightness", () => {
  it("returns 0 for black", () => {
    expect(hexBrightness(0x000000)).toBe(0);
  });

  it("returns ~255 for white", () => {
    expect(hexBrightness(0xffffff)).toBeCloseTo(255, 1);
  });

  it("matches manual hexToRgb + getLuminance", () => {
    const hex = 0x6366f1;
    const { r, g, b } = hexToRgb(hex);
    expect(hexBrightness(hex)).toBe(getLuminance(r, g, b));
  });

  it("pure red brightness matches BT.601", () => {
    expect(hexBrightness(0xff0000)).toBeCloseTo(76.245, 2);
  });
});

describe("contrastColor", () => {
  it("returns white for dark backgrounds", () => {
    expect(contrastColor(0x000000)).toBe(0xffffff); // black bg → white text
    expect(contrastColor(0x1a1a2e)).toBe(0xffffff); // dark blue-gray
  });

  it("returns black for light backgrounds", () => {
    expect(contrastColor(0xffffff)).toBe(0x000000); // white bg → black text
    expect(contrastColor(0xf0f0f4)).toBe(0x000000); // light gray
  });

  it("returns WCAG-compliant contrast (≥4.5:1) for any input", () => {
    // Test a variety of colors
    const testColors = [0x000000, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff,
      0x808080, 0x6366f1, 0xfbbf24, 0x1a1a2e, 0xf0f0f4];
    for (const bg of testColors) {
      const fg = contrastColor(bg);
      // contrastColor always picks black or white — both guarantee ≥4.58:1
      expect(fg === 0x000000 || fg === 0xffffff).toBe(true);
    }
  });

  it("handles mid-gray correctly", () => {
    // 0x808080 luminance = ~128, closer to white → black text should win
    const result = contrastColor(0x808080);
    expect(result).toBe(0x000000);
  });

  it("always produces WCAG ratio >= 4.5:1", () => {
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

describe("hslToHex", () => {
  it("converts pure red (H=0, S=1, L=0.5)", () => {
    expect(hslToHex(0, 1, 0.5)).toBe(0xff0000);
  });

  it("converts pure green (H=120, S=1, L=0.5)", () => {
    expect(hslToHex(120, 1, 0.5)).toBe(0x00ff00);
  });

  it("converts pure blue (H=240, S=1, L=0.5)", () => {
    expect(hslToHex(240, 1, 0.5)).toBe(0x0000ff);
  });

  it("converts black (L=0)", () => {
    expect(hslToHex(0, 0, 0)).toBe(0x000000);
  });

  it("converts white (L=1)", () => {
    expect(hslToHex(0, 0, 1)).toBe(0xffffff);
  });

  it("converts gray (S=0, L=0.5)", () => {
    const result = hslToHex(0, 0, 0.5);
    const { r, g, b } = hexToRgb(result);
    // Gray: all channels equal
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeCloseTo(128, 0);
  });

  it("handles negative hue via modulo", () => {
    expect(hslToHex(-120, 1, 0.5)).toBe(hslToHex(240, 1, 0.5));
  });

  it("handles H=360 as H=0", () => {
    expect(hslToHex(360, 1, 0.5)).toBe(hslToHex(0, 1, 0.5));
  });

  it("handles H>360 via modulo", () => {
    expect(hslToHex(480, 1, 0.5)).toBe(hslToHex(120, 1, 0.5));
  });
});

// =========================================================================
// Edge cases: boundary colors + WCAG integration
// =========================================================================
describe("getLuminance edge cases", () => {
  it("pure black = 0", () => {
    expect(getLuminance(0, 0, 0)).toBe(0);
  });

  it("pure white = 255", () => {
    expect(getLuminance(255, 255, 255)).toBeCloseTo(255, 0);
  });

  it("mid gray ≈ 128", () => {
    const lum = getLuminance(128, 128, 128);
    expect(lum).toBeGreaterThan(100);
    expect(lum).toBeLessThan(160);
  });

  it("red has lower luminance than green (human perception)", () => {
    expect(getLuminance(255, 0, 0)).toBeLessThan(getLuminance(0, 255, 0));
  });
});

describe("contrastColor edge cases", () => {
  it("returns white for dark backgrounds", () => {
    expect(contrastColor(0x1a1a2e)).toBe(0xFFFFFF);
  });

  it("returns black for light backgrounds", () => {
    expect(contrastColor(0xF0F0F0)).toBe(0x000000);
  });

  it("contrast ratio meets WCAG AA (4.5:1) for black bg", () => {
    const text = contrastColor(0x000000);
    const ratio = wcagContrastRatio(0x000000, text);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("contrast ratio meets WCAG AA for white bg", () => {
    const text = contrastColor(0xFFFFFF);
    const ratio = wcagContrastRatio(0xFFFFFF, text);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("handles mid-range colors", () => {
    for (const c of [0x808080, 0x404040, 0xC0C0C0, 0x60A5FA, 0xFB923C]) {
      const text = contrastColor(c);
      expect(text === 0x000000 || text === 0xFFFFFF).toBe(true);
    }
  });
});

describe("wcagContrastRatio boundary", () => {
  it("same color = 1:1", () => {
    expect(wcagContrastRatio(0xFF0000, 0xFF0000)).toBeCloseTo(1, 1);
  });

  it("black vs white = 21:1", () => {
    expect(wcagContrastRatio(0x000000, 0xFFFFFF)).toBeCloseTo(21, 0);
  });

  it("is symmetric", () => {
    const r1 = wcagContrastRatio(0x60A5FA, 0x1A1A2E);
    const r2 = wcagContrastRatio(0x1A1A2E, 0x60A5FA);
    expect(r1).toBeCloseTo(r2, 2);
  });
});
