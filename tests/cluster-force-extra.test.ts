import { describe, it, expect } from "vitest";
import {
  computeGroupGap,
  pairwiseGap,
  estimateLabelExtent,
  nodeRadius,
  effectiveRadius,
  analyzeOverlap,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

function mkNode(id: string, x = 0, y = 0): GraphNode {
  return { id, label: id, filePath: `${id}.md`, x, y } as GraphNode;
}

// =========================================================================
// analyzeOverlap — edge cases
// =========================================================================
describe("analyzeOverlap edge cases", () => {
  it("returns zero for empty array", () => {
    const r = analyzeOverlap([], new Map(), 3);
    expect(r.overlapRatio).toBe(0);
    expect(r.closePairs).toBe(0);
  });

  it("returns zero for single node", () => {
    const r = analyzeOverlap([{ id: "a", x: 0, y: 0 }], new Map([["a", 10]]), 3);
    expect(r.overlapRatio).toBe(0);
  });

  it("detects overlap when nodes are at same position", () => {
    const nodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }];
    const radii = new Map([["a", 10], ["b", 10]]);
    const r = analyzeOverlap(nodes, radii, 3);
    expect(r.overlapPairs).toBe(1);
    expect(r.overlapRatio).toBeGreaterThan(0);
  });

  it("no overlap when nodes are far apart", () => {
    const nodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 1000, y: 1000 }];
    const radii = new Map([["a", 10], ["b", 10]]);
    const r = analyzeOverlap(nodes, radii, 3);
    expect(r.overlapPairs).toBe(0);
  });

  it("handles missing radii gracefully (uses avgRadius)", () => {
    const nodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 5, y: 0 }];
    const r = analyzeOverlap(nodes, new Map(), 3);
    // avgRadius defaults to 6, so dist=5 < 6+6=12 → overlap
    expect(r.overlapPairs).toBe(1);
  });

  it("avgRadius is correct", () => {
    const nodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }];
    const radii = new Map([["a", 20], ["b", 40]]);
    const r = analyzeOverlap(nodes, radii, 3);
    expect(r.avgRadius).toBe(30);
  });
});

// =========================================================================
// computeGroupGap — boundary values
// =========================================================================
describe("computeGroupGap boundary", () => {
  it("returns positive gap for typical values", () => {
    expect(computeGroupGap(15, 2, 1.5)).toBeGreaterThan(0);
  });

  it("gap increases with nodeSpacing", () => {
    const g1 = computeGroupGap(15, 1, 1);
    const g2 = computeGroupGap(15, 5, 1);
    expect(g2).toBeGreaterThan(g1);
  });

  it("gap increases with groupScale", () => {
    const g1 = computeGroupGap(15, 2, 1);
    const g2 = computeGroupGap(15, 2, 3);
    expect(g2).toBeGreaterThan(g1);
  });

  it("handles zero nodeSize", () => {
    const g = computeGroupGap(0, 2, 1);
    expect(Number.isFinite(g)).toBe(true);
  });
});

// =========================================================================
// pairwiseGap
// =========================================================================
describe("pairwiseGap boundary", () => {
  it("returns sum of radii + spacing for typical values", () => {
    const g = pairwiseGap(10, 15, 2);
    expect(g).toBeGreaterThanOrEqual(25);
  });

  it("is symmetric", () => {
    expect(pairwiseGap(10, 20, 3)).toBe(pairwiseGap(20, 10, 3));
  });

  it("handles zero radii", () => {
    const g = pairwiseGap(0, 0, 5);
    expect(Number.isFinite(g)).toBe(true);
    expect(g).toBeGreaterThanOrEqual(0);
  });
});

// =========================================================================
// nodeRadius — degree scaling
// =========================================================================
describe("nodeRadius edge cases", () => {
  it("returns minNodeRadius when degree is 0", () => {
    expect(nodeRadius(15, 0, 15)).toBe(15);
  });

  it("returns at least minNodeRadius regardless of input", () => {
    expect(nodeRadius(5, 0, 15)).toBeGreaterThanOrEqual(15);
  });

  it("scales with degree when sizeByDegree=true", () => {
    const r0 = nodeRadius(15, 0, 15, 100, true);
    const r50 = nodeRadius(15, 50, 15, 100, true);
    expect(r50).toBeGreaterThan(r0);
  });

  it("does not scale when sizeByDegree=false", () => {
    const r0 = nodeRadius(15, 0, 15, 100, false);
    const r50 = nodeRadius(15, 50, 15, 100, false);
    expect(r50).toBe(r0);
  });
});

// =========================================================================
// effectiveRadius — node shape awareness
// =========================================================================
describe("effectiveRadius", () => {
  it("returns positive for typical node", () => {
    const n = mkNode("a");
    expect(effectiveRadius(n, 15, 5)).toBeGreaterThan(0);
  });

  it("increases with degree", () => {
    const n = mkNode("a");
    const r1 = effectiveRadius(n, 15, 1);
    const r2 = effectiveRadius(n, 15, 50);
    expect(r2).toBeGreaterThanOrEqual(r1);
  });

  it("handles collapsed super-node", () => {
    const n = { ...mkNode("a"), collapsedMembers: ["b", "c", "d"] } as any;
    const r = effectiveRadius(n, 15, 10);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
  });
});

// =========================================================================
// estimateLabelExtent
// =========================================================================
describe("estimateLabelExtent", () => {
  it("returns positive for non-empty label", () => {
    const w = estimateLabelExtent(mkNode("hello"), 15, 5, 100, 1.0);
    expect(w).toBeGreaterThan(0);
  });

  it("wider for longer label", () => {
    const short = estimateLabelExtent({ ...mkNode("ab"), label: "ab" } as any, 15, 5, 100, 1.0);
    const long = estimateLabelExtent({ ...mkNode("abcdefghijklm"), label: "abcdefghijklm" } as any, 15, 5, 100, 1.0);
    expect(long).toBeGreaterThan(short);
  });

  it("returns 0 for empty label", () => {
    const w = estimateLabelExtent({ ...mkNode(""), label: "" } as any, 15, 5, 100, 1.0);
    expect(w).toBe(0);
  });

  it("returns 0 when labelSpacingFactor is 0", () => {
    const w = estimateLabelExtent(mkNode("test"), 15, 5, 100, 0);
    expect(w).toBe(0);
  });
});
