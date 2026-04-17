import { describe, it, expect } from "vitest";
import {
	generateStructureQuestions,
	computeGraphStats,
	computeNodeDegrees,
	countConnectedComponents,
	computeBetweennessCentrality,
	detectArticulationPoints,
} from "../src/analysis/graph-analysis";
import { evaluateExpr, parseQueryExpr, serializeExpr } from "../src/utils/query-expr";
import { filterByDegree, filterOrphans } from "../src/utils/graph-filter";
import { fnv1a, edgeKey, captureSnapshot } from "../src/utils/snapshot";
import { bfsShortestPath, buildAdj, hslToHex, collectSubgraph } from "../src/utils/graph-helpers";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mkNode(id: string, opts?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts } as GraphNode;
}
function mkEdge(source: string, target: string, type = "link"): GraphEdge {
	return { id: `${source}-${target}`, source, target, type } as GraphEdge;
}

// ===========================================================================
// generateStructureQuestions — untested branches
// ===========================================================================
describe("generateStructureQuestions — advanced", () => {
	it("generates disconnected-component question for multi-component graph", () => {
		// Two clusters: {a,b} and {c,d} with no bridge
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d")];
		const edges = [mkEdge("a", "b"), mkEdge("c", "d")];
		const degrees = new Map([
			["a", 1],
			["b", 1],
			["c", 1],
			["d", 1],
		]);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.some((q) => q.includes("disconnected components"))).toBe(true);
	});

	it("generates resilience question for hub with >5 edges", () => {
		// Hub "h" connects to 6 leaf nodes
		const leaves = Array.from({ length: 6 }, (_, i) => mkNode(`l${i}`, { tags: ["t"] }));
		const nodes = [mkNode("h", { tags: ["t"] }), ...leaves];
		const edges = leaves.map((l) => mkEdge("h", l.id));
		const degrees = new Map<string, number>([["h", 6]]);
		for (const l of leaves) degrees.set(l.id, 1);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.some((q) => q.includes("removed") && q.includes("neighbors"))).toBe(true);
	});

	it("generates orphan rate question when >30% orphans and >5 orphans", () => {
		// 20 nodes, 14 orphans (70% orphan rate), 6 connected
		const nodes = Array.from({ length: 20 }, (_, i) => mkNode(`n${i}`));
		const edges = [mkEdge("n0", "n1"), mkEdge("n1", "n2")];
		const degrees = new Map<string, number>();
		for (const n of nodes) degrees.set(n.id, 0);
		degrees.set("n0", 1);
		degrees.set("n1", 2);
		degrees.set("n2", 1);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.some((q) => q.includes("orphan rate"))).toBe(true);
	});

	it("generates tag dominance question when single tag covers >50%", () => {
		// All 10 nodes have same tag, only 2 unique tags total
		const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`, { tags: i < 8 ? ["dominant"] : ["rare"] }));
		const edges = nodes.slice(0, 9).map((_, i) => mkEdge(`n${i}`, `n${i + 1}`));
		const degrees = new Map<string, number>();
		degrees.set("n0", 1);
		for (let i = 1; i < 9; i++) degrees.set(`n${i}`, 2);
		degrees.set("n9", 1);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.some((q) => q.includes("dominant") && q.includes("sub-tags"))).toBe(true);
	});

	it("does not generate tag dominance when many unique tags", () => {
		// 10 nodes with 10 unique tags — no dominant tag
		const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`, { tags: [`tag${i}`] }));
		const edges = [mkEdge("n0", "n1")];
		const degrees = new Map([
			["n0", 1],
			["n1", 1],
		] as [string, number][]);
		for (let i = 2; i < 10; i++) degrees.set(`n${i}`, 0);
		const result = generateStructureQuestions(nodes, edges, degrees);
		expect(result.every((q) => !q.includes("sub-tags"))).toBe(true);
	});
});

// ===========================================================================
// computeGraphStats — edge type counts and boundary values
// ===========================================================================
describe("computeGraphStats — edge cases", () => {
	it("counts edge types correctly", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("a", "b", "link"), mkEdge("b", "c", "link"), mkEdge("a", "c", "semantic")];
		const degrees = computeNodeDegrees(nodes, edges);
		const stats = computeGraphStats(nodes, edges, degrees);
		expect(stats.edgeTypeCounts.get("link")).toBe(2);
		expect(stats.edgeTypeCounts.get("semantic")).toBe(1);
	});

	it("uses 'unknown' for edges without type", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		const edges = [{ id: "e1", source: "a", target: "b" } as GraphEdge];
		const degrees = computeNodeDegrees(nodes, edges);
		const stats = computeGraphStats(nodes, edges, degrees);
		expect(stats.edgeTypeCounts.get("unknown")).toBe(1);
	});

	it("orphanRate is 1.0 when all nodes isolated", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const degrees = new Map([
			["a", 0],
			["b", 0],
			["c", 0],
		]);
		const stats = computeGraphStats(nodes, [], degrees);
		expect(stats.orphanRate).toBe(1);
	});

	it("tagCoverage reflects fraction of tagged nodes", () => {
		const nodes = [mkNode("a", { tags: ["x"] }), mkNode("b"), mkNode("c", { tags: ["y"] }), mkNode("d")];
		const degrees = new Map([
			["a", 0],
			["b", 0],
			["c", 0],
			["d", 0],
		]);
		const stats = computeGraphStats(nodes, [], degrees);
		expect(stats.tagCoverage).toBe(0.5);
	});
});

// ===========================================================================
// evaluateExpr — meta field, folder/file matching, edge cases
// ===========================================================================
describe("evaluateExpr — meta field resolution", () => {
	it("matches nested meta field via dot notation", () => {
		const expr = parseQueryExpr("power.attack:high")!;
		const node = { id: "a", label: "a", meta: { power: { attack: "high" } } };
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("returns false for missing nested meta path", () => {
		const expr = parseQueryExpr("power.defense:low")!;
		const node = { id: "a", label: "a", meta: { power: { attack: "high" } } };
		expect(evaluateExpr(expr, node)).toBe(false);
	});

	it("matches array meta values", () => {
		const expr = parseQueryExpr("related:story1")!;
		const node = { id: "a", label: "a", meta: { related: ["story1", "story2"] } };
		expect(evaluateExpr(expr, node)).toBe(true);
	});
});

describe("evaluateExpr — folder and file fields", () => {
	it("folder field matches path substring", () => {
		const expr = parseQueryExpr("folder:characters")!;
		const node = { id: "a", label: "a", filePath: "stories/characters/hero.md" };
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("file field matches path substring", () => {
		const expr = parseQueryExpr("file:hero")!;
		const node = { id: "a", label: "a", filePath: "stories/characters/hero.md" };
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("id field uses exact glob match", () => {
		const expr = parseQueryExpr("id:hero*")!;
		const node = { id: "hero.md", label: "hero" };
		expect(evaluateExpr(expr, node)).toBe(true);
	});
});

// ===========================================================================
// parseQueryExpr — edge cases
// ===========================================================================
describe("parseQueryExpr — parser edge cases", () => {
	it("unclosed parenthesis still parses content", () => {
		const result = parseQueryExpr("(tag:a OR tag:b");
		expect(result).not.toBeNull();
		expect(result!.type).toBe("branch");
	});

	it("triple NOT collapses correctly", () => {
		const expr = parseQueryExpr("NOT NOT NOT tag:x")!;
		// NOT(NOT(NOT(leaf))) — outermost is NOT
		expect(expr.type).toBe("not");
		const inner = (expr as any).child;
		expect(inner.type).toBe("not");
		const innermost = inner.child;
		expect(innermost.type).toBe("not");
		expect(innermost.child.type).toBe("leaf");
	});

	it("operator as field value is treated as leaf", () => {
		// "tag:AND" should parse as a leaf with field=tag, value=AND (not an operator)
		const expr = parseQueryExpr("tag:AND")!;
		expect(expr.type).toBe("leaf");
		expect((expr as any).field).toBe("tag");
		expect((expr as any).value).toBe("AND");
	});
});

// ===========================================================================
// countConnectedComponents — self-loops and parallel edges
// ===========================================================================
describe("countConnectedComponents — edge cases", () => {
	it("self-loop node is one component", () => {
		const nodes = [mkNode("a")];
		const edges = [mkEdge("a", "a")];
		expect(countConnectedComponents(nodes, edges)).toBe(1);
	});

	it("parallel edges do not create extra components", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		const edges = [mkEdge("a", "b"), mkEdge("a", "b"), mkEdge("b", "a")];
		expect(countConnectedComponents(nodes, edges)).toBe(1);
	});

	it("single node with no edges is one component", () => {
		const nodes = [mkNode("a")];
		expect(countConnectedComponents(nodes, [])).toBe(1);
	});
});

// ===========================================================================
// detectArticulationPoints — edge cases
// ===========================================================================
describe("detectArticulationPoints — edge cases", () => {
	it("cycle has no articulation points", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("c", "a")];
		const result = detectArticulationPoints(nodes, edges);
		expect(result.size).toBe(0);
	});

	it("single node returns empty set", () => {
		const result = detectArticulationPoints([mkNode("a")], []);
		expect(result.size).toBe(0);
	});

	it("two nodes connected: both are not articulation points (removing one leaves the other isolated but not disconnecting a connected graph of 2)", () => {
		// In a 2-node graph A--B, removing A leaves B alone (1 component).
		// Technically neither is an articulation point because the remaining graph
		// after removal still has <=1 component.
		// However, Tarjan's standard algorithm marks A as an articulation point
		// when the root has >=2 children, which doesn't apply here (root has 1 child).
		const nodes = [mkNode("a"), mkNode("b")];
		const edges = [mkEdge("a", "b")];
		const result = detectArticulationPoints(nodes, edges);
		// Root "a" has 1 child, so not an AP. "b" is a leaf, not an AP.
		// But with low[b] >= disc[a] and parent[a] != null... depends on which is root.
		// For 2 nodes: root has 1 child (not >=2), non-root has low >= disc check.
		// b is non-root, low[b]=0 (no back edge), disc[a]=0, so low[b] >= disc[a] => a is AP? No, that check is on parent of b (=a), but a is root.
		// So no articulation points.
		expect(result.size).toBe(0);
	});
});

// ===========================================================================
// bfsShortestPath — larger graph and cycle
// ===========================================================================
describe("bfsShortestPath — edge cases", () => {
	it("finds shortest path in graph with cycle", () => {
		// A--B--C--D with shortcut A--C
		const adj = new Map<string, Set<string>>();
		adj.set("a", new Set(["b", "c"]));
		adj.set("b", new Set(["a", "c"]));
		adj.set("c", new Set(["a", "b", "d"]));
		adj.set("d", new Set(["c"]));
		const path = bfsShortestPath(adj, "a", "d");
		// Shortest: a -> c -> d (length 3)
		expect(path).toEqual(["a", "c", "d"]);
	});

	it("returns empty for isolated nodes in same adj map", () => {
		const adj = new Map<string, Set<string>>();
		adj.set("a", new Set());
		adj.set("b", new Set());
		expect(bfsShortestPath(adj, "a", "b")).toEqual([]);
	});
});

// ===========================================================================
// hslToHex — boundary hue values at sector transitions
// ===========================================================================
describe("hslToHex — sector boundary values", () => {
	it("hue 60 (yellow) produces correct color", () => {
		const result = hslToHex(60, 1, 0.5);
		expect(result).toBe(0xffff00);
	});

	it("hue 180 (cyan) produces correct color", () => {
		const result = hslToHex(180, 1, 0.5);
		expect(result).toBe(0x00ffff);
	});

	it("hue 300 (magenta) produces correct color", () => {
		const result = hslToHex(300, 1, 0.5);
		expect(result).toBe(0xff00ff);
	});
});

// ===========================================================================
// fnv1a — collision resistance
// ===========================================================================
describe("fnv1a — distribution", () => {
	it("produces distinct hashes for sequential numbers", () => {
		const hashes = new Set<string>();
		for (let i = 0; i < 50; i++) {
			hashes.add(fnv1a(`key-${i}`));
		}
		// At least 90% unique (expect all unique for 50 inputs)
		expect(hashes.size).toBeGreaterThanOrEqual(45);
	});
});

// ===========================================================================
// captureSnapshot — object-form edges (d3 simulation)
// ===========================================================================
describe("captureSnapshot — d3 object edges", () => {
	it("handles object-form source/target from d3 simulation", () => {
		const data: GraphData = {
			nodes: [mkNode("a"), mkNode("b")],
			edges: [
				{
					id: "e1",
					source: { id: "a" } as any,
					target: { id: "b" } as any,
					type: "link",
				} as any,
			],
		};
		const snap = captureSnapshot(data, "test-snap", {
			layout: "force",
			searchQuery: "",
			groupBy: "",
		});
		expect(snap.edges[0].source).toBe("a");
		expect(snap.edges[0].target).toBe("b");
		expect(snap.context.nodeCount).toBe(2);
		expect(snap.context.edgeCount).toBe(1);
	});
});

// ===========================================================================
// collectSubgraph — edge cases
// ===========================================================================
describe("collectSubgraph — edge cases", () => {
	it("returns only center node for 0 hops even with many edges", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
		const adj = buildAdj({ nodes, edges } as GraphData);
		const sub = collectSubgraph(adj, "a", 0, nodes, edges);
		expect(sub.nodes.length).toBe(1);
		expect(sub.nodes[0].id).toBe("a");
		expect(sub.edges.length).toBe(0);
	});

	it("returns empty for non-existent start node", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		const edges = [mkEdge("a", "b")];
		const adj = buildAdj({ nodes, edges } as GraphData);
		const sub = collectSubgraph(adj, "nonexistent", 5, nodes, edges);
		// nonexistent is added to visited but doesn't match any node in nodes array
		expect(sub.nodes.length).toBe(0);
		expect(sub.edges.length).toBe(0);
	});
});
