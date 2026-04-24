import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	partitionNodes,
	estimateGroupRadius,
	computeEffectiveColumnSpacing,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// backlinkBucket
// ---------------------------------------------------------------------------

describe("backlinkBucket", () => {
	it("returns '0' for zero degree", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' for degree 1 and 2 (boundary)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' for degrees 3, 4, 5 (full bucket)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(4)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' for degrees 6 and 10 (boundary)", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' for any degree above 10", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(100)).toBe("11+");
		expect(backlinkBucket(1_000_000)).toBe("11+");
	});

	it("folds negative degrees into '1-2' bucket (deg<=2 matches)", () => {
		// Documents existing behaviour: the `deg === 0` check is strict equality,
		// so negative values pass through to the `deg <= 2` branch.
		expect(backlinkBucket(-1)).toBe("1-2");
		expect(backlinkBucket(-999)).toBe("1-2");
	});
});

// ---------------------------------------------------------------------------
// partitionNodes
// ---------------------------------------------------------------------------

describe("partitionNodes", () => {
	it("returns empty map for empty input", () => {
		const groups = partitionNodes([], "none", new Map());
		expect(groups.size).toBe(0);
	});

	it("collapses all nodes into '__all__' when groupBy is 'none'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.length).toBe(3);
	});

	it("buckets by degree when groupBy is 'backlinks'", () => {
		const nodes = [
			makeNode("isolated"),
			makeNode("sparse"),
			makeNode("hub"),
		];
		const degrees = new Map<string, number>([
			["isolated", 0],
			["sparse", 2],
			["hub", 50],
		]);
		const groups = partitionNodes(nodes, "backlinks", degrees);
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["isolated"]);
		expect(groups.get("1-2")?.map((n) => n.id)).toEqual(["sparse"]);
		expect(groups.get("11+")?.map((n) => n.id)).toEqual(["hub"]);
	});

	it("defaults missing degree entries to 0 bucket for 'backlinks'", () => {
		const nodes = [makeNode("ghost")];
		const groups = partitionNodes(nodes, "backlinks", new Map());
		expect(groups.get("0")?.length).toBe(1);
	});

	it("splits tags vs category vs 'file' via 'node_type'", () => {
		const nodes = [
			makeNode("t1", { isTag: true }),
			makeNode("f1", { category: "note" }),
			makeNode("f2"),
		];
		const groups = partitionNodes(nodes, "node_type", new Map());
		expect(groups.get("tag")?.map((n) => n.id)).toEqual(["t1"]);
		expect(groups.get("note")?.map((n) => n.id)).toEqual(["f1"]);
		expect(groups.get("file")?.map((n) => n.id)).toEqual(["f2"]);
	});

	it("looks up generic fields via getNodeFieldValues (folder)", () => {
		const nodes = [
			makeNode("a", { filePath: "work/a.md" }),
			makeNode("b", { filePath: "work/sub/b.md" }),
			makeNode("c", { filePath: "home/c.md" }),
		];
		const groups = partitionNodes(nodes, "folder", new Map());
		expect(groups.get("work")?.length).toBe(2);
		expect(groups.get("home")?.length).toBe(1);
	});

	it("assigns '__no_<field>__' when field yields no values", () => {
		const nodes = [makeNode("a"), makeNode("b", { category: "c1" })];
		const groups = partitionNodes(nodes, "category", new Map());
		expect(groups.get("__no_category__")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("c1")?.map((n) => n.id)).toEqual(["b"]);
	});

	it("strips trailing ':?' from groupBy before field lookup", () => {
		// "folder:?" is the partial-query syntax; should behave identically to "folder"
		const nodes = [makeNode("a", { filePath: "work/a.md" })];
		const withSuffix = partitionNodes(nodes, "folder:?", new Map());
		const bare = partitionNodes(nodes, "folder", new Map());
		expect([...withSuffix.keys()]).toEqual([...bare.keys()]);
		expect(withSuffix.get("work")?.length).toBe(1);
	});

	it("preserves input order within a bucket", () => {
		const nodes = [makeNode("z"), makeNode("a"), makeNode("m")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.get("__all__")?.map((n) => n.id)).toEqual(["z", "a", "m"]);
	});
});

// ---------------------------------------------------------------------------
// estimateGroupRadius
// ---------------------------------------------------------------------------

describe("estimateGroupRadius", () => {
	it("scales with sqrt(memberCount)", () => {
		const r1 = estimateGroupRadius(1, 10, 1, 1);
		const r4 = estimateGroupRadius(4, 10, 1, 1);
		const r16 = estimateGroupRadius(16, 10, 1, 1);
		// Expect a roughly 1 : 2 : 4 ratio (r16/r4 ≈ 2, r4/r1 ≈ 2)
		expect(r4 / r1).toBeCloseTo(2, 1);
		expect(r16 / r4).toBeCloseTo(2, 1);
	});

	it("returns 0 for zero member count (no members, no super bonus)", () => {
		expect(estimateGroupRadius(0, 10, 1, 1)).toBe(0);
	});

	it("returns positive non-zero for a single member", () => {
		expect(estimateGroupRadius(1, 10, 1, 1)).toBeGreaterThan(0);
	});

	it("scales monotonically with nodeSpacing", () => {
		const small = estimateGroupRadius(9, 10, 1, 1);
		const large = estimateGroupRadius(9, 10, 3, 1);
		expect(large).toBeGreaterThan(small);
	});

	it("scales monotonically with groupScale", () => {
		const small = estimateGroupRadius(9, 10, 1, 1);
		const large = estimateGroupRadius(9, 10, 1, 3);
		expect(large).toBeGreaterThan(small);
	});

	it("inflates via super-node bonus when a collapsed member exists", () => {
		const plain = estimateGroupRadius(4, 10, 1, 1);
		const superNode = makeNode("super", {
			collapsedMembers: Array.from({ length: 20 }, (_, i) => `n${i}`) as unknown as GraphNode["collapsedMembers"],
		});
		const inflated = estimateGroupRadius(4, 10, 1, 1, undefined, [superNode]);
		expect(inflated).toBeGreaterThan(plain);
	});

	it("ignores non-super members when computing super bonus", () => {
		const plain = estimateGroupRadius(4, 10, 1, 1);
		const regular = [makeNode("a"), makeNode("b"), makeNode("c")];
		const withRegulars = estimateGroupRadius(4, 10, 1, 1, undefined, regular);
		expect(withRegulars).toBe(plain);
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveColumnSpacing
// ---------------------------------------------------------------------------

describe("computeEffectiveColumnSpacing", () => {
	function makeOffsets(xs: number[]): Map<string, { dx: number; dy: number }> {
		const m = new Map<string, { dx: number; dy: number }>();
		xs.forEach((x, i) => m.set(`n${i}`, { dx: x, dy: 0 }));
		return m;
	}

	it("falls back to nodeSize*2 when map is empty", () => {
		expect(computeEffectiveColumnSpacing(new Map(), 8)).toBe(16);
	});

	it("falls back to nodeSize*2 when all dx values collapse into a single column", () => {
		const offsets = makeOffsets([5, 5, 5]);
		expect(computeEffectiveColumnSpacing(offsets, 12)).toBe(24);
	});

	it("treats near-identical dx as one column (rounds to 2 decimals)", () => {
		// Math.round(x * 100) means 5.001 and 5.009 both round to 501 — single col.
		const offsets = makeOffsets([5.001, 5.002, 5.003]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(20);
	});

	it("computes spacing (max-min)/(nCols-1) for two columns", () => {
		const offsets = makeOffsets([0, 100]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(100);
	});

	it("computes spacing for N evenly-spaced columns", () => {
		// 4 unique dx values evenly spaced by 25 → (75 - 0) / 3 = 25
		const offsets = makeOffsets([0, 25, 50, 75]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(25);
	});

	it("handles unevenly-spaced columns: returns average inter-column spacing", () => {
		// 3 columns at 0, 10, 100 — nCols=3, (100-0)/(3-1) = 50
		const offsets = makeOffsets([0, 10, 100]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(50);
	});

	it("handles negative dx values correctly", () => {
		const offsets = makeOffsets([-40, 0, 40]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(40);
	});
});
