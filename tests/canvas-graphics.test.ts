import { describe, it, expect } from "vitest";
import { hexToRgba, CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";

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

// ---------------------------------------------------------------------------
// CanvasGraphics — command buffer boundary values
// ---------------------------------------------------------------------------

function getCommands(g: CanvasGraphics): any[] {
  return (g as any).commands;
}

describe("CanvasGraphics.drawCircle", () => {
  it("stores positive radius as-is", () => {
    const g = new CanvasGraphics();
    g.drawCircle(10, 20, 5);
    const cmd = getCommands(g).find((c: any) => c.t === "drawCircle");
    expect(cmd).toEqual({ t: "drawCircle", x: 10, y: 20, r: 5 });
  });

  it("clamps negative radius to 0", () => {
    const g = new CanvasGraphics();
    g.drawCircle(0, 0, -10);
    const cmd = getCommands(g).find((c: any) => c.t === "drawCircle");
    expect(cmd.r).toBe(0);
  });

  it("allows zero radius", () => {
    const g = new CanvasGraphics();
    g.drawCircle(5, 5, 0);
    const cmd = getCommands(g).find((c: any) => c.t === "drawCircle");
    expect(cmd.r).toBe(0);
  });
});

describe("CanvasGraphics.drawRoundedRect", () => {
  it("stores positive dimensions as-is", () => {
    const g = new CanvasGraphics();
    g.drawRoundedRect(10, 20, 100, 50, 8);
    const cmd = getCommands(g).find((c: any) => c.t === "roundedRect");
    expect(cmd).toEqual({ t: "roundedRect", x: 10, y: 20, w: 100, h: 50, r: 8 });
  });

  it("takes absolute value of negative width/height", () => {
    const g = new CanvasGraphics();
    g.drawRoundedRect(0, 0, -100, -50, 5);
    const cmd = getCommands(g).find((c: any) => c.t === "roundedRect");
    expect(cmd.w).toBe(100);
    expect(cmd.h).toBe(50);
  });

  it("clamps negative border radius to 0", () => {
    const g = new CanvasGraphics();
    g.drawRoundedRect(0, 0, 80, 40, -5);
    const cmd = getCommands(g).find((c: any) => c.t === "roundedRect");
    expect(cmd.r).toBe(0);
  });

  it("allows zero dimensions", () => {
    const g = new CanvasGraphics();
    g.drawRoundedRect(0, 0, 0, 0, 0);
    const cmd = getCommands(g).find((c: any) => c.t === "roundedRect");
    expect(cmd).toEqual({ t: "roundedRect", x: 0, y: 0, w: 0, h: 0, r: 0 });
  });
});

describe("CanvasGraphics.drawRect", () => {
  it("stores dimensions without modification", () => {
    const g = new CanvasGraphics();
    g.drawRect(5, 10, 200, 100);
    const cmd = getCommands(g).find((c: any) => c.t === "drawRect");
    expect(cmd).toEqual({ t: "drawRect", x: 5, y: 10, w: 200, h: 100 });
  });

  it("handles zero-size rect", () => {
    const g = new CanvasGraphics();
    g.drawRect(0, 0, 0, 0);
    const cmd = getCommands(g).find((c: any) => c.t === "drawRect");
    expect(cmd.w).toBe(0);
    expect(cmd.h).toBe(0);
  });
});

describe("CanvasGraphics.destroy", () => {
  it("clears all commands", () => {
    const g = new CanvasGraphics();
    g.drawCircle(0, 0, 10);
    g.drawRect(0, 0, 50, 50);
    expect(getCommands(g).length).toBe(2);
    g.destroy();
    expect(getCommands(g).length).toBe(0);
  });
});
