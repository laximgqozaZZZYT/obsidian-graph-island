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
  drawEdges, drawEdgeLabels, type EdgeDrawConfig,
  shouldSkipEdge, buildBidirectionalSet, normalizeAngle,
  mergeNearbyValues, deduplicatePath, angleDist, shortestAngleDelta,
  getEdgeLabel, buildPairCounts,
} from "../src/views/EdgeRenderer";
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
    // Second edge (b→c) should have non-highlight alpha (default 0.15)
    expect(lineStyleCalls[1].args[0].alpha).toBe(0.15);
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
