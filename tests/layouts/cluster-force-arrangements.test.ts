import { describe, it, expect } from "vitest";
import {
	concentricOffsets,
	gridOffsets,
	triangleOffsets,
	randomOffsets,
	type ArrangementParams,
	type ClusterForceConfig,
} from "../../src/layouts/cluster-force";
import { ARRANGEMENT_CONCENTRIC, ARRANGEMENT_GRID, ARRANGEMENT_TRIANGLE } from "../../src/constants";
import type { GraphNode } from "../../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function makeCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
	return {
		groupRules: [],
		// arrangement is unused by these per-group offset helpers, but a valid
		// ClusterArrangement value is required by the interface contract.
		arrangement: "grid",
		centerX: 0,
		centerY: 0,
		width: 1000,
		height: 1000,
		nodeSize: 10,
		nodeSpacing: 1,
		groupScale: 1,
		groupSpacing: 2,
		...overrides,
	};
}

function makeParams(members: GraphNode[], overrides?: Partial<ArrangementParams>): ArrangementParams {
	return {
		members,
		degrees: new Map(),
		edges: [],
		nodeSpacing: 1,
		groupScale: 1,
		nodeSize: 10,
		maxGroupNodeR: 10,
		cmp: (a, b) => a.id.localeCompare(b.id),
		cfg: makeCfg(),
		...overrides,
	};
}

describe("gridOffsets", () => {
	it("returns empty offsets for empty member list (degenerate input)", () => {
		const result = gridOffsets(makeParams([]));
		expect(result.offsets.size).toBe(0);
		// Even with zero members the grid guide is still emitted (current
		// behavior — c=1, rows=0 → 1 vertical, 0 horizontals).
		expect(result.guide?.type).toBe(ARRANGEMENT_GRID);
	});

	it("places a single node at origin", () => {
		const result = gridOffsets(makeParams([makeNode("a")]));
		expect(result.offsets.get("a")).toEqual({ dx: 0, dy: 0 });
	});

	it("places 4 nodes on a 2×2 grid centered on origin", () => {
		// pairwiseGap(10,10,1)=20 → spacing=20; c=2, rows=2; totalW=20, totalH=20
		// sorted by id: a, b, c, d
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const result = gridOffsets(makeParams(nodes));
		expect(result.offsets.get("a")).toEqual({ dx: -10, dy: -10 });
		expect(result.offsets.get("b")).toEqual({ dx: 10, dy: -10 });
		expect(result.offsets.get("c")).toEqual({ dx: -10, dy: 10 });
		expect(result.offsets.get("d")).toEqual({ dx: 10, dy: 10 });
	});

	it("emits a GridGuide whose verticals/horizontals match the column count", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const result = gridOffsets(makeParams(nodes));
		expect(result.guide?.type).toBe(ARRANGEMENT_GRID);
		const guide = result.guide as { verticals: number[]; horizontals: number[] };
		expect(guide.verticals.length).toBe(2);
		expect(guide.horizontals.length).toBe(2);
	});

	it("scales spacing linearly with nodeSpacing", () => {
		const params = makeParams([makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")], {
			nodeSpacing: 2,
		});
		// pairwiseGap(10,10,max(2,1)=2)=40 → spacing=40
		const result = gridOffsets(params);
		expect(result.offsets.get("a")).toEqual({ dx: -20, dy: -20 });
		expect(result.offsets.get("d")).toEqual({ dx: 20, dy: 20 });
	});

	it("applies per-node spacing multiplier from nodeSpacingMap", () => {
		const params = makeParams([makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")], {
			nodeSpacingMap: new Map([["b", 2.0]]),
		});
		const result = gridOffsets(params);
		// Formula: dx = col*spacing*ns - totalW/2 (ns multiplies spacing only,
		// not the centering term). For 'b' at col=1: 1*20*2 - 10 = 30.
		expect(result.offsets.get("b")?.dx).toBe(30);
		// Nodes with ns=1 are unaffected
		expect(result.offsets.get("a")?.dx).toBe(-10);
	});
});

describe("triangleOffsets", () => {
	it("returns empty offsets and no guide for empty member list", () => {
		const result = triangleOffsets(makeParams([]));
		expect(result.offsets.size).toBe(0);
		expect(result.guide).toBeUndefined();
	});

	it("places a single node at origin (numRows=1, totalH=0)", () => {
		// totalH = (1-1)*rowSpacing = 0 → centered on origin
		const result = triangleOffsets(makeParams([makeNode("a")]));
		expect(result.offsets.get("a")).toEqual({ dx: 0, dy: 0 });
	});

	it("fills 6 nodes into rows of 1+2+3 with row centers aligned to x=0", () => {
		// numRows = 3 (since 3*4/2 = 6); colSpacing=20, rowSpacing≈17.32
		// Sorted: a, b, c, d, e, f
		const nodes = ["a", "b", "c", "d", "e", "f"].map(makeNode);
		const result = triangleOffsets(makeParams(nodes));
		const a = result.offsets.get("a")!;
		const b = result.offsets.get("b")!;
		const c = result.offsets.get("c")!;
		const d = result.offsets.get("d")!;
		const e = result.offsets.get("e")!;
		const f = result.offsets.get("f")!;
		// Row 0 (1 node): centered on x=0
		expect(a.dx).toBe(0);
		// Row 1 (2 nodes): symmetric across x=0
		expect(b.dx).toBeCloseTo(-10);
		expect(c.dx).toBeCloseTo(10);
		// Row 2 (3 nodes): symmetric, middle on x=0
		expect(d.dx).toBeCloseTo(-20);
		expect(e.dx).toBeCloseTo(0);
		expect(f.dx).toBeCloseTo(20);
		// Y is monotonically increasing by row
		expect(a.dy).toBeLessThan(b.dy);
		expect(b.dy).toBeLessThan(d.dy);
	});

	it("handles a partial last row (n=4 → row counts 1,2,1)", () => {
		// numRows: 1*2/2=1 < 4, 2*3/2=3 < 4, 3*4/2=6 ≥ 4 → numRows=3
		// Row 0: 1, Row 1: 2, Row 2: only 1 (since n-idx=1 < 3)
		const result = triangleOffsets(makeParams(["a", "b", "c", "d"].map(makeNode)));
		expect(result.offsets.size).toBe(4);
		// 'd' is the lone bottom-row node → centered (rowWidth=0)
		expect(result.offsets.get("d")?.dx).toBeCloseTo(0);
	});

	it("emits a TriangleGuide with three vertices forming an upward-pointing triangle", () => {
		const nodes = ["a", "b", "c", "d", "e", "f"].map(makeNode);
		const result = triangleOffsets(makeParams(nodes));
		expect(result.guide?.type).toBe(ARRANGEMENT_TRIANGLE);
		const v = (result.guide as { vertices: { x: number; y: number }[] }).vertices;
		expect(v.length).toBe(3);
		// Top vertex above origin (negative y), bottom two below (positive y)
		expect(v[0].y).toBeLessThan(0);
		expect(v[1].y).toBeGreaterThan(0);
		expect(v[2].y).toBeGreaterThan(0);
		// Bottom-left x < 0 < bottom-right x
		expect(v[1].x).toBeLessThan(0);
		expect(v[2].x).toBeGreaterThan(0);
	});
});

describe("concentricOffsets", () => {
	it("returns empty offsets for empty member list", () => {
		const result = concentricOffsets(makeParams([]));
		expect(result.offsets.size).toBe(0);
		expect(result.ringAssignments).toBeUndefined();
		expect(result.guide).toBeUndefined();
	});

	it("places a single node at origin with ring radius 0", () => {
		const result = concentricOffsets(makeParams([makeNode("a")]));
		expect(result.offsets.get("a")).toEqual({ dx: 0, dy: 0 });
		expect(result.ringAssignments?.get("a")).toBe(0);
		// Single-node case generates no outer rings
		expect((result.guide as { rings: number[] }).rings).toEqual([]);
	});

	it("places extra nodes on rings around the center node", () => {
		// 5 nodes — center + 4 on outer ring(s)
		const nodes = ["a", "b", "c", "d", "e"].map(makeNode);
		const result = concentricOffsets(makeParams(nodes));
		// Center node sits at origin
		expect(result.offsets.get("a")).toEqual({ dx: 0, dy: 0 });
		// All others have non-zero radius (placed on a ring)
		for (const id of ["b", "c", "d", "e"]) {
			const off = result.offsets.get(id)!;
			expect(Math.hypot(off.dx, off.dy)).toBeGreaterThan(0);
		}
		// Guide carries at least one ring radius
		const rings = (result.guide as { rings: number[] }).rings;
		expect(rings.length).toBeGreaterThan(0);
		expect(rings[0]).toBeGreaterThan(0);
	});

	it("emits a ConcentricGuide with the correct type tag", () => {
		const nodes = ["a", "b", "c"].map(makeNode);
		const result = concentricOffsets(makeParams(nodes));
		expect(result.guide?.type).toBe(ARRANGEMENT_CONCENTRIC);
	});

	it("ringAssignments record matches each non-center node's ring radius", () => {
		const nodes = ["a", "b", "c", "d", "e"].map(makeNode);
		const result = concentricOffsets(makeParams(nodes));
		const rings = (result.guide as { rings: number[] }).rings;
		// Every non-center node maps to one of the emitted ring radii
		for (const id of ["b", "c", "d", "e"]) {
			const r = result.ringAssignments?.get(id);
			expect(r).toBeDefined();
			expect(rings).toContain(r!);
		}
	});
});

describe("randomOffsets", () => {
	it("returns empty map for empty member list", () => {
		const result = randomOffsets(makeParams([]));
		expect(result.size).toBe(0);
	});

	it("places a single node at the hash-derived position (no collisions to resolve)", () => {
		const result = randomOffsets(makeParams([makeNode("a")]));
		expect(result.size).toBe(1);
		const off = result.get("a")!;
		expect(Number.isFinite(off.dx)).toBe(true);
		expect(Number.isFinite(off.dy)).toBe(true);
	});

	it("is deterministic — same input produces identical output", () => {
		const nodes = ["a", "b", "c", "d", "e"].map(makeNode);
		const r1 = randomOffsets(makeParams(nodes));
		const r2 = randomOffsets(makeParams(nodes));
		for (const n of nodes) {
			expect(r1.get(n.id)).toEqual(r2.get(n.id));
		}
	});

	it("differentiates positions across distinct node ids (hash separates inputs)", () => {
		const nodes = ["a", "b", "c", "d", "e", "f", "g", "h"].map(makeNode);
		const result = randomOffsets(makeParams(nodes));
		const seen = new Set<string>();
		for (const n of nodes) {
			const off = result.get(n.id)!;
			seen.add(`${off.dx.toFixed(3)},${off.dy.toFixed(3)}`);
		}
		// At least most of the 8 nodes must land on distinct points; the
		// hash + collision-nudge guarantees they're not all coincident.
		expect(seen.size).toBeGreaterThanOrEqual(7);
	});

	it("keeps positions inside a disc whose radius scales with member count", () => {
		// discR = (gap * sqrt(n)) / 2, gap = 2*nodeSize*nodeSpacing*groupScale = 20.
		// For n=5 → discR ≈ (20*sqrt(5))/2 ≈ 22.36. Allow generous slack for
		// collision pushes: 4× gives plenty of headroom.
		const nodes = ["a", "b", "c", "d", "e"].map(makeNode);
		const result = randomOffsets(makeParams(nodes));
		const upperBound = 4 * 20 * Math.sqrt(5);
		for (const n of nodes) {
			const off = result.get(n.id)!;
			expect(Math.hypot(off.dx, off.dy)).toBeLessThan(upperBound);
		}
	});
});
