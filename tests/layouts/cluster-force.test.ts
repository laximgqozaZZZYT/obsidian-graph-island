import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	computeGroupGap,
	effectiveRadius,
	estimateGroupRadius,
	estimateLabelExtent,
	getSpacing,
	computeEffectiveColumnSpacing,
	nodeRadius,
	pairwiseGap,
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
	it("uses the larger radius as the reference", () => {
		// max(10, 20) * 2 * 1 = 40 — small element next to a large one still gets a wide gap
		expect(pairwiseGap(10, 20, 1)).toBe(40);
		expect(pairwiseGap(20, 10, 1)).toBe(40);
	});

	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 5)).toBe(0);
	});

	it("scales linearly with spacing", () => {
		// max(10, 5) * 2 * 0.5 = 10
		expect(pairwiseGap(10, 5, 0.5)).toBe(10);
		// doubling spacing doubles the gap
		expect(pairwiseGap(10, 5, 1.0)).toBe(20);
	});

	it("treats spacing=0 as a zero gap (degenerate)", () => {
		expect(pairwiseGap(10, 10, 0)).toBe(0);
	});
});

describe("computeGroupGap", () => {
	it("uses the larger of nodeSpacing or groupScale", () => {
		// max(0.5, 1.0) = 1.0 → pairwiseGap(10, 10, 1.0) = 20
		expect(computeGroupGap(10, 0.5, 1.0)).toBe(20);
		// max(1.5, 1.0) = 1.5 → pairwiseGap(10, 10, 1.5) = 30
		expect(computeGroupGap(10, 1.5, 1.0)).toBe(30);
	});

	it("returns 0 when nodeSize is 0", () => {
		expect(computeGroupGap(0, 1, 1)).toBe(0);
	});

	it("is symmetric in nodeSpacing/groupScale (only the max matters)", () => {
		expect(computeGroupGap(10, 2, 0.5)).toBe(computeGroupGap(10, 0.5, 2));
	});
});

describe("nodeRadius", () => {
	it("returns max(nodeSize, minNodeRadius) when sizeByDegree is off", () => {
		// nodeSize > minNodeRadius → use nodeSize
		expect(nodeRadius(25, 0, 18)).toBe(25);
		// nodeSize < minNodeRadius → floor at minNodeRadius
		expect(nodeRadius(10, 0, 18)).toBe(18);
	});

	it("substitutes minNodeRadius when nodeSize is non-finite or non-positive", () => {
		// isFinite() returns false for NaN and ±Infinity, so all of these collapse to the floor.
		expect(nodeRadius(0, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
	});

	it("does NOT scale by degree when sizeByDegree=false", () => {
		// degree present but flag off → flat
		expect(nodeRadius(20, 100, 18, 100, false)).toBe(20);
	});

	it("does NOT scale when maxDegree is 0 (avoids div-by-zero)", () => {
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});

	it("does NOT scale when degree is 0 even with sizeByDegree on", () => {
		expect(nodeRadius(20, 0, 18, 100, true)).toBe(20);
	});

	it("scales by sqrt(degree/maxDegree) when sizeByDegree=true", () => {
		// At degree=maxDegree, t=1, factor = 0.7 + 1.3 = 2.0
		expect(nodeRadius(20, 100, 18, 100, true)).toBeCloseTo(40, 6);
		// At degree=maxDegree/4, t=0.5, factor = 0.7 + 0.65 = 1.35
		expect(nodeRadius(20, 25, 18, 100, true)).toBeCloseTo(27, 6);
	});
});

describe("effectiveRadius", () => {
	it("returns nodeRadius for a regular (non-collapsed) node within cap", () => {
		const n = makeNode("a");
		// baseR = nodeRadius(20, 0, 18) = 20; cap=60; floor=18 → 20
		expect(effectiveRadius(n, 20, 0)).toBe(20);
	});

	it("enforces the minNodeRadius floor below cap", () => {
		const n = makeNode("a");
		// nodeSize=5 → safeSize=5, baseR=max(5, 18)=18; floor again pins to 18
		expect(effectiveRadius(n, 5, 0)).toBe(18);
	});

	it("inflates radius for super nodes by sqrt(memberCount)", () => {
		const n = makeNode("a", { collapsedMembers: ["b", "c", "d", "e"] });
		// baseR = 20; super factor = 1 + sqrt(4)*0.5 = 2.0 → 40, cap=60 → 40
		expect(effectiveRadius(n, 20, 0)).toBe(40);
	});

	it("caps super-node inflation at maxNodeRadius", () => {
		const n = makeNode("a", { collapsedMembers: new Array(100).fill("x") });
		// baseR=20; factor = 1 + sqrt(100)*0.5 = 6 → 120; cap=60 → 60
		expect(effectiveRadius(n, 20, 0, 60)).toBe(60);
	});

	it("treats maxNodeRadius<=0 as no cap (Infinity)", () => {
		const n = makeNode("a", { collapsedMembers: new Array(100).fill("x") });
		// no cap → 120
		expect(effectiveRadius(n, 20, 0, 0)).toBe(120);
	});

	it("applies log-based content boost when cardContentScale>0", () => {
		const n = makeNode("a");
		// baseR=20; t = log(11)/log(101) ≈ 0.5202
		// boosted = 20 * (1 + 0.5 * 0.5202) ≈ 25.20
		const r = effectiveRadius(n, 20, 0, 60, 18, 0, false, 10, 100, 0.5);
		expect(r).toBeGreaterThan(20);
		expect(r).toBeLessThan(30);
	});

	it("does not apply content boost when bodyLength is 0 or maxBodyLength is 0", () => {
		const n = makeNode("a");
		// bodyLength=0 → no boost
		expect(effectiveRadius(n, 20, 0, 60, 18, 0, false, 0, 100, 0.5)).toBe(20);
		// maxBodyLength=0 → no boost
		expect(effectiveRadius(n, 20, 0, 60, 18, 0, false, 10, 0, 0.5)).toBe(20);
		// cardContentScale=0 → no boost
		expect(effectiveRadius(n, 20, 0, 60, 18, 0, false, 10, 100, 0)).toBe(20);
	});

	it("ignores collapsedMembers when array is empty", () => {
		const n = makeNode("a", { collapsedMembers: [] });
		// empty array → not a super node → falls into regular branch
		expect(effectiveRadius(n, 20, 0)).toBe(20);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor is 0 or negative", () => {
		const n = makeNode("a", { label: "hello" });
		expect(estimateLabelExtent(n, 20, 0, 10, 0)).toBe(0);
		expect(estimateLabelExtent(n, 20, 0, 10, -1)).toBe(0);
	});

	it("returns 0 when label is empty", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 20, 0, 10, 1.0)).toBe(0);
	});

	it("scales width with label length and labelSpacingFactor", () => {
		const a = makeNode("x", { label: "hi" }); // 2 chars
		const b = makeNode("x", { label: "hello" }); // 5 chars
		// At importance=0, fontSize=11, charW=6.6, padX=8 → A: 2*6.6+16=29.2; B: 5*6.6+16=49
		expect(estimateLabelExtent(a, 20, 0, 10, 1.0)).toBeCloseTo(29.2, 6);
		expect(estimateLabelExtent(b, 20, 0, 10, 1.0)).toBeCloseTo(49, 6);
		// Doubling factor doubles result
		expect(estimateLabelExtent(b, 20, 0, 10, 2.0)).toBeCloseTo(98, 6);
	});

	it("uses higher fontSize for high-importance (high-degree) nodes", () => {
		const n = makeNode("a", { label: "hi" });
		// degree=maxDeg → importance=1 → fontSize=14, charW=8.4, padX=8 → 2*8.4+16=32.8
		const high = estimateLabelExtent(n, 20, 10, 10, 1.0);
		// degree=0 → fontSize=11, → 29.2
		const low = estimateLabelExtent(n, 20, 0, 10, 1.0);
		expect(high).toBeGreaterThan(low);
		expect(high).toBeCloseTo(32.8, 6);
	});

	it("uses superFontSize and wider pad for super nodes", () => {
		const regular = makeNode("a", { label: "X" });
		const supernode = makeNode("a", { label: "X", collapsedMembers: ["b", "c"] });
		// regular at deg=0: fontSize=11, charW=6.6, padX=8 → 1*6.6+16 = 22.6
		expect(estimateLabelExtent(regular, 20, 0, 10, 1.0)).toBeCloseTo(22.6, 6);
		// super: fontSize=13, charW=7.8, padX=10 → 1*7.8+20 = 27.8
		expect(estimateLabelExtent(supernode, 20, 0, 10, 1.0)).toBeCloseTo(27.8, 6);
	});

	it("treats maxDeg=0 as zero importance (avoids div-by-zero)", () => {
		const n = makeNode("a", { label: "hi" });
		// degree=5 but maxDeg=0 → importance=0 → fontSize=11
		expect(estimateLabelExtent(n, 20, 5, 0, 1.0)).toBeCloseTo(29.2, 6);
	});

	it("clamps importance at 1 when degree exceeds maxDeg", () => {
		const n = makeNode("a", { label: "hi" });
		// degree=999, maxDeg=10 → clamped to 1 → fontSize=14
		const clamped = estimateLabelExtent(n, 20, 999, 10, 1.0);
		// equal to degree=maxDeg case
		expect(clamped).toBe(estimateLabelExtent(n, 20, 10, 10, 1.0));
	});
});
