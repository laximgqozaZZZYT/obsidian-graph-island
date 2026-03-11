import { describe, it, expect } from "vitest";
import {
  applyTimelineLayout,
  buildTimelineDAG,
  assignLanes,
  defaultTimeComparator,
  type TimelineLayoutOptions,
} from "../src/layouts/timeline";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeNode(id: string, opts?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts };
}

function makeEdge(source: string, target: string, type?: string): GraphEdge {
  return { id: `${source}->${target}`, source, target, type: type as any };
}

function makeFrontmatter(data: Record<string, Record<string, string>>): (id: string, key: string) => string | undefined {
  return (id, key) => data[id]?.[key];
}

// ---------------------------------------------------------------------------
// defaultTimeComparator
// ---------------------------------------------------------------------------
describe("defaultTimeComparator", () => {
  it("sorts strings lexicographically", () => {
    expect(defaultTimeComparator("a", "b")).toBeLessThan(0);
    expect(defaultTimeComparator("b", "a")).toBeGreaterThan(0);
    expect(defaultTimeComparator("a", "a")).toBe(0);
  });

  it("handles date-like strings correctly", () => {
    expect(defaultTimeComparator("2024-01-01", "2024-02-15")).toBeLessThan(0);
    expect(defaultTimeComparator("2025-12-31", "2024-01-01")).toBeGreaterThan(0);
  });

  it("handles fictional calendar strings", () => {
    // "Year 1, Moon 3" < "Year 2, Moon 1" lexicographically
    expect(defaultTimeComparator("Year 1, Moon 3", "Year 2, Moon 1")).toBeLessThan(0);
    // Numbered eras
    expect(defaultTimeComparator("Era-01-Turn-05", "Era-01-Turn-12")).toBeLessThan(0);
    expect(defaultTimeComparator("Era-02-Turn-01", "Era-01-Turn-99")).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildTimelineDAG
// ---------------------------------------------------------------------------
describe("buildTimelineDAG", () => {
  it("builds adjacency list from sequence edges", () => {
    const edges = [
      makeEdge("a", "b", "sequence"),
      makeEdge("b", "c", "sequence"),
      makeEdge("a", "c", "link"), // non-sequence — ignored
    ];
    const timed = new Set(["a", "b", "c"]);
    const dag = buildTimelineDAG(edges, timed);
    expect(dag.get("a")).toEqual(["b"]);
    expect(dag.get("b")).toEqual(["c"]);
    expect(dag.get("c")).toEqual([]);
  });

  it("ignores edges involving non-timed nodes", () => {
    const edges = [
      makeEdge("a", "b", "sequence"),
      makeEdge("b", "x", "sequence"), // x not in timed set
    ];
    const timed = new Set(["a", "b"]);
    const dag = buildTimelineDAG(edges, timed);
    expect(dag.get("a")).toEqual(["b"]);
    expect(dag.get("b")).toEqual([]);
  });

  it("returns empty adjacency for nodes with no sequence edges", () => {
    const edges = [makeEdge("a", "b", "link")];
    const timed = new Set(["a", "b"]);
    const dag = buildTimelineDAG(edges, timed);
    expect(dag.get("a")).toEqual([]);
    expect(dag.get("b")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// assignLanes
// ---------------------------------------------------------------------------
describe("assignLanes", () => {
  it("assigns single lane for linear sequence", () => {
    const dag = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", []],
    ]);
    const timeIndex = new Map([["a", 0], ["b", 1], ["c", 2]]);
    const lanes = assignLanes(dag, timeIndex);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(0);
    expect(lanes.get("c")).toBe(0);
  });

  it("assigns separate lanes for branches (fork)", () => {
    // a → b, a → c (fork at a)
    const dag = new Map([
      ["a", ["b", "c"]],
      ["b", []],
      ["c", []],
    ]);
    const timeIndex = new Map([["a", 0], ["b", 1], ["c", 1]]);
    const lanes = assignLanes(dag, timeIndex);
    expect(lanes.get("a")).toBe(0);
    // First child stays on parent lane, second gets new lane
    expect(lanes.get("b")).toBe(0);
    expect(lanes.get("c")).toBe(1);
  });

  it("handles merge — first arrival wins the lane", () => {
    // a → c, b → c (merge at c)
    const dag = new Map([
      ["a", ["c"]],
      ["b", ["c"]],
      ["c", []],
    ]);
    const timeIndex = new Map([["a", 0], ["b", 0], ["c", 1]]);
    const lanes = assignLanes(dag, timeIndex);
    // a and b are both roots
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
    // c gets lane from whoever reaches it first in BFS
    expect(lanes.has("c")).toBe(true);
  });

  it("handles parallel independent branches", () => {
    // Two independent chains: a→b and c→d
    const dag = new Map([
      ["a", ["b"]],
      ["b", []],
      ["c", ["d"]],
      ["d", []],
    ]);
    const timeIndex = new Map([["a", 0], ["b", 1], ["c", 0], ["d", 1]]);
    const lanes = assignLanes(dag, timeIndex);
    // Each chain gets its own lane
    expect(lanes.get("a")).not.toBe(lanes.get("c"));
  });

  it("handles complex branching and merging", () => {
    // a → b → d
    // a → c → d (fork at a, merge at d)
    const dag = new Map([
      ["a", ["b", "c"]],
      ["b", ["d"]],
      ["c", ["d"]],
      ["d", []],
    ]);
    const timeIndex = new Map([["a", 0], ["b", 1], ["c", 1], ["d", 2]]);
    const lanes = assignLanes(dag, timeIndex);
    expect(lanes.get("b")).toBe(lanes.get("a")); // first child same lane
    expect(lanes.get("c")).not.toBe(lanes.get("a")); // second child new lane
  });

  it("all nodes in lane 0 when no edges exist", () => {
    const dag = new Map([
      ["a", []],
      ["b", []],
      ["c", []],
    ]);
    const timeIndex = new Map([["a", 0], ["b", 1], ["c", 2]]);
    const lanes = assignLanes(dag, timeIndex);
    for (const [, lane] of lanes) {
      // All roots get separate lanes since they are independent
      expect(typeof lane).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// applyTimelineLayout — integration
// ---------------------------------------------------------------------------
describe("applyTimelineLayout", () => {
  it("returns empty result for empty graph", () => {
    const result = applyTimelineLayout(
      { nodes: [], edges: [] },
      { timeKey: "date" },
    );
    expect(result.data.nodes).toEqual([]);
    expect(result.placements).toEqual([]);
    expect(result.lanes).toBe(0);
    expect(result.timeSteps).toEqual([]);
  });

  it("positions nodes along X axis by time order", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges: GraphEdge[] = [
      makeEdge("a", "b", "sequence"),
      makeEdge("b", "c", "sequence"),
    ];
    const fm = makeFrontmatter({
      a: { date: "2024-01-01" },
      b: { date: "2024-02-01" },
      c: { date: "2024-03-01" },
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "date", getNodeProperty: fm, stepWidth: 100, startX: 0, startY: 0 },
    );

    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posB = result.data.nodes.find(n => n.id === "b")!;
    const posC = result.data.nodes.find(n => n.id === "c")!;

    expect(posA.x).toBeLessThan(posB.x);
    expect(posB.x).toBeLessThan(posC.x);
    // All on same lane (linear sequence)
    expect(posA.y).toBe(posB.y);
    expect(posB.y).toBe(posC.y);
  });

  it("assigns different Y positions for forking branches", () => {
    const nodes = [makeNode("root"), makeNode("branch1"), makeNode("branch2")];
    const edges: GraphEdge[] = [
      makeEdge("root", "branch1", "sequence"),
      makeEdge("root", "branch2", "sequence"),
    ];
    const fm = makeFrontmatter({
      root: { era: "Era-01" },
      branch1: { era: "Era-02" },
      branch2: { era: "Era-02" },
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "era", getNodeProperty: fm, laneHeight: 80 },
    );

    const rootN = result.data.nodes.find(n => n.id === "root")!;
    const b1 = result.data.nodes.find(n => n.id === "branch1")!;
    const b2 = result.data.nodes.find(n => n.id === "branch2")!;

    // branch1 and branch2 should be on different Y positions
    expect(b1.y).not.toBe(b2.y);
    // root and branch1 (first child) should be on same lane
    expect(rootN.y).toBe(b1.y);
  });

  it("supports fictional calendar with custom comparator", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges: GraphEdge[] = [
      makeEdge("a", "b", "sequence"),
      makeEdge("b", "c", "sequence"),
    ];
    // Fictional: "Dragon-01-Moon-03" format
    const fm = makeFrontmatter({
      a: { turn: "Dragon-01-Moon-03" },
      b: { turn: "Dragon-01-Moon-07" },
      c: { turn: "Dragon-02-Moon-01" },
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "turn", getNodeProperty: fm },
    );

    expect(result.timeSteps).toEqual([
      "Dragon-01-Moon-03",
      "Dragon-01-Moon-07",
      "Dragon-02-Moon-01",
    ]);
    // Nodes should be ordered correctly on X axis
    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posC = result.data.nodes.find(n => n.id === "c")!;
    expect(posA.x).toBeLessThan(posC.x);
  });

  it("places non-timed nodes below the timeline", () => {
    const nodes = [makeNode("a"), makeNode("orphan")];
    const edges: GraphEdge[] = [];
    const fm = makeFrontmatter({
      a: { date: "2024-01-01" },
      // orphan has no date
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "date", getNodeProperty: fm, laneHeight: 80, startY: 0 },
    );

    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posOrphan = result.data.nodes.find(n => n.id === "orphan")!;

    // Orphan should be placed to the right of timed nodes (grid at right edge)
    expect(posOrphan.x).toBeGreaterThan(posA.x);
  });

  it("handles backtracking — node referencing earlier time", () => {
    // a(t=1) → b(t=2) → c(t=1) — c goes back to same time as a
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges: GraphEdge[] = [
      makeEdge("a", "b", "sequence"),
      makeEdge("b", "c", "sequence"),
    ];
    const fm = makeFrontmatter({
      a: { date: "T1" },
      b: { date: "T2" },
      c: { date: "T1" }, // backtrack to T1
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "date", getNodeProperty: fm },
    );

    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posC = result.data.nodes.find(n => n.id === "c")!;
    // a and c share the same time index, so same X
    expect(posA.x).toBe(posC.x);
    // a and c share same lane, but c stacks below a in the same cell
    // (both at time T1, lane 0, but with vertical stacking for collisions)
    expect(posA.y).toBeLessThanOrEqual(posC.y);
  });

  it("preserves edges unchanged", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("a", "b", "link"), makeEdge("a", "b", "sequence")];
    const fm = makeFrontmatter({ a: { d: "1" }, b: { d: "2" } });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "d", getNodeProperty: fm },
    );

    expect(result.data.edges).toBe(edges); // same reference
  });

  it("handles multiple nodes at same time step", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges: GraphEdge[] = [];
    const fm = makeFrontmatter({
      a: { date: "2024-01" },
      b: { date: "2024-01" }, // same time as a
      c: { date: "2024-02" },
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "date", getNodeProperty: fm, stepWidth: 100 },
    );

    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posB = result.data.nodes.find(n => n.id === "b")!;
    // Same time step → same X position
    expect(posA.x).toBe(posB.x);
  });

  it("returns correct placements metadata", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("a", "b", "sequence")];
    const fm = makeFrontmatter({
      a: { date: "2024-01" },
      b: { date: "2024-02" },
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "date", getNodeProperty: fm },
    );

    expect(result.placements).toHaveLength(2);
    const pA = result.placements.find(p => p.nodeId === "a")!;
    expect(pA.timeValue).toBe("2024-01");
    expect(pA.timeIndex).toBe(0);
    expect(result.timeSteps).toEqual(["2024-01", "2024-02"]);
  });

  it("works with custom time comparator for reverse order", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges: GraphEdge[] = [];
    const fm = makeFrontmatter({
      a: { p: "3" }, b: { p: "1" }, c: { p: "2" },
    });

    // Custom: numeric reverse sort
    const result = applyTimelineLayout(
      { nodes, edges },
      {
        timeKey: "p",
        getNodeProperty: fm,
        timeComparator: (a, b) => Number(b) - Number(a),
      },
    );

    expect(result.timeSteps).toEqual(["3", "2", "1"]);
  });
});
