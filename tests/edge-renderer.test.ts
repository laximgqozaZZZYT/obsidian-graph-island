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

import { drawEdges, type EdgeDrawConfig } from "../src/views/EdgeRenderer";
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
    const edges: GraphEdge[] = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    drawEdges(g, edges, resolvePos, baseCfg({ highlightedNodeId: "a", highlightSet: new Set(["a", "b"]) }));
    // lineStyle is called with an options object for each edge
    const lineStyleCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineStyleCalls.length).toBe(2);
    // First edge (a→b) should have alpha=1
    expect(lineStyleCalls[0].args[0].alpha).toBe(1);
    // Second edge (b→c) should have alpha=0.08
    expect(lineStyleCalls[1].args[0].alpha).toBe(0.08);
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
});
