import { describe, it, expect } from "vitest";
import {
	edgeTypeSummary,
	collapsedGroupSummary,
	truncateBreadcrumb,
	computeNodeBBox,
	buildTagMembership,
	hslToHex,
	edgeSourceId,
	edgeTargetId,
	autoBundleStrength,
	hitTestTimelineBars,
	computeGaps,
	exportGraphCSV,
	exportGraphMermaid,
	stringHash,
	buildMissingNeighborSet,
} from "../src/utils/graph-helpers";
import type { GraphNode, GraphEdge } from "../src/types";

function makeNode(id: string, opts: Partial<GraphNode> = {}): GraphNode {
	return {
		id,
		label: opts.label ?? id,
		x: 0,
		y: 0,
		radius: 5,
		tags: opts.tags ?? [],
		isTag: opts.isTag ?? false,
		...opts,
	} as GraphNode;
}

function makeEdge(source: string, target: string, type = "link"): GraphEdge {
	return { source, target, type } as GraphEdge;
}

// ---------------------------------------------------------------------------
// edgeTypeSummary — extended
// ---------------------------------------------------------------------------
describe("edgeTypeSummary — extended", () => {
	it("counts multiple edge types for same node", () => {
		const edges = [
			{ source: "a", target: "b", type: "link" },
			{ source: "c", target: "a", type: "semantic" },
			{ source: "a", target: "d", type: "link" },
			{ source: "a", target: "e", type: "tag" },
		];
		const counts = edgeTypeSummary(edges, "a");
		expect(counts.get("link")).toBe(2);
		expect(counts.get("semantic")).toBe(1);
		expect(counts.get("tag")).toBe(1);
	});

	it("self-loop: source matches and target matches in same edge", () => {
		const edges = [{ source: "a", target: "a", type: "link" }];
		const counts = edgeTypeSummary(edges, "a");
		// The edge matches once (source=a OR target=a), counted once per edge
		expect(counts.get("link")).toBe(1);
	});

	it("defaults to 'link' when type is missing", () => {
		const edges = [{ source: "a", target: "b" }];
		const counts = edgeTypeSummary(edges, "a");
		expect(counts.get("link")).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// collapsedGroupSummary — extended
// ---------------------------------------------------------------------------
describe("collapsedGroupSummary — extended", () => {
	it("single member without .md extension", () => {
		const text = collapsedGroupSummary(["tag:test"]);
		expect(text).toContain("[1 nodes]");
		expect(text).toContain("tag:test");
	});

	it("exactly 3 members shows all without +N", () => {
		const text = collapsedGroupSummary(["a.md", "b.md", "c.md"]);
		expect(text).toContain("[3 nodes]");
		expect(text).toContain("a, b, c");
		expect(text).not.toContain("+");
	});

	it("4 members shows top 3 + '+1'", () => {
		const text = collapsedGroupSummary(["a.md", "b.md", "c.md", "d.md"]);
		expect(text).toContain("+1");
	});

	it("10 members shows top 3 + '+7'", () => {
		const members = Array.from({ length: 10 }, (_, i) => `n${i}.md`);
		const text = collapsedGroupSummary(members);
		expect(text).toContain("[10 nodes]");
		expect(text).toContain("+7");
	});
});

// ---------------------------------------------------------------------------
// truncateBreadcrumb — extended
// ---------------------------------------------------------------------------
describe("truncateBreadcrumb — extended", () => {
	it("exactly 5 elements: no truncation", () => {
		const result = truncateBreadcrumb(["a", "b", "c", "d", "e"]);
		expect(result).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("6 elements: keeps first 2 + ellipsis + last 2", () => {
		const result = truncateBreadcrumb(["a", "b", "c", "d", "e", "f"]);
		expect(result).toEqual(["a", "b", "\u2026", "e", "f"]);
	});

	it("10 elements: keeps first 2 + ... + last 2", () => {
		const arr = Array.from({ length: 10 }, (_, i) => `p${i}`);
		const result = truncateBreadcrumb(arr);
		expect(result).toHaveLength(5);
		expect(result[0]).toBe("p0");
		expect(result[1]).toBe("p1");
		expect(result[2]).toBe("…");
		expect(result[3]).toBe("p8");
		expect(result[4]).toBe("p9");
	});

	it("2 elements: no truncation", () => {
		expect(truncateBreadcrumb(["a", "b"])).toEqual(["a", "b"]);
	});
});

// ---------------------------------------------------------------------------
// computeNodeBBox — extended
// ---------------------------------------------------------------------------
describe("computeNodeBBox — extended", () => {
	it("respects custom default radius", () => {
		const bb = computeNodeBBox([{ x: 0, y: 0 }], 20);
		expect(bb.minX).toBe(-20);
		expect(bb.maxX).toBe(20);
		expect(bb.minY).toBe(-20);
		expect(bb.maxY).toBe(20);
	});

	it("uses node's own radius over default", () => {
		const bb = computeNodeBBox([{ x: 0, y: 0, radius: 10 }], 5);
		expect(bb.minX).toBe(-10);
		expect(bb.maxX).toBe(10);
	});

	it("multiple nodes with different radii", () => {
		const bb = computeNodeBBox([
			{ x: 0, y: 0, radius: 5 },
			{ x: 100, y: 50, radius: 20 },
		]);
		expect(bb.minX).toBe(-5);
		expect(bb.maxX).toBe(120);
		expect(bb.minY).toBe(-5);
		expect(bb.maxY).toBe(70);
	});

	it("negative coordinates", () => {
		const bb = computeNodeBBox([
			{ x: -50, y: -30, radius: 5 },
			{ x: -10, y: -10, radius: 5 },
		]);
		expect(bb.minX).toBe(-55);
		expect(bb.minY).toBe(-35);
		expect(bb.maxX).toBe(-5);
		expect(bb.maxY).toBe(-5);
	});
});

// ---------------------------------------------------------------------------
// buildTagMembership — extended
// ---------------------------------------------------------------------------
describe("buildTagMembership — extended", () => {
	it("assigns node to most specific (smallest count) tag", () => {
		const nodes = [
			makeNode("a", { tags: ["common", "rare"] }),
			makeNode("b", { tags: ["common"] }),
			makeNode("c", { tags: ["common"] }),
		];
		const { tagMembership } = buildTagMembership(nodes, []);
		// "common" has count 3, "rare" has count 1 → node "a" goes to "rare"
		expect(tagMembership.get("rare")?.has("a")).toBe(true);
		expect(tagMembership.get("common")?.has("a")).toBeFalsy();
	});

	it("skips tag nodes (isTag=true)", () => {
		const nodes = [makeNode("tag:test", { isTag: true, tags: ["test"] }), makeNode("a", { tags: ["test"] })];
		const { tagMembership } = buildTagMembership(nodes, []);
		// Only non-tag node should be in membership
		const testMembers = tagMembership.get("test");
		expect(testMembers?.has("a")).toBe(true);
		expect(testMembers?.has("tag:test")).toBeFalsy();
	});

	it("builds tag relationship pairs from inheritance edges", () => {
		const nodes: GraphNode[] = [];
		const edges = [makeEdge("tag:parent", "tag:child", "inheritance")];
		const { tagRelPairs } = buildTagMembership(nodes, edges);
		expect(tagRelPairs.has("parent\0child")).toBe(true);
		expect(tagRelPairs.has("child\0parent")).toBe(true);
	});

	it("ignores non-tag inheritance edges", () => {
		const nodes: GraphNode[] = [];
		const edges = [makeEdge("a", "b", "inheritance")];
		const { tagRelPairs } = buildTagMembership(nodes, edges);
		expect(tagRelPairs.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// hslToHex
// ---------------------------------------------------------------------------
describe("hslToHex", () => {
	it("pure red: h=0, s=1, l=0.5", () => {
		expect(hslToHex(0, 1, 0.5)).toBe(0xff0000);
	});

	it("pure green: h=120, s=1, l=0.5", () => {
		expect(hslToHex(120, 1, 0.5)).toBe(0x00ff00);
	});

	it("pure blue: h=240, s=1, l=0.5", () => {
		expect(hslToHex(240, 1, 0.5)).toBe(0x0000ff);
	});

	it("white: s=0, l=1", () => {
		expect(hslToHex(0, 0, 1)).toBe(0xffffff);
	});

	it("black: s=0, l=0", () => {
		expect(hslToHex(0, 0, 0)).toBe(0x000000);
	});

	it("gray: s=0, l=0.5", () => {
		const result = hslToHex(0, 0, 0.5);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBe(g);
		expect(g).toBe(b);
		expect(r).toBeCloseTo(128, 0);
	});

	it("yellow: h=60, s=1, l=0.5", () => {
		expect(hslToHex(60, 1, 0.5)).toBe(0xffff00);
	});

	it("cyan: h=180, s=1, l=0.5", () => {
		expect(hslToHex(180, 1, 0.5)).toBe(0x00ffff);
	});
});

// ---------------------------------------------------------------------------
// edgeSourceId / edgeTargetId
// ---------------------------------------------------------------------------
describe("edgeSourceId / edgeTargetId — extended", () => {
	it("handles d3 simulation object form", () => {
		const e = { source: { id: "src" }, target: { id: "tgt" } };
		expect(edgeSourceId(e)).toBe("src");
		expect(edgeTargetId(e)).toBe("tgt");
	});

	it("handles string form", () => {
		expect(edgeSourceId({ source: "a" })).toBe("a");
		expect(edgeTargetId({ target: "b" })).toBe("b");
	});
});

// ---------------------------------------------------------------------------
// autoBundleStrength — extended
// ---------------------------------------------------------------------------
describe("autoBundleStrength — extended", () => {
	it("boundary: 50 nodes returns 0.3", () => {
		expect(autoBundleStrength(50)).toBe(0.3);
	});

	it("boundary: 51 nodes returns 0.5", () => {
		expect(autoBundleStrength(51)).toBe(0.5);
	});

	it("boundary: 200 nodes returns 0.5", () => {
		expect(autoBundleStrength(200)).toBe(0.5);
	});

	it("boundary: 201 nodes returns 0.7", () => {
		expect(autoBundleStrength(201)).toBe(0.7);
	});

	it("boundary: 500 nodes returns 0.7", () => {
		expect(autoBundleStrength(500)).toBe(0.7);
	});

	it("boundary: 501 nodes returns 0.85", () => {
		expect(autoBundleStrength(501)).toBe(0.85);
	});

	it("0 nodes returns 0.3", () => {
		expect(autoBundleStrength(0)).toBe(0.3);
	});

	it("negative nodes returns 0.3", () => {
		expect(autoBundleStrength(-10)).toBe(0.3);
	});
});

// ---------------------------------------------------------------------------
// hitTestTimelineBars — extended
// ---------------------------------------------------------------------------
describe("hitTestTimelineBars — extended", () => {
	const bars = [
		{ nodeId: "a", xStart: 0, xEnd: 100, yCenter: 50, barHeight: 20 },
		{ nodeId: "b", xStart: 110, xEnd: 200, yCenter: 50, barHeight: 20 },
	];

	it("hits bar at exact left edge", () => {
		expect(hitTestTimelineBars(bars, 0, 50)).toBe("a");
	});

	it("hits bar at exact right edge", () => {
		expect(hitTestTimelineBars(bars, 100, 50)).toBe("a");
	});

	it("hits bar at exact top edge", () => {
		expect(hitTestTimelineBars(bars, 50, 40)).toBe("a");
	});

	it("hits bar at exact bottom edge", () => {
		expect(hitTestTimelineBars(bars, 50, 60)).toBe("a");
	});

	it("misses between two bars", () => {
		expect(hitTestTimelineBars(bars, 105, 50)).toBeNull();
	});

	it("misses above all bars", () => {
		expect(hitTestTimelineBars(bars, 50, 30)).toBeNull();
	});

	it("returns first match for overlapping bars", () => {
		const overlap = [
			{ nodeId: "first", xStart: 0, xEnd: 100, yCenter: 50, barHeight: 20 },
			{ nodeId: "second", xStart: 50, xEnd: 150, yCenter: 50, barHeight: 20 },
		];
		expect(hitTestTimelineBars(overlap, 75, 50)).toBe("first");
	});
});

// ---------------------------------------------------------------------------
// computeGaps — extended
// ---------------------------------------------------------------------------
describe("computeGaps — extended", () => {
	it("finds gap: A and C share tag, B is common neighbor, A-C not connected", () => {
		const nodes = [makeNode("a", { tags: ["t1"] }), makeNode("b"), makeNode("c", { tags: ["t1"] })];
		const adj = new Map<string, Set<string>>([
			["a", new Set(["b"])],
			["b", new Set(["a", "c"])],
			["c", new Set(["b"])],
		]);
		const gaps = computeGaps(nodes, adj);
		expect(gaps.length).toBe(1);
		expect(gaps[0]).toEqual({ from: "a", to: "c" });
	});

	it("no gap when A-C are directly connected", () => {
		const nodes = [makeNode("a", { tags: ["t1"] }), makeNode("c", { tags: ["t1"] })];
		const adj = new Map<string, Set<string>>([
			["a", new Set(["c"])],
			["c", new Set(["a"])],
		]);
		expect(computeGaps(nodes, adj)).toEqual([]);
	});

	it("caps at 20 results", () => {
		// Create many nodes sharing a tag with common neighbors
		const nodes = Array.from({ length: 25 }, (_, i) => makeNode(`n${i}`, { tags: ["shared"] }));
		// All connected to a common hub but not to each other
		const adj = new Map<string, Set<string>>();
		for (const n of nodes) adj.set(n.id, new Set(["hub"]));
		adj.set("hub", new Set(nodes.map((n) => n.id)));

		const gaps = computeGaps(nodes, adj);
		expect(gaps.length).toBeLessThanOrEqual(20);
	});
});

// ---------------------------------------------------------------------------
// stringHash — extended
// ---------------------------------------------------------------------------
describe("stringHash — extended", () => {
	it("range=0 returns NaN (division by zero)", () => {
		// stringHash uses modulo, which returns NaN for range=0
		expect(stringHash("test", 0)).toBeNaN();
	});

	it("never returns negative", () => {
		for (let i = 0; i < 20; i++) {
			expect(stringHash(`test${i}`, 100)).toBeGreaterThanOrEqual(0);
		}
	});
});

// ---------------------------------------------------------------------------
// exportGraphCSV — extended
// ---------------------------------------------------------------------------
describe("exportGraphCSV — extended", () => {
	it("includes header row starting with # Nodes", () => {
		const csv = exportGraphCSV([], []);
		expect(csv.startsWith("# Nodes")).toBe(true);
	});

	it("includes node data", () => {
		const nodes = [makeNode("a", { label: "Alpha", tags: ["t1", "t2"] })];
		const csv = exportGraphCSV(nodes, []);
		expect(csv).toContain("a");
		expect(csv).toContain("Alpha");
		expect(csv).toContain("t1;t2");
	});

	it("replaces commas in labels with spaces", () => {
		const nodes = [makeNode("a", { label: "Hello, World" })];
		const csv = exportGraphCSV(nodes, []);
		// CSV replaces commas with spaces (not quoting)
		expect(csv).toContain("Hello  World");
	});

	it("includes # Edges section", () => {
		const csv = exportGraphCSV([], []);
		expect(csv).toContain("# Edges");
	});

	it("includes edge data", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const edges = [makeEdge("a", "b", "link")];
		const csv = exportGraphCSV(nodes, edges);
		expect(csv).toContain("a,b,link,");
	});
});

// ---------------------------------------------------------------------------
// exportGraphMermaid — extended
// ---------------------------------------------------------------------------
describe("exportGraphMermaid — extended", () => {
	it("starts with graph LR", () => {
		const mmd = exportGraphMermaid([], []);
		expect(mmd.trimStart().startsWith("graph LR")).toBe(true);
	});

	it("includes node definitions", () => {
		const nodes = [makeNode("a", { label: "Alpha" })];
		const mmd = exportGraphMermaid(nodes, []);
		expect(mmd).toContain("Alpha");
	});

	it("includes edges", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const edges = [makeEdge("a", "b")];
		const mmd = exportGraphMermaid(nodes, edges);
		expect(mmd).toContain("-->");
	});

	it("uses is-a label for inheritance edges", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const edges = [makeEdge("a", "b", "inheritance")];
		const mmd = exportGraphMermaid(nodes, edges);
		expect(mmd).toContain("is-a");
	});

	it("limits to 200 nodes", () => {
		const nodes = Array.from({ length: 250 }, (_, i) => makeNode(`n${i}`));
		const mmd = exportGraphMermaid(nodes, []);
		const nodeLines = mmd.split("\n").filter((l) => l.includes('["'));
		expect(nodeLines.length).toBeLessThanOrEqual(200);
	});
});
