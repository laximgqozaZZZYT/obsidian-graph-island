import { describe, it, expect } from "vitest";
import { filterNodesByDataview } from "../src/utils/dataview-source";
import type { GraphNode } from "../src/types";

function makeNode(id: string, opts: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts };
}

describe("filterNodesByDataview", () => {
  const nodes: GraphNode[] = [
    makeNode("notes/a.md"),
    makeNode("notes/b.md"),
    makeNode("other/c.md"),
    makeNode("#character", { isTag: true }),
  ];

  it("keeps only nodes whose id is in the matching paths set", () => {
    const matching = new Set(["notes/a.md", "other/c.md"]);
    const result = filterNodesByDataview(nodes, matching, false);
    expect(result.map((n) => n.id)).toEqual(["notes/a.md", "other/c.md"]);
  });

  it("keeps tag nodes when keepTagNodes is true", () => {
    const matching = new Set(["notes/a.md"]);
    const result = filterNodesByDataview(nodes, matching, true);
    expect(result.map((n) => n.id)).toEqual(["notes/a.md", "#character"]);
  });

  it("excludes tag nodes when keepTagNodes is false", () => {
    const matching = new Set(["notes/a.md"]);
    const result = filterNodesByDataview(nodes, matching, false);
    expect(result.map((n) => n.id)).toEqual(["notes/a.md"]);
  });

  it("returns empty array when matchingPaths is empty and keepTagNodes is false", () => {
    const result = filterNodesByDataview(nodes, new Set(), false);
    expect(result).toEqual([]);
  });

  it("returns only tag nodes when matchingPaths is empty and keepTagNodes is true", () => {
    const result = filterNodesByDataview(nodes, new Set(), true);
    expect(result.map((n) => n.id)).toEqual(["#character"]);
  });

  it("keeps all nodes when all paths match", () => {
    const matching = new Set(["notes/a.md", "notes/b.md", "other/c.md", "#character"]);
    const result = filterNodesByDataview(nodes, matching, false);
    expect(result).toHaveLength(4);
  });
});

