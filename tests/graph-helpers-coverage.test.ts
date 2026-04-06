import { describe, it, expect } from "vitest";
import {
	computeCompareVenn,
	computePathfinderResult,
	buildSimEndA11yMessage,
	resolveViewportSize,
	computeVisibleFraction,
	buildPositionMap,
	computeSvgViewBox,
	nodeColorHex,
} from "../src/utils/graph-helpers";

// ---------------------------------------------------------------------------
// computeCompareVenn
// ---------------------------------------------------------------------------

describe("computeCompareVenn", () => {
	it("returns null for fewer than 2 nodes", () => {
		const adj = new Map<string, Set<string>>();
		expect(computeCompareVenn([], adj)).toBeNull();
		expect(computeCompareVenn(["a"], adj)).toBeNull();
	});

	it("identifies shared and exclusive neighbors", () => {
		const adj = new Map<string, Set<string>>([
			["a", new Set(["c", "d"])],
			["b", new Set(["c", "e"])],
		]);
		const result = computeCompareVenn(["a", "b"], adj)!;
		expect(result).not.toBeNull();
		expect(result.shared).toEqual(new Set(["c"]));
		expect(result.exclusive.get("a")).toEqual(new Set(["d"]));
		expect(result.exclusive.get("b")).toEqual(new Set(["e"]));
	});

	it("excludes compare nodes from neighbor sets", () => {
		const adj = new Map<string, Set<string>>([
			["a", new Set(["b", "c"])],
			["b", new Set(["a", "c"])],
		]);
		const result = computeCompareVenn(["a", "b"], adj)!;
		// "a" and "b" should not appear in each other's neighbor sets
		expect(result.shared).toEqual(new Set(["c"]));
		expect(result.exclusive.get("a")).toEqual(new Set());
		expect(result.exclusive.get("b")).toEqual(new Set());
	});

	it("handles nodes with no neighbors", () => {
		const adj = new Map<string, Set<string>>([
			["a", new Set()],
			["b", new Set()],
		]);
		const result = computeCompareVenn(["a", "b"], adj)!;
		expect(result.shared.size).toBe(0);
		expect(result.exclusive.get("a")!.size).toBe(0);
		expect(result.exclusive.get("b")!.size).toBe(0);
	});

	it("works with 3+ compare nodes", () => {
		const adj = new Map<string, Set<string>>([
			["a", new Set(["x", "y"])],
			["b", new Set(["x", "z"])],
			["c", new Set(["x", "w"])],
		]);
		const result = computeCompareVenn(["a", "b", "c"], adj)!;
		expect(result.shared).toEqual(new Set(["x"]));
		expect(result.exclusive.get("a")).toEqual(new Set(["y"]));
		expect(result.exclusive.get("b")).toEqual(new Set(["z"]));
		expect(result.exclusive.get("c")).toEqual(new Set(["w"]));
	});
});

// ---------------------------------------------------------------------------
// computePathfinderResult
// ---------------------------------------------------------------------------

describe("computePathfinderResult", () => {
	const adj = new Map<string, Set<string>>([
		["a", new Set(["b"])],
		["b", new Set(["a", "c"])],
		["c", new Set(["b"])],
	]);

	it("returns null for null/empty/same start/end", () => {
		expect(computePathfinderResult(adj, null, "b")).toBeNull();
		expect(computePathfinderResult(adj, "a", null)).toBeNull();
		expect(computePathfinderResult(adj, "a", "a")).toBeNull();
		expect(computePathfinderResult(new Map(), "a", "b")).toBeNull();
	});

	it("finds shortest path and builds edge set", () => {
		const result = computePathfinderResult(adj, "a", "c")!;
		expect(result).not.toBeNull();
		expect(result.path).toEqual(["a", "b", "c"]);
		expect(result.nodeSet).toEqual(new Set(["a", "b", "c"]));
		expect(result.edgeSet.has("a→b")).toBe(true);
		expect(result.edgeSet.has("b→a")).toBe(true);
		expect(result.edgeSet.has("b→c")).toBe(true);
		expect(result.edgeSet.has("c→b")).toBe(true);
	});

	it("returns null when no path exists", () => {
		const disconnected = new Map<string, Set<string>>([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
			["c", new Set()],
		]);
		expect(computePathfinderResult(disconnected, "a", "c")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildSimEndA11yMessage
// ---------------------------------------------------------------------------

describe("buildSimEndA11yMessage", () => {
	const labels = {
		graphLoaded: "Graph loaded",
		nodes: "nodes",
		edges: "edges",
		srGuide: "Use arrow keys to navigate.",
	};

	it("builds basic message without guide", () => {
		expect(buildSimEndA11yMessage(10, 20, false, labels)).toBe(
			"Graph loaded: 10 nodes, 20 edges.",
		);
	});

	it("appends screen reader guide on first launch", () => {
		expect(buildSimEndA11yMessage(5, 8, true, labels)).toBe(
			"Graph loaded: 5 nodes, 8 edges. Use arrow keys to navigate.",
		);
	});

	it("handles zero counts", () => {
		expect(buildSimEndA11yMessage(0, 0, false, labels)).toBe(
			"Graph loaded: 0 nodes, 0 edges.",
		);
	});
});

// ---------------------------------------------------------------------------
// resolveViewportSize
// ---------------------------------------------------------------------------

describe("resolveViewportSize", () => {
	it("returns wrapper size when positive", () => {
		expect(resolveViewportSize(1024, 768, 800, 600)).toEqual([1024, 768]);
	});

	it("falls back to renderer size when wrapper is zero", () => {
		expect(resolveViewportSize(0, 0, 1920, 1080)).toEqual([1920, 1080]);
	});

	it("falls back to defaults when both are zero", () => {
		expect(resolveViewportSize(0, 0, 0, 0)).toEqual([800, 600]);
	});

	it("falls back when wrapper width is zero but height is positive", () => {
		expect(resolveViewportSize(0, 768, 1920, 1080)).toEqual([1920, 1080]);
	});
});

// ---------------------------------------------------------------------------
// computeVisibleFraction
// ---------------------------------------------------------------------------

describe("computeVisibleFraction", () => {
	it("returns 0 for empty nodes", () => {
		expect(computeVisibleFraction([], 0, 0, 1, 800, 600)).toBe(0);
	});

	it("returns 1 when all nodes are visible", () => {
		const nodes = [
			{ x: 0, y: 0 },
			{ x: 10, y: 10 },
		];
		expect(computeVisibleFraction(nodes, 5, 5, 1, 800, 600)).toBe(1);
	});

	it("returns fraction when some nodes are outside viewport", () => {
		const nodes = [
			{ x: 0, y: 0 },
			{ x: 5000, y: 5000 },
		];
		const frac = computeVisibleFraction(nodes, 0, 0, 1, 100, 100);
		expect(frac).toBe(0.5);
	});

	it("accounts for scale factor", () => {
		const nodes = [
			{ x: 80, y: 80 },
			{ x: 200, y: 200 },
		];
		// At scale=1, halfW=50 → node at (80,80) is in (|80-100|=20≤50), node at 200 is out.
		// At scale=0.1, halfW=500 → both in
		expect(computeVisibleFraction(nodes, 100, 100, 1, 100, 100)).toBe(0.5);
		expect(computeVisibleFraction(nodes, 100, 100, 0.1, 100, 100)).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// buildPositionMap
// ---------------------------------------------------------------------------

describe("buildPositionMap", () => {
	it("builds map from nodes with x/y", () => {
		const nodes = [
			{ id: "a", x: 10, y: 20 },
			{ id: "b", x: 30, y: 40 },
		];
		const map = buildPositionMap(nodes);
		expect(map.size).toBe(2);
		expect(map.get("a")).toEqual({ x: 10, y: 20 });
	});

	it("skips nodes without coordinates", () => {
		const nodes = [
			{ id: "a", x: 10, y: 20 },
			{ id: "b" },
			{ id: "c", x: undefined, y: undefined },
		];
		const map = buildPositionMap(nodes);
		expect(map.size).toBe(1);
		expect(map.has("b")).toBe(false);
	});

	it("returns empty map for empty array", () => {
		expect(buildPositionMap([]).size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// computeSvgViewBox
// ---------------------------------------------------------------------------

describe("computeSvgViewBox", () => {
	it("computes transform functions for positioned nodes", () => {
		const posMap = new Map([
			["a", { x: 0, y: 0 }],
			["b", { x: 100, y: 100 }],
		]);
		const { tx, ty } = computeSvgViewBox(posMap, 200, 200, 40);
		// tx(0) should be at pad, tx(100) at width-pad
		expect(tx(0)).toBe(40);
		expect(tx(100)).toBe(160);
		expect(ty(0)).toBe(40);
		expect(ty(100)).toBe(160);
	});

	it("handles empty position map with fallback bounds", () => {
		const posMap = new Map<string, { x: number; y: number }>();
		const { tx, ty } = computeSvgViewBox(posMap, 400, 300, 40);
		// With empty map: minX=0, maxX=400, dataW=400, scale=(400-80)/400=0.8
		expect(tx(0)).toBe(40);
		expect(ty(0)).toBe(40);
	});

	it("handles single-point map (zero extent)", () => {
		const posMap = new Map([["a", { x: 50, y: 50 }]]);
		const { tx, ty } = computeSvgViewBox(posMap, 200, 200, 40);
		// dataW=1, dataH=1 → scale = min(120/1, 120/1) = 120
		expect(tx(50)).toBe(40);
		expect(ty(50)).toBe(40);
	});
});

// ---------------------------------------------------------------------------
// nodeColorHex
// ---------------------------------------------------------------------------

describe("nodeColorHex", () => {
	it("converts numeric color to hex string", () => {
		expect(nodeColorHex(0xff0000)).toBe("#ff0000");
		expect(nodeColorHex(0x00ff00)).toBe("#00ff00");
		expect(nodeColorHex(0x0000ff)).toBe("#0000ff");
	});

	it("pads short hex values", () => {
		expect(nodeColorHex(0x000001)).toBe("#000001");
		expect(nodeColorHex(0)).toBe("#000000");
	});

	it("returns fallback for null/undefined", () => {
		expect(nodeColorHex(null)).toBe("#60a5fa");
		expect(nodeColorHex(undefined)).toBe("#60a5fa");
	});

	it("uses custom fallback", () => {
		expect(nodeColorHex(null, "#ffffff")).toBe("#ffffff");
	});
});
