import { describe, it, expect, beforeEach } from "vitest";
import {
  buildRoadNetwork,
  buildRoadNetworkFromPhantoms,
  routeEdge,
  findShortestPath,
  pathToWaypoints,
  findNearestIntersection,
  cachedFindShortestPath,
  invalidatePathCache,
  type RoadNetworkConfig,
  type RoadNetwork,
} from "../src/layouts/cable-tray";
import type { GraphNode } from "../src/types";

// Mock GraphNode type for testing
const mockNode = (id: string, x: number, y: number): GraphNode => ({
  id,
  label: `Node ${id}`,
  x,
  y,
  type: "file",
});

describe("buildRoadNetwork", () => {
  describe("polar system with rings and spokes", () => {
    it("should generate correct intersections for 3 rings x 6 spokes", () => {
      const cfg: RoadNetworkConfig = {
        system: "polar",
        axis1Lines: [{ position: 10 }, { position: 20 }, { position: 30 }],
        axis2Lines: [
          { position: 0 },
          { position: Math.PI / 3 },
          { position: (2 * Math.PI) / 3 },
          { position: Math.PI },
          { position: (4 * Math.PI) / 3 },
          { position: (5 * Math.PI) / 3 },
        ],
        axis1Shape: "circle",
        axis2Shape: "radial",
        cx: 100,
        cy: 100,
        bounds: { xMin: 0, yMin: 0, xMax: 200, yMax: 200, maxR: 50 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // 1 center + 3 rings × 6 spokes = 19 intersections
      expect(network.intersections).toHaveLength(19);

      // Center intersection at (cx, cy)
      expect(network.intersections[0]).toEqual({ id: 0, x: 100, y: 100 });

      // Check first ring (r=10) coordinates
      const r = 10;
      const theta0 = 0;
      const expectedX = cfg.cx + r * Math.cos(theta0);
      const expectedY = cfg.cy + r * Math.sin(theta0);
      expect(network.intersections[1]).toEqual({
        id: 1,
        x: expectedX,
        y: expectedY,
      });
    });

    it("should generate correct segments for 3 rings x 6 spokes", () => {
      const cfg: RoadNetworkConfig = {
        system: "polar",
        axis1Lines: [{ position: 10 }, { position: 20 }, { position: 30 }],
        axis2Lines: [
          { position: 0 },
          { position: Math.PI / 3 },
          { position: (2 * Math.PI) / 3 },
          { position: Math.PI },
          { position: (4 * Math.PI) / 3 },
          { position: (5 * Math.PI) / 3 },
        ],
        axis1Shape: "circle",
        axis2Shape: "radial",
        cx: 100,
        cy: 100,
        bounds: { xMin: 0, yMin: 0, xMax: 200, yMax: 200, maxR: 50 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // Ring roads: 3 rings × 6 segments = 18
      // Radial segments: 6 spokes × 3 segments per spoke = 18
      // Total: 36
      expect(network.segments).toHaveLength(36);

      // Verify all segments have valid endpoints
      for (const seg of network.segments) {
        expect(network.intersections.some(i => i.id === seg.from)).toBe(true);
        expect(network.intersections.some(i => i.id === seg.to)).toBe(true);
        expect(seg.length).toBeGreaterThan(0);
      }
    });

    it("should have valid adjacency list", () => {
      const cfg: RoadNetworkConfig = {
        system: "polar",
        axis1Lines: [{ position: 10 }, { position: 20 }],
        axis2Lines: [{ position: 0 }, { position: Math.PI / 2 }],
        axis1Shape: "circle",
        axis2Shape: "radial",
        cx: 0,
        cy: 0,
        bounds: { xMin: -30, yMin: -30, xMax: 30, yMax: 30, maxR: 25 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // Every segment should create two-way adjacency
      for (const seg of network.segments) {
        const fromNeighbors = network.adjacency.get(seg.from);
        const toNeighbors = network.adjacency.get(seg.to);

        expect(fromNeighbors).toBeDefined();
        expect(toNeighbors).toBeDefined();

        const hasToInFrom = fromNeighbors?.some(n => n.to === seg.to);
        const hasFromInTo = toNeighbors?.some(n => n.to === seg.from);

        expect(hasToInFrom).toBe(true);
        expect(hasFromInTo).toBe(true);
      }
    });

    it("should calculate correct arc length for radial segments", () => {
      const cfg: RoadNetworkConfig = {
        system: "polar",
        axis1Lines: [{ position: 10 }, { position: 20 }],
        axis2Lines: [{ position: 0 }],
        axis1Shape: "circle",
        axis2Shape: "radial",
        cx: 0,
        cy: 0,
        bounds: { xMin: -30, yMin: -30, xMax: 30, yMax: 30, maxR: 25 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // Find radial segment from r=10 to r=20
      const radialSeg = network.segments.find(s => Math.abs(s.length - 10) < 0.001);
      expect(radialSeg).toBeDefined();
      expect(radialSeg?.length).toBeCloseTo(10, 5);
    });
  });

  describe("cartesian system with grid", () => {
    it("should generate correct intersections for 3x3 grid", () => {
      const cfg: RoadNetworkConfig = {
        system: "cartesian",
        axis1Lines: [{ position: 0 }, { position: 10 }, { position: 20 }],
        axis2Lines: [{ position: 0 }, { position: 10 }, { position: 20 }],
        axis1Shape: "line",
        axis2Shape: "line",
        cx: 50,
        cy: 50,
        bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // 3 × 3 = 9 intersections
      expect(network.intersections).toHaveLength(9);

      // Verify coordinates
      // grid[xi][yi] layout: grid[0][0]=(50,50), grid[0][1]=(50,60), grid[0][2]=(50,70)
      //                      grid[1][0]=(60,50), grid[1][1]=(60,60), grid[1][2]=(60,70)
      //                      grid[2][0]=(70,50), grid[2][1]=(70,60), grid[2][2]=(70,70)
      expect(network.intersections[0]).toEqual({ id: 0, x: 50, y: 50 });
      expect(network.intersections[1]).toEqual({ id: 1, x: 50, y: 60 });
      expect(network.intersections[3]).toEqual({ id: 3, x: 60, y: 50 });
    });

    it("should generate correct segments for 3x3 grid", () => {
      const cfg: RoadNetworkConfig = {
        system: "cartesian",
        axis1Lines: [{ position: 0 }, { position: 10 }, { position: 20 }],
        axis2Lines: [{ position: 0 }, { position: 10 }, { position: 20 }],
        axis1Shape: "line",
        axis2Shape: "line",
        cx: 50,
        cy: 50,
        bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // Horizontal: 3 rows × 2 segments = 6
      // Vertical: 3 cols × 2 segments = 6
      // Total: 12
      expect(network.segments).toHaveLength(12);

      // All segments should have length 10
      for (const seg of network.segments) {
        expect(seg.length).toBeCloseTo(10, 5);
      }
    });

    it("should handle 2x2 grid correctly", () => {
      const cfg: RoadNetworkConfig = {
        system: "cartesian",
        axis1Lines: [{ position: 0 }, { position: 10 }],
        axis2Lines: [{ position: 0 }, { position: 10 }],
        axis1Shape: "line",
        axis2Shape: "line",
        cx: 0,
        cy: 0,
        bounds: { xMin: 0, yMin: 0, xMax: 20, yMax: 20 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // 2 × 2 = 4 intersections
      expect(network.intersections).toHaveLength(4);

      // Horizontal: 2 rows × 1 segment = 2
      // Vertical: 2 cols × 1 segment = 2
      // Total: 4
      expect(network.segments).toHaveLength(4);
    });
  });

  describe("node access mapping", () => {
    it("should map nodes to nearest intersections", () => {
      const nodes = [
        mockNode("n1", 100, 100),
        mockNode("n2", 110, 100),
        mockNode("n3", 100, 110),
      ];

      const cfg: RoadNetworkConfig = {
        system: "cartesian",
        axis1Lines: [{ position: 0 }, { position: 10 }],
        axis2Lines: [{ position: 0 }, { position: 10 }],
        axis1Shape: "line",
        axis2Shape: "line",
        cx: 100,
        cy: 100,
        bounds: { xMin: 0, yMin: 0, xMax: 20, yMax: 20 },
        nodes,
      };

      const network = buildRoadNetwork(cfg);

      // grid[xi][yi] layout: [0][0]=(100,100), [0][1]=(100,110)
      //                      [1][0]=(110,100), [1][1]=(110,110)
      expect(network.nodeAccess.get("n1")).toBe(0); // at (100, 100)
      expect(network.nodeAccess.get("n2")).toBe(2); // at (110, 100)
      expect(network.nodeAccess.get("n3")).toBe(1); // at (100, 110)
    });

    it("should handle nodes outside grid", () => {
      const nodes = [
        mockNode("n1", 500, 500), // far from grid
        mockNode("n2", 101, 101),
      ];

      const cfg: RoadNetworkConfig = {
        system: "cartesian",
        axis1Lines: [{ position: 0 }, { position: 10 }],
        axis2Lines: [{ position: 0 }, { position: 10 }],
        axis1Shape: "line",
        axis2Shape: "line",
        cx: 100,
        cy: 100,
        bounds: { xMin: 0, yMin: 0, xMax: 20, yMax: 20 },
        nodes,
      };

      const network = buildRoadNetwork(cfg);

      // Both nodes should still map to some intersection
      expect(network.nodeAccess.has("n1")).toBe(true);
      expect(network.nodeAccess.has("n2")).toBe(true);
    });
  });

  describe("empty network handling", () => {
    it("should return empty network for no grid lines", () => {
      const cfg: RoadNetworkConfig = {
        system: "polar",
        axis1Lines: [],
        axis2Lines: [{ position: 0 }],
        axis1Shape: "circle",
        axis2Shape: "radial",
        cx: 0,
        cy: 0,
        bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);
      expect(network.intersections).toHaveLength(0);
      expect(network.segments).toHaveLength(0);
    });

    it("should return empty network for cartesian with no lines", () => {
      const cfg: RoadNetworkConfig = {
        system: "cartesian",
        axis1Lines: [],
        axis2Lines: [],
        axis1Shape: "line",
        axis2Shape: "line",
        cx: 0,
        cy: 0,
        bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);
      expect(network.intersections).toHaveLength(0);
      expect(network.segments).toHaveLength(0);
    });
  });

  describe("polar with single ring", () => {
    it("should handle single ring with multiple spokes", () => {
      const cfg: RoadNetworkConfig = {
        system: "polar",
        axis1Lines: [{ position: 10 }],
        axis2Lines: [
          { position: 0 },
          { position: Math.PI / 2 },
          { position: Math.PI },
          { position: (3 * Math.PI) / 2 },
        ],
        axis1Shape: "circle",
        axis2Shape: "radial",
        cx: 0,
        cy: 0,
        bounds: { xMin: -20, yMin: -20, xMax: 20, yMax: 20, maxR: 15 },
        nodes: [],
      };

      const network = buildRoadNetwork(cfg);

      // 1 center + 1 ring × 4 spokes = 5 intersections
      expect(network.intersections).toHaveLength(5);

      // Ring: 4 segments, Radials: 4 segments = 8
      expect(network.segments).toHaveLength(8);
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: hand-craft a small road network for isolated function testing
// ---------------------------------------------------------------------------

/**
 *  A simple diamond network:
 *
 *       1
 *      / \
 *     0   3
 *      \ /
 *       2
 *
 *  Weights: 0→1 = 1, 0→2 = 2, 1→3 = 3, 2→3 = 1
 *  Shortest 0→3 via 2 (cost 3) beats via 1 (cost 4)
 */
function makeDiamondNetwork(): RoadNetwork {
  const intersections = [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 5, y: 10 },
    { id: 2, x: 5, y: -10 },
    { id: 3, x: 10, y: 0 },
  ];
  const segments = [
    { from: 0, to: 1, waypoints: [], length: 1 },
    { from: 0, to: 2, waypoints: [], length: 2 },
    { from: 1, to: 3, waypoints: [], length: 3 },
    { from: 2, to: 3, waypoints: [], length: 1 },
  ];
  const adjacency = new Map<number, { to: number; weight: number; segIdx: number }[]>();
  adjacency.set(0, [{ to: 1, weight: 1, segIdx: 0 }, { to: 2, weight: 2, segIdx: 1 }]);
  adjacency.set(1, [{ to: 0, weight: 1, segIdx: 0 }, { to: 3, weight: 3, segIdx: 2 }]);
  adjacency.set(2, [{ to: 0, weight: 2, segIdx: 1 }, { to: 3, weight: 1, segIdx: 3 }]);
  adjacency.set(3, [{ to: 1, weight: 3, segIdx: 2 }, { to: 2, weight: 1, segIdx: 3 }]);

  return {
    intersections, segments, adjacency,
    nodeAccess: new Map([["A", 0], ["B", 3]]),
    system: "cartesian", cx: 5, cy: 0,
  };
}

/** Linear chain: 0 —(5)— 1 —(3)— 2 with waypoints on segment 0→1 */
function makeChainNetwork(): RoadNetwork {
  const intersections = [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 10, y: 0 },
    { id: 2, x: 20, y: 0 },
  ];
  const wp = [{ x: 3, y: 1 }, { x: 7, y: -1 }]; // arc-like waypoints
  const segments = [
    { from: 0, to: 1, waypoints: wp, length: 5 },
    { from: 1, to: 2, waypoints: [], length: 3 },
  ];
  const adjacency = new Map<number, { to: number; weight: number; segIdx: number }[]>();
  adjacency.set(0, [{ to: 1, weight: 5, segIdx: 0 }]);
  adjacency.set(1, [{ to: 0, weight: 5, segIdx: 0 }, { to: 2, weight: 3, segIdx: 1 }]);
  adjacency.set(2, [{ to: 1, weight: 3, segIdx: 1 }]);

  return {
    intersections, segments, adjacency,
    nodeAccess: new Map([["start", 0], ["end", 2]]),
    system: "cartesian", cx: 10, cy: 0,
  };
}

// ---------------------------------------------------------------------------
// findShortestPath — Dijkstra
// ---------------------------------------------------------------------------

describe("findShortestPath", () => {
  it("returns single-element path when start === end", () => {
    const net = makeDiamondNetwork();
    expect(findShortestPath(net, 0, 0)).toEqual([0]);
  });

  it("finds shortest path in diamond (0→3 via node 2, cost 3)", () => {
    const net = makeDiamondNetwork();
    const path = findShortestPath(net, 0, 3);
    expect(path).toEqual([0, 2, 3]); // weight 2+1 = 3 < 1+3 = 4
  });

  it("finds shortest path in reverse direction (3→0)", () => {
    const net = makeDiamondNetwork();
    const path = findShortestPath(net, 3, 0);
    expect(path).toEqual([3, 2, 0]);
  });

  it("returns empty array for disconnected nodes", () => {
    const net = makeDiamondNetwork();
    // Add isolated node with no adjacency
    net.intersections.push({ id: 99, x: 100, y: 100 });
    const path = findShortestPath(net, 0, 99);
    expect(path).toEqual([]);
  });

  it("handles linear chain correctly (0→1→2)", () => {
    const net = makeChainNetwork();
    const path = findShortestPath(net, 0, 2);
    expect(path).toEqual([0, 1, 2]);
  });

  it("handles non-existent start/end IDs gracefully", () => {
    const net = makeDiamondNetwork();
    expect(findShortestPath(net, 0, 999)).toEqual([]);
    expect(findShortestPath(net, 999, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pathToWaypoints — convert intersection path to {x, y} coordinates
// ---------------------------------------------------------------------------

describe("pathToWaypoints", () => {
  it("returns empty for empty path", () => {
    const net = makeChainNetwork();
    expect(pathToWaypoints(net, [])).toEqual([]);
  });

  it("returns single point for single-node path", () => {
    const net = makeChainNetwork();
    const pts = pathToWaypoints(net, [0]);
    expect(pts).toEqual([{ x: 0, y: 0 }]);
  });

  it("includes waypoints between intersections", () => {
    const net = makeChainNetwork();
    const pts = pathToWaypoints(net, [0, 1]);
    // Start intersection + 2 waypoints + end intersection = 4 points
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]).toEqual({ x: 3, y: 1 });
    expect(pts[2]).toEqual({ x: 7, y: -1 });
    expect(pts[3]).toEqual({ x: 10, y: 0 });
  });

  it("reverses waypoints when traversing segment backwards", () => {
    const net = makeChainNetwork();
    const pts = pathToWaypoints(net, [1, 0]);
    // Reversed: end intersection, reversed waypoints, start intersection
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual({ x: 10, y: 0 });
    expect(pts[1]).toEqual({ x: 7, y: -1 }); // reversed order
    expect(pts[2]).toEqual({ x: 3, y: 1 });
    expect(pts[3]).toEqual({ x: 0, y: 0 });
  });

  it("handles multi-hop path (0→1→2 with mixed waypoints)", () => {
    const net = makeChainNetwork();
    const pts = pathToWaypoints(net, [0, 1, 2]);
    // 0 + wp1 + wp2 + 1 + 2 = 5 points (segment 1→2 has no waypoints)
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 20, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// findNearestIntersection — spatial nearest neighbor
// ---------------------------------------------------------------------------

describe("findNearestIntersection", () => {
  it("returns exact match when point is on intersection", () => {
    const net = makeDiamondNetwork();
    expect(findNearestIntersection(net, 0, 0)).toBe(0);
    expect(findNearestIntersection(net, 10, 0)).toBe(3);
  });

  it("finds nearest for arbitrary coordinates", () => {
    const net = makeDiamondNetwork();
    // (4, 9) is closest to intersection 1 at (5, 10)
    expect(findNearestIntersection(net, 4, 9)).toBe(1);
    // (6, -8) is closest to intersection 2 at (5, -10)
    expect(findNearestIntersection(net, 6, -8)).toBe(2);
  });

  it("returns -1 for empty network", () => {
    const net: RoadNetwork = {
      intersections: [], segments: [], adjacency: new Map(),
      nodeAccess: new Map(), system: "cartesian", cx: 0, cy: 0,
    };
    expect(findNearestIntersection(net, 0, 0)).toBe(-1);
  });

  it("handles single intersection", () => {
    const net: RoadNetwork = {
      intersections: [{ id: 42, x: 100, y: 200 }],
      segments: [], adjacency: new Map(),
      nodeAccess: new Map(), system: "cartesian", cx: 0, cy: 0,
    };
    expect(findNearestIntersection(net, 999, 999)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// cachedFindShortestPath — caching wrapper with symmetric keys
// ---------------------------------------------------------------------------

describe("cachedFindShortestPath", () => {
  beforeEach(() => {
    invalidatePathCache();
  });

  it("returns same result as findShortestPath", () => {
    const net = makeDiamondNetwork();
    const direct = findShortestPath(net, 0, 3);
    const cached = cachedFindShortestPath(net, 0, 3);
    expect(cached).toEqual(direct);
  });

  it("returns consistent results on repeated calls (cache hit)", () => {
    const net = makeDiamondNetwork();
    const first = cachedFindShortestPath(net, 0, 3);
    const second = cachedFindShortestPath(net, 0, 3);
    expect(second).toEqual(first);
  });

  it("handles reverse direction (symmetric key)", () => {
    const net = makeDiamondNetwork();
    const forward = cachedFindShortestPath(net, 0, 3);
    const reverse = cachedFindShortestPath(net, 3, 0);
    // Forward path reversed should equal reverse path
    expect(reverse).toEqual([...forward].reverse());
  });

  it("auto-invalidates when network reference changes", () => {
    const net1 = makeDiamondNetwork();
    cachedFindShortestPath(net1, 0, 3);

    // Create a different network
    const net2 = makeChainNetwork();
    const result = cachedFindShortestPath(net2, 0, 2);
    expect(result).toEqual([0, 1, 2]); // should use net2, not net1's cache
  });

  it("path[0] always equals from parameter", () => {
    const net = makeDiamondNetwork();
    const fwd = cachedFindShortestPath(net, 0, 3);
    expect(fwd[0]).toBe(0);
    const rev = cachedFindShortestPath(net, 3, 0);
    expect(rev[0]).toBe(3);
  });

  it("explicit invalidation clears cache", () => {
    const net = makeDiamondNetwork();
    cachedFindShortestPath(net, 0, 3);
    invalidatePathCache();
    // Should work fine after invalidation
    const result = cachedFindShortestPath(net, 0, 3);
    expect(result).toEqual([0, 2, 3]);
  });
});

describe("routeEdge", () => {
  it("should return empty for non-existent source node", () => {
    const cfg: RoadNetworkConfig = {
      system: "cartesian",
      axis1Lines: [{ position: 0 }],
      axis2Lines: [{ position: 0 }],
      axis1Shape: "line",
      axis2Shape: "line",
      cx: 0,
      cy: 0,
      bounds: { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      nodes: [],
    };

    const network = buildRoadNetwork(cfg);
    const route = routeEdge(network, "nonexistent", "also-nonexistent");
    expect(route).toEqual([]);
  });

  it("should route between two nearby nodes on grid", () => {
    const nodes = [
      mockNode("a", 0, 0),
      mockNode("b", 10, 0),
    ];

    const cfg: RoadNetworkConfig = {
      system: "cartesian",
      axis1Lines: [{ position: 0 }, { position: 10 }],
      axis2Lines: [{ position: 0 }, { position: 10 }],
      axis1Shape: "line",
      axis2Shape: "line",
      cx: 0,
      cy: 0,
      bounds: { xMin: 0, yMin: 0, xMax: 20, yMax: 20 },
      nodes,
    };

    const network = buildRoadNetwork(cfg);
    const route = routeEdge(network, "a", "b");
    expect(route.length).toBeGreaterThanOrEqual(2);
    // Routes return waypoints {x, y} not full intersections with id
    const aIsect = network.intersections[network.nodeAccess.get("a")!];
    const bIsect = network.intersections[network.nodeAccess.get("b")!];
    expect(route[0]).toEqual({ x: aIsect.x, y: aIsect.y });
    expect(route[route.length - 1]).toEqual({ x: bIsect.x, y: bIsect.y });
  });

  it("should route across multiple segments", () => {
    const nodes = [
      mockNode("start", 0, 0),
      mockNode("end", 20, 20),
    ];

    const cfg: RoadNetworkConfig = {
      system: "cartesian",
      axis1Lines: [{ position: 0 }, { position: 10 }, { position: 20 }],
      axis2Lines: [{ position: 0 }, { position: 10 }, { position: 20 }],
      axis1Shape: "line",
      axis2Shape: "line",
      cx: 0,
      cy: 0,
      bounds: { xMin: 0, yMin: 0, xMax: 30, yMax: 30 },
      nodes,
    };

    const network = buildRoadNetwork(cfg);
    const route = routeEdge(network, "start", "end");
    expect(route.length).toBeGreaterThanOrEqual(2);
  });

  it("should route on polar network", () => {
    const nodes = [
      mockNode("inner", 0, 0),
      mockNode("outer", 30, 0),
    ];

    const cfg: RoadNetworkConfig = {
      system: "polar",
      axis1Lines: [{ position: 10 }, { position: 20 }, { position: 30 }],
      axis2Lines: [{ position: 0 }, { position: Math.PI / 2 }],
      axis1Shape: "circle",
      axis2Shape: "radial",
      cx: 0,
      cy: 0,
      bounds: { xMin: -40, yMin: -40, xMax: 40, yMax: 40, maxR: 35 },
      nodes,
    };

    const network = buildRoadNetwork(cfg);
    const route = routeEdge(network, "inner", "outer");
    expect(route.length).toBeGreaterThanOrEqual(2);
  });

  it("should return empty when target is same as source in nodeAccess", () => {
    const nodes = [mockNode("a", 0, 0)];

    const cfg: RoadNetworkConfig = {
      system: "cartesian",
      axis1Lines: [{ position: 0 }],
      axis2Lines: [{ position: 0 }],
      axis1Shape: "line",
      axis2Shape: "line",
      cx: 0,
      cy: 0,
      bounds: { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      nodes,
    };

    const network = buildRoadNetwork(cfg);
    const route = routeEdge(network, "a", "a");
    // Same source and target should produce minimal or empty route
    expect(route.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// buildRoadNetworkFromPhantoms — k-NN phantom node network
// ---------------------------------------------------------------------------

describe("buildRoadNetworkFromPhantoms", () => {
  it("returns empty network for no phantom nodes", () => {
    const net = buildRoadNetworkFromPhantoms([], [], "cartesian", 0, 0);
    expect(net.intersections).toHaveLength(0);
    expect(net.segments).toHaveLength(0);
    expect(net.nodeAccess.size).toBe(0);
  });

  it("creates intersections from phantom nodes", () => {
    const phantoms = [
      mockNode("p0", 0, 0),
      mockNode("p1", 10, 0),
      mockNode("p2", 0, 10),
    ];
    const net = buildRoadNetworkFromPhantoms(phantoms, [], "cartesian", 5, 5);
    expect(net.intersections).toHaveLength(3);
    expect(net.intersections[0]).toEqual({ id: 0, x: 0, y: 0 });
    expect(net.intersections[1]).toEqual({ id: 1, x: 10, y: 0 });
    expect(net.intersections[2]).toEqual({ id: 2, x: 0, y: 10 });
  });

  it("connects k-nearest neighbors (k ≤ 6)", () => {
    // 3 phantoms: each connects to 2 neighbors (k = min(6, 2) = 2)
    const phantoms = [
      mockNode("p0", 0, 0),
      mockNode("p1", 10, 0),
      mockNode("p2", 5, 5),
    ];
    const net = buildRoadNetworkFromPhantoms(phantoms, [], "cartesian", 5, 2.5);
    // All 3 pairs should be connected (triangle)
    expect(net.segments.length).toBe(3);
    // Adjacency is bidirectional
    for (const seg of net.segments) {
      expect(net.adjacency.get(seg.from)?.some(e => e.to === seg.to)).toBe(true);
      expect(net.adjacency.get(seg.to)?.some(e => e.to === seg.from)).toBe(true);
    }
  });

  it("maps real nodes to nearest phantom intersection", () => {
    const phantoms = [
      mockNode("p0", 0, 0),
      mockNode("p1", 100, 0),
    ];
    const realNodes = [
      mockNode("r1", 3, 2),    // closest to p0 (0,0)
      mockNode("r2", 95, 5),   // closest to p1 (100,0)
      mockNode("r3", 50, 0),   // equidistant — either is valid
    ];
    const net = buildRoadNetworkFromPhantoms(phantoms, realNodes, "cartesian", 50, 0);
    expect(net.nodeAccess.get("r1")).toBe(0);
    expect(net.nodeAccess.get("r2")).toBe(1);
    expect(net.nodeAccess.has("r3")).toBe(true); // mapped to one of them
  });

  it("handles single phantom node (no segments)", () => {
    const phantoms = [mockNode("p0", 5, 5)];
    const real = [mockNode("r1", 3, 3)];
    const net = buildRoadNetworkFromPhantoms(phantoms, real, "polar", 5, 5);
    expect(net.intersections).toHaveLength(1);
    expect(net.segments).toHaveLength(0);
    expect(net.nodeAccess.get("r1")).toBe(0);
  });

  it("avoids duplicate segments (symmetric pair key)", () => {
    // 2 phantoms: should create exactly 1 segment, not 2
    const phantoms = [
      mockNode("p0", 0, 0),
      mockNode("p1", 10, 0),
    ];
    const net = buildRoadNetworkFromPhantoms(phantoms, [], "cartesian", 5, 0);
    expect(net.segments).toHaveLength(1);
    expect(net.segments[0].length).toBeCloseTo(10, 5);
  });

  it("segment lengths are Euclidean distances", () => {
    const phantoms = [
      mockNode("p0", 0, 0),
      mockNode("p1", 3, 4), // distance = 5
    ];
    const net = buildRoadNetworkFromPhantoms(phantoms, [], "cartesian", 0, 0);
    expect(net.segments[0].length).toBeCloseTo(5, 10);
  });

  it("preserves system and center in returned network", () => {
    const phantoms = [mockNode("p0", 0, 0), mockNode("p1", 10, 10)];
    const net = buildRoadNetworkFromPhantoms(phantoms, [], "polar", 42, 99);
    expect(net.system).toBe("polar");
    expect(net.cx).toBe(42);
    expect(net.cy).toBe(99);
  });
});
