// ---------------------------------------------------------------------------
// Tests for SearchOrchestrator — pure search/filter functions
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
	parseHopFilters,
	computeHopSet,
	filterBySearchExpr,
	classifySearchMatch,
	countSearchMatches,
	computeCardHaloGeometry,
	expandLocalGraphNeighbors,
	capNodesByDegree,
	buildRichStatus,
	computePathfinderBFS,
	computeEntropyScores,
} from "../src/views/SearchOrchestrator";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helper: create a minimal GraphNode
// ---------------------------------------------------------------------------
function mkNode(id: string, label?: string, extra?: Partial<GraphNode>): GraphNode {
	return {
		id,
		label: label ?? id,
		isTag: false,
		filePath: `${id}.md`,
		...extra,
	} as GraphNode;
}

// ---------------------------------------------------------------------------
// parseHopFilters
// ---------------------------------------------------------------------------
describe("parseHopFilters", () => {
	it("returns empty when no hop patterns", () => {
		const r = parseHopFilters("tag:character");
		expect(r.hopFilters).toHaveLength(0);
		expect(r.remainingText).toBe("tag:character");
	});

	it("parses a single hop filter", () => {
		const r = parseHopFilters("hop:alice:3");
		expect(r.hopFilters).toEqual([{ name: "alice", hops: 3 }]);
		expect(r.remainingText).toBe("");
	});

	it("parses multiple hop filters mixed with text", () => {
		const r = parseHopFilters("hop:alice:2,hop:bob:1,tag:hero");
		expect(r.hopFilters).toHaveLength(2);
		expect(r.hopFilters[0]).toEqual({ name: "alice", hops: 2 });
		expect(r.hopFilters[1]).toEqual({ name: "bob", hops: 1 });
		expect(r.remainingText).toBe("tag:hero");
	});

	it("is case-insensitive for hop keyword", () => {
		const r = parseHopFilters("HOP:Alice:5");
		expect(r.hopFilters).toEqual([{ name: "alice", hops: 5 }]);
	});

	it("handles empty string", () => {
		const r = parseHopFilters("");
		expect(r.hopFilters).toHaveLength(0);
		expect(r.remainingText).toBe("");
	});
});

// ---------------------------------------------------------------------------
// computeHopSet
// ---------------------------------------------------------------------------
describe("computeHopSet", () => {
	// Simple chain: A - B - C - D
	const adj = new Map<string, Set<string>>([
		["a", new Set(["b"])],
		["b", new Set(["a", "c"])],
		["c", new Set(["b", "d"])],
		["d", new Set(["c"])],
	]);
	const labels = new Map([
		["a", "alice"],
		["b", "bob"],
		["c", "carol"],
		["d", "dave"],
	]);

	it("returns null when no hop filters", () => {
		expect(computeHopSet([], labels, adj)).toBeNull();
	});

	it("returns origin only at hop 0", () => {
		const result = computeHopSet([{ name: "alice", hops: 0 }], labels, adj);
		expect(result).toEqual(new Set(["a"]));
	});

	it("returns 1-hop neighbors", () => {
		const result = computeHopSet([{ name: "alice", hops: 1 }], labels, adj);
		expect(result).toEqual(new Set(["a", "b"]));
	});

	it("returns 2-hop neighbors", () => {
		const result = computeHopSet([{ name: "alice", hops: 2 }], labels, adj);
		expect(result).toEqual(new Set(["a", "b", "c"]));
	});

	it("unions multiple hop filters", () => {
		const result = computeHopSet(
			[
				{ name: "alice", hops: 0 },
				{ name: "dave", hops: 0 },
			],
			labels,
			adj,
		);
		expect(result).toEqual(new Set(["a", "d"]));
	});

	it("matches partial name", () => {
		const result = computeHopSet([{ name: "ali", hops: 0 }], labels, adj);
		expect(result).toEqual(new Set(["a"]));
	});

	it("returns empty set when no name match", () => {
		const result = computeHopSet([{ name: "zzz", hops: 5 }], labels, adj);
		expect(result).toEqual(new Set());
	});
});

// ---------------------------------------------------------------------------
// filterBySearchExpr
// ---------------------------------------------------------------------------
describe("filterBySearchExpr", () => {
	const nodes = [
		mkNode("hero.md", "Hero", { isTag: true }),
		mkNode("villain.md", "Villain"),
		mkNode("sidekick.md", "Sidekick"),
	];

	it("returns all nodes when query is empty", () => {
		const r = filterBySearchExpr(nodes, "", undefined);
		expect(r.nodes).toHaveLength(3);
		expect(r.highlightSet).toBeNull();
	});

	it("filters nodes in filter mode", () => {
		// isTag keyword matches nodes with isTag=true
		const r = filterBySearchExpr(nodes, "isTag", undefined);
		expect(r.nodes.map((n) => n.id)).toEqual(["hero.md"]);
		expect(r.highlightSet).toBeNull();
	});

	it("keeps all nodes in highlight mode", () => {
		const r = filterBySearchExpr(nodes, "isTag", "highlight");
		expect(r.nodes).toHaveLength(3);
		expect(r.highlightSet).toEqual(new Set(["hero.md"]));
	});

	it("strips hop patterns before evaluating", () => {
		const r = filterBySearchExpr(nodes, "hop:alice:3", undefined);
		expect(r.nodes).toHaveLength(3); // hop stripped, no text remaining
		expect(r.highlightSet).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// classifySearchMatch
// ---------------------------------------------------------------------------
describe("classifySearchMatch", () => {
	it("matches when no filters active", () => {
		const r = classifySearchMatch("x", null, null);
		expect(r).toEqual({ isMatch: true, hopMatch: true, textMatch: true });
	});

	it("hop miss", () => {
		const r = classifySearchMatch("x", new Set(["y"]), null);
		expect(r.isMatch).toBe(false);
		expect(r.hopMatch).toBe(false);
	});

	it("text miss", () => {
		const r = classifySearchMatch("x", null, new Set(["y"]));
		expect(r.isMatch).toBe(false);
		expect(r.textMatch).toBe(false);
	});

	it("both must match", () => {
		const r = classifySearchMatch("x", new Set(["x"]), new Set(["y"]));
		expect(r.isMatch).toBe(false);
	});

	it("both match", () => {
		const r = classifySearchMatch("x", new Set(["x"]), new Set(["x"]));
		expect(r.isMatch).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// countSearchMatches
// ---------------------------------------------------------------------------
describe("countSearchMatches", () => {
	it("counts all when no filters", () => {
		expect(countSearchMatches(["a", "b", "c"], null, null)).toBe(3);
	});

	it("counts only hop-matching", () => {
		expect(countSearchMatches(["a", "b", "c"], new Set(["a", "c"]), null)).toBe(2);
	});

	it("counts intersection of hop and text", () => {
		expect(countSearchMatches(["a", "b", "c"], new Set(["a", "b"]), new Set(["b", "c"]))).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// computeCardHaloGeometry
// ---------------------------------------------------------------------------
describe("computeCardHaloGeometry", () => {
	it("computes default golden ratio", () => {
		const g = computeCardHaloGeometry(10, 0, 6);
		// ar defaults to 1.618 when <= 0
		expect(g.halfH).toBe(20); // radius * 2
		expect(g.halfW).toBeCloseTo(Math.max(20, (20 * 1.618) / 2), 1);
		expect(g.outset).toBe(4);
		expect(g.cornerRadius).toBe(6);
	});

	it("uses provided aspect ratio", () => {
		const g = computeCardHaloGeometry(15, 2.0, 8);
		expect(g.halfH).toBe(30);
		expect(g.halfW).toBe(Math.max(20, (30 * 2.0) / 2));
		expect(g.cornerRadius).toBe(8);
	});

	it("enforces minimum halfW of 20", () => {
		const g = computeCardHaloGeometry(1, 1.0, 4);
		expect(g.halfW).toBe(20); // max(20, (2*1)/2) = max(20,1) = 20
	});
});

// ---------------------------------------------------------------------------
// expandLocalGraphNeighbors
// ---------------------------------------------------------------------------
describe("expandLocalGraphNeighbors", () => {
	// Graph: A - B - C - D (chain)
	const allNodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
	const allEdges = [
		{ id: "e1", source: "a", target: "b", type: "link" },
		{ id: "e2", source: "b", target: "c", type: "link" },
		{ id: "e3", source: "c", target: "d", type: "link" },
	] as any[];

	it("returns bfsNodes unchanged when no expanded nodes", () => {
		const bfs = [mkNode("a"), mkNode("b")];
		const r = expandLocalGraphNeighbors(allNodes, allEdges, bfs, []);
		expect(r.nodes.map((n) => n.id)).toEqual(["a", "b"]);
	});

	it("expands neighbors of an expanded node", () => {
		// BFS gave us A, B. Expanding B should add C.
		const bfs = [mkNode("a"), mkNode("b")];
		const r = expandLocalGraphNeighbors(allNodes, allEdges, bfs, ["b"]);
		const ids = r.nodes.map((n) => n.id).sort();
		expect(ids).toEqual(["a", "b", "c"]);
	});

	it("skips expanded nodes not in BFS result", () => {
		// BFS gave us A. Expanding D (not in BFS) should not add anything.
		const bfs = [mkNode("a")];
		const r = expandLocalGraphNeighbors(allNodes, allEdges, bfs, ["d"]);
		expect(r.nodes.map((n) => n.id)).toEqual(["a"]);
	});

	it("filters edges to match expanded node set", () => {
		const bfs = [mkNode("a"), mkNode("b")];
		const r = expandLocalGraphNeighbors(allNodes, allEdges, bfs, ["b"]);
		// Edges between a-b and b-c should be included
		expect(r.edges).toHaveLength(2);
	});

	it("chains expansions via multiple expanded nodes", () => {
		// BFS: A,B. Expand B -> adds C. Expand C (but C was not in initial BFS).
		// expandedNodes=["b","c"]: b is in BFS, c is added by b expansion.
		// But the function only checks reachable set, so c added by b's neighbors
		// then c's neighbors (d) get added too.
		const bfs = [mkNode("a"), mkNode("b")];
		const r = expandLocalGraphNeighbors(allNodes, allEdges, bfs, ["b", "c"]);
		const ids = r.nodes.map((n) => n.id).sort();
		expect(ids).toEqual(["a", "b", "c", "d"]);
	});
});

// ---------------------------------------------------------------------------
// capNodesByDegree
// ---------------------------------------------------------------------------
describe("capNodesByDegree", () => {
	const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
	const edges = [
		{ id: "e1", source: "a", target: "b", type: "link" },
		{ id: "e2", source: "b", target: "c", type: "link" },
		{ id: "e3", source: "c", target: "d", type: "link" },
	] as any[];
	const degrees = new Map([
		["a", 1],
		["b", 2],
		["c", 2],
		["d", 1],
	]);

	it("returns unchanged when under cap", () => {
		const r = capNodesByDegree(nodes, edges, degrees, 10);
		expect(r.nodes).toHaveLength(4);
		expect(r.edges).toHaveLength(3);
	});

	it("caps to top-degree nodes", () => {
		const r = capNodesByDegree(nodes, edges, degrees, 2);
		// b and c have degree 2, should be kept
		const ids = r.nodes.map((n) => n.id).sort();
		expect(ids).toEqual(["b", "c"]);
	});

	it("filters edges to surviving nodes", () => {
		const r = capNodesByDegree(nodes, edges, degrees, 2);
		// Only edge b-c survives
		expect(r.edges).toHaveLength(1);
		expect(r.edges[0].source).toBe("b");
		expect(r.edges[0].target).toBe("c");
	});

	it("handles empty input", () => {
		const r = capNodesByDegree([], [], new Map(), 5);
		expect(r.nodes).toHaveLength(0);
		expect(r.edges).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// buildRichStatus
// ---------------------------------------------------------------------------
describe("buildRichStatus", () => {
	it("shows basic node count", () => {
		const s = buildRichStatus(50, 100, 50, {});
		expect(s).toContain("50 nodes");
		expect(s).toContain("100 edges");
	});

	it("shows filtered ratio when total differs", () => {
		const s = buildRichStatus(30, 50, 100, {});
		expect(s).toContain("30 / 100 nodes");
	});

	it("shows Local prefix for local graph", () => {
		const s = buildRichStatus(10, 5, 10, { localGraphCenter: "some-file.md" });
		expect(s).toMatch(/^Local/);
	});

	it("shows Focus prefix", () => {
		const s = buildRichStatus(10, 5, 10, { focusLayout: true });
		expect(s).toMatch(/^Focus/);
	});

	it("shows search query with mode", () => {
		const s = buildRichStatus(10, 5, 10, { searchQuery: "tag:hero", searchMode: "highlight" });
		expect(s).toContain("[HL: tag:hero]");
	});

	it("shows filter mode by default", () => {
		const s = buildRichStatus(10, 5, 10, { searchQuery: "tag:hero" });
		expect(s).toContain("[F: tag:hero]");
	});

	it("shows view mode if not graph", () => {
		const s = buildRichStatus(10, 5, 10, { viewMode: "timeline" });
		expect(s).toContain("timeline");
	});

	it("hides view mode for graph", () => {
		const s = buildRichStatus(10, 5, 10, { viewMode: "graph" });
		expect(s).not.toContain("graph");
	});

	it("shows groupBy field", () => {
		const s = buildRichStatus(10, 5, 10, { groupBy: "category" });
		expect(s).toContain("by category");
	});

	it("shows group count", () => {
		const s = buildRichStatus(10, 5, 10, { collapsedGroups: { size: 3 } });
		expect(s).toContain("3 groups");
	});

	it("truncates long search queries", () => {
		const longQuery = "a".repeat(30);
		const s = buildRichStatus(10, 5, 10, { searchQuery: longQuery });
		expect(s).toContain("a".repeat(20));
		expect(s).not.toContain("a".repeat(25));
	});
});

// ---------------------------------------------------------------------------
// computePathfinderBFS
// ---------------------------------------------------------------------------
describe("computePathfinderBFS", () => {
	// Chain: A - B - C - D
	const adj = new Map<string, Set<string>>([
		["a", new Set(["b"])],
		["b", new Set(["a", "c"])],
		["c", new Set(["b", "d"])],
		["d", new Set(["c"])],
	]);

	it("finds shortest path", () => {
		const r = computePathfinderBFS("a", "d", adj);
		expect(r).not.toBeNull();
		expect(r!.path).toEqual(["a", "b", "c", "d"]);
		expect(r!.nodeSet).toEqual(new Set(["a", "b", "c", "d"]));
	});

	it("returns null when start === end", () => {
		expect(computePathfinderBFS("a", "a", adj)).toBeNull();
	});

	it("returns null when no path exists", () => {
		const disconnected = new Map<string, Set<string>>([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
			["c", new Set(["d"])],
			["d", new Set(["c"])],
		]);
		expect(computePathfinderBFS("a", "d", disconnected)).toBeNull();
	});

	it("returns null for empty adj", () => {
		expect(computePathfinderBFS("a", "b", new Map())).toBeNull();
	});

	it("builds bidirectional edge set", () => {
		const r = computePathfinderBFS("a", "b", adj);
		expect(r!.edgeSet.has("a\u2192b")).toBe(true);
		expect(r!.edgeSet.has("b\u2192a")).toBe(true);
	});

	it("finds direct neighbor path", () => {
		const r = computePathfinderBFS("a", "b", adj);
		expect(r!.path).toEqual(["a", "b"]);
	});
});

// ---------------------------------------------------------------------------
// computeEntropyScores
// ---------------------------------------------------------------------------
describe("computeEntropyScores", () => {
	it("computes entropy based on neighbor tag diversity", () => {
		const adj = new Map<string, Set<string>>([
			["a", new Set(["b", "c"])],
			["b", new Set(["a"])],
			["c", new Set(["a"])],
		]);
		const nodeTags = new Map([
			["b", ["tag1", "tag2"]],
			["c", ["tag2", "tag3"]],
		]);
		const scores = computeEntropyScores(adj, nodeTags);
		// a has 2 neighbors with 3 unique tags -> 3/2 = 1.5, capped to 1.0
		expect(scores.get("a")).toBe(1);
	});

	it("returns empty map for empty adj", () => {
		const scores = computeEntropyScores(new Map(), new Map());
		expect(scores.size).toBe(0);
	});

	it("skips nodes with no neighbors", () => {
		const adj = new Map<string, Set<string>>([["a", new Set()]]);
		const scores = computeEntropyScores(adj, new Map());
		expect(scores.has("a")).toBe(false);
	});

	it("handles neighbors without tags", () => {
		const adj = new Map<string, Set<string>>([["a", new Set(["b", "c"])]]);
		const nodeTags = new Map<string, string[]>(); // no tags
		const scores = computeEntropyScores(adj, nodeTags);
		expect(scores.get("a")).toBe(0); // 0 unique tags / 2 neighbors
	});
});
