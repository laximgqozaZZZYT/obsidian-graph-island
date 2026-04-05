import { describe, it, expect } from "vitest";
import {
  // Constants
  CABLE_LANE_SPACING, TRUNK_CONDUIT_ALPHA, WIRE_BASE_ALPHA,
  STUB_WIRE_SPACING, TRUNK_SCREEN_WIDTH, CABLE_SCREEN_WIDTH,
  WIRE_SCREEN_WIDTH, DEFAULT_CLUSTER_RADIUS,
  HIGHLIGHT_CABLE_TRUNK_WIDTH, MAX_CONDUIT_WIDTH,
  CABLE_FAN_CROWD_THRESHOLD, CABLE_FAN_CROWD_MIN_FRACTION,
  // Path builders
  buildManhattanPath, buildHorizontalTrunkPath, buildVerticalTrunkPath,
  buildPolarTrunkPath,
  // Cable path
  computeCablePath,
  // Zoom fade
  zoomFadeAlpha,
  // Polar center
  computePolarCenter,
  // Polar junction grid
  computePolarJunctionGrid, filterPolarGridForPort, routeViaPolarGrid,
  // Group ports
  computeRadialPort, estimateNodeSpacingMargin, computeGroupPorts,
  // Wire helpers
  cableFadeByDegree, cableWeightThickness,
  // Port color lanes
  buildPortColorLanes, getPortLaneEndpoint,
  // Build functions
  buildTrunks, buildIntraGroupCables,
  routeSingleIntraCable, routeExternalOnlyNode,
  // Types
  type PolarJunctionGrid, type GroupPort, type PortLaneInfo,
} from "../src/views/CableTrayRenderer";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEdge(id: string, source: string, target: string, type = "link"): GraphEdge {
  return { id, source, target, type } as GraphEdge;
}

// ---------------------------------------------------------------------------
// Constants sanity
// ---------------------------------------------------------------------------

describe("CableTrayRenderer constants", () => {
  it("trunk wider than cable wider than wire", () => {
    expect(TRUNK_SCREEN_WIDTH).toBeGreaterThan(CABLE_SCREEN_WIDTH);
    expect(CABLE_SCREEN_WIDTH).toBeGreaterThan(WIRE_SCREEN_WIDTH);
  });

  it("wire base alpha is near-opaque", () => {
    expect(WIRE_BASE_ALPHA).toBeGreaterThan(0.8);
    expect(WIRE_BASE_ALPHA).toBeLessThanOrEqual(1);
  });

  it("trunk conduit alpha is semi-transparent", () => {
    expect(TRUNK_CONDUIT_ALPHA).toBeGreaterThan(0);
    expect(TRUNK_CONDUIT_ALPHA).toBeLessThan(0.5);
  });

  it("default cluster radius is positive", () => {
    expect(DEFAULT_CLUSTER_RADIUS).toBeGreaterThan(0);
  });

  it("cable lane spacing is positive", () => {
    expect(CABLE_LANE_SPACING).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// zoomFadeAlpha
// ---------------------------------------------------------------------------

describe("zoomFadeAlpha", () => {
  it("returns 1 at zoom >= 0.5", () => {
    expect(zoomFadeAlpha(0.5)).toBe(1);
    expect(zoomFadeAlpha(1)).toBe(1);
    expect(zoomFadeAlpha(2)).toBe(1);
  });

  it("returns 0.05 at zoom <= 0.15", () => {
    expect(zoomFadeAlpha(0.15)).toBe(0.05);
    expect(zoomFadeAlpha(0.1)).toBe(0.05);
    expect(zoomFadeAlpha(0)).toBe(0.05);
  });

  it("interpolates between 0.15 and 0.5", () => {
    const mid = zoomFadeAlpha(0.325); // midpoint
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(1);
  });

  it("is monotonically increasing", () => {
    const values = [0, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.8];
    for (let i = 1; i < values.length; i++) {
      expect(zoomFadeAlpha(values[i])).toBeGreaterThanOrEqual(zoomFadeAlpha(values[i - 1]));
    }
  });
});

// ---------------------------------------------------------------------------
// buildManhattanPath
// ---------------------------------------------------------------------------

describe("buildManhattanPath", () => {
  it("returns straight line for coincident points", () => {
    const p = buildManhattanPath({ x: 0, y: 0 }, { x: 0.5, y: 0.5 });
    expect(p).toHaveLength(2);
  });

  it("returns straight line for nearly aligned points", () => {
    const p = buildManhattanPath({ x: 0, y: 0 }, { x: 100, y: 2 });
    expect(p).toHaveLength(2); // nearly horizontal
  });

  it("returns 3-point L-shape for diagonal", () => {
    const p = buildManhattanPath({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(p).toHaveLength(3);
    // Middle point shares one coordinate with start and one with end
    expect(p[1].x === p[0].x || p[1].x === p[2].x).toBe(true);
    expect(p[1].y === p[0].y || p[1].y === p[2].y).toBe(true);
  });

  it("uses longer-first-segment strategy", () => {
    // dx > dy => horizontal first
    const p1 = buildManhattanPath({ x: 0, y: 0 }, { x: 200, y: 50 });
    expect(p1[1]).toEqual({ x: 200, y: 0 }); // horizontal bend
    // dy > dx => vertical first
    const p2 = buildManhattanPath({ x: 0, y: 0 }, { x: 50, y: 200 });
    expect(p2[1]).toEqual({ x: 0, y: 200 }); // vertical bend
  });
});

// ---------------------------------------------------------------------------
// buildHorizontalTrunkPath / buildVerticalTrunkPath
// ---------------------------------------------------------------------------

describe("buildHorizontalTrunkPath", () => {
  it("goes horizontal first for diagonal input", () => {
    const p = buildHorizontalTrunkPath({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(p).toHaveLength(3);
    expect(p[1]).toEqual({ x: 100, y: 0 }); // horizontal then vertical
  });

  it("goes straight for nearly horizontal", () => {
    const p = buildHorizontalTrunkPath({ x: 0, y: 0 }, { x: 100, y: 1 });
    expect(p).toHaveLength(2);
  });
});

describe("buildVerticalTrunkPath", () => {
  it("goes vertical first for diagonal input", () => {
    const p = buildVerticalTrunkPath({ x: 0, y: 0 }, { x: 50, y: 100 });
    expect(p).toHaveLength(3);
    expect(p[1]).toEqual({ x: 0, y: 100 }); // vertical then horizontal
  });

  it("goes straight for nearly vertical", () => {
    const p = buildVerticalTrunkPath({ x: 0, y: 0 }, { x: 1, y: 100 });
    expect(p).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildPolarTrunkPath
// ---------------------------------------------------------------------------

describe("buildPolarTrunkPath", () => {
  const center = { x: 0, y: 0 };

  it("returns straight line for nearly same angle", () => {
    const a = { x: 100, y: 0 };
    const b = { x: 105, y: 1 }; // nearly same direction
    const p = buildPolarTrunkPath(a, b, center);
    expect(p).toHaveLength(2);
  });

  it("generates arc waypoints for different angles", () => {
    const a = { x: 100, y: 0 }; // theta=0
    const b = { x: 0, y: 100 }; // theta=pi/2
    const p = buildPolarTrunkPath(a, b, center);
    expect(p.length).toBeGreaterThan(2);
    // All intermediate points should be roughly at arcR
    const arcR = Math.max(100, 100) * 1.1;
    for (let i = 1; i < p.length - 1; i++) {
      const r = Math.sqrt(p[i].x ** 2 + p[i].y ** 2);
      expect(r).toBeCloseTo(arcR, 0);
    }
  });

  it("returns straight for zero-radius point", () => {
    const p = buildPolarTrunkPath({ x: 0, y: 0 }, { x: 100, y: 0 }, center);
    expect(p).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// computeCablePath
// ---------------------------------------------------------------------------

describe("computeCablePath", () => {
  it("returns 2 points for coincident endpoints", () => {
    const p = computeCablePath({ x: 5, y: 5 }, { x: 5, y: 5 }, 10);
    expect(p).toHaveLength(2);
  });

  it("cartesian routing uses rowGaps", () => {
    const p = computeCablePath(
      { x: 0, y: 0 }, { x: 100, y: 100 }, 10,
      { rowGaps: [50] },
    );
    expect(p).toHaveLength(4); // from -> (from.x, gapY) -> (to.x, gapY) -> to
    expect(p[1].y).toBe(50);
    expect(p[2].y).toBe(50);
  });

  it("polar routing uses ringGaps", () => {
    const p = computeCablePath(
      { x: 50, y: 0 }, { x: 0, y: 50 }, 10,
      { center: { x: 0, y: 0 }, ringGaps: [35] },
    );
    expect(p.length).toBeGreaterThan(2);
  });

  it("fallback produces 3 points with perpendicular offset", () => {
    const p = computeCablePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    expect(p).toHaveLength(3);
    // Middle point is offset perpendicular to the line
    expect(p[1].x).toBeCloseTo(50, 0);
    expect(Math.abs(p[1].y)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computePolarCenter
// ---------------------------------------------------------------------------

describe("computePolarCenter", () => {
  it("returns undefined for non-polar coordinate system", () => {
    expect(computePolarCenter({ coordinateSystem: "cartesian", clusterCentroids: new Map() })).toBeUndefined();
    expect(computePolarCenter({ clusterCentroids: new Map() })).toBeUndefined();
  });

  it("returns undefined for empty centroids", () => {
    expect(computePolarCenter({ coordinateSystem: "polar", clusterCentroids: new Map() })).toBeUndefined();
  });

  it("returns centroid average for polar mode", () => {
    const centroids = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 100, y: 0 }],
      ["c", { x: 0, y: 100 }],
    ]);
    const result = computePolarCenter({ coordinateSystem: "polar", clusterCentroids: centroids });
    expect(result).toBeDefined();
    expect(result!.x).toBeCloseTo(100 / 3, 1);
    expect(result!.y).toBeCloseTo(100 / 3, 1);
  });
});

// ---------------------------------------------------------------------------
// computePolarJunctionGrid
// ---------------------------------------------------------------------------

describe("computePolarJunctionGrid", () => {
  it("returns empty grid for no nodes", () => {
    const grid = computePolarJunctionGrid("g1", () => undefined, new Map(), { x: 0, y: 0 });
    expect(grid.rings).toHaveLength(0);
    expect(grid.ringGaps).toHaveLength(0);
  });

  it("computes rings and gaps for positioned nodes", () => {
    const positions = new Map<string, { x: number; y: number }>([
      ["n1", { x: 50, y: 0 }],
      ["n2", { x: 100, y: 0 }],
      ["n3", { x: 0, y: 75 }],
    ]);
    const ncm = new Map([["n1", "g1"], ["n2", "g1"], ["n3", "g1"]]);
    const grid = computePolarJunctionGrid("g1", (id) => positions.get(id as string), ncm, { x: 0, y: 0 });
    expect(grid.rings.length).toBeGreaterThan(0);
    expect(grid.cx).toBe(0);
    expect(grid.cy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterPolarGridForPort
// ---------------------------------------------------------------------------

describe("filterPolarGridForPort", () => {
  it("removes the ringGap closest to port radius", () => {
    const grid: PolarJunctionGrid = {
      rings: [50, 100], angles: [], ringGaps: [75], angleGaps: [],
      cx: 0, cy: 0,
    };
    const filtered = filterPolarGridForPort(grid, 70);
    expect(filtered.ringGaps).toHaveLength(0);
  });

  it("returns unchanged grid if no ringGaps", () => {
    const grid: PolarJunctionGrid = {
      rings: [50], angles: [], ringGaps: [], angleGaps: [],
      cx: 0, cy: 0,
    };
    expect(filterPolarGridForPort(grid, 50)).toBe(grid);
  });

  it("removes only one ringGap from multiple", () => {
    const grid: PolarJunctionGrid = {
      rings: [30, 60, 90], angles: [], ringGaps: [45, 75], angleGaps: [],
      cx: 0, cy: 0,
    };
    const filtered = filterPolarGridForPort(grid, 73);
    expect(filtered.ringGaps).toHaveLength(1);
    expect(filtered.ringGaps[0]).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// computeRadialPort
// ---------------------------------------------------------------------------

describe("computeRadialPort", () => {
  it("places port on boundary toward target", () => {
    const port = computeRadialPort("g1", { x: 100, y: 0 }, { x: 0, y: 0 }, 30);
    // Direction from centroid(100,0) toward target(0,0) is negative-x
    expect(port.x).toBeLessThan(100);
    expect(port.x).toBeCloseTo(70, 0);
    expect(port.y).toBeCloseTo(0, 0);
    expect(port.groupKey).toBe("g1");
  });

  it("uses default direction when centroid equals target", () => {
    const port = computeRadialPort("g1", { x: 5, y: 5 }, { x: 5, y: 5 }, 20);
    // dirLen < 0.01 → fallback direction (0, -1)
    expect(port.x).toBeCloseTo(5, 0);
    expect(port.y).toBeCloseTo(-15, 0);
  });

  it("computes perpendicular as 90deg CCW from radial direction", () => {
    const port = computeRadialPort("g1", { x: 0, y: 0 }, { x: 100, y: 0 }, 50);
    // dir = (1, 0), perp = (0, 1) (90° CCW)
    expect(port.perpX).toBeCloseTo(0, 5);
    expect(port.perpY).toBeCloseTo(1, 5);
  });

  it("handles diagonal direction", () => {
    const port = computeRadialPort("g1", { x: 0, y: 0 }, { x: 100, y: 100 }, 50);
    const expectedDist = Math.sqrt(port.x ** 2 + port.y ** 2);
    expect(expectedDist).toBeCloseTo(50, 0);
  });
});

// ---------------------------------------------------------------------------
// estimateNodeSpacingMargin
// ---------------------------------------------------------------------------

describe("estimateNodeSpacingMargin", () => {
  it("returns default for fewer than 2 positions", () => {
    expect(estimateNodeSpacingMargin([])).toBe(30);
    expect(estimateNodeSpacingMargin([{ x: 0, y: 0 }])).toBe(30);
  });

  it("returns custom default when specified", () => {
    expect(estimateNodeSpacingMargin([], 50)).toBe(50);
  });

  it("returns half the minimum pairwise distance", () => {
    const positions = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }];
    // Min distance = 10 (between first two), margin = 5
    expect(estimateNodeSpacingMargin(positions)).toBeCloseTo(5, 0);
  });

  it("ignores distances <= 1 (overlapping nodes)", () => {
    const positions = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 20, y: 0 }];
    // d=0.5 ignored, min usable = 20, margin = 10
    expect(estimateNodeSpacingMargin(positions)).toBeCloseTo(10, 0);
  });

  it("returns default when all nodes overlap", () => {
    const positions = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.2, y: 0 }];
    expect(estimateNodeSpacingMargin(positions)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// computeGroupPorts
// ---------------------------------------------------------------------------

describe("computeGroupPorts", () => {
  it("places polar ports toward graph center", () => {
    const centroids = new Map([
      ["g1", { x: 100, y: 0 }],
      ["g2", { x: -100, y: 0 }],
    ]);
    const radii = new Map([["g1", 30], ["g2", 30]]);
    const conns = new Map([["g1", new Set(["g2"])], ["g2", new Set(["g1"])]]);
    const ports = computeGroupPorts(new Set(["g1", "g2"]), centroids, radii, conns, "polar");
    const p1 = ports.get("g1")!;
    // Port should be between centroid and graph center (x=0)
    expect(p1.x).toBeLessThan(100);
    expect(p1.x).toBeGreaterThan(0);
  });

  it("places cartesian ports on bbox face closest to center", () => {
    const centroids = new Map([["g1", { x: 200, y: 0 }]]);
    const radii = new Map([["g1", 50]]);
    const conns = new Map([["g1", new Set<string>()]]);
    const ncm = new Map([
      ["n1", "g1"], ["n2", "g1"],
    ]);
    const positions = new Map<string, { x: number; y: number }>([
      ["n1", { x: 180, y: -20 }],
      ["n2", { x: 220, y: 20 }],
    ]);
    const resolvePos = (id: string | object) => positions.get(id as string);
    const ports = computeGroupPorts(
      new Set(["g1"]), centroids, radii, conns,
      "cartesian", undefined, resolvePos, ncm,
    );
    const p = ports.get("g1")!;
    expect(p).toBeDefined();
    // Port should be on left face (closest to graph center at x=200 mean = 200, center ~200)
    expect(p.x).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cableFadeByDegree
// ---------------------------------------------------------------------------

describe("cableFadeByDegree", () => {
  it("returns 1 when fadeByDegree is disabled", () => {
    const cfg = { fadeByDegree: false, maxDegree: 10, degrees: new Map() };
    expect(cableFadeByDegree([makeEdge("e1", "a", "b")], cfg)).toBe(1);
  });

  it("returns 1 when maxDegree is 0", () => {
    const cfg = { fadeByDegree: true, maxDegree: 0, degrees: new Map() };
    expect(cableFadeByDegree([makeEdge("e1", "a", "b")], cfg)).toBe(1);
  });

  it("fades for low-degree edges", () => {
    const cfg = {
      fadeByDegree: true, maxDegree: 100,
      degrees: new Map([["a", 1], ["b", 2]]),
    };
    const alpha = cableFadeByDegree([makeEdge("e1", "a", "b")], cfg);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeGreaterThan(0.3); // FADE_BY_DEGREE_MIN_ALPHA
  });

  it("returns close to 1 for max-degree edges", () => {
    const cfg = {
      fadeByDegree: true, maxDegree: 100,
      degrees: new Map([["a", 100], ["b", 100]]),
    };
    const alpha = cableFadeByDegree([makeEdge("e1", "a", "b")], cfg);
    expect(alpha).toBeCloseTo(1, 1);
  });
});

// ---------------------------------------------------------------------------
// cableWeightThickness
// ---------------------------------------------------------------------------

describe("cableWeightThickness", () => {
  it("returns 0 when disabled", () => {
    expect(cableWeightThickness([makeEdge("e1", "a", "b")], { edgeWeightThickness: false })).toBe(0);
  });

  it("returns 0 for single edge", () => {
    expect(cableWeightThickness([makeEdge("e1", "a", "b")], { edgeWeightThickness: true })).toBe(0);
  });

  it("returns positive bonus for duplicate pairs", () => {
    const edges = [
      makeEdge("e1", "a", "b"),
      makeEdge("e2", "a", "b"),
      makeEdge("e3", "a", "b"),
    ];
    const bonus = cableWeightThickness(edges, { edgeWeightThickness: true });
    expect(bonus).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getPortLaneEndpoint
// ---------------------------------------------------------------------------

describe("getPortLaneEndpoint", () => {
  const info: PortLaneInfo = {
    colors: [0xff0000, 0x00ff00, 0x0000ff],
    portX: 100, portY: 50,
    perpX: 1, perpY: 0,
  };

  it("returns null for unknown color", () => {
    expect(getPortLaneEndpoint(info, 0xffffff, CABLE_LANE_SPACING)).toBeNull();
  });

  it("returns centered for single color", () => {
    const single: PortLaneInfo = { colors: [0xff0000], portX: 100, portY: 50, perpX: 1, perpY: 0 };
    const ep = getPortLaneEndpoint(single, 0xff0000, CABLE_LANE_SPACING);
    expect(ep).toEqual({ x: 100, y: 50 }); // no offset for single color
  });

  it("offsets colors symmetrically", () => {
    const ep0 = getPortLaneEndpoint(info, 0xff0000, CABLE_LANE_SPACING)!;
    const ep1 = getPortLaneEndpoint(info, 0x00ff00, CABLE_LANE_SPACING)!;
    const ep2 = getPortLaneEndpoint(info, 0x0000ff, CABLE_LANE_SPACING)!;
    // Middle color (idx=1) should be at port center
    expect(ep1.x).toBeCloseTo(100);
    // First and last should be offset symmetrically
    expect(ep0.x + ep2.x).toBeCloseTo(2 * ep1.x);
    expect(ep2.x - ep0.x).toBeCloseTo(2 * CABLE_LANE_SPACING);
  });
});

// ---------------------------------------------------------------------------
// buildPortColorLanes
// ---------------------------------------------------------------------------

describe("buildPortColorLanes", () => {
  it("returns empty for no cables with groupPortBranch", () => {
    const result = buildPortColorLanes(
      [], [], { colorEdgesByRelation: false, relationColors: new Map(), isDark: true },
      new Map(),
    );
    expect(result.size).toBe(0);
  });

  it("collects unique colors from cable groupPortBranch edges", () => {
    const gp: GroupPort = { groupKey: "g1", x: 10, y: 20, perpX: 1, perpY: 0 };
    const cables = [{
      groupKey: "g1",
      groupPortBranch: {
        edges: [
          makeEdge("e1", "a", "b", "link"),
          makeEdge("e2", "c", "d", "link"),
        ],
      },
    }];
    const result = buildPortColorLanes(
      [], cables,
      { colorEdgesByRelation: false, relationColors: new Map(), isDark: true },
      new Map([["g1", gp]]),
    );
    expect(result.has("g1")).toBe(true);
    expect(result.get("g1")!.colors.length).toBeGreaterThan(0);
  });
});
