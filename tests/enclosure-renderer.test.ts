import { describe, it, expect, vi } from "vitest";

// Mock PIXI before importing
vi.mock("pixi.js", () => ({
  Text: class MockText {
    x = 0; y = 0; alpha = 1; visible = true; resolution = 1;
    eventMode = "auto";
    cursor = "";
    anchor = { set: vi.fn() };
    scale = { set: vi.fn() };
    on = vi.fn();
    constructor(public text: string, public style: any) {}
  },
}));

function createMockGraphics() {
  const calls: { method: string; args: any[] }[] = [];
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      if (prop === "parent") return { addChild: vi.fn() };
      return (...args: any[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return { g: proxy, calls };
}

import { drawEnclosures, type OverlapCache, type EnclosureConfig } from "../src/views/EnclosureRenderer";
import * as PIXI from "pixi.js";

function baseCfg(overrides?: Partial<EnclosureConfig>): EnclosureConfig {
  return {
    tagDisplay: "enclosure",
    tagMembership: new Map(),
    nodeColorMap: new Map(),
    tagRelPairsCache: new Set(),
    resolvePos: () => undefined,
    worldScale: 1,
    totalNodeCount: 100,
    enclosureMinRatio: 0,
    ...overrides,
  };
}

function makeOverlapCache(): OverlapCache {
  return { frame: 0, counts: new Map() };
}

describe("drawEnclosures", () => {
  it("clears graphics and hides labels when tagDisplay is not enclosure", () => {
    const { g, calls } = createMockGraphics();
    const labels = new Map<string, PIXI.Text>();
    const mockText = new PIXI.Text("test", {});
    labels.set("mytag", mockText as any);

    drawEnclosures(g, labels as any, makeOverlapCache(), baseCfg({ tagDisplay: "node" }));

    expect(calls[0]).toEqual({ method: "clear", args: [] });
    expect((mockText as any).visible).toBe(false);
  });

  it("draws nothing when tagMembership is empty", () => {
    const { g, calls } = createMockGraphics();
    drawEnclosures(g, new Map() as any, makeOverlapCache(), baseCfg());
    // Only clear should be called
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("clear");
  });

  it("draws a circle for single-point tag", () => {
    const { g, calls } = createMockGraphics();
    const membership = new Map([["solo", new Set(["n1"])]]);
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => id === "n1" ? { x: 50, y: 50 } : undefined,
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    const drawCircle = calls.find((c) => c.method === "drawCircle");
    expect(drawCircle).toBeDefined();
    expect(drawCircle!.args[0]).toBe(50); // x
    expect(drawCircle!.args[1]).toBe(50); // y
    expect(drawCircle!.args[2]).toBe(10); // default radius (6) + outlinePad(6) = 6 + max(4, 6×0.5) = 6 + 4
  });

  it("draws a capsule for two-point tag", () => {
    const { g, calls } = createMockGraphics();
    const membership = new Map([["pair", new Set(["n1", "n2"])]]);
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => {
        if (id === "n1") return { x: 0, y: 0 };
        if (id === "n2") return { x: 100, y: 0 };
        return undefined;
      },
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    // Capsule uses moveTo + lineTo + quadraticCurveTo
    const moveCalls = calls.filter((c) => c.method === "moveTo");
    const curveCalls = calls.filter((c) => c.method === "quadraticCurveTo");
    expect(moveCalls.length).toBeGreaterThan(0);
    expect(curveCalls.length).toBeGreaterThan(0);
  });

  it("draws a smooth hull for 3+ point tag", () => {
    const { g, calls } = createMockGraphics();
    const membership = new Map([["tri", new Set(["n1", "n2", "n3"])]]);
    const positions: Record<string, { x: number; y: number }> = {
      n1: { x: 0, y: 0 },
      n2: { x: 100, y: 0 },
      n3: { x: 50, y: 80 },
    };
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => positions[id],
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    // Smooth hull uses quadraticCurveTo
    const curveCalls = calls.filter((c) => c.method === "quadraticCurveTo");
    expect(curveCalls.length).toBeGreaterThan(0);
  });

  it("sorts enclosures large-first (z-order)", () => {
    const { g, calls } = createMockGraphics();
    const membership = new Map([
      ["small", new Set(["s1", "s2", "s3"])],
      ["big", new Set(["b1", "b2", "b3"])],
    ]);
    const positions: Record<string, { x: number; y: number }> = {
      s1: { x: 0, y: 0 }, s2: { x: 10, y: 0 }, s3: { x: 5, y: 5 },
      b1: { x: 0, y: 0 }, b2: { x: 200, y: 0 }, b3: { x: 100, y: 200 },
    };
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => positions[id],
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    // Both should be drawn (two lineStyle calls, one per enclosure)
    const lineCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineCalls.length).toBe(2);
  });

  it("skips tags with no resolvable positions", () => {
    const { g, calls } = createMockGraphics();
    const membership = new Map([["ghost", new Set(["missing1", "missing2"])]]);
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: () => undefined,
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    // No lineStyle calls beyond the initial clear
    const lineCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineCalls.length).toBe(0);
  });

  it("hides enclosures below enclosureMinRatio threshold", () => {
    const { g, calls } = createMockGraphics();
    // 3 nodes in a group, 100 total nodes, threshold 0.05 → need 5 nodes minimum
    const membership = new Map([["small", new Set(["n1", "n2", "n3"])]]);
    const positions: Record<string, { x: number; y: number }> = {
      n1: { x: 0, y: 0 }, n2: { x: 50, y: 0 }, n3: { x: 25, y: 40 },
    };
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => positions[id],
      totalNodeCount: 100,
      enclosureMinRatio: 0.05,
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    // Group has 3 nodes but needs 5 → no drawing
    const lineCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineCalls.length).toBe(0);
  });

  it("shows enclosures meeting enclosureMinRatio threshold", () => {
    const { g, calls } = createMockGraphics();
    // 6 nodes in a group, 100 total, threshold 0.05 → need 5 → shown
    const ids = ["n1", "n2", "n3", "n4", "n5", "n6"];
    const membership = new Map([["big", new Set(ids)]]);
    const positions: Record<string, { x: number; y: number }> = {
      n1: { x: 0, y: 0 }, n2: { x: 50, y: 0 }, n3: { x: 100, y: 0 },
      n4: { x: 0, y: 50 }, n5: { x: 50, y: 50 }, n6: { x: 100, y: 50 },
    };
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => positions[id],
      totalNodeCount: 100,
      enclosureMinRatio: 0.05,
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    const lineCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineCalls.length).toBeGreaterThan(0);
  });

  it("reuses cached overlap counts within 30 frames", () => {
    const cache = makeOverlapCache();
    cache.counts.set("tag1", 3);
    cache.frame = 10; // not yet 30

    const { g } = createMockGraphics();
    const membership = new Map([["tag1", new Set(["n1"])]]);
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => id === "n1" ? { x: 0, y: 0 } : undefined,
    });

    drawEnclosures(g, new Map() as any, cache, cfg);

    // Cache should not have been cleared (frame = 11 now)
    expect(cache.frame).toBe(11);
    expect(cache.counts.get("tag1")).toBe(3);
  });

  it("uses fill + bold labels when zoomed out", () => {
    const { g, calls } = createMockGraphics();
    const membership = new Map([["group", new Set(["n1", "n2", "n3"])]]);
    const positions: Record<string, { x: number; y: number }> = {
      n1: { x: 0, y: 0 }, n2: { x: 100, y: 0 }, n3: { x: 50, y: 80 },
    };
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => positions[id],
      worldScale: 0.2, // zoomed out (below 0.45 threshold)
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    // Should have beginFill for the zoomed-out fill
    const fillCalls = calls.filter((c) => c.method === "beginFill");
    expect(fillCalls.length).toBe(1);
    // Should also have lineStyle for the stroke
    const lineCalls = calls.filter((c) => c.method === "lineStyle");
    expect(lineCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("uses stroke only (no fill) when zoomed in", () => {
    const { g, calls } = createMockGraphics();
    const membership = new Map([["group", new Set(["n1", "n2", "n3"])]]);
    const positions: Record<string, { x: number; y: number }> = {
      n1: { x: 0, y: 0 }, n2: { x: 100, y: 0 }, n3: { x: 50, y: 80 },
    };
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => positions[id],
      worldScale: 1, // zoomed in
    });

    drawEnclosures(g, new Map() as any, makeOverlapCache(), cfg);

    const fillCalls = calls.filter((c) => c.method === "beginFill");
    expect(fillCalls.length).toBe(0);
  });

  it("recomputes overlap counts at frame 30", () => {
    const cache: OverlapCache = { frame: 29, counts: new Map([["stale", 99]]) };

    const { g } = createMockGraphics();
    const membership = new Map([["fresh", new Set(["n1"])]]);
    const cfg = baseCfg({
      tagMembership: membership,
      resolvePos: (id) => id === "n1" ? { x: 0, y: 0 } : undefined,
    });

    drawEnclosures(g, new Map() as any, cache, cfg);

    // Frame counter should reset
    expect(cache.frame).toBe(0);
    // Stale entry should be cleared
    expect(cache.counts.has("stale")).toBe(false);
  });
});
