/**
 * EdgeRenderer — ontology classification, port helpers, graph center, bbox
 * Tests for isOntologyEdge, classifyEdgePort, portLaneKey,
 * computeGraphCenter, computeGroupBBox, invalidateBundleCache, buildPairCounts edge cases
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("pixi.js", () => ({}));

import {
	isOntologyEdge,
	classifyEdgePort,
	portLaneKey,
	computeGraphCenter,
	computeGroupBBox,
	invalidateBundleCache,
	buildPairCounts,
	resolveEdgeColor,
	EDGE_TYPE_FALLBACK_COLORS,
	defaultColor,
} from "../src/views/EdgeRenderer";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// isOntologyEdge — classify structural (ontology) edge types
// ---------------------------------------------------------------------------
describe("isOntologyEdge", () => {
	it("returns true for inheritance", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "inheritance" } as GraphEdge)).toBe(true);
	});

	it("returns true for aggregation", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "aggregation" } as GraphEdge)).toBe(true);
	});

	it("returns true for sequence", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "sequence" } as GraphEdge)).toBe(true);
	});

	it("returns false for link", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "link" } as GraphEdge)).toBe(false);
	});

	it("returns false for tag", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "tag" } as GraphEdge)).toBe(false);
	});

	it("returns false for has-tag", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "has-tag" } as GraphEdge)).toBe(false);
	});

	it("returns false for similar", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "similar" } as GraphEdge)).toBe(false);
	});

	it("returns false for sibling", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "sibling" } as GraphEdge)).toBe(false);
	});

	it("returns false for semantic", () => {
		expect(isOntologyEdge({ source: "a", target: "b", type: "semantic" } as GraphEdge)).toBe(false);
	});

	it("returns false for undefined type", () => {
		expect(isOntologyEdge({ source: "a", target: "b" } as GraphEdge)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// classifyEdgePort — determine port direction for a node on an edge
// ---------------------------------------------------------------------------
describe("classifyEdgePort", () => {
	it("returns N when source of non-ontology edge", () => {
		const e = { source: "nodeA", target: "nodeB", type: "link" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeA")).toBe("N");
	});

	it("returns S when target of non-ontology edge", () => {
		const e = { source: "nodeA", target: "nodeB", type: "link" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeB")).toBe("S");
	});

	it("returns E when source of ontology edge (inheritance)", () => {
		const e = { source: "nodeA", target: "nodeB", type: "inheritance" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeA")).toBe("E");
	});

	it("returns W when target of ontology edge (inheritance)", () => {
		const e = { source: "nodeA", target: "nodeB", type: "inheritance" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeB")).toBe("W");
	});

	it("returns E for source of aggregation edge", () => {
		const e = { source: "nodeA", target: "nodeB", type: "aggregation" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeA")).toBe("E");
	});

	it("returns W for target of sequence edge", () => {
		const e = { source: "nodeA", target: "nodeB", type: "sequence" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeB")).toBe("W");
	});

	it("returns N for source of tag edge (non-ontology)", () => {
		const e = { source: "nodeA", target: "nodeB", type: "tag" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeA")).toBe("N");
	});

	it("returns S for target of similar edge (non-ontology)", () => {
		const e = { source: "nodeA", target: "nodeB", type: "similar" } as GraphEdge;
		expect(classifyEdgePort(e, "nodeB")).toBe("S");
	});
});

// ---------------------------------------------------------------------------
// portLaneKey — generate key for port-color-lane grouping
// ---------------------------------------------------------------------------
describe("portLaneKey", () => {
	it("concatenates group key and direction with pipe", () => {
		expect(portLaneKey("groupA", "N")).toBe("groupA|N");
	});

	it("handles empty group key", () => {
		expect(portLaneKey("", "S")).toBe("|S");
	});

	it("handles group key with special chars", () => {
		expect(portLaneKey("folder/sub-folder", "E")).toBe("folder/sub-folder|E");
	});

	it("produces unique keys for different directions", () => {
		const keys = ["N", "S", "E", "W"].map((d) => portLaneKey("g1", d as any));
		expect(new Set(keys).size).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// computeGraphCenter — average of cluster centroids
// ---------------------------------------------------------------------------
describe("computeGraphCenter", () => {
	it("returns (0,0) for empty centroids", () => {
		expect(computeGraphCenter(new Map())).toEqual({ x: 0, y: 0 });
	});

	it("returns the single centroid for one entry", () => {
		const centroids = new Map([["g1", { x: 100, y: 200 }]]);
		expect(computeGraphCenter(centroids)).toEqual({ x: 100, y: 200 });
	});

	it("computes average of multiple centroids", () => {
		const centroids = new Map([
			["g1", { x: 0, y: 0 }],
			["g2", { x: 100, y: 200 }],
		]);
		expect(computeGraphCenter(centroids)).toEqual({ x: 50, y: 100 });
	});

	it("handles negative coordinates", () => {
		const centroids = new Map([
			["a", { x: -100, y: -50 }],
			["b", { x: 100, y: 50 }],
		]);
		expect(computeGraphCenter(centroids)).toEqual({ x: 0, y: 0 });
	});

	it("handles three centroids", () => {
		const centroids = new Map([
			["a", { x: 0, y: 0 }],
			["b", { x: 30, y: 60 }],
			["c", { x: 60, y: 120 }],
		]);
		const center = computeGraphCenter(centroids);
		expect(center.x).toBe(30);
		expect(center.y).toBe(60);
	});
});

// ---------------------------------------------------------------------------
// computeGroupBBox — bounding box with margin from node positions
// ---------------------------------------------------------------------------
describe("computeGroupBBox", () => {
	it("returns null when no nodes match the group", () => {
		const nodeClusterMap = new Map([["n1", "groupB"]]);
		const resolvePos = (id: string) => ({ x: 0, y: 0 });
		expect(computeGroupBBox("groupA", resolvePos, nodeClusterMap, 10)).toBeNull();
	});

	it("returns null for empty nodeClusterMap", () => {
		const resolvePos = () => ({ x: 0, y: 0 });
		expect(computeGroupBBox("g", resolvePos, new Map(), 5)).toBeNull();
	});

	it("computes bbox for single node with margin", () => {
		const nodeClusterMap = new Map([["n1", "g1"]]);
		const resolvePos = () => ({ x: 50, y: 100 });
		const bbox = computeGroupBBox("g1", resolvePos, nodeClusterMap, 10);
		expect(bbox).not.toBeNull();
		expect(bbox!.minX).toBe(40);
		expect(bbox!.minY).toBe(90);
		expect(bbox!.maxX).toBe(60);
		expect(bbox!.maxY).toBe(110);
	});

	it("computes bbox for multiple nodes", () => {
		const nodeClusterMap = new Map([
			["n1", "g1"],
			["n2", "g1"],
			["n3", "g2"], // different group
		]);
		const positions: Record<string, { x: number; y: number }> = {
			n1: { x: 0, y: 0 },
			n2: { x: 100, y: 200 },
			n3: { x: 999, y: 999 },
		};
		const resolvePos = (id: string) => positions[id as string];
		const bbox = computeGroupBBox("g1", resolvePos, nodeClusterMap, 5);
		expect(bbox).not.toBeNull();
		expect(bbox!.minX).toBe(-5);
		expect(bbox!.minY).toBe(-5);
		expect(bbox!.maxX).toBe(105);
		expect(bbox!.maxY).toBe(205);
	});

	it("skips nodes with undefined positions", () => {
		const nodeClusterMap = new Map([
			["n1", "g1"],
			["n2", "g1"],
		]);
		const resolvePos = (id: string) => (id === "n1" ? { x: 50, y: 50 } : undefined);
		const bbox = computeGroupBBox("g1", resolvePos, nodeClusterMap, 0);
		expect(bbox).not.toBeNull();
		expect(bbox!.minX).toBe(50);
		expect(bbox!.maxX).toBe(50);
	});

	it("returns null when all positions are undefined", () => {
		const nodeClusterMap = new Map([["n1", "g1"]]);
		const resolvePos = () => undefined;
		expect(computeGroupBBox("g1", resolvePos, nodeClusterMap, 10)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// invalidateBundleCache — clears the cached bundle data
// ---------------------------------------------------------------------------
describe("invalidateBundleCache", () => {
	it("does not throw when called with no arguments", () => {
		expect(() => invalidateBundleCache()).not.toThrow();
	});

	it("does not throw when called with undefined", () => {
		expect(() => invalidateBundleCache(undefined)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// buildPairCounts — edge cases
// ---------------------------------------------------------------------------
describe("buildPairCounts edge cases", () => {
	it("returns empty map for no edges", () => {
		expect(buildPairCounts([]).size).toBe(0);
	});

	it("counts self-loops", () => {
		const edges = [{ source: "a", target: "a", type: "link" }] as GraphEdge[];
		const counts = buildPairCounts(edges);
		expect(counts.get("a:a")).toBe(1);
	});

	it("treats A→B and B→A as same pair (sorted)", () => {
		const edges = [
			{ source: "a", target: "b", type: "link" },
			{ source: "b", target: "a", type: "tag" },
		] as GraphEdge[];
		const counts = buildPairCounts(edges);
		expect(counts.get("a:b")).toBe(2);
	});

	it("handles multiple edges between same pair", () => {
		const edges = Array.from({ length: 5 }, () => ({ source: "x", target: "y", type: "link" }) as GraphEdge);
		const counts = buildPairCounts(edges);
		expect(counts.get("x:y")).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// resolveEdgeColor — additional edge cases
// ---------------------------------------------------------------------------
describe("resolveEdgeColor edge cases", () => {
	it("returns default dark color when useRelColor is false and no spec color", () => {
		const e = { source: "a", target: "b", type: "link" } as GraphEdge;
		const color = resolveEdgeColor(e, false, new Map(), true);
		expect(color).toBe(defaultColor(true));
	});

	it("returns default light color when useRelColor is false", () => {
		const e = { source: "a", target: "b", type: "link" } as GraphEdge;
		const color = resolveEdgeColor(e, false, new Map(), false);
		expect(color).toBe(defaultColor(false));
	});

	it("uses relation color when available", () => {
		const e = { source: "a", target: "b", type: "link", relation: "related.0" } as GraphEdge;
		const relationColors = new Map([["related.0", "#ff0000"]]);
		const color = resolveEdgeColor(e, true, relationColors, true);
		expect(color).toBe(0xff0000);
	});

	it("falls back to edge-type color when relation not in map", () => {
		const e = { source: "a", target: "b", type: "link", relation: "unknown" } as GraphEdge;
		const expected = EDGE_TYPE_FALLBACK_COLORS.get("link");
		const color = resolveEdgeColor(e, true, new Map(), true);
		expect(color).toBe(expected);
	});

	it("returns spec color for typed edges regardless of useRelColor", () => {
		// inheritance has a fixed spec color
		const e = { source: "a", target: "b", type: "inheritance" } as GraphEdge;
		const color1 = resolveEdgeColor(e, false, new Map(), true);
		const color2 = resolveEdgeColor(e, true, new Map(), true);
		expect(color1).toBe(color2);
		expect(typeof color1).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// defaultColor — dark vs light
// ---------------------------------------------------------------------------
describe("defaultColor", () => {
	it("returns different colors for dark and light themes", () => {
		expect(defaultColor(true)).not.toBe(defaultColor(false));
	});

	it("dark color is darker than light color", () => {
		const dark = defaultColor(true);
		const light = defaultColor(false);
		// Dark theme gray is ~0x666666, light is ~0x999999
		expect(dark).toBeLessThan(light);
	});
});
