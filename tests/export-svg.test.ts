import { describe, it, expect } from "vitest";
import { exportGraphSVG, buildPositionMap, computeSvgViewBox, nodeColorHex } from "../src/utils/graph-helpers";

function mkNode(id: string, x: number, y: number, color?: number) {
  return { id, label: id, x, y, color };
}

function mkEdge(s: string, t: string) {
  return { source: s, target: t, type: "link" as any };
}

describe("exportGraphSVG", () => {
  it("returns valid SVG with xmlns", () => {
    const svg = exportGraphSVG([], []);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("includes background rect when specified", () => {
    const svg = exportGraphSVG([], [], { background: "#000" });
    expect(svg).toContain('fill="#000"');
  });

  it("omits background rect when background is empty", () => {
    const svg = exportGraphSVG([], [], { background: "" });
    expect(svg).not.toContain('<rect width="100%"');
  });

  it("renders nodes as circles", () => {
    const nodes = [mkNode("a", 100, 200), mkNode("b", 300, 400)];
    const svg = exportGraphSVG(nodes, []);
    expect(svg).toContain("<circle");
    // Two circles
    const circles = svg.match(/<circle/g);
    expect(circles?.length).toBe(2);
  });

  it("renders edges as lines", () => {
    const nodes = [mkNode("a", 0, 0), mkNode("b", 100, 100)];
    const edges = [mkEdge("a", "b")];
    const svg = exportGraphSVG(nodes, edges);
    expect(svg).toContain("<line");
  });

  it("skips edges with missing endpoint positions", () => {
    const nodes = [mkNode("a", 0, 0)];
    const edges = [mkEdge("a", "missing")];
    const svg = exportGraphSVG(nodes, edges);
    expect(svg).not.toContain("<line");
  });

  it("includes labels by default", () => {
    const nodes = [mkNode("hello", 50, 50)];
    const svg = exportGraphSVG(nodes, []);
    expect(svg).toContain("<text");
    expect(svg).toContain("hello");
  });

  it("omits labels when showLabels=false", () => {
    const nodes = [mkNode("hello", 50, 50)];
    const svg = exportGraphSVG(nodes, [], { showLabels: false });
    expect(svg).not.toContain("<text");
  });

  it("uses node color when provided", () => {
    const nodes = [mkNode("a", 0, 0, 0xff0000)];
    const svg = exportGraphSVG(nodes, []);
    expect(svg).toContain('fill="#ff0000"');
  });

  it("falls back to default color when no color", () => {
    const nodes = [mkNode("a", 0, 0)];
    const svg = exportGraphSVG(nodes, []);
    expect(svg).toContain('fill="#60a5fa"');
  });

  it("respects custom width/height", () => {
    const svg = exportGraphSVG([], [], { width: 1024, height: 768 });
    expect(svg).toContain('width="1024"');
    expect(svg).toContain('height="768"');
  });

  it("handles nodes without coordinates", () => {
    const nodes = [{ id: "no-pos", label: "no-pos" }];
    const svg = exportGraphSVG(nodes as any, []);
    // Should not crash, node without x/y is skipped
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("<circle");
  });

  it("escapes HTML entities in labels", () => {
    const nodes = [{ id: "a", label: 'a<b>"c"&d', x: 0, y: 0 }];
    const svg = exportGraphSVG(nodes, []);
    expect(svg).not.toContain("<b>");
    expect(svg).not.toContain('"c"');
  });

  it("handles d3 object-form source/target", () => {
    const nodes = [mkNode("a", 0, 0), mkNode("b", 100, 100)];
    const edges = [{ source: { id: "a" } as any, target: { id: "b" } as any }];
    const svg = exportGraphSVG(nodes, edges);
    expect(svg).toContain("<line");
  });

  it("scales nodes to fit within viewport", () => {
    const nodes = [mkNode("a", -1000, -1000), mkNode("b", 1000, 1000)];
    const svg = exportGraphSVG(nodes, [], { width: 400, height: 300 });
    // All coordinates should be within 0-400 / 0-300
    const cxMatches = svg.match(/cx="([^"]+)"/g) ?? [];
    for (const m of cxMatches) {
      const val = parseFloat(m.replace('cx="', ""));
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(400);
    }
  });

  it("produces valid SVG for large graph", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => mkNode(`n${i}`, i * 10, i * 5));
    const edges = Array.from({ length: 99 }, (_, i) => mkEdge(`n${i}`, `n${i + 1}`));
    const svg = exportGraphSVG(nodes, edges);
    expect(svg).toContain("</svg>");
    expect((svg.match(/<circle/g) ?? []).length).toBe(100);
    expect((svg.match(/<line/g) ?? []).length).toBe(99);
  });
});

// =========================================================================
// Edge cases
// =========================================================================
describe("exportGraphSVG edge cases", () => {
  it("empty graph produces valid SVG shell", () => {
    const svg = exportGraphSVG([], []);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain("<line");
  });

  it("single node with no edges", () => {
    const svg = exportGraphSVG([mkNode("a", 100, 200)], []);
    expect(svg).toContain("<circle");
    expect(svg).not.toContain("<line");
  });

  it("NaN coordinates are handled gracefully", () => {
    const svg = exportGraphSVG([mkNode("a", NaN, NaN)], []);
    // Should produce valid SVG (node may be skipped or positioned at 0,0)
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("angle brackets in labels are stripped", () => {
    const nodes = [{ id: "a", label: '<b>bold</b>', x: 0, y: 0 }];
    const svg = exportGraphSVG(nodes, []);
    // Implementation strips <>&" characters
    expect(svg).not.toContain("<b>");
    expect(svg).not.toContain("</b>");
    expect(svg).toContain("bold"); // text content preserved
  });

  it("very large coordinates produce valid SVG", () => {
    const svg = exportGraphSVG(
      [mkNode("a", 1e6, 1e6), mkNode("b", -1e6, -1e6)],
      [mkEdge("a", "b")],
    );
    expect(svg).toContain("<circle");
    expect(svg).toContain("<line");
  });

  it("zero dimensions option still produces SVG", () => {
    const svg = exportGraphSVG([mkNode("a", 0, 0)], [], { width: 0, height: 0 });
    expect(svg).toContain("<svg");
  });
});

// =========================================================================
// buildPositionMap
// =========================================================================
describe("buildPositionMap", () => {
  it("includes nodes with valid x,y", () => {
    const map = buildPositionMap([
      { id: "a", x: 10, y: 20 },
      { id: "b", x: 30, y: 40 },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("a")).toEqual({ x: 10, y: 20 });
  });

  it("skips nodes with null/undefined coordinates", () => {
    const map = buildPositionMap([
      { id: "a", x: 10, y: 20 },
      { id: "b", x: undefined, y: 30 },
      { id: "c" },
    ]);
    expect(map.size).toBe(1);
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(false);
  });

  it("returns empty map for empty input", () => {
    expect(buildPositionMap([]).size).toBe(0);
  });

  it("treats x=0, y=0 as valid", () => {
    const map = buildPositionMap([{ id: "origin", x: 0, y: 0 }]);
    expect(map.size).toBe(1);
    expect(map.get("origin")).toEqual({ x: 0, y: 0 });
  });
});

// =========================================================================
// computeSvgViewBox
// =========================================================================
describe("computeSvgViewBox", () => {
  it("returns transform functions that map to viewport", () => {
    const posMap = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 100, y: 100 }],
    ]);
    const { tx, ty } = computeSvgViewBox(posMap, 800, 600);
    // min point should map to pad (40)
    expect(tx(0)).toBeCloseTo(40, 1);
    expect(ty(0)).toBeCloseTo(40, 1);
    // max point should map to width/height - pad
    const maxTx = tx(100);
    const maxTy = ty(100);
    expect(maxTx).toBeLessThanOrEqual(800);
    expect(maxTy).toBeLessThanOrEqual(600);
  });

  it("handles empty position map (falls back to full viewport)", () => {
    const { tx, ty } = computeSvgViewBox(new Map(), 800, 600);
    expect(tx(0)).toBeCloseTo(40, 1);
    expect(ty(0)).toBeCloseTo(40, 1);
  });

  it("handles single point (dataW/dataH = 1 fallback)", () => {
    const posMap = new Map([["a", { x: 50, y: 50 }]]);
    const { tx, ty } = computeSvgViewBox(posMap, 400, 300);
    // Should not crash — single point means dataW = dataH = 1
    expect(typeof tx(50)).toBe("number");
    expect(typeof ty(50)).toBe("number");
  });

  it("respects custom padding", () => {
    const posMap = new Map([["a", { x: 0, y: 0 }]]);
    const { tx: tx10 } = computeSvgViewBox(posMap, 800, 600, 10);
    const { tx: tx80 } = computeSvgViewBox(posMap, 800, 600, 80);
    expect(tx10(0)).toBeCloseTo(10, 1);
    expect(tx80(0)).toBeCloseTo(80, 1);
  });
});

// =========================================================================
// nodeColorHex
// =========================================================================
describe("nodeColorHex", () => {
  it("converts numeric color to hex string", () => {
    expect(nodeColorHex(0xff0000)).toBe("#ff0000");
    expect(nodeColorHex(0x00ff00)).toBe("#00ff00");
    expect(nodeColorHex(0x0000ff)).toBe("#0000ff");
  });

  it("pads short hex values", () => {
    expect(nodeColorHex(0x000001)).toBe("#000001");
    expect(nodeColorHex(0)).toBe("#000000");
  });

  it("returns fallback for null/undefined", () => {
    expect(nodeColorHex(null)).toBe("#60a5fa");
    expect(nodeColorHex(undefined)).toBe("#60a5fa");
  });

  it("supports custom fallback", () => {
    expect(nodeColorHex(null, "#abc")).toBe("#abc");
    expect(nodeColorHex(undefined, "#123456")).toBe("#123456");
  });

  it("masks to 24-bit", () => {
    expect(nodeColorHex(0xffffffff)).toBe("#ffffff");
  });
});
