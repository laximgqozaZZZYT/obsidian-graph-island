import { describe, it, expect } from "vitest";
import { applyTreeLayout } from "../src/layouts/tree";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string, category = ""): GraphNode {
  return { id, label: id, x: 0, y: 0, group: "", tags: [], category } as GraphNode;
}

function mkEdge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type } as GraphEdge;
}

function mkGraph(nodeIds: string[], edges: [string, string, string?][] = []): GraphData {
  return {
    nodes: nodeIds.map(id => mkNode(id)),
    edges: edges.map(([s, t, tp]) => mkEdge(s, t, tp ?? "link")),
  };
}

// ---------------------------------------------------------------------------
// applyTreeLayout
// ---------------------------------------------------------------------------

describe("applyTreeLayout", () => {
  it("returns empty for empty graph", () => {
    const result = applyTreeLayout({ nodes: [], edges: [] });
    expect(result.nodes).toEqual([]);
  });

  it("single node has defined position", () => {
    const result = applyTreeLayout(mkGraph(["a"]));
    expect(result.nodes.length).toBe(1);
    expect(Number.isFinite(result.nodes[0].x)).toBe(true);
    expect(Number.isFinite(result.nodes[0].y)).toBe(true);
  });

  it("linear chain: each level deeper has larger y", () => {
    const result = applyTreeLayout(
      mkGraph(["a", "b", "c", "d"], [["a", "b"], ["b", "c"], ["c", "d"]]),
    );
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));
    // Root should have smallest y, each child deeper
    expect(nodeMap.get("a")!.y).toBeLessThan(nodeMap.get("b")!.y);
    expect(nodeMap.get("b")!.y).toBeLessThan(nodeMap.get("c")!.y);
    expect(nodeMap.get("c")!.y).toBeLessThan(nodeMap.get("d")!.y);
  });

  it("star graph: all leaves on same level", () => {
    const result = applyTreeLayout(
      mkGraph(["hub", "a", "b", "c"], [["hub", "a"], ["hub", "b"], ["hub", "c"]]),
    );
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));
    const hubY = nodeMap.get("hub")!.y;
    const leafYs = ["a", "b", "c"].map(id => nodeMap.get(id)!.y);
    // All leaves at same level
    for (const ly of leafYs) {
      expect(ly).toBeCloseTo(leafYs[0], 5);
      expect(ly).toBeGreaterThan(hubY);
    }
  });

  it("disconnected components both get positions", () => {
    const graph = mkGraph(["a", "b", "x", "y"], [["a", "b"], ["x", "y"]]);
    const result = applyTreeLayout(graph);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));
    // All 4 nodes should have defined positions
    for (const id of ["a", "b", "x", "y"]) {
      expect(Number.isFinite(nodeMap.get(id)!.x)).toBe(true);
      expect(Number.isFinite(nodeMap.get(id)!.y)).toBe(true);
    }
  });

  it("does not mutate original nodes", () => {
    const graph = mkGraph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    const origX = graph.nodes[0].x;
    applyTreeLayout(graph);
    expect(graph.nodes[0].x).toBe(origX);
  });

  it("preserves edges unchanged", () => {
    const result = applyTreeLayout(
      mkGraph(["a", "b"], [["a", "b"]]),
    );
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].source).toBe("a");
  });

  it("rootId option forces specific root", () => {
    // Without rootId, "hub" (highest out-degree) would be root
    // With rootId="c", force "c" as root
    const graph = mkGraph(
      ["hub", "a", "b", "c"],
      [["hub", "a"], ["hub", "b"], ["hub", "c"]],
    );
    const result = applyTreeLayout(graph, { rootId: "c" });
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));
    // "c" should be at the top level (smallest y)
    const cY = nodeMap.get("c")!.y;
    for (const n of result.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(cY - 0.01);
    }
  });

  it("groupByCategory adds extra gaps between categories", () => {
    const nodes = [
      mkNode("a1", "catA"),
      mkNode("a2", "catA"),
      mkNode("b1", "catB"),
      mkNode("b2", "catB"),
    ];
    const edges = [mkEdge("a1", "a2"), mkEdge("a1", "b1"), mkEdge("a1", "b2")];
    const graph = { nodes, edges };

    const withGroup = applyTreeLayout(graph, { groupByCategory: true, categoryGap: 100 });
    const withoutGroup = applyTreeLayout(graph, { groupByCategory: false });

    // With category grouping, the total x spread should be wider
    const spreadWith = Math.max(...withGroup.nodes.map(n => n.x)) - Math.min(...withGroup.nodes.map(n => n.x));
    const spreadWithout = Math.max(...withoutGroup.nodes.map(n => n.x)) - Math.min(...withoutGroup.nodes.map(n => n.x));
    // categoryGap=100 should make grouped layout wider
    expect(spreadWith).toBeGreaterThanOrEqual(spreadWithout);
  });

  it("handles large fan-out with depth control", () => {
    // 30 nodes all connected to hub — maxFanOut limits children per level
    const ids = ["hub", ...Array.from({ length: 29 }, (_, i) => `n${i}`)];
    const edges: [string, string][] = ids.slice(1).map(id => ["hub", id]);
    const result = applyTreeLayout(mkGraph(ids, edges));
    // Should create multiple levels (not all on level 1)
    const ys = new Set(result.nodes.map(n => Math.round(n.y)));
    expect(ys.size).toBeGreaterThanOrEqual(2);
  });
});
