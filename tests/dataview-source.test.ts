import { describe, it, expect } from "vitest";
import { filterNodesByDataview, queryDataviewPages } from "../src/utils/dataview-source";
import type { GraphNode } from "../src/types";
import type { App } from "obsidian";

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

// ---------------------------------------------------------------------------
// queryDataviewPages
// ---------------------------------------------------------------------------

/** Helper to build a mock App with optional Dataview plugin. */
function mockApp(dvApi: unknown = null): App {
  return {
    plugins: {
      plugins: dvApi !== null ? { dataview: { api: dvApi } } : {},
    },
  } as unknown as App;
}

describe("queryDataviewPages", () => {
  it("returns empty set when dataview plugin is not installed", () => {
    const app = mockApp(null);
    expect(queryDataviewPages(app, "#tag")).toEqual(new Set());
  });

  it("returns file paths from dv.pages()", () => {
    const pages = {
      forEach: (fn: (p: { file: { path: string } }) => void) => {
        fn({ file: { path: "notes/a.md" } });
        fn({ file: { path: "notes/b.md" } });
      },
    };
    const dvApi = { pages: () => pages };
    const result = queryDataviewPages(mockApp(dvApi), '"notes"');
    expect(result).toEqual(new Set(["notes/a.md", "notes/b.md"]));
  });

  it("skips pages with missing file.path", () => {
    const pages = {
      forEach: (fn: (p: unknown) => void) => {
        fn({ file: { path: "ok.md" } });
        fn({ file: {} }); // missing path
        fn({}); // missing file
        fn({ file: { path: 42 } }); // non-string path
      },
    };
    const dvApi = { pages: () => pages };
    const result = queryDataviewPages(mockApp(dvApi), "#tag");
    expect(result).toEqual(new Set(["ok.md"]));
  });

  it("returns empty set when dv.pages() returns null", () => {
    const dvApi = { pages: () => null };
    const result = queryDataviewPages(mockApp(dvApi), "invalid");
    expect(result).toEqual(new Set());
  });

  it("returns empty set when dv.pages() throws", () => {
    const dvApi = {
      pages: () => {
        throw new Error("DQL parse error");
      },
    };
    const result = queryDataviewPages(mockApp(dvApi), "broken query");
    expect(result).toEqual(new Set());
  });

  it("handles empty pages result", () => {
    const pages = { forEach: () => {} };
    const dvApi = { pages: () => pages };
    const result = queryDataviewPages(mockApp(dvApi), "#nonexistent");
    expect(result).toEqual(new Set());
  });
});

