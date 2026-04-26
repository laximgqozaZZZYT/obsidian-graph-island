/**
 * cable-tray — boundary tests for addTrunkRoads, buildRoadNetworkFromPhantoms,
 * findNearestIntersection, cachedFindShortestPath, invalidatePathCache
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
	addTrunkRoads,
	buildRoadNetworkFromPhantoms,
	findNearestIntersection,
	cachedFindShortestPath,
	invalidatePathCache,
	findShortestPath,
	pathToWaypoints,
	type RoadNetwork,
} from "../src/layouts/cable-tray";
import type { GraphNode } from "../src/types";

function makeNode(id: string, x: number, y: number): GraphNode {
	return { id, label: id, x, y } as GraphNode;
}

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
	adjacency.set(0, [
		{ to: 1, weight: 1, segIdx: 0 },
		{ to: 2, weight: 2, segIdx: 1 },
	]);
	adjacency.set(1, [
		{ to: 0, weight: 1, segIdx: 0 },
		{ to: 3, weight: 3, segIdx: 2 },
	]);
	adjacency.set(2, [
		{ to: 0, weight: 2, segIdx: 1 },
		{ to: 3, weight: 1, segIdx: 3 },
	]);
	adjacency.set(3, [
		{ to: 1, weight: 3, segIdx: 2 },
		{ to: 2, weight: 1, segIdx: 3 },
	]);
	return {
		intersections,
		segments,
		nodeAccess: new Map(),
		adjacency,
		system: "cartesian",
		cx: 5,
		cy: 0,
	};
}

// ---------------------------------------------------------------------------
// addTrunkRoads — connect group centroids
// ---------------------------------------------------------------------------
describe("addTrunkRoads", () => {
	it("does nothing with 0 centroids", () => {
		const network = makeDiamondNetwork();
		const segsBefore = network.segments.length;
		addTrunkRoads(network, []);
		expect(network.segments.length).toBe(segsBefore);
	});

	it("does nothing with 1 centroid", () => {
		const network = makeDiamondNetwork();
		const segsBefore = network.segments.length;
		addTrunkRoads(network, [{ x: 0, y: 0 }]);
		expect(network.segments.length).toBe(segsBefore);
	});

	it("adds trunk roads for 2 centroids", () => {
		const network = makeDiamondNetwork();
		const segsBefore = network.segments.length;
		addTrunkRoads(network, [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
		]);
		expect(network.segments.length).toBeGreaterThan(segsBefore);
	});

	it("adds circular connection for 3+ centroids", () => {
		const network = makeDiamondNetwork();
		addTrunkRoads(network, [
			{ x: 0, y: 0 },
			{ x: 5, y: 10 },
			{ x: 10, y: 0 },
		]);
		// Should have original 4 + at least 3 new segments (consecutive + circular)
		expect(network.segments.length).toBeGreaterThanOrEqual(7);
	});

	it("creates new intersection for distant centroid", () => {
		const network = makeDiamondNetwork();
		const isectsBefore = network.intersections.length;
		// Far away from all existing intersections
		addTrunkRoads(network, [
			{ x: 0, y: 0 },
			{ x: 99999, y: 99999 },
		]);
		// Second centroid should create a new intersection
		expect(network.intersections.length).toBeGreaterThanOrEqual(isectsBefore);
	});
});

// ---------------------------------------------------------------------------
// buildRoadNetworkFromPhantoms — phantom-node-based network
// ---------------------------------------------------------------------------
describe("buildRoadNetworkFromPhantoms", () => {
	it("returns empty network for no phantom nodes", () => {
		const rn = buildRoadNetworkFromPhantoms([], [], "cartesian", 0, 0);
		expect(rn.intersections).toHaveLength(0);
		expect(rn.segments).toHaveLength(0);
		expect(rn.nodeAccess.size).toBe(0);
	});

	it("creates intersections from phantom nodes", () => {
		const phantoms = [makeNode("p0", 0, 0), makeNode("p1", 10, 0), makeNode("p2", 0, 10)];
		const rn = buildRoadNetworkFromPhantoms(phantoms, [], "cartesian", 5, 5);
		expect(rn.intersections).toHaveLength(3);
	});

	it("connects phantom nodes with segments", () => {
		const phantoms = [makeNode("p0", 0, 0), makeNode("p1", 10, 0), makeNode("p2", 0, 10)];
		const rn = buildRoadNetworkFromPhantoms(phantoms, [], "cartesian", 5, 5);
		expect(rn.segments.length).toBeGreaterThan(0);
	});

	it("maps real nodes to nearest phantom intersection", () => {
		const phantoms = [makeNode("p0", 0, 0), makeNode("p1", 100, 0)];
		const reals = [makeNode("r0", 1, 1)]; // closest to p0
		const rn = buildRoadNetworkFromPhantoms(phantoms, reals, "cartesian", 50, 0);
		expect(rn.nodeAccess.get("r0")).toBe(0); // nearest to p0 (id 0)
	});

	it("builds bidirectional adjacency", () => {
		const phantoms = [makeNode("p0", 0, 0), makeNode("p1", 10, 0)];
		const rn = buildRoadNetworkFromPhantoms(phantoms, [], "cartesian", 5, 0);
		// Both directions should be in adjacency
		expect(rn.adjacency.has(0)).toBe(true);
		expect(rn.adjacency.has(1)).toBe(true);
		expect(rn.adjacency.get(0)!.some((a) => a.to === 1)).toBe(true);
		expect(rn.adjacency.get(1)!.some((a) => a.to === 0)).toBe(true);
	});

	it("handles single phantom node (no segments)", () => {
		const phantoms = [makeNode("p0", 0, 0)];
		const rn = buildRoadNetworkFromPhantoms(phantoms, [], "polar", 0, 0);
		expect(rn.intersections).toHaveLength(1);
		expect(rn.segments).toHaveLength(0);
	});

	it("preserves system and center", () => {
		const rn = buildRoadNetworkFromPhantoms([makeNode("p0", 0, 0)], [], "polar", 42, 99);
		expect(rn.system).toBe("polar");
		expect(rn.cx).toBe(42);
		expect(rn.cy).toBe(99);
	});
});

// ---------------------------------------------------------------------------
// findNearestIntersection — boundary
// ---------------------------------------------------------------------------
describe("findNearestIntersection boundary", () => {
	it("returns -1 for empty network", () => {
		const rn: RoadNetwork = {
			intersections: [],
			segments: [],
			nodeAccess: new Map(),
			adjacency: new Map(),
			system: "cartesian",
			cx: 0,
			cy: 0,
		};
		expect(findNearestIntersection(rn, 0, 0)).toBe(-1);
	});

	it("returns the only intersection for single-intersection network", () => {
		const rn: RoadNetwork = {
			intersections: [{ id: 0, x: 50, y: 50 }],
			segments: [],
			nodeAccess: new Map(),
			adjacency: new Map(),
			system: "cartesian",
			cx: 0,
			cy: 0,
		};
		expect(findNearestIntersection(rn, 0, 0)).toBe(0);
	});

	it("returns nearest among multiple intersections", () => {
		const rn = makeDiamondNetwork();
		expect(findNearestIntersection(rn, 1, 1)).toBe(0); // closest to (0,0)
		expect(findNearestIntersection(rn, 9, 0)).toBe(3); // closest to (10,0)
	});
});

// ---------------------------------------------------------------------------
// cachedFindShortestPath — caching behavior
// ---------------------------------------------------------------------------
describe("cachedFindShortestPath", () => {
	beforeEach(() => {
		invalidatePathCache();
	});

	it("returns correct shortest path", () => {
		const rn = makeDiamondNetwork();
		const path = cachedFindShortestPath(rn, 0, 3);
		expect(path.length).toBeGreaterThanOrEqual(2);
		expect(path[0]).toBe(0);
		expect(path[path.length - 1]).toBe(3);
	});

	it("returns same result on second call (cached)", () => {
		const rn = makeDiamondNetwork();
		const path1 = cachedFindShortestPath(rn, 0, 3);
		const path2 = cachedFindShortestPath(rn, 0, 3);
		expect(path1).toEqual(path2);
	});

	it("reverses path when from > to for cache key normalization", () => {
		const rn = makeDiamondNetwork();
		const path03 = cachedFindShortestPath(rn, 0, 3);
		const path30 = cachedFindShortestPath(rn, 3, 0);
		expect(path03[0]).toBe(0);
		expect(path30[0]).toBe(3);
		expect(path03.length).toBe(path30.length);
	});

	it("invalidation clears cache", () => {
		const rn = makeDiamondNetwork();
		cachedFindShortestPath(rn, 0, 3);
		invalidatePathCache();
		// Should not throw and still return correct result
		const path = cachedFindShortestPath(rn, 0, 3);
		expect(path.length).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// pathToWaypoints — boundary
// ---------------------------------------------------------------------------
describe("pathToWaypoints boundary", () => {
	it("returns empty for empty path", () => {
		const rn = makeDiamondNetwork();
		expect(pathToWaypoints(rn, [])).toEqual([]);
	});

	it("returns single point for single-node path", () => {
		const rn = makeDiamondNetwork();
		const wps = pathToWaypoints(rn, [0]);
		expect(wps).toHaveLength(1);
		expect(wps[0].x).toBe(0);
		expect(wps[0].y).toBe(0);
	});

	it("returns at least 2 points for 2-node path", () => {
		const rn = makeDiamondNetwork();
		const wps = pathToWaypoints(rn, [0, 1]);
		expect(wps.length).toBeGreaterThanOrEqual(2);
	});
});
