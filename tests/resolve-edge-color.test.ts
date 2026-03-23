import { describe, it, expect } from "vitest";
import {
  resolveEdgeColor,
  defaultColor,
  EDGE_TYPE_SPECS,
  EDGE_TYPE_FALLBACK_COLORS,
} from "../src/views/EdgeRenderer";
import type { GraphEdge } from "../src/types";

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return { source: "a", target: "b", type: "link", ...overrides } as GraphEdge;
}

const noRelColors = new Map<string, string>();

describe("resolveEdgeColor", () => {
  // --- Fixed-color structural edges ---
  it("inheritance returns fixed purple color", () => {
    const color = resolveEdgeColor(makeEdge({ type: "inheritance" }), false, noRelColors, true);
    const spec = EDGE_TYPE_SPECS.get("inheritance");
    expect(color).toBe(spec!.color);
  });

  it("aggregation returns fixed blue color", () => {
    const color = resolveEdgeColor(makeEdge({ type: "aggregation" }), false, noRelColors, true);
    const spec = EDGE_TYPE_SPECS.get("aggregation");
    expect(color).toBe(spec!.color);
  });

  it("has-tag returns fixed gray color", () => {
    const color = resolveEdgeColor(makeEdge({ type: "has-tag" }), false, noRelColors, true);
    const spec = EDGE_TYPE_SPECS.get("has-tag");
    expect(color).toBe(spec!.color);
  });

  it("similar returns fixed amber color", () => {
    const color = resolveEdgeColor(makeEdge({ type: "similar" }), false, noRelColors, true);
    const spec = EDGE_TYPE_SPECS.get("similar");
    expect(color).toBe(spec!.color);
  });

  // --- Default color (non-relation mode) ---
  it("link edge without relation coloring → dark default", () => {
    const color = resolveEdgeColor(makeEdge(), false, noRelColors, true);
    expect(color).toBe(defaultColor(true));
  });

  it("link edge without relation coloring → light default", () => {
    const color = resolveEdgeColor(makeEdge(), false, noRelColors, false);
    expect(color).toBe(defaultColor(false));
  });

  it("dark default differs from light default", () => {
    expect(defaultColor(true)).not.toBe(defaultColor(false));
  });

  // --- Relation coloring ---
  it("relation color from map when useRelColor=true", () => {
    const relColors = new Map([["Author", "#ff0000"]]);
    const color = resolveEdgeColor(
      makeEdge({ relation: "Author" }), true, relColors, true,
    );
    expect(color).toBe(0xff0000);
  });

  it("fallback to edge type color when relation not in map", () => {
    const color = resolveEdgeColor(makeEdge({ type: "link" }), true, noRelColors, true);
    expect(color).toBe(EDGE_TYPE_FALLBACK_COLORS.get("link"));
  });

  it("tag edge uses fallback cyan when useRelColor=true", () => {
    const color = resolveEdgeColor(makeEdge({ type: "tag" }), true, noRelColors, true);
    expect(color).toBe(EDGE_TYPE_FALLBACK_COLORS.get("tag"));
  });

  it("semantic edge uses fallback orange when useRelColor=true", () => {
    const color = resolveEdgeColor(makeEdge({ type: "semantic" }), true, noRelColors, true);
    expect(color).toBe(EDGE_TYPE_FALLBACK_COLORS.get("semantic"));
  });

  // --- Fixed color takes priority over relation coloring ---
  it("inheritance uses fixed color even when useRelColor=true", () => {
    const relColors = new Map([["is-a", "#00ff00"]]);
    const color = resolveEdgeColor(
      makeEdge({ type: "inheritance", relation: "is-a" }), true, relColors, true,
    );
    // Fixed color from EDGE_TYPE_SPECS takes priority
    expect(color).toBe(EDGE_TYPE_SPECS.get("inheritance")!.color);
  });

  // --- Edge case: unknown type ---
  it("unknown type with useRelColor=false → default color", () => {
    const color = resolveEdgeColor(makeEdge({ type: "custom-unknown" as any }), false, noRelColors, true);
    expect(color).toBe(defaultColor(true));
  });

  it("unknown type with useRelColor=true but no fallback → default color", () => {
    const color = resolveEdgeColor(makeEdge({ type: "custom-unknown" as any }), true, noRelColors, true);
    expect(color).toBe(defaultColor(true));
  });
});
