import { describe, it, expect } from "vitest";
import {
	concentricOffsets,
	gridOffsets,
	triangleOffsets,
	randomOffsets,
	partitionNodes,
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

	it("with 2 members, places one at the center and pushes the other onto ring 1", () => {
		const members = [makeNode("a"), makeNode("b")];
		const { offsets, ringAssignments } = concentricOffsets(makeParams(members));
		expect(offsets.size).toBe(2);
		// Sort comparator is alphabetical ascending → "a" wins center
		expect(offsets.get("a")).toEqual({ dx: 0, dy: 0 });
		const b = offsets.get("b")!;
		expect(Math.hypot(b.dx, b.dy)).toBeGreaterThan(0);
		// "a" is on ring 0, "b" is on a non-zero ring
		expect(ringAssignments?.get("a")).toBe(0);
		expect(ringAssignments?.get("b")).toBeGreaterThan(0);
	});

	it("works with default cfg (no maxNodeRadius/minNodeRadius overrides)", () => {
		// Default cfg has neither maxNodeRadius nor minNodeRadius set — exercises the
		// `?? 60` / `?? 18` fallback paths inside concentricOffsets.
		const members = [makeNode("x"), makeNode("y"), makeNode("z")];
		const { offsets, guide } = concentricOffsets(makeParams(members));
		expect(offsets.size).toBe(3);
		// Guide should report the concentric type with at least one ring radius
		expect(guide?.type).toBe("concentric");
		if (guide && guide.type === "concentric") {
			expect(guide.rings.length).toBeGreaterThan(0);
			for (const r of guide.rings) {
				expect(r).toBeGreaterThan(0);
			}
		}
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

	it("builds a perfect 3x3 grid for 9 nodes (sqrt(9)=3, no partial row)", () => {
		const members = Array.from({ length: 9 }, (_, i) => makeNode(`n${i}`));
		const { offsets, guide } = gridOffsets(makeParams(members));
		expect(offsets.size).toBe(9);
		// 3 unique dx and 3 unique dy → fully populated 3×3 grid
		const coords = [...offsets.values()];
		const uniqDx = new Set(coords.map((c) => Math.round(c.dx * 1000))).size;
		const uniqDy = new Set(coords.map((c) => Math.round(c.dy * 1000))).size;
		expect(uniqDx).toBe(3);
		expect(uniqDy).toBe(3);
		// Sum of dx and dy should be ~0 (centered grid)
		const sumX = coords.reduce((s, c) => s + c.dx, 0);
		const sumY = coords.reduce((s, c) => s + c.dy, 0);
		expect(sumX).toBeCloseTo(0);
		expect(sumY).toBeCloseTo(0);
		if (guide && guide.type === "grid") {
			expect(guide.verticals).toHaveLength(3);
			expect(guide.horizontals).toHaveLength(3);
		}
	});

	it("handles an uneven 7-node grid (3 cols × 3 rows with last row partial)", () => {
		const members = Array.from({ length: 7 }, (_, i) => makeNode(`n${i}`));
		const { offsets, guide } = gridOffsets(makeParams(members));
		expect(offsets.size).toBe(7);
		// c = ceil(sqrt(7)) = 3 cols; rows = ceil(7/3) = 3 (last row holds 1 node)
		if (guide && guide.type === "grid") {
			expect(guide.verticals).toHaveLength(3);
			expect(guide.horizontals).toHaveLength(3);
		}
		// All nodes occupy distinct coordinates
		const coords = [...offsets.values()];
		const seen = new Set<string>();
		for (const c of coords) {
			const key = `${Math.round(c.dx * 1000)},${Math.round(c.dy * 1000)}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
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

	it("centers a single node at the apex of a 1-row triangle", () => {
		const members = [makeNode("solo")];
		const { offsets, guide } = triangleOffsets(makeParams(members));
		expect(offsets.size).toBe(1);
		// Single node is the only row; with totalH=0, dy = 0; rowWidth=0 → dx = 0
		expect(offsets.get("solo")).toEqual({ dx: 0, dy: 0 });
		// Guide still produces 3 vertices
		if (guide && guide.type === "triangle") {
			expect(guide.vertices).toHaveLength(3);
		}
	});

	it("packs 6 nodes into exactly 3 rows (1+2+3=6, perfect triangle)", () => {
		const members = Array.from({ length: 6 }, (_, i) => makeNode(`n${i}`));
		const { offsets } = triangleOffsets(makeParams(members));
		expect(offsets.size).toBe(6);
		const coords = [...offsets.values()];
		const uniqueDy = new Set(coords.map((c) => Math.round(c.dy * 1000)));
		expect(uniqueDy.size).toBe(3);
		// Bottom row holds 3 nodes — verify by selecting the largest dy
		const maxY = Math.max(...coords.map((c) => c.dy));
		const bottomRow = coords.filter((c) => Math.round(c.dy * 1000) === Math.round(maxY * 1000));
		expect(bottomRow).toHaveLength(3);
	});

	it("packs 10 nodes into exactly 4 rows (1+2+3+4=10, perfect triangle)", () => {
		const members = Array.from({ length: 10 }, (_, i) => makeNode(`n${i.toString().padStart(2, "0")}`));
		const { offsets } = triangleOffsets(makeParams(members));
		expect(offsets.size).toBe(10);
		const coords = [...offsets.values()];
		const uniqueDy = new Set(coords.map((c) => Math.round(c.dy * 1000)));
		expect(uniqueDy.size).toBe(4);
		// Bottom row holds 4 nodes
		const maxY = Math.max(...coords.map((c) => c.dy));
		const bottomRow = coords.filter((c) => Math.round(c.dy * 1000) === Math.round(maxY * 1000));
		expect(bottomRow).toHaveLength(4);
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

// ---------------------------------------------------------------------------
// partitionNodes
// ---------------------------------------------------------------------------

describe("partitionNodes", () => {
	it("groups all nodes into a single bucket when groupBy === 'none'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.length).toBe(3);
	});

	it("buckets by degree when groupBy === 'backlinks'", () => {
		const nodes = [makeNode("zero"), makeNode("low1"), makeNode("low2"), makeNode("hi")];
		const degrees = new Map([
			["zero", 0],
			["low1", 1],
			["low2", 2],
			["hi", 12],
		]);
		const groups = partitionNodes(nodes, "backlinks", degrees);
		// 3 buckets: "0", "1-2", "11+"
		expect(groups.size).toBe(3);
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["zero"]);
		expect(
			groups
				.get("1-2")
				?.map((n) => n.id)
				.sort(),
		).toEqual(["low1", "low2"]);
		expect(groups.get("11+")?.map((n) => n.id)).toEqual(["hi"]);
	});

	it("partitions nodes by their tag-vs-file kind when groupBy === 'node_type'", () => {
		const nodes = [makeNode("file1"), makeNode("tag1", { isTag: true }), makeNode("file2", { category: "char" })];
		const groups = partitionNodes(nodes, "node_type", new Map());
		// Tag bucket holds the tag node; non-tag nodes go to category or "file"
		expect(groups.get("tag")?.map((n) => n.id)).toEqual(["tag1"]);
		expect(groups.get("char")?.map((n) => n.id)).toEqual(["file2"]);
		expect(groups.get("file")?.map((n) => n.id)).toEqual(["file1"]);
		expect(groups.size).toBe(3);
	});

	it("uses '__no_<field>__' bucket for nodes missing the field value", () => {
		// "tag" returns [] for tag nodes (per getNodeFieldValues special case)
		// and [] for non-tag nodes without n.tags. Both fall into __no_tag__.
		const nodes = [makeNode("a"), makeNode("b", { isTag: true })];
		const groups = partitionNodes(nodes, "tag", new Map());
		expect(groups.get("__no_tag__")?.length).toBe(2);
	});

	it("strips a trailing ':?' from the field name (partial-query syntax)", () => {
		// "category:?" should behave the same as "category"
		const nodes = [makeNode("a", { category: "x" }), makeNode("b", { category: "y" })];
		const groups = partitionNodes(nodes, "category:?", new Map());
		expect(groups.size).toBe(2);
		expect(groups.get("x")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("y")?.map((n) => n.id)).toEqual(["b"]);
	});
});
