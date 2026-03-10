import { describe, it, expect } from "vitest";
import { edgeLinkDistance, edgeLinkStrength } from "../src/utils/force-config";
import type { GraphEdge } from "../src/types";

function edge(type?: GraphEdge["type"]): GraphEdge {
  return { id: "e1", source: "a", target: "b", type };
}

describe("edgeLinkDistance", () => {
  const base = 100;

  it("returns half distance for inheritance", () => {
    expect(edgeLinkDistance(edge("inheritance"), base)).toBe(50);
  });

  it("returns half distance for aggregation", () => {
    expect(edgeLinkDistance(edge("aggregation"), base)).toBe(50);
  });

  it("returns 0.7x for has-tag", () => {
    expect(edgeLinkDistance(edge("has-tag"), base)).toBeCloseTo(70);
  });

  it("returns 0.8x for sibling", () => {
    expect(edgeLinkDistance(edge("sibling"), base)).toBeCloseTo(80);
  });

  it("returns 0.6x for sequence", () => {
    expect(edgeLinkDistance(edge("sequence"), base)).toBeCloseTo(60);
  });

  it("returns base distance for link type", () => {
    expect(edgeLinkDistance(edge("link"), base)).toBe(100);
  });

  it("returns base distance for undefined type", () => {
    expect(edgeLinkDistance(edge(undefined), base)).toBe(100);
  });

  it("returns base distance for tag type", () => {
    expect(edgeLinkDistance(edge("tag"), base)).toBe(100);
  });

  it("returns base distance for category type", () => {
    expect(edgeLinkDistance(edge("category"), base)).toBe(100);
  });

  it("scales linearly with base distance", () => {
    expect(edgeLinkDistance(edge("inheritance"), 200)).toBe(100);
    expect(edgeLinkDistance(edge("inheritance"), 50)).toBe(25);
  });
});

describe("edgeLinkStrength", () => {
  const base = 0.1;

  it("returns 3x strength for inheritance", () => {
    expect(edgeLinkStrength(edge("inheritance"), base)).toBeCloseTo(0.3);
  });

  it("returns 3x strength for aggregation", () => {
    expect(edgeLinkStrength(edge("aggregation"), base)).toBeCloseTo(0.3);
  });

  it("returns 1.5x for has-tag", () => {
    expect(edgeLinkStrength(edge("has-tag"), base)).toBeCloseTo(0.15);
  });

  it("returns 2x for sibling", () => {
    expect(edgeLinkStrength(edge("sibling"), base)).toBeCloseTo(0.2);
  });

  it("returns 2.5x for sequence", () => {
    expect(edgeLinkStrength(edge("sequence"), base)).toBeCloseTo(0.25);
  });

  it("returns base strength for link type", () => {
    expect(edgeLinkStrength(edge("link"), base)).toBeCloseTo(0.1);
  });

  it("returns base strength for undefined type", () => {
    expect(edgeLinkStrength(edge(undefined), base)).toBeCloseTo(0.1);
  });

  it("returns base strength for similar type", () => {
    expect(edgeLinkStrength(edge("similar"), base)).toBeCloseTo(0.1);
  });

  it("scales linearly with base strength", () => {
    expect(edgeLinkStrength(edge("inheritance"), 0.2)).toBeCloseTo(0.6);
    expect(edgeLinkStrength(edge("inheritance"), 0.05)).toBeCloseTo(0.15);
  });
});
