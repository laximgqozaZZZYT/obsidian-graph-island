/**
 * Tests for the graph data filtering pipeline logic.
 * Uses pure functions from graph-filter.ts (extracted from GVC).
 */
import { describe, it, expect } from "vitest";
import { parseQueryExpr, evaluateExpr } from "../src/utils/query-expr";
import { filterOrphans, filterTagNodes as filterTagNodesFn, filterByDegree, filterEdgesByNodeSet } from "../src/utils/graph-filter";
import type { GraphNode, GraphEdge } from "../src/types";

// --- Test data factory ---

function makeNode(id: string, meta?: Record<string, unknown>): GraphNode {
  return { id, label: id.replace(/\.md$/, ""), filePath: id, meta };
}

function makeEdge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type };
}

describe("orphan filtering", () => {
  it("removes nodes with no edges", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md"), makeNode("orphan.md")];
    const edges = [makeEdge("a.md", "b.md")];
    const result = filterOrphans(nodes, edges);
    expect(result.map(n => n.id)).toEqual(["a.md", "b.md"]);
  });

  it("keeps all nodes when all are connected", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md")];
    const edges = [makeEdge("a.md", "b.md")];
    expect(filterOrphans(nodes, edges)).toHaveLength(2);
  });

  it("returns empty for graph with no edges", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md")];
    expect(filterOrphans(nodes, [])).toHaveLength(0);
  });
});

// --- Tag node filter logic (Stage 4: includeTagsInData) ---
// Now uses filterTagNodesFn from graph-filter.ts

describe("tag node filtering", () => {
  it("removes tag nodes when includeTags=false", () => {
    const nodes = [makeNode("a.md"), { ...makeNode("#tag1"), isTag: true }, makeNode("b.md")];
    const edges = [makeEdge("a.md", "#tag1", "has-tag"), makeEdge("a.md", "b.md")];
    const result = filterTagNodesFn(nodes, edges);
    expect(result.nodes.map(n => n.id)).toEqual(["a.md", "b.md"]);
    expect(result.edges).toHaveLength(1); // only a→b remains
  });

  it("filterTagNodesFn removes all tag nodes and has-tag edges", () => {
    const nodes = [makeNode("a.md"), { ...makeNode("#tag1"), isTag: true }];
    const edges = [makeEdge("a.md", "#tag1", "has-tag")];
    const result = filterTagNodesFn(nodes, edges);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });
});

// --- Search query filter (Stage 6: searchQuery via parseQueryExpr) ---

describe("search query filtering", () => {
  it("field:value filter matches node tags", () => {
    const expr = parseQueryExpr("tag:hero");
    expect(expr).not.toBeNull();
    // evaluateExpr expects node.tags (not meta.tags)
    const node = { id: "a.md", label: "A", tags: ["hero", "character"], filePath: "a.md" };
    if (expr) {
      expect(evaluateExpr(expr, node)).toBe(true);
    }
  });

  it("field:value filter rejects non-matching", () => {
    const expr = parseQueryExpr("tag:villain");
    const node = { id: "a.md", label: "A", tags: ["hero"], filePath: "a.md" };
    if (expr) {
      expect(evaluateExpr(expr, node)).toBe(false);
    }
  });

  it("OR operator works", () => {
    const expr = parseQueryExpr("tag:hero OR tag:villain");
    const heroNode = { id: "a.md", label: "A", tags: ["hero"], filePath: "a.md" };
    const villainNode = { id: "b.md", label: "B", tags: ["villain"], filePath: "b.md" };
    const otherNode = { id: "c.md", label: "C", tags: ["npc"], filePath: "c.md" };
    if (expr) {
      expect(evaluateExpr(expr, heroNode)).toBe(true);
      expect(evaluateExpr(expr, villainNode)).toBe(true);
      expect(evaluateExpr(expr, otherNode)).toBe(false);
    }
  });

  it("AND operator works", () => {
    const expr = parseQueryExpr("tag:hero AND tag:character");
    const both = { id: "a.md", label: "A", tags: ["hero", "character"], filePath: "a.md" };
    const onlyHero = { id: "b.md", label: "B", tags: ["hero"], filePath: "b.md" };
    if (expr) {
      expect(evaluateExpr(expr, both)).toBe(true);
      expect(evaluateExpr(expr, onlyHero)).toBe(false);
    }
  });

  it("path: filter matches file paths", () => {
    const expr = parseQueryExpr("path:folder*");
    const inFolder = makeNode("folder/file.md");
    inFolder.filePath = "folder/file.md";
    const outside = makeNode("other/file.md");
    outside.filePath = "other/file.md";
    if (expr) {
      expect(evaluateExpr(expr, inFolder)).toBe(true);
      expect(evaluateExpr(expr, outside)).toBe(false);
    }
  });
});

// --- Degree filter (Stage: FZ degree filter) ---
// Now uses filterByDegree from graph-filter.ts

describe("degree filtering", () => {
  const nodes = [makeNode("hub.md"), makeNode("a.md"), makeNode("b.md"), makeNode("leaf.md")];
  const edges = [
    makeEdge("hub.md", "a.md"),
    makeEdge("hub.md", "b.md"),
    makeEdge("hub.md", "leaf.md"),
    makeEdge("a.md", "b.md"),
  ];
  // degrees: hub=3, a=2, b=2, leaf=1

  it("filters nodes below minimum degree", () => {
    const result = filterByDegree(nodes, edges, 2, 0);
    expect(result.map(n => n.id)).toEqual(["hub.md", "a.md", "b.md"]);
  });

  it("filters nodes above maximum degree", () => {
    const result = filterByDegree(nodes, edges, 0, 2);
    expect(result.map(n => n.id)).toEqual(["a.md", "b.md", "leaf.md"]);
  });

  it("filters both min and max", () => {
    const result = filterByDegree(nodes, edges, 2, 2);
    expect(result.map(n => n.id)).toEqual(["a.md", "b.md"]);
  });

  it("returns all when no filters active", () => {
    expect(filterByDegree(nodes, edges, 0, 0)).toHaveLength(4);
  });
});

// --- Edge re-filter by surviving nodeSet (Stage 7) ---

describe("edge re-filter by node set", () => {
  it("removes edges pointing to filtered-out nodes", () => {
    const edges = [
      makeEdge("a.md", "b.md"),
      makeEdge("a.md", "removed.md"),
      makeEdge("b.md", "removed.md"),
    ];
    const nodeSet = new Set(["a.md", "b.md"]);
    const result = filterEdgesByNodeSet(edges, nodeSet);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("a.md");
    expect(result[0].target).toBe("b.md");
  });
});
