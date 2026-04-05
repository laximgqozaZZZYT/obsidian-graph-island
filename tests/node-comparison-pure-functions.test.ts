import { describe, it, expect } from "vitest";
import { bfsShortestPath, computeComparison } from "../src/views/NodeComparisonView";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helper: create minimal test nodes
// ---------------------------------------------------------------------------
function mkNode(id: string, label?: string, filePath?: string): GraphNode {
  return {
    id,
    label: label ?? id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    filePath,
  };
}

// ---------------------------------------------------------------------------
// bfsShortestPath — comprehensive test suite
// ---------------------------------------------------------------------------
describe("bfsShortestPath — exported function", () => {
  it("returns single-element path for same start/end node", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    const path = bfsShortestPath(adj, "a", "a");
    expect(path).toEqual(["a"]);
  });

  it("finds direct edge (2-node path)", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    adj.set("b", new Set(["a"]));
    const path = bfsShortestPath(adj, "a", "b");
    expect(path).toEqual(["a", "b"]);
  });

  it("finds shortest path in linear chain: a-b-c-d", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    adj.set("b", new Set(["a", "c"]));
    adj.set("c", new Set(["b", "d"]));
    adj.set("d", new Set(["c"]));
    const path = bfsShortestPath(adj, "a", "d");
    expect(path).toEqual(["a", "b", "c", "d"]);
  });

  it("returns null for unreachable node", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    adj.set("b", new Set(["a"]));
    adj.set("c", new Set());
    const path = bfsShortestPath(adj, "a", "c");
    expect(path).toBeNull();
  });

  it("returns null for unknown target node (not in adjacency)", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    const path = bfsShortestPath(adj, "a", "z");
    expect(path).toBeNull();
  });

  it("returns null for unknown start node", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    const path = bfsShortestPath(adj, "x", "b");
    expect(path).toBeNull();
  });

  it("chooses shortest path when multiple paths exist", () => {
    const adj = new Map<string, Set<string>>();
    // Path 1: a-b-d (2 hops)
    // Path 2: a-c-d (2 hops)
    // Path 3: a-e-d (2 hops)
    adj.set("a", new Set(["b", "c", "e"]));
    adj.set("b", new Set(["a", "d"]));
    adj.set("c", new Set(["a", "d"]));
    adj.set("e", new Set(["a", "d"]));
    adj.set("d", new Set(["b", "c", "e"]));
    const path = bfsShortestPath(adj, "a", "d");
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3); // 2 hops
    expect(path![0]).toBe("a");
    expect(path![path!.length - 1]).toBe("d");
  });

  it("handles cycle without infinite loop", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    adj.set("b", new Set(["a", "c"]));
    adj.set("c", new Set(["b", "a"])); // cycle back to a
    const path = bfsShortestPath(adj, "a", "c");
    expect(path).not.toBeNull();
    expect(path!.length).toBeLessThanOrEqual(3); // a-b-c is 2 hops (3 nodes)
  });

  it("handles star graph (hub connected to many), 100 nodes", () => {
    const adj = new Map<string, Set<string>>();
    const hubSet = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const nodeId = `n${i}`;
      hubSet.add(nodeId);
      const nodeSet = new Set<string>(["hub"]);
      adj.set(nodeId, nodeSet);
    }
    adj.set("hub", hubSet);
    const path = bfsShortestPath(adj, "n0", "n99");
    expect(path).toEqual(["n0", "hub", "n99"]);
  });

  it("handles empty adjacency map", () => {
    const adj = new Map<string, Set<string>>();
    const path = bfsShortestPath(adj, "a", "b");
    expect(path).toBeNull();
  });

  it("finds path when target is in source's neighbors even if target has no entry", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    // b is referenced by a but has no entry in adj (no outgoing edges from b)
    const path = bfsShortestPath(adj, "a", "b");
    expect(path).toEqual(["a", "b"]);
  });

  it("handles self-loop", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["a", "b"]));
    adj.set("b", new Set(["a"]));
    const path = bfsShortestPath(adj, "a", "b");
    expect(path).toEqual(["a", "b"]);
  });

  it("respects bidirectional edge traversal", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["b"]));
    adj.set("b", new Set(["a", "c"]));
    adj.set("c", new Set(["b"]));
    // Searching from c to a should work
    const path = bfsShortestPath(adj, "c", "a");
    expect(path).toEqual(["c", "b", "a"]);
  });

  it("finds path in complete graph (all nodes connected)", () => {
    const adj = new Map<string, Set<string>>();
    const allNodes = ["a", "b", "c", "d"];
    for (const n of allNodes) {
      adj.set(
        n,
        new Set(allNodes.filter((x) => x !== n)),
      );
    }
    const path = bfsShortestPath(adj, "a", "d");
    expect(path).toEqual(["a", "d"]); // Direct edge
  });

  it("finds path in disconnected graph (multiple components)", () => {
    const adj = new Map<string, Set<string>>();
    // Component 1: a-b
    adj.set("a", new Set(["b"]));
    adj.set("b", new Set(["a"]));
    // Component 2: x-y (isolated)
    adj.set("x", new Set(["y"]));
    adj.set("y", new Set(["x"]));
    const path = bfsShortestPath(adj, "a", "x");
    expect(path).toBeNull(); // x is unreachable from a
  });
});

// ---------------------------------------------------------------------------
// computeComparison — comprehensive test suite
// ---------------------------------------------------------------------------
describe("computeComparison — exported function", () => {
  function makeAdj(edges: [string, string][]): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    for (const [a, b] of edges) {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
    return adj;
  }

  // ========================================================================
  // Shared Neighbors
  // ========================================================================
  it("finds shared neighbors between two nodes", () => {
    const adj = makeAdj([
      ["a", "c"],
      ["b", "c"],
      ["a", "d"],
    ]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.sharedNeighbors).toContain("c");
    expect(result.sharedNeighbors).not.toContain("d");
  });

  it("excludes nodeA and nodeB from shared neighbors list", () => {
    const adj = makeAdj([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.sharedNeighbors).not.toContain("a");
    expect(result.sharedNeighbors).not.toContain("b");
    expect(result.sharedNeighbors).toContain("c");
  });

  it("returns empty shared neighbors when no overlap", () => {
    const adj = makeAdj([
      ["a", "x"],
      ["b", "y"],
    ]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.sharedNeighbors).toEqual([]);
  });

  // ========================================================================
  // Unique Neighbors
  // ========================================================================
  it("finds unique neighbors for each node", () => {
    const adj = makeAdj([
      ["a", "x"],
      ["b", "y"],
      ["a", "c"],
      ["b", "c"],
    ]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.uniqueToA).toContain("x");
    expect(result.uniqueToA).not.toContain("c");
    expect(result.uniqueToB).toContain("y");
    expect(result.uniqueToB).not.toContain("c");
  });

  it("handles nodes with no neighbors", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set());
    adj.set("b", new Set());
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.sharedNeighbors).toEqual([]);
    expect(result.uniqueToA).toEqual([]);
    expect(result.uniqueToB).toEqual([]);
  });

  it("handles node without adjacency entry", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set(["c"]));
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.uniqueToA).toContain("c");
    expect(result.sharedNeighbors).toEqual([]);
  });

  // ========================================================================
  // Shared Tags
  // ========================================================================
  it("computes shared tags correctly", () => {
    const adj = makeAdj([["a", "b"]]);
    const result = computeComparison(
      mkNode("a"),
      mkNode("b"),
      adj,
    );
    Object.assign(result.sharedNeighbors, []); // Reset for clarity

    // Use direct object manipulation to simulate nodes with tags
    const nodeA = { ...mkNode("a"), tags: ["t1", "t2", "t3"] };
    const nodeB = { ...mkNode("b"), tags: ["t2", "t3", "t4"] };

    const resultWithTags = computeComparison(nodeA, nodeB, adj);
    expect(resultWithTags.sharedTags.sort()).toEqual(["t2", "t3"]);
    expect(resultWithTags.uniqueTagsA).toContain("t1");
    expect(resultWithTags.uniqueTagsB).toContain("t4");
  });

  it("handles nodes with no tags", () => {
    const adj = makeAdj([["a", "b"]]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.sharedTags).toEqual([]);
    expect(result.uniqueTagsA).toEqual([]);
    expect(result.uniqueTagsB).toEqual([]);
  });

  it("handles only one node with tags", () => {
    const adj = makeAdj([["a", "b"]]);
    const nodeA = { ...mkNode("a"), tags: ["t1", "t2"] };
    const nodeB = mkNode("b");
    const result = computeComparison(nodeA, nodeB, adj);
    expect(result.sharedTags).toEqual([]);
    expect(result.uniqueTagsA.sort()).toEqual(["t1", "t2"]);
    expect(result.uniqueTagsB).toEqual([]);
  });

  it("handles empty tags arrays", () => {
    const adj = makeAdj([["a", "b"]]);
    const nodeA = { ...mkNode("a"), tags: [] };
    const nodeB = { ...mkNode("b"), tags: [] };
    const result = computeComparison(nodeA, nodeB, adj);
    expect(result.sharedTags).toEqual([]);
    expect(result.uniqueTagsA).toEqual([]);
    expect(result.uniqueTagsB).toEqual([]);
  });

  // ========================================================================
  // Shared Categories
  // ========================================================================
  it("computes shared categories correctly", () => {
    const adj = makeAdj([["a", "b"]]);
    const nodeA = { ...mkNode("a"), category: "character" };
    const nodeB = { ...mkNode("b"), category: "character" };
    const result = computeComparison(nodeA, nodeB, adj);
    expect(result.sharedCategories).toContain("character");
  });

  it("does not share categories when different", () => {
    const adj = makeAdj([["a", "b"]]);
    const nodeA = { ...mkNode("a"), category: "character" };
    const nodeB = { ...mkNode("b"), category: "location" };
    const result = computeComparison(nodeA, nodeB, adj);
    expect(result.sharedCategories).toEqual([]);
  });

  it("handles missing categories on both nodes", () => {
    const adj = makeAdj([["a", "b"]]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.sharedCategories).toEqual([]);
  });

  it("handles missing category on one node", () => {
    const adj = makeAdj([["a", "b"]]);
    const nodeA = { ...mkNode("a"), category: "character" };
    const nodeB = mkNode("b");
    const result = computeComparison(nodeA, nodeB, adj);
    expect(result.sharedCategories).toEqual([]);
  });

  // ========================================================================
  // Shortest Path
  // ========================================================================
  it("computes shortest path length correctly", () => {
    const adj = makeAdj([["a", "m"], ["m", "b"]]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.shortestPath).toEqual(["a", "m", "b"]);
    expect(result.pathLength).toBe(2);
  });

  it("returns -1 path length when disconnected", () => {
    const adj = new Map<string, Set<string>>();
    adj.set("a", new Set());
    adj.set("b", new Set());
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.pathLength).toBe(-1);
    expect(result.shortestPath).toBeNull();
  });

  it("handles self-comparison (same node)", () => {
    const adj = makeAdj([["a", "b"]]);
    const result = computeComparison(mkNode("a"), mkNode("a"), adj);
    expect(result.shortestPath).toEqual(["a"]);
    expect(result.pathLength).toBe(0);
  });

  it("returns direct edge as path", () => {
    const adj = makeAdj([["a", "b"]]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.shortestPath).toEqual(["a", "b"]);
    expect(result.pathLength).toBe(1);
  });

  // ========================================================================
  // Complex Scenarios
  // ========================================================================
  it("complete graph: all neighbors are shared", () => {
    const adj = makeAdj([
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
      ["b", "c"],
      ["b", "d"],
      ["c", "d"],
    ]);
    const result = computeComparison(mkNode("a"), mkNode("b"), adj);
    expect(result.sharedNeighbors.sort()).toEqual(["c", "d"]);
    expect(result.uniqueToA).toEqual([]);
    expect(result.uniqueToB).toEqual([]);
  });

  it("star graph with center and periphery", () => {
    const edges: [string, string][] = [];
    for (let i = 1; i <= 5; i++) {
      edges.push(["center", `p${i}`]);
    }
    const adj = makeAdj(edges);
    const result = computeComparison(mkNode("p1"), mkNode("p2"), adj);
    expect(result.sharedNeighbors).toContain("center");
    expect(result.uniqueToA).toEqual([]);
    expect(result.uniqueToB).toEqual([]);
  });

  it("full result object structure matches expected interface", () => {
    const adj = makeAdj([["a", "b"]]);
    const nodeA = {
      ...mkNode("a"),
      tags: ["t1"],
      category: "cat1",
    };
    const nodeB = {
      ...mkNode("b"),
      tags: ["t2"],
      category: "cat1",
    };
    const result = computeComparison(nodeA, nodeB, adj);

    expect(result).toHaveProperty("sharedNeighbors");
    expect(result).toHaveProperty("uniqueToA");
    expect(result).toHaveProperty("uniqueToB");
    expect(result).toHaveProperty("sharedTags");
    expect(result).toHaveProperty("uniqueTagsA");
    expect(result).toHaveProperty("uniqueTagsB");
    expect(result).toHaveProperty("sharedCategories");
    expect(result).toHaveProperty("shortestPath");
    expect(result).toHaveProperty("pathLength");

    expect(Array.isArray(result.sharedNeighbors)).toBe(true);
    expect(Array.isArray(result.uniqueToA)).toBe(true);
    expect(Array.isArray(result.uniqueToB)).toBe(true);
    expect(Array.isArray(result.sharedTags)).toBe(true);
    expect(Array.isArray(result.uniqueTagsA)).toBe(true);
    expect(Array.isArray(result.uniqueTagsB)).toBe(true);
    expect(Array.isArray(result.sharedCategories)).toBe(true);
    expect(typeof result.pathLength).toBe("number");
  });
});
