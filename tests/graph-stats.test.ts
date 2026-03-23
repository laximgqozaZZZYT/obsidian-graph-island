import { describe, it, expect } from "vitest";
import {
  computeGraphStats,
  countConnectedComponents,
  computeNodeDegrees,
} from "../src/analysis/graph-analysis";
import type { GraphNode, GraphEdge } from "../src/types";

function mkNode(id: string): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0 };
}
function mkEdge(source: string, target: string): GraphEdge {
  return { id: `${source}-${target}`, source, target };
}

describe("computeGraphStats", () => {
  it("returns zeros for empty graph", () => {
    const stats = computeGraphStats([], [], new Map());
    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
    expect(stats.avgDegree).toBe(0);
    expect(stats.density).toBe(0);
    expect(stats.hubs).toEqual([]);
    expect(stats.componentCount).toBe(0);
  });

  it("computes stats for a simple triangle", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("a", "c")];
    const degrees = new Map([
      ["a", 2],
      ["b", 2],
      ["c", 2],
    ]);
    const stats = computeGraphStats(nodes, edges, degrees);
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(3);
    expect(stats.avgDegree).toBe(2);
    expect(stats.density).toBe(1); // complete graph
    expect(stats.componentCount).toBe(1);
    expect(stats.hubs.length).toBe(3);
  });

  it("computes density for sparse graph", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
    const edges = [mkEdge("a", "b")];
    const degrees = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 0],
      ["d", 0],
    ]);
    const stats = computeGraphStats(nodes, edges, degrees);
    // density = 2*1 / (4*3) = 2/12 = 1/6
    expect(stats.density).toBeCloseTo(1 / 6);
    expect(stats.componentCount).toBe(3); // {a,b}, {c}, {d}
  });

  it("returns top N hubs sorted by degree", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [mkEdge("a", "b"), mkEdge("a", "c")];
    const degrees = new Map([
      ["a", 2],
      ["b", 1],
      ["c", 1],
    ]);
    const stats = computeGraphStats(nodes, edges, degrees, 2);
    expect(stats.hubs).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("single node graph has density 0", () => {
    const nodes = [mkNode("x")];
    const degrees = new Map([["x", 0]]);
    const stats = computeGraphStats(nodes, [], degrees);
    expect(stats.density).toBe(0);
    expect(stats.componentCount).toBe(1);
  });
});

describe("countConnectedComponents", () => {
  it("returns 0 for empty graph", () => {
    expect(countConnectedComponents([], [])).toBe(0);
  });

  it("returns 1 for fully connected graph", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
    expect(countConnectedComponents(nodes, edges)).toBe(1);
  });

  it("returns correct count for disconnected graph", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
    const edges = [mkEdge("a", "b"), mkEdge("c", "d")];
    expect(countConnectedComponents(nodes, edges)).toBe(2);
  });

  it("isolated nodes are each a component", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    expect(countConnectedComponents(nodes, [])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeNodeDegrees
// ---------------------------------------------------------------------------

describe("computeNodeDegrees", () => {
  it("returns empty map for empty graph", () => {
    expect(computeNodeDegrees([], []).size).toBe(0);
  });

  it("isolated nodes have degree 0", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const deg = computeNodeDegrees(nodes, []);
    expect(deg.get("a")).toBe(0);
    expect(deg.get("b")).toBe(0);
  });

  it("single edge gives degree 1 to both endpoints", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const edges = [mkEdge("a", "b")];
    const deg = computeNodeDegrees(nodes, edges);
    expect(deg.get("a")).toBe(1);
    expect(deg.get("b")).toBe(1);
  });

  it("hub node accumulates degree from all edges", () => {
    const nodes = [mkNode("hub"), mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [mkEdge("hub", "a"), mkEdge("hub", "b"), mkEdge("hub", "c")];
    const deg = computeNodeDegrees(nodes, edges);
    expect(deg.get("hub")).toBe(3);
    expect(deg.get("a")).toBe(1);
  });

  it("self-loop counts as 2 (source + target)", () => {
    const nodes = [mkNode("a")];
    const edges = [mkEdge("a", "a")];
    const deg = computeNodeDegrees(nodes, edges);
    expect(deg.get("a")).toBe(2);
  });

  it("parallel edges each contribute to degree", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const edges = [mkEdge("a", "b"), mkEdge("a", "b")];
    const deg = computeNodeDegrees(nodes, edges);
    expect(deg.get("a")).toBe(2);
    expect(deg.get("b")).toBe(2);
  });
});
