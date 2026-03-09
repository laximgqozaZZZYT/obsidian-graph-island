import { describe, it, expect } from "vitest";
import { buildMultiSortComparator, type SortMetrics } from "../src/utils/sort";
import type { GraphNode, SortRule } from "../src/types";

function mkNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

describe("buildMultiSortComparator", () => {
  const nodes = [
    mkNode("a", { label: "Alpha", category: "cat1", tags: ["romance"] }),
    mkNode("b", { label: "Beta", category: "cat2", tags: ["mystery"] }),
    mkNode("c", { label: "Charlie", category: "cat1", tags: ["romance"] }),
    mkNode("d", { label: "Delta", category: "cat2", tags: ["mystery"] }),
  ];

  const metrics: SortMetrics = {
    degrees: new Map([["a", 5], ["b", 3], ["c", 5], ["d", 10]]),
    inDegrees: new Map([["a", 2], ["b", 1], ["c", 4], ["d", 0]]),
    importance: new Map([["a", 7], ["b", 2], ["c", 9], ["d", 1]]),
  };

  it("returns 0-comparator for empty rules", () => {
    const cmp = buildMultiSortComparator([], metrics);
    expect(cmp(nodes[0], nodes[1])).toBe(0);
  });

  it("sorts by degree ascending", () => {
    const rules: SortRule[] = [{ key: "degree", order: "asc" }];
    const cmp = buildMultiSortComparator(rules, metrics);
    const sorted = [...nodes].sort(cmp);
    expect(sorted.map(n => n.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("sorts by degree descending", () => {
    const rules: SortRule[] = [{ key: "degree", order: "desc" }];
    const cmp = buildMultiSortComparator(rules, metrics);
    const sorted = [...nodes].sort(cmp);
    expect(sorted.map(n => n.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("multi-rule: tag asc → degree desc (tiebreaker)", () => {
    const rules: SortRule[] = [
      { key: "tag", order: "asc" },
      { key: "degree", order: "desc" },
    ];
    const cmp = buildMultiSortComparator(rules, metrics);
    const sorted = [...nodes].sort(cmp);
    // mystery: b(3), d(10) → desc: d, b
    // romance: a(5), c(5) → desc: tie, stable order a, c
    expect(sorted.map(n => n.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("sorts by label ascending", () => {
    const rules: SortRule[] = [{ key: "label", order: "asc" }];
    const cmp = buildMultiSortComparator(rules, metrics);
    const sorted = [...nodes].sort(cmp);
    expect(sorted.map(n => n.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by category descending then importance ascending", () => {
    const rules: SortRule[] = [
      { key: "category", order: "desc" },
      { key: "importance", order: "asc" },
    ];
    const cmp = buildMultiSortComparator(rules, metrics);
    const sorted = [...nodes].sort(cmp);
    // cat2 desc first: b(imp=2), d(imp=1) → asc: d, b
    // cat1 desc next: a(imp=7), c(imp=9) → asc: a, c
    expect(sorted.map(n => n.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("sorts by in-degree descending", () => {
    const rules: SortRule[] = [{ key: "in-degree", order: "desc" }];
    const cmp = buildMultiSortComparator(rules, metrics);
    const sorted = [...nodes].sort(cmp);
    expect(sorted.map(n => n.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("handles missing metrics gracefully (falls back to 0)", () => {
    const rules: SortRule[] = [{ key: "importance", order: "desc" }];
    const cmp = buildMultiSortComparator(rules, {}); // no metrics
    const sorted = [...nodes].sort(cmp);
    // All importance = 0, so stable order
    expect(sorted.map(n => n.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles nodes without tags", () => {
    const noTagNodes = [
      mkNode("x", { label: "X" }),
      mkNode("y", { label: "Y", tags: ["ztag"] }),
    ];
    const rules: SortRule[] = [{ key: "tag", order: "asc" }];
    const cmp = buildMultiSortComparator(rules, {});
    const sorted = [...noTagNodes].sort(cmp);
    // "" < "ztag"
    expect(sorted.map(n => n.id)).toEqual(["x", "y"]);
  });
});
