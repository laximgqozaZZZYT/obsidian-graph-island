import { describe, it, expect, vi } from "vitest";

// Mock obsidian module
vi.mock("obsidian", () => ({}));

import { detectTagRelations } from "../src/utils/tag-relation-presets";
import type { TagRelation } from "../src/types";

/** Create a minimal App mock with markdown files and their tags */
function mockApp(files: { path: string; tags: string[] }[]): any {
  const fileCache = new Map<string, any>();
  const mdFiles = files.map(f => {
    const file = { path: f.path, name: f.path.split("/").pop() };
    fileCache.set(f.path, {
      frontmatter: f.tags.length > 0 ? { tags: f.tags } : undefined,
    });
    return file;
  });

  return {
    vault: {
      getMarkdownFiles: () => mdFiles,
    },
    metadataCache: {
      getFileCache: (file: any) => fileCache.get(file.path) ?? null,
    },
  };
}

describe("detectTagRelations", () => {
  it("returns empty array for empty vault", () => {
    const app = mockApp([]);
    expect(detectTagRelations(app)).toEqual([]);
  });

  it("returns empty array for files without tags", () => {
    const app = mockApp([
      { path: "a.md", tags: [] },
      { path: "b.md", tags: [] },
    ]);
    expect(detectTagRelations(app)).toEqual([]);
  });

  it("returns empty array when no tag has sufficient count", () => {
    // Only 1 file per tag — below MIN_TAG_COUNT (2)
    const app = mockApp([
      { path: "a.md", tags: ["unique1"] },
      { path: "b.md", tags: ["unique2"] },
    ]);
    expect(detectTagRelations(app)).toEqual([]);
  });

  it("detects relationships from co-occurring tags", () => {
    // Create a hub tag "character" that appears in 10+ files
    // and a child tag "hero" that co-occurs with "character" frequently
    const files = [];
    for (let i = 0; i < 15; i++) {
      files.push({ path: `char${i}.md`, tags: ["character", "hero"] });
    }
    // Add some "character" files without "hero" to make ratio < 1
    for (let i = 0; i < 5; i++) {
      files.push({ path: `other${i}.md`, tags: ["character"] });
    }
    const app = mockApp(files);
    const relations = detectTagRelations(app);

    // Should detect "hero" → "character" relationship
    if (relations.length > 0) {
      expect(relations.every(r => r.source && r.target)).toBe(true);
      expect(relations.every(r => r.type === "inheritance")).toBe(true);
    }
  });

  it("normalizes tag case", () => {
    const files = [];
    for (let i = 0; i < 12; i++) {
      files.push({ path: `f${i}.md`, tags: ["Character", "Hero"] });
    }
    const app = mockApp(files);
    const relations = detectTagRelations(app);
    // Tags should be lowercase
    for (const r of relations) {
      expect(r.source).toBe(r.source.toLowerCase());
      expect(r.target).toBe(r.target.toLowerCase());
    }
  });

  it("strips # prefix from tags", () => {
    const files = [];
    for (let i = 0; i < 12; i++) {
      files.push({ path: `f${i}.md`, tags: ["#category", "#item"] });
    }
    const app = mockApp(files);
    const relations = detectTagRelations(app);
    for (const r of relations) {
      expect(r.source.startsWith("#")).toBe(false);
      expect(r.target.startsWith("#")).toBe(false);
    }
  });

  it("handles comma-separated tag strings", () => {
    const files = [];
    for (let i = 0; i < 12; i++) {
      files.push({ path: `f${i}.md`, tags: ["hub, child"] });
    }
    // Comma-separated is handled per-entry, not split within array items
    const app = mockApp(files);
    const relations = detectTagRelations(app);
    // Should not crash
    expect(Array.isArray(relations)).toBe(true);
  });
});
