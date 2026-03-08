import { describe, it, expect } from "vitest";
import { cssColorToHex, buildAdj } from "../src/utils/graph-helpers";
import type { GraphData } from "../src/types";

describe("cssColorToHex", () => {
  it("parses hex color #ff0000", () => {
    expect(cssColorToHex("#ff0000")).toBe(0xff0000);
  });

  it("parses hex color #6366f1", () => {
    expect(cssColorToHex("#6366f1")).toBe(0x6366f1);
  });

  it("parses hex color #000000", () => {
    expect(cssColorToHex("#000000")).toBe(0x000000);
  });

  it("parses rgb() format", () => {
    expect(cssColorToHex("rgb(255, 0, 0)")).toBe(0xff0000);
  });

  it("parses rgb() with no spaces", () => {
    expect(cssColorToHex("rgb(0,128,255)")).toBe(0x0080ff);
  });

  it("returns default for unrecognized format", () => {
    expect(cssColorToHex("hsl(0, 100%, 50%)")).toBe(0x6366f1);
  });

  it("returns default for empty string", () => {
    expect(cssColorToHex("")).toBe(0x6366f1);
  });
});

describe("buildAdj", () => {
  it("returns empty adjacency for no nodes", () => {
    const gd: GraphData = { nodes: [], edges: [] };
    const adj = buildAdj(gd);
    expect(adj.size).toBe(0);
  });

  it("creates entries for all nodes", () => {
    const gd: GraphData = {
      nodes: [
        { id: "a", label: "A", x: 0, y: 0, vx: 0, vy: 0 },
        { id: "b", label: "B", x: 0, y: 0, vx: 0, vy: 0 },
      ],
      edges: [],
    };
    const adj = buildAdj(gd);
    expect(adj.size).toBe(2);
    expect(adj.get("a")!.size).toBe(0);
  });

  it("builds bidirectional adjacency from edges", () => {
    const gd: GraphData = {
      nodes: [
        { id: "a", label: "A", x: 0, y: 0, vx: 0, vy: 0 },
        { id: "b", label: "B", x: 0, y: 0, vx: 0, vy: 0 },
        { id: "c", label: "C", x: 0, y: 0, vx: 0, vy: 0 },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", type: "link" },
        { id: "e2", source: "b", target: "c", type: "link" },
      ],
    };
    const adj = buildAdj(gd);
    expect(adj.get("a")).toEqual(new Set(["b"]));
    expect(adj.get("b")).toEqual(new Set(["a", "c"]));
    expect(adj.get("c")).toEqual(new Set(["b"]));
  });
});
