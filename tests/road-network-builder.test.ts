import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { RoadNetworkBuilder, getBestRoadNetwork, type RoadNetworkHost } from "../src/layouts/RoadNetworkBuilder";
import type { RoadNetwork } from "../src/layouts/cable-tray";
import type { GraphNode, GraphEdge } from "../src/types";

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
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, x: number, y: number): GraphNode {
  return { id, label: id, x, y, radius: 5, tags: [] } as GraphNode;
}

function makeHost(opts: {
  nodes?: GraphNode[];
  arrangement?: string;
  groupArrangement?: string;
} = {}): RoadNetworkHost {
  const nodes = opts.nodes ?? [];
  const pixiNodes = new Map(nodes.map(n => [n.id, { data: n }]));
  return {
    pixiNodes,
    clusterMeta: null,
    panel: {
      clusterArrangement: opts.arrangement ?? "force",
      clusterGroupArrangement: opts.groupArrangement ?? "grid",
    },
    getSimulation: () => null,
    computeNodeBounds: (ns: GraphNode[]) => {
      let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
      for (const n of ns) {
        xMin = Math.min(xMin, n.x);
        yMin = Math.min(yMin, n.y);
        xMax = Math.max(xMax, n.x);
        yMax = Math.max(yMax, n.y);
      }
      return { xMin, yMin, xMax, yMax };
    },
  };
}

// ---------------------------------------------------------------------------
// RoadNetworkBuilder — constructor & initial state
// ---------------------------------------------------------------------------
describe("RoadNetworkBuilder", () => {
  beforeEach(() => {
    delete (globalThis as any).__gi_bestRoadNetwork;
  });

  it("starts with null trayData", () => {
    const builder = new RoadNetworkBuilder(makeHost());
    expect(builder.trayData).toBeNull();
  });

  it("starts not finalized and not drawn", () => {
    const builder = new RoadNetworkBuilder(makeHost());
    expect(builder.finalized).toBe(false);
    expect(builder.roadDrawn).toBe(false);
  });

  it("starts with _lastRoadWidth=0", () => {
    const builder = new RoadNetworkBuilder(makeHost());
    expect(builder._lastRoadWidth).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// rebuild
// ---------------------------------------------------------------------------
describe("RoadNetworkBuilder.rebuild", () => {
  beforeEach(() => {
    delete (globalThis as any).__gi_bestRoadNetwork;
  });

  it("does nothing when no clusterMeta", () => {
    const builder = new RoadNetworkBuilder(makeHost());
    builder.rebuild();
    expect(builder.trayData).toBeNull();
  });

  it("skips rebuild when finalized and not final", () => {
    const builder = new RoadNetworkBuilder(makeHost());
    builder.finalized = true;
    builder.rebuild(false); // not final → early return
    expect(builder.trayData).toBeNull();
  });

  it("rebuilds when finalized and final=true", () => {
    const host = makeHost({ nodes: [makeNode("a", 100, 100)] });
    host.clusterMeta = {
      clusterCentroids: new Map(),
      groupGuides: [],
    } as any;
    const builder = new RoadNetworkBuilder(host);
    builder.finalized = true;
    // final=true forces rebuild even when finalized
    builder.rebuild(true);
    expect(builder.finalized).toBe(true);
  });

  it("sets finalized=true when final=true", () => {
    const host = makeHost();
    host.clusterMeta = { clusterCentroids: new Map(), groupGuides: [] } as any;
    const builder = new RoadNetworkBuilder(host);
    builder.rebuild(true);
    expect(builder.finalized).toBe(true);
  });

  it("invalidates roadDrawn after rebuild", () => {
    const host = makeHost({ nodes: [makeNode("a", 50, 50)] });
    host.clusterMeta = { clusterCentroids: new Map(), groupGuides: [] } as any;
    const builder = new RoadNetworkBuilder(host);
    builder.roadDrawn = true;
    builder.rebuild();
    expect(builder.roadDrawn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------
describe("RoadNetworkBuilder.reset", () => {
  it("resets finalized and roadDrawn flags", () => {
    const builder = new RoadNetworkBuilder(makeHost());
    builder.finalized = true;
    builder.roadDrawn = true;
    builder.reset();
    expect(builder.finalized).toBe(false);
    expect(builder.roadDrawn).toBe(false);
  });

  it("preserves trayData after reset", () => {
    const builder = new RoadNetworkBuilder(makeHost());
    const fakeTray = {
      intersections: [{ id: 0, x: 0, y: 0, label: "i0" }],
      segments: [],
      nodeAccess: new Map(),
      adjacency: new Map(),
      system: "cartesian" as const,
      cx: 0, cy: 0,
    } as RoadNetwork;
    builder.trayData = fakeTray;
    builder.reset();
    expect(builder.trayData).toBe(fakeTray);
  });
});

// ---------------------------------------------------------------------------
// finish
// ---------------------------------------------------------------------------
describe("RoadNetworkBuilder.finish", () => {
  beforeEach(() => {
    delete (globalThis as any).__gi_bestRoadNetwork;
  });

  it("does nothing when trayData is null", () => {
    const host = makeHost();
    const builder = new RoadNetworkBuilder(host);
    builder.finish([makeNode("a", 0, 0)]);
    // No error should be thrown
    expect(builder.trayData).toBeNull();
  });

  it("re-maps nodes to nearest intersection after trunk roads", () => {
    const host = makeHost();
    host.clusterMeta = {
      clusterCentroids: new Map([
        ["g1", { x: 0, y: 0 }],
        ["g2", { x: 100, y: 100 }],
      ]),
    } as any;

    const builder = new RoadNetworkBuilder(host);
    const tray: RoadNetwork = {
      intersections: [
        { id: 0, x: 0, y: 0, label: "i0" },
        { id: 1, x: 100, y: 100, label: "i1" },
      ],
      segments: [],
      nodeAccess: new Map(),
      adjacency: new Map(),
      system: "cartesian" as const,
      cx: 50, cy: 50,
    };
    builder.trayData = tray;

    const nodeA = makeNode("a", 10, 10);
    const nodeB = makeNode("b", 90, 90);
    builder.finish([nodeA, nodeB]);

    // "a" should map to intersection 0 (closer), "b" to intersection 1
    expect(tray.nodeAccess.get("a")).toBe(0);
    expect(tray.nodeAccess.get("b")).toBe(1);
  });

  it("updates global cache when denser than existing", () => {
    const host = makeHost();
    const builder = new RoadNetworkBuilder(host);
    const tray: RoadNetwork = {
      intersections: [
        { id: 0, x: 0, y: 0, label: "i0" },
        { id: 1, x: 10, y: 0, label: "i1" },
        { id: 2, x: 20, y: 0, label: "i2" },
      ],
      segments: [],
      nodeAccess: new Map(),
      adjacency: new Map(),
      system: "cartesian" as const,
      cx: 0, cy: 0,
    };
    builder.trayData = tray;
    builder.finish([]);

    expect(getBestRoadNetwork(null)).toBe(tray);
  });
});

// ---------------------------------------------------------------------------
// getBestRoadNetwork (extended)
// ---------------------------------------------------------------------------
describe("getBestRoadNetwork — extended", () => {
  beforeEach(() => {
    delete (globalThis as any).__gi_bestRoadNetwork;
  });

  it("returns null when both builder.trayData and global cache are null", () => {
    const result = getBestRoadNetwork({ trayData: null } as any);
    expect(result).toBeNull();
  });

  it("prefers global cache with equal intersections (>= comparison)", () => {
    const cached: RoadNetwork = {
      intersections: [{ id: 0, x: 0, y: 0, label: "cached" }],
      segments: [], nodeAccess: new Map(), adjacency: new Map(),
      system: "cartesian" as const, cx: 0, cy: 0,
    };
    const inst: RoadNetwork = {
      intersections: [{ id: 0, x: 0, y: 0, label: "inst" }],
      segments: [], nodeAccess: new Map(), adjacency: new Map(),
      system: "cartesian" as const, cx: 0, cy: 0,
    };
    (globalThis as any).__gi_bestRoadNetwork = cached;
    const result = getBestRoadNetwork({ trayData: inst } as any);
    expect(result).toBe(cached);
  });

  it("prefers instance when it has more intersections", () => {
    const cached: RoadNetwork = {
      intersections: [{ id: 0, x: 0, y: 0, label: "c" }],
      segments: [], nodeAccess: new Map(), adjacency: new Map(),
      system: "cartesian" as const, cx: 0, cy: 0,
    };
    const inst: RoadNetwork = {
      intersections: [
        { id: 0, x: 0, y: 0, label: "i0" },
        { id: 1, x: 1, y: 0, label: "i1" },
      ],
      segments: [], nodeAccess: new Map(), adjacency: new Map(),
      system: "cartesian" as const, cx: 0, cy: 0,
    };
    (globalThis as any).__gi_bestRoadNetwork = cached;
    const result = getBestRoadNetwork({ trayData: inst } as any);
    expect(result).toBe(inst);
  });
});
