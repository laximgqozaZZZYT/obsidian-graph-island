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
    linkThickness: 1,
    showInheritance: true,
    showAggregation: true,
    showTagNodes: true,
    showSimilar: true,
    colorEdgesByRelation: false,
    isArcLayout: false,
    highlightedNodeId: null,
    bgColor: 0x1e1e2e,
    relationColors: new Map(),
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
    const lineCall = calls.find((c) => c.method === "lineTo");
    expect(moveCall).toBeDefined();
    expect(lineCall).toBeDefined();
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

  it("draws dotted line for similar edges", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "similar" }];
    drawEdges(g, edges, resolvePos, baseCfg());
    // Dotted line produces multiple moveTo/lineTo pairs (dash segments)
    const moveCalls = calls.filter((c) => c.method === "moveTo");
    expect(moveCalls.length).toBeGreaterThan(1);
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
    drawEdges(g, edges, resolvePos, baseCfg({ highlightedNodeId: "a" }));
    // lineStyle is called for each edge — the first should have alpha=1, the second alpha=0.04
    const lineStyleCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineStyleCalls.length).toBe(2);
    // First edge (a→b) should have alpha=1
    expect(lineStyleCalls[0].args[2]).toBe(1);
    // Second edge (b→c) should have alpha=0.04
    expect(lineStyleCalls[1].args[2]).toBe(0.04);
  });

  it("uses relation colors when colorEdgesByRelation is true", () => {
    const { g, calls } = createMockGraphics();
    const edges: GraphEdge[] = [{ source: "a", target: "b", relation: "loves" }];
    const relationColors = new Map([["loves", "#ff0000"]]);
    drawEdges(g, edges, resolvePos, baseCfg({ colorEdgesByRelation: true, relationColors }));
    const lineStyleCall = calls.find((c) => c.method === "lineStyle");
    // 0xff0000
    expect(lineStyleCall?.args[1]).toBe(0xff0000);
  });
});
