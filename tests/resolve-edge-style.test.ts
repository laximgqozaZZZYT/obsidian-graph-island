import { describe, it, expect } from "vitest";
import {
  resolveEdgeStyle,
  STRUCTURAL_EDGE_ALPHA,
  NON_STRUCTURAL_EDGE_ALPHA,
  DEFAULT_LINE_THICKNESS,
  HIGHLIGHT_LINE_THICKNESS,
  FADE_BY_DEGREE_MIN_ALPHA,
  RELATION_COLOR_ALPHA,
  type EdgeDrawConfig,
  type EdgeStyle,
} from "../src/views/EdgeRenderer";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    source: "a",
    target: "b",
    type: "link",
    ...overrides,
  } as GraphEdge;
}

function makeCfg(overrides: Partial<EdgeDrawConfig> = {}): EdgeDrawConfig {
  return {
    showLinks: true,
    showTagEdges: true,
    showCategoryEdges: true,
    showSemanticEdges: true,
    showInheritance: true,
    showAggregation: true,
    showTagNodes: true,
    showSimilar: true,
    showSibling: true,
    showSequence: true,
    colorEdgesByRelation: false,
    isArcLayout: false,
    highlightedNodeId: null,
    highlightSet: new Set(),
    bgColor: 0x1e1e1e,
    relationColors: new Map(),
    fadeByDegree: false,
    degrees: new Map(),
    maxDegree: 0,
    nodeClusterMap: null,
    clusterCentroids: null,
    clusterRadii: null,
    bundleStrength: 0,
    isDark: true,
    showEdgeLabels: false,
    showArrows: false,
    nodeRadii: null,
    ...overrides,
  };
}

const pos = (id: string) => ({ x: 0, y: 0, id });
const src = pos("a");
const tgt = pos("b");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("resolveEdgeStyle", () => {
  it("link edge uses NON_STRUCTURAL alpha and DEFAULT thickness", () => {
    const s = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 1, null);
    expect(s.alpha).toBeCloseTo(NON_STRUCTURAL_EDGE_ALPHA);
    expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS);
  });

  it("inheritance edge uses STRUCTURAL alpha", () => {
    const s = resolveEdgeStyle(
      makeEdge({ type: "inheritance" }), src, tgt, makeCfg(), 1, null,
    );
    expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
  });

  it("has-tag edge is structural", () => {
    const s = resolveEdgeStyle(
      makeEdge({ type: "has-tag" }), src, tgt, makeCfg(), 1, null,
    );
    expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
  });

  it("similar edge is structural", () => {
    const s = resolveEdgeStyle(
      makeEdge({ type: "similar" }), src, tgt, makeCfg(), 1, null,
    );
    expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
  });

  it("densityScale scales alpha proportionally", () => {
    const full = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 1, null);
    const half = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 0.5, null);
    expect(half.alpha).toBeCloseTo(full.alpha * 0.5);
  });

  it("highContrast doubles lineThick and boosts alpha", () => {
    const normal = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 1, null);
    const hc = resolveEdgeStyle(
      makeEdge(), src, tgt, makeCfg({ highContrast: true }), 1, null,
    );
    expect(hc.lineThick).toBeCloseTo(normal.lineThick * 2);
    expect(hc.alpha).toBeCloseTo(Math.min(1, normal.alpha * 1.3));
  });

  it("pair count increases thickness logarithmically", () => {
    const pc = new Map([["a:b", 8]]);
    const s = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 1, pc);
    // log2(8) = 3, so lineThick = 2 + 3 * 0.6 = 3.8
    expect(s.lineThick).toBeCloseTo(3.8);
  });

  it("pair count > 2 boosts alpha by up to 1.3x", () => {
    const pc = new Map([["a:b", 10]]);
    const noWeight = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 1, null);
    const withWeight = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 1, pc);
    expect(withWeight.alpha).toBeGreaterThan(noWeight.alpha);
    expect(withWeight.alpha).toBeLessThanOrEqual(noWeight.alpha * 1.3);
  });

  it("fadeByDegree reduces alpha for low-degree nodes", () => {
    const cfg = makeCfg({
      fadeByDegree: true,
      degrees: new Map([["a", 1], ["b", 1]]),
      maxDegree: 100,
    });
    const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
    // sqrt(1/100) ≈ 0.1, so alpha *= 0.15 + 0.85*0.1 ≈ 0.235
    expect(s.alpha).toBeLessThan(NON_STRUCTURAL_EDGE_ALPHA * 0.5);
  });

  it("fadeByDegree max degree preserves full alpha", () => {
    const cfg = makeCfg({
      fadeByDegree: true,
      degrees: new Map([["a", 100], ["b", 100]]),
      maxDegree: 100,
    });
    const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
    // sqrt(100/100) = 1, alpha *= 0.15 + 0.85*1 = 1.0
    expect(s.alpha).toBeCloseTo(NON_STRUCTURAL_EDGE_ALPHA);
  });

  it("highlighted node sets highlight thickness and full alpha", () => {
    const cfg = makeCfg({
      highlightedNodeId: "a",
      highlightSet: new Set(["a", "b"]),
    });
    const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
    expect(s.lineThick).toBeCloseTo(HIGHLIGHT_LINE_THICKNESS);
    expect(s.alpha).toBe(1.0);
  });

  it("non-highlighted edge is dimmed during hover", () => {
    const cfg = makeCfg({
      highlightedNodeId: "x",
      highlightSet: new Set(["x"]),
    });
    const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
    expect(s.alpha).toBeLessThan(0.2);
  });

  it("colorEdgesByRelation uses RELATION_COLOR_ALPHA for relation edges", () => {
    const e = makeEdge({ relation: "Author" });
    const cfg = makeCfg({ colorEdgesByRelation: true });
    const s = resolveEdgeStyle(e, src, tgt, cfg, 1, null);
    expect(s.alpha).toBeCloseTo(RELATION_COLOR_ALPHA);
  });

  it("globalEdgeAlpha multiplier reduces alpha", () => {
    const cfg = makeCfg({ globalEdgeAlpha: 0.5 });
    const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
    expect(s.alpha).toBeCloseTo(NON_STRUCTURAL_EDGE_ALPHA * 0.5);
  });

  it("zoom-out (worldScale < threshold) thins edges", () => {
    const cfg = makeCfg({ worldScale: 0.2 });
    const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
    // ws=0.2 < fadeZ=0.5, lineThick *= max(0.6, 0.2/0.5) = max(0.6, 0.4) = 0.6
    expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * 0.6);
  });

  it("edgeStrengthGlow scales thickness by target degree", () => {
    const cfg = makeCfg({
      edgeStrengthGlow: true,
      degrees: new Map([["a", 5], ["b", 50]]),
      maxDegree: 50,
    });
    const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
    // t = min(1, 50/50) = 1, lineThick *= 0.5 + 1 * 2.5 = 3.0
    expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * 3.0);
  });
});
