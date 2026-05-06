import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	estimateGroupRadius,
	getSpacing,
	computeEffectiveColumnSpacing,
	pairwiseGap,
	computeGroupGap,
	nodeRadius,
	effectiveRadius,
	estimateLabelWidth,
	estimateLabelExtent,
	analyzeOverlap,
	computeAutoOptimize,
	partitionNodes,
} from "../../src/layouts/cluster-force";
import type { GraphNode } from "../../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

describe("backlinkBucket", () => {
	it("returns '0' for deg=0", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' for deg=1 (low degree boundary)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' for deg=5 (upper boundary of mid bucket)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' for deg within 6-10 range", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' for deg=20 (high-degree bucket)", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(20)).toBe("11+");
	});

	it("handles negative deg by falling into '1-2' bucket (documents current behavior)", () => {
		// Negative values fail `deg === 0` but satisfy `deg <= 2`, landing in "1-2".
		expect(backlinkBucket(-1)).toBe("1-2");
		expect(backlinkBucket(-100)).toBe("1-2");
	});
});

describe("getSpacing", () => {
	it("returns 1.0 fallback when map is undefined", () => {
		expect(getSpacing("node-a", undefined)).toBe(1.0);
	});

	it("returns 1.0 fallback when map is empty", () => {
		expect(getSpacing("node-a", new Map())).toBe(1.0);
	});

	it("returns the mapped value for a valid key", () => {
		const map = new Map<string, number>([["node-a", 2.5]]);
		expect(getSpacing("node-a", map)).toBe(2.5);
	});

	it("returns 1.0 fallback for an invalid (missing) key", () => {
		const map = new Map<string, number>([["node-a", 2.5]]);
		expect(getSpacing("node-b", map)).toBe(1.0);
	});
});

describe("estimateGroupRadius", () => {
	it("returns 0 for an empty group (memberCount=0)", () => {
		// gap * sqrt(0) / 2 = 0, no super-node bonus
		expect(estimateGroupRadius(0, 8, 3, 3)).toBe(0);
	});

	it("returns a positive radius for a single node group", () => {
		const r = estimateGroupRadius(1, 8, 3, 3);
		// gap = 8*2*max(3,3) = 48, radius = 48*1/2 = 24
		expect(r).toBe(24);
	});

	it("grows monotonically with member count", () => {
		const r1 = estimateGroupRadius(1, 8, 3, 3);
		const r4 = estimateGroupRadius(4, 8, 3, 3);
		const r16 = estimateGroupRadius(16, 8, 3, 3);
		expect(r4).toBeGreaterThan(r1);
		expect(r16).toBeGreaterThan(r4);
	});

	it("inflates radius when super node (collapsedMembers) present", () => {
		const plain = makeNode("a");
		const superNode = makeNode("b", { collapsedMembers: ["x", "y", "z", "w"] });
		const rPlain = estimateGroupRadius(3, 8, 3, 3, undefined, [plain, plain, plain]);
		const rSuper = estimateGroupRadius(3, 8, 3, 3, undefined, [plain, plain, superNode]);
		expect(rSuper).toBeGreaterThan(rPlain);
	});
});

describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize*2 when fewer than 2 unique columns", () => {
		const offsets = new Map([["a", { dx: 0, dy: 0 }]]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(20);
	});

	it("returns even spacing from dx range across multiple columns", () => {
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
			["c", { dx: 100, dy: 0 }],
		]);
		// (100 - 0) / (3 - 1) = 50
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(50);
	});
});

describe("pairwiseGap", () => {
	it("uses the larger radius as base", () => {
		// max(3, 5) * 2 * 1 = 10
		expect(pairwiseGap(3, 5, 1)).toBe(10);
		expect(pairwiseGap(5, 3, 1)).toBe(10);
	});

	it("scales linearly with spacing", () => {
		expect(pairwiseGap(4, 4, 2)).toBe(16);
		expect(pairwiseGap(4, 4, 0.5)).toBe(4);
	});

	it("returns 0 when spacing is 0", () => {
		expect(pairwiseGap(10, 10, 0)).toBe(0);
	});

	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 5)).toBe(0);
	});
});

describe("computeGroupGap", () => {
	it("uses max(nodeSpacing, groupScale) as the spacing factor", () => {
		// nodeSize=8, max(2,3)=3, gap = 8*2*3 = 48
		expect(computeGroupGap(8, 2, 3)).toBe(48);
		// max(5,1)=5, gap = 8*2*5 = 80
		expect(computeGroupGap(8, 5, 1)).toBe(80);
	});

	it("matches pairwiseGap with uniform nodeSize and chosen factor", () => {
		expect(computeGroupGap(6, 1, 4)).toBe(pairwiseGap(6, 6, Math.max(1, 4)));
	});

	it("returns 0 when nodeSize is 0", () => {
		expect(computeGroupGap(0, 2, 3)).toBe(0);
	});
});

describe("nodeRadius", () => {
	it("returns the floor (minNodeRadius) when nodeSize is below", () => {
		// safeSize=10, baseR=max(10, 18) = 18
		expect(nodeRadius(10, 0, 18)).toBe(18);
	});

	it("uses nodeSize when above the floor", () => {
		expect(nodeRadius(30, 0, 18)).toBe(30);
	});

	it("falls back to minNodeRadius when nodeSize is non-finite or non-positive", () => {
		// safeSize falls back to minNodeRadius = 18, then max(18, 18) = 18
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
	});

	it("does NOT scale by degree when sizeByDegree is false", () => {
		expect(nodeRadius(20, 50, 18, 100, false)).toBe(20);
	});

	it("scales up with degree when sizeByDegree is true", () => {
		// t=sqrt(100/100)=1, scale = 0.7 + 1.3 = 2.0 → 20*2.0 = 40
		const rMax = nodeRadius(20, 100, 18, 100, true);
		expect(rMax).toBeCloseTo(40, 5);
		// degree 0 with sizeByDegree=true → returns baseR (skips scaling because degree>0 check fails)
		expect(nodeRadius(20, 0, 18, 100, true)).toBe(20);
	});

	it("ignores sizeByDegree when maxDegree=0 (avoids divide-by-zero)", () => {
		expect(nodeRadius(20, 50, 18, 0, true)).toBe(20);
	});
});

describe("effectiveRadius", () => {
	const plain = makeNode("a");

	it("equals nodeRadius for a non-super node with no content scale", () => {
		expect(effectiveRadius(plain, 25, 0, 60, 18)).toBe(25);
	});

	it("inflates radius for super nodes", () => {
		const supernode = makeNode("g", { collapsedMembers: ["x", "y", "z", "w"] });
		// baseR=20, super = 20 * (1 + sqrt(4)*0.5) = 20 * 2 = 40
		expect(effectiveRadius(supernode, 20, 0, 60, 18)).toBe(40);
	});

	it("caps at maxNodeRadius (super-node case)", () => {
		const supernode = makeNode("g", { collapsedMembers: Array.from({ length: 100 }, (_, i) => `n${i}`) });
		// large super-node radius gets capped to 50
		expect(effectiveRadius(supernode, 20, 0, 50, 18)).toBe(50);
	});

	it("treats maxNodeRadius=0 as Infinity (no cap)", () => {
		const supernode = makeNode("g", { collapsedMembers: ["x", "y", "z", "w"] });
		// 20 * (1 + sqrt(4)*0.5) = 40, no cap
		expect(effectiveRadius(supernode, 20, 0, 0, 18)).toBe(40);
	});

	it("enforces the minNodeRadius floor", () => {
		// nodeSize 5 < min 18 → baseR=18, no super → 18
		expect(effectiveRadius(plain, 5, 0, 60, 18)).toBe(18);
	});

	it("applies cardContentScale logarithmic boost only when bodyLength and maxBodyLength are positive", () => {
		// bodyLength=maxBodyLength=100, t = log(101)/log(101) = 1, scale = 1 + 0.5*1 = 1.5
		// baseR = 25 * 1.5 = 37.5
		const r = effectiveRadius(plain, 25, 0, 60, 18, 0, false, 100, 100, 0.5);
		expect(r).toBeCloseTo(37.5, 5);
	});

	it("ignores cardContentScale when maxBodyLength is 0", () => {
		expect(effectiveRadius(plain, 25, 0, 60, 18, 0, false, 100, 0, 0.5)).toBe(25);
	});
});

describe("estimateLabelWidth", () => {
	it("uses label.length * 7 for plain nodes", () => {
		expect(estimateLabelWidth(makeNode("abc", { label: "abc" }))).toBe(3 * 7);
	});

	it("falls back to id when label is missing", () => {
		const n = makeNode("abc");
		n.label = "";
		expect(estimateLabelWidth(n)).toBe("abc".length * 7);
	});

	it("appends '(N)' suffix length for super nodes", () => {
		// label="g" + " (3)" = 1+4 = 5 chars * 7 = 35
		const n = makeNode("g", { label: "g", collapsedMembers: ["x", "y", "z"] });
		expect(estimateLabelWidth(n)).toBe(5 * 7);
	});
});

describe("estimateLabelExtent", () => {
	const plain = makeNode("abc", { label: "abc" });

	it("returns 0 when labelSpacingFactor is 0 or negative", () => {
		expect(estimateLabelExtent(plain, 20, 0, 10, 0)).toBe(0);
		expect(estimateLabelExtent(plain, 20, 0, 10, -1)).toBe(0);
	});

	it("returns 0 for empty label", () => {
		const empty = makeNode("a", { label: "" });
		expect(estimateLabelExtent(empty, 20, 0, 10, 1)).toBe(0);
	});

	it("computes extent at min font when degree=0", () => {
		// fontSize = 11 (importance 0), charW = 11*0.6=6.6, padX=8 (regular)
		// raw = 3*6.6 + 16 = 35.8, * factor 1 = 35.8
		expect(estimateLabelExtent(plain, 20, 0, 10, 1)).toBeCloseTo(35.8, 5);
	});

	it("uses max font when degree equals maxDeg", () => {
		// importance = min(1, 10/10) = 1, fontSize = round(11 + 1*3) = 14
		// charW = 14*0.6 = 8.4, raw = 3*8.4 + 16 = 41.2
		expect(estimateLabelExtent(plain, 20, 10, 10, 1)).toBeCloseTo(41.2, 5);
	});

	it("uses superFontSize and super padX for super nodes", () => {
		const supernode = makeNode("g", { label: "abc", collapsedMembers: ["x"] });
		// fontSize=13 (super), charW=13*0.6=7.8, padX=10
		// raw = 3*7.8 + 20 = 43.4
		expect(estimateLabelExtent(supernode, 20, 0, 10, 1)).toBeCloseTo(43.4, 5);
	});

	it("scales output linearly with labelSpacingFactor", () => {
		const base = estimateLabelExtent(plain, 20, 0, 10, 1);
		expect(estimateLabelExtent(plain, 20, 0, 10, 2)).toBeCloseTo(base * 2, 5);
	});

	it("treats maxDeg=0 as importance=0", () => {
		// Avoid divide-by-zero: importance forced to 0 → fontSize=11
		const r = estimateLabelExtent(plain, 20, 5, 0, 1);
		expect(r).toBeCloseTo(35.8, 5);
	});
});

describe("partitionNodes", () => {
	it("groups all nodes under '__all__' for groupBy=none", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.length).toBe(3);
	});

	it("buckets by backlinks degree", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const degrees = new Map([
			["a", 0],
			["b", 1],
			["c", 7],
		]);
		const groups = partitionNodes(nodes, "backlinks", degrees);
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("1-2")?.map((n) => n.id)).toEqual(["b"]);
		expect(groups.get("6-10")?.map((n) => n.id)).toEqual(["c"]);
	});

	it("groups by node_type — distinguishes tags from files", () => {
		const tag = makeNode("t1", { isTag: true });
		const fileA = makeNode("a", { category: "story" });
		const fileB = makeNode("b"); // no category → "file"
		const groups = partitionNodes([tag, fileA, fileB], "node_type", new Map());
		expect(groups.get("tag")?.map((n) => n.id)).toEqual(["t1"]);
		expect(groups.get("story")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("file")?.map((n) => n.id)).toEqual(["b"]);
	});

	it("returns an empty map for empty input", () => {
		expect(partitionNodes([], "none", new Map()).size).toBe(0);
	});
});

describe("analyzeOverlap", () => {
	it("returns zeroed result when fewer than 2 nodes", () => {
		expect(analyzeOverlap([], new Map(), 2)).toEqual({
			overlapRatio: 0,
			avgRadius: 0,
			closePairs: 0,
			overlapPairs: 0,
		});
		expect(analyzeOverlap([{ id: "a", x: 0, y: 0 }], new Map([["a", 5]]), 2)).toEqual({
			overlapRatio: 0,
			avgRadius: 0,
			closePairs: 0,
			overlapPairs: 0,
		});
	});

	it("counts every pair as close when threshold factor is large enough", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 4, y: 0 },
			{ id: "c", x: 8, y: 0 },
		];
		const radii = new Map([
			["a", 10],
			["b", 10],
			["c", 10],
		]);
		// avgRadius=10, closeThreshold=10*5=50 → all 3 pairs distance ≤ 8 → close
		// dist a-b=4 < 20 (sum radii) → overlap, similarly a-c=8 < 20, b-c=4<20
		const r = analyzeOverlap(nodes, radii, 5);
		expect(r.avgRadius).toBe(10);
		expect(r.closePairs).toBe(3);
		expect(r.overlapPairs).toBe(3);
		expect(r.overlapRatio).toBe(1);
	});

	it("counts no close pairs when nodes are far apart relative to threshold", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 1000, y: 0 },
		];
		const radii = new Map([
			["a", 5],
			["b", 5],
		]);
		const r = analyzeOverlap(nodes, radii, 1);
		expect(r.closePairs).toBe(0);
		expect(r.overlapPairs).toBe(0);
		expect(r.overlapRatio).toBe(0);
	});

	it("falls back to default avgRadius=6 when no nodes have radii", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 1, y: 0 },
		];
		const r = analyzeOverlap(nodes, new Map(), 2);
		expect(r.avgRadius).toBe(6);
	});
});

describe("computeAutoOptimize", () => {
	const cfg = { overlapThreshold: 0.1, padIncrement: 5, padMax: 50, repelScale: 1.5, linkScale: 1.2 };

	it("returns unchanged params and needsMore=false when overlap is below threshold", () => {
		const r = computeAutoOptimize(0.05, 10, { foo: 1 }, 100, 50, cfg);
		expect(r.needsMore).toBe(false);
		expect(r.repelForce).toBe(100);
		expect(r.linkDistance).toBe(50);
		expect(r.constants).toEqual({ foo: 1 });
	});

	it("scales up params when overlap exceeds threshold", () => {
		const r = computeAutoOptimize(0.5, 10, { foo: 1 }, 100, 50, cfg);
		expect(r.needsMore).toBe(true);
		expect(r.repelForce).toBeCloseTo(150, 5);
		expect(r.linkDistance).toBeCloseTo(60, 5);
		expect(r.constants["_overlapPad"]).toBe(5);
		expect(r.constants["_minGap"]).toBe(5); // 10*0.5
		expect(r.constants["foo"]).toBe(1);
	});

	it("caps _overlapPad at padMax across iterations", () => {
		// Start with padMax already reached
		const r = computeAutoOptimize(0.9, 8, { _overlapPad: 50 }, 100, 50, cfg);
		expect(r.constants["_overlapPad"]).toBe(50);
	});

	it("preserves max(_minGap) when current is larger than avgRadius*0.5", () => {
		const r = computeAutoOptimize(0.5, 10, { _minGap: 100 }, 100, 50, cfg);
		// max(100, 5) = 100
		expect(r.constants["_minGap"]).toBe(100);
	});
});
