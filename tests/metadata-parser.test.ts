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
