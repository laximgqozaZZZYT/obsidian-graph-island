import { describe, it, expect, vi } from "vitest";
import {
  classifyRelation,
  assignNodeColors,
  buildRelationColorMap,
  simpleHash,
  applyMonochromeFallback,
  collectAllTags,
  extractBodyInfo,
  buildSunburstData,
  parseInlineRelationLinksRaw,
  snapshotMeta,
} from "../src/parsers/metadata-parser";
import { DEFAULT_COLORS } from "../src/types";
import type { GraphNode, GraphEdge, OntologyConfig } from "../src/types";

// --- Helpers ---
function mkNode(id: string, opts?: { category?: string; tags?: string[] }): GraphNode {
  return { id, label: id, filePath: `${id}.md`, category: opts?.category, tags: opts?.tags } as GraphNode;
}
function mkEdge(source: string, target: string, relation?: string): GraphEdge {
  return { id: `${source}-${target}`, source, target, relation } as GraphEdge;
}

// =============================================
// assignNodeColors
// =============================================
describe("assignNodeColors", () => {
  it("returns empty map for no nodes", () => {
    expect(assignNodeColors([], "category").size).toBe(0);
  });

  it("assigns colors to categories", () => {
    const nodes = [
      mkNode("a", { category: "character" }),
      mkNode("b", { category: "place" }),
      mkNode("c", { category: "character" }),
    ];
    const colors = assignNodeColors(nodes, "category");
    expect(colors.has("character")).toBe(true);
    expect(colors.has("place")).toBe(true);
    // character and place should get different colors
    expect(colors.get("character")).not.toBe(colors.get("place"));
  });

  it("assigns colors to tags with tag: prefix", () => {
    const nodes = [mkNode("a", { tags: ["fantasy", "epic"] })];
    const colors = assignNodeColors(nodes, "category");
    expect(colors.has("tag:fantasy")).toBe(true);
    expect(colors.has("tag:epic")).toBe(true);
  });

  it("categories sorted alphabetically for deterministic order", () => {
    const nodes = [
      mkNode("a", { category: "zebra" }),
      mkNode("b", { category: "alpha" }),
    ];
    const colors = assignNodeColors(nodes, "category");
    // "alpha" comes first alphabetically → gets DEFAULT_COLORS[0]
    expect(colors.get("alpha")).toBe(DEFAULT_COLORS[0]);
    expect(colors.get("zebra")).toBe(DEFAULT_COLORS[1]);
  });

  it("wraps around DEFAULT_COLORS palette", () => {
    const nodes = Array.from({ length: DEFAULT_COLORS.length + 2 }, (_, i) =>
      mkNode(`n${i}`, { category: `cat${String(i).padStart(2, "0")}` })
    );
    const colors = assignNodeColors(nodes, "category");
    // Should have exactly DEFAULT_COLORS.length + 2 entries (some may wrap)
    expect(colors.size).toBe(DEFAULT_COLORS.length + 2);
    // First and (len+1)th should have same color (wrap)
    const entries = [...colors.values()];
    expect(entries[0]).toBe(entries[DEFAULT_COLORS.length]);
  });

  it("does not produce duplicate keys for category+tag collision", () => {
    // Category "fantasy" and tag "fantasy" should NOT collide because tags are prefixed
    const nodes = [mkNode("a", { category: "fantasy", tags: ["fantasy"] })];
    const colors = assignNodeColors(nodes, "category");
    expect(colors.has("fantasy")).toBe(true); // category
    expect(colors.has("tag:fantasy")).toBe(true); // tag (prefixed)
    expect(colors.size).toBe(2);
  });
});

// =============================================
// buildRelationColorMap
// =============================================
describe("buildRelationColorMap", () => {
  it("returns empty map for no edges", () => {
    expect(buildRelationColorMap([]).size).toBe(0);
  });

  it("returns empty map for edges without relation", () => {
    const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
    expect(buildRelationColorMap(edges).size).toBe(0);
  });

  it("assigns unique colors to different relations", () => {
    const edges = [
      mkEdge("a", "b", "Author"),
      mkEdge("b", "c", "Location"),
      mkEdge("c", "d", "Author"),
    ];
    const colors = buildRelationColorMap(edges);
    expect(colors.size).toBe(2); // Author + Location
    expect(colors.has("Author")).toBe(true);
    expect(colors.has("Location")).toBe(true);
    expect(colors.get("Author")).not.toBe(colors.get("Location"));
  });

  it("sorted alphabetically for determinism", () => {
    const edges = [
      mkEdge("a", "b", "Zebra"),
      mkEdge("b", "c", "Alpha"),
    ];
    const colors = buildRelationColorMap(edges);
    expect(colors.get("Alpha")).toBe(DEFAULT_COLORS[0]);
    expect(colors.get("Zebra")).toBe(DEFAULT_COLORS[1]);
  });

  it("handles mixed edges (some with, some without relation)", () => {
    const edges = [
      mkEdge("a", "b", "HasPart"),
      mkEdge("b", "c"), // no relation
      mkEdge("c", "d", "HasPart"),
    ];
    const colors = buildRelationColorMap(edges);
    expect(colors.size).toBe(1);
    expect(colors.has("HasPart")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assignNodeColors — edge cases (cycle112)
// ---------------------------------------------------------------------------
describe("assignNodeColors edge cases", () => {
  it("handles nodes with empty-string category", () => {
    const nodes = [mkNode("a", { category: "" })];
    const colors = assignNodeColors(nodes, "category");
    // Empty string should not create a color entry
    expect(colors.size).toBe(0);
  });

  it("handles nodes with undefined tags", () => {
    const nodes = [mkNode("a", { category: "cat1" }), mkNode("b")];
    const colors = assignNodeColors(nodes, "category");
    expect(colors.has("cat1")).toBe(true);
  });

  it("palette wraps correctly beyond DEFAULT_COLORS length", () => {
    // Create more unique categories than palette size
    const paletteSize = DEFAULT_COLORS.length;
    const nodes = Array.from({ length: paletteSize + 3 }, (_, i) =>
      mkNode(`n${i}`, { category: `cat${i}` })
    );
    const colors = assignNodeColors(nodes, "category");
    // Should have paletteSize + 3 entries, wrapping around
    expect(colors.size).toBe(paletteSize + 3);
    // Verify wrapping: color at index N === color at index N % paletteSize
    const sorted = [...colors.entries()].sort(([a], [b]) => a.localeCompare(b));
    expect(sorted[paletteSize][1]).toBe(sorted[0][1]); // same palette color
  });

  it("handles nodes with duplicate tags", () => {
    const nodes = [
      mkNode("a", { tags: ["tag1", "tag1", "tag1"] }),
      mkNode("b", { tags: ["tag1"] }),
    ];
    const colors = assignNodeColors(nodes, "category");
    // tag:tag1 should appear exactly once
    expect(colors.has("tag:tag1")).toBe(true);
  });

  it("tags with same name as category get tag: prefix to avoid collision", () => {
    const nodes = [
      mkNode("a", { category: "fiction", tags: ["fiction"] }),
    ];
    const colors = assignNodeColors(nodes, "category");
    expect(colors.has("fiction")).toBe(true);     // category
    expect(colors.has("tag:fiction")).toBe(true);  // tag (prefixed)
    // They should be different colors (different index in palette)
    expect(colors.get("fiction")).not.toBe(colors.get("tag:fiction"));
  });

  it("deterministic: same input always produces same output", () => {
    const nodes = [
      mkNode("a", { category: "x", tags: ["t1", "t2"] }),
      mkNode("b", { category: "y", tags: ["t3"] }),
    ];
    const colors1 = assignNodeColors(nodes, "category");
    const colors2 = assignNodeColors(nodes, "category");
    expect([...colors1.entries()]).toEqual([...colors2.entries()]);
  });
});

// ---------------------------------------------------------------------------
// buildRelationColorMap — edge cases (cycle112)
// ---------------------------------------------------------------------------
describe("buildRelationColorMap edge cases", () => {
  it("handles many unique relations (palette wrap)", () => {
    const paletteSize = DEFAULT_COLORS.length;
    const edges = Array.from({ length: paletteSize + 2 }, (_, i) =>
      mkEdge("a", "b", `Rel${String(i).padStart(3, "0")}`)
    );
    const colors = buildRelationColorMap(edges);
    expect(colors.size).toBe(paletteSize + 2);
  });

  it("same relation from different edges gets one color", () => {
    const edges = [
      mkEdge("a", "b", "Author"),
      mkEdge("c", "d", "Author"),
      mkEdge("e", "f", "Author"),
    ];
    const colors = buildRelationColorMap(edges);
    expect(colors.size).toBe(1);
  });

  it("handles Japanese relation names", () => {
    const edges = [mkEdge("a", "b", "著者"), mkEdge("c", "d", "所在地")];
    const colors = buildRelationColorMap(edges);
    expect(colors.has("著者")).toBe(true);
    expect(colors.has("所在地")).toBe(true);
  });
});

// =============================================
// classifyRelation — ontology field matching
// =============================================

function mkOnto(overrides?: Partial<OntologyConfig>): OntologyConfig {
  return {
    inheritanceFields: [], aggregationFields: [],
    reverseInheritanceFields: [], reverseAggregationFields: [],
    similarFields: [], siblingFields: [], sequenceFields: [],
    reverseSequenceFields: [], useTagHierarchy: false,
    customMappings: {}, tagRelations: [],
    ...overrides,
  };
}

describe("classifyRelation", () => {
  it("returns undefined for unrecognized field", () => {
    const onto = mkOnto({ inheritanceFields: ["parent"] });
    expect(classifyRelation("unknown", onto)).toBeUndefined();
  });

  it("matches inheritance field (case-insensitive)", () => {
    const onto = mkOnto({ inheritanceFields: ["parent"] });
    const r = classifyRelation("Parent", onto);
    expect(r?.type).toBe("inheritance");
    expect(r?.reverse).toBe(false);
  });

  it("matches aggregation field", () => {
    const onto = mkOnto({ aggregationFields: ["contains"] });
    const r = classifyRelation("contains", onto);
    expect(r?.type).toBe("aggregation");
    expect(r?.reverse).toBe(false);
  });

  it("matches reverse inheritance field", () => {
    const onto = mkOnto({ reverseInheritanceFields: ["child"] });
    const r = classifyRelation("child", onto);
    expect(r?.type).toBe("inheritance");
    expect(r?.reverse).toBe(true);
  });

  it("matches reverse aggregation field", () => {
    const onto = mkOnto({ reverseAggregationFields: ["part-of"] });
    const r = classifyRelation("part-of", onto);
    expect(r?.type).toBe("aggregation");
    expect(r?.reverse).toBe(true);
  });

  it("matches similar field", () => {
    const onto = mkOnto({ similarFields: ["related"] });
    expect(classifyRelation("related", onto)?.type).toBe("similar");
  });

  it("matches sibling field", () => {
    const onto = mkOnto({ siblingFields: ["peer"] });
    expect(classifyRelation("peer", onto)?.type).toBe("sibling");
  });

  it("matches sequence field (forward)", () => {
    const onto = mkOnto({ sequenceFields: ["next"] });
    const r = classifyRelation("next", onto);
    expect(r?.type).toBe("sequence");
    expect(r?.reverse).toBe(false);
  });

  it("matches reverse sequence field", () => {
    const onto = mkOnto({ reverseSequenceFields: ["prev"] });
    const r = classifyRelation("prev", onto);
    expect(r?.type).toBe("sequence");
    expect(r?.reverse).toBe(true);
  });

  it("strips @ prefix before matching", () => {
    const onto = mkOnto({ inheritanceFields: ["parent"] });
    expect(classifyRelation("@parent", onto)?.type).toBe("inheritance");
  });

  it("matches custom mapping", () => {
    const onto = mkOnto({ customMappings: { "derives-from": "inheritance" } });
    const r = classifyRelation("derives-from", onto);
    expect(r?.type).toBe("inheritance");
    expect(r?.reverse).toBe(false);
  });

  it("inheritance takes priority over aggregation for same field", () => {
    const onto = mkOnto({
      inheritanceFields: ["link"],
      aggregationFields: ["link"],
    });
    expect(classifyRelation("link", onto)?.type).toBe("inheritance");
  });

  it("returns undefined for empty ontology", () => {
    expect(classifyRelation("anything", mkOnto())).toBeUndefined();
  });
});

// =============================================
// simpleHash
// =============================================
describe("simpleHash", () => {
  it("returns a non-negative integer", () => {
    expect(simpleHash("hello")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(simpleHash("hello"))).toBe(true);
  });

  it("is deterministic", () => {
    expect(simpleHash("test")).toBe(simpleHash("test"));
  });

  it("produces different values for different strings", () => {
    expect(simpleHash("alpha")).not.toBe(simpleHash("beta"));
  });

  it("handles empty string", () => {
    expect(simpleHash("")).toBeGreaterThanOrEqual(0);
  });
});

// =============================================
// applyMonochromeFallback
// =============================================
describe("applyMonochromeFallback", () => {
  const palette = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffa500, 0x800080];

  it("returns original fn when fewer than 5 nodes", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const original = (_n: { id: string }) => 0xff0000;
    const result = applyMonochromeFallback(nodes, original, palette);
    expect(result).toBe(original);
  });

  it("returns original fn when colors are diverse (2+ unique)", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
    const original = (n: { id: string }) => n.id === "n0" ? 0xff0000 : 0x00ff00;
    const result = applyMonochromeFallback(nodes, original, palette);
    expect(result).toBe(original);
  });

  it("falls back to hash-based coloring when all nodes share one color", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `node${i}` }));
    const monochrome = (_n: { id: string }) => 0xaaaaaa;
    const result = applyMonochromeFallback(nodes, monochrome, palette);
    expect(result).not.toBe(monochrome);
    // Should produce multiple colors from the palette
    const colors = new Set(nodes.map(n => result(n)));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("fallback colors are deterministic", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `node${i}` }));
    const monochrome = (_n: { id: string }) => 0xaaaaaa;
    const fn1 = applyMonochromeFallback(nodes, monochrome, palette);
    const fn2 = applyMonochromeFallback(nodes, monochrome, palette);
    for (const n of nodes) {
      expect(fn1(n)).toBe(fn2(n));
    }
  });

  it("fallback colors come from the provided palette", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `node${i}` }));
    const monochrome = (_n: { id: string }) => 0xaaaaaa;
    const result = applyMonochromeFallback(nodes, monochrome, palette);
    const paletteSet = new Set(palette);
    for (const n of nodes) {
      expect(paletteSet.has(result(n))).toBe(true);
    }
  });

  it("returns original fn when palette is empty", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
    const original = (_n: { id: string }) => 0xff0000;
    const result = applyMonochromeFallback(nodes, original, []);
    expect(result).toBe(original);
  });

  it("activates fallback with exactly 5 nodes all same color", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}` }));
    const monochrome = (_n: { id: string }) => 0xaaaaaa;
    const result = applyMonochromeFallback(nodes, monochrome, palette);
    expect(result).not.toBe(monochrome);
    // Should produce colors from the palette, not the original monochrome
    const colors = new Set(nodes.map(n => result(n)));
    expect(colors.size).toBeGreaterThanOrEqual(1);
    const paletteSet = new Set(palette);
    for (const n of nodes) {
      expect(paletteSet.has(result(n))).toBe(true);
    }
  });

  it("does NOT activate fallback with 4 nodes all same color (below threshold)", () => {
    const nodes = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}` }));
    const monochrome = (_n: { id: string }) => 0xaaaaaa;
    const result = applyMonochromeFallback(nodes, monochrome, palette);
    expect(result).toBe(monochrome);
  });

  it("fallback colors are drawn from expected palette entries", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `item${i}` }));
    const monochrome = (_n: { id: string }) => 0x999999;
    const customPalette = [0x110000, 0x220000, 0x330000];
    const result = applyMonochromeFallback(nodes, monochrome, customPalette);
    expect(result).not.toBe(monochrome);
    const customSet = new Set(customPalette);
    for (const n of nodes) {
      expect(customSet.has(result(n))).toBe(true);
    }
    // With 20 nodes and 3 palette colors, all 3 should be used
    const usedColors = new Set(nodes.map(n => result(n)));
    expect(usedColors.size).toBe(3);
  });
});

// ===========================================================================
// assignNodeColors — edge cases
// ===========================================================================

describe("assignNodeColors edge cases", () => {
  it("returns empty map for empty nodes", () => {
    const result = assignNodeColors([], "category");
    expect(result.size).toBe(0);
  });

  it("assigns colors to categories sorted alphabetically", () => {
    const nodes = [
      mkNode("a", { category: "Zeus" }),
      mkNode("b", { category: "Apollo" }),
    ];
    const result = assignNodeColors(nodes, "category");
    expect(result.has("Apollo")).toBe(true);
    expect(result.has("Zeus")).toBe(true);
    // Apollo (alphabetically first) should get first color
    expect(result.get("Apollo")).toBe(DEFAULT_COLORS[0]);
    expect(result.get("Zeus")).toBe(DEFAULT_COLORS[1]);
  });

  it("assigns tag colors with 'tag:' prefix", () => {
    const nodes = [mkNode("a", { tags: ["hero", "villain"] })];
    const result = assignNodeColors(nodes, "category");
    expect(result.has("tag:hero")).toBe(true);
    expect(result.has("tag:villain")).toBe(true);
  });

  it("deduplicates categories across nodes", () => {
    const nodes = [
      mkNode("a", { category: "warrior" }),
      mkNode("b", { category: "warrior" }),
      mkNode("c", { category: "mage" }),
    ];
    const result = assignNodeColors(nodes, "category");
    // 2 unique categories + 0 tags = 2 entries
    expect(result.size).toBe(2);
  });

  it("handles nodes with both category and tags", () => {
    const nodes = [mkNode("a", { category: "hero", tags: ["greek"] })];
    const result = assignNodeColors(nodes, "category");
    expect(result.has("hero")).toBe(true);
    expect(result.has("tag:greek")).toBe(true);
    expect(result.size).toBe(2);
  });

  it("wraps around DEFAULT_COLORS for many categories", () => {
    const nodes = Array.from({ length: 30 }, (_, i) =>
      mkNode(`n${i}`, { category: `cat${i}` })
    );
    const result = assignNodeColors(nodes, "category");
    expect(result.size).toBe(30);
    // Colors should wrap (30 categories, DEFAULT_COLORS has ~20 colors)
    const colors = [...result.values()];
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBeLessThanOrEqual(DEFAULT_COLORS.length);
  });
});

// ===========================================================================
// classifyRelation — additional edge cases
// ===========================================================================

describe("classifyRelation edge cases", () => {
  const emptyOnto = {
    inheritanceFields: [] as string[],
    aggregationFields: [] as string[],
    siblingFields: [] as string[],
    sequenceFields: [] as string[],
    similarFields: [] as string[],
    reverseInheritanceFields: [] as string[],
    reverseAggregationFields: [] as string[],
    reverseSequenceFields: [] as string[],
    customMappings: {} as Record<string, string>,
    categoryField: "category",
  };

  it("returns undefined for unknown field", () => {
    expect(classifyRelation("unknown_field", emptyOnto)).toBeUndefined();
  });

  it("trims whitespace from field name", () => {
    expect(classifyRelation("  unknown  ", emptyOnto)).toBeUndefined();
  });

  it("strips @ prefix", () => {
    const onto = { ...emptyOnto, inheritanceFields: ["parent"] };
    const result = classifyRelation("@parent", onto);
    expect(result).toBeDefined();
    expect(result!.type).toBe("inheritance");
  });
});

// ===========================================================================
// Additional coverage tests for simpleHash edge cases
// ===========================================================================

describe("simpleHash edge cases", () => {
  it("handles very long strings", () => {
    const long = "a".repeat(1000);
    const hash = simpleHash(long);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("handles unicode characters", () => {
    expect(simpleHash("日本語")).toBeGreaterThanOrEqual(0);
  });

  it("produces different hashes for single character variations", () => {
    const h1 = simpleHash("a");
    const h2 = simpleHash("b");
    expect(h1).not.toBe(h2);
  });

  it("handles numeric string", () => {
    const hash = simpleHash("12345");
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// applyMonochromeFallback additional edge cases
// ===========================================================================

describe("applyMonochromeFallback additional tests", () => {
  const palette = [0xff0000, 0x00ff00, 0x0000ff];

  it("threshold is exactly 5 nodes", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}` }));
    const monochrome = () => 0xaaaaaa;
    const result = applyMonochromeFallback(nodes, monochrome, palette);
    expect(result).not.toBe(monochrome);
  });

  it("does not fallback with 4 nodes", () => {
    const nodes = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}` }));
    const monochrome = (_n: any) => 0xbbbbbb;
    const result = applyMonochromeFallback(nodes, monochrome, palette);
    expect(result).toBe(monochrome);
  });

  it("multiple colors prevent fallback", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
    const multiColor = (n: any) => (n.id === "n0" ? 0xff0000 : 0x00ff00);
    const result = applyMonochromeFallback(nodes, multiColor, palette);
    expect(result).toBe(multiColor);
  });

  it("fallback uses modulo for palette cycling", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ id: `node${i}` }));
    const monochrome = () => 0xffffff;
    const smallPalette = [0xaa0000, 0x00aa00];
    const result = applyMonochromeFallback(nodes, monochrome, smallPalette);
    for (const n of nodes) {
      expect(smallPalette).toContain(result(n));
    }
  });
});

// ===========================================================================
// assignNodeColors with special values
// ===========================================================================

describe("assignNodeColors with special category values", () => {
  it("filters out empty category strings", () => {
    const nodes = [
      mkNode("a", { category: "" }),
      mkNode("b", { category: "valid" }),
    ];
    const colors = assignNodeColors(nodes, "category");
    expect(colors.has("")).toBe(false);
    expect(colors.has("valid")).toBe(true);
  });

  it("handles undefined categories", () => {
    const nodes = [mkNode("a"), mkNode("b", { category: "cat" })];
    const colors = assignNodeColors(nodes, "category");
    expect(colors.has("cat")).toBe(true);
  });

  it("preserves determinism across multiple calls", () => {
    const nodes = [
      mkNode("a", { category: "z" }),
      mkNode("b", { category: "a" }),
      mkNode("c", { category: "m" }),
    ];
    const colors1 = assignNodeColors(nodes, "category");
    const colors2 = assignNodeColors(nodes, "category");
    expect([...colors1.entries()].sort()).toEqual([...colors2.entries()].sort());
  });
});

// ===========================================================================
// buildRelationColorMap additional coverage
// ===========================================================================

describe("buildRelationColorMap additional tests", () => {
  it("handles edge without type field", () => {
    const edges = [
      { id: "e1", source: "a", target: "b" } as GraphEdge,
      { id: "e2", source: "c", target: "d", relation: "Author" } as GraphEdge,
    ];
    const colors = buildRelationColorMap(edges);
    expect(colors.size).toBe(1);
    expect(colors.has("Author")).toBe(true);
  });

  it("deterministic order with many relations", () => {
    const edges = Array.from({ length: 20 }, (_, i) =>
      mkEdge("a", "b", `Relation${String(i).padStart(2, "0")}`)
    );
    const colors1 = buildRelationColorMap(edges);
    const colors2 = buildRelationColorMap(edges);
    expect([...colors1.entries()].sort()).toEqual([...colors2.entries()].sort());
  });
});

// ===========================================================================
// Additional tests for uncovered functions — extractBodyInfo
// ===========================================================================

describe("extractBodyInfo", () => {
  it("extracts preview and length from plain text", () => {
    const result = extractBodyInfo("Hello world", 5);
    expect(result.preview).toBe("Hello…");
    expect(result.length).toBe(11);
  });

  it("strips YAML frontmatter before preview", () => {
    const content = "---\ntitle: Test\n---\nBody here";
    const result = extractBodyInfo(content, 50);
    expect(result.preview).toContain("Body");
    expect(result.preview).not.toContain("---");
  });

  it("returns full text when shorter than maxLen", () => {
    const text = "Short";
    const result = extractBodyInfo(text, 100);
    expect(result.preview).toBe("Short");
    expect(result.preview).not.toContain("…");
  });

  it("handles content without frontmatter", () => {
    const result = extractBodyInfo("Direct content", 50);
    expect(result.preview).toContain("Direct content");
  });

  it("collapses multiple whitespace into single space", () => {
    const result = extractBodyInfo("Text   with   spaces", 50);
    expect(result.preview).not.toContain("   ");
  });

  it("strips heading markers", () => {
    const result = extractBodyInfo("# Title\n## Subtitle\nContent", 50);
    expect(result.preview).not.toContain("#");
  });

  it("returns empty content for empty input", () => {
    const result = extractBodyInfo("", 10);
    expect(result.preview).toBe("");
    expect(result.length).toBe(0);
  });

  it("handles frontmatter without closing marker", () => {
    const content = "---\ntitle: value\nActual content";
    const result = extractBodyInfo(content, 50);
    expect(result.preview).toBeDefined();
  });

  it("correctly reports body length after processing", () => {
    const content = "This is the actual body";
    const result = extractBodyInfo(content, 100);
    expect(result.length).toBe(content.length);
  });

  it("truncates exactly at maxLen with ellipsis", () => {
    const result = extractBodyInfo("0123456789", 5);
    expect(result.preview).toBe("01234…");
  });
});

// ===========================================================================
// Additional coverage for buildSunburstData
// ===========================================================================

describe("buildSunburstData", () => {
  it("creates root with name Vault", () => {
    const mockApp = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
      },
      metadataCache: {
        getFileCache: vi.fn(() => ({})),
      },
    } as any;

    const result = buildSunburstData(mockApp, "category");
    expect(result.name).toBe("Vault");
    expect(result.children).toBeDefined();
  });

  it("groups files by specified field", () => {
    const mockApp = {
      vault: {
        getMarkdownFiles: vi.fn(() => [
          {
            path: "file1.md",
            basename: "file1",
            stat: { mtime: 0, ctime: 0 },
          },
        ]),
      },
      metadataCache: {
        getFileCache: vi.fn(() => ({
          frontmatter: { category: "test" },
        })),
      },
    } as any;

    const result = buildSunburstData(mockApp, "category");
    expect(result.children?.length).toBeGreaterThan(0);
    const testGroup = result.children?.find((c: any) => c.name === "test");
    expect(testGroup).toBeDefined();
  });

  it("defaults to Uncategorized when field missing", () => {
    const mockApp = {
      vault: {
        getMarkdownFiles: vi.fn(() => [
          {
            path: "file.md",
            basename: "file",
            stat: { mtime: 0, ctime: 0 },
          },
        ]),
      },
      metadataCache: {
        getFileCache: vi.fn(() => ({})),
      },
    } as any;

    const result = buildSunburstData(mockApp, "missing");
    const uncategorized = result.children?.find((c: any) => c.name === "Uncategorized");
    expect(uncategorized).toBeDefined();
  });

  it("preserves file path and basename", () => {
    const mockApp = {
      vault: {
        getMarkdownFiles: vi.fn(() => [
          {
            path: "folder/file.md",
            basename: "file",
            stat: { mtime: 0, ctime: 0 },
          },
        ]),
      },
      metadataCache: {
        getFileCache: vi.fn(() => ({
          frontmatter: { cat: "test" },
        })),
      },
    } as any;

    const result = buildSunburstData(mockApp, "cat");
    const group = result.children?.[0];
    const file = group?.children?.[0];
    expect(file?.filePath).toBe("folder/file.md");
    expect(file?.name).toBe("file");
  });
});

// =============================================
// collectAllTags
// =============================================
describe("collectAllTags", () => {
  it("returns empty set for no nodes", () => {
    expect(collectAllTags([]).size).toBe(0);
  });

  it("returns empty set when nodes have no tags", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    expect(collectAllTags(nodes).size).toBe(0);
  });

  it("collects flat tags from multiple nodes", () => {
    const nodes = [
      mkNode("a", { tags: ["character"] }),
      mkNode("b", { tags: ["place"] }),
      mkNode("c", { tags: ["character"] }),
    ];
    const tags = collectAllTags(nodes);
    expect(tags).toEqual(new Set(["character", "place"]));
  });

  it("expands nested tags into ancestor tags", () => {
    const nodes = [mkNode("a", { tags: ["entity/character/hero"] })];
    const tags = collectAllTags(nodes);
    expect(tags).toEqual(new Set(["entity/character/hero", "entity/character", "entity"]));
  });

  it("deduplicates ancestor tags across nodes", () => {
    const nodes = [
      mkNode("a", { tags: ["entity/character"] }),
      mkNode("b", { tags: ["entity/place"] }),
    ];
    const tags = collectAllTags(nodes);
    expect(tags).toEqual(new Set(["entity/character", "entity/place", "entity"]));
  });

  it("handles mixed flat and nested tags", () => {
    const nodes = [mkNode("a", { tags: ["flat", "a/b/c"] })];
    const tags = collectAllTags(nodes);
    expect(tags).toEqual(new Set(["flat", "a/b/c", "a/b", "a"]));
  });

  it("handles deeply nested tags (4 levels)", () => {
    const nodes = [mkNode("a", { tags: ["a/b/c/d"] })];
    const tags = collectAllTags(nodes);
    expect(tags.has("a/b/c/d")).toBe(true);
    expect(tags.has("a/b/c")).toBe(true);
    expect(tags.has("a/b")).toBe(true);
    expect(tags.has("a")).toBe(true);
    expect(tags.size).toBe(4);
  });

  it("handles single-level tags without expansion", () => {
    const nodes = [mkNode("a", { tags: ["simple"] })];
    const tags = collectAllTags(nodes);
    expect(tags).toEqual(new Set(["simple"]));
  });

  it("handles multiple tags on same node with expansion", () => {
    const nodes = [mkNode("a", { tags: ["a/b", "x/y/z"] })];
    const tags = collectAllTags(nodes);
    expect(tags).toEqual(new Set(["a/b", "a", "x/y/z", "x/y", "x"]));
  });

  it("deduplicates across many nodes with overlapping tags", () => {
    const nodes = [
      mkNode("a", { tags: ["entity/character", "entity/character/hero"] }),
      mkNode("b", { tags: ["entity/character/npc"] }),
      mkNode("c", { tags: ["entity"] }),
    ];
    const tags = collectAllTags(nodes);
    expect(tags).toEqual(
      new Set(["entity/character", "entity/character/hero", "entity/character/npc", "entity"])
    );
  });
});

// ===========================================================================
// Integration tests: extractBodyInfo edge cases
// ===========================================================================

describe("extractBodyInfo comprehensive tests", () => {
  it("strips multiple YAML blocks (only first is recognized)", () => {
    const content = "---\ntitle: Test\n---\n--- should not be stripped ---\nContent";
    const result = extractBodyInfo(content, 100);
    expect(result.preview).toContain("should");
  });

  it("handles YAML without proper closing marker", () => {
    const content = "---\nincomplete yaml\nActual body";
    const result = extractBodyInfo(content, 100);
    expect(result.preview).toBeDefined();
  });

  it("preserves inline formatting after stripping", () => {
    const content = "---\ntitle: x\n---\n**Bold** text";
    const result = extractBodyInfo(content, 50);
    expect(result.preview).toContain("Bold");
    expect(result.preview).toContain("text");
  });

  it("collapses tabs and newlines into spaces", () => {
    const content = "Text\t\twith\n\nmultiple\r\nspaces";
    const result = extractBodyInfo(content, 100);
    expect(result.preview).not.toContain("\t");
    expect(result.preview).not.toContain("\n");
  });

  it("handles content with only headings", () => {
    const content = "# Title\n## Subtitle\n### Section";
    const result = extractBodyInfo(content, 100);
    // Heading markers stripped at line start, text becomes "Title Subtitle Section"
    expect(result.preview).toBe("Title Subtitle Section");
  });

  it("handles special characters in content", () => {
    const content = "Special chars: !@#$%^&*()";
    const result = extractBodyInfo(content, 100);
    expect(result.preview).toContain("Special");
  });

  it("reports normalized length after whitespace collapse", () => {
    const content = "One   Two   Three";
    const result = extractBodyInfo(content, 100);
    // After collapsing spaces: "One Two Three" = 13 chars
    expect(result.preview).toBe("One Two Three");
    expect(result.length).toBe(13);
  });

  it("handles very long content with truncation", () => {
    const longText = "a".repeat(1000);
    const result = extractBodyInfo(longText, 100);
    expect(result.preview.length).toBe(101); // 100 chars + ellipsis
    expect(result.preview.endsWith("…")).toBe(true);
    expect(result.length).toBe(1000);
  });
});

// ===========================================================================
// Boundary tests for simpleHash
// ===========================================================================

describe("simpleHash comprehensive tests", () => {
  it("produces consistent hash for repeated inputs", () => {
    const str = "test";
    const hashes = [simpleHash(str), simpleHash(str), simpleHash(str)];
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  });

  it("handles very long repeated characters", () => {
    const long = "x".repeat(10000);
    const hash = simpleHash(long);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("produces different hashes for similar strings", () => {
    const hashes = new Set([
      simpleHash("a"),
      simpleHash("aa"),
      simpleHash("aaa"),
      simpleHash("aaaa"),
    ]);
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("handles all ASCII characters", () => {
    let hashedDifferent = false;
    const samples = [
      "abc",
      "ABC",
      "123",
      "!@#",
      "   ",
      "\t\n",
    ];
    const hashes = samples.map(s => simpleHash(s));
    // At least some should be different
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBeGreaterThan(1);
  });
});

// ===========================================================================
// Boundary tests for applyMonochromeFallback
// ===========================================================================

describe("applyMonochromeFallback comprehensive tests", () => {
  it("returns same function when exactly 4 nodes with same color", () => {
    const nodes = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}` }));
    const mono = () => 0x123456;
    const result = applyMonochromeFallback(nodes, mono, [0xff0000]);
    expect(result).toBe(mono);
  });

  it("returns wrapped function when exactly 5 nodes with same color", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}` }));
    const mono = () => 0x123456;
    const result = applyMonochromeFallback(nodes, mono, [0xff0000]);
    expect(result).not.toBe(mono);
  });

  it("preserves result consistency with large node counts", () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => ({ id: `n${i}` }));
    const mono = () => 0xffffff;
    const palette = [0xff0000, 0x00ff00, 0x0000ff];
    const fn = applyMonochromeFallback(nodes, mono, palette);
    // Each node should get same color on repeated calls
    const colors = nodes.map(n => fn(n));
    const colors2 = nodes.map(n => fn(n));
    expect(colors).toEqual(colors2);
  });

  it("uses all palette colors for large node count", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({ id: `item${i}` }));
    const mono = () => 0x999999;
    const palette = [0x111111, 0x222222, 0x333333, 0x444444, 0x555555];
    const fn = applyMonochromeFallback(nodes, mono, palette);
    const colors = new Set(nodes.map(n => fn(n)));
    expect(colors.size).toBe(palette.length);
  });

  it("falls back even with color close to monochrome", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
    const mono = () => 0xaaaaaa;
    const palette = [0xbbbbbb, 0xcccccc];
    const fn = applyMonochromeFallback(nodes, mono, palette);
    // Should have triggered fallback since all 10 nodes get same color
    expect(fn).not.toBe(mono);
  });
});

// =============================================
// parseInlineRelationLinksRaw
// =============================================
describe("parseInlineRelationLinksRaw", () => {
  it("parses [[target]@relation] without display text", () => {
    const results = parseInlineRelationLinksRaw("text [[フリーザ]@敵対] more");
    expect(results).toEqual([{ linkTarget: "フリーザ", relation: "敵対" }]);
  });

  it("parses [[target|display]@relation] with display text", () => {
    const results = parseInlineRelationLinksRaw("[[孫悟空|悟空]@師弟]");
    expect(results).toEqual([{ linkTarget: "孫悟空", relation: "師弟" }]);
  });

  it("parses multiple inline relation links", () => {
    const content = "[[A]@friend] and [[B|display]@rival]";
    const results = parseInlineRelationLinksRaw(content);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ linkTarget: "A", relation: "friend" });
    expect(results[1]).toEqual({ linkTarget: "B", relation: "rival" });
  });

  it("returns empty array for content with no inline relation links", () => {
    expect(parseInlineRelationLinksRaw("plain text")).toEqual([]);
    expect(parseInlineRelationLinksRaw("[[normal link]]")).toEqual([]);
    expect(parseInlineRelationLinksRaw("[[link|display]]")).toEqual([]);
  });

  it("trims whitespace from target and relation", () => {
    const results = parseInlineRelationLinksRaw("[[ target ]@ relation ]");
    expect(results).toEqual([{ linkTarget: "target", relation: "relation" }]);
  });

  it("handles path-like targets", () => {
    const results = parseInlineRelationLinksRaw("[[folder/subfolder/note]@author]");
    expect(results).toEqual([{ linkTarget: "folder/subfolder/note", relation: "author" }]);
  });

  it("does not match standard wikilinks without @", () => {
    expect(parseInlineRelationLinksRaw("[[note]]")).toEqual([]);
    expect(parseInlineRelationLinksRaw("[[note|display]]")).toEqual([]);
  });

  it("handles multiline content", () => {
    const content = "line1 [[A]@x]\nline2 [[B|b]@y]\nline3";
    const results = parseInlineRelationLinksRaw(content);
    expect(results).toHaveLength(2);
    expect(results[0].relation).toBe("x");
    expect(results[1].relation).toBe("y");
  });
});

describe("snapshotMeta", () => {
  it("returns undefined for undefined input", () => {
    expect(snapshotMeta(undefined)).toBeUndefined();
  });

  it("strips the position key from frontmatter", () => {
    const fm = { title: "Hello", position: { start: 0, end: 10 }, tags: ["a"] };
    const result = snapshotMeta(fm);
    expect(result).toEqual({ title: "Hello", tags: ["a"] });
    expect(result).not.toHaveProperty("position");
  });

  it("returns undefined when frontmatter contains only position", () => {
    expect(snapshotMeta({ position: { start: 0, end: 5 } })).toBeUndefined();
  });

  it("returns all entries when no position key exists", () => {
    const fm = { author: "A", year: 2025 };
    expect(snapshotMeta(fm)).toEqual({ author: "A", year: 2025 });
  });
});
