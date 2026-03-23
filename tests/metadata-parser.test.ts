import { describe, it, expect } from "vitest";
import { assignNodeColors, buildRelationColorMap } from "../src/parsers/metadata-parser";
import { DEFAULT_COLORS } from "../src/types";
import type { GraphNode, GraphEdge } from "../src/types";

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
