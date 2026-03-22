import { describe, it, expect } from "vitest";
import {
  buildLinkChainOrder,
  buildHierarchyOrder,
  resolveTimeKey,
} from "../src/layouts/timeline-layout";
import type { GraphNode } from "../src/types";

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
