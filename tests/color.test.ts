import { describe, it, expect } from "vitest";
import { hexToRgb, getLuminance, hexBrightness } from "../src/utils/color";

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
