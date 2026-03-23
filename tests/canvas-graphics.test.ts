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

// ---------------------------------------------------------------------------
// CanvasGraphics — additional method coverage (cycle149)
// ---------------------------------------------------------------------------

describe("CanvasGraphics.lineStyle", () => {
  it("stores positional args (width, color, alpha)", () => {
    const g = new CanvasGraphics();
    g.lineStyle(2, 0xff0000, 0.5);
    const cmd = getCommands(g).find((c: any) => c.t === "lineStyle");
    expect(cmd).toEqual({ t: "lineStyle", width: 2, color: 0xff0000, alpha: 0.5 });
  });

  it("stores object-style args", () => {
    const g = new CanvasGraphics();
    g.lineStyle({ width: 3, color: 0x00ff00, alpha: 0.8, native: true });
    const cmd = getCommands(g).find((c: any) => c.t === "lineStyle");
    expect(cmd).toEqual({ t: "lineStyle", width: 3, color: 0x00ff00, alpha: 0.8, native: true });
  });

  it("defaults color to black and alpha to 1 when omitted", () => {
    const g = new CanvasGraphics();
    g.lineStyle(1);
    const cmd = getCommands(g).find((c: any) => c.t === "lineStyle");
    expect(cmd!.color).toBe(0x000000);
    expect(cmd!.alpha).toBe(1);
  });
});

describe("CanvasGraphics.beginFill / endFill", () => {
  it("stores beginFill with color and alpha", () => {
    const g = new CanvasGraphics();
    g.beginFill(0x0000ff, 0.7);
    const cmd = getCommands(g).find((c: any) => c.t === "beginFill");
    expect(cmd).toEqual({ t: "beginFill", color: 0x0000ff, alpha: 0.7 });
  });

  it("defaults alpha to 1", () => {
    const g = new CanvasGraphics();
    g.beginFill(0xffffff);
    const cmd = getCommands(g).find((c: any) => c.t === "beginFill");
    expect(cmd!.alpha).toBe(1);
  });

  it("stores endFill command", () => {
    const g = new CanvasGraphics();
    g.endFill();
    const cmd = getCommands(g).find((c: any) => c.t === "endFill");
    expect(cmd).toEqual({ t: "endFill" });
  });
});

describe("CanvasGraphics.arc", () => {
  it("stores arc parameters", () => {
    const g = new CanvasGraphics();
    g.arc(10, 20, 50, 0, Math.PI, true);
    const cmd = getCommands(g).find((c: any) => c.t === "arc");
    expect(cmd).toEqual({ t: "arc", cx: 10, cy: 20, r: 50, start: 0, end: Math.PI, ccw: true });
  });

  it("defaults ccw to false", () => {
    const g = new CanvasGraphics();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    const cmd = getCommands(g).find((c: any) => c.t === "arc");
    expect(cmd!.ccw).toBe(false);
  });
});

describe("CanvasGraphics.bezierCurveTo", () => {
  it("stores all six parameters", () => {
    const g = new CanvasGraphics();
    g.bezierCurveTo(1, 2, 3, 4, 5, 6);
    const cmd = getCommands(g).find((c: any) => c.t === "bezierCurveTo");
    expect(cmd).toEqual({ t: "bezierCurveTo", cp1x: 1, cp1y: 2, cp2x: 3, cp2y: 4, x: 5, y: 6 });
  });
});

describe("CanvasGraphics.quadraticCurveTo", () => {
  it("stores control and end points", () => {
    const g = new CanvasGraphics();
    g.quadraticCurveTo(10, 20, 30, 40);
    const cmd = getCommands(g).find((c: any) => c.t === "quadraticCurveTo");
    expect(cmd).toEqual({ t: "quadraticCurveTo", cx: 10, cy: 20, x: 30, y: 40 });
  });
});

describe("CanvasGraphics.moveTo / lineTo / closePath", () => {
  it("stores moveTo coordinates", () => {
    const g = new CanvasGraphics();
    g.moveTo(100, 200);
    const cmd = getCommands(g).find((c: any) => c.t === "moveTo");
    expect(cmd).toEqual({ t: "moveTo", x: 100, y: 200 });
  });

  it("stores lineTo coordinates", () => {
    const g = new CanvasGraphics();
    g.lineTo(50, 75);
    const cmd = getCommands(g).find((c: any) => c.t === "lineTo");
    expect(cmd).toEqual({ t: "lineTo", x: 50, y: 75 });
  });

  it("stores closePath command", () => {
    const g = new CanvasGraphics();
    g.closePath();
    const cmd = getCommands(g).find((c: any) => c.t === "closePath");
    expect(cmd).toEqual({ t: "closePath" });
  });
});

describe("CanvasGraphics.clear", () => {
  it("empties the command buffer (same as destroy)", () => {
    const g = new CanvasGraphics();
    g.drawCircle(0, 0, 5);
    g.drawRect(0, 0, 10, 10);
    expect(g.commandCount).toBe(2);
    g.clear();
    expect(g.commandCount).toBe(0);
  });
});

describe("CanvasGraphics.setLineDash", () => {
  it("stores dash segments", () => {
    const g = new CanvasGraphics();
    g.setLineDash([5, 3, 2]);
    const cmd = getCommands(g).find((c: any) => c.t === "setLineDash");
    expect(cmd).toEqual({ t: "setLineDash", segments: [5, 3, 2] });
  });

  it("stores empty segments for solid line", () => {
    const g = new CanvasGraphics();
    g.setLineDash([]);
    const cmd = getCommands(g).find((c: any) => c.t === "setLineDash");
    expect(cmd!.segments).toEqual([]);
  });
});

describe("CanvasGraphics.commandCount", () => {
  it("tracks accumulated commands", () => {
    const g = new CanvasGraphics();
    expect(g.commandCount).toBe(0);
    g.moveTo(0, 0);
    g.lineTo(10, 10);
    g.closePath();
    expect(g.commandCount).toBe(3);
  });
});
