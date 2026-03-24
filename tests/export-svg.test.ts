import { describe, it, expect } from "vitest";
import { exportGraphSVG } from "../src/utils/graph-helpers";

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
