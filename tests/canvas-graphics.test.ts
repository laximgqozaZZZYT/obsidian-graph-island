import { describe, it, expect } from "vitest";
import { hexToRgba } from "../src/views/canvas2d/CanvasGraphics";

// ---------------------------------------------------------------------------
// hexToRgba — 24-bit hex + alpha → rgba() string
// ---------------------------------------------------------------------------
describe("hexToRgba", () => {
  it("converts white with full opacity", () => {
    const result = hexToRgba(0xffffff, 1.0);
    expect(result).toBe("rgba(255,255,255,1)");
  });

  it("converts black with full opacity", () => {
    const result = hexToRgba(0x000000, 1.0);
    expect(result).toBe("rgba(0,0,0,1)");
  });

  it("converts red with half opacity", () => {
    const result = hexToRgba(0xff0000, 0.5);
    // alpha is quantized: (0.5 * 255 + 0.5) | 0 = 128, 128/255 ≈ 0.502
    expect(result).toMatch(/^rgba\(255,0,0,0\.50/);
  });

  it("converts green with zero opacity", () => {
    const result = hexToRgba(0x00ff00, 0.0);
    expect(result).toBe("rgba(0,255,0,0)");
  });

  it("converts arbitrary hex color", () => {
    const result = hexToRgba(0x336699, 1.0);
    expect(result).toBe("rgba(51,102,153,1)");
  });

  it("returns cached result on repeated calls", () => {
    const r1 = hexToRgba(0xaabbcc, 0.8);
    const r2 = hexToRgba(0xaabbcc, 0.8);
    expect(r1).toBe(r2); // reference equality from cache
  });

  it("quantizes alpha to 8-bit precision", () => {
    // 0.1 * 255 + 0.5 = 26.0 → 26 / 255 ≈ 0.102
    const result = hexToRgba(0xffffff, 0.1);
    expect(result).toMatch(/^rgba\(255,255,255,0\.10/);
  });
});
