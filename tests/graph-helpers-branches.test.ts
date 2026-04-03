/**
 * graph-helpers — tests targeting uncovered branches in covered functions:
 * - shiftHue HSV sector branches
 * - exportGraphCSV/Mermaid/SVG with object-typed source/target
 * - computeGaps edge cases
 * - buildTagMembership edge cases
 * - buildMissingNeighborSet edge cases
 * - computeAutoFitTransform edge cases
 */
import { describe, it, expect } from "vitest";
import {
  shiftHue,
  exportGraphCSV,
  exportGraphMermaid,
  exportGraphSVG,
  computeGaps,
  buildTagMembership,
  buildMissingNeighborSet,
  computeAutoFitTransform,
  buildAdj,
} from "../src/utils/graph-helpers";
import type { GraphNode, GraphEdge } from "../src/types";

function node(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides } as GraphNode;
}

function edge(s: string, t: string, type = "link", extra?: Partial<GraphEdge>): GraphEdge {
  return { source: s, target: t, type, ...extra } as GraphEdge;
}

// ---------------------------------------------------------------------------
// shiftHue — trigger all 6 HSV sectors + negative degree + gray input
// ---------------------------------------------------------------------------
describe("shiftHue sector branches", () => {
  it("sector 0: max=R, g>=b (pure red, shift 0)", () => {
    const result = shiftHue(0xff0000, 0);
    expect(result).toBe(0xff0000);
  });

  it("sector 0: max=R, g<b (red-blue mix)", () => {
    // When max=R and g < b → h wraps via +6
    const result = shiftHue(0xff0080, 0); // R=255, G=0, B=128
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("sector 1: max=G (pure green, shift 0)", () => {
    const result = shiftHue(0x00ff00, 0);
    expect(result).toBe(0x00ff00);
  });

  it("sector 2: max=B (pure blue, shift 0)", () => {
    const result = shiftHue(0x0000ff, 0);
    expect(result).toBe(0x0000ff);
  });

  it("handles shift by 120 degrees (R→G)", () => {
    const result = shiftHue(0xff0000, 120);
    // Should be close to green
    const g = (result >> 8) & 0xff;
    expect(g).toBeGreaterThan(200);
  });

  it("handles shift by 240 degrees (R→B)", () => {
    const result = shiftHue(0xff0000, 240);
    const b = result & 0xff;
    expect(b).toBeGreaterThan(200);
  });

  it("handles negative degrees", () => {
    const result = shiftHue(0xff0000, -120);
    // -120 → 240, should be close to blue
    const b = result & 0xff;
    expect(b).toBeGreaterThan(200);
  });

  it("handles gray input (no saturation, d=0)", () => {
    const result = shiftHue(0x808080, 90);
    // Gray has no hue, shifting has no effect on saturation
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(Math.abs(r - g)).toBeLessThan(5);
    expect(Math.abs(g - b)).toBeLessThan(5);
  });

  it("handles black input", () => {
    expect(shiftHue(0x000000, 90)).toBe(0x000000);
  });

  it("handles white input", () => {
    const result = shiftHue(0xffffff, 60);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    // White has max saturation=0, so shift produces no color change
    expect(Math.abs(r - g)).toBeLessThan(3);
    expect(Math.abs(g - b)).toBeLessThan(3);
  });

  it("sector 3: cyan-ish (max=G, B close)", () => {
    const result = shiftHue(0x00ffcc, 0);
    expect(typeof result).toBe("number");
  });

  it("sector 4: magenta-ish (max=B, R present)", () => {
    const result = shiftHue(0x8000ff, 0);
    expect(typeof result).toBe("number");
  });

  it("sector 5: yellow-ish (max=R, G close)", () => {
    const result = shiftHue(0xffff00, 0);
    expect(typeof result).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// exportGraphCSV — object-typed source/target, undefined fields
// ---------------------------------------------------------------------------
describe("exportGraphCSV branch coverage", () => {
  it("handles nodes with undefined tags", () => {
    const nodes = [node("a.md", { x: 10, y: 20 })]; // tags undefined
    const csv = exportGraphCSV(nodes, []);
    expect(csv).toContain("a.md");
    // tags column should be empty
    const dataLine = csv.split("\n").find(l => l.startsWith("a.md"));
    expect(dataLine).toBeDefined();
  });

  it("handles nodes with tags array", () => {
    const nodes = [node("a.md", { x: 10, y: 20, tags: ["tag1", "tag2"] })];
    const csv = exportGraphCSV(nodes, []);
    expect(csv).toContain("tag1;tag2");
  });

  it("handles nodes with undefined category", () => {
    const nodes = [node("a.md", { x: 10, y: 20 })];
    const csv = exportGraphCSV(nodes, []);
    // category column should be empty
    expect(csv).toContain(",a.md,,");
  });

  it("handles nodes with category", () => {
    const nodes = [node("a.md", { x: 10, y: 20, category: "char" })];
    const csv = exportGraphCSV(nodes, []);
    expect(csv).toContain(",char,");
  });

  it("handles edges with object-type source/target", () => {
    const nodes = [node("a.md", { x: 0, y: 0 }), node("b.md", { x: 10, y: 10 })];
    const edges = [{ source: { id: "a.md" } as any, target: { id: "b.md" } as any, type: "link" }] as GraphEdge[];
    const csv = exportGraphCSV(nodes, edges);
    expect(csv).toContain("a.md,b.md,link");
  });

  it("handles edges with undefined type", () => {
    const nodes = [node("a.md"), node("b.md")];
    const edges = [{ source: "a.md", target: "b.md" } as GraphEdge];
    const csv = exportGraphCSV(nodes, edges);
    expect(csv).toContain("link"); // falls back to "link"
  });

  it("handles edges with label containing comma", () => {
    const nodes = [node("a.md"), node("b.md")];
    const edges = [{ source: "a.md", target: "b.md", type: "link", label: "hello, world" } as GraphEdge];
    const csv = exportGraphCSV(nodes, edges);
    // comma in label should be replaced with space
    expect(csv).toContain("hello  world");
  });

  it("handles edges with undefined label", () => {
    const nodes = [node("a.md"), node("b.md")];
    const edges = [edge("a.md", "b.md")];
    const csv = exportGraphCSV(nodes, edges);
    // Should not throw, label defaults to ""
    expect(csv).toContain("a.md,b.md,link,");
  });
});

// ---------------------------------------------------------------------------
// exportGraphMermaid — edge type arrows and object source/target
// ---------------------------------------------------------------------------
describe("exportGraphMermaid branch coverage", () => {
  it("uses -->|is-a| for inheritance edges", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b", "inheritance")];
    const mermaid = exportGraphMermaid(nodes, edges);
    expect(mermaid).toContain("-->|is-a|");
  });

  it("uses -->|has-a| for aggregation edges", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b", "aggregation")];
    const mermaid = exportGraphMermaid(nodes, edges);
    expect(mermaid).toContain("-->|has-a|");
  });

  it("uses --> for other edge types", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b", "link")];
    const mermaid = exportGraphMermaid(nodes, edges);
    expect(mermaid).toContain("-->");
    expect(mermaid).not.toContain("-->|");
  });

  it("handles object-type source/target", () => {
    const nodes = [node("a"), node("b")];
    const edges = [{ source: { id: "a" } as any, target: { id: "b" } as any, type: "link" }] as GraphEdge[];
    const mermaid = exportGraphMermaid(nodes, edges);
    expect(mermaid).toContain("a -->");
  });

  it("skips edges referencing nodes not in slice", () => {
    const nodes = [node("a")];
    const edges = [edge("a", "external")];
    const mermaid = exportGraphMermaid(nodes, edges);
    // Edge should not appear since "external" is not in nodes
    expect(mermaid).not.toContain("external");
  });

  it("limits to 500 edges", () => {
    const nodes = [node("a"), node("b")];
    const edges = Array.from({ length: 600 }, () => edge("a", "b"));
    const mermaid = exportGraphMermaid(nodes, edges);
    const edgeLines = mermaid.split("\n").filter(l => l.includes("-->"));
    expect(edgeLines.length).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// exportGraphSVG — labels disabled, no positions
// ---------------------------------------------------------------------------
describe("exportGraphSVG branch coverage", () => {
  it("omits labels when showLabels is false", () => {
    const nodes = [{ id: "a", label: "A", x: 10, y: 20 }];
    const svg = exportGraphSVG(nodes, [], { showLabels: false });
    expect(svg).not.toContain("<text");
    expect(svg).toContain("<circle");
  });

  it("skips nodes without position in labels/circles", () => {
    const nodes = [{ id: "a", label: "A" }]; // no x, y
    const svg = exportGraphSVG(nodes, []);
    // Node should be skipped in rendering
    expect(svg).not.toContain("cx=");
  });

  it("uses custom node color", () => {
    const nodes = [{ id: "a", x: 0, y: 0, color: 0xff0000 }];
    const svg = exportGraphSVG(nodes, []);
    expect(svg).toContain('fill="#ff0000"');
  });

  it("uses default color when no color specified", () => {
    const nodes = [{ id: "a", x: 0, y: 0 }];
    const svg = exportGraphSVG(nodes, []);
    expect(svg).toContain('fill="#60a5fa"');
  });

  it("transparent background when empty string", () => {
    const svg = exportGraphSVG([], [], { background: "" });
    expect(svg).not.toContain('<rect');
  });
});

// ---------------------------------------------------------------------------
// computeGaps — structural gap detection (nodes sharing tags but no common neighbor)
// ---------------------------------------------------------------------------
describe("computeGaps branch coverage", () => {
  it("returns empty when no nodes", () => {
    const gaps = computeGaps([], new Map());
    expect(gaps).toEqual([]);
  });

  it("returns empty when nodes have no tags", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const gaps = computeGaps(nodes, new Map());
    expect(gaps).toEqual([]);
  });

  it("returns empty when tagged nodes are directly connected", () => {
    const nodes = [
      { id: "a", tags: ["t1"] },
      { id: "b", tags: ["t1"] },
    ];
    const adj = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])],
    ]);
    const gaps = computeGaps(nodes, adj);
    expect(gaps).toEqual([]);
  });

  it("detects gap when tag-sharing nodes have common neighbor but no direct edge", () => {
    // a and b share tag "t1", both connect to c, but not to each other
    const nodes = [
      { id: "a", tags: ["t1"] },
      { id: "b", tags: ["t1"] },
    ];
    const adj = new Map([
      ["a", new Set(["c"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a", "b"])],
    ]);
    const gaps = computeGaps(nodes, adj);
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("returns empty when tagged nodes have no common neighbor", () => {
    const nodes = [
      { id: "a", tags: ["t1"] },
      { id: "b", tags: ["t1"] },
    ];
    const adj = new Map([
      ["a", new Set(["x"])],
      ["b", new Set(["y"])],
    ]);
    const gaps = computeGaps(nodes, adj);
    expect(gaps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTagMembership — tag to node set mapping (most-specific-tag assignment)
// ---------------------------------------------------------------------------
describe("buildTagMembership branch coverage", () => {
  it("returns empty map for no nodes", () => {
    const { tagMembership } = buildTagMembership([], []);
    expect(tagMembership.size).toBe(0);
  });

  it("assigns node to most-specific (smallest) tag", () => {
    const nodes = [
      node("a.md", { tags: ["common", "rare"] }),
      node("b.md", { tags: ["common"] }),
    ];
    const { tagMembership } = buildTagMembership(nodes, []);
    // "common" has 2 members, "rare" has 1 → a.md goes to "rare"
    expect(tagMembership.get("rare")?.has("a.md")).toBe(true);
    expect(tagMembership.get("common")?.has("b.md")).toBe(true);
  });

  it("handles nodes with no tags", () => {
    const nodes = [node("a.md"), node("b.md")];
    const { tagMembership } = buildTagMembership(nodes, []);
    expect(tagMembership.size).toBe(0);
  });

  it("handles nodes with empty tags array", () => {
    const nodes = [node("a.md", { tags: [] })];
    const { tagMembership } = buildTagMembership(nodes, []);
    expect(tagMembership.size).toBe(0);
  });

  it("handles mixed tagged and untagged nodes", () => {
    const nodes = [
      node("a.md", { tags: ["alpha"] }),
      node("b.md"), // no tags
    ];
    const { tagMembership } = buildTagMembership(nodes, []);
    expect(tagMembership.size).toBe(1);
    expect(tagMembership.get("alpha")?.has("a.md")).toBe(true);
  });

  it("skips isTag nodes", () => {
    const nodes = [
      node("#alpha", { isTag: true, tags: ["alpha"] }),
      node("a.md", { tags: ["alpha"] }),
    ];
    const { tagMembership } = buildTagMembership(nodes, []);
    // tag node should not be in membership
    expect(tagMembership.get("alpha")?.has("#alpha")).toBeFalsy();
    expect(tagMembership.get("alpha")?.has("a.md")).toBe(true);
  });

  it("builds tag relationship pairs from inheritance edges", () => {
    const nodes = [node("a.md", { tags: ["t1"] })];
    const edges = [edge("tag:t1", "tag:t2", "inheritance")];
    const { tagRelPairs } = buildTagMembership(nodes, edges);
    expect(tagRelPairs.has("t1\0t2")).toBe(true);
    expect(tagRelPairs.has("t2\0t1")).toBe(true);
  });

  it("ignores non-tag inheritance edges", () => {
    const nodes = [node("a.md")];
    const edges = [edge("a.md", "b.md", "inheritance")];
    const { tagRelPairs } = buildTagMembership(nodes, edges);
    expect(tagRelPairs.size).toBe(0);
  });

  it("ignores non-inheritance/aggregation edges for tag relations", () => {
    const nodes = [node("a.md")];
    const edges = [edge("tag:t1", "tag:t2", "link")];
    const { tagRelPairs } = buildTagMembership(nodes, edges);
    expect(tagRelPairs.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildMissingNeighborSet — tag co-occurrence without direct edges
// ---------------------------------------------------------------------------
describe("buildMissingNeighborSet branch coverage", () => {
  it("returns null when all tag-shared nodes have edges", () => {
    const nodes = [
      node("a", { tags: ["alpha"] }),
      node("b", { tags: ["alpha"] }),
    ];
    const edges = [edge("a", "b")];
    const result = buildMissingNeighborSet(nodes, edges);
    expect(result).toBeNull();
  });

  it("detects missing neighbor pair", () => {
    const nodes = [
      node("a", { tags: ["alpha"] }),
      node("b", { tags: ["alpha"] }),
    ];
    // No edge between a and b
    const result = buildMissingNeighborSet(nodes, []);
    expect(result).not.toBeNull();
    expect(result!.has("a")).toBe(true);
    expect(result!.has("b")).toBe(true);
  });

  it("returns null for nodes without tags", () => {
    const nodes = [node("a"), node("b")];
    const result = buildMissingNeighborSet(nodes, []);
    expect(result).toBeNull();
  });

  it("skips tag nodes (isTag=true)", () => {
    const nodes = [
      node("#alpha", { isTag: true, tags: ["alpha"] }),
      node("a", { tags: ["alpha"] }),
    ];
    const result = buildMissingNeighborSet(nodes, []);
    // Only 1 non-tag node in group, not enough for pairs
    expect(result).toBeNull();
  });

  it("handles object-type edge source/target", () => {
    const nodes = [
      node("a", { tags: ["t"] }),
      node("b", { tags: ["t"] }),
    ];
    const edges = [{ source: { id: "a" } as any, target: { id: "b" } as any, type: "link" }] as GraphEdge[];
    const result = buildMissingNeighborSet(nodes, edges);
    expect(result).toBeNull(); // edge exists
  });
});

// ---------------------------------------------------------------------------
// computeAutoFitTransform — additional edge cases
// ---------------------------------------------------------------------------
describe("computeAutoFitTransform branch coverage", () => {
  it("returns null for empty nodes", () => {
    const result = computeAutoFitTransform({
      nodes: [],
      canvasW: 800,
      canvasH: 600,
    });
    expect(result).toBeNull();
  });

  it("returns null for zero canvas size", () => {
    expect(computeAutoFitTransform({
      nodes: [{ x: 0, y: 0, r: 5 }],
      canvasW: 0,
      canvasH: 600,
    })).toBeNull();
    expect(computeAutoFitTransform({
      nodes: [{ x: 0, y: 0, r: 5 }],
      canvasW: 800,
      canvasH: 0,
    })).toBeNull();
  });

  it("returns transform for single node", () => {
    const result = computeAutoFitTransform({
      nodes: [{ x: 100, y: 200, r: 10 }],
      canvasW: 800,
      canvasH: 600,
    });
    expect(result).not.toBeNull();
    if (result) {
      expect(typeof result.x).toBe("number");
      expect(typeof result.y).toBe("number");
      expect(typeof result.scale).toBe("number");
    }
  });

  it("respects maxScale", () => {
    const result = computeAutoFitTransform({
      nodes: [{ x: 0, y: 0, r: 1 }, { x: 1, y: 1, r: 1 }],
      canvasW: 8000,
      canvasH: 6000,
      maxScale: 2,
    });
    if (result) expect(result.scale).toBeLessThanOrEqual(2);
  });

  it("relaxes minScale when too few nodes would be visible", () => {
    // Widely spread nodes with high minScale
    const nodes = [
      { x: -1000, y: -1000, r: 5 },
      { x: 1000, y: 1000, r: 5 },
      { x: -1000, y: 1000, r: 5 },
      { x: 1000, y: -1000, r: 5 },
    ];
    const result = computeAutoFitTransform({
      nodes,
      canvasW: 200,
      canvasH: 200,
      minScale: 10, // Very high minScale → would clip most nodes
    });
    expect(result).not.toBeNull();
    // Should relax minScale to fit nodes
    if (result) expect(result.scale).toBeLessThan(10);
  });

  it("uses minScale when most nodes are visible", () => {
    // Closely packed nodes with moderate minScale
    const nodes = [
      { x: 0, y: 0, r: 5 },
      { x: 10, y: 10, r: 5 },
    ];
    const result = computeAutoFitTransform({
      nodes,
      canvasW: 800,
      canvasH: 600,
      minScale: 0.5,
    });
    expect(result).not.toBeNull();
    if (result) expect(result.scale).toBeGreaterThanOrEqual(0.5);
  });
});
