import { describe, it, expect } from "vitest";
import { parseConfig, filterLocalGraph, layoutConcentric, getColor } from "../src/views/EmbeddedGraphRenderer";
import { makeGraphData } from "./helpers/factories";
import { DEFAULT_COLORS, type GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// parseConfig — JSON parse with fallback
// ---------------------------------------------------------------------------
describe("parseConfig", () => {
	it("parses valid JSON", () => {
		const cfg = parseConfig('{"center":"test.md","hops":2}');
		expect(cfg.center).toBe("test.md");
		expect(cfg.hops).toBe(2);
	});

	it("returns empty object for invalid JSON", () => {
		expect(parseConfig("not json")).toEqual({});
	});

	it("returns empty object for empty string", () => {
		expect(parseConfig("")).toEqual({});
	});

	it("handles JSON with extra fields", () => {
		const cfg = parseConfig('{"center":"a.md","unknown":true}');
		expect(cfg.center).toBe("a.md");
	});
});

// ---------------------------------------------------------------------------
// filterLocalGraph — BFS N-hop filter
// ---------------------------------------------------------------------------
describe("filterLocalGraph", () => {
	it("returns empty when center not found", () => {
		const data = makeGraphData({ nodes: ["a", "b"], edges: [["a", "b"]] });
		const result = filterLocalGraph(data, "nonexistent", 1);
		expect(result.nodes).toHaveLength(0);
		expect(result.edges).toHaveLength(0);
	});

	it("0 hops returns only center node", () => {
		const data = makeGraphData({
			nodes: ["a", "b", "c"],
			edges: [
				["a", "b"],
				["b", "c"],
			],
		});
		const result = filterLocalGraph(data, "a", 0);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe("a");
		expect(result.edges).toHaveLength(0);
	});

	it("1 hop returns center + direct neighbors", () => {
		const data = makeGraphData({
			nodes: ["a", "b", "c", "d"],
			edges: [
				["a", "b"],
				["b", "c"],
				["c", "d"],
			],
		});
		const result = filterLocalGraph(data, "a", 1);
		expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
		expect(result.edges).toHaveLength(1); // a→b only
	});

	it("2 hops expands to 2nd degree neighbors", () => {
		const data = makeGraphData({
			nodes: ["a", "b", "c", "d"],
			edges: [
				["a", "b"],
				["b", "c"],
				["c", "d"],
			],
		});
		const result = filterLocalGraph(data, "a", 2);
		expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
	});

	it("large hops returns all reachable nodes", () => {
		const data = makeGraphData({
			nodes: ["a", "b", "c"],
			edges: [
				["a", "b"],
				["b", "c"],
			],
		});
		const result = filterLocalGraph(data, "a", 100);
		expect(result.nodes).toHaveLength(3);
		expect(result.edges).toHaveLength(2);
	});

	it("disconnected nodes are excluded", () => {
		const data = makeGraphData({
			nodes: ["a", "b", "isolated"],
			edges: [["a", "b"]],
		});
		const result = filterLocalGraph(data, "a", 10);
		expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
	});

	it("edges between unreachable nodes are excluded", () => {
		const data = makeGraphData({
			nodes: ["a", "b", "c", "d"],
			edges: [
				["a", "b"],
				["c", "d"],
			],
		});
		const result = filterLocalGraph(data, "a", 1);
		// Only a-b edge, not c-d
		expect(result.edges).toHaveLength(1);
	});

	it("bidirectional edges: both directions reachable", () => {
		const data = makeGraphData({
			nodes: ["a", "b"],
			edges: [["a", "b"]],
		});
		// Starting from b, should reach a via reverse edge
		const result = filterLocalGraph(data, "b", 1);
		expect(result.nodes).toHaveLength(2);
	});

	it("handles graph with no edges", () => {
		const data = makeGraphData({ nodes: ["a", "b"] });
		const result = filterLocalGraph(data, "a", 5);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe("a");
	});

	// --- Boundary values (cycle123) ---

	it("star graph: 1 hop from hub reaches all leaves", () => {
		const data = makeGraphData({
			nodes: ["hub", "leaf1", "leaf2", "leaf3", "leaf4", "leaf5"],
			edges: [
				["hub", "leaf1"],
				["hub", "leaf2"],
				["hub", "leaf3"],
				["hub", "leaf4"],
				["hub", "leaf5"],
			],
		});
		const result = filterLocalGraph(data, "hub", 1);
		expect(result.nodes).toHaveLength(6);
		expect(result.edges).toHaveLength(5);
	});

	it("long chain: hop limit respected", () => {
		const nodes = Array.from({ length: 10 }, (_, i) => `n${i}`);
		const edges: [string, string][] = [];
		for (let i = 0; i < 9; i++) edges.push([`n${i}`, `n${i + 1}`]);
		const data = makeGraphData({ nodes, edges });
		const result = filterLocalGraph(data, "n0", 3);
		// Should reach n0, n1, n2, n3 (4 nodes)
		expect(result.nodes).toHaveLength(4);
		expect(result.nodes.map((n) => n.id).sort()).toEqual(["n0", "n1", "n2", "n3"]);
	});

	it("cycle graph: doesn't revisit nodes", () => {
		const data = makeGraphData({
			nodes: ["a", "b", "c"],
			edges: [
				["a", "b"],
				["b", "c"],
				["c", "a"],
			],
		});
		const result = filterLocalGraph(data, "a", 10);
		expect(result.nodes).toHaveLength(3); // all reachable, no duplicates
	});

	it("negative hops treated as 0 (center only)", () => {
		const data = makeGraphData({ nodes: ["a", "b"], edges: [["a", "b"]] });
		const result = filterLocalGraph(data, "a", -1);
		// Negative hops → BFS runs 0 iterations → only center
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe("a");
	});
});

// ---------------------------------------------------------------------------
// parseConfig — additional boundary values (cycle123)
// ---------------------------------------------------------------------------
describe("parseConfig boundary values", () => {
	it("handles JSON with nested objects", () => {
		const cfg = parseConfig('{"center":"a.md","layout":{"type":"force"}}');
		expect(cfg.center).toBe("a.md");
		expect(cfg.layout).toEqual({ type: "force" });
	});

	it("handles JSON with arrays", () => {
		const cfg = parseConfig('{"tags":["a","b","c"]}');
		expect(cfg.tags).toEqual(["a", "b", "c"]);
	});

	it("handles whitespace-only input", () => {
		expect(parseConfig("   ")).toEqual({});
	});

	it("handles null JSON value", () => {
		const cfg = parseConfig("null");
		// JSON.parse("null") returns null, not {}
		expect(cfg === null || (typeof cfg === "object" && Object.keys(cfg).length === 0)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// getColor — DEFAULT_COLORS index cycler
// ---------------------------------------------------------------------------
describe("getColor", () => {
	it("returns the first color for index 0", () => {
		expect(getColor(0)).toBe(DEFAULT_COLORS[0]);
	});

	it("returns each color in DEFAULT_COLORS for sequential indices", () => {
		for (let i = 0; i < DEFAULT_COLORS.length; i++) {
			expect(getColor(i)).toBe(DEFAULT_COLORS[i]);
		}
	});

	it("wraps around at the end of DEFAULT_COLORS", () => {
		const len = DEFAULT_COLORS.length;
		expect(getColor(len)).toBe(DEFAULT_COLORS[0]);
		expect(getColor(len + 1)).toBe(DEFAULT_COLORS[1]);
	});

	it("wraps around for very large indices", () => {
		const len = DEFAULT_COLORS.length;
		expect(getColor(len * 100)).toBe(DEFAULT_COLORS[0]);
		expect(getColor(len * 5 + 3)).toBe(DEFAULT_COLORS[3]);
	});

	it("returns a hex-formatted CSS color string", () => {
		const c = getColor(0);
		expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
	});
});

// ---------------------------------------------------------------------------
// layoutConcentric — center node + concentric rings layout
// ---------------------------------------------------------------------------
describe("layoutConcentric", () => {
	function makePlainNode(id: string, filePath?: string): GraphNode {
		return { id, label: id, filePath, meta: {} } as GraphNode;
	}

	it("returns silently for empty array", () => {
		const nodes: GraphNode[] = [];
		expect(() => layoutConcentric(nodes)).not.toThrow();
		expect(nodes).toEqual([]);
	});

	it("places single node at origin", () => {
		const nodes = [makePlainNode("a")];
		layoutConcentric(nodes);
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("places center at origin when centerPath matches id", () => {
		const nodes = [makePlainNode("a"), makePlainNode("b"), makePlainNode("c")];
		layoutConcentric(nodes, "b");
		expect(nodes[1].x).toBe(0);
		expect(nodes[1].y).toBe(0);
	});

	it("places center at origin when centerPath matches filePath", () => {
		const nodes = [makePlainNode("a", "folder/a.md"), makePlainNode("b", "folder/b.md")];
		layoutConcentric(nodes, "folder/b.md");
		expect(nodes[1].x).toBe(0);
		expect(nodes[1].y).toBe(0);
	});

	it("defaults center to index 0 when centerPath is omitted", () => {
		const nodes = [makePlainNode("a"), makePlainNode("b")];
		layoutConcentric(nodes);
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("falls back to index 0 when centerPath has no match", () => {
		const nodes = [makePlainNode("a"), makePlainNode("b")];
		layoutConcentric(nodes, "nonexistent");
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
		// Non-center node is placed (not left at NaN/undefined)
		expect(typeof nodes[1].x).toBe("number");
		expect(typeof nodes[1].y).toBe("number");
	});

	it("places non-center nodes on a ring of radius 80 (ring 0)", () => {
		// 1 center + 4 leaves all fit in ring 0 (capacity 8)
		const nodes = [
			makePlainNode("c"),
			makePlainNode("a"),
			makePlainNode("b"),
			makePlainNode("d"),
			makePlainNode("e"),
		];
		layoutConcentric(nodes);
		// Skip index 0 (center). Others are placed at radius 80.
		for (let i = 1; i < nodes.length; i++) {
			const r = Math.hypot(nodes[i].x, nodes[i].y);
			expect(r).toBeCloseTo(80);
		}
	});

	it("ring 0 has up to 8 nodes; 9th node spills into ring 1 (radius 160)", () => {
		// 1 center + 9 leaves: first 8 → ring 0, 9th → ring 1
		const nodes: GraphNode[] = [];
		for (let i = 0; i < 10; i++) nodes.push(makePlainNode(`n${i}`));
		layoutConcentric(nodes);
		// nodes[0] is center
		// nodes[1..8] are ring 0 leaves at radius 80
		for (let i = 1; i <= 8; i++) {
			expect(Math.hypot(nodes[i].x, nodes[i].y)).toBeCloseTo(80);
		}
		// nodes[9] is the 9th leaf → ring 1 → radius 160
		expect(Math.hypot(nodes[9].x, nodes[9].y)).toBeCloseTo(160);
	});

	it("non-center nodes are angularly spaced around origin", () => {
		// 1 center + 4 leaves: angles 0, π/2, π, 3π/2 (cap=8 in ring 0; angle = 2π * idx / 8)
		const nodes: GraphNode[] = [];
		for (let i = 0; i < 5; i++) nodes.push(makePlainNode(`n${i}`));
		layoutConcentric(nodes);
		// idx 0..3 within ring 0 (cap=8): angles = 2π * idx / 8 = idx * π/4
		expect(nodes[1].x).toBeCloseTo(80 * Math.cos(0));
		expect(nodes[1].y).toBeCloseTo(80 * Math.sin(0));
		expect(nodes[2].x).toBeCloseTo(80 * Math.cos(Math.PI / 4));
		expect(nodes[2].y).toBeCloseTo(80 * Math.sin(Math.PI / 4));
		expect(nodes[3].x).toBeCloseTo(80 * Math.cos(Math.PI / 2));
		expect(nodes[3].y).toBeCloseTo(80 * Math.sin(Math.PI / 2));
	});

	it("center can be at any index (not just 0)", () => {
		const nodes = [makePlainNode("a"), makePlainNode("b"), makePlainNode("c")];
		layoutConcentric(nodes, "c");
		expect(nodes[2].x).toBe(0);
		expect(nodes[2].y).toBe(0);
		// nodes[0] and nodes[1] are placed on ring 0
		expect(Math.hypot(nodes[0].x, nodes[0].y)).toBeCloseTo(80);
		expect(Math.hypot(nodes[1].x, nodes[1].y)).toBeCloseTo(80);
	});

	it("does not move the center node when invoked twice", () => {
		const nodes = [makePlainNode("a"), makePlainNode("b")];
		layoutConcentric(nodes, "a");
		layoutConcentric(nodes, "a");
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("ring 1 fills 16 slots before spilling to ring 2 (radius 240)", () => {
		// 1 center + 8 (ring 0) + 16 (ring 1) + 1 (ring 2) = 26 nodes
		const nodes: GraphNode[] = [];
		for (let i = 0; i < 26; i++) nodes.push(makePlainNode(`n${i}`));
		layoutConcentric(nodes);
		// nodes[1..8] in ring 0 (radius 80)
		// nodes[9..24] in ring 1 (radius 160)
		// nodes[25] in ring 2 (radius 240)
		expect(Math.hypot(nodes[24].x, nodes[24].y)).toBeCloseTo(160);
		expect(Math.hypot(nodes[25].x, nodes[25].y)).toBeCloseTo(240);
	});
});
