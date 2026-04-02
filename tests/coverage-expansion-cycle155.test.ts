/**
 * Coverage expansion tests — cycle155
 *
 * Targets uncovered functions in:
 *   - metadata-parser: defineLiveMeta, buildSunburstData
 *   - dataview-source: queryDataviewPages
 */
import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import {
  defineLiveMeta,
  buildSunburstData,
} from "../src/parsers/metadata-parser";
import { queryDataviewPages } from "../src/utils/dataview-source";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, opts: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts } as GraphNode;
}

function makeFile(path: string, basename: string): TFile {
  const f = new TFile();
  f.path = path;
  f.basename = basename;
  return f;
}

function makeMockApp(overrides: {
  getAbstractFileByPath?: (path: string) => any;
  getFileCache?: (file: any) => any;
  getMarkdownFiles?: () => any[];
} = {}): any {
  return {
    vault: {
      getAbstractFileByPath: overrides.getAbstractFileByPath ?? (() => null),
      getMarkdownFiles: overrides.getMarkdownFiles ?? (() => []),
    },
    metadataCache: {
      getFileCache: overrides.getFileCache ?? (() => null),
    },
  };
}

// ===========================================================================
// defineLiveMeta
// ===========================================================================

describe("defineLiveMeta", () => {
  it("meta returns undefined when node has no filePath", () => {
    const app = makeMockApp();
    const node = makeNode("orphan");
    defineLiveMeta(node, app);
    expect((node as any).meta).toBeUndefined();
  });

  it("meta returns undefined when vault returns null for the path", () => {
    const app = makeMockApp({ getAbstractFileByPath: () => null });
    const node = makeNode("missing.md", { filePath: "missing.md" });
    defineLiveMeta(node, app);
    expect((node as any).meta).toBeUndefined();
  });

  it("meta returns undefined when vault returns a non-TFile object", () => {
    // A plain object is NOT an instance of TFile
    const app = makeMockApp({
      getAbstractFileByPath: () => ({ path: "file.md" }),
    });
    const node = makeNode("file.md", { filePath: "file.md" });
    defineLiveMeta(node, app);
    expect((node as any).meta).toBeUndefined();
  });

  it("meta returns undefined when file cache has no frontmatter", () => {
    const tfile = makeFile("file.md", "file");
    const app = makeMockApp({
      getAbstractFileByPath: () => tfile,
      getFileCache: () => ({ frontmatter: null }),
    });
    const node = makeNode("file.md", { filePath: "file.md" });
    defineLiveMeta(node, app);
    expect((node as any).meta).toBeUndefined();
  });

  it("meta returns undefined when getFileCache returns null", () => {
    const tfile = makeFile("file.md", "file");
    const app = makeMockApp({
      getAbstractFileByPath: () => tfile,
      getFileCache: () => null,
    });
    const node = makeNode("file.md", { filePath: "file.md" });
    defineLiveMeta(node, app);
    expect((node as any).meta).toBeUndefined();
  });

  it("meta returns frontmatter properties", () => {
    const tfile = makeFile("note.md", "note");
    const app = makeMockApp({
      getAbstractFileByPath: () => tfile,
      getFileCache: () => ({
        frontmatter: { title: "My Note", tags: ["a", "b"], count: 3 },
      }),
    });
    const node = makeNode("note.md", { filePath: "note.md" });
    defineLiveMeta(node, app);
    const meta = (node as any).meta;
    expect(meta).toBeDefined();
    expect(meta.title).toBe("My Note");
    expect(meta.tags).toEqual(["a", "b"]);
    expect(meta.count).toBe(3);
  });

  it("meta filters out the 'position' key from frontmatter", () => {
    const tfile = makeFile("note.md", "note");
    const app = makeMockApp({
      getAbstractFileByPath: () => tfile,
      getFileCache: () => ({
        frontmatter: {
          title: "Hello",
          position: { start: { line: 0 }, end: { line: 5 } },
          author: "World",
        },
      }),
    });
    const node = makeNode("note.md", { filePath: "note.md" });
    defineLiveMeta(node, app);
    const meta = (node as any).meta;
    expect(meta.title).toBe("Hello");
    expect(meta.author).toBe("World");
    expect(Object.prototype.hasOwnProperty.call(meta, "position")).toBe(false);
  });

  it("meta is a live getter — re-reads cache on every access", () => {
    const tfile = makeFile("live.md", "live");
    let callCount = 0;
    const app = makeMockApp({
      getAbstractFileByPath: () => tfile,
      getFileCache: () => {
        callCount++;
        return { frontmatter: { revision: callCount } };
      },
    });
    const node = makeNode("live.md", { filePath: "live.md" });
    defineLiveMeta(node, app);
    const meta1 = (node as any).meta;
    const meta2 = (node as any).meta;
    expect(callCount).toBe(2);
    expect(meta1.revision).toBe(1);
    expect(meta2.revision).toBe(2);
  });

  it("meta property is enumerable and configurable", () => {
    const tfile = makeFile("e.md", "e");
    const app = makeMockApp({
      getAbstractFileByPath: () => tfile,
      getFileCache: () => ({ frontmatter: { x: 1 } }),
    });
    const node = makeNode("e.md", { filePath: "e.md" });
    defineLiveMeta(node, app);
    const desc = Object.getOwnPropertyDescriptor(node, "meta")!;
    expect(desc.enumerable).toBe(true);
    expect(desc.configurable).toBe(true);
    expect(typeof desc.get).toBe("function");
  });
});

// ===========================================================================
// buildSunburstData
// ===========================================================================

describe("buildSunburstData", () => {
  it("returns root node with empty children for an empty vault", () => {
    const app = makeMockApp({ getMarkdownFiles: () => [] });
    const result = buildSunburstData(app, "category");
    expect(result.name).toBe("Vault");
    expect(result.children).toEqual([]);
  });

  it("groups files by frontmatter field value", () => {
    const files = [
      makeFile("a.md", "a"),
      makeFile("b.md", "b"),
      makeFile("c.md", "c"),
    ];
    const app = makeMockApp({
      getMarkdownFiles: () => files,
      getFileCache: (f: any) => {
        if (f.path === "a.md") return { frontmatter: { type: "character" } };
        if (f.path === "b.md") return { frontmatter: { type: "character" } };
        if (f.path === "c.md") return { frontmatter: { type: "location" } };
        return null;
      },
    });
    const result = buildSunburstData(app, "type");
    expect(result.name).toBe("Vault");
    const charGroup = result.children?.find(c => c.name === "character");
    const locGroup = result.children?.find(c => c.name === "location");
    expect(charGroup).toBeDefined();
    expect(charGroup!.children).toHaveLength(2);
    expect(locGroup).toBeDefined();
    expect(locGroup!.children).toHaveLength(1);
  });

  it("falls back to 'Uncategorized' when frontmatter field is absent", () => {
    const files = [makeFile("a.md", "a"), makeFile("b.md", "b")];
    const app = makeMockApp({
      getMarkdownFiles: () => files,
      getFileCache: () => null,
    });
    const result = buildSunburstData(app, "category");
    const uncategorized = result.children?.find(c => c.name === "Uncategorized");
    expect(uncategorized).toBeDefined();
    expect(uncategorized!.children).toHaveLength(2);
  });

  it("falls back to 'Uncategorized' when frontmatter exists but field is missing", () => {
    const files = [makeFile("n.md", "n")];
    const app = makeMockApp({
      getMarkdownFiles: () => files,
      getFileCache: () => ({ frontmatter: { other: "value" } }),
    });
    const result = buildSunburstData(app, "category");
    const group = result.children?.find(c => c.name === "Uncategorized");
    expect(group).toBeDefined();
  });

  it("leaf nodes have value=1, correct name and filePath", () => {
    const files = [makeFile("folder/hero.md", "hero")];
    const app = makeMockApp({
      getMarkdownFiles: () => files,
      getFileCache: () => ({ frontmatter: { role: "protagonist" } }),
    });
    const result = buildSunburstData(app, "role");
    const leaf = result.children?.[0]?.children?.[0];
    expect(leaf?.name).toBe("hero");
    expect(leaf?.value).toBe(1);
    expect(leaf?.filePath).toBe("folder/hero.md");
  });

  it("handles a single file with a group field", () => {
    const files = [makeFile("solo.md", "solo")];
    const app = makeMockApp({
      getMarkdownFiles: () => files,
      getFileCache: () => ({ frontmatter: { genre: "fantasy" } }),
    });
    const result = buildSunburstData(app, "genre");
    expect(result.children).toHaveLength(1);
    expect(result.children![0].name).toBe("fantasy");
  });
});

// ===========================================================================
// queryDataviewPages
// ===========================================================================

describe("queryDataviewPages", () => {
  function makeAppWithDv(api: any): any {
    return {
      plugins: {
        plugins: {
          dataview: { api },
        },
      },
    };
  }

  it("returns empty set when app has no plugins", () => {
    const app = {} as any;
    expect(queryDataviewPages(app, "#tag").size).toBe(0);
  });

  it("returns empty set when dataview plugin is not installed", () => {
    const app = { plugins: { plugins: {} } } as any;
    expect(queryDataviewPages(app, "#tag").size).toBe(0);
  });

  it("returns empty set when dataview plugin has no api", () => {
    const app = { plugins: { plugins: { dataview: {} } } } as any;
    expect(queryDataviewPages(app, "#tag").size).toBe(0);
  });

  it("returns file paths from dataview pages()", () => {
    const pages = [
      { file: { path: "notes/a.md" } },
      { file: { path: "notes/b.md" } },
    ];
    const api = {
      pages: () => ({ forEach: (cb: (p: any) => void) => pages.forEach(cb) }),
    };
    const result = queryDataviewPages(makeAppWithDv(api), "#tag");
    expect(result.size).toBe(2);
    expect(result.has("notes/a.md")).toBe(true);
    expect(result.has("notes/b.md")).toBe(true);
  });

  it("returns empty set when pages() throws an error", () => {
    const api = { pages: () => { throw new Error("bad query"); } };
    expect(queryDataviewPages(makeAppWithDv(api), "!!invalid").size).toBe(0);
  });

  it("skips pages without a string file.path", () => {
    const pages = [
      { file: { path: "valid.md" } },
      { file: {} },            // missing path
      {},                      // missing file
      { file: { path: 42 } },  // non-string path
    ];
    const api = {
      pages: () => ({ forEach: (cb: (p: any) => void) => pages.forEach(cb) }),
    };
    const result = queryDataviewPages(makeAppWithDv(api), "#tag");
    expect(result.size).toBe(1);
    expect(result.has("valid.md")).toBe(true);
  });

  it("returns empty set when pages() returns null", () => {
    const api = { pages: () => null };
    expect(queryDataviewPages(makeAppWithDv(api), "#tag").size).toBe(0);
  });

  it("returns empty set when pages() returns object without forEach", () => {
    const api = { pages: () => ({ length: 0 }) };
    expect(queryDataviewPages(makeAppWithDv(api), "#tag").size).toBe(0);
  });

  it("deduplicates paths returned multiple times", () => {
    const pages = [
      { file: { path: "dup.md" } },
      { file: { path: "dup.md" } },
    ];
    const api = {
      pages: () => ({ forEach: (cb: (p: any) => void) => pages.forEach(cb) }),
    };
    const result = queryDataviewPages(makeAppWithDv(api), "#tag");
    expect(result.size).toBe(1);
  });
});
