import { describe, it, expect } from "vitest";
import type { GraphNode, NodeRule } from "../src/types";

/**
 * Standalone computation of per-node spacing map from NodeRules.
 * Mirrors GraphViewContainer.computeNodeSpacingMap logic.
 */
function computeNodeSpacingMap(
  nodes: GraphNode[],
  rules: NodeRule[],
): Map<string, number> {
  const map = new Map<string, number>();
  if (rules.length === 0) return map;

  for (const node of nodes) {
    let spacing = 1.0;
    for (const rule of rules) {
      if (simpleMatchesFilter(node, rule.query)) {
        spacing *= rule.spacingMultiplier;
      }
    }
    if (spacing !== 1.0) {
      map.set(node.id, spacing);
    }
  }
  return map;
}

/** Simplified filter matching for tests (supports "*", "tag:<name>", "category:<name>") */
function simpleMatchesFilter(node: GraphNode, filter: string): boolean {
  if (filter === "*") return true;
  if (filter.startsWith("tag:")) {
    const tagName = filter.slice(4);
    return node.tags?.includes(tagName) ?? false;
  }
  if (filter.startsWith("category:")) {
    const catName = filter.slice(9);
    return node.category === catName;
  }
  return false;
}

function makeNode(id: string, opts?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts };
}

describe("computeNodeSpacingMap", () => {
  it("returns empty map when no rules", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const result = computeNodeSpacingMap(nodes, []);
    expect(result.size).toBe(0);
  });

  it("applies spacing multiplier to matching nodes", () => {
    const nodes = [
      makeNode("a", { tags: ["character"] }),
      makeNode("b", { tags: ["location"] }),
      makeNode("c", { tags: ["character"] }),
    ];
    const rules: NodeRule[] = [
      { query: "tag:character", spacingMultiplier: 2.0, gravityAngle: -1, gravityStrength: 0.1 },
    ];
    const result = computeNodeSpacingMap(nodes, rules);
    expect(result.get("a")).toBe(2.0);
    expect(result.get("c")).toBe(2.0);
    expect(result.has("b")).toBe(false); // b doesn't match, stays at default 1.0
  });

  it("wildcard '*' matches all nodes", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const rules: NodeRule[] = [
      { query: "*", spacingMultiplier: 3.0, gravityAngle: -1, gravityStrength: 0.1 },
    ];
    const result = computeNodeSpacingMap(nodes, rules);
    expect(result.get("a")).toBe(3.0);
    expect(result.get("b")).toBe(3.0);
  });

  it("multiplies spacings when multiple rules match", () => {
    const nodes = [
      makeNode("a", { tags: ["character"], category: "person" }),
    ];
    const rules: NodeRule[] = [
      { query: "tag:character", spacingMultiplier: 2.0, gravityAngle: -1, gravityStrength: 0.1 },
      { query: "category:person", spacingMultiplier: 1.5, gravityAngle: -1, gravityStrength: 0.1 },
    ];
    const result = computeNodeSpacingMap(nodes, rules);
    expect(result.get("a")).toBe(3.0); // 2.0 * 1.5
  });

  it("does not include nodes with resulting spacing of 1.0", () => {
    const nodes = [makeNode("a", { tags: ["x"] })];
    const rules: NodeRule[] = [
      { query: "tag:y", spacingMultiplier: 2.0, gravityAngle: -1, gravityStrength: 0.1 },
    ];
    const result = computeNodeSpacingMap(nodes, rules);
    expect(result.has("a")).toBe(false);
  });
});

describe("NodeRule gravity angle", () => {
  it("converts degrees to radians correctly", () => {
    // Direction presets: up=270, down=90, left=180, right=0
    expect(270 * Math.PI / 180).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI, 5);
    expect(90 * Math.PI / 180).toBeCloseTo(Math.PI / 2, 5);
    expect(180 * Math.PI / 180).toBeCloseTo(Math.PI, 5);
    expect(0 * Math.PI / 180).toBeCloseTo(0, 5);
  });

  it("gravityAngle -1 means no gravity", () => {
    const rule: NodeRule = { query: "*", spacingMultiplier: 1.0, gravityAngle: -1, gravityStrength: 0.1 };
    expect(rule.gravityAngle).toBe(-1);
  });
});

describe("getSpacing helper", () => {
  function getSpacing(id: string, map?: Map<string, number>): number {
    return map?.get(id) ?? 1.0;
  }

  it("returns 1.0 for nodes not in map", () => {
    const map = new Map<string, number>();
    expect(getSpacing("unknown", map)).toBe(1.0);
  });

  it("returns 1.0 when map is undefined", () => {
    expect(getSpacing("any")).toBe(1.0);
  });

  it("returns mapped value for known nodes", () => {
    const map = new Map([["a", 2.5]]);
    expect(getSpacing("a", map)).toBe(2.5);
  });
});
