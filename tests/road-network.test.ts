import { describe, it, expect } from "vitest";
import {
  buildCableTray as buildRoadNetwork,
  routeWire as routeEdge,
  type CableTrayConfig as RoadNetworkConfig,
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

// findShortestPath and pathToWaypoints tests removed — functions not yet exported
// TODO: Re-enable when findShortestPath/pathToWaypoints are implemented and exported

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
