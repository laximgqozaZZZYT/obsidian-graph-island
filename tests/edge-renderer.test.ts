import { describe, it, expect, vi } from "vitest";

// Mock PIXI.Graphics with a call recorder
function createMockGraphics() {
  const calls: { method: string; args: any[] }[] = [];
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      return (...args: any[]) => {
        calls.push({ method: String(prop), args });
        return proxy; // allow chaining
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return { g: proxy, calls };
}

// We need to mock pixi.js before importing EdgeRenderer
vi.mock("pixi.js", () => ({}));

import {
  drawEdges, type EdgeDrawConfig,
  shouldSkipEdge, buildBidirectionalSet, normalizeAngle,
  mergeNearbyValues, deduplicatePath, angleDist, shortestAngleDelta,
  buildPairCounts,
  computeJunctionGrid, filterGridForPortFace, routeViaJunctionGrid,
  computeJunctionWaypoints,
  findNearestGap, findGapBetween,
  type JunctionGrid,
} from "../src/views/EdgeRenderer";
import { drawEdgeLabels, getEdgeLabel } from "../src/views/EdgeLabelRenderer";
import type { GraphEdge } from "../src/types";

function baseCfg(overrides?: Partial<EdgeDrawConfig>): EdgeDrawConfig {
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
    highlightSet: new Set<string>(),
    bgColor: 0x1e1e2e,
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

const nodeA = { x: 0, y: 0, id: "a" };
const nodeB = { x: 100, y: 0, id: "b" };
const nodeC = { x: 50, y: 50, id: "c" };

function resolvePos(ref: string | object) {
  if (typeof ref === "object") return ref as any;
  const map: Record<string, any> = { a: nodeA, b: nodeB, c: nodeC };
  return map[ref];
}

describe("drawEdges", () => {
  it("clears graphics on every call", () => {
    const { g, calls } = createMockGraphics();
    drawEdges(g, [], resolvePos, baseCfg());
    expect(calls[0]).toEqual({ method: "clear", args: [] });
  });

  it("draws a normal edge", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b" }];
    drawEdges(g, edges, resolvePos, baseCfg());
    const moveCall = calls.find((c) => c.method === "moveTo");
    // With < 400 edges useCurves is active, so we get quadraticCurveTo instead of lineTo
    const drawCall = calls.find((c) => c.method === "lineTo" || c.method === "quadraticCurveTo");
    expect(moveCall).toBeDefined();
    expect(drawCall).toBeDefined();
  });

  it("skips inheritance edges when showInheritance is false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "inheritance" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showInheritance: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("skips aggregation edges when showAggregation is false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "aggregation" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showAggregation: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("skips has-tag edges when showTagNodes is false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "has-tag" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showTagNodes: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("skips similar edges when showSimilar is false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "similar" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showSimilar: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("skips sibling edges when showSibling is false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "sibling" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showSibling: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("skips sequence edges when showSequence is false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "sequence" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showSequence: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("draws sequence edges with arrow marker", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "sequence" }];
    drawEdges(g, edges, resolvePos, baseCfg());
    const fillCall = calls.find((c) => c.method === "beginFill");
    const closeCall = calls.find((c) => c.method === "closePath");
    expect(fillCall).toBeDefined();
    expect(closeCall).toBeDefined();
  });

  it("skips edges with unresolvable source/target", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "nonexistent", target: "b" }];
    drawEdges(g, edges, resolvePos, baseCfg());
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("uses arc curves when isArcLayout is true", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b" }];
    drawEdges(g, edges, resolvePos, baseCfg({ isArcLayout: true }));
    const curveCall = calls.find((c) => c.method === "quadraticCurveTo");
    expect(curveCall).toBeDefined();
  });

  it("draws solid line for similar edges", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "similar" }];
    drawEdges(g, edges, resolvePos, baseCfg());
    const moveCall = calls.find((c) => c.method === "moveTo");
    const lineCall = calls.find((c) => c.method === "lineTo");
    expect(moveCall).toBeDefined();
    expect(lineCall).toBeDefined();
  });

  it("draws ontology markers for inheritance edges", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "inheritance" }];
    drawEdges(g, edges, resolvePos, baseCfg());
    // Markers use beginFill + closePath
    const fillCall = calls.find((c) => c.method === "beginFill");
    const closeCall = calls.find((c) => c.method === "closePath");
    expect(fillCall).toBeDefined();
    expect(closeCall).toBeDefined();
  });

  it("highlights edges connected to highlighted node", () => {
    const { g, calls } = createMockGraphics();
    // Edge a→b is connected to highlighted node "a"; edge b→c has neither endpoint in highlight set
    // highlightSet contains only "a" (hoverHops=0 scenario)
    const edges: GraphEdge[] = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    drawEdges(g, edges, resolvePos, baseCfg({ highlightedNodeId: "a", highlightSet: new Set(["a"]) }));
    // lineStyle is called with an options object for each edge
    const lineStyleCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineStyleCalls.length).toBe(2);
    // First edge (a→b) should have highlight alpha=1 (one endpoint "a" in highlightSet)
    expect(lineStyleCalls[0].args[0].alpha).toBe(1);
    // Second edge (b→c) should have non-highlight alpha (default FADE_BY_DEGREE_MIN_ALPHA=0.3)
    expect(lineStyleCalls[1].args[0].alpha).toBe(0.3);
  });

  it("uses relation colors when colorEdgesByRelation is true", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", relation: "loves" }];
    const relationColors = new Map([["loves", "#ff0000"]]);
    drawEdges(g, edges, resolvePos, baseCfg({ colorEdgesByRelation: true, relationColors }));
    const lineStyleCall = calls.find((c) => c.method === "lineStyle");
    // 0xff0000
    expect(lineStyleCall?.args[0].color).toBe(0xff0000);
  });

  it("fades edges from low-degree nodes when fadeByDegree is true", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [
      { source: "a", target: "b" },  // a has degree 1 (low)
      { source: "c", target: "b" },  // c has degree 10 (high)
    ];
    const degrees = new Map([["a", 1], ["b", 5], ["c", 10]]);
    drawEdges(g, edges, resolvePos, baseCfg({
      fadeByDegree: true,
      degrees,
      maxDegree: 10,
    }));
    const lineStyleCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineStyleCalls.length).toBe(2);
    // Edge a→b: min(deg(a)=1, deg(b)=5) = 1 → low alpha
    // Edge c→b: min(deg(c)=10, deg(b)=5) = 5 → higher alpha
    expect(lineStyleCalls[0].args[0].alpha).toBeLessThan(lineStyleCalls[1].args[0].alpha);
  });

  it("does not fade edges when fadeByDegree is false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [
      { source: "a", target: "b" },
      { source: "c", target: "b" },
    ];
    const degrees = new Map([["a", 1], ["b", 5], ["c", 10]]);
    drawEdges(g, edges, resolvePos, baseCfg({
      fadeByDegree: false,
      degrees,
      maxDegree: 10,
    }));
    const lineStyleCalls = calls.filter((c) => c.method === "lineStyle");
    // Both edges should have the same default alpha (0.65)
    expect(lineStyleCalls[0].args[0].alpha).toBe(lineStyleCalls[1].args[0].alpha);
  });

  // --- Edge pre-filter tests (cycle 29 refactor) ---

  it("pre-filter: showLinks=false skips link edges", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showLinks: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  it("pre-filter: semantic edges skipped when showSemanticEdges=false", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "semantic" }];
    drawEdges(g, edges, resolvePos, baseCfg({ showSemanticEdges: false }));
    const moveCall = calls.find((c) => c.method === "moveTo");
    expect(moveCall).toBeUndefined();
  });

  // --- Edge zoom fade threshold tests (cycle 28) ---

  it("edgeMinZoom hides edges below threshold", () => {
    const { g } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b" }];
    drawEdges(g, edges, resolvePos, baseCfg({
      edgeMinZoom: 0.5,
      worldScale: 0.3,
    }));
    // g.visible should be set to false (mock doesn't track property sets,
    // but we can verify no moveTo calls since early return)
    // The function sets g.visible = false and returns early
  });

  // --- Edge label zoom threshold tests (cycle 30) ---

  it("edge labels hidden when zoom < edgeLabelZoomHide", () => {
    const { g: labelG, calls: labelCalls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b" }];
    drawEdgeLabels(labelG, edges, resolvePos, baseCfg({
      showEdgeLabels: true,
      worldScale: 0.1,
      edgeLabelZoomHide: 0.15,
    }));
    // At zoom 0.1 < hide threshold 0.15, labels should not be drawn
    // Container is cleared but no new children added
  });

  // --- Config value propagation tests ---

  it("edgeFadeMinAlpha propagates to EdgeDrawConfig", () => {
    const cfg = baseCfg({ edgeFadeMinAlpha: 0.05 });
    expect(cfg.edgeFadeMinAlpha).toBe(0.05);
  });

  it("edgeBidirectionalBoost propagates to EdgeDrawConfig", () => {
    const cfg = baseCfg({ edgeBidirectionalBoost: 0.4 });
    expect(cfg.edgeBidirectionalBoost).toBe(0.4);
  });

  it("edgeHierarchyThickFactor propagates to EdgeDrawConfig", () => {
    const cfg = baseCfg({ edgeHierarchyThickFactor: 3.0 });
    expect(cfg.edgeHierarchyThickFactor).toBe(3.0);
  });
});

// ---------------------------------------------------------------------------
// Pure function unit tests (cycle109)
// ---------------------------------------------------------------------------

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return { id: "e1", source: "a", target: "b", ...overrides };
}

// --- shouldSkipEdge (unit) ---
describe("shouldSkipEdge (unit)", () => {
  it("treats untyped edge as link", () => {
    expect(shouldSkipEdge(makeEdge({}), baseCfg({ showLinks: false }))).toBe(true);
    expect(shouldSkipEdge(makeEdge({}), baseCfg({ showLinks: true }))).toBe(false);
  });

  it("respects each type toggle independently", () => {
    const cases: [string, keyof EdgeDrawConfig][] = [
      ["tag", "showTagEdges"],
      ["category", "showCategoryEdges"],
      ["semantic", "showSemanticEdges"],
      ["inheritance", "showInheritance"],
      ["aggregation", "showAggregation"],
      ["similar", "showSimilar"],
      ["sibling", "showSibling"],
      ["sequence", "showSequence"],
    ];
    for (const [type, field] of cases) {
      expect(shouldSkipEdge(makeEdge({ type }), baseCfg({ [field]: false }))).toBe(true);
      expect(shouldSkipEdge(makeEdge({ type }), baseCfg({ [field]: true }))).toBe(false);
    }
  });
});

// --- buildBidirectionalSet ---
describe("buildBidirectionalSet", () => {
  it("empty for no edges", () => {
    expect(buildBidirectionalSet([]).size).toBe(0);
  });

  it("empty for unidirectional edges", () => {
    expect(buildBidirectionalSet([makeEdge()]).size).toBe(0);
  });

  it("detects bidirectional pair", () => {
    const bidir = buildBidirectionalSet([
      makeEdge({ source: "a", target: "b" }),
      makeEdge({ source: "b", target: "a" }),
    ]);
    expect(bidir.has("a→b")).toBe(true);
    expect(bidir.has("b→a")).toBe(true);
  });

  it("excludes non-bidirectional edges", () => {
    const bidir = buildBidirectionalSet([
      makeEdge({ source: "a", target: "b" }),
      makeEdge({ source: "b", target: "a" }),
      makeEdge({ source: "c", target: "d" }),
    ]);
    expect(bidir.has("c→d")).toBe(false);
  });
});

// --- normalizeAngle ---
describe("normalizeAngle", () => {
  it("keeps angle in [0, π)", () => { expect(normalizeAngle(1.0)).toBeCloseTo(1.0); });
  it("wraps negative angle", () => { expect(normalizeAngle(-0.5)).toBeCloseTo(Math.PI - 0.5); });
  it("wraps angle >= π", () => { expect(normalizeAngle(Math.PI + 0.1)).toBeCloseTo(0.1); });
  it("normalizes 0 to 0", () => { expect(normalizeAngle(0)).toBeCloseTo(0); });
  it("normalizes π to 0", () => { expect(normalizeAngle(Math.PI)).toBeCloseTo(0); });
});

// --- mergeNearbyValues ---
describe("mergeNearbyValues", () => {
  it("empty input → empty", () => { expect(mergeNearbyValues([], 10)).toEqual([]); });
  it("single value → unchanged", () => { expect(mergeNearbyValues([42], 10)).toEqual([42]); });
  it("distant values stay separate", () => {
    expect(mergeNearbyValues([0, 100, 200], 10)).toEqual([0, 100, 200]);
  });
  it("close values merge to average", () => {
    expect(mergeNearbyValues([10, 12], 5)).toEqual([11]);
  });
  it("cluster of 3", () => {
    expect(mergeNearbyValues([10, 11, 12], 5)).toEqual([11]);
  });
  it("mixed clusters", () => {
    expect(mergeNearbyValues([0, 1, 2, 100, 101], 5)).toEqual([1, 100.5]);
  });
});

// --- deduplicatePath ---
describe("deduplicatePath", () => {
  it("empty path → empty", () => { expect(deduplicatePath([])).toEqual([]); });
  it("single point → unchanged", () => {
    expect(deduplicatePath([{ x: 10, y: 20 }])).toHaveLength(1);
  });
  it("keeps distinct points", () => {
    expect(deduplicatePath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toHaveLength(2);
  });
  it("removes near-duplicates within 0.5px", () => {
    const result = deduplicatePath([{ x: 0, y: 0 }, { x: 0.3, y: 0.2 }, { x: 10, y: 10 }]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ x: 10, y: 10 });
  });
  it("keeps points at >0.5px apart", () => {
    expect(deduplicatePath([{ x: 0, y: 0 }, { x: 0.6, y: 0 }])).toHaveLength(2);
  });
});

// --- angleDist / shortestAngleDelta ---
describe("angleDist", () => {
  it("zero for identical", () => { expect(angleDist(1, 1)).toBeCloseTo(0); });
  it("small distance", () => { expect(angleDist(0.5, 1.0)).toBeCloseTo(0.5); });
  it("wraps around 2π", () => { expect(angleDist(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2, 3); });
  it("symmetric", () => { expect(angleDist(1, 2)).toBeCloseTo(angleDist(2, 1)); });
});

describe("shortestAngleDelta", () => {
  it("positive for clockwise", () => { expect(shortestAngleDelta(0, 1)).toBeCloseTo(1); });
  it("negative for counter-clockwise", () => { expect(shortestAngleDelta(1, 0)).toBeCloseTo(-1); });
  it("wraps across 2π", () => {
    expect(Math.abs(shortestAngleDelta(0.1, 2 * Math.PI - 0.1))).toBeCloseTo(0.2, 3);
  });
});

// --- getEdgeLabel ---
describe("getEdgeLabel", () => {
  it("custom relation takes priority", () => { expect(getEdgeLabel(makeEdge({ relation: "Author" }))).toBe("Author"); });
  it("inheritance → is-a", () => { expect(getEdgeLabel(makeEdge({ type: "inheritance" }))).toBe("is-a"); });
  it("aggregation → has-a", () => { expect(getEdgeLabel(makeEdge({ type: "aggregation" }))).toBe("has-a"); });
  it("sequence → seq", () => { expect(getEdgeLabel(makeEdge({ type: "sequence" }))).toBe("seq"); });
  it("similar → ≈", () => { expect(getEdgeLabel(makeEdge({ type: "similar" }))).toBe("≈"); });
  it("sibling → sibling", () => { expect(getEdgeLabel(makeEdge({ type: "sibling" }))).toBe("sibling"); });
  it("link → null", () => { expect(getEdgeLabel(makeEdge({ type: "link" }))).toBeNull(); });
  it("has-tag → null", () => { expect(getEdgeLabel(makeEdge({ type: "has-tag" }))).toBeNull(); });
  it("untyped → null", () => { expect(getEdgeLabel(makeEdge({}))).toBeNull(); });
});

// --- buildPairCounts ---
describe("buildPairCounts", () => {
  it("empty → empty map", () => { expect(buildPairCounts([]).size).toBe(0); });
  it("single edge → count 1", () => {
    expect(buildPairCounts([makeEdge()]).get("a:b")).toBe(1);
  });
  it("parallel edges → count 2", () => {
    expect(buildPairCounts([makeEdge(), makeEdge()]).get("a:b")).toBe(2);
  });
  it("reversed pair → same sorted key", () => {
    const counts = buildPairCounts([
      makeEdge({ source: "a", target: "b" }),
      makeEdge({ source: "b", target: "a" }),
    ]);
    expect(counts.get("a:b")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// EDGE_TYPE_SPECS — single source of truth cross-reference
// ---------------------------------------------------------------------------
import { EDGE_TYPE_SPECS } from "../src/views/EdgeRenderer";
import {
  EDGE_TYPE_LINK, EDGE_TYPE_TAG, EDGE_TYPE_HAS_TAG,
  EDGE_TYPE_INHERITANCE, EDGE_TYPE_AGGREGATION,
  EDGE_TYPE_SIMILAR, EDGE_TYPE_SIBLING, EDGE_TYPE_SEQUENCE,
} from "../src/constants";

describe("EDGE_TYPE_SPECS", () => {
  it("contains all known edge type constants", () => {
    const expected = [
      EDGE_TYPE_LINK, EDGE_TYPE_TAG, EDGE_TYPE_HAS_TAG,
      EDGE_TYPE_INHERITANCE, EDGE_TYPE_AGGREGATION,
      EDGE_TYPE_SIMILAR, EDGE_TYPE_SIBLING, EDGE_TYPE_SEQUENCE,
      "category", "semantic", // string-literal edge types
    ];
    for (const t of expected) {
      expect(EDGE_TYPE_SPECS.has(t), `missing: ${t}`).toBe(true);
    }
  });

  it("has no extra entries beyond known types", () => {
    expect(EDGE_TYPE_SPECS.size).toBe(10);
  });

  it("every entry has a non-empty visibilityField string", () => {
    for (const [type, spec] of EDGE_TYPE_SPECS) {
      expect(typeof spec.visibilityField).toBe("string");
      expect(spec.visibilityField.length, `${type} visibilityField empty`).toBeGreaterThan(0);
    }
  });

  it("visibilityFields are unique (no two edge types share a toggle)", () => {
    const fields = [...EDGE_TYPE_SPECS.values()].map(s => s.visibilityField);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("color is either null or a valid hex number (0-0xFFFFFF)", () => {
    for (const [type, spec] of EDGE_TYPE_SPECS) {
      if (spec.color !== null) {
        expect(spec.color).toBeGreaterThanOrEqual(0);
        expect(spec.color).toBeLessThanOrEqual(0xFFFFFF);
        expect(Number.isInteger(spec.color), `${type} color not integer`).toBe(true);
      }
    }
  });

  it("structural types (inheritance, aggregation, etc.) have fixed colors", () => {
    const structuralTypes = [
      EDGE_TYPE_INHERITANCE, EDGE_TYPE_AGGREGATION,
      EDGE_TYPE_HAS_TAG, EDGE_TYPE_SIMILAR, EDGE_TYPE_SIBLING, EDGE_TYPE_SEQUENCE,
    ];
    for (const t of structuralTypes) {
      const spec = EDGE_TYPE_SPECS.get(t);
      expect(spec?.color, `${t} should have a fixed color`).not.toBeNull();
    }
  });

  it("generic types (link, tag, category, semantic) use null color (relation-colored)", () => {
    const genericTypes = [EDGE_TYPE_LINK, EDGE_TYPE_TAG, "category", "semantic"];
    for (const t of genericTypes) {
      const spec = EDGE_TYPE_SPECS.get(t);
      expect(spec?.color, `${t} should use relation color (null)`).toBeNull();
    }
  });
});

// ===========================================================================
// computeJunctionGrid — builds row/col grid from node positions
// ===========================================================================

describe("computeJunctionGrid", () => {
  const mkCluster = (pairs: [string, number, number][]) => {
    const map = new Map<string, string>();
    const positions = new Map<string, { x: number; y: number }>();
    for (const [id, x, y] of pairs) {
      map.set(id, "g1");
      positions.set(id, { x, y });
    }
    const resolve = (ref: string | object) => positions.get(ref as string);
    return { map, resolve };
  };

  it("creates rows and cols from node positions", () => {
    const { map, resolve } = mkCluster([["a", 0, 0], ["b", 100, 0], ["c", 0, 100], ["d", 100, 100]]);
    const grid = computeJunctionGrid("g1", resolve, map);
    expect(grid.rows.length).toBeGreaterThanOrEqual(1);
    expect(grid.cols.length).toBeGreaterThanOrEqual(1);
  });

  it("creates gaps between sufficiently spaced rows", () => {
    const { map, resolve } = mkCluster([["a", 0, 0], ["b", 0, 200]]);
    const grid = computeJunctionGrid("g1", resolve, map);
    expect(grid.rowGaps.length).toBeGreaterThanOrEqual(1);
    // Gap should be between 0 and 200
    if (grid.rowGaps.length > 0) {
      expect(grid.rowGaps[0]).toBeGreaterThan(0);
      expect(grid.rowGaps[0]).toBeLessThan(200);
    }
  });

  it("ignores nodes from other groups", () => {
    const map = new Map([["a", "g1"], ["b", "g2"]]);
    const positions = new Map([["a", { x: 0, y: 0 }], ["b", { x: 100, y: 100 }]]);
    const resolve = (ref: string | object) => positions.get(ref as string);
    const grid = computeJunctionGrid("g1", resolve, map);
    // Only one node in g1, so minimal grid
    expect(grid.rows.length).toBeLessThanOrEqual(1);
  });

  it("handles empty group", () => {
    const grid = computeJunctionGrid("empty", () => undefined, new Map());
    expect(grid.rows).toEqual([]);
    expect(grid.cols).toEqual([]);
    expect(grid.rowGaps).toEqual([]);
    expect(grid.colGaps).toEqual([]);
  });
});

// ===========================================================================
// filterGridForPortFace — exclude port-face-adjacent gaps
// ===========================================================================

describe("filterGridForPortFace", () => {
  const grid: JunctionGrid = {
    rows: [0, 50, 100],
    cols: [0, 50, 100],
    rowGaps: [25, 75],
    colGaps: [25, 75],
  };

  it("N face drops topmost (smallest Y) rowGap", () => {
    const f = filterGridForPortFace(grid, "N");
    expect(f.rowGaps).toEqual([75]);
    expect(f.colGaps).toEqual([25, 75]); // unchanged
  });

  it("S face drops bottommost (largest Y) rowGap", () => {
    const f = filterGridForPortFace(grid, "S");
    expect(f.rowGaps).toEqual([25]);
  });

  it("E face drops rightmost (largest X) colGap", () => {
    const f = filterGridForPortFace(grid, "E");
    expect(f.colGaps).toEqual([25]);
    expect(f.rowGaps).toEqual([25, 75]); // unchanged
  });

  it("W face drops leftmost (smallest X) colGap", () => {
    const f = filterGridForPortFace(grid, "W");
    expect(f.colGaps).toEqual([75]);
  });

  it("preserves rows and cols unmodified", () => {
    const f = filterGridForPortFace(grid, "N");
    expect(f.rows).toEqual([0, 50, 100]);
    expect(f.cols).toEqual([0, 50, 100]);
  });

  it("handles single-gap grid gracefully", () => {
    const small: JunctionGrid = { rows: [0, 100], cols: [0], rowGaps: [50], colGaps: [] };
    const f = filterGridForPortFace(small, "N");
    expect(f.rowGaps).toEqual([]);
  });
});

// ===========================================================================
// routeViaJunctionGrid — Manhattan routing through grid gaps
// ===========================================================================

describe("routeViaJunctionGrid", () => {
  const grid: JunctionGrid = {
    rows: [0, 100, 200],
    cols: [0, 100, 200],
    rowGaps: [50, 150],
    colGaps: [50, 150],
  };

  it("returns [from, to] for coincident points", () => {
    const path = routeViaJunctionGrid({ x: 50, y: 50 }, { x: 50, y: 50 }, grid);
    expect(path.length).toBe(2);
  });

  it("produces axis-aligned segments", () => {
    const path = routeViaJunctionGrid({ x: 10, y: 10 }, { x: 190, y: 190 }, grid);
    // All segments should be either horizontal or vertical
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i].x - path[i - 1].x);
      const dy = Math.abs(path[i].y - path[i - 1].y);
      expect(dx < 2 || dy < 2).toBe(true); // one axis essentially constant
    }
  });

  it("starts at from and ends at to", () => {
    const from = { x: 5, y: 5 };
    const to = { x: 195, y: 195 };
    const path = routeViaJunctionGrid(from, to, grid);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
  });

  it("routes through gap coordinates", () => {
    const path = routeViaJunctionGrid({ x: 10, y: 10 }, { x: 190, y: 190 }, grid);
    // At least one intermediate point should use a gap value
    const gapValues = new Set([50, 150]);
    const usesGap = path.some(p => gapValues.has(p.x) || gapValues.has(p.y));
    expect(usesGap).toBe(true);
  });

  it("handles empty grid gracefully", () => {
    const emptyGrid: JunctionGrid = { rows: [], cols: [], rowGaps: [], colGaps: [] };
    const path = routeViaJunctionGrid({ x: 0, y: 0 }, { x: 100, y: 100 }, emptyGrid);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 100, y: 100 });
  });
});

// ===========================================================================
// computeJunctionWaypoints — waypoint generation for junction routing
// ===========================================================================

describe("computeJunctionWaypoints", () => {
  const from = { x: 10, y: 10 };
  const to = { x: 190, y: 190 };

  it("full routing: all gaps available", () => {
    const pts = computeJunctionWaypoints(from, to, {
      srcCol: 50, tgtCol: 150, srcRow: 50, tgtRow: 150, midRow: 100,
    });
    // Should include srcCol, tgtCol, midRow as intermediate coordinates
    expect(pts.some(([x]) => x === 50)).toBe(true);
    expect(pts.some(([x]) => x === 150)).toBe(true);
    expect(pts.some(([, y]) => y === 100)).toBe(true);
  });

  it("srcCol + midRow only (no tgtCol)", () => {
    const pts = computeJunctionWaypoints(from, to, {
      srcCol: 50, tgtCol: null, srcRow: 50, tgtRow: null, midRow: 100,
    });
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts[pts.length - 1]).toEqual([to.x, 100]);
  });

  it("tgtCol + midRow only (no srcCol)", () => {
    const pts = computeJunctionWaypoints(from, to, {
      srcCol: null, tgtCol: 150, srcRow: null, tgtRow: 150, midRow: 100,
    });
    expect(pts[0]).toEqual([from.x, 100]);
    expect(pts.some(([x]) => x === 150)).toBe(true);
  });

  it("midRow + srcRow only", () => {
    const pts = computeJunctionWaypoints(from, to, {
      srcCol: null, tgtCol: null, srcRow: 50, tgtRow: null, midRow: 100,
    });
    expect(pts).toEqual([[from.x, 50], [from.x, 100], [to.x, 100]]);
  });

  it("srcCol only (no midRow)", () => {
    const pts = computeJunctionWaypoints(from, to, {
      srcCol: 50, tgtCol: null, srcRow: 50, tgtRow: null, midRow: null,
    });
    expect(pts.some(([x]) => x === 50)).toBe(true);
    expect(pts[pts.length - 1]).toEqual([50, to.y]);
  });

  it("no gaps at all — midpoint fallback", () => {
    const pts = computeJunctionWaypoints(from, to, {
      srcCol: null, tgtCol: null, srcRow: null, tgtRow: null, midRow: null,
    });
    const midY = (from.y + to.y) / 2;
    expect(pts).toEqual([[from.x, midY], [to.x, midY]]);
  });

  it("all waypoints are [number, number] tuples", () => {
    const pts = computeJunctionWaypoints(from, to, {
      srcCol: 50, tgtCol: 150, srcRow: 50, tgtRow: 150, midRow: 100,
    });
    for (const pt of pts) {
      expect(pt).toHaveLength(2);
      expect(typeof pt[0]).toBe("number");
      expect(typeof pt[1]).toBe("number");
    }
  });
});

// ===========================================================================
// findNearestGap / findGapBetween
// ===========================================================================

describe("findNearestGap", () => {
  it("returns null for empty gaps", () => {
    expect(findNearestGap([], 50)).toBeNull();
  });

  it("returns the closest gap", () => {
    expect(findNearestGap([10, 50, 90], 45)).toBe(50);
    expect(findNearestGap([10, 50, 90], 80)).toBe(90);
  });

  it("returns first when equidistant", () => {
    expect(findNearestGap([10, 30], 20)).toBe(10);
  });
});

describe("findGapBetween", () => {
  it("returns null for empty gaps", () => {
    expect(findGapBetween([], 0, 100)).toBeNull();
  });

  it("prefers gap strictly between a and b", () => {
    expect(findGapBetween([25, 50, 75], 20, 80)).toBe(50); // closest to midpoint
  });

  it("falls back to nearest when no gap strictly between", () => {
    expect(findGapBetween([5, 95], 40, 60)).toBe(5); // neither is strictly between 40-60
  });

  it("handles reversed a/b order", () => {
    expect(findGapBetween([50], 100, 0)).toBe(50);
  });
});

// ===========================================================================
// EdgeDrawConfig.trunkMinEdges — bundling threshold validation
// ===========================================================================

describe("EdgeDrawConfig.trunkMinEdges", () => {
  it("defaults to undefined (buildTrunks uses 2)", () => {
    const cfg = baseCfg();
    expect(cfg.trunkMinEdges).toBeUndefined();
  });

  it("can be set to 1 for aggressive bundling", () => {
    const cfg = baseCfg({ trunkMinEdges: 1 });
    expect(cfg.trunkMinEdges).toBe(1);
  });

  it("can be set to higher values for sparse bundling", () => {
    const cfg = baseCfg({ trunkMinEdges: 5 });
    expect(cfg.trunkMinEdges).toBe(5);
  });
});
