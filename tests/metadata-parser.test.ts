import { describe, it, expect } from "vitest";
import { classifyRelation, assignNodeColors, buildRelationColorMap, simpleHash, applyMonochromeFallback } from "../src/parsers/metadata-parser";
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
