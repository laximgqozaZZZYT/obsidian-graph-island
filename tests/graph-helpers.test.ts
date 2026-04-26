import { describe, it, expect } from "vitest";
import {
	cssColorToHex,
	buildAdj,
	bfsNeighborSet,
	bfsShortestPath,
	bfsDistanceMap,
	collectSubgraph,
	edgeSourceId,
	edgeTargetId,
	shiftHue,
	stringHash,
	hslToHex,
	incCounter,
	buildAdjFromEdges,
	computeNodeBBox,
	buildTagMembership,
	buildMissingNeighborSet,
	computeCompareVenn,
	computePathfinderResult,
} from "../src/utils/graph-helpers";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";

describe("cssColorToHex", () => {
	it("parses hex color #ff0000", () => {
		expect(cssColorToHex("#ff0000")).toBe(0xff0000);
	});

	it("parses hex color #6366f1", () => {
		expect(cssColorToHex("#6366f1")).toBe(0x6366f1);
	});

	it("parses hex color #000000", () => {
		expect(cssColorToHex("#000000")).toBe(0x000000);
	});

	it("parses rgb() format", () => {
		expect(cssColorToHex("rgb(255, 0, 0)")).toBe(0xff0000);
	});

	it("parses rgb() with no spaces", () => {
		expect(cssColorToHex("rgb(0,128,255)")).toBe(0x0080ff);
	});

	it("returns default for unrecognized format", () => {
		expect(cssColorToHex("hsl(0, 100%, 50%)")).toBe(0x6366f1);
	});

	it("returns default for empty string", () => {
		expect(cssColorToHex("")).toBe(0x6366f1);
	});
});

describe("buildAdj", () => {
	it("returns empty adjacency for no nodes", () => {
		const gd: GraphData = { nodes: [], edges: [] };
		const adj = buildAdj(gd);
		expect(adj.size).toBe(0);
	});

	it("creates entries for all nodes", () => {
		const gd: GraphData = {
			nodes: [
				{ id: "a", label: "A", x: 0, y: 0, vx: 0, vy: 0 },
				{ id: "b", label: "B", x: 0, y: 0, vx: 0, vy: 0 },
			],
			edges: [],
		};
		const adj = buildAdj(gd);
		expect(adj.size).toBe(2);
		expect(adj.get("a")!.size).toBe(0);
	});

	it("builds bidirectional adjacency from edges", () => {
		const gd: GraphData = {
			nodes: [
				{ id: "a", label: "A", x: 0, y: 0, vx: 0, vy: 0 },
				{ id: "b", label: "B", x: 0, y: 0, vx: 0, vy: 0 },
				{ id: "c", label: "C", x: 0, y: 0, vx: 0, vy: 0 },
			],
			edges: [
				{ id: "e1", source: "a", target: "b", type: "link" },
				{ id: "e2", source: "b", target: "c", type: "link" },
			],
		};
		const adj = buildAdj(gd);
		expect(adj.get("a")).toEqual(new Set(["b"]));
		expect(adj.get("b")).toEqual(new Set(["a", "c"]));
		expect(adj.get("c")).toEqual(new Set(["b"]));
	});
});

// --- Helpers ---
function mkNode(id: string, extra?: Partial<GraphNode>): GraphNode {
	return { id, label: id, filePath: `${id}.md`, x: 0, y: 0, vx: 0, vy: 0, ...extra } as GraphNode;
}
function mkEdge(s: string, t: string, type?: string): GraphEdge {
	return { id: `${s}-${t}`, source: s, target: t, ...(type ? { type } : {}) } as GraphEdge;
}
function mkAdj(pairs: [string, string][]): Map<string, Set<string>> {
	const adj = new Map<string, Set<string>>();
	for (const [a, b] of pairs) {
		if (!adj.has(a)) adj.set(a, new Set());
		if (!adj.has(b)) adj.set(b, new Set());
		adj.get(a)!.add(b);
		adj.get(b)!.add(a);
	}
	return adj;
}

// =============================================
// edgeSourceId / edgeTargetId
// =============================================
describe("edgeSourceId / edgeTargetId", () => {
	it("extracts string source/target", () => {
		expect(edgeSourceId({ source: "a" })).toBe("a");
		expect(edgeTargetId({ target: "b" })).toBe("b");
	});

	it("extracts object source/target (d3 simulation)", () => {
		expect(edgeSourceId({ source: { id: "x" } })).toBe("x");
		expect(edgeTargetId({ target: { id: "y" } })).toBe("y");
	});
});

// =============================================
// bfsNeighborSet
// =============================================
describe("bfsNeighborSet", () => {
	it("returns only start node for 0 hops", () => {
		const adj = mkAdj([
			["a", "b"],
			["b", "c"],
		]);
		const result = bfsNeighborSet(adj, "a", 0);
		expect(result).toEqual(new Set(["a"]));
	});

	it("1-hop returns immediate neighbors + start", () => {
		const adj = mkAdj([
			["a", "b"],
			["a", "c"],
			["b", "d"],
		]);
		const result = bfsNeighborSet(adj, "a", 1);
		expect(result).toEqual(new Set(["a", "b", "c"]));
	});

	it("2-hop reaches 2nd-degree neighbors", () => {
		const adj = mkAdj([
			["a", "b"],
			["b", "c"],
			["c", "d"],
		]);
		const result = bfsNeighborSet(adj, "a", 2);
		expect(result).toEqual(new Set(["a", "b", "c"]));
	});

	it("large hops covers entire connected component", () => {
		const adj = mkAdj([
			["a", "b"],
			["b", "c"],
			["c", "d"],
		]);
		const result = bfsNeighborSet(adj, "a", 100);
		expect(result).toEqual(new Set(["a", "b", "c", "d"]));
	});

	it("does not cross disconnected components", () => {
		const adj = mkAdj([["a", "b"]]);
		adj.set("c", new Set()); // isolated node
		const result = bfsNeighborSet(adj, "a", 10);
		expect(result.has("c")).toBe(false);
	});

	it("handles unknown start node gracefully", () => {
		const adj = mkAdj([["a", "b"]]);
		const result = bfsNeighborSet(adj, "unknown", 5);
		expect(result).toEqual(new Set(["unknown"]));
	});
});

// =============================================
// bfsShortestPath
// =============================================
describe("bfsShortestPath", () => {
	it("same node returns single-element path", () => {
		const adj = mkAdj([["a", "b"]]);
		expect(bfsShortestPath(adj, "a", "a")).toEqual(["a"]);
	});

	it("direct neighbor returns 2-element path", () => {
		const adj = mkAdj([
			["a", "b"],
			["b", "c"],
		]);
		expect(bfsShortestPath(adj, "a", "b")).toEqual(["a", "b"]);
	});

	it("finds shortest path in diamond graph", () => {
		// a - b - d
		// a - c - d
		const adj = mkAdj([
			["a", "b"],
			["a", "c"],
			["b", "d"],
			["c", "d"],
		]);
		const path = bfsShortestPath(adj, "a", "d");
		expect(path.length).toBe(3); // a → b/c → d
		expect(path[0]).toBe("a");
		expect(path[path.length - 1]).toBe("d");
	});

	it("returns empty for unreachable node", () => {
		const adj = mkAdj([["a", "b"]]);
		adj.set("c", new Set());
		expect(bfsShortestPath(adj, "a", "c")).toEqual([]);
	});

	it("returns empty for unknown nodes", () => {
		const adj = mkAdj([["a", "b"]]);
		expect(bfsShortestPath(adj, "x", "y")).toEqual([]);
	});
});

// =============================================
// collectSubgraph
// =============================================
describe("collectSubgraph", () => {
	it("0-hop subgraph contains only the center node", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
		const adj = mkAdj([
			["a", "b"],
			["b", "c"],
		]);
		const sub = collectSubgraph(adj, "a", 0, nodes, edges);
		expect(sub.nodes.length).toBe(1);
		expect(sub.nodes[0].id).toBe("a");
		expect(sub.edges.length).toBe(0);
	});

	it("1-hop includes center + neighbors + connecting edges", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
		const edges = [mkEdge("a", "b"), mkEdge("a", "c"), mkEdge("b", "d")];
		const adj = mkAdj([
			["a", "b"],
			["a", "c"],
			["b", "d"],
		]);
		const sub = collectSubgraph(adj, "a", 1, nodes, edges);
		expect(sub.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
		// Only edges where both ends are in subgraph
		expect(sub.edges.length).toBe(2); // a-b, a-c (not b-d since d not included)
	});

	it("full-hop subgraph equals original graph", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
		const adj = mkAdj([
			["a", "b"],
			["b", "c"],
		]);
		const sub = collectSubgraph(adj, "a", 100, nodes, edges);
		expect(sub.nodes.length).toBe(3);
		expect(sub.edges.length).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// shiftHue — rotate hue of a hex color (cycle110)
// ---------------------------------------------------------------------------
describe("shiftHue", () => {
	it("0 degree shift returns same color", () => {
		expect(shiftHue(0xff0000, 0)).toBe(0xff0000);
	});

	it("360 degree shift returns same color", () => {
		expect(shiftHue(0xff0000, 360)).toBe(0xff0000);
	});

	it("120 degree shift: red → green", () => {
		const result = shiftHue(0xff0000, 120);
		// Pure red shifted 120° should be approximately green
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		expect(g).toBeGreaterThan(r);
	});

	it("240 degree shift: red → blue", () => {
		const result = shiftHue(0xff0000, 240);
		const r = (result >> 16) & 0xff;
		const b = result & 0xff;
		expect(b).toBeGreaterThan(r);
	});

	it("preserves grayscale (no hue to shift)", () => {
		// Gray has s=0, so hue shift should not change it
		expect(shiftHue(0x808080, 90)).toBe(0x808080);
	});

	it("preserves black", () => {
		expect(shiftHue(0x000000, 180)).toBe(0x000000);
	});

	it("preserves white", () => {
		expect(shiftHue(0xffffff, 90)).toBe(0xffffff);
	});
});

// ---------------------------------------------------------------------------
// stringHash — deterministic hash to range
// ---------------------------------------------------------------------------
describe("stringHash", () => {
	it("returns consistent hash for same input", () => {
		expect(stringHash("hello", 100)).toBe(stringHash("hello", 100));
	});

	it("result is within [0, range)", () => {
		for (const s of ["a", "hello", "日本語", "!@#$%"]) {
			const h = stringHash(s, 50);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(50);
		}
	});

	it("different strings produce different hashes (usually)", () => {
		const hashes = new Set(["a", "b", "c", "d", "e"].map((s) => stringHash(s, 1000)));
		expect(hashes.size).toBeGreaterThan(1);
	});

	it("empty string returns valid result", () => {
		const h = stringHash("", 10);
		expect(h).toBeGreaterThanOrEqual(0);
		expect(h).toBeLessThan(10);
	});

	it("range 1 always returns 0", () => {
		expect(stringHash("anything", 1)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// incCounter — increment map counter
// ---------------------------------------------------------------------------

describe("incCounter", () => {
	it("initializes missing key to delta", () => {
		const map = new Map<string, number>();
		incCounter(map, "a");
		expect(map.get("a")).toBe(1);
	});

	it("increments existing key", () => {
		const map = new Map<string, number>([["a", 5]]);
		incCounter(map, "a");
		expect(map.get("a")).toBe(6);
	});

	it("supports custom delta", () => {
		const map = new Map<string, number>();
		incCounter(map, "x", 10);
		expect(map.get("x")).toBe(10);
		incCounter(map, "x", 3);
		expect(map.get("x")).toBe(13);
	});

	it("handles negative delta", () => {
		const map = new Map<string, number>([["a", 5]]);
		incCounter(map, "a", -2);
		expect(map.get("a")).toBe(3);
	});

	it("works with numeric keys", () => {
		const map = new Map<number, number>();
		incCounter(map, 42);
		incCounter(map, 42);
		expect(map.get(42)).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// buildAdjFromEdges — adjacency list from node/edge arrays
// ---------------------------------------------------------------------------

describe("buildAdjFromEdges", () => {
	it("builds bidirectional adjacency", () => {
		const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
		const edges = [
			{ source: "a", target: "b" },
			{ source: "b", target: "c" },
		];
		const adj = buildAdjFromEdges(nodes, edges);
		expect(adj.get("a")).toEqual(["b"]);
		expect(adj.get("b")).toEqual(["a", "c"]);
		expect(adj.get("c")).toEqual(["b"]);
	});

	it("handles empty edges", () => {
		const nodes = [{ id: "a" }, { id: "b" }];
		const adj = buildAdjFromEdges(nodes, []);
		expect(adj.get("a")).toEqual([]);
		expect(adj.get("b")).toEqual([]);
	});

	it("handles empty nodes", () => {
		const adj = buildAdjFromEdges([], [{ source: "a", target: "b" }]);
		expect(adj.size).toBe(0);
	});

	it("handles self-loops", () => {
		const nodes = [{ id: "a" }];
		const edges = [{ source: "a", target: "a" }];
		const adj = buildAdjFromEdges(nodes, edges);
		expect(adj.get("a")).toEqual(["a", "a"]);
	});

	it("handles multiple edges between same nodes", () => {
		const nodes = [{ id: "a" }, { id: "b" }];
		const edges = [
			{ source: "a", target: "b" },
			{ source: "a", target: "b" },
		];
		const adj = buildAdjFromEdges(nodes, edges);
		expect(adj.get("a")).toEqual(["b", "b"]);
		expect(adj.get("b")).toEqual(["a", "a"]);
	});

	it("ignores edges referencing unknown nodes", () => {
		const nodes = [{ id: "a" }];
		const edges = [{ source: "a", target: "z" }];
		const adj = buildAdjFromEdges(nodes, edges);
		// "a" gets "z" pushed but "z" doesn't exist in map so no push for z→a
		expect(adj.get("a")).toEqual(["z"]);
		expect(adj.has("z")).toBe(false);
	});
});

// Export function tests consolidated into tests/export-formats.test.ts

// =========================================================================
// BFS boundary values
// =========================================================================
describe("bfsNeighborSet boundary", () => {
	it("maxHops=0 returns only start node", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
		]);
		const result = bfsNeighborSet(adj, "a", 0);
		expect(result.size).toBe(1);
		expect(result.has("a")).toBe(true);
	});

	it("start node not in adj returns just start", () => {
		const adj = new Map([["x", new Set(["y"])]]);
		const result = bfsNeighborSet(adj, "z", 3);
		expect(result.size).toBe(1);
		expect(result.has("z")).toBe(true);
	});

	it("self-loop doesn't cause infinite loop", () => {
		const adj = new Map([
			["a", new Set(["a", "b"])],
			["b", new Set(["a"])],
		]);
		const result = bfsNeighborSet(adj, "a", 10);
		expect(result.has("a")).toBe(true);
		expect(result.has("b")).toBe(true);
		expect(result.size).toBe(2);
	});

	it("large chain with limited hops", () => {
		const adj = new Map<string, Set<string>>();
		for (let i = 0; i < 100; i++) {
			const neighbors = new Set<string>();
			if (i > 0) neighbors.add(`n${i - 1}`);
			if (i < 99) neighbors.add(`n${i + 1}`);
			adj.set(`n${i}`, neighbors);
		}
		const result = bfsNeighborSet(adj, "n50", 3);
		expect(result.size).toBe(7);
		expect(result.has("n47")).toBe(true);
		expect(result.has("n53")).toBe(true);
		expect(result.has("n46")).toBe(false);
	});
});

describe("bfsShortestPath boundary", () => {
	it("start equals end returns single-element path", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
		]);
		const path = bfsShortestPath(adj, "a", "a");
		expect(path).toEqual(["a"]);
	});

	it("direct neighbor returns 2-element path", () => {
		const adj = new Map([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
		]);
		const path = bfsShortestPath(adj, "a", "b");
		expect(path).toEqual(["a", "b"]);
	});

	it("unreachable returns empty", () => {
		const adj = new Map([
			["a", new Set<string>()],
			["b", new Set<string>()],
		]);
		expect(bfsShortestPath(adj, "a", "b")).toEqual([]);
	});
});

/* ------------------------------------------------------------------ */
/*  computeNodeBBox                                                    */
/* ------------------------------------------------------------------ */

describe("computeNodeBBox", () => {
	it("computes bbox from nodes with explicit radii", () => {
		const nodes = [
			{ x: 10, y: 20, radius: 5 },
			{ x: 30, y: 40, radius: 10 },
		];
		const bb = computeNodeBBox(nodes);
		expect(bb.minX).toBe(5); // 10 - 5
		expect(bb.minY).toBe(15); // 20 - 5
		expect(bb.maxX).toBe(40); // 30 + 10
		expect(bb.maxY).toBe(50); // 40 + 10
	});

	it("uses default radius when radius is undefined", () => {
		const nodes = [{ x: 0, y: 0 }];
		const bb = computeNodeBBox(nodes);
		expect(bb.minX).toBe(-12);
		expect(bb.maxX).toBe(12);
	});

	it("accepts custom default radius", () => {
		const nodes = [{ x: 0, y: 0 }];
		const bb = computeNodeBBox(nodes, 5);
		expect(bb.minX).toBe(-5);
		expect(bb.maxX).toBe(5);
	});

	it("returns Infinity bounds for empty array", () => {
		const bb = computeNodeBBox([]);
		expect(bb.minX).toBe(Infinity);
		expect(bb.maxX).toBe(-Infinity);
	});

	it("handles single node", () => {
		const bb = computeNodeBBox([{ x: 100, y: 200, radius: 3 }]);
		expect(bb).toEqual({ minX: 97, minY: 197, maxX: 103, maxY: 203 });
	});

	it("handles negative coordinates", () => {
		const bb = computeNodeBBox([
			{ x: -50, y: -30, radius: 10 },
			{ x: 50, y: 30, radius: 10 },
		]);
		expect(bb.minX).toBe(-60);
		expect(bb.minY).toBe(-40);
		expect(bb.maxX).toBe(60);
		expect(bb.maxY).toBe(40);
	});
});

/* ------------------------------------------------------------------ */
/*  buildTagMembership                                                 */
/* ------------------------------------------------------------------ */

describe("buildTagMembership", () => {
	const mkNode = (id: string, tags?: string[], isTag = false): GraphNode =>
		({ id, label: id, x: 0, y: 0, tags, isTag }) as GraphNode;

	it("assigns nodes to most specific (smallest) tag", () => {
		const nodes = [mkNode("a", ["broad", "narrow"]), mkNode("b", ["broad"]), mkNode("c", ["narrow"])];
		const { tagMembership } = buildTagMembership(nodes, []);
		// "narrow" has 2 members (a, c), "broad" has 2 members (a, b)
		// Both have same count=2, but "broad" is first in a's tags → a goes to "broad"?
		// Actually: narrow count=2 (a,c), broad count=2 (a,b) — tie, first tag wins
		// Let's verify: a has ["broad","narrow"]; broad count=2, narrow count=2; bestTag=broad (first)
		expect(tagMembership.get("broad")?.has("a")).toBe(true);
		expect(tagMembership.get("broad")?.has("b")).toBe(true);
		expect(tagMembership.get("narrow")?.has("c")).toBe(true);
	});

	it("skips tag nodes", () => {
		const nodes = [mkNode("tag:foo", ["foo"], true), mkNode("a", ["foo"])];
		const { tagMembership } = buildTagMembership(nodes, []);
		expect(tagMembership.get("foo")?.size).toBe(1);
		expect(tagMembership.get("foo")?.has("a")).toBe(true);
	});

	it("skips nodes without tags", () => {
		const nodes = [mkNode("a"), mkNode("b", [])];
		const { tagMembership } = buildTagMembership(nodes, []);
		expect(tagMembership.size).toBe(0);
	});

	it("builds tag relationship pairs from inheritance edges", () => {
		const nodes = [mkNode("a", ["x"])];
		const edges: GraphEdge[] = [{ source: "tag:alpha", target: "tag:beta", type: "inheritance" } as GraphEdge];
		const { tagRelPairs } = buildTagMembership(nodes, edges);
		expect(tagRelPairs.has("alpha\0beta")).toBe(true);
		expect(tagRelPairs.has("beta\0alpha")).toBe(true);
	});

	it("builds tag relationship pairs from aggregation edges", () => {
		const edges: GraphEdge[] = [{ source: "tag:x", target: "tag:y", type: "aggregation" } as GraphEdge];
		const { tagRelPairs } = buildTagMembership([], edges);
		expect(tagRelPairs.has("x\0y")).toBe(true);
	});

	it("ignores non-tag edges for relationship pairs", () => {
		const edges: GraphEdge[] = [{ source: "tag:x", target: "tag:y", type: "link" } as GraphEdge];
		const { tagRelPairs } = buildTagMembership([], edges);
		expect(tagRelPairs.size).toBe(0);
	});

	it("assigns node to rarer tag when counts differ", () => {
		const nodes = [mkNode("a", ["common", "rare"]), mkNode("b", ["common"]), mkNode("c", ["common"])];
		const { tagMembership } = buildTagMembership(nodes, []);
		// common=3, rare=1 → a goes to rare
		expect(tagMembership.get("rare")?.has("a")).toBe(true);
		expect(tagMembership.get("common")?.has("b")).toBe(true);
		expect(tagMembership.get("common")?.has("c")).toBe(true);
	});
});

/* ------------------------------------------------------------------ */
/*  buildMissingNeighborSet                                            */
/* ------------------------------------------------------------------ */

describe("buildMissingNeighborSet", () => {
	const mkNode = (id: string, tags?: string[]): GraphNode => ({ id, label: id, x: 0, y: 0, tags }) as GraphNode;
	const mkEdge = (src: string, tgt: string): GraphEdge => ({ source: src, target: tgt, type: "link" }) as GraphEdge;

	it("returns null when no missing neighbors", () => {
		const nodes = [mkNode("a", ["t"]), mkNode("b", ["t"])];
		const edges = [mkEdge("a", "b")];
		expect(buildMissingNeighborSet(nodes, edges)).toBeNull();
	});

	it("detects nodes sharing a tag but no edge", () => {
		const nodes = [mkNode("a", ["t"]), mkNode("b", ["t"])];
		const result = buildMissingNeighborSet(nodes, []);
		expect(result).not.toBeNull();
		expect(result!.has("a")).toBe(true);
		expect(result!.has("b")).toBe(true);
	});

	it("returns null for single-node tag groups", () => {
		const nodes = [mkNode("a", ["t1"]), mkNode("b", ["t2"])];
		expect(buildMissingNeighborSet(nodes, [])).toBeNull();
	});

	it("skips tag nodes", () => {
		const nodes = [
			{ id: "tag:t", label: "t", x: 0, y: 0, tags: ["t"], isTag: true } as GraphNode,
			mkNode("a", ["t"]),
		];
		expect(buildMissingNeighborSet(nodes, [])).toBeNull();
	});

	it("handles d3-force object endpoints", () => {
		const nodes = [mkNode("a", ["t"]), mkNode("b", ["t"])];
		const edges = [{ source: { id: "a" }, target: { id: "b" }, type: "link" }] as any;
		expect(buildMissingNeighborSet(nodes, edges)).toBeNull();
	});

	it("marks both nodes of a missing pair", () => {
		const nodes = [mkNode("a", ["t"]), mkNode("b", ["t"]), mkNode("c", ["t"])];
		const edges = [mkEdge("a", "b")]; // a-c and b-c missing
		const result = buildMissingNeighborSet(nodes, edges);
		expect(result).not.toBeNull();
		expect(result!.has("c")).toBe(true);
		// At least one of a or b should be marked (they share tag with c but no edge to c)
		expect(result!.has("a") || result!.has("b")).toBe(true);
	});

	it("handles nodes without tags gracefully", () => {
		const nodes = [mkNode("a"), mkNode("b", ["t"]), mkNode("c", ["t"])];
		const result = buildMissingNeighborSet(nodes, []);
		expect(result).not.toBeNull();
		expect(result!.has("b")).toBe(true);
		expect(result!.has("c")).toBe(true);
		expect(result!.has("a")).toBe(false);
	});
});

// bfsDistanceMap

describe("bfsDistanceMap", () => {
	function makeAdj(pairs: [string, string][]): Map<string, Set<string>> {
		const adj = new Map<string, Set<string>>();
		for (const [a, b] of pairs) {
			if (!adj.has(a)) adj.set(a, new Set());
			if (!adj.has(b)) adj.set(b, new Set());
			adj.get(a)!.add(b);
			adj.get(b)!.add(a);
		}
		return adj;
	}

	it("returns only start node at distance 0 when maxHops=0", () => {
		const adj = makeAdj([
			["a", "b"],
			["b", "c"],
		]);
		const dist = bfsDistanceMap(adj, "a", 0);
		expect(dist.size).toBe(1);
		expect(dist.get("a")).toBe(0);
	});

	it("returns direct neighbors at hop 1", () => {
		const adj = makeAdj([
			["a", "b"],
			["a", "c"],
			["b", "d"],
		]);
		const dist = bfsDistanceMap(adj, "a", 1);
		expect(dist.get("a")).toBe(0);
		expect(dist.get("b")).toBe(1);
		expect(dist.get("c")).toBe(1);
		expect(dist.has("d")).toBe(false);
	});

	it("returns multi-hop distances in a chain", () => {
		const adj = makeAdj([
			["a", "b"],
			["b", "c"],
			["c", "d"],
		]);
		const dist = bfsDistanceMap(adj, "a", 3);
		expect(dist.get("a")).toBe(0);
		expect(dist.get("b")).toBe(1);
		expect(dist.get("c")).toBe(2);
		expect(dist.get("d")).toBe(3);
	});

	it("respects maxHops and does not include nodes beyond it", () => {
		const adj = makeAdj([
			["a", "b"],
			["b", "c"],
			["c", "d"],
		]);
		const dist = bfsDistanceMap(adj, "a", 2);
		expect(dist.has("d")).toBe(false);
		expect(dist.get("c")).toBe(2);
	});

	it("handles isolated node (no neighbors in adj)", () => {
		const adj = new Map<string, Set<string>>();
		const dist = bfsDistanceMap(adj, "isolated", 5);
		expect(dist.size).toBe(1);
		expect(dist.get("isolated")).toBe(0);
	});

	it("handles cyclic graph without infinite loop", () => {
		// a - b - c - a (triangle)
		const adj = makeAdj([
			["a", "b"],
			["b", "c"],
			["c", "a"],
		]);
		const dist = bfsDistanceMap(adj, "a", 10);
		expect(dist.get("a")).toBe(0);
		expect(dist.get("b")).toBe(1);
		expect(dist.get("c")).toBe(1);
		expect(dist.size).toBe(3);
	});

	it("picks shortest distance in a graph with multiple paths", () => {
		// a-b (hop1), a-c-b (hop2) → b should be 1
		const adj = makeAdj([
			["a", "b"],
			["a", "c"],
			["c", "b"],
		]);
		const dist = bfsDistanceMap(adj, "a", 3);
		expect(dist.get("b")).toBe(1);
	});

	it("returns empty map for start not in adj with maxHops=0", () => {
		const adj = makeAdj([["x", "y"]]);
		const dist = bfsDistanceMap(adj, "z", 0);
		expect(dist.size).toBe(1);
		expect(dist.get("z")).toBe(0);
	});
});
