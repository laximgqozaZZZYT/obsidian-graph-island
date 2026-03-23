/**
 * Tests for the graph data filtering pipeline logic.
 * Uses pure functions from graph-filter.ts (extracted from GVC).
 */
import { describe, it, expect } from "vitest";
import { parseQueryExpr, evaluateExpr } from "../src/utils/query-expr";
import {
  filterOrphans, filterTagNodes as filterTagNodesFn, filterByDegree,
  filterEdgesByNodeSet, applyVisibilityFilters, filterExcludedNodes,
} from "../src/utils/graph-filter";
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

// ---------------------------------------------------------------------------
// applyVisibilityFilters — composite pipeline (cycle115)
// ---------------------------------------------------------------------------
describe("applyVisibilityFilters pipeline", () => {
  const allOpts = {
    showOrphans: true,
    showAttachments: true,
    includeTagsInData: true,
    showTagNodes: true,
    tagDisplay: "node",
    showSimilar: true,
  };

  it("passes everything through when all options are true", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md"), makeNode("#tag", { isTag: true } as any)];
    (nodes[2] as any).isTag = true;
    const edges = [makeEdge("a.md", "b.md"), makeEdge("a.md", "#tag", "has-tag")];
    const result = applyVisibilityFilters(nodes, edges, allOpts);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it("removes orphans when showOrphans=false", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md"), makeNode("orphan.md")];
    const edges = [makeEdge("a.md", "b.md")];
    const result = applyVisibilityFilters(nodes, edges, { ...allOpts, showOrphans: false });
    expect(result.nodes.map(n => n.id)).toEqual(["a.md", "b.md"]);
  });

  it("removes tag nodes when includeTagsInData=false", () => {
    const nodes = [makeNode("a.md"), makeNode("#tag")];
    (nodes[1] as any).isTag = true;
    const edges = [makeEdge("a.md", "#tag", "has-tag")];
    const result = applyVisibilityFilters(nodes, edges, { ...allOpts, includeTagsInData: false });
    expect(result.nodes.every(n => !(n as any).isTag)).toBe(true);
    expect(result.edges.every(e => e.type !== "has-tag")).toBe(true);
  });

  it("removes similar edges when showSimilar=false", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md")];
    const edges = [makeEdge("a.md", "b.md", "link"), makeEdge("a.md", "b.md", "similar")];
    const result = applyVisibilityFilters(nodes, edges, { ...allOpts, showSimilar: false });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe("link");
  });

  it("combined: orphan filter + tag filter", () => {
    // Pipeline order: orphan first → tag second
    // orphan filter sees connected.md as connected (has-tag edge exists) → keeps it
    // tag filter then removes #tag node + has-tag edges
    // Result: connected.md survives, orphan.md doesn't
    const nodes = [makeNode("connected.md"), makeNode("orphan.md"), makeNode("#tag")];
    (nodes[2] as any).isTag = true;
    const edges = [makeEdge("connected.md", "#tag", "has-tag")];
    const result = applyVisibilityFilters(nodes, edges, {
      ...allOpts,
      showOrphans: false,
      includeTagsInData: false,
    });
    // connected.md survives orphan pass (had an edge), then tag nodes removed
    expect(result.nodes.map(n => n.id)).toContain("connected.md");
    expect(result.nodes.every(n => !(n as any).isTag)).toBe(true);
  });

  it("empty graph passes through without error", () => {
    const result = applyVisibilityFilters([], [], allOpts);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterExcluded — node exclusion
// ---------------------------------------------------------------------------
describe("filterExcluded", () => {
  it("removes nodes in excludeIds set", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md"), makeNode("c.md")];
    const edges = [makeEdge("a.md", "b.md"), makeEdge("b.md", "c.md")];
    const result = filterExcludedNodes(nodes, edges, ["b.md"]);
    expect(result.nodes.map(n => n.id)).toEqual(["a.md", "c.md"]);
    // Both edges involving b.md are removed
    expect(result.edges).toHaveLength(0);
  });

  it("no-op when excludeIds is empty", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md")];
    const edges = [makeEdge("a.md", "b.md")];
    const result = filterExcludedNodes(nodes, edges, []);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it("handles excluding non-existent node ID", () => {
    const nodes = [makeNode("a.md")];
    const edges: GraphEdge[] = [];
    const result = filterExcludedNodes(nodes, edges, ["nonexistent.md"]);
    expect(result.nodes).toHaveLength(1);
  });
});
