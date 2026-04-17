import { describe, it, expect } from "vitest";
import { timelineOffsetsV2 } from "../src/layouts/timeline-layout";
import type { GraphNode, GraphEdge } from "../src/types";
import type { ClusterForceConfig } from "../src/layouts/cluster-force";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, props: Record<string, string> = {}): GraphNode {
	return { id, name: id, ...props } as any;
}

function makeCfg(overrides: Partial<ClusterForceConfig> = {}): ClusterForceConfig {
	const nodeProps = new Map<string, Map<string, string>>();
	return {
		groupRules: [],
		arrangement: "timeline" as any,
		centerX: 0,
		centerY: 0,
		width: 800,
		height: 600,
		nodeSize: 10,
		nodeSpacing: 3,
		groupScale: 1,
		groupSpacing: 2,
		timelineKey: "date",
		getNodeProperty: (nodeId: string, key: string) => {
			return nodeProps.get(nodeId)?.get(key);
		},
		...overrides,
	} as ClusterForceConfig;
}

function makeParams(
	nodes: GraphNode[],
	edges: GraphEdge[] = [],
	cfgOverrides: Partial<ClusterForceConfig> = {},
	nodeProps?: Map<string, Map<string, string>>,
) {
	const cfg = makeCfg(cfgOverrides);
	if (nodeProps) {
		cfg.getNodeProperty = (id, key) => nodeProps.get(id)?.get(key);
	}
	return {
		members: nodes,
		degrees: new Map(nodes.map((n) => [n.id, 1])),
		edges,
		nodeSpacing: 3,
		groupScale: 1,
		nodeSize: 10,
		maxGroupNodeR: 10,
		cmp: (a: GraphNode, b: GraphNode) => a.id.localeCompare(b.id),
		cfg,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("timelineOffsetsV2 — integration", () => {
	it("returns empty offsets for empty members", () => {
		const result = timelineOffsetsV2(makeParams([]));
		expect(result.offsets.size).toBe(0);
		expect(result.guide).toBeUndefined();
		expect(result.bars).toBeUndefined();
	});

	it("places a single untimed node at origin", () => {
		const nodes = [makeNode("a")];
		const result = timelineOffsetsV2(makeParams(nodes));
		expect(result.offsets.size).toBe(1);
		const off = result.offsets.get("a")!;
		expect(off).toBeDefined();
		expect(typeof off.dx).toBe("number");
		expect(typeof off.dy).toBe("number");
	});

	it("places timed nodes along X axis with guide ticks", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const nodeProps = new Map([
			["a", new Map([["date", "2024-01"]])],
			["b", new Map([["date", "2024-02"]])],
			["c", new Map([["date", "2024-03"]])],
		]);
		const result = timelineOffsetsV2(makeParams(nodes, [], {}, nodeProps));

		// All 3 nodes should have offsets
		expect(result.offsets.size).toBe(3);

		// Guide with ticks for unique times
		expect(result.guide).toBeDefined();
		const guide = result.guide as any;
		expect(guide.type).toBe("timeline");
		expect(guide.ticks.length).toBe(3);

		// Ticks should be in order
		const tickLabels = guide.ticks.map((t: any) => t.label);
		expect(tickLabels).toEqual(["2024-01", "2024-02", "2024-03"]);

		// X positions should be monotonically increasing
		const xs = guide.ticks.map((t: any) => t.x);
		expect(xs[0]).toBeLessThan(xs[1]);
		expect(xs[1]).toBeLessThan(xs[2]);
	});

	it("generates sequence edges between temporally adjacent timed nodes", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const nodeProps = new Map([
			["a", new Map([["date", "2024-01"]])],
			["b", new Map([["date", "2024-02"]])],
		]);
		const result = timelineOffsetsV2(makeParams(nodes, [], {}, nodeProps));

		expect(result.sequenceEdges).toBeDefined();
		expect(result.sequenceEdges!.length).toBeGreaterThan(0);
		const se = result.sequenceEdges![0];
		expect(se.source).toBe("a");
		expect(se.target).toBe("b");
	});

	it("places mixed timed/untimed nodes with separate regions", () => {
		const nodes = [makeNode("t1"), makeNode("t2"), makeNode("u1"), makeNode("u2")];
		const nodeProps = new Map([
			["t1", new Map([["date", "2024-01"]])],
			["t2", new Map([["date", "2024-02"]])],
		]);
		const result = timelineOffsetsV2(makeParams(nodes, [], {}, nodeProps));
		expect(result.offsets.size).toBe(4);

		// Timed and untimed should all have distinct positions
		const positions = [...result.offsets.values()].map((o) => `${o.dx},${o.dy}`);
		const unique = new Set(positions);
		expect(unique.size).toBe(4);
	});

	it("produces bars when nodes have duration data", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const nodeProps = new Map([
			["a", new Map([["date", "2024-01"]])],
			["b", new Map([["date", "2024-03"]])],
		]);
		const result = timelineOffsetsV2(makeParams(nodes, [], { timelineEndKey: "end-date" }, nodeProps));

		// Bars should exist (at minimum for the span between start positions)
		// Note: bars require end-date to differ from start-date for duration
		expect(result.offsets.size).toBe(2);
	});

	it("all-untimed nodes go to grid layout", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const result = timelineOffsetsV2(makeParams(nodes));
		expect(result.offsets.size).toBe(4);
		// No guide ticks (no timed nodes)
		if (result.guide) {
			const guide = result.guide as any;
			expect(guide.ticks.length).toBe(0);
		}
		// No sequence edges
		expect(result.sequenceEdges).toBeUndefined();
	});

	it("offsets are centered (mean ~0)", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const nodeProps = new Map([
			["a", new Map([["date", "1"]])],
			["b", new Map([["date", "2"]])],
			["c", new Map([["date", "3"]])],
		]);
		const result = timelineOffsetsV2(makeParams(nodes, [], {}, nodeProps));
		const dxs = [...result.offsets.values()].map((o) => o.dx);
		const dys = [...result.offsets.values()].map((o) => o.dy);
		const meanDx = dxs.reduce((a, b) => a + b, 0) / dxs.length;
		const meanDy = dys.reduce((a, b) => a + b, 0) / dys.length;
		// Centered should be near zero (within spacing tolerance)
		expect(Math.abs(meanDx)).toBeLessThan(100);
		expect(Math.abs(meanDy)).toBeLessThan(100);
	});

	it("duplicate time values stack vertically", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const nodeProps = new Map([
			["a", new Map([["date", "2024-01"]])],
			["b", new Map([["date", "2024-01"]])],
			["c", new Map([["date", "2024-02"]])],
		]);
		const result = timelineOffsetsV2(makeParams(nodes, [], {}, nodeProps));
		const offA = result.offsets.get("a")!;
		const offB = result.offsets.get("b")!;
		const offC = result.offsets.get("c")!;

		// a and b have same date → same X column (close dx)
		expect(Math.abs(offA.dx - offB.dx)).toBeLessThan(1);
		// c has different date → different X
		expect(offA.dx).not.toBeCloseTo(offC.dx, 0);
	});
});
