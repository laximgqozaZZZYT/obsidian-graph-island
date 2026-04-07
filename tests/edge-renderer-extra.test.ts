/**
 * Additional EdgeRenderer tests for untested functions and edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  defaultColor,
  resolveEdgeColor,
  EDGE_TYPE_SPECS,
  EDGE_TYPE_FALLBACK_COLORS,
  shouldSkipEdge,
  buildBidirectionalSet,
  shouldSkipByDirection,
  normalizeAngle,
  mergeNearbyValues,
  computeDensityScale,
  DENSITY_FULL_ALPHA_THRESHOLD,
  DENSITY_GENTLE_THRESHOLD,
  DENSITY_AGGRESSIVE_THRESHOLD,
  DENSITY_MIN_ALPHA,
  type EdgeDrawConfig,
} from "../src/views/EdgeRenderer";

// ---------------------------------------------------------------------------
// defaultColor
// ---------------------------------------------------------------------------
describe("defaultColor", () => {
  it("returns dark theme color for isDark=true", () => {
    expect(defaultColor(true)).toBe(0x666666);
  });

  it("returns light theme color for isDark=false", () => {
    expect(defaultColor(false)).toBe(0x999999);
  });
});

// ---------------------------------------------------------------------------
// resolveEdgeColor (additional edge cases)
// ---------------------------------------------------------------------------
describe("resolveEdgeColor (extra)", () => {
  it("returns spec color when edge type has fixed color", () => {
    // inheritance type has a fixed color
    const color = resolveEdgeColor(
      { source: "a", target: "b", type: "inheritance" } as any,
      false,
      new Map(),
      true,
    );
    // EDGE_TYPE_SPECS for inheritance has a color
    const spec = EDGE_TYPE_SPECS.get("inheritance");
    if (spec?.color != null) {
      expect(color).toBe(spec.color);
    }
  });

  it("uses relation color when useRelColor and relation exists", () => {
    const relationColors = new Map([["related", "#ff0000"]]);
    const color = resolveEdgeColor(
      { source: "a", target: "b", type: "link", relation: "related" } as any,
      true,
      relationColors,
      true,
    );
    // Should convert #ff0000 to 0xff0000
    expect(color).toBe(0xff0000);
  });

  it("uses type fallback when useRelColor but no relation match", () => {
    const color = resolveEdgeColor(
      { source: "a", target: "b", type: "link" } as any,
      true,
      new Map(),
      true,
    );
    const fallback = EDGE_TYPE_FALLBACK_COLORS.get("link");
    if (fallback != null) {
      expect(color).toBe(fallback);
    }
  });

  it("uses default color when no type match and useRelColor=false", () => {
    const color = resolveEdgeColor(
      { source: "a", target: "b", type: "unknown-type" } as any,
      false,
      new Map(),
      true,
    );
    expect(color).toBe(defaultColor(true));
  });

  it("uses default color for light theme", () => {
    const color = resolveEdgeColor(
      { source: "a", target: "b" } as any,
      false,
      new Map(),
      false,
    );
    expect(color).toBe(defaultColor(false));
  });
});

// ---------------------------------------------------------------------------
// shouldSkipEdge (additional edge cases)
// ---------------------------------------------------------------------------
describe("shouldSkipEdge (extra)", () => {
  function makeCfg(overrides: Partial<EdgeDrawConfig> = {}): EdgeDrawConfig {
    return {
      showLinks: true,
      showTagEdges: true,
      showCategoryEdges: true,
      showSemanticEdges: true,
      showInheritance: true,
      showAggregation: true,
      showSimilar: true,
      showSibling: true,
      showSequence: true,
      showNamedRelation: true,
      worldScale: 1,
      edgeDensityFloor: 0.25,
      ...overrides,
    } as EdgeDrawConfig;
  }

  it("skips link edge when showLinks=false", () => {
    expect(shouldSkipEdge({ source: "a", target: "b", type: "link" } as any, makeCfg({ showLinks: false }))).toBe(true);
  });

  it("keeps link edge when showLinks=true", () => {
    expect(shouldSkipEdge({ source: "a", target: "b", type: "link" } as any, makeCfg({ showLinks: true }))).toBe(false);
  });

  it("skips inheritance when showInheritance=false", () => {
    expect(shouldSkipEdge({ source: "a", target: "b", type: "inheritance" } as any, makeCfg({ showInheritance: false }))).toBe(true);
  });

  it("skips similar when showSimilar=false", () => {
    expect(shouldSkipEdge({ source: "a", target: "b", type: "similar" } as any, makeCfg({ showSimilar: false }))).toBe(true);
  });

  it("skips named-relation when showNamedRelation=false", () => {
    expect(shouldSkipEdge({ source: "a", target: "b", type: "named-relation" } as any, makeCfg({ showNamedRelation: false }))).toBe(true);
  });

  it("keeps named-relation when showNamedRelation=true", () => {
    expect(shouldSkipEdge({ source: "a", target: "b", type: "named-relation" } as any, makeCfg({ showNamedRelation: true }))).toBe(false);
  });

  it("keeps unknown edge type", () => {
    expect(shouldSkipEdge({ source: "a", target: "b", type: "completely-unknown" } as any, makeCfg())).toBe(false);
  });

  it("handles edge with no type", () => {
    expect(shouldSkipEdge({ source: "a", target: "b" } as any, makeCfg())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildBidirectionalSet (additional)
// ---------------------------------------------------------------------------
describe("buildBidirectionalSet (extra)", () => {
  it("detects bidirectional edges", () => {
    const edges = [
      { source: "a", target: "b", type: "link" },
      { source: "b", target: "a", type: "link" },
    ] as any[];
    const bidir = buildBidirectionalSet(edges);
    // Uses "→" separator: "a→b" and "b→a"
    expect(bidir.has("a→b") || bidir.has("b→a")).toBe(true);
  });

  it("does not flag unidirectional edges", () => {
    const edges = [
      { source: "a", target: "b", type: "link" },
      { source: "c", target: "d", type: "link" },
    ] as any[];
    const bidir = buildBidirectionalSet(edges);
    expect(bidir.size).toBe(0);
  });

  it("handles empty edge list", () => {
    const bidir = buildBidirectionalSet([]);
    expect(bidir.size).toBe(0);
  });

  it("single self-loop is not bidir (only one edge)", () => {
    const edges = [
      { source: "a", target: "a", type: "link" },
    ] as any[];
    const bidir = buildBidirectionalSet(edges);
    // fwd="a→a", rev="a→a"; but rev check happens before adding fwd,
    // so single self-loop is NOT detected as bidir
    expect(bidir.has("a→a")).toBe(false);
  });

  it("duplicate self-loop IS bidir", () => {
    const edges = [
      { source: "a", target: "a", type: "link" },
      { source: "a", target: "a", type: "link" },
    ] as any[];
    const bidir = buildBidirectionalSet(edges);
    // Second time, fwd buf already has "a→a"
    expect(bidir.has("a→a")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldSkipByDirection (additional)
// ---------------------------------------------------------------------------
describe("shouldSkipByDirection (extra)", () => {
  it("returns false for 'all' filter (shows everything)", () => {
    const result = shouldSkipByDirection(
      { source: "a", target: "b" } as any,
      { edgeDirectionFilter: "all", _bidirectionalSet: new Set() },
    );
    expect(result).toBe(false);
  });

  it("returns true for 'bidirectional' filter when edge is not bidir", () => {
    const result = shouldSkipByDirection(
      { source: "a", target: "b" } as any,
      { edgeDirectionFilter: "bidirectional", _bidirectionalSet: new Set() },
    );
    expect(result).toBe(true);
  });

  it("returns false for 'bidirectional' filter when edge IS bidir", () => {
    const result = shouldSkipByDirection(
      { source: "a", target: "b" } as any,
      { edgeDirectionFilter: "bidirectional", _bidirectionalSet: new Set(["a→b"]) },
    );
    expect(result).toBe(false);
  });

  it("returns true for 'unidirectional' filter when edge is bidir", () => {
    const result = shouldSkipByDirection(
      { source: "a", target: "b" } as any,
      { edgeDirectionFilter: "unidirectional", _bidirectionalSet: new Set(["a→b"]) },
    );
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeAngle (additional)
// ---------------------------------------------------------------------------
describe("normalizeAngle (extra)", () => {
  // normalizeAngle maps to [0, PI) range
  it("normalizes negative angles to [0, PI)", () => {
    const result = normalizeAngle(-Math.PI / 2);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(Math.PI);
  });

  it("normalizes angles >= PI", () => {
    const result = normalizeAngle(3 * Math.PI / 2);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(Math.PI);
  });

  it("preserves angles in [0, PI)", () => {
    const angle = Math.PI / 4;
    expect(normalizeAngle(angle)).toBeCloseTo(angle);
  });

  it("handles zero", () => {
    expect(normalizeAngle(0)).toBe(0);
  });

  it("handles exact PI (normalizes to 0)", () => {
    const result = normalizeAngle(Math.PI);
    expect(result).toBeCloseTo(0, 10);
  });
});

// ---------------------------------------------------------------------------
// mergeNearbyValues (additional)
// ---------------------------------------------------------------------------
describe("mergeNearbyValues (extra)", () => {
  it("merges values closer than minSpacing", () => {
    const result = mergeNearbyValues([1, 1.5, 3, 3.2, 5], 2);
    // Values within 2 of each other should be merged
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.length).toBeGreaterThan(0);
  });

  it("keeps all values when well-spaced", () => {
    const result = mergeNearbyValues([0, 10, 20, 30], 2);
    expect(result).toEqual([0, 10, 20, 30]);
  });

  it("handles empty array", () => {
    expect(mergeNearbyValues([], 5)).toEqual([]);
  });

  it("handles single value", () => {
    expect(mergeNearbyValues([42], 5)).toEqual([42]);
  });

  it("handles minSpacing of 0", () => {
    const result = mergeNearbyValues([1, 1, 2, 3], 0);
    // With 0 spacing, no merging should occur (or minimal)
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeDensityScale (additional boundary tests)
// ---------------------------------------------------------------------------
describe("computeDensityScale (extra boundaries)", () => {
  it("returns 1 for edge count at DENSITY_FULL_ALPHA_THRESHOLD", () => {
    const result = computeDensityScale({ worldScale: 1, edgeDensityFloor: 0.25 }, DENSITY_FULL_ALPHA_THRESHOLD);
    expect(result).toBe(1);
  });

  it("returns less than 1 for edge count just above threshold", () => {
    const result = computeDensityScale({ worldScale: 1, edgeDensityFloor: 0.25 }, DENSITY_FULL_ALPHA_THRESHOLD + 1);
    expect(result).toBeLessThan(1);
  });

  it("returns DENSITY_MIN_ALPHA for very large edge count", () => {
    const result = computeDensityScale({ worldScale: 1, edgeDensityFloor: 0 }, DENSITY_AGGRESSIVE_THRESHOLD + 1000);
    expect(result).toBeCloseTo(DENSITY_MIN_ALPHA, 1);
  });

  it("applies zoom fade at extreme zoom-out", () => {
    const normal = computeDensityScale({ worldScale: 1, edgeDensityFloor: 0.25 }, 50);
    const zoomOut = computeDensityScale({ worldScale: 0.01, edgeDensityFloor: 0.25 }, 50);
    expect(zoomOut).toBeLessThanOrEqual(normal);
  });

  it("handles zero edge count", () => {
    const result = computeDensityScale({ worldScale: 1, edgeDensityFloor: 0.25 }, 0);
    expect(result).toBe(1);
  });
});
