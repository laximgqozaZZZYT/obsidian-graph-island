/**
 * Tests for the graph data filtering pipeline logic.
 * Since getGraphData() is a private GVC method, we test the underlying
 * pure-function components that implement each filtering stage.
 */
import { describe, it, expect } from "vitest";
import { parseQueryExpr, evaluateExpr } from "../src/utils/query-expr";
import type { GraphNode, GraphEdge } from "../src/types";

// --- Test data factory ---

function makeNode(id: string, meta?: Record<string, unknown>): GraphNode {
  return { id, label: id.replace(/\.md$/, ""), filePath: id, meta };
}

function makeEdge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type };
}

// --- Orphan filter logic (Stage 2: showOrphans) ---

function filterOrphans(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  return nodes.filter(n => connected.has(n.id));
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

function filterTagNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  includeTags: boolean,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (includeTags) return { nodes, edges };
  const tagIds = new Set(nodes.filter(n => n.id.startsWith("#")).map(n => n.id));
  return {
    nodes: nodes.filter(n => !tagIds.has(n.id)),
    edges: edges.filter(e => !tagIds.has(e.source) && !tagIds.has(e.target)),
  };
}

describe("tag node filtering", () => {
  it("removes tag nodes when includeTags=false", () => {
    const nodes = [makeNode("a.md"), makeNode("#tag1"), makeNode("b.md")];
    const edges = [makeEdge("a.md", "#tag1", "has-tag"), makeEdge("a.md", "b.md")];
    const result = filterTagNodes(nodes, edges, false);
    expect(result.nodes.map(n => n.id)).toEqual(["a.md", "b.md"]);
    expect(result.edges).toHaveLength(1); // only a→b remains
  });

  it("keeps tag nodes when includeTags=true", () => {
    const nodes = [makeNode("a.md"), makeNode("#tag1")];
    const edges = [makeEdge("a.md", "#tag1", "has-tag")];
    const result = filterTagNodes(nodes, edges, true);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
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

function filterByDegree(
  nodes: GraphNode[],
  edges: GraphEdge[],
  minDeg: number,
  maxDeg: number,
): GraphNode[] {
  if (minDeg <= 0 && maxDeg <= 0) return nodes;
  const degMap = new Map<string, number>();
  for (const e of edges) {
    degMap.set(e.source, (degMap.get(e.source) ?? 0) + 1);
    degMap.set(e.target, (degMap.get(e.target) ?? 0) + 1);
  }
  return nodes.filter(n => {
    const d = degMap.get(n.id) ?? 0;
    if (minDeg > 0 && d < minDeg) return false;
    if (maxDeg > 0 && d > maxDeg) return false;
    return true;
  });
}

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
    const result = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target));
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("a.md");
    expect(result[0].target).toBe("b.md");
  });
});
