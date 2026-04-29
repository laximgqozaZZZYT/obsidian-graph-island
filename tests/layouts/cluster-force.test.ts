import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	estimateGroupRadius,
	getSpacing,
	computeEffectiveColumnSpacing,
	pairwiseGap,
	computeGroupGap,
	estimateLabelExtent,
	estimateLabelWidth,
	nodeRadius,
	effectiveRadius,
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
	it("uses the larger radius and multiplies by 2 × spacing", () => {
		// max(3, 5) * 2 * 1 = 10
		expect(pairwiseGap(3, 5, 1)).toBe(10);
	});

	it("is commutative in r1/r2 (max is symmetric)", () => {
		expect(pairwiseGap(8, 4, 2)).toBe(pairwiseGap(4, 8, 2));
	});

	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 5)).toBe(0);
	});

	it("scales linearly with spacing", () => {
		const g1 = pairwiseGap(10, 10, 1);
		const g2 = pairwiseGap(10, 10, 2);
		const g4 = pairwiseGap(10, 10, 4);
		expect(g2).toBe(2 * g1);
		expect(g4).toBe(4 * g1);
	});

	it("returns 0 when spacing is 0 (collapsed gap)", () => {
		expect(pairwiseGap(10, 20, 0)).toBe(0);
	});
});

describe("computeGroupGap", () => {
	it("equals pairwiseGap with uniform nodeSize and max(nodeSpacing, groupScale)", () => {
		// max(1.5, 2) = 2 → 8 * 2 * 2 = 32
		expect(computeGroupGap(8, 1.5, 2)).toBe(32);
	});

	it("uses nodeSpacing when it exceeds groupScale", () => {
		// max(3, 1) = 3 → 4 * 2 * 3 = 24
		expect(computeGroupGap(4, 3, 1)).toBe(24);
	});

	it("returns 0 when nodeSize is 0", () => {
		expect(computeGroupGap(0, 5, 5)).toBe(0);
	});

	it("returns 0 when both spacing factors are 0", () => {
		expect(computeGroupGap(10, 0, 0)).toBe(0);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor <= 0 (no extent reservation)", () => {
		const n = makeNode("a", { label: "Hello world" });
		expect(estimateLabelExtent(n, 18, 0, 10, 0)).toBe(0);
		expect(estimateLabelExtent(n, 18, 0, 10, -1)).toBe(0);
	});

	it("returns 0 for empty label", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 18, 0, 10, 1)).toBe(0);
	});

	it("uses superFontSize and super pad for super nodes", () => {
		const n = makeNode("a", {
			label: "x",
			collapsedMembers: ["m1", "m2"],
		});
		// fontSize = 13 (superFontSize), charW = 13*0.6 = 7.8
		// padX = 10 (super) → raw = 1*7.8 + 10*2 = 27.8
		const r = estimateLabelExtent(n, 18, 0, 10, 1, 11, 14, 13);
		expect(r).toBeCloseTo(27.8, 5);
	});

	it("scales width by labelSpacingFactor", () => {
		const n = makeNode("a", { label: "abcd" });
		const r1 = estimateLabelExtent(n, 18, 0, 10, 1);
		const r2 = estimateLabelExtent(n, 18, 0, 10, 2);
		expect(r2).toBeCloseTo(2 * r1, 5);
	});

	it("uses fontMin when degree is 0 (lowest importance)", () => {
		const n = makeNode("a", { label: "x" });
		// fontSize = round(11 + 0*(14-11)) = 11, charW = 6.6, padX = 8 → raw = 6.6 + 16 = 22.6
		const r = estimateLabelExtent(n, 18, 0, 10, 1, 11, 14);
		expect(r).toBeCloseTo(22.6, 5);
	});

	it("treats maxDeg=0 as zero importance (no division by zero)", () => {
		const n = makeNode("a", { label: "x" });
		const r = estimateLabelExtent(n, 18, 5, 0, 1, 11, 14);
		// importance = 0 → fontSize = fontMin = 11
		expect(r).toBeCloseTo(22.6, 5);
		expect(Number.isFinite(r)).toBe(true);
	});
});

describe("estimateLabelWidth", () => {
	it("uses node.label length × 7", () => {
		const n = makeNode("x", { label: "abcd" });
		expect(estimateLabelWidth(n)).toBe(4 * 7);
	});

	it("falls back to id when label is missing", () => {
		const n: GraphNode = {
			id: "longer-id",
			label: "",
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
		};
		// "" is falsy → fallback to id ("longer-id" = 9 chars) → 63
		expect(estimateLabelWidth(n)).toBe(9 * 7);
	});

	it("appends ' (N)' suffix for super nodes", () => {
		const n = makeNode("a", {
			label: "ab",
			collapsedMembers: ["m1", "m2", "m3"],
		});
		// "ab" (2) + " (3)" (4) = 6 chars × 7 = 42
		expect(estimateLabelWidth(n)).toBe(42);
	});

	it("handles empty collapsedMembers array (still treated as super)", () => {
		const n = makeNode("a", { label: "ab", collapsedMembers: [] });
		// "ab" (2) + " (0)" (4) = 6 chars × 7 = 42
		expect(estimateLabelWidth(n)).toBe(42);
	});
});

describe("nodeRadius", () => {
	it("enforces minNodeRadius floor when nodeSize is below it", () => {
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("returns nodeSize when above the floor and degree=0", () => {
		expect(nodeRadius(30, 0, 18)).toBe(30);
	});

	it("falls back to minNodeRadius for non-finite or non-positive nodeSize", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
	});

	it("ignores degree scaling when sizeByDegree=false", () => {
		const r0 = nodeRadius(20, 0, 18, 10, false);
		const r10 = nodeRadius(20, 10, 18, 10, false);
		expect(r0).toBe(r10);
	});

	it("scales up with degree when sizeByDegree=true", () => {
		const r0 = nodeRadius(20, 0, 18, 10, true);
		const r5 = nodeRadius(20, 5, 18, 10, true);
		const r10 = nodeRadius(20, 10, 18, 10, true);
		// degree=0 short-circuits the scaling branch (degree > 0 guard) → returns baseR = 20.
		expect(r0).toBe(20);
		// degree=5 → t = sqrt(0.5); scaled value should sit between r0 and r10.
		expect(r5).toBeGreaterThan(r0);
		expect(r5).toBeLessThan(r10);
		// degree=10/10 → t=1 → baseR * (0.7 + 1.3) = 20 * 2 = 40
		expect(r10).toBe(40);
	});

	it("does not scale when maxDegree=0 even if sizeByDegree=true", () => {
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});
});

describe("effectiveRadius", () => {
	const plain = makeNode("p");

	it("returns nodeRadius result for a plain node within cap", () => {
		expect(effectiveRadius(plain, 30, 0, 60, 18)).toBe(30);
	});

	it("caps the radius at maxNodeRadius", () => {
		expect(effectiveRadius(plain, 100, 0, 60, 18)).toBe(60);
	});

	it("treats maxNodeRadius<=0 as Infinity (uncapped)", () => {
		expect(effectiveRadius(plain, 200, 0, 0, 18)).toBe(200);
	});

	it("enforces minNodeRadius floor", () => {
		// nodeSize 5 → nodeRadius floor = 18 → effective 18
		expect(effectiveRadius(plain, 5, 0, 60, 18)).toBe(18);
	});

	it("inflates radius for super nodes by sqrt(memberCount)*0.5", () => {
		const sn = makeNode("s", { collapsedMembers: ["a", "b", "c", "d"] });
		// baseR = max(20, 18) = 20; super multiplier = 1 + sqrt(4)*0.5 = 2 → 40 (under cap 60)
		expect(effectiveRadius(sn, 20, 0, 60, 18)).toBe(40);
	});

	it("clamps super-node radius to maxNodeRadius", () => {
		const sn = makeNode("s", { collapsedMembers: new Array(100).fill("m") });
		expect(effectiveRadius(sn, 30, 0, 60, 18)).toBe(60);
	});

	it("applies cardContentScale only when bodyLength and maxBodyLength positive", () => {
		const r0 = effectiveRadius(plain, 20, 0, 200, 18, 0, false, 0, 0, 0);
		const rNoScale = effectiveRadius(plain, 20, 0, 200, 18, 0, false, 100, 100, 0);
		const rScale = effectiveRadius(plain, 20, 0, 200, 18, 0, false, 100, 100, 1);
		expect(rNoScale).toBe(r0); // cardContentScale = 0 ⇒ no boost
		expect(rScale).toBeGreaterThan(r0); // > 0 boost when both lengths positive
	});

	it("does not divide by zero when maxBodyLength is 0", () => {
		const r = effectiveRadius(plain, 20, 0, 200, 18, 0, false, 100, 0, 1);
		expect(Number.isFinite(r)).toBe(true);
	});
});

describe("partitionNodes", () => {
	const degrees = new Map<string, number>();

	it("returns a single '__all__' bucket when groupBy='none'", () => {
		const a = makeNode("a");
		const b = makeNode("b");
		const groups = partitionNodes([a, b], "none", degrees);
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")).toEqual([a, b]);
	});

	it("buckets by backlink degree (uses backlinkBucket)", () => {
		const a = makeNode("a");
		const b = makeNode("b");
		const c = makeNode("c");
		const degs = new Map([
			["a", 0],
			["b", 4],
			["c", 12],
		]);
		const groups = partitionNodes([a, b, c], "backlinks", degs);
		expect(groups.get("0")).toEqual([a]);
		expect(groups.get("3-5")).toEqual([b]);
		expect(groups.get("11+")).toEqual([c]);
	});

	it("buckets by node_type using isTag/category fallback", () => {
		const file = makeNode("f", { category: "story" });
		const tag = makeNode("t", { isTag: true });
		const uncat = makeNode("u");
		const groups = partitionNodes([file, tag, uncat], "node_type", degrees);
		expect(groups.get("story")).toEqual([file]);
		expect(groups.get("tag")).toEqual([tag]);
		expect(groups.get("file")).toEqual([uncat]); // empty category → "file"
	});

	it("falls back to '__no_<field>__' when getNodeFieldValues returns empty", () => {
		const a = makeNode("a"); // no tags / category / etc.
		const groups = partitionNodes([a], "tag", degrees);
		expect(groups.get("__no_tag__")).toEqual([a]);
	});

	it("returns an empty map when given no nodes", () => {
		expect(partitionNodes([], "none", degrees).size).toBe(0);
	});

	it("strips trailing ':?' from groupBy field name", () => {
		const a = makeNode("a", { category: "x" });
		// "category:?" should behave like "category" via getNodeFieldValues
		const groups = partitionNodes([a], "category:?", degrees);
		expect(groups.get("x")).toEqual([a]);
	});
});
