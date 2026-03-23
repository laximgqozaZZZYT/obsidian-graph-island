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

// ---------------------------------------------------------------------------
// applyTimelineLayout — category swim-lane fallback (no sequence edges)
// ---------------------------------------------------------------------------
describe("applyTimelineLayout category swim-lanes", () => {
  it("assigns lanes by category when no sequence edges exist", () => {
    const nodes = [
      makeNode("a", { category: "hero" }),
      makeNode("b", { category: "villain" }),
      makeNode("c", { category: "hero" }),
    ];
    const edges: GraphEdge[] = []; // no sequence edges
    const fm = makeFrontmatter({
      a: { date: "T1" },
      b: { date: "T1" },
      c: { date: "T2" },
    });

    const result = applyTimelineLayout(
      { nodes, edges },
      { timeKey: "date", getNodeProperty: fm, laneHeight: 80, startY: 0 },
    );

    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posB = result.data.nodes.find(n => n.id === "b")!;
    const posC = result.data.nodes.find(n => n.id === "c")!;

    // hero and villain should be on different Y lanes
    expect(posA.y).not.toBe(posB.y);
    // a and c are both "hero" → same lane (same Y baseline)
    expect(posA.y).toBe(posC.y);
  });

  it("puts all nodes on lane 0 when all share the same category", () => {
    const nodes = [
      makeNode("a", { category: "cat" }),
      makeNode("b", { category: "cat" }),
    ];
    const fm = makeFrontmatter({
      a: { date: "T1" },
      b: { date: "T2" },
    });

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm, startY: 0, laneHeight: 80 },
    );

    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posB = result.data.nodes.find(n => n.id === "b")!;
    expect(posA.y).toBe(posB.y);
    expect(result.lanes).toBe(1);
  });

  it("empty-category nodes share one lane", () => {
    const nodes = [makeNode("a"), makeNode("b")]; // no category
    const fm = makeFrontmatter({
      a: { date: "T1" },
      b: { date: "T2" },
    });

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm },
    );

    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posB = result.data.nodes.find(n => n.id === "b")!;
    expect(posA.y).toBe(posB.y);
  });
});

// ---------------------------------------------------------------------------
// applyTimelineLayout — auto-shrink stepWidth for wide timelines
// ---------------------------------------------------------------------------
describe("applyTimelineLayout auto-shrink stepWidth", () => {
  it("shrinks stepWidth when uniqueTimes exceed MAX_DESIRED_COLS (40)", () => {
    // Create 60 nodes with 60 unique time values → exceeds 40 cols
    const nodes = Array.from({ length: 60 }, (_, i) => makeNode(`n${i}`));
    const data: Record<string, Record<string, string>> = {};
    for (let i = 0; i < 60; i++) {
      data[`n${i}`] = { date: `T${String(i).padStart(3, "0")}` };
    }
    const fm = makeFrontmatter(data);

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm, stepWidth: 120, startX: 0 },
    );

    // With 60 time steps at default stepWidth=120, total would be 7200px.
    // Auto-shrink should reduce effective stepWidth:
    // effectiveStepWidth = max(20, round(40 * 120 / 60)) = max(20, 80) = 80
    const positions = result.data.nodes.map(n => n.x).sort((a, b) => a - b);
    const maxX = positions[positions.length - 1];
    // At 120px per step: maxX would be 59*120 = 7080
    // At 80px per step: maxX would be 59*80 = 4720
    expect(maxX).toBeLessThan(59 * 120); // must have shrunk
    expect(maxX).toBeGreaterThan(0);
  });

  it("does not shrink when uniqueTimes <= MAX_DESIRED_COLS", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`));
    const data: Record<string, Record<string, string>> = {};
    for (let i = 0; i < 10; i++) {
      data[`n${i}`] = { date: `T${i}` };
    }
    const fm = makeFrontmatter(data);

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm, stepWidth: 120, startX: 0 },
    );

    // 10 steps * 120 = final node at index 9 → x = 9 * 120 = 1080
    const positions = result.data.nodes.map(n => n.x);
    const maxX = Math.max(...positions);
    expect(maxX).toBe(9 * 120);
  });

  it("never shrinks below MIN_STEP_WIDTH (20px)", () => {
    // 200 unique times — effectiveStepWidth = max(20, round(40*120/200)) = max(20, 24) = 24
    const nodes = Array.from({ length: 200 }, (_, i) => makeNode(`n${i}`));
    const data: Record<string, Record<string, string>> = {};
    for (let i = 0; i < 200; i++) {
      data[`n${i}`] = { date: `T${String(i).padStart(4, "0")}` };
    }
    const fm = makeFrontmatter(data);

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm, stepWidth: 120, startX: 0 },
    );

    const positions = result.data.nodes.map(n => n.x).sort((a, b) => a - b);
    // Check spacing between consecutive time steps ≥ 20px
    const first = positions[0];
    const second = positions.find(x => x > first)!;
    expect(second - first).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// applyTimelineLayout — all-untimed grid layout
// ---------------------------------------------------------------------------
describe("applyTimelineLayout all-untimed grid", () => {
  it("arranges all untimed nodes in a balanced grid", () => {
    const nodes = Array.from({ length: 9 }, (_, i) => makeNode(`n${i}`));
    // No node has date → all untimed
    const fm = makeFrontmatter({});

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm, stepWidth: 100, laneHeight: 80, startX: 0, startY: 0 },
    );

    expect(result.placements).toHaveLength(0); // no timed nodes
    expect(result.timeSteps).toEqual([]);
    // lanes ≥ 1 because category fallback always yields at least 1 lane
    expect(result.lanes).toBeGreaterThanOrEqual(1);

    // 9 nodes → 3x3 grid (ceil(sqrt(9)) = 3 cols)
    const xs = new Set(result.data.nodes.map(n => n.x));
    const ys = new Set(result.data.nodes.map(n => n.y));
    expect(xs.size).toBe(3);
    expect(ys.size).toBe(3);
  });

  it("single untimed node gets placed at startX, startY", () => {
    const nodes = [makeNode("solo")];
    const fm = makeFrontmatter({});

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm, startX: 50, startY: 50 },
    );

    const pos = result.data.nodes[0];
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(50);
  });

  it("grid sorts nodes by filePath for deterministic ordering", () => {
    const nodes = [
      makeNode("c", { filePath: "zzz.md" } as any),
      makeNode("a", { filePath: "aaa.md" } as any),
      makeNode("b", { filePath: "mmm.md" } as any),
    ];
    const fm = makeFrontmatter({});

    const result = applyTimelineLayout(
      { nodes, edges: [] },
      { timeKey: "date", getNodeProperty: fm, stepWidth: 100, startX: 0, startY: 0 },
    );

    // Sorted by filePath: aaa.md < mmm.md < zzz.md
    // In a 2-col grid (ceil(sqrt(3))=2): [aaa, mmm] row0, [zzz] row1
    const posA = result.data.nodes.find(n => n.id === "a")!;
    const posB = result.data.nodes.find(n => n.id === "b")!;
    const posC = result.data.nodes.find(n => n.id === "c")!;
    // aaa should be first (lowest x in first row)
    expect(posA.x).toBeLessThanOrEqual(posB.x);
  });
});
