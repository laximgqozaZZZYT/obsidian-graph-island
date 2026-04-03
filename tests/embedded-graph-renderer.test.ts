import { describe, it, expect } from "vitest";
import { parseConfig, filterLocalGraph } from "../src/views/EmbeddedGraphRenderer";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helper: create a minimal node
// ---------------------------------------------------------------------------
function mkNode(id: string, filePath?: string): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, filePath };
}

function mkEdge(source: string, target: string, type = "link"): GraphEdge {
  return { id: `${source}-${target}`, source, target, type };
}

// ---------------------------------------------------------------------------
// parseConfig — JSON config parsing with graceful fallback
// ---------------------------------------------------------------------------
describe("parseConfig", () => {
  it("parses valid JSON with all fields", () => {
    const cfg = parseConfig('{"center":"note.md","hops":3,"height":400,"layout":"grid"}');
    expect(cfg.center).toBe("note.md");
    expect(cfg.hops).toBe(3);
    expect(cfg.height).toBe(400);
    expect(cfg.layout).toBe("grid");
  });

  it("parses valid JSON with partial fields", () => {
    const cfg = parseConfig('{"center":"test.md"}');
    expect(cfg.center).toBe("test.md");
    expect(cfg.hops).toBeUndefined();
    expect(cfg.height).toBeUndefined();
  });

  it("returns empty object for empty JSON object", () => {
    const cfg = parseConfig("{}");
    expect(cfg).toEqual({});
  });

  it("returns empty object for invalid JSON", () => {
    const cfg = parseConfig("not json at all");
    expect(cfg).toEqual({});
  });

  it("returns empty object for empty string", () => {
    const cfg = parseConfig("");
    expect(cfg).toEqual({});
  });

  it("returns empty object for malformed JSON (missing closing brace)", () => {
    const cfg = parseConfig('{"center":"test.md"');
    expect(cfg).toEqual({});
  });

  it("handles JSON with numeric values", () => {
    const cfg = parseConfig('{"hops":5,"height":600}');
    expect(cfg.hops).toBe(5);
    expect(cfg.height).toBe(600);
  });

  it("handles JSON with null values", () => {
    const cfg = parseConfig('{"center":null}');
    expect(cfg.center).toBeNull();
  });

  it("handles JSON with extra unknown fields (passes through)", () => {
    const cfg = parseConfig('{"center":"a.md","unknown":true}');
    expect(cfg.center).toBe("a.md");
    expect((cfg as any).unknown).toBe(true);
  });

  it("handles JSON array (returns array, not EmbedConfig shape)", () => {
    const cfg = parseConfig("[1,2,3]");
    // JSON.parse succeeds, returns array
    expect(Array.isArray(cfg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterLocalGraph — BFS N-hop filter
// ---------------------------------------------------------------------------
describe("filterLocalGraph", () => {
  // Build a simple linear graph: A -> B -> C -> D -> E
  function linearGraph(): GraphData {
    return {
      nodes: [mkNode("A", "A.md"), mkNode("B", "B.md"), mkNode("C", "C.md"), mkNode("D", "D.md"), mkNode("E", "E.md")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("C", "D"), mkEdge("D", "E")],
    };
  }

  // Star graph: center connected to all periphery
  function starGraph(): GraphData {
    const nodes = [mkNode("center", "center.md")];
    const edges: GraphEdge[] = [];
    for (let i = 1; i <= 6; i++) {
      nodes.push(mkNode(`p${i}`, `p${i}.md`));
      edges.push(mkEdge("center", `p${i}`));
    }
    return { nodes, edges };
  }

  it("returns empty for non-existent center node", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "nonexistent.md", 2);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("returns only center node for 0 hops", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "A.md", 0);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("A");
    expect(result.edges).toHaveLength(0);
  });

  it("returns center + direct neighbors for 1 hop", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "B.md", 1);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B", "C"]);
    expect(result.edges).toHaveLength(2); // A-B and B-C
  });

  it("returns 2-hop neighborhood correctly", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "B.md", 2);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B", "C", "D"]);
    expect(result.edges).toHaveLength(3); // A-B, B-C, C-D
  });

  it("returns entire graph when hops >= diameter", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "A.md", 10);
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(4);
  });

  it("star graph: 1 hop from center returns all nodes", () => {
    const data = starGraph();
    const result = filterLocalGraph(data, "center.md", 1);
    expect(result.nodes).toHaveLength(7); // center + 6 periphery
    expect(result.edges).toHaveLength(6);
  });

  it("star graph: 1 hop from periphery returns center + that node", () => {
    const data = starGraph();
    const result = filterLocalGraph(data, "p1.md", 1);
    // p1 connects to center, center connects to p2..p6 at hop=2
    // But hop=1: only p1 and center
    expect(result.nodes.map(n => n.id).sort()).toEqual(["center", "p1"]);
    expect(result.edges).toHaveLength(1);
  });

  it("handles center found by id instead of filePath", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "A", 1);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
  });

  it("filters edges that have both endpoints in reachable set", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C"), mkNode("D")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("C", "D"), mkEdge("A", "D")],
    };
    const result = filterLocalGraph(data, "A", 1);
    // Reachable from A with 1 hop: A, B, D (A-D edge exists)
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B", "D"]);
    // Edges within this set: A-B, A-D (B-C excluded since C not reachable)
    expect(result.edges).toHaveLength(2);
  });

  it("handles graph with single node and no edges", () => {
    const data: GraphData = {
      nodes: [mkNode("alone", "alone.md")],
      edges: [],
    };
    const result = filterLocalGraph(data, "alone.md", 3);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it("handles empty graph", () => {
    const data: GraphData = { nodes: [], edges: [] };
    const result = filterLocalGraph(data, "any", 2);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("handles disconnected components", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("X"), mkNode("Y")],
      edges: [mkEdge("A", "B"), mkEdge("X", "Y")],
    };
    const result = filterLocalGraph(data, "A", 5);
    // Only A-B component is reachable
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
    expect(result.edges).toHaveLength(1);
  });

  it("handles cycle in graph", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("C", "A")],
    };
    const result = filterLocalGraph(data, "A", 1);
    // All 3 are within 1 hop due to cycle A-B and A-C
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(3);
  });

  it("handles self-loop edge", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B")],
      edges: [mkEdge("A", "B"), mkEdge("A", "A")],
    };
    const result = filterLocalGraph(data, "A", 1);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
    expect(result.edges).toHaveLength(2); // A-B and A-A
  });

  it("respects bidirectional edge traversal", () => {
    // Edge direction: A -> B, but BFS should traverse B -> A as well
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C")],
      edges: [mkEdge("A", "B"), mkEdge("A", "C")],
    };
    const result = filterLocalGraph(data, "B", 1);
    // B can reach A via the A->B edge (buildAdj is undirected)
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
  });

  it("does not duplicate nodes in output", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("A", "C")],
    };
    const result = filterLocalGraph(data, "A", 2);
    const ids = result.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("large hop count on small graph returns all nodes", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B")],
      edges: [mkEdge("A", "B")],
    };
    const result = filterLocalGraph(data, "A", 100);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});
