/**
 * Tests for src/views/NodeComparisonView.ts
 *
 * Covers:
 *   - VIEW_TYPE_NODE_COMPARE constant
 *   - NodeComparisonView public view-type methods (getViewType, getIcon)
 *   - Private bfs() shortest-path algorithm
 *   - Private computeComparison() set-arithmetic + BFS orchestration
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock obsidian before importing the module under test
// ---------------------------------------------------------------------------
vi.mock("obsidian", () => ({
  ItemView: class {
    constructor(_leaf?: any) {}
    app: any = {
      workspace: { on: () => ({}), trigger: () => {} },
      vault: { getAbstractFileByPath: () => null },
      metadataCache: { getFileCache: () => null },
    };
    containerEl: any = { empty: () => {}, createEl: () => ({}) };
    contentEl: any = { empty: () => {}, createEl: () => ({}) };
    registerEvent(_e: any) {}
  },
  Component: class {},
  WorkspaceLeaf: class {},
  setIcon: () => {},
}));

import {
  VIEW_TYPE_NODE_COMPARE,
  NodeComparisonView,
} from "../src/views/NodeComparisonView";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal GraphNode for testing */
function makeNode(id: string, opts: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts } as GraphNode;
}

/** Build an adjacency map from pairs */
function makeAdj(pairs: [string, string[]][]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const [id, neighbors] of pairs) {
    adj.set(id, new Set(neighbors));
  }
  return adj;
}

/** Create a NodeComparisonView instance with a stub leaf */
function makeView(): NodeComparisonView {
  return new NodeComparisonView(null as any);
}

// ---------------------------------------------------------------------------
// Constant
// ---------------------------------------------------------------------------

describe("VIEW_TYPE_NODE_COMPARE", () => {
  it("has the expected string value", () => {
    expect(VIEW_TYPE_NODE_COMPARE).toBe("graph-node-compare");
  });
});

// ---------------------------------------------------------------------------
// Public view-type methods
// ---------------------------------------------------------------------------

describe("NodeComparisonView public methods", () => {
  it("getViewType() returns the registered view type", () => {
    const view = makeView();
    expect(view.getViewType()).toBe("graph-node-compare");
  });

  it("getIcon() returns git-compare", () => {
    const view = makeView();
    expect(view.getIcon()).toBe("git-compare");
  });
});

// ---------------------------------------------------------------------------
// bfs — shortest-path algorithm
// ---------------------------------------------------------------------------

describe("NodeComparisonView bfs", () => {
  let view: NodeComparisonView;
  let bfs: (adj: Map<string, Set<string>>, startId: string, endId: string) => string[] | null;

  beforeEach(() => {
    view = makeView();
    bfs = (view as any).bfs.bind(view);
  });

  it("returns single-element path when start === end", () => {
    const adj = makeAdj([["a", ["b"]]]);
    expect(bfs(adj, "a", "a")).toEqual(["a"]);
  });

  it("finds a direct neighbour (distance 1)", () => {
    const adj = makeAdj([["a", ["b"]], ["b", ["a"]]]);
    const path = bfs(adj, "a", "b");
    expect(path).toEqual(["a", "b"]);
  });

  it("finds a two-hop path", () => {
    const adj = makeAdj([
      ["a", ["b"]],
      ["b", ["a", "c"]],
      ["c", ["b"]],
    ]);
    const path = bfs(adj, "a", "c");
    expect(path).toEqual(["a", "b", "c"]);
  });

  it("returns null when target is unreachable", () => {
    const adj = makeAdj([["a", ["b"]], ["b", ["a"]]]);
    expect(bfs(adj, "a", "isolated")).toBeNull();
  });

  it("handles empty adjacency map", () => {
    const adj = new Map<string, Set<string>>();
    expect(bfs(adj, "a", "b")).toBeNull();
  });

  it("finds shortest path in a diamond graph", () => {
    //   a
    //  / \
    // b   c
    //  \ /
    //   d
    const adj = makeAdj([
      ["a", ["b", "c"]],
      ["b", ["a", "d"]],
      ["c", ["a", "d"]],
      ["d", ["b", "c"]],
    ]);
    const path = bfs(adj, "a", "d");
    // BFS finds shortest: length 3, goes via b or c
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
    expect(path![0]).toBe("a");
    expect(path![2]).toBe("d");
  });

  it("handles node with no outgoing neighbours", () => {
    const adj = makeAdj([["a", []], ["b", ["a"]]]);
    expect(bfs(adj, "a", "b")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeComparison — set arithmetic + BFS orchestration
// ---------------------------------------------------------------------------

describe("NodeComparisonView computeComparison", () => {
  let view: NodeComparisonView;
  let compute: (
    nodeA: GraphNode,
    nodeB: GraphNode,
    adj: Map<string, Set<string>>,
  ) => ReturnType<any>;

  beforeEach(() => {
    view = makeView();
    compute = (view as any).computeComparison.bind(view);
  });

  it("finds shared neighbours correctly", () => {
    const nodeA = makeNode("a");
    const nodeB = makeNode("b");
    const adj = makeAdj([
      ["a", ["shared", "uniqueA"]],
      ["b", ["shared", "uniqueB"]],
    ]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.sharedNeighbors).toContain("shared");
    expect(result.sharedNeighbors).not.toContain("uniqueA");
    expect(result.sharedNeighbors).not.toContain("uniqueB");
  });

  it("identifies unique neighbours for each node", () => {
    const nodeA = makeNode("a");
    const nodeB = makeNode("b");
    const adj = makeAdj([
      ["a", ["shared", "onlyA"]],
      ["b", ["shared", "onlyB"]],
    ]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.uniqueToA).toContain("onlyA");
    expect(result.uniqueToB).toContain("onlyB");
    expect(result.uniqueToA).not.toContain("shared");
    expect(result.uniqueToB).not.toContain("shared");
  });

  it("excludes the other node from sharedNeighbors (no reflexive loop)", () => {
    const nodeA = makeNode("a");
    const nodeB = makeNode("b");
    const adj = makeAdj([
      ["a", ["b", "c"]],
      ["b", ["a", "c"]],
    ]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.sharedNeighbors).not.toContain("a");
    expect(result.sharedNeighbors).not.toContain("b");
    expect(result.sharedNeighbors).toContain("c");
  });

  it("finds shared tags", () => {
    const nodeA = makeNode("a", { tags: ["sci-fi", "action"] });
    const nodeB = makeNode("b", { tags: ["sci-fi", "drama"] });
    const adj = makeAdj([["a", []], ["b", []]]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.sharedTags).toContain("sci-fi");
    expect(result.uniqueTagsA).toContain("action");
    expect(result.uniqueTagsB).toContain("drama");
  });

  it("finds shared category", () => {
    const nodeA = makeNode("a", { category: "hero" });
    const nodeB = makeNode("b", { category: "hero" });
    const adj = makeAdj([["a", []], ["b", []]]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.sharedCategories).toContain("hero");
  });

  it("reports no shared category when they differ", () => {
    const nodeA = makeNode("a", { category: "hero" });
    const nodeB = makeNode("b", { category: "villain" });
    const adj = makeAdj([["a", []], ["b", []]]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.sharedCategories).toHaveLength(0);
  });

  it("computes shortest path between connected nodes", () => {
    const nodeA = makeNode("a");
    const nodeB = makeNode("c");
    const adj = makeAdj([
      ["a", ["b"]],
      ["b", ["a", "c"]],
      ["c", ["b"]],
    ]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.shortestPath).toEqual(["a", "b", "c"]);
    expect(result.pathLength).toBe(2);
  });

  it("reports null path when nodes are disconnected", () => {
    const nodeA = makeNode("a");
    const nodeB = makeNode("z");
    const adj = makeAdj([["a", ["b"]], ["b", ["a"]]]);
    const result = compute(nodeA, nodeB, adj);
    expect(result.shortestPath).toBeNull();
    expect(result.pathLength).toBe(-1);
  });

  it("handles nodes with no adjacency entries (no crash)", () => {
    const nodeA = makeNode("a");
    const nodeB = makeNode("b");
    const adj = new Map<string, Set<string>>();
    const result = compute(nodeA, nodeB, adj);
    expect(result.sharedNeighbors).toHaveLength(0);
    expect(result.uniqueToA).toHaveLength(0);
    expect(result.uniqueToB).toHaveLength(0);
    expect(result.shortestPath).toBeNull();
  });
});

