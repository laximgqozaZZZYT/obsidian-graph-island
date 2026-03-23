import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getBestRoadNetwork } from "../src/layouts/RoadNetworkBuilder";
import type { RoadNetwork } from "../src/layouts/cable-tray";

// Provide `window` for Node.js test environment (RoadNetworkBuilder uses window.__gi_bestRoadNetwork)
const _origWindow = (globalThis as any).window;
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}
afterAll(() => {
  if (_origWindow === undefined) delete (globalThis as any).window;
  else (globalThis as any).window = _origWindow;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNetwork(intersectionCount: number): RoadNetwork {
  const intersections = Array.from({ length: intersectionCount }, (_, i) => ({
    id: i,
    x: i * 10,
    y: 0,
    label: `i${i}`,
  }));
  return {
    intersections,
    segments: [],
    nodeAccess: new Map(),
    adjacency: new Map(),
    system: "cartesian" as const,
    cx: 0,
    cy: 0,
  };
}

function makeBuilder(network: RoadNetwork | null) {
  return { trayData: network } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getBestRoadNetwork", () => {
  beforeEach(() => {
    // Clear global cache before each test
    delete (globalThis as any).__gi_bestRoadNetwork;
  });

  it("returns null when builder is null and no global cache", () => {
    expect(getBestRoadNetwork(null)).toBeNull();
  });

  it("returns builder trayData when no global cache exists", () => {
    const net = makeNetwork(5);
    const result = getBestRoadNetwork(makeBuilder(net));
    expect(result).toBe(net);
  });

  it("returns global cache when builder is null", () => {
    const cached = makeNetwork(3);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    expect(getBestRoadNetwork(null)).toBe(cached);
  });

  it("returns global cache when it has more intersections", () => {
    const cached = makeNetwork(10);
    const inst = makeNetwork(5);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    expect(getBestRoadNetwork(makeBuilder(inst))).toBe(cached);
  });

  it("returns global cache when intersection counts are equal (>= comparison)", () => {
    const cached = makeNetwork(5);
    const inst = makeNetwork(5);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    expect(getBestRoadNetwork(makeBuilder(inst))).toBe(cached);
  });

  it("returns builder trayData when it has more intersections", () => {
    const cached = makeNetwork(3);
    const inst = makeNetwork(8);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    expect(getBestRoadNetwork(makeBuilder(inst))).toBe(inst);
  });

  it("returns builder trayData when builder.trayData is null", () => {
    const cached = makeNetwork(4);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    expect(getBestRoadNetwork(makeBuilder(null))).toBe(cached);
  });

  it("returns null when both sources are null", () => {
    expect(getBestRoadNetwork(makeBuilder(null))).toBeNull();
  });
});
