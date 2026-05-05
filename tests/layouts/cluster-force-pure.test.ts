import { describe, it, expect } from "vitest";
import {
	analyzeOverlap,
	computeAutoOptimize,
	computeGroupGap,
	effectiveRadius,
	estimateLabelExtent,
	estimateLabelWidth,
	nodeRadius,
	pairwiseGap,
	partitionNodes,
} from "../../src/layouts/cluster-force";
import type { GraphNode } from "../../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

describe("pairwiseGap", () => {
	it("uses the larger radius as reference (asymmetric input)", () => {
		// max(2, 10) * 2 * 1 = 20
		expect(pairwiseGap(2, 10, 1)).toBe(20);
		// Symmetry: order independent
		expect(pairwiseGap(10, 2, 1)).toBe(20);
	});

	it("scales linearly with spacing", () => {
		expect(pairwiseGap(5, 5, 1)).toBe(10);
		expect(pairwiseGap(5, 5, 2)).toBe(20);
		expect(pairwiseGap(5, 5, 3.5)).toBe(35);
	});

	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 5)).toBe(0);
	});

	it("returns 0 when spacing is 0", () => {
		expect(pairwiseGap(10, 10, 0)).toBe(0);
	});
});

describe("computeGroupGap", () => {
	it("delegates to pairwiseGap with max(nodeSpacing, groupScale)", () => {
		// max(2, 5) = 5; pairwiseGap(8, 8, 5) = 80
		expect(computeGroupGap(8, 2, 5)).toBe(80);
		// max(7, 3) = 7; pairwiseGap(8, 8, 7) = 112
		expect(computeGroupGap(8, 7, 3)).toBe(112);
	});

	it("returns 0 for zero nodeSize", () => {
		expect(computeGroupGap(0, 1, 1)).toBe(0);
	});
});

describe("nodeRadius", () => {
	it("enforces minNodeRadius floor when nodeSize is below floor", () => {
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("returns nodeSize when above the floor", () => {
		expect(nodeRadius(30, 0, 18)).toBe(30);
	});

	it("falls back to minNodeRadius when nodeSize is non-finite", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
	});

	it("falls back to minNodeRadius when nodeSize is non-positive", () => {
		expect(nodeRadius(-5, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
	});

	it("does not scale by degree when sizeByDegree is false", () => {
		expect(nodeRadius(20, 100, 18, 100, false)).toBe(20);
	});

	it("does not scale when maxDegree is 0 even if sizeByDegree=true", () => {
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});

	it("scales by degree at the formula boundaries when sizeByDegree=true", () => {
		// degree=0 → no scaling: returns base
		expect(nodeRadius(20, 0, 18, 100, true)).toBe(20);
		// degree=max → t=1, multiplier = 0.7 + 1.3 = 2.0
		expect(nodeRadius(20, 100, 18, 100, true)).toBeCloseTo(40);
	});

	it("scales monotonically with degree under sizeByDegree", () => {
		const r1 = nodeRadius(20, 1, 18, 100, true);
		const r10 = nodeRadius(20, 10, 18, 100, true);
		const r50 = nodeRadius(20, 50, 18, 100, true);
		expect(r10).toBeGreaterThan(r1);
		expect(r50).toBeGreaterThan(r10);
	});
});

describe("effectiveRadius", () => {
	it("returns minNodeRadius for a plain node with size below floor", () => {
		const n = makeNode("a");
		expect(effectiveRadius(n, 5, 0, 60, 18)).toBe(18);
	});

	it("caps the radius at maxNodeRadius", () => {
		const n = makeNode("a");
		// nodeSize 200 with maxR cap 60
		expect(effectiveRadius(n, 200, 0, 60, 18)).toBe(60);
	});

	it("treats maxNodeRadius<=0 as no cap", () => {
		const n = makeNode("a");
		// maxR=0 → cap = Infinity; radius = 200
		expect(effectiveRadius(n, 200, 0, 0, 18)).toBe(200);
	});

	it("inflates radius for super nodes (collapsedMembers)", () => {
		const plain = makeNode("a");
		const sup = makeNode("b", { collapsedMembers: ["x", "y", "z", "w"] });
		const rPlain = effectiveRadius(plain, 20, 0, 200, 18);
		const rSuper = effectiveRadius(sup, 20, 0, 200, 18);
		expect(rSuper).toBeGreaterThan(rPlain);
		// Formula: baseR=20, factor = 1 + sqrt(4)*0.5 = 2.0 → 40
		expect(rSuper).toBeCloseTo(40);
	});

	it("super node respects max cap", () => {
		const sup = makeNode("b", { collapsedMembers: Array(100).fill("x") });
		// Even with 100 members the cap should bind
		expect(effectiveRadius(sup, 20, 0, 60, 18)).toBe(60);
	});

	it("applies cardContentScale (HM mode) only when both bodyLength and maxBodyLength > 0", () => {
		const n = makeNode("a");
		// No HM scaling when cardContentScale = 0
		const baseline = effectiveRadius(n, 20, 0, 200, 18, 0, false, 100, 1000, 0);
		expect(baseline).toBe(20);
		// HM scaling triggers and increases radius when bodyLength matches maxBodyLength
		const scaled = effectiveRadius(n, 20, 0, 200, 18, 0, false, 1000, 1000, 0.5);
		// t = log(1001)/log(1001) = 1 → 20 * (1 + 0.5*1) = 30
		expect(scaled).toBeCloseTo(30);
	});

	it("HM scaling skipped when bodyLength is 0", () => {
		const n = makeNode("a");
		const r = effectiveRadius(n, 20, 0, 200, 18, 0, false, 0, 1000, 0.5);
		expect(r).toBe(20);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor is 0 (label spacing disabled)", () => {
		const n = makeNode("hello");
		expect(estimateLabelExtent(n, 20, 1, 10, 0)).toBe(0);
	});

	it("returns 0 for an empty label", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 20, 1, 10, 1)).toBe(0);
	});

	it("returns positive width proportional to label length for plain node", () => {
		const short = makeNode("ab", { label: "ab" });
		const long = makeNode("abcdefghij", { label: "abcdefghij" });
		const wShort = estimateLabelExtent(short, 20, 0, 0, 1);
		const wLong = estimateLabelExtent(long, 20, 0, 0, 1);
		expect(wLong).toBeGreaterThan(wShort);
	});

	it("scales linearly with labelSpacingFactor", () => {
		const n = makeNode("hello", { label: "hello" });
		const w1 = estimateLabelExtent(n, 20, 0, 0, 1);
		const w2 = estimateLabelExtent(n, 20, 0, 0, 2);
		expect(w2).toBeCloseTo(w1 * 2);
	});

	it("uses super-node font size and padding for collapsed nodes", () => {
		const plain = makeNode("a", { label: "hello" });
		const sup = makeNode("b", { label: "hello", collapsedMembers: ["x"] });
		// Super node uses fontSize=13 and padX=10 (vs fontSize<=14 with padX=8 plain)
		// Difference is non-trivial — assert both >0 and they differ.
		const wp = estimateLabelExtent(plain, 20, 0, 0, 1);
		const ws = estimateLabelExtent(sup, 20, 0, 0, 1);
		expect(wp).toBeGreaterThan(0);
		expect(ws).toBeGreaterThan(0);
		expect(ws).not.toBe(wp);
	});

	it("treats maxDeg=0 as importance=0 (uses fontMin for plain node)", () => {
		const n = makeNode("a", { label: "abcd" });
		// importance = 0; fontSize = 11; charW = 11 * 0.6 = 6.6; padX = 8
		// rawWidth = 4*6.6 + 16 = 42.4
		expect(estimateLabelExtent(n, 20, 5, 0, 1)).toBeCloseTo(42.4);
	});
});

describe("estimateLabelWidth", () => {
	it("uses 7px-per-char heuristic", () => {
		const n = makeNode("a", { label: "abcd" });
		// 4 chars * 7 = 28 (no super suffix)
		expect(estimateLabelWidth(n)).toBe(28);
	});

	it("appends ' (N)' suffix for super nodes (collapsedMembers present)", () => {
		const sup = makeNode("a", { label: "x", collapsedMembers: ["m1", "m2", "m3"] });
		// "x" + " (3)" = 5 chars * 7 = 35
		expect(estimateLabelWidth(sup)).toBe(35);
	});

	it("falls back to id when label is missing", () => {
		const n = makeNode("hello", { label: "" });
		// label="" is falsy → uses id "hello" (5 chars * 7 = 35)
		expect(estimateLabelWidth(n)).toBe(35);
	});
});

describe("partitionNodes", () => {
	it("returns single '__all__' bucket for groupBy='none'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.length).toBe(3);
	});

	it("partitions by backlink degree buckets", () => {
		const nodes = [
			makeNode("a"), // deg 0
			makeNode("b"), // deg 1
			makeNode("c"), // deg 5
			makeNode("d"), // deg 100
		];
		const degrees = new Map([
			["a", 0],
			["b", 1],
			["c", 5],
			["d", 100],
		]);
		const groups = partitionNodes(nodes, "backlinks", degrees);
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("1-2")?.map((n) => n.id)).toEqual(["b"]);
		expect(groups.get("3-5")?.map((n) => n.id)).toEqual(["c"]);
		expect(groups.get("11+")?.map((n) => n.id)).toEqual(["d"]);
	});

	it("partitions by node_type (tag vs category vs file)", () => {
		const nodes = [
			makeNode("t1", { isTag: true }),
			makeNode("c1", { category: "char" }),
			makeNode("c2", { category: "char" }),
			makeNode("f1"), // no category, not a tag → "file"
		];
		const groups = partitionNodes(nodes, "node_type", new Map());
		expect(groups.get("tag")?.length).toBe(1);
		expect(groups.get("char")?.length).toBe(2);
		expect(groups.get("file")?.length).toBe(1);
	});

	it("partitions by generic field (folder) using getNodeFieldValues", () => {
		const nodes = [
			makeNode("a", { filePath: "novel/chapter1.md" }),
			makeNode("b", { filePath: "novel/chapter2.md" }),
			makeNode("c", { filePath: "essay/intro.md" }),
		];
		const groups = partitionNodes(nodes, "folder", new Map());
		expect(groups.get("novel")?.length).toBe(2);
		expect(groups.get("essay")?.length).toBe(1);
	});

	it("uses '__no_<field>__' bucket for nodes lacking the field", () => {
		const nodes = [makeNode("a")]; // no filePath
		const groups = partitionNodes(nodes, "folder", new Map());
		expect(groups.get("__no_folder__")?.length).toBe(1);
	});

	it("strips trailing ':?' partial-query suffix from groupBy", () => {
		const nodes = [makeNode("a", { filePath: "novel/x.md" })];
		const groups = partitionNodes(nodes, "folder:?", new Map());
		// Should group identically to plain "folder"
		expect(groups.get("novel")?.length).toBe(1);
	});
});

describe("analyzeOverlap", () => {
	it("returns zero metrics for fewer than 2 nodes", () => {
		const empty = analyzeOverlap([], new Map(), 2);
		expect(empty).toEqual({ overlapRatio: 0, avgRadius: 0, closePairs: 0, overlapPairs: 0 });

		const single = analyzeOverlap([{ id: "a", x: 0, y: 0 }], new Map([["a", 5]]), 2);
		expect(single.overlapRatio).toBe(0);
	});

	it("counts overlapping pairs correctly when nodes are coincident", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 0, y: 0 },
		];
		const radii = new Map([
			["a", 10],
			["b", 10],
		]);
		const result = analyzeOverlap(nodes, radii, 2);
		expect(result.avgRadius).toBe(10);
		expect(result.closePairs).toBe(1);
		expect(result.overlapPairs).toBe(1);
		expect(result.overlapRatio).toBe(1);
	});

	it("counts close (but not overlapping) pairs", () => {
		// avgRadius=10, factor=3 → closeThreshold=30; ra+rb=20.
		// dist=22 satisfies close (<30) but not overlap (>=20).
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 22, y: 0 },
		];
		const radii = new Map([
			["a", 10],
			["b", 10],
		]);
		const result = analyzeOverlap(nodes, radii, 3);
		expect(result.closePairs).toBe(1);
		expect(result.overlapPairs).toBe(0);
		expect(result.overlapRatio).toBe(0);
	});

	it("uses default avgRadius=6 when no radii are supplied", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 100, y: 0 },
		];
		// No radii → fallback avgRadius=6, threshold=12, dist=100 → no close pair
		const result = analyzeOverlap(nodes, new Map(), 2);
		expect(result.avgRadius).toBe(6);
		expect(result.closePairs).toBe(0);
	});
});

describe("computeAutoOptimize", () => {
	const cfg = {
		overlapThreshold: 0.1,
		padIncrement: 5,
		padMax: 20,
		repelScale: 1.5,
		linkScale: 1.2,
	};

	it("returns inputs untouched when overlapRatio is below threshold", () => {
		const result = computeAutoOptimize(0.05, 10, { existing: 1 }, 100, 50, cfg);
		expect(result.needsMore).toBe(false);
		expect(result.constants).toEqual({ existing: 1 });
		expect(result.repelForce).toBe(100);
		expect(result.linkDistance).toBe(50);
	});

	it("increments _overlapPad and applies scales when above threshold", () => {
		const result = computeAutoOptimize(0.5, 10, {}, 100, 50, cfg);
		expect(result.needsMore).toBe(true);
		expect(result.constants["_overlapPad"]).toBe(5);
		expect(result.constants["_minGap"]).toBe(5); // 10*0.5
		expect(result.repelForce).toBe(150);
		expect(result.linkDistance).toBe(60);
	});

	it("caps _overlapPad at padMax across iterations", () => {
		// existing pad already at the cap
		const result = computeAutoOptimize(0.5, 10, { _overlapPad: 18 }, 100, 50, cfg);
		// 18 + 5 = 23 → capped at 20
		expect(result.constants["_overlapPad"]).toBe(20);
	});

	it("preserves the larger of existing _minGap and computed value", () => {
		const result = computeAutoOptimize(0.5, 10, { _minGap: 100 }, 100, 50, cfg);
		// existing 100 > computed 5 → stays 100
		expect(result.constants["_minGap"]).toBe(100);
	});
});
