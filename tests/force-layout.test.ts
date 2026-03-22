import { describe, it, expect } from "vitest";
import { resolveDirection, matchesFilter } from "../src/layouts/force";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "test",
    label: "TestNode",
    x: 0,
    y: 0,
    group: "",
    tags: [],
    category: "",
    isTag: false,
    ...overrides,
  } as GraphNode;
}

// ---------------------------------------------------------------------------
// resolveDirection
// ---------------------------------------------------------------------------

describe("resolveDirection", () => {
  it("top → -π/2", () => {
    expect(resolveDirection("top")).toBeCloseTo(-Math.PI / 2);
  });

  it("bottom → π/2", () => {
    expect(resolveDirection("bottom")).toBeCloseTo(Math.PI / 2);
  });

  it("left → π", () => {
    expect(resolveDirection("left")).toBeCloseTo(Math.PI);
  });

  it("right → 0", () => {
    expect(resolveDirection("right")).toBe(0);
  });

  it("numeric value passed through", () => {
    expect(resolveDirection(1.5)).toBe(1.5);
    expect(resolveDirection(0)).toBe(0);
    expect(resolveDirection(-Math.PI)).toBe(-Math.PI);
  });
});

// ---------------------------------------------------------------------------
// matchesFilter
// ---------------------------------------------------------------------------

describe("matchesFilter", () => {
  it("wildcard * matches any node", () => {
    expect(matchesFilter(mkNode(), "*")).toBe(true);
    expect(matchesFilter(mkNode({ isTag: true }), "*")).toBe(true);
  });

  it("tag:<name> matches node with that tag", () => {
    const node = mkNode({ tags: ["important", "review"] });
    expect(matchesFilter(node, "tag:important")).toBe(true);
    expect(matchesFilter(node, "tag:missing")).toBe(false);
  });

  it("category:<name> matches node category", () => {
    const node = mkNode({ category: "character" });
    expect(matchesFilter(node, "category:character")).toBe(true);
    expect(matchesFilter(node, "category:location")).toBe(false);
  });

  it("isTag matches virtual tag nodes", () => {
    expect(matchesFilter(mkNode({ isTag: true }), "isTag:true")).toBe(true);
    expect(matchesFilter(mkNode({ isTag: false }), "isTag:true")).toBe(false);
  });

  it("empty filter matches all (returns true)", () => {
    expect(matchesFilter(mkNode(), "")).toBe(true);
  });
});
