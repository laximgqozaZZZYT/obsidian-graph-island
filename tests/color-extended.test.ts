import { describe, it, expect } from "vitest";
import { adjustBrightness, contrastColor, hexToRgb, getLuminance } from "../src/utils/color";

describe("adjustBrightness", () => {
  it("brightens a dark color", () => {
    const result = adjustBrightness(0x333333, 2.0);
    const { r } = hexToRgb(result);
    expect(r).toBeGreaterThan(0x33);
  });

  it("clamps to 255", () => {
    const result = adjustBrightness(0xffffff, 2.0);
    const { r, g, b } = hexToRgb(result);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeLessThanOrEqual(255);
    expect(b).toBeLessThanOrEqual(255);
  });

  it("factor 1.0 preserves color", () => {
    expect(adjustBrightness(0xaabbcc, 1.0)).toBe(0xaabbcc);
  });

  it("darkens with factor < 1.0", () => {
    const result = adjustBrightness(0xaabbcc, 0.5);
    const orig = hexToRgb(0xaabbcc);
    const dark = hexToRgb(result);
    expect(dark.r).toBeLessThan(orig.r);
    expect(dark.g).toBeLessThan(orig.g);
    expect(dark.b).toBeLessThan(orig.b);
  });

  it("factor 0 produces black", () => {
    expect(adjustBrightness(0xffffff, 0)).toBe(0x000000);
  });
});

describe("contrastColor", () => {
  it("returns black for light backgrounds", () => {
    expect(contrastColor(0xffffff)).toBe(0x000000);
  });

  it("returns white for dark backgrounds", () => {
    expect(contrastColor(0x000000)).toBe(0xffffff);
  });

  it("returns white for medium-dark colors", () => {
    expect(contrastColor(0x333333)).toBe(0xffffff);
  });

  it("returns black for medium-light colors", () => {
    expect(contrastColor(0xcccccc)).toBe(0x000000);
  });

  it("handles pure red correctly", () => {
    // WCAG relative luminance of red ≈ 0.2126 → black contrast 5.25:1 > white 4.0:1 → black wins
    expect(contrastColor(0xff0000)).toBe(0x000000);
  });

  it("handles pure green correctly", () => {
    // Green luminance = 255 * 0.587 = 149.685 > 128 → black
    expect(contrastColor(0x00ff00)).toBe(0x000000);
  });
});
