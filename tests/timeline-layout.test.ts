import { describe, it, expect } from "vitest";
import {
  buildLinkChainOrder,
  buildHierarchyOrder,
  resolveTimeKey,
  timelinePartitionNodes,
  timelineSortAndBuildSteps,
  timelineComputeSpacing,
  timelineCenterOffsets,
  timelineBuildSequenceEdges,
  timelinePlaceTimedNodes,
  timelineAlignHierarchy,
  timelinePlaceUntimedNodes,
} from "../src/layouts/timeline-layout";
import type { GraphNode } from "../src/types";
import type { ClusterForceConfig } from "../src/layouts/cluster-force";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string): GraphNode {
  return { id, x: 0, y: 0, group: "" } as GraphNode;
}

function propMap(data: Record<string, Record<string, string>>): (id: string, key: string) => string | undefined {
  return (id, key) => data[id]?.[key];
}

// ---------------------------------------------------------------------------
// buildLinkChainOrder
// ---------------------------------------------------------------------------

describe("buildLinkChainOrder", () => {
  it("returns empty order when no forward/reverse fields", () => {
    const members = [mkNode("a"), mkNode("b")];
    const { order, chains } = buildLinkChainOrder(members, () => undefined);
    expect(order.size).toBe(0);
    expect(chains).toEqual([]);
  });

  it("builds a simple forward chain A→B→C", () => {
    const members = [mkNode("a"), mkNode("b"), mkNode("c")];
    const props = propMap({
      a: { next: "[[b]]" },
      b: { next: "[[c]]" },
      c: {},
    });
    const { order, chains } = buildLinkChainOrder(members, props, ["next"]);
    expect(order.get("a")).toBe(0);
    expect(order.get("b")).toBe(1);
    expect(order.get("c")).toBe(2);
    expect(chains).toEqual([["a", "b", "c"]]);
  });

  it("builds a reverse chain using prev fields", () => {
    const members = [mkNode("a"), mkNode("b"), mkNode("c")];
    const props = propMap({
      a: {},
      b: { prev: "[[a]]" },
      c: { prev: "[[b]]" },
    });
    const { order, chains } = buildLinkChainOrder(members, props, [], ["prev"]);
    // a→b→c chain should form
    expect(chains.length).toBe(1);
    expect(chains[0].length).toBe(3);
    expect(order.size).toBe(3);
  });

  it("ignores links to non-member nodes", () => {
    const members = [mkNode("a"), mkNode("b")];
    const props = propMap({
      a: { next: "[[external]]" },
      b: {},
    });
    const { order } = buildLinkChainOrder(members, props, ["next"]);
    expect(order.size).toBe(0);
  });

  it("handles two separate chains", () => {
    const members = [mkNode("a"), mkNode("b"), mkNode("x"), mkNode("y")];
    const props = propMap({
      a: { next: "[[b]]" },
      b: {},
      x: { next: "[[y]]" },
      y: {},
    });
    const { order, chains } = buildLinkChainOrder(members, props, ["next"]);
    expect(chains.length).toBe(2);
    expect(order.size).toBe(4);
  });

  it("handles wikilink with alias [[target|alias]]", () => {
    const members = [mkNode("a"), mkNode("b")];
    const props = propMap({
      a: { next: "[[b|B node]]" },
      b: {},
    });
    const { chains } = buildLinkChainOrder(members, props, ["next"]);
    expect(chains).toEqual([["a", "b"]]);
  });

  it("breaks cycles gracefully", () => {
    const members = [mkNode("a"), mkNode("b"), mkNode("c")];
    const props = propMap({
      a: { next: "[[b]]" },
      b: { next: "[[c]]" },
      c: { next: "[[a]]" },  // cycle back
    });
    const { order, chains } = buildLinkChainOrder(members, props, ["next"]);
    // visited set prevents infinite loop; all 3 should be ordered
    expect(order.size).toBe(3);
    expect(chains.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// buildHierarchyOrder
// ---------------------------------------------------------------------------

describe("buildHierarchyOrder", () => {
  it("returns empty order when no parent_id fields", () => {
    const members = [mkNode("a"), mkNode("b")];
    const order = buildHierarchyOrder(members, () => undefined);
    expect(order.size).toBe(0);
  });

  it("builds DFS order from parent→children hierarchy", () => {
    // root → [child1(so=1), child2(so=2)]
    const members = [mkNode("root"), mkNode("child1"), mkNode("child2")];
    const props = propMap({
      root: {},
      child1: { parent_id: "root", story_order: "1" },
      child2: { parent_id: "root", story_order: "2" },
    });
    const order = buildHierarchyOrder(members, props);
    expect(order.get("root")).toBe(0);
    expect(order.get("child1")).toBe(1);
    expect(order.get("child2")).toBe(2);
    expect(order.parentMap?.get("child1")).toBe("root");
    expect(order.childrenMap?.get("root")).toEqual(["child1", "child2"]);
  });

  it("sorts children by story_order", () => {
    const members = [mkNode("root"), mkNode("a"), mkNode("b"), mkNode("c")];
    const props = propMap({
      root: {},
      a: { parent_id: "root", story_order: "3" },
      b: { parent_id: "root", story_order: "1" },
      c: { parent_id: "root", story_order: "2" },
    });
    const order = buildHierarchyOrder(members, props);
    // b(1) < c(2) < a(3) after root
    expect(order.get("root")).toBe(0);
    expect(order.get("b")).toBe(1);
    expect(order.get("c")).toBe(2);
    expect(order.get("a")).toBe(3);
  });

  it("handles deep nesting (3 levels)", () => {
    const members = [mkNode("r"), mkNode("p"), mkNode("c")];
    const props = propMap({
      r: {},
      p: { parent_id: "r", story_order: "1" },
      c: { parent_id: "p", story_order: "1" },
    });
    const order = buildHierarchyOrder(members, props);
    expect(order.get("r")).toBe(0);
    expect(order.get("p")).toBe(1);
    expect(order.get("c")).toBe(2);
  });

  it("handles wikilink parent_id [[parent]]", () => {
    const members = [mkNode("root"), mkNode("child")];
    const props = propMap({
      root: {},
      child: { parent_id: "[[root]]", story_order: "1" },
    });
    const order = buildHierarchyOrder(members, props);
    expect(order.get("root")).toBe(0);
    expect(order.get("child")).toBe(1);
  });

  it("ignores parent_id pointing to non-member", () => {
    const members = [mkNode("a")];
    const props = propMap({
      a: { parent_id: "external" },
    });
    const order = buildHierarchyOrder(members, props);
    expect(order.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveTimeKey
// ---------------------------------------------------------------------------

describe("resolveTimeKey", () => {
  it("returns null for empty members", () => {
    expect(resolveTimeKey([], "date")).toBe(null);
  });

  it("returns null when no getNodeProperty", () => {
    expect(resolveTimeKey([mkNode("a")], "date")).toBe(null);
  });

  it("returns primary key when nodes have it", () => {
    const members = [mkNode("a"), mkNode("b"), mkNode("c")];
    const props = propMap({
      a: { mydate: "2024-01" },
      b: { mydate: "2024-02" },
      c: {},
    });
    const result = resolveTimeKey(members, "mydate", props);
    expect(result).toBe("mydate");
  });

  it("falls back to start-date when primary key has 0 coverage", () => {
    const members = [mkNode("a"), mkNode("b")];
    const props = propMap({
      a: { "start-date": "2024-01" },
      b: { "start-date": "2024-02" },
    });
    const result = resolveTimeKey(members, "nonexistent", props);
    expect(result).toBe("start-date");
  });

  it("falls back to story_order", () => {
    const members = [mkNode("a"), mkNode("b")];
    const props = propMap({
      a: { story_order: "1" },
      b: { story_order: "2" },
    });
    const result = resolveTimeKey(members, "missing", props);
    expect(result).toBe("story_order");
  });

  it("returns null when no key has any coverage", () => {
    const members = [mkNode("a"), mkNode("b")];
    const props = propMap({ a: {}, b: {} });
    const result = resolveTimeKey(members, "missing", props);
    expect(result).toBe(null);
  });

  it("prefers primary key even with low coverage", () => {
    const members = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`));
    const data: Record<string, Record<string, string>> = {};
    // Only 1 node has the primary key — but count > 0 so it should be returned
    for (let i = 0; i < 10; i++) data[`n${i}`] = {};
    data["n0"]["custom_date"] = "2024-01";
    const result = resolveTimeKey(members, "custom_date", propMap(data));
    expect(result).toBe("custom_date");
  });
});

// ---------------------------------------------------------------------------
// buildLinkChainOrder — additional boundary values (cycle118)
// ---------------------------------------------------------------------------
describe("buildLinkChainOrder boundary values", () => {
  it("single node with no links: empty order and chains", () => {
    const result = buildLinkChainOrder([mkNode("a")], () => undefined, ["next"], []);
    expect(result.chains).toHaveLength(0);
    expect(result.order.size).toBe(0);
  });

  it("long chain via wikilinks: order is monotonically increasing", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`));
    const data: Record<string, Record<string, string>> = {};
    for (let i = 0; i < 10; i++) data[`n${i}`] = {};
    for (let i = 0; i < 9; i++) data[`n${i}`].next = `[[n${i + 1}]]`;
    const result = buildLinkChainOrder(nodes, propMap(data), ["next"], []);
    expect(result.chains.length).toBe(1);
    expect(result.chains[0]).toHaveLength(10);
    // Order is monotonically increasing
    for (let i = 1; i < 10; i++) {
      expect(result.order.get(`n${i}`)!).toBeGreaterThan(result.order.get(`n${i - 1}`)!);
    }
  });

  it("two separate chains produce two chain arrays", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
    const data: Record<string, Record<string, string>> = {
      a: { next: "[[b]]" }, b: {}, c: { next: "[[d]]" }, d: {},
    };
    const result = buildLinkChainOrder(nodes, propMap(data), ["next"], []);
    expect(result.chains.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildHierarchyOrder — additional boundary values (cycle118)
// ---------------------------------------------------------------------------
describe("buildHierarchyOrder boundary values", () => {
  it("no parent_id: order is empty", () => {
    const result = buildHierarchyOrder([mkNode("a")], () => undefined);
    expect(result.size).toBe(0);
  });

  it("mutual parent reference (cycle) doesn't infinite loop", () => {
    const data: Record<string, Record<string, string>> = {
      a: { parent_id: "b" }, b: { parent_id: "a" },
    };
    const result = buildHierarchyOrder([mkNode("a"), mkNode("b")], propMap(data));
    // Should not hang; both nodes processed
    expect(result.size).toBe(2);
  });

  it("deep chain: root gets lowest order value", () => {
    const data: Record<string, Record<string, string>> = { n0: {} };
    for (let i = 1; i < 10; i++) data[`n${i}`] = { parent_id: `n${i - 1}` };
    const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`));
    const result = buildHierarchyOrder(nodes, propMap(data));
    expect(result.size).toBe(10);
    const rootOrder = result.get("n0")!;
    for (let i = 1; i < 10; i++) {
      expect(result.get(`n${i}`)!).toBeGreaterThan(rootOrder);
    }
  });

  it("wikilink parent_id: resolved correctly", () => {
    const data: Record<string, Record<string, string>> = {
      root: {},
      child: { parent_id: "[[root]]" },
    };
    const result = buildHierarchyOrder([mkNode("root"), mkNode("child")], propMap(data));
    expect(result.size).toBe(2);
    expect(result.get("root")!).toBeLessThan(result.get("child")!);
  });
});

// ---------------------------------------------------------------------------
// timelinePartitionNodes — split nodes into timed/untimed
// ---------------------------------------------------------------------------
describe("timelinePartitionNodes", () => {
  function baseCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
    return {
      groupRules: [],
      arrangement: "timeline",
      centerX: 400, centerY: 300,
      width: 800, height: 600,
      nodeSize: 15, nodeSpacing: 2,
      groupScale: 1, groupSpacing: 1,
      repelForce: 50, linkDistance: 100,
      linkForce: 0.5, centerForce: 0.3,
      totalNodeCount: 10,
      timelineKey: "date",
      timelineOrderFields: "",
      sequenceFields: [],
      reverseSequenceFields: [],
      getNodeProperty: (id: string, field: string) => {
        const data: Record<string, Record<string, string>> = {};
        return data[id]?.[field];
      },
      ...overrides,
    } as ClusterForceConfig;
  }

  it("empty input returns empty timed and untimed", () => {
    const result = timelinePartitionNodes([], baseCfg());
    expect(result.timed).toHaveLength(0);
    expect(result.untimed).toHaveLength(0);
  });

  it("all untimed when no date field", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const result = timelinePartitionNodes(nodes, baseCfg());
    expect(result.timed).toHaveLength(0);
    expect(result.untimed).toHaveLength(2);
  });

  it("partitions timed and untimed nodes", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const cfg = baseCfg({
      getNodeProperty: (id, field) => {
        if (field === "date") {
          if (id === "a") return "2024-01-01";
          if (id === "b") return "2024-06-15";
        }
        return undefined;
      },
    });
    const result = timelinePartitionNodes(nodes, cfg);
    expect(result.timed).toHaveLength(2);
    expect(result.untimed).toHaveLength(1);
    expect(result.untimed[0].id).toBe("c");
  });

  it("all timed when every node has date", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const cfg = baseCfg({
      getNodeProperty: (id, field) => field === "date" ? "2024-01-01" : undefined,
    });
    const result = timelinePartitionNodes(nodes, cfg);
    expect(result.timed).toHaveLength(2);
    expect(result.untimed).toHaveLength(0);
  });

  it("timed entries preserve node reference and value", () => {
    const nodes = [mkNode("x")];
    const cfg = baseCfg({
      getNodeProperty: (id, field) => field === "date" ? "Era-3" : undefined,
    });
    const result = timelinePartitionNodes(nodes, cfg);
    expect(result.timed[0].node.id).toBe("x");
    expect(result.timed[0].value).toBe("Era-3");
  });

  it("empty string date value is treated as untimed", () => {
    const nodes = [mkNode("a")];
    const cfg = baseCfg({
      getNodeProperty: (id, field) => field === "date" ? "" : undefined,
    });
    const result = timelinePartitionNodes(nodes, cfg);
    expect(result.timed).toHaveLength(0);
    expect(result.untimed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// timelineSortAndBuildSteps
// ---------------------------------------------------------------------------
describe("timelineSortAndBuildSteps", () => {
  it("sorts numeric values numerically", () => {
    const timed = [
      { node: mkNode("a"), value: "10" },
      { node: mkNode("b"), value: "2" },
      { node: mkNode("c"), value: "1" },
    ];
    const r = timelineSortAndBuildSteps(timed);
    expect(r.allNumeric).toBe(true);
    expect(r.sortedTimed.map(t => t.value)).toEqual(["1", "2", "10"]);
  });

  it("sorts non-numeric values lexicographically", () => {
    const timed = [
      { node: mkNode("a"), value: "beta" },
      { node: mkNode("b"), value: "alpha" },
    ];
    const r = timelineSortAndBuildSteps(timed);
    expect(r.allNumeric).toBe(false);
    expect(r.sortedTimed.map(t => t.value)).toEqual(["alpha", "beta"]);
  });

  it("builds unique time steps with correct indices", () => {
    const timed = [
      { node: mkNode("a"), value: "T1" },
      { node: mkNode("b"), value: "T2" },
      { node: mkNode("c"), value: "T1" },
    ];
    const r = timelineSortAndBuildSteps(timed);
    expect(r.uniqueTimes).toEqual(["T1", "T2"]);
    expect(r.timeIndexMap.get("T1")).toBe(0);
    expect(r.timeIndexMap.get("T2")).toBe(1);
  });

  it("separates synthetic __chain_ from real timed", () => {
    const timed = [
      { node: mkNode("a"), value: "2024-01" },
      { node: mkNode("b"), value: "__chain_000001" },
      { node: mkNode("c"), value: "2024-02" },
    ];
    const r = timelineSortAndBuildSteps(timed);
    expect(r.allNumeric).toBe(false);
    const ids = r.sortedTimed.map(t => t.node.id);
    expect(ids.indexOf("b")).toBeGreaterThan(ids.indexOf("a"));
    expect(ids.indexOf("b")).toBeGreaterThan(ids.indexOf("c"));
  });

  it("empty input → empty results", () => {
    const r = timelineSortAndBuildSteps([]);
    expect(r.sortedTimed).toEqual([]);
    expect(r.uniqueTimes).toEqual([]);
    expect(r.allNumeric).toBe(false);
  });

  it("mixed numeric/non-numeric → lexicographic", () => {
    const timed = [
      { node: mkNode("a"), value: "abc" },
      { node: mkNode("b"), value: "123" },
    ];
    const r = timelineSortAndBuildSteps(timed);
    expect(r.allNumeric).toBe(false);
    expect(r.sortedTimed[0].value).toBe("123");
  });
});

// ---------------------------------------------------------------------------
// timelineComputeSpacing
// ---------------------------------------------------------------------------
describe("timelineComputeSpacing", () => {
  it("returns base spacing when cols ≤ 40", () => {
    const r = timelineComputeSpacing(10, 0, 60, 15);
    expect(r.effectiveSpacing).toBe(60);
  });

  it("shrinks spacing when total cols > 40", () => {
    const r = timelineComputeSpacing(50, 0, 60, 15);
    expect(r.effectiveSpacing).toBeLessThan(60);
  });

  it("minimum spacing scales with node count", () => {
    const huge = timelineComputeSpacing(210, 0, 60, 15);
    expect(huge.effectiveSpacing).toBeGreaterThanOrEqual(15 * 1.2);
  });

  it("yStackSpacing ≥ barH + barGap", () => {
    const r = timelineComputeSpacing(10, 0, 30, 15);
    expect(r.yStackSpacing).toBeGreaterThanOrEqual(15 * 2 + 15 * 1.5);
  });

  it("includes untimed grid cols in total", () => {
    const at = timelineComputeSpacing(35, 25, 60, 15);
    expect(at.effectiveSpacing).toBe(60);
    const above = timelineComputeSpacing(36, 25, 60, 15);
    expect(above.effectiveSpacing).toBeLessThan(60);
  });

  it("custom _barGapFactor affects yStackSpacing", () => {
    const r = timelineComputeSpacing(10, 0, 60, 15, { _barGapFactor: 3.0 });
    expect(r.yStackSpacing).toBeGreaterThanOrEqual(15 * 2 + 15 * 3.0);
  });
});

// ---------------------------------------------------------------------------
// timelineCenterOffsets
// ---------------------------------------------------------------------------
describe("timelineCenterOffsets", () => {
  it("centers single offset to (0,0)", () => {
    const offsets = new Map([["a", { dx: 100, dy: 200 }]]);
    timelineCenterOffsets(offsets);
    expect(offsets.get("a")).toEqual({ dx: 0, dy: 0 });
  });

  it("centers two offsets symmetrically", () => {
    const offsets = new Map([
      ["a", { dx: 0, dy: 0 }],
      ["b", { dx: 100, dy: 200 }],
    ]);
    timelineCenterOffsets(offsets);
    expect(offsets.get("a")).toEqual({ dx: -50, dy: -100 });
    expect(offsets.get("b")).toEqual({ dx: 50, dy: 100 });
  });

  it("preserves relative distances", () => {
    const offsets = new Map([
      ["a", { dx: 10, dy: 20 }],
      ["b", { dx: 30, dy: 60 }],
    ]);
    timelineCenterOffsets(offsets);
    const a = offsets.get("a")!, b = offsets.get("b")!;
    expect(b.dx - a.dx).toBe(20);
    expect(b.dy - a.dy).toBe(40);
  });

  it("empty offsets doesn't throw", () => {
    const offsets = new Map<string, { dx: number; dy: number }>();
    expect(() => timelineCenterOffsets(offsets)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// timelineBuildSequenceEdges
// ---------------------------------------------------------------------------
describe("timelineBuildSequenceEdges", () => {
  it("generates edges between adjacent timed nodes", () => {
    const sorted = [
      { node: mkNode("a"), value: "T1" },
      { node: mkNode("b"), value: "T2" },
      { node: mkNode("c"), value: "T3" },
    ];
    const edges = timelineBuildSequenceEdges(sorted);
    expect(edges).toHaveLength(2);
    expect(edges[0].source).toBe("a");
    expect(edges[0].target).toBe("b");
    expect(edges[0].type).toBe("sequence");
  });

  it("returns empty for single node", () => {
    expect(timelineBuildSequenceEdges([{ node: mkNode("a"), value: "T1" }])).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(timelineBuildSequenceEdges([])).toEqual([]);
  });

  it("skips edges between real and synthetic nodes", () => {
    const sorted = [
      { node: mkNode("a"), value: "T1" },
      { node: mkNode("b"), value: "__chain_000001" },
    ];
    expect(timelineBuildSequenceEdges(sorted)).toHaveLength(0);
  });

  it("generates edges between same-prefix synthetic nodes", () => {
    const sorted = [
      { node: mkNode("a"), value: "__chain_000001" },
      { node: mkNode("b"), value: "__chain_000002" },
    ];
    const edges = timelineBuildSequenceEdges(sorted);
    expect(edges).toHaveLength(1);
  });

  it("skips edges between different synthetic prefixes", () => {
    const sorted = [
      { node: mkNode("a"), value: "__chain_000001" },
      { node: mkNode("b"), value: "__hier_000001" },
    ];
    expect(timelineBuildSequenceEdges(sorted)).toHaveLength(0);
  });

  it("edge IDs are __seq__ prefixed", () => {
    const sorted = [
      { node: mkNode("x"), value: "T1" },
      { node: mkNode("y"), value: "T2" },
    ];
    expect(timelineBuildSequenceEdges(sorted)[0].id).toBe("__seq__x__y");
  });
});

// ---------------------------------------------------------------------------
// timelinePlaceTimedNodes — X=time column, Y=stack within column
// ---------------------------------------------------------------------------
describe("timelinePlaceTimedNodes", () => {
  it("places nodes at correct X based on time index", () => {
    const sorted = [
      { node: mkNode("a"), value: "T1" },
      { node: mkNode("b"), value: "T2" },
    ];
    const timeIndexMap = new Map([["T1", 0], ["T2", 1]]);
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceTimedNodes(sorted, timeIndexMap, 100, 60, undefined, offsets);
    expect(offsets.get("a")!.dx).toBe(0);
    expect(offsets.get("b")!.dx).toBe(100);
  });

  it("stacks nodes in same column vertically", () => {
    const sorted = [
      { node: mkNode("a"), value: "T1" },
      { node: mkNode("b"), value: "T1" },
    ];
    const timeIndexMap = new Map([["T1", 0]]);
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceTimedNodes(sorted, timeIndexMap, 100, 60, undefined, offsets);
    expect(offsets.get("a")!.dx).toBe(0);
    expect(offsets.get("b")!.dx).toBe(0);
    expect(offsets.get("a")!.dy).toBe(0);
    expect(offsets.get("b")!.dy).toBe(60); // stacked
  });

  it("places chain nodes below non-chain nodes", () => {
    const sorted = [
      { node: mkNode("a"), value: "T1" },
      { node: mkNode("c1"), value: "__chain_000000" },
      { node: mkNode("c2"), value: "__chain_000001" },
    ];
    const timeIndexMap = new Map([["T1", 0], ["__chain_000000", 1], ["__chain_000001", 2]]);
    const offsets = new Map<string, { dx: number; dy: number }>();
    const chains = [["c1", "c2"]];
    timelinePlaceTimedNodes(sorted, timeIndexMap, 100, 60, undefined, offsets, chains);
    // Non-chain "a" at dy=0, chain nodes at dy ≥ yStackSpacing
    expect(offsets.get("a")!.dy).toBe(0);
    expect(offsets.get("c1")!.dy).toBeGreaterThanOrEqual(60);
    expect(offsets.get("c2")!.dy).toBeGreaterThanOrEqual(60);
    // Chain nodes share same Y row
    expect(offsets.get("c1")!.dy).toBe(offsets.get("c2")!.dy);
  });

  it("empty input produces empty offsets", () => {
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceTimedNodes([], new Map(), 100, 60, undefined, offsets);
    expect(offsets.size).toBe(0);
  });

  it("respects nodeSpacingMap for individual node spacing", () => {
    const sorted = [
      { node: mkNode("a"), value: "T1" },
      { node: mkNode("b"), value: "T1" },
    ];
    const timeIndexMap = new Map([["T1", 0]]);
    const offsets = new Map<string, { dx: number; dy: number }>();
    const spacingMap = new Map([["b", 2.0]]);
    timelinePlaceTimedNodes(sorted, timeIndexMap, 100, 60, spacingMap, offsets);
    // Node "b" has spacing=2.0, so dy = 1 * 60 * 2.0 = 120
    expect(offsets.get("b")!.dy).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// timelineAlignHierarchy — parent→child Y alignment
// ---------------------------------------------------------------------------
describe("timelineAlignHierarchy", () => {
  it("places children directly below parent", () => {
    const parentMap = new Map([["c1", "root"], ["c2", "root"]]);
    const childrenMap = new Map([["root", ["c1", "c2"]]]);
    const offsets = new Map([
      ["root", { dx: 100, dy: 0 }],
      ["c1", { dx: 200, dy: 200 }], // will be overwritten
      ["c2", { dx: 300, dy: 300 }],
    ]);
    timelineAlignHierarchy(parentMap, childrenMap, offsets, 50);
    // Children get same dx as parent, dy = parent.dy + (i+1)*yStackSpacing
    expect(offsets.get("c1")).toEqual({ dx: 100, dy: 50 });
    expect(offsets.get("c2")).toEqual({ dx: 100, dy: 100 });
  });

  it("handles deep nesting (3 levels)", () => {
    const parentMap = new Map([["child", "mid"], ["mid", "root"]]);
    const childrenMap = new Map([["root", ["mid"]], ["mid", ["child"]]]);
    const offsets = new Map([
      ["root", { dx: 0, dy: 0 }],
      ["mid", { dx: 50, dy: 50 }],
      ["child", { dx: 99, dy: 99 }],
    ]);
    timelineAlignHierarchy(parentMap, childrenMap, offsets, 40);
    // root → mid at dy=40, mid → child at dy=80
    expect(offsets.get("mid")).toEqual({ dx: 0, dy: 40 });
    expect(offsets.get("child")).toEqual({ dx: 0, dy: 80 });
  });

  it("no-op when parentMap is empty", () => {
    const offsets = new Map([["a", { dx: 10, dy: 20 }]]);
    timelineAlignHierarchy(new Map(), new Map(), offsets, 50);
    expect(offsets.get("a")).toEqual({ dx: 10, dy: 20 });
  });

  it("skips children whose parent has no offset", () => {
    const parentMap = new Map([["c", "ghost"]]);
    const childrenMap = new Map([["ghost", ["c"]]]);
    const offsets = new Map([["c", { dx: 0, dy: 0 }]]);
    // "ghost" not in offsets → children not repositioned
    timelineAlignHierarchy(parentMap, childrenMap, offsets, 50);
    expect(offsets.get("c")).toEqual({ dx: 0, dy: 0 });
  });
});

// ---------------------------------------------------------------------------
// timelinePlaceUntimedNodes — compact grid after timed columns
// ---------------------------------------------------------------------------
describe("timelinePlaceUntimedNodes", () => {
  it("places nodes in grid after timed columns", () => {
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceUntimedNodes(nodes, 5, 100, 60, offsets);
    // startX = 5*100 + 100*2 = 700
    // 4 nodes → 2x2 grid
    expect(offsets.size).toBe(4);
    const dxValues = [...offsets.values()].map(o => o.dx);
    expect(Math.min(...dxValues)).toBe(700);
  });

  it("no-op for empty untimed list", () => {
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceUntimedNodes([], 5, 100, 60, offsets);
    expect(offsets.size).toBe(0);
  });

  it("single node placed at startX", () => {
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceUntimedNodes([mkNode("solo")], 3, 80, 50, offsets);
    // startX = 3*80 + 80*2 = 400
    expect(offsets.get("solo")).toEqual({ dx: 400, dy: 0 });
  });

  it("sorts by label for deterministic ordering", () => {
    const nodes = [
      { ...mkNode("z"), label: "zzz" } as GraphNode,
      { ...mkNode("a"), label: "aaa" } as GraphNode,
    ];
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceUntimedNodes(nodes, 0, 100, 60, offsets);
    // After sort: aaa, zzz → a gets col=0, z gets col=1
    expect(offsets.get("a")!.dx).toBeLessThan(offsets.get("z")!.dx);
  });

  it("9 nodes create 3x3 grid", () => {
    const nodes = Array.from({ length: 9 }, (_, i) => mkNode(`n${i}`));
    const offsets = new Map<string, { dx: number; dy: number }>();
    timelinePlaceUntimedNodes(nodes, 0, 100, 60, offsets);
    const dxSet = new Set([...offsets.values()].map(o => o.dx));
    const dySet = new Set([...offsets.values()].map(o => o.dy));
    expect(dxSet.size).toBe(3); // 3 columns
    expect(dySet.size).toBe(3); // 3 rows
  });
});
