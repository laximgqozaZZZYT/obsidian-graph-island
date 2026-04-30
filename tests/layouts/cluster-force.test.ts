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
	it("returns 2 × spacing × max(r1, r2) when sizes equal", () => {
		// max(10,10) * 2 * 1.5 = 30
		expect(pairwiseGap(10, 10, 1.5)).toBe(30);
	});

	it("uses the larger of the two radii (r1 > r2)", () => {
		// max(20, 5) * 2 * 1 = 40
		expect(pairwiseGap(20, 5, 1)).toBe(40);
	});

	it("uses the larger of the two radii (r2 > r1)", () => {
		// max(3, 17) * 2 * 1 = 34
		expect(pairwiseGap(3, 17, 1)).toBe(34);
	});

	it("returns 0 when spacing is 0 (degenerate boundary)", () => {
		expect(pairwiseGap(10, 20, 0)).toBe(0);
	});

	it("scales linearly with spacing factor", () => {
		const base = pairwiseGap(8, 8, 1);
		expect(pairwiseGap(8, 8, 2)).toBe(base * 2);
		expect(pairwiseGap(8, 8, 3.5)).toBe(base * 3.5);
	});
});

describe("computeGroupGap", () => {
	it("uses the larger of nodeSpacing and groupScale", () => {
		// pairwiseGap(8, 8, max(2, 4)) = 8*2*4 = 64
		expect(computeGroupGap(8, 2, 4)).toBe(64);
		// pairwiseGap(8, 8, max(5, 4)) = 8*2*5 = 80
		expect(computeGroupGap(8, 5, 4)).toBe(80);
	});

	it("returns identical result when nodeSpacing == groupScale", () => {
		expect(computeGroupGap(10, 3, 3)).toBe(60);
	});

	it("returns 0 when both spacing inputs are 0", () => {
		expect(computeGroupGap(10, 0, 0)).toBe(0);
	});

	it("matches pairwiseGap with uniform nodeSize", () => {
		// Documents the alias relationship in the source comment.
		const ns = 12;
		const a = computeGroupGap(ns, 1.5, 0.5);
		const b = pairwiseGap(ns, ns, Math.max(1.5, 0.5));
		expect(a).toBe(b);
	});
});

describe("nodeRadius", () => {
	it("floors at minNodeRadius when nodeSize is below the floor", () => {
		// nodeSize=5 < min=18 → returns 18
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("returns nodeSize when above minNodeRadius and sizeByDegree disabled", () => {
		expect(nodeRadius(30, 100, 18, 100, false)).toBe(30);
	});

	it("falls back to minNodeRadius for non-finite or non-positive nodeSize", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
		expect(nodeRadius(-10, 0, 18)).toBe(18);
	});

	it("ignores sizeByDegree when maxDegree is 0", () => {
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});

	it("ignores sizeByDegree when degree is 0", () => {
		expect(nodeRadius(20, 0, 18, 100, true)).toBe(20);
	});

	it("scales by 0.7 + sqrt(deg/max) * 1.3 when sizeByDegree enabled", () => {
		// degree=max → t=1 → factor=2.0 → baseR(20) * 2 = 40
		expect(nodeRadius(20, 100, 18, 100, true)).toBeCloseTo(40, 6);
		// degree=25, max=100 → t=0.5 → factor=0.7 + 0.65 = 1.35 → 20 * 1.35 = 27
		expect(nodeRadius(20, 25, 18, 100, true)).toBeCloseTo(27, 6);
	});

	it("is monotonically non-decreasing in degree when sizeByDegree enabled", () => {
		const r1 = nodeRadius(20, 1, 18, 100, true);
		const r10 = nodeRadius(20, 10, 18, 100, true);
		const r100 = nodeRadius(20, 100, 18, 100, true);
		expect(r10).toBeGreaterThanOrEqual(r1);
		expect(r100).toBeGreaterThanOrEqual(r10);
	});
});

describe("effectiveRadius", () => {
	const plain = makeNode("p");
	const collapsed = makeNode("g", { collapsedMembers: ["a", "b", "c", "d"] });

	it("matches nodeRadius for a regular node within cap", () => {
		// nodeSize=20 above min=18, cap=60 not hit → 20
		expect(effectiveRadius(plain, 20, 0, 60, 18)).toBe(20);
	});

	it("respects maxNodeRadius cap for regular nodes", () => {
		// nodeSize=200 capped to 50
		expect(effectiveRadius(plain, 200, 0, 50, 18)).toBe(50);
	});

	it("respects minNodeRadius floor even after cap", () => {
		// cap=10 < min=18 → final result must be at least 18
		expect(effectiveRadius(plain, 5, 0, 10, 18)).toBe(18);
	});

	it("treats maxNodeRadius=0 as uncapped (Infinity)", () => {
		// nodeSize=500 should not be capped when max=0
		expect(effectiveRadius(plain, 500, 0, 0, 18)).toBe(500);
	});

	it("inflates radius for super nodes by sqrt(memberCount) * 0.5", () => {
		// baseR=20, members=4 → 20 * (1 + sqrt(4)*0.5) = 20 * 2 = 40
		// cap=60 → not hit
		expect(effectiveRadius(collapsed, 20, 0, 60, 18)).toBeCloseTo(40, 6);
	});

	it("super-node inflation respects maxNodeRadius cap", () => {
		// 4 members, baseR=20 → would give 40, but cap at 30
		expect(effectiveRadius(collapsed, 20, 0, 30, 18)).toBe(30);
	});

	it("does not apply log boost when cardContentScale is 0", () => {
		// bodyLength/maxBodyLength provided but scale=0 → unchanged
		expect(effectiveRadius(plain, 20, 0, 60, 18, 0, false, 100, 1000, 0)).toBe(20);
	});

	it("does not apply log boost when bodyLength or maxBodyLength is 0", () => {
		expect(effectiveRadius(plain, 20, 0, 60, 18, 0, false, 0, 1000, 1)).toBe(20);
		expect(effectiveRadius(plain, 20, 0, 60, 18, 0, false, 100, 0, 1)).toBe(20);
	});

	it("applies log-based boost when cardContentScale > 0 with valid body lengths", () => {
		// t = log(101) / log(1001) ≈ 0.6685 → factor = 1 + 1*0.6685 = 1.6685
		// baseR=20 → ≈ 33.37, capped/floored within 18..60 → ≈ 33.37
		const r = effectiveRadius(plain, 20, 0, 60, 18, 0, false, 100, 1000, 1);
		const expected = 20 * (1 + Math.log(101) / Math.log(1001));
		expect(r).toBeCloseTo(expected, 6);
	});
});

describe("estimateLabelWidth", () => {
	it("returns 7 px per character of the label", () => {
		// label="abc" length=3, no suffix → 3 * 7 = 21
		expect(estimateLabelWidth(makeNode("xx", { label: "abc" }))).toBe(21);
	});

	it("falls back to id when label is empty", () => {
		// label="" is falsy → uses id="some-id" length=7 → 7*7 = 49
		expect(estimateLabelWidth(makeNode("some-id", { label: "" }))).toBe(49);
	});

	it("appends ' (N)' suffix for super nodes", () => {
		// label="grp" (3) + suffix=" (12)" (5) = 8 → 8*7 = 56
		const n = makeNode("grp", { label: "grp", collapsedMembers: new Array(12).fill("x") });
		expect(estimateLabelWidth(n)).toBe(56);
	});

	it("counts suffix even when collapsedMembers is empty array", () => {
		// suffix=" (0)" length=4 → (3+4)*7 = 49
		const n = makeNode("grp", { label: "grp", collapsedMembers: [] });
		expect(estimateLabelWidth(n)).toBe(49);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor is 0 (early exit)", () => {
		const n = makeNode("a", { label: "hello" });
		expect(estimateLabelExtent(n, 20, 5, 10, 0)).toBe(0);
	});

	it("returns 0 for an empty label", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 20, 5, 10, 1)).toBe(0);
	});

	it("uses fontMin when degree is 0 (importance=0)", () => {
		// fontMin=11 → charW = 11*0.6 = 6.6, padX=8 → "abc" (3) → 3*6.6 + 16 = 35.8
		const n = makeNode("a", { label: "abc" });
		expect(estimateLabelExtent(n, 20, 0, 10, 1, 11, 14)).toBeCloseTo(35.8, 6);
	});

	it("uses fontMax-bracket size when degree == maxDeg (importance=1)", () => {
		// fontSize = round(11 + 1*(14-11)) = 14, charW=8.4, padX=8 → 3*8.4 + 16 = 41.2
		const n = makeNode("a", { label: "abc" });
		expect(estimateLabelExtent(n, 20, 10, 10, 1, 11, 14)).toBeCloseTo(41.2, 6);
	});

	it("treats maxDeg=0 as importance=0 (avoids divide-by-zero)", () => {
		// Same as fontMin case
		const n = makeNode("a", { label: "abc" });
		expect(estimateLabelExtent(n, 20, 5, 0, 1, 11, 14)).toBeCloseTo(35.8, 6);
	});

	it("uses superFontSize and wider padding for super nodes", () => {
		// superFontSize=13 → charW=7.8, padX=10 → "abc" (3) → 3*7.8 + 20 = 43.4
		const n = makeNode("g", { label: "abc", collapsedMembers: ["x"] });
		expect(estimateLabelExtent(n, 20, 0, 10, 1, 11, 14, 13)).toBeCloseTo(43.4, 6);
	});

	it("scales output linearly with labelSpacingFactor", () => {
		const n = makeNode("a", { label: "abc" });
		const base = estimateLabelExtent(n, 20, 0, 10, 1);
		expect(estimateLabelExtent(n, 20, 0, 10, 2)).toBeCloseTo(base * 2, 6);
		expect(estimateLabelExtent(n, 20, 0, 10, 0.5)).toBeCloseTo(base * 0.5, 6);
	});
});
