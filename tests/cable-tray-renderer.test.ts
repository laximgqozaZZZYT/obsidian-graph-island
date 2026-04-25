import { describe, it, expect } from "vitest";
import {
	// Constants
	CABLE_LANE_SPACING,
	TRUNK_CONDUIT_ALPHA,
	WIRE_BASE_ALPHA,
	STUB_WIRE_SPACING,
	TRUNK_SCREEN_WIDTH,
	CABLE_SCREEN_WIDTH,
	WIRE_SCREEN_WIDTH,
	DEFAULT_CLUSTER_RADIUS,
	HIGHLIGHT_CABLE_TRUNK_WIDTH,
	MAX_CONDUIT_WIDTH,
	CABLE_FAN_CROWD_THRESHOLD,
	CABLE_FAN_CROWD_MIN_FRACTION,
	// Path builders
	buildManhattanPath,
	buildHorizontalTrunkPath,
	buildVerticalTrunkPath,
	buildPolarTrunkPath,
	// Cable path
	computeCablePath,
	// Zoom fade
	zoomFadeAlpha,
	// Polar center
	computePolarCenter,
	// Polar junction grid
	computePolarJunctionGrid,
	filterPolarGridForPort,
	routeViaPolarGrid,
	// Group ports
	computeRadialPort,
	estimateNodeSpacingMargin,
	computeGroupPorts,
	// Wire helpers
	cableFadeByDegree,
	cableWeightThickness,
	// Port color lanes
	buildPortColorLanes,
	getPortLaneEndpoint,
	// Build functions
	buildTrunks,
	buildIntraGroupCables,
	routeSingleIntraCable,
	routeExternalOnlyNode,
	// Types
	type PolarJunctionGrid,
	type GroupPort,
	type PortLaneInfo,
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
		const p = computeCablePath({ x: 0, y: 0 }, { x: 100, y: 100 }, 10, { rowGaps: [50] });
		expect(p).toHaveLength(4); // from -> (from.x, gapY) -> (to.x, gapY) -> to
		expect(p[1].y).toBe(50);
		expect(p[2].y).toBe(50);
	});

	it("polar routing uses ringGaps", () => {
		const p = computeCablePath({ x: 50, y: 0 }, { x: 0, y: 50 }, 10, { center: { x: 0, y: 0 }, ringGaps: [35] });
		expect(p.length).toBeGreaterThan(2);
	});

	it("near-coincident endpoints produce finite fallback coordinates", () => {
		const from = { x: 100, y: 200 };
		const to = { x: 100, y: 200 };
		const p = computeCablePath(from, to, 10);
		for (const pt of p) {
			expect(Number.isFinite(pt.x)).toBe(true);
			expect(Number.isFinite(pt.y)).toBe(true);
		}
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
		const ncm = new Map([
			["n1", "g1"],
			["n2", "g1"],
			["n3", "g1"],
		]);
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
			rings: [50, 100],
			angles: [],
			ringGaps: [75],
			angleGaps: [],
			cx: 0,
			cy: 0,
		};
		const filtered = filterPolarGridForPort(grid, 70);
		expect(filtered.ringGaps).toHaveLength(0);
	});

	it("returns unchanged grid if no ringGaps", () => {
		const grid: PolarJunctionGrid = {
			rings: [50],
			angles: [],
			ringGaps: [],
			angleGaps: [],
			cx: 0,
			cy: 0,
		};
		expect(filterPolarGridForPort(grid, 50)).toBe(grid);
	});

	it("removes only one ringGap from multiple", () => {
		const grid: PolarJunctionGrid = {
			rings: [30, 60, 90],
			angles: [],
			ringGaps: [45, 75],
			angleGaps: [],
			cx: 0,
			cy: 0,
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
		const positions = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 30, y: 0 },
		];
		// Min distance = 10 (between first two), margin = 5
		expect(estimateNodeSpacingMargin(positions)).toBeCloseTo(5, 0);
	});

	it("ignores distances <= 1 (overlapping nodes)", () => {
		const positions = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0 },
			{ x: 20, y: 0 },
		];
		// d=0.5 ignored, min usable = 20, margin = 10
		expect(estimateNodeSpacingMargin(positions)).toBeCloseTo(10, 0);
	});

	it("returns default when all nodes overlap", () => {
		const positions = [
			{ x: 0, y: 0 },
			{ x: 0.1, y: 0 },
			{ x: 0.2, y: 0 },
		];
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
		const radii = new Map([
			["g1", 30],
			["g2", 30],
		]);
		const conns = new Map([
			["g1", new Set(["g2"])],
			["g2", new Set(["g1"])],
		]);
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
			["n1", "g1"],
			["n2", "g1"],
		]);
		const positions = new Map<string, { x: number; y: number }>([
			["n1", { x: 180, y: -20 }],
			["n2", { x: 220, y: 20 }],
		]);
		const resolvePos = (id: string | object) => positions.get(id as string);
		const ports = computeGroupPorts(
			new Set(["g1"]),
			centroids,
			radii,
			conns,
			"cartesian",
			undefined,
			resolvePos,
			ncm,
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
			fadeByDegree: true,
			maxDegree: 100,
			degrees: new Map([
				["a", 1],
				["b", 2],
			]),
		};
		const alpha = cableFadeByDegree([makeEdge("e1", "a", "b")], cfg);
		expect(alpha).toBeLessThan(1);
		expect(alpha).toBeGreaterThan(0.3); // FADE_BY_DEGREE_MIN_ALPHA
	});

	it("returns close to 1 for max-degree edges", () => {
		const cfg = {
			fadeByDegree: true,
			maxDegree: 100,
			degrees: new Map([
				["a", 100],
				["b", 100],
			]),
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
		const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "a", "b"), makeEdge("e3", "a", "b")];
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
		portX: 100,
		portY: 50,
		perpX: 1,
		perpY: 0,
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
			[],
			[],
			{ colorEdgesByRelation: false, relationColors: new Map(), isDark: true },
			new Map(),
		);
		expect(result.size).toBe(0);
	});

	it("collects unique colors from cable groupPortBranch edges", () => {
		const gp: GroupPort = { groupKey: "g1", x: 10, y: 20, perpX: 1, perpY: 0 };
		const cables = [
			{
				groupKey: "g1",
				groupPortBranch: {
					edges: [makeEdge("e1", "a", "b", "link"), makeEdge("e2", "c", "d", "link")],
				},
			},
		];
		const result = buildPortColorLanes(
			[],
			cables,
			{ colorEdgesByRelation: false, relationColors: new Map(), isDark: true },
			new Map([["g1", gp]]),
		);
		expect(result.has("g1")).toBe(true);
		expect(result.get("g1")!.colors.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Boundary tests for low-coverage pure helpers
// (subtask 145-coverage-drop: routeViaPolarGrid / buildPortColorLanes /
//  cableFadeByDegree / cableWeightThickness)
// ---------------------------------------------------------------------------

describe("routeViaPolarGrid (boundary)", () => {
	const baseCenter = { cx: 0, cy: 0 };

	it("returns [from,to] for coincident endpoints regardless of grid contents", () => {
		const grid: PolarJunctionGrid = {
			rings: [],
			angles: [],
			ringGaps: [],
			angleGaps: [],
			...baseCenter,
		};
		const path = routeViaPolarGrid({ x: 50, y: 50 }, { x: 50, y: 50 }, grid);
		expect(path).toHaveLength(2);
		expect(path[0]).toEqual({ x: 50, y: 50 });
		expect(path[1]).toEqual({ x: 50, y: 50 });
	});

	it("falls back to single radial waypoint when grid is empty", () => {
		// 空 grid: no ringGaps, no angleGaps → fallback radial branch
		const grid: PolarJunctionGrid = {
			rings: [],
			angles: [],
			ringGaps: [],
			angleGaps: [],
			...baseCenter,
		};
		const path = routeViaPolarGrid({ x: 100, y: 0 }, { x: 0, y: 100 }, grid);
		// fallback: from -> outer mid -> to (3 points, all finite)
		expect(path.length).toBeGreaterThanOrEqual(2);
		for (const p of path) {
			expect(Number.isFinite(p.x)).toBe(true);
			expect(Number.isFinite(p.y)).toBe(true);
		}
		// First and last points are the original endpoints (within tolerance)
		expect(path[0]).toEqual({ x: 100, y: 0 });
		expect(path[path.length - 1].x).toBeCloseTo(0, 1);
		expect(path[path.length - 1].y).toBeCloseTo(100, 1);
	});

	it("uses ringGap-only routing when angleGaps is empty (single-ring corridor)", () => {
		// 単一行: one ring corridor available, no angle corridors
		const grid: PolarJunctionGrid = {
			rings: [50, 100],
			angles: [],
			ringGaps: [75],
			angleGaps: [],
			...baseCenter,
		};
		const path = routeViaPolarGrid({ x: 50, y: 0 }, { x: 0, y: 100 }, grid);
		// Should produce >2 points (radial out, arc points, radial in)
		expect(path.length).toBeGreaterThan(2);
		// Endpoints preserved
		expect(path[0]).toEqual({ x: 50, y: 0 });
		expect(path[path.length - 1]).toEqual({ x: 0, y: 100 });
		// Interior arc points should land near gap radius 75
		const mid = path[Math.floor(path.length / 2)];
		const r = Math.sqrt(mid.x ** 2 + mid.y ** 2);
		expect(r).toBeGreaterThan(50);
		expect(r).toBeLessThan(110);
	});

	it("uses full polar routing when both ringGaps and angleGaps populated (all-filled grid)", () => {
		// 全埋まり: both corridors present → full polar branch (radial-arc-radial)
		const grid: PolarJunctionGrid = {
			rings: [50, 100],
			angles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
			ringGaps: [75],
			angleGaps: [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4],
			...baseCenter,
		};
		const path = routeViaPolarGrid({ x: 50, y: 0 }, { x: 0, y: 50 }, grid);
		// Full polar: from + 4 waypoints + arc steps + to → at least 5 points
		expect(path.length).toBeGreaterThanOrEqual(5);
		expect(path[0]).toEqual({ x: 50, y: 0 });
		expect(path[path.length - 1]).toEqual({ x: 0, y: 50 });
		for (const p of path) {
			expect(Number.isFinite(p.x)).toBe(true);
			expect(Number.isFinite(p.y)).toBe(true);
		}
	});

	it("handles port outside the angle grid (uses nearest angle gap)", () => {
		// port外: target far outside the configured angle range — should still
		// snap to nearest angle gap and produce a finite path.
		const grid: PolarJunctionGrid = {
			rings: [40, 80],
			angles: [0, Math.PI / 6],
			ringGaps: [60],
			angleGaps: [Math.PI / 12], // only one narrow corridor near +x axis
			...baseCenter,
		};
		// Target at -x,-y (opposite side from the only angle gap)
		const path = routeViaPolarGrid({ x: 40, y: 0 }, { x: -50, y: -50 }, grid);
		expect(path.length).toBeGreaterThan(2);
		expect(path[0]).toEqual({ x: 40, y: 0 });
		expect(path[path.length - 1]).toEqual({ x: -50, y: -50 });
		for (const p of path) {
			expect(Number.isFinite(p.x)).toBe(true);
			expect(Number.isFinite(p.y)).toBe(true);
		}
	});
});

describe("buildPortColorLanes (boundary)", () => {
	const cfgNoRel = { colorEdgesByRelation: false, relationColors: new Map(), isDark: true };

	it("skips cables whose group has no registered GroupPort", () => {
		// port無し: groupPorts map does not contain the group key
		const cables = [
			{
				groupKey: "missing",
				groupPortBranch: { edges: [makeEdge("e1", "a", "b", "link")] },
			},
		];
		const result = buildPortColorLanes([], cables, cfgNoRel, new Map());
		expect(result.size).toBe(0);
	});

	it("collapses identical-type edges into a single color (single color)", () => {
		// 単色: all edges resolve to the same color → colors array length = 1
		const gp: GroupPort = { groupKey: "g1", x: 0, y: 0, perpX: 1, perpY: 0 };
		const cables = [
			{
				groupKey: "g1",
				groupPortBranch: {
					edges: [
						makeEdge("e1", "a", "b", "link"),
						makeEdge("e2", "c", "d", "link"),
						makeEdge("e3", "e", "f", "link"),
					],
				},
			},
		];
		const result = buildPortColorLanes([], cables, cfgNoRel, new Map([["g1", gp]]));
		expect(result.get("g1")!.colors).toHaveLength(1);
	});

	it("yields multiple distinct colors when edge types differ (multi color)", () => {
		// 多色: types with fixed colors (similar/inheritance/aggregation) produce 3 distinct colors
		const gp: GroupPort = { groupKey: "g1", x: 0, y: 0, perpX: 1, perpY: 0 };
		const cables = [
			{
				groupKey: "g1",
				groupPortBranch: {
					edges: [
						makeEdge("e1", "a", "b", "similar"),
						makeEdge("e2", "c", "d", "inheritance"),
						makeEdge("e3", "e", "f", "aggregation"),
					],
				},
			},
		];
		const result = buildPortColorLanes([], cables, cfgNoRel, new Map([["g1", gp]]));
		const colors = result.get("g1")!.colors;
		expect(colors.length).toBe(3);
		// colors should be sorted ascending
		for (let i = 1; i < colors.length; i++) {
			expect(colors[i]).toBeGreaterThan(colors[i - 1]);
		}
	});

	it("deduplicates repeated edge types into one color (duplicate)", () => {
		// 重複: same type appears many times → Set dedupes to single color
		const gp: GroupPort = { groupKey: "g1", x: 0, y: 0, perpX: 1, perpY: 0 };
		const cables = [
			{
				groupKey: "g1",
				groupPortBranch: {
					edges: [
						makeEdge("e1", "a", "b", "similar"),
						makeEdge("e2", "c", "d", "similar"),
						makeEdge("e3", "e", "f", "similar"),
						makeEdge("e4", "g", "h", "inheritance"),
					],
				},
			},
		];
		const result = buildPortColorLanes([], cables, cfgNoRel, new Map([["g1", gp]]));
		// 4 edges but only 2 unique types → 2 colors
		expect(result.get("g1")!.colors).toHaveLength(2);
	});

	it("ignores cables with empty groupPortBranch edges", () => {
		const gp: GroupPort = { groupKey: "g1", x: 0, y: 0, perpX: 1, perpY: 0 };
		const cables = [
			{ groupKey: "g1", groupPortBranch: { edges: [] } },
			{ groupKey: "g1", groupPortBranch: null },
		];
		const result = buildPortColorLanes([], cables, cfgNoRel, new Map([["g1", gp]]));
		expect(result.size).toBe(0);
	});
});

describe("cableFadeByDegree (boundary)", () => {
	it("returns FADE_BY_DEGREE_MIN_ALPHA when min degree is 0 (deg=0)", () => {
		// deg=0: minDeg=0, t=0, returns floor alpha 0.3
		const cfg = {
			fadeByDegree: true,
			maxDegree: 100,
			degrees: new Map([
				["a", 0],
				["b", 0],
			]),
		};
		const alpha = cableFadeByDegree([makeEdge("e1", "a", "b")], cfg);
		expect(alpha).toBeCloseTo(0.3, 5); // FADE_BY_DEGREE_MIN_ALPHA
	});

	it("produces small but >floor alpha for deg=1", () => {
		// deg=1: t=sqrt(1/maxDegree), barely above floor
		const cfg = {
			fadeByDegree: true,
			maxDegree: 100,
			degrees: new Map([
				["a", 1],
				["b", 1],
			]),
		};
		const alpha = cableFadeByDegree([makeEdge("e1", "a", "b")], cfg);
		expect(alpha).toBeGreaterThan(0.3); // strictly above floor
		expect(alpha).toBeLessThan(0.5); // still much less than full alpha
	});

	it("returns 1 when min degree equals maxDegree (deg=N)", () => {
		// deg=N: t=1 → returns full alpha 1
		const cfg = {
			fadeByDegree: true,
			maxDegree: 7,
			degrees: new Map([
				["a", 7],
				["b", 7],
			]),
		};
		const alpha = cableFadeByDegree([makeEdge("e1", "a", "b")], cfg);
		expect(alpha).toBeCloseTo(1, 5);
	});

	it("returns 1 when fadeByDegree is disabled even with valid degrees (cfg無効)", () => {
		// cfg無効: fadeByDegree=false short-circuits to 1
		const cfg = {
			fadeByDegree: false,
			maxDegree: 100,
			degrees: new Map([
				["a", 1],
				["b", 1],
			]),
		};
		expect(cableFadeByDegree([makeEdge("e1", "a", "b")], cfg)).toBe(1);
	});

	it("returns 1 when edges array is empty (no min reachable)", () => {
		// minDeg stays Infinity for empty edges → early return 1
		const cfg = { fadeByDegree: true, maxDegree: 10, degrees: new Map([["a", 5]]) };
		expect(cableFadeByDegree([], cfg)).toBe(1);
	});

	it("uses min(source,target) per edge and min across edges", () => {
		// Confirm "weakest endpoint of weakest edge" semantics
		const cfg = {
			fadeByDegree: true,
			maxDegree: 100,
			degrees: new Map([
				["a", 100],
				["b", 100],
				["c", 100],
				["d", 1], // weakest endpoint anywhere
			]),
		};
		const alphaStrong = cableFadeByDegree([makeEdge("e1", "a", "b")], cfg);
		const alphaWeak = cableFadeByDegree([makeEdge("e1", "a", "b"), makeEdge("e2", "c", "d")], cfg);
		expect(alphaStrong).toBeGreaterThan(alphaWeak);
	});
});

describe("cableWeightThickness (boundary)", () => {
	it("returns 0 for empty edges array", () => {
		// edges空: edges.length=0 ≤ 1 → returns 0
		expect(cableWeightThickness([], { edgeWeightThickness: true })).toBe(0);
	});

	it("returns 0 for single edge", () => {
		// 単一: edges.length=1 ≤ 1 → returns 0
		expect(cableWeightThickness([makeEdge("e1", "a", "b")], { edgeWeightThickness: true })).toBe(0);
	});

	it("returns 0 when all weights are uniform (no duplicate pair)", () => {
		// 重み一様: every edge is a distinct pair → maxW=1 → returns 0
		const edges = [
			makeEdge("e1", "a", "b"),
			makeEdge("e2", "c", "d"),
			makeEdge("e3", "e", "f"),
			makeEdge("e4", "g", "h"),
		];
		expect(cableWeightThickness(edges, { edgeWeightThickness: true })).toBe(0);
	});

	it("returns positive bonus reflecting max weight when weights are mixed", () => {
		// 重み混在: two duplicates of (a,b), one (c,d), one (e,f) → maxW=2 → log2(2)*0.6 ≈ 0.6
		const edges = [
			makeEdge("e1", "a", "b"),
			makeEdge("e2", "a", "b"),
			makeEdge("e3", "c", "d"),
			makeEdge("e4", "e", "f"),
		];
		const bonus = cableWeightThickness(edges, { edgeWeightThickness: true });
		expect(bonus).toBeGreaterThan(0);
		// log2(2) * WEIGHT_THICKNESS_FACTOR(0.6) = 0.6
		expect(bonus).toBeCloseTo(0.6, 5);
	});

	it("treats undirected pairs symmetrically (a→b same as b→a)", () => {
		// pair key sorts endpoints, so direction does not matter
		const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "b", "a")];
		const bonus = cableWeightThickness(edges, { edgeWeightThickness: true });
		expect(bonus).toBeGreaterThan(0); // counted as duplicate pair
	});

	it("returns 0 when feature is disabled even with duplicate pairs", () => {
		const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "a", "b"), makeEdge("e3", "a", "b")];
		expect(cableWeightThickness(edges, { edgeWeightThickness: false })).toBe(0);
	});
});
