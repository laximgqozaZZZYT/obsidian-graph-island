import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { RoadNetworkBuilder, getBestRoadNetwork } from "../src/layouts/RoadNetworkBuilder";
import type { RoadNetwork } from "../src/layouts/cable-tray";
import type { GraphNode } from "../src/types";

// Provide `window` for Node.js test environment
const _origWindow = (globalThis as any).window;
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}
afterAll(() => {
  if (_origWindow === undefined) delete (globalThis as any).window;
  else (globalThis as any).window = _origWindow;
});

// ---------------------------------------------------------------------------
// Mock cable-tray module (avoid pulling in full layout dependencies)
// ---------------------------------------------------------------------------
vi.mock("../src/layouts/cable-tray", () => ({
  buildRoadNetwork: vi.fn(() => ({
    intersections: [{ id: 0, x: 0, y: 0, label: "mock" }],
    segments: [],
    nodeAccess: new Map(),
    adjacency: new Map(),
    system: "cartesian",
    cx: 0,
    cy: 0,
  })),
  buildRoadNetworkFromPhantoms: vi.fn(() => ({
    intersections: [{ id: 0, x: 0, y: 0, label: "phantom" }],
    segments: [],
    nodeAccess: new Map(),
    adjacency: new Map(),
    system: "cartesian",
    cx: 0,
    cy: 0,
  })),
  addTrunkRoads: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string, x: number, y: number): GraphNode {
  return { id, label: id, x, y, vx: 0, vy: 0 };
}

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

function createMockHost(nodes: GraphNode[] = [], clusterMeta: any = null) {
  const pixiNodes = new Map<string, { data: GraphNode }>();
  for (const n of nodes) {
    pixiNodes.set(n.id, { data: n });
  }

  return {
    pixiNodes,
    clusterMeta,
    panel: {
      clusterArrangement: "grid",
      clusterGroupArrangement: "grid",
      renderThresholds: undefined,
    },
    getSimulation: () => null,
    computeNodeBounds: (ns: GraphNode[]) => {
      if (ns.length === 0) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
      let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
      for (const n of ns) {
        if (n.x < xMin) xMin = n.x;
        if (n.y < yMin) yMin = n.y;
        if (n.x > xMax) xMax = n.x;
        if (n.y > yMax) yMax = n.y;
      }
      return { xMin, yMin, xMax, yMax };
    },
  };
}

// ---------------------------------------------------------------------------
// RoadNetworkBuilder class tests
// ---------------------------------------------------------------------------
describe("RoadNetworkBuilder", () => {
  beforeEach(() => {
    delete (globalThis as any).__gi_bestRoadNetwork;
  });

  describe("initial state", () => {
    it("trayData is null initially", () => {
      const builder = new RoadNetworkBuilder(createMockHost() as any);
      expect(builder.trayData).toBeNull();
    });

    it("finalized is false initially", () => {
      const builder = new RoadNetworkBuilder(createMockHost() as any);
      expect(builder.finalized).toBe(false);
    });

    it("roadDrawn is false initially", () => {
      const builder = new RoadNetworkBuilder(createMockHost() as any);
      expect(builder.roadDrawn).toBe(false);
    });

    it("_lastRoadWidth is 0 initially", () => {
      const builder = new RoadNetworkBuilder(createMockHost() as any);
      expect(builder._lastRoadWidth).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears finalized flag", () => {
      const builder = new RoadNetworkBuilder(createMockHost() as any);
      builder.finalized = true;
      builder.reset();
      expect(builder.finalized).toBe(false);
    });

    it("clears roadDrawn flag", () => {
      const builder = new RoadNetworkBuilder(createMockHost() as any);
      builder.roadDrawn = true;
      builder.reset();
      expect(builder.roadDrawn).toBe(false);
    });

    it("preserves trayData", () => {
      const net = makeNetwork(3);
      const builder = new RoadNetworkBuilder(createMockHost() as any);
      builder.trayData = net;
      builder.reset();
      expect(builder.trayData).toBe(net);
    });
  });

  describe("rebuild", () => {
    it("skips rebuild if finalized and not final flag", () => {
      const nodes = [mkNode("A", 100, 100), mkNode("B", 200, 200)];
      const host = createMockHost(nodes, { groupGuides: [] });
      const builder = new RoadNetworkBuilder(host as any);
      builder.finalized = true;
      const existing = makeNetwork(5);
      builder.trayData = existing;
      builder.rebuild(false);
      // trayData should remain unchanged since rebuild was skipped
      expect(builder.trayData).toBe(existing);
    });

    it("rebuilds when final=true even if finalized", () => {
      const nodes = [mkNode("A", 100, 100), mkNode("B", 200, 200)];
      const host = createMockHost(nodes, { groupGuides: [] });
      const builder = new RoadNetworkBuilder(host as any);
      builder.finalized = true;
      builder.rebuild(true);
      expect(builder.finalized).toBe(true);
    });

    it("sets finalized=true when final=true", () => {
      const nodes = [mkNode("A", 100, 100), mkNode("B", 200, 200)];
      const host = createMockHost(nodes, { groupGuides: [] });
      const builder = new RoadNetworkBuilder(host as any);
      builder.rebuild(true);
      expect(builder.finalized).toBe(true);
    });

    it("sets roadDrawn=false after rebuild", () => {
      const nodes = [mkNode("A", 100, 100), mkNode("B", 200, 200)];
      const host = createMockHost(nodes, { groupGuides: [] });
      const builder = new RoadNetworkBuilder(host as any);
      builder.roadDrawn = true;
      builder.rebuild();
      expect(builder.roadDrawn).toBe(false);
    });

    it("does nothing when clusterMeta is null", () => {
      const nodes = [mkNode("A", 100, 100)];
      const host = createMockHost(nodes, null);
      const builder = new RoadNetworkBuilder(host as any);
      builder.rebuild();
      // No trayData produced because _buildInner returns early
      expect(builder.trayData).toBeNull();
    });

    it("does nothing when all nodes are near origin", () => {
      const nodes = [mkNode("A", 0, 0), mkNode("B", 0.5, 0.5)];
      const host = createMockHost(nodes, { groupGuides: [] });
      const builder = new RoadNetworkBuilder(host as any);
      builder.rebuild();
      // Nodes at (0,0) and (0.5,0.5) are filtered out (abs < 1)
      expect(builder.trayData).toBeNull();
    });
  });

  describe("finish", () => {
    it("does nothing when trayData is null", () => {
      const host = createMockHost();
      const builder = new RoadNetworkBuilder(host as any);
      // Should not throw
      builder.finish([mkNode("A", 100, 100)]);
    });

    it("does not call addTrunkRoads when no centroids", () => {
      const host = createMockHost([], { clusterCentroids: null });
      const builder = new RoadNetworkBuilder(host as any);
      builder.trayData = makeNetwork(3);
      builder.finish([mkNode("A", 100, 100)]);
      // Should not throw; addTrunkRoads not called since no centroids
    });

    it("re-maps node access after adding trunk roads", () => {
      const centroids = new Map([
        ["g1", { x: 0, y: 0 }],
        ["g2", { x: 100, y: 0 }],
      ]);
      const host = createMockHost([], { clusterCentroids: centroids });
      const builder = new RoadNetworkBuilder(host as any);
      const net = makeNetwork(3);
      builder.trayData = net;
      builder.finish([mkNode("A", 5, 0)]);
      // After finish, nodeAccess should have an entry for A
      expect(builder.trayData.nodeAccess.has("A")).toBe(true);
    });

    it("skips trunk roads when only 1 centroid", () => {
      const centroids = new Map([["g1", { x: 0, y: 0 }]]);
      const host = createMockHost([], { clusterCentroids: centroids });
      const builder = new RoadNetworkBuilder(host as any);
      builder.trayData = makeNetwork(2);
      builder.finish([mkNode("A", 5, 0)]);
      // Only 1 centroid: trunk roads not added, nodeAccess unchanged
      expect(builder.trayData.nodeAccess.has("A")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getBestRoadNetwork — extended tests
// ---------------------------------------------------------------------------
describe("getBestRoadNetwork (extended)", () => {
  beforeEach(() => {
    delete (globalThis as any).__gi_bestRoadNetwork;
  });

  it("returns null for null builder with null trayData", () => {
    expect(getBestRoadNetwork({ trayData: null } as any)).toBeNull();
  });

  it("prefers cached network when equal size", () => {
    const cached = makeNetwork(5);
    const instance = makeNetwork(5);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    const result = getBestRoadNetwork({ trayData: instance } as any);
    expect(result).toBe(cached);
  });

  it("returns instance when no cache exists", () => {
    const instance = makeNetwork(3);
    const result = getBestRoadNetwork({ trayData: instance } as any);
    expect(result).toBe(instance);
  });

  it("returns cache when cache is larger", () => {
    const cached = makeNetwork(10);
    const instance = makeNetwork(2);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    const result = getBestRoadNetwork({ trayData: instance } as any);
    expect(result).toBe(cached);
  });

  it("returns instance when instance is larger", () => {
    const cached = makeNetwork(2);
    const instance = makeNetwork(10);
    (globalThis as any).__gi_bestRoadNetwork = cached;
    const result = getBestRoadNetwork({ trayData: instance } as any);
    expect(result).toBe(instance);
  });
});
