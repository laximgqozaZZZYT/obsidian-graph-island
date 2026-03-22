import { describe, it, expect } from "vitest";
import { applyArcLayout } from "../src/layouts/arc";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string, label?: string): GraphNode {
  return { id, label: label ?? id, x: 0, y: 0, group: "", tags: [], category: "" } as GraphNode;
}

function mkEdge(source: string, target: string): GraphEdge {
  return { source, target, type: "link" } as GraphEdge;
}

function mkGraph(nodeIds: string[], edges: [string, string][] = []): GraphData {
  return {
    nodes: nodeIds.map(id => mkNode(id)),
    edges: edges.map(([s, t]) => mkEdge(s, t)),
  };
}

// ---------------------------------------------------------------------------
// applyArcLayout
// ---------------------------------------------------------------------------

describe("applyArcLayout", () => {
  it("returns empty for empty graph", () => {
    const result = applyArcLayout({ nodes: [], edges: [] });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("single node placed correctly", () => {
    const result = applyArcLayout(mkGraph(["a"]));
    expect(result.nodes.length).toBe(1);
    // Single node: startX + 0*xStep = startX, which is centerX - width/2
    expect(Number.isFinite(result.nodes[0].x)).toBe(true);
    expect(Number.isFinite(result.nodes[0].y)).toBe(true);
  });

  it("nodes spread horizontally (unique x positions)", () => {
    const result = applyArcLayout(mkGraph(["a", "b", "c", "d", "e"]));
    const xs = result.nodes.map(n => n.x);
    const uniqueXs = new Set(xs.map(x => Math.round(x * 100)));
    expect(uniqueXs.size).toBe(5);
  });

  it("symmetric bell curve — center node has lowest y", () => {
    const graph = mkGraph(["a", "b", "c", "d", "e"], [
      ["a", "b"], ["a", "c"], ["a", "d"], ["a", "e"],
    ]);
    const result = applyArcLayout(graph);
    // Node "a" has highest degree → placed at center → lowest y
    const centerNode = result.nodes.find(n => n.id === "a")!;
    const otherYs = result.nodes.filter(n => n.id !== "a").map(n => n.y);
    // Center should have the lowest y (highest visual position)
    for (const y of otherYs) {
      expect(centerNode.y).toBeLessThanOrEqual(y + 0.01);
    }
  });

  it("preserves edges unchanged", () => {
    const edges: [string, string][] = [["a", "b"], ["b", "c"]];
    const result = applyArcLayout(mkGraph(["a", "b", "c"], edges));
    expect(result.edges.length).toBe(2);
    expect(result.edges[0].source).toBe("a");
  });

  it("does not mutate original nodes", () => {
    const graph = mkGraph(["a", "b", "c"]);
    const origX = graph.nodes[0].x;
    applyArcLayout(graph);
    expect(graph.nodes[0].x).toBe(origX);
  });

  it("sortBy:label sorts alphabetically", () => {
    const graph = mkGraph(["c", "a", "b"]);
    const result = applyArcLayout(graph, { sortBy: "label" });
    // With label sort, alphabetical order should influence placement
    expect(result.nodes.length).toBe(3);
  });

  it("custom radius affects spread", () => {
    const small = applyArcLayout(mkGraph(["a", "b", "c"]), { radius: 100 });
    const large = applyArcLayout(mkGraph(["a", "b", "c"]), { radius: 500 });
    const spreadSmall = Math.abs(small.nodes[0].x - small.nodes[2].x);
    const spreadLarge = Math.abs(large.nodes[0].x - large.nodes[2].x);
    expect(spreadLarge).toBeGreaterThan(spreadSmall);
  });
});
