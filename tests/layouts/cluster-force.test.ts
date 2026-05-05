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
	estimateLabelExtent,
	estimateLabelWidth,
	partitionNodes,
	analyzeOverlap,
	computeAutoOptimize,
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
	it("uses the larger radius as the reference (r1 > r2)", () => {
		// max(10, 4) * 2 * 1.5 = 30
		expect(pairwiseGap(10, 4, 1.5)).toBe(30);
	});

	it("uses the larger radius as the reference (r1 < r2)", () => {
		// max(3, 12) * 2 * 2 = 48
		expect(pairwiseGap(3, 12, 2)).toBe(48);
	});

	it("returns symmetric value when radii are equal", () => {
		expect(pairwiseGap(7, 7, 1)).toBe(14);
	});

	it("returns 0 when spacing is 0", () => {
		expect(pairwiseGap(5, 8, 0)).toBe(0);
	});

	it("scales linearly with spacing", () => {
		const a = pairwiseGap(5, 5, 1);
		const b = pairwiseGap(5, 5, 3);
		expect(b).toBe(a * 3);
	});
});

describe("computeGroupGap", () => {
	it("picks max(nodeSpacing, groupScale) as the spacing factor", () => {
		// nodeSpacing=2, groupScale=5 → max=5 → 8 * 2 * 5 = 80
		expect(computeGroupGap(8, 2, 5)).toBe(80);
	});

	it("uses nodeSpacing when it exceeds groupScale", () => {
		// nodeSpacing=4, groupScale=1 → max=4 → 6 * 2 * 4 = 48
		expect(computeGroupGap(6, 4, 1)).toBe(48);
	});

	it("returns 0 when both spacing factors are 0", () => {
		expect(computeGroupGap(10, 0, 0)).toBe(0);
	});

	it("matches pairwiseGap with equal radii under the dominant spacing", () => {
		// Equivalence: computeGroupGap(s, a, b) === pairwiseGap(s, s, max(a, b))
		expect(computeGroupGap(8, 3, 5)).toBe(pairwiseGap(8, 8, 5));
	});
});

describe("nodeRadius", () => {
	it("returns max(nodeSize, minNodeRadius) when sizeByDegree is off", () => {
		expect(nodeRadius(20, 5, 18)).toBe(20); // size > floor
		expect(nodeRadius(10, 5, 18)).toBe(18); // floored
	});

	it("falls back to minNodeRadius for non-finite or non-positive nodeSize", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
	});

	it("scales by sqrt(degree/maxDegree) when sizeByDegree=true", () => {
		// baseR=20, t=sqrt(1/4)=0.5 → 20 * (0.7 + 0.5*1.3) = 20 * 1.35 = 27
		expect(nodeRadius(20, 1, 18, 4, true)).toBeCloseTo(27, 5);
	});

	it("returns base when sizeByDegree=true but degree=0", () => {
		expect(nodeRadius(20, 0, 18, 4, true)).toBe(20);
	});

	it("returns base when sizeByDegree=true but maxDegree=0", () => {
		// Guard branch: maxDegree must be > 0 to apply boost
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});

	it("reaches 2.0× base at full degree (sqrt(1)=1 → 0.7+1.3=2.0)", () => {
		expect(nodeRadius(20, 4, 18, 4, true)).toBeCloseTo(40, 5);
	});
});

describe("effectiveRadius", () => {
	const plainNode = (overrides?: Partial<GraphNode>) => makeNode("p", overrides);

	it("returns nodeSize floored to minNodeRadius for plain nodes", () => {
		expect(effectiveRadius(plainNode(), 30, 0)).toBe(30);
		expect(effectiveRadius(plainNode(), 5, 0, 60, 18)).toBe(18); // floored
	});

	it("inflates by sqrt(memberCount) for super nodes", () => {
		const sn = plainNode({ collapsedMembers: ["a", "b", "c", "d"] }); // sqrt(4)=2
		// baseR=20, super = 20 * (1 + 2 * 0.5) = 20 * 2 = 40
		expect(effectiveRadius(sn, 20, 0)).toBe(40);
	});

	it("caps super-node radius at maxNodeRadius", () => {
		const sn = plainNode({ collapsedMembers: Array(100).fill("x") });
		// Without cap, super_r would be huge — must equal cap=60.
		expect(effectiveRadius(sn, 20, 0, 60)).toBe(60);
	});

	it("treats maxNodeRadius=0 as no cap (Infinity)", () => {
		const sn = plainNode({ collapsedMembers: Array(16).fill("x") }); // sqrt(16)=4
		// baseR=20, super = 20 * (1 + 4 * 0.5) = 20 * 3 = 60
		expect(effectiveRadius(sn, 20, 0, 0)).toBe(60);
	});

	it("applies log-based bodyLength boost when cardContentScale > 0", () => {
		// t = log(101)/log(101) = 1 → baseR * (1 + 1.0 * 1) = 2× boost
		const r = effectiveRadius(plainNode(), 20, 0, 60, 18, 0, false, 100, 100, 1.0);
		expect(r).toBeCloseTo(40, 5);
	});

	it("ignores bodyLength boost when cardContentScale=0", () => {
		expect(effectiveRadius(plainNode(), 20, 0, 60, 18, 0, false, 100, 100, 0)).toBe(20);
	});

	it("ignores bodyLength boost when bodyLength=0 or maxBodyLength=0", () => {
		expect(effectiveRadius(plainNode(), 20, 0, 60, 18, 0, false, 0, 100, 1.0)).toBe(20);
		expect(effectiveRadius(plainNode(), 20, 0, 60, 18, 0, false, 100, 0, 1.0)).toBe(20);
	});

	it("enforces minNodeRadius floor even when cap shrinks below it", () => {
		// maxNodeRadius=5, minNodeRadius=18 → floor wins
		expect(effectiveRadius(plainNode(), 20, 0, 5, 18)).toBe(18);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor is 0", () => {
		expect(estimateLabelExtent(makeNode("a", { label: "hello" }), 18, 5, 10, 0)).toBe(0);
	});

	it("returns 0 for empty label", () => {
		expect(estimateLabelExtent(makeNode("a", { label: "" }), 18, 5, 10, 1)).toBe(0);
	});

	it("scales linearly with labelSpacingFactor", () => {
		const a = estimateLabelExtent(makeNode("a", { label: "abc" }), 18, 5, 10, 1);
		const b = estimateLabelExtent(makeNode("a", { label: "abc" }), 18, 5, 10, 2);
		expect(b).toBeCloseTo(a * 2, 5);
	});

	it("uses superFontSize for super nodes regardless of degree", () => {
		const sn = makeNode("a", { label: "abc", collapsedMembers: ["x"] });
		const plain = makeNode("a", { label: "abc" });
		// At degree=0/maxDeg=10, importance=0 → plain uses fontMin=11; super uses 13.
		// Both add their respective padding (super=10, regular=8).
		// charW = font * 0.6 → super=7.8, regular=6.6.
		// regular = 3 * 6.6 + 16 = 35.8
		// super   = 3 * 7.8 + 20 = 43.4
		expect(estimateLabelExtent(plain, 18, 0, 10, 1)).toBeCloseTo(35.8, 5);
		expect(estimateLabelExtent(sn, 18, 0, 10, 1)).toBeCloseTo(43.4, 5);
	});

	it("interpolates regular fontSize between fontMin and fontMax by degree", () => {
		// degree=10/maxDeg=10 → importance=1 → fontSize = round(11 + 1*(14-11)) = 14
		// charW = 14*0.6 = 8.4; padX=8 → 3*8.4 + 16 = 41.2
		expect(estimateLabelExtent(makeNode("a", { label: "abc" }), 18, 10, 10, 1)).toBeCloseTo(41.2, 5);
	});

	it("treats maxDeg=0 as importance=0 (uses fontMin)", () => {
		// importance branch: maxDeg <= 0 → 0 → fontMin
		const r = estimateLabelExtent(makeNode("a", { label: "abc" }), 18, 5, 0, 1);
		// fontSize=11 → charW=6.6 → 3*6.6 + 16 = 35.8
		expect(r).toBeCloseTo(35.8, 5);
	});
});

describe("estimateLabelWidth", () => {
	it("uses label or falls back to id", () => {
		expect(estimateLabelWidth(makeNode("abc", { label: "" }))).toBe(3 * 7); // "" falls back to id "abc"
		expect(estimateLabelWidth(makeNode("a", { label: "hello" }))).toBe(5 * 7);
	});

	it("appends ' (N)' suffix length for super nodes", () => {
		// label="ab" + suffix=" (3)" (4 chars) → 6 * 7 = 42
		const sn = makeNode("a", { label: "ab", collapsedMembers: ["x", "y", "z"] });
		expect(estimateLabelWidth(sn)).toBe(42);
	});

	it("returns 0 for empty label and empty id (both empty string fallback)", () => {
		// label='' → fallback to id ''. Both length 0.
		expect(estimateLabelWidth(makeNode("", { label: "" }))).toBe(0);
	});
});

describe("partitionNodes", () => {
	it("returns single __all__ bucket for groupBy='none'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.length).toBe(3);
	});

	it("buckets by backlinks degree via backlinkBucket", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const degrees = new Map([
			["a", 0],
			["b", 1],
			["c", 5],
			["d", 20],
		]);
		const groups = partitionNodes(nodes, "backlinks", degrees);
		expect(groups.get("0")?.length).toBe(1);
		expect(groups.get("1-2")?.length).toBe(1);
		expect(groups.get("3-5")?.length).toBe(1);
		expect(groups.get("11+")?.length).toBe(1);
	});

	it("buckets by node_type: tag/category/file fallback", () => {
		const nodes = [
			makeNode("a", { isTag: true }),
			makeNode("b", { category: "char" }),
			makeNode("c"), // no category, no tag → "file"
		];
		const groups = partitionNodes(nodes, "node_type", new Map());
		expect(groups.get("tag")?.length).toBe(1);
		expect(groups.get("char")?.length).toBe(1);
		expect(groups.get("file")?.length).toBe(1);
	});

	it("buckets by generic field via getNodeFieldValues, with __no_<field>__ for missing", () => {
		const nodes = [
			makeNode("a", { category: "x" }),
			makeNode("b", { category: "x" }),
			makeNode("c"), // no category
		];
		const groups = partitionNodes(nodes, "category", new Map());
		expect(groups.get("x")?.length).toBe(2);
		expect(groups.get("__no_category__")?.length).toBe(1);
	});

	it("strips trailing ':?' partial-query suffix from groupBy", () => {
		const nodes = [makeNode("a", { category: "x" }), makeNode("b", { category: "y" })];
		const groups = partitionNodes(nodes, "category:?", new Map());
		// Should treat as "category", not as a missing field
		expect(groups.get("x")?.length).toBe(1);
		expect(groups.get("y")?.length).toBe(1);
	});

	it("returns empty Map for empty node list", () => {
		expect(partitionNodes([], "none", new Map()).size).toBe(0);
	});
});

describe("analyzeOverlap", () => {
	it("returns zeroed result for fewer than 2 nodes", () => {
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

	it("counts no overlaps when nodes are far apart", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 1000, y: 0 },
		];
		const radii = new Map([
			["a", 10],
			["b", 10],
		]);
		const result = analyzeOverlap(nodes, radii, 2);
		// closeThreshold = avg(10) * 2 = 20; dist = 1000 → not close
		expect(result.closePairs).toBe(0);
		expect(result.overlapPairs).toBe(0);
		expect(result.overlapRatio).toBe(0);
		expect(result.avgRadius).toBe(10);
	});

	it("detects close pair without overlap (between radii sum and threshold)", () => {
		// avg=10, threshold=20; dist=15 < 20 (close) but >= 10+10=20? actually dist 15 < 20 = sum → also overlap.
		// Use 21 instead: dist=21 < 25 (closeThreshold) AND >= 20 → close, not overlap.
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 21, y: 0 },
		];
		const radii = new Map([
			["a", 10],
			["b", 10],
		]);
		const result = analyzeOverlap(nodes, radii, 2.5);
		expect(result.closePairs).toBe(1);
		expect(result.overlapPairs).toBe(0);
		expect(result.overlapRatio).toBe(0);
	});

	it("detects overlapping pairs (dist < r1 + r2)", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 5, y: 0 },
		];
		const radii = new Map([
			["a", 10],
			["b", 10],
		]);
		const result = analyzeOverlap(nodes, radii, 2);
		expect(result.closePairs).toBe(1);
		expect(result.overlapPairs).toBe(1);
		expect(result.overlapRatio).toBe(1);
	});

	it("falls back to fixed avgRadius=6 when no radii are available", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 50, y: 0 },
		];
		// All radii missing → avgRadius=6, closeThreshold=12; dist=50 → no close.
		const result = analyzeOverlap(nodes, new Map(), 2);
		expect(result.avgRadius).toBe(6);
		expect(result.closePairs).toBe(0);
	});
});

describe("computeAutoOptimize", () => {
	const baseCfg = {
		overlapThreshold: 0.1,
		padIncrement: 5,
		padMax: 50,
		repelScale: 1.2,
		linkScale: 0.9,
	};

	it("returns unchanged values with needsMore=false when below threshold", () => {
		const constants = { existing: 7 };
		const result = computeAutoOptimize(0.05, 12, constants, 100, 80, baseCfg);
		expect(result.needsMore).toBe(false);
		expect(result.constants).toEqual({ existing: 7 });
		// Must not mutate the input
		expect(result.constants).not.toBe(constants);
		expect(result.repelForce).toBe(100);
		expect(result.linkDistance).toBe(80);
	});

	it("applies padIncrement and minGap, scales repel/link when above threshold", () => {
		const result = computeAutoOptimize(0.5, 20, {}, 100, 80, baseCfg);
		expect(result.needsMore).toBe(true);
		expect(result.constants["_overlapPad"]).toBe(5); // 0 + 5
		expect(result.constants["_minGap"]).toBe(10); // avgRadius * 0.5 = 20 * 0.5
		expect(result.repelForce).toBeCloseTo(120, 5); // 100 * 1.2
		expect(result.linkDistance).toBeCloseTo(72, 5); // 80 * 0.9
	});

	it("caps _overlapPad at padMax", () => {
		// curPad=48, +5=53, but capped at 50.
		const result = computeAutoOptimize(0.5, 20, { _overlapPad: 48 }, 100, 80, baseCfg);
		expect(result.constants["_overlapPad"]).toBe(50);
	});

	it("preserves the larger _minGap when current exceeds avgRadius*0.5", () => {
		// curGap=50, avgRadius*0.5=10 → max=50 (preserved).
		const result = computeAutoOptimize(0.5, 20, { _minGap: 50 }, 100, 80, baseCfg);
		expect(result.constants["_minGap"]).toBe(50);
	});

	it("triggers exactly at threshold boundary (overlapRatio === threshold → no change)", () => {
		// `<= threshold` short-circuits, so equality means no change.
		const result = computeAutoOptimize(0.1, 20, {}, 100, 80, baseCfg);
		expect(result.needsMore).toBe(false);
	});
});
