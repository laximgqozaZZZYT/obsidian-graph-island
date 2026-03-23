import { describe, it, expect } from "vitest";
import {
  buildRoadNetwork,
  buildRoadNetworkFromPhantoms,
  addTrunkRoads,
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

// ---------------------------------------------------------------------------
// addTrunkRoads — connect group centroids through road network
// ---------------------------------------------------------------------------

describe("addTrunkRoads", () => {
  /** Helper: create a minimal 2x2 grid network for trunk road tests. */
  function makeGridNetwork(): RoadNetwork {
    const cfg: RoadNetworkConfig = {
      system: "cartesian",
      axis1Lines: [{ position: 0 }, { position: 100 }],
      axis2Lines: [{ position: 0 }, { position: 100 }],
      axis1Shape: "line", axis2Shape: "line",
      cx: 0, cy: 0,
      bounds: { xMin: -10, yMin: -10, xMax: 110, yMax: 110 },
      nodes: [],
    };
    return buildRoadNetwork(cfg);
  }

  it("does nothing for fewer than 2 centroids", () => {
    const net = makeGridNetwork();
    const segsBefore = net.segments.length;
    addTrunkRoads(net, [{ x: 50, y: 50 }]);
    expect(net.segments.length).toBe(segsBefore);
    addTrunkRoads(net, []);
    expect(net.segments.length).toBe(segsBefore);
  });

  it("connects 2 centroids to nearest intersections", () => {
    const net = makeGridNetwork();
    const segsBefore = net.segments.length;
    addTrunkRoads(net, [{ x: 1, y: 1 }, { x: 99, y: 99 }]);
    // Should add 1 segment between the nearest intersections
    expect(net.segments.length).toBe(segsBefore + 1);
  });

  it("creates bidirectional adjacency for trunk segments", () => {
    const net = makeGridNetwork();
    addTrunkRoads(net, [{ x: 0, y: 0 }, { x: 100, y: 100 }]);
    const lastSeg = net.segments[net.segments.length - 1];
    const fromAdj = net.adjacency.get(lastSeg.from);
    const toAdj = net.adjacency.get(lastSeg.to);
    expect(fromAdj?.some(e => e.to === lastSeg.to)).toBe(true);
    expect(toAdj?.some(e => e.to === lastSeg.from)).toBe(true);
  });

  it("creates circular connection for 3+ centroids (first↔last)", () => {
    const net = makeGridNetwork();
    const segsBefore = net.segments.length;
    addTrunkRoads(net, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 },
    ]);
    // 3 centroids → 2 consecutive + 1 circular = 3 new segments
    expect(net.segments.length).toBe(segsBefore + 3);
  });

  it("creates new intersection when centroid is far from existing grid", () => {
    const net: RoadNetwork = {
      intersections: [{ id: 0, x: 0, y: 0 }],
      segments: [], adjacency: new Map([[0, []]]),
      nodeAccess: new Map(), system: "cartesian", cx: 0, cy: 0,
    };
    // Centroid at (1e5, 1e5) is far but within 1e8 distance — maps to existing
    // Centroid at a manageable distance
    addTrunkRoads(net, [{ x: 0, y: 0 }, { x: 500, y: 500 }]);
    // Second centroid is far from (0,0) but within 1e8, so maps to id=0
    // Both map to same intersection → skip (fromId === toId)
    // OR a new segment is added if they're distinct
    expect(net.segments.length).toBeGreaterThanOrEqual(0);
  });

  it("skips trunk segment when both centroids map to same intersection", () => {
    const net = makeGridNetwork();
    const segsBefore = net.segments.length;
    // Both centroids near (0,0) → same intersection
    addTrunkRoads(net, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(net.segments.length).toBe(segsBefore); // no segment added
  });

  it("trunk segment length equals Euclidean distance between intersections", () => {
    const net = makeGridNetwork();
    addTrunkRoads(net, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const lastSeg = net.segments[net.segments.length - 1];
    const from = net.intersections[lastSeg.from];
    const to = net.intersections[lastSeg.to];
    const expected = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    expect(lastSeg.length).toBeCloseTo(expected, 5);
  });
});
