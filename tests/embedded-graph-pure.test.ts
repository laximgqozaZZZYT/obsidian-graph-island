import { describe, it, expect } from "vitest";
import { parseConfig, filterLocalGraph } from "../src/views/EmbeddedGraphRenderer";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mkNode(id: string, filePath?: string): GraphNode {
  return { id, label: id, x: 0, y: 0, isTag: false, filePath: filePath ?? id + ".md" } as GraphNode;
}
function mkEdge(src: string, tgt: string): GraphEdge {
  return { source: src, target: tgt, type: "link" } as GraphEdge;
}
function mkData(nodes: GraphNode[], edges: GraphEdge[]): GraphData {
  return { nodes, edges } as GraphData;
}

// ===========================================================================
// parseConfig — JSON source → EmbedConfig
// ===========================================================================
describe("parseConfig", () => {
  it("parses valid JSON", () => {
    const cfg = parseConfig('{"center":"note.md","hops":3,"height":400}');
    expect(cfg.center).toBe("note.md");
    expect(cfg.hops).toBe(3);
    expect(cfg.height).toBe(400);
  });

  it("returns empty object for invalid JSON", () => {
    expect(parseConfig("not json")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseConfig("")).toEqual({});
  });

  it("handles partial config", () => {
    const cfg = parseConfig('{"hops":1}');
    expect(cfg.hops).toBe(1);
    expect(cfg.center).toBeUndefined();
  });
});

// ===========================================================================
// filterLocalGraph — BFS N-hop subgraph extraction
// ===========================================================================
describe("filterLocalGraph", () => {
  const a = mkNode("a", "folder/a.md");
  const b = mkNode("b", "folder/b.md");
  const c = mkNode("c", "folder/c.md");
  const d = mkNode("d", "folder/d.md");
  const e = mkNode("e", "folder/e.md");
  // a--b--c--d--e (linear chain)
  const data = mkData([a, b, c, d, e], [
    mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("c", "d"), mkEdge("d", "e"),
  ]);

  it("returns center + 1-hop neighbors", () => {
    const result = filterLocalGraph(data, "c", 1);
    const ids = result.nodes.map(n => n.id).sort();
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("returns center + 2-hop neighbors", () => {
    const result = filterLocalGraph(data, "c", 2);
    const ids = result.nodes.map(n => n.id).sort();
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns only center at 0 hops", () => {
    const result = filterLocalGraph(data, "c", 0);
    expect(result.nodes.map(n => n.id)).toEqual(["c"]);
    expect(result.edges.length).toBe(0);
  });

  it("returns empty for unknown center", () => {
    const result = filterLocalGraph(data, "unknown", 2);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("filters edges to only reachable pairs", () => {
    const result = filterLocalGraph(data, "a", 1);
    // a + b reachable, edges: a--b only
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].source).toBe("a");
  });

  it("matches by filePath", () => {
    const result = filterLocalGraph(data, "folder/c.md", 1);
    const ids = result.nodes.map(n => n.id).sort();
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("handles star topology", () => {
    const star = mkData(
      [mkNode("hub"), mkNode("s1"), mkNode("s2"), mkNode("s3")],
      [mkEdge("hub", "s1"), mkEdge("hub", "s2"), mkEdge("hub", "s3")],
    );
    const result = filterLocalGraph(star, "hub", 1);
    expect(result.nodes.length).toBe(4); // all
  });

  it("handles disconnected graph", () => {
    const disconnected = mkData(
      [mkNode("x"), mkNode("y"), mkNode("z")],
      [mkEdge("x", "y")], // z is disconnected
    );
    const result = filterLocalGraph(disconnected, "x", 10);
    const ids = result.nodes.map(n => n.id).sort();
    expect(ids).toEqual(["x", "y"]); // z not reachable
  });
});
