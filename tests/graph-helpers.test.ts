import { describe, it, expect } from "vitest";
import {
  cssColorToHex, buildAdj, bfsNeighborSet, bfsShortestPath, collectSubgraph,
  edgeSourceId, edgeTargetId, shiftHue, stringHash, hslToHex,
} from "../src/utils/graph-helpers";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";

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

// --- Helpers ---
function mkNode(id: string, extra?: Partial<GraphNode>): GraphNode {
  return { id, label: id, filePath: `${id}.md`, x: 0, y: 0, vx: 0, vy: 0, ...extra } as GraphNode;
}
function mkEdge(s: string, t: string, type?: string): GraphEdge {
  return { id: `${s}-${t}`, source: s, target: t, ...(type ? { type } : {}) } as GraphEdge;
}
function mkAdj(pairs: [string, string][]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const [a, b] of pairs) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  return adj;
}

// =============================================
// edgeSourceId / edgeTargetId
// =============================================
describe("edgeSourceId / edgeTargetId", () => {
  it("extracts string source/target", () => {
    expect(edgeSourceId({ source: "a" })).toBe("a");
    expect(edgeTargetId({ target: "b" })).toBe("b");
  });

  it("extracts object source/target (d3 simulation)", () => {
    expect(edgeSourceId({ source: { id: "x" } })).toBe("x");
    expect(edgeTargetId({ target: { id: "y" } })).toBe("y");
  });
});

// =============================================
// bfsNeighborSet
// =============================================
describe("bfsNeighborSet", () => {
  it("returns only start node for 0 hops", () => {
    const adj = mkAdj([["a", "b"], ["b", "c"]]);
    const result = bfsNeighborSet(adj, "a", 0);
    expect(result).toEqual(new Set(["a"]));
  });

  it("1-hop returns immediate neighbors + start", () => {
    const adj = mkAdj([["a", "b"], ["a", "c"], ["b", "d"]]);
    const result = bfsNeighborSet(adj, "a", 1);
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("2-hop reaches 2nd-degree neighbors", () => {
    const adj = mkAdj([["a", "b"], ["b", "c"], ["c", "d"]]);
    const result = bfsNeighborSet(adj, "a", 2);
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("large hops covers entire connected component", () => {
    const adj = mkAdj([["a", "b"], ["b", "c"], ["c", "d"]]);
    const result = bfsNeighborSet(adj, "a", 100);
    expect(result).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("does not cross disconnected components", () => {
    const adj = mkAdj([["a", "b"]]);
    adj.set("c", new Set()); // isolated node
    const result = bfsNeighborSet(adj, "a", 10);
    expect(result.has("c")).toBe(false);
  });

  it("handles unknown start node gracefully", () => {
    const adj = mkAdj([["a", "b"]]);
    const result = bfsNeighborSet(adj, "unknown", 5);
    expect(result).toEqual(new Set(["unknown"]));
  });
});

// =============================================
// bfsShortestPath
// =============================================
describe("bfsShortestPath", () => {
  it("same node returns single-element path", () => {
    const adj = mkAdj([["a", "b"]]);
    expect(bfsShortestPath(adj, "a", "a")).toEqual(["a"]);
  });

  it("direct neighbor returns 2-element path", () => {
    const adj = mkAdj([["a", "b"], ["b", "c"]]);
    expect(bfsShortestPath(adj, "a", "b")).toEqual(["a", "b"]);
  });

  it("finds shortest path in diamond graph", () => {
    // a - b - d
    // a - c - d
    const adj = mkAdj([["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    const path = bfsShortestPath(adj, "a", "d");
    expect(path.length).toBe(3); // a → b/c → d
    expect(path[0]).toBe("a");
    expect(path[path.length - 1]).toBe("d");
  });

  it("returns empty for unreachable node", () => {
    const adj = mkAdj([["a", "b"]]);
    adj.set("c", new Set());
    expect(bfsShortestPath(adj, "a", "c")).toEqual([]);
  });

  it("returns empty for unknown nodes", () => {
    const adj = mkAdj([["a", "b"]]);
    expect(bfsShortestPath(adj, "x", "y")).toEqual([]);
  });
});

// =============================================
// collectSubgraph
// =============================================
describe("collectSubgraph", () => {
  it("0-hop subgraph contains only the center node", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
    const adj = mkAdj([["a", "b"], ["b", "c"]]);
    const sub = collectSubgraph(adj, "a", 0, nodes, edges);
    expect(sub.nodes.length).toBe(1);
    expect(sub.nodes[0].id).toBe("a");
    expect(sub.edges.length).toBe(0);
  });

  it("1-hop includes center + neighbors + connecting edges", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
    const edges = [mkEdge("a", "b"), mkEdge("a", "c"), mkEdge("b", "d")];
    const adj = mkAdj([["a", "b"], ["a", "c"], ["b", "d"]]);
    const sub = collectSubgraph(adj, "a", 1, nodes, edges);
    expect(sub.nodes.map(n => n.id).sort()).toEqual(["a", "b", "c"]);
    // Only edges where both ends are in subgraph
    expect(sub.edges.length).toBe(2); // a-b, a-c (not b-d since d not included)
  });

  it("full-hop subgraph equals original graph", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
    const adj = mkAdj([["a", "b"], ["b", "c"]]);
    const sub = collectSubgraph(adj, "a", 100, nodes, edges);
    expect(sub.nodes.length).toBe(3);
    expect(sub.edges.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// shiftHue — rotate hue of a hex color (cycle110)
// ---------------------------------------------------------------------------
describe("shiftHue", () => {
  it("0 degree shift returns same color", () => {
    expect(shiftHue(0xff0000, 0)).toBe(0xff0000);
  });

  it("360 degree shift returns same color", () => {
    expect(shiftHue(0xff0000, 360)).toBe(0xff0000);
  });

  it("120 degree shift: red → green", () => {
    const result = shiftHue(0xff0000, 120);
    // Pure red shifted 120° should be approximately green
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    expect(g).toBeGreaterThan(r);
  });

  it("240 degree shift: red → blue", () => {
    const result = shiftHue(0xff0000, 240);
    const r = (result >> 16) & 0xff;
    const b = result & 0xff;
    expect(b).toBeGreaterThan(r);
  });

  it("preserves grayscale (no hue to shift)", () => {
    // Gray has s=0, so hue shift should not change it
    expect(shiftHue(0x808080, 90)).toBe(0x808080);
  });

  it("preserves black", () => {
    expect(shiftHue(0x000000, 180)).toBe(0x000000);
  });

  it("preserves white", () => {
    expect(shiftHue(0xffffff, 90)).toBe(0xffffff);
  });
});

// ---------------------------------------------------------------------------
// stringHash — deterministic hash to range
// ---------------------------------------------------------------------------
describe("stringHash", () => {
  it("returns consistent hash for same input", () => {
    expect(stringHash("hello", 100)).toBe(stringHash("hello", 100));
  });

  it("result is within [0, range)", () => {
    for (const s of ["a", "hello", "日本語", "!@#$%"]) {
      const h = stringHash(s, 50);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(50);
    }
  });

  it("different strings produce different hashes (usually)", () => {
    const hashes = new Set(["a", "b", "c", "d", "e"].map(s => stringHash(s, 1000)));
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("empty string returns valid result", () => {
    const h = stringHash("", 10);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(10);
  });

  it("range 1 always returns 0", () => {
    expect(stringHash("anything", 1)).toBe(0);
  });
});

// Export function tests consolidated into tests/export-formats.test.ts
