import { describe, it, expect } from "vitest";
import {
	concentricOffsets,
	gridOffsets,
	triangleOffsets,
	randomOffsets,
	type ArrangementParams,
	type ClusterForceConfig,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function baseCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
	return {
		groupRules: [],
		arrangement: "grid",
		centerX: 0,
		centerY: 0,
		width: 800,
		height: 600,
		nodeSize: 8,
		nodeSpacing: 3.0,
		groupScale: 3.0,
		groupSpacing: 2.0,
		...overrides,
	};
}

function makeParams(members: GraphNode[], overrides?: Partial<ArrangementParams>): ArrangementParams {
	return {
		members,
		degrees: new Map(members.map((n) => [n.id, 0])),
		edges: [],
		nodeSpacing: 3.0,
		groupScale: 3.0,
		nodeSize: 8,
		maxGroupNodeR: 8,
		cmp: (a, b) => a.id.localeCompare(b.id),
		cfg: baseCfg(),
		...overrides,
	};
}

function euclid(a: { dx: number; dy: number }, b: { dx: number; dy: number }): number {
	return Math.sqrt((a.dx - b.dx) ** 2 + (a.dy - b.dy) ** 2);
}

// ---------------------------------------------------------------------------
// concentricOffsets
// ---------------------------------------------------------------------------

describe("concentricOffsets", () => {
	it("returns an empty offsets map for zero members", () => {
		const { offsets } = concentricOffsets(makeParams([]));
		expect(offsets.size).toBe(0);
	});

	it("places a single member at the origin (ring 0 = center)", () => {
		const members = [makeNode("a")];
		const { offsets } = concentricOffsets(makeParams(members));
		expect(offsets.get("a")).toEqual({ dx: 0, dy: 0 });
	});

	it("assigns additional nodes to non-zero rings (center + ring members)", () => {
		const members = Array.from({ length: 20 }, (_, i) => makeNode(`n${i.toString().padStart(2, "0")}`));
		const { offsets, ringAssignments } = concentricOffsets(makeParams(members));
		expect(offsets.size).toBe(20);
		// Exactly one node at center (ring radius 0), the rest strictly outside.
		const firstId = [...members].sort((a, b) => a.id.localeCompare(b.id))[0].id;
		expect(offsets.get(firstId)).toEqual({ dx: 0, dy: 0 });
		const nonCenter = members.filter((m) => m.id !== firstId);
		for (const m of nonCenter) {
			const o = offsets.get(m.id)!;
			expect(Math.hypot(o.dx, o.dy)).toBeGreaterThan(0);
		}
		// At least one non-center ring assignment is present.
		expect(ringAssignments).toBeDefined();
		const uniqueRings = new Set([...(ringAssignments ?? new Map()).values()]);
		expect(uniqueRings.size).toBeGreaterThan(1);
	});
});

// ---------------------------------------------------------------------------
// gridOffsets
// ---------------------------------------------------------------------------

describe("gridOffsets", () => {
	it("returns an empty offsets map for zero members", () => {
		const { offsets } = gridOffsets(makeParams([]));
		expect(offsets.size).toBe(0);
	});

	it("places a single node at the origin (1x1 grid centered)", () => {
		const { offsets } = gridOffsets(makeParams([makeNode("a")]));
		expect(offsets.get("a")).toEqual({ dx: 0, dy: 0 });
	});

	it("centers a 4-node 2x2 grid around the origin (symmetric dx/dy)", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const { offsets } = gridOffsets(makeParams(members));
		const coords = [...offsets.values()];
		expect(coords).toHaveLength(4);
		// Expect mirror symmetry: sum of dx == 0, sum of dy == 0.
		const sumX = coords.reduce((s, c) => s + c.dx, 0);
		const sumY = coords.reduce((s, c) => s + c.dy, 0);
		expect(sumX).toBeCloseTo(0);
		expect(sumY).toBeCloseTo(0);
		// 2 unique dx values (2 cols) and 2 unique dy values (2 rows)
		const unique = (arr: number[]) => new Set(arr.map((v) => Math.round(v))).size;
		expect(unique(coords.map((c) => c.dx))).toBe(2);
		expect(unique(coords.map((c) => c.dy))).toBe(2);
	});

	it("builds a grid taller than wide for a non-square count (e.g. 5 nodes → 3x2 cells)", () => {
		const members = Array.from({ length: 5 }, (_, i) => makeNode(`n${i}`));
		const { offsets, guide } = gridOffsets(makeParams(members));
		expect(offsets.size).toBe(5);
		// c = ceil(sqrt(5)) = 3 cols; rows = ceil(5/3) = 2
		// Guide should reflect these counts
		expect(guide).toBeDefined();
		if (guide && guide.type === "grid") {
			expect(guide.verticals).toHaveLength(3);
			expect(guide.horizontals).toHaveLength(2);
		}
	});
});

// ---------------------------------------------------------------------------
// triangleOffsets
// ---------------------------------------------------------------------------

describe("triangleOffsets", () => {
	it("returns an empty offsets map for zero members", () => {
		const { offsets } = triangleOffsets(makeParams([]));
		expect(offsets.size).toBe(0);
	});

	it("arranges 3 nodes into two rows (apex + base) forming a triangle silhouette", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c")];
		const { offsets, guide } = triangleOffsets(makeParams(members));
		expect(offsets.size).toBe(3);
		const coords = [...offsets.values()];
		const uniqueDy = new Set(coords.map((c) => Math.round(c.dy * 1000)));
		// Row 0 has 1 node, row 1 has 2 nodes → 2 distinct y coordinates
		expect(uniqueDy.size).toBe(2);
		// Base row (2 nodes) should be horizontally symmetric around x=0
		const maxY = Math.max(...coords.map((c) => c.dy));
		const baseRow = coords.filter((c) => c.dy === maxY);
		expect(baseRow).toHaveLength(2);
		expect(baseRow[0].dx + baseRow[1].dx).toBeCloseTo(0);
		// Guide should have exactly 3 triangle vertices
		expect(guide).toBeDefined();
		if (guide && guide.type === "triangle") {
			expect(guide.vertices).toHaveLength(3);
		}
	});

	it("places a large node count into a consistent triangular layout (no missing nodes)", () => {
		const members = Array.from({ length: 15 }, (_, i) => makeNode(`n${i.toString().padStart(2, "0")}`));
		// 15 nodes fit exactly into 5 rows (1+2+3+4+5=15)
		const { offsets } = triangleOffsets(makeParams(members));
		expect(offsets.size).toBe(15);
		const coords = [...offsets.values()];
		const uniqueDy = new Set(coords.map((c) => Math.round(c.dy * 1000)));
		expect(uniqueDy.size).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// randomOffsets
// ---------------------------------------------------------------------------

describe("randomOffsets", () => {
	it("returns an empty map for zero members", () => {
		const offsets = randomOffsets(makeParams([]));
		expect(offsets.size).toBe(0);
	});

	it("is deterministic: identical inputs produce identical offsets (same hash seed)", () => {
		const ids = ["alpha", "beta", "gamma", "delta", "epsilon"];
		const makeMembers = () => ids.map((id) => makeNode(id));
		const o1 = randomOffsets(makeParams(makeMembers()));
		const o2 = randomOffsets(makeParams(makeMembers()));
		expect(o1.size).toBe(ids.length);
		expect(o2.size).toBe(ids.length);
		for (const id of ids) {
			const a = o1.get(id)!;
			const b = o2.get(id)!;
			expect(a.dx).toBeCloseTo(b.dx);
			expect(a.dy).toBeCloseTo(b.dy);
		}
	});

	it("keeps placements spaced so no two offsets coincide exactly", () => {
		const members = Array.from({ length: 6 }, (_, i) => makeNode(`r${i}`));
		const offsets = randomOffsets(makeParams(members));
		const coords = [...offsets.values()];
		for (let i = 0; i < coords.length; i++) {
			for (let j = i + 1; j < coords.length; j++) {
				expect(euclid(coords[i], coords[j])).toBeGreaterThan(0);
			}
		}
	});
});
