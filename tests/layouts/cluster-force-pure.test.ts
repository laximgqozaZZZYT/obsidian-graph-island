import { describe, it, expect } from "vitest";
import {
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

describe("pairwiseGap", () => {
	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 1)).toBe(0);
	});

	it("uses the larger of the two radii as reference", () => {
		// max(5, 10) * 2 * 1 = 20
		expect(pairwiseGap(5, 10, 1)).toBe(20);
		expect(pairwiseGap(10, 5, 1)).toBe(20);
	});

	it("scales linearly with spacing", () => {
		expect(pairwiseGap(10, 10, 0.5)).toBe(10);
		expect(pairwiseGap(10, 10, 1)).toBe(20);
		expect(pairwiseGap(10, 10, 2)).toBe(40);
	});

	it("returns 0 when spacing is 0", () => {
		expect(pairwiseGap(10, 10, 0)).toBe(0);
	});

	it("is symmetric in r1 and r2 arguments", () => {
		expect(pairwiseGap(7, 13, 1.5)).toBe(pairwiseGap(13, 7, 1.5));
	});
});

describe("computeGroupGap", () => {
	it("uses pairwiseGap with uniform nodeSize and max(nodeSpacing, groupScale)", () => {
		// nodeSize=10, max(2, 3)=3 → 10*2*3 = 60
		expect(computeGroupGap(10, 2, 3)).toBe(60);
	});

	it("picks groupScale when it exceeds nodeSpacing", () => {
		expect(computeGroupGap(10, 1, 5)).toBe(100);
	});

	it("picks nodeSpacing when it exceeds groupScale", () => {
		expect(computeGroupGap(10, 4, 1)).toBe(80);
	});

	it("returns 0 when nodeSize is 0", () => {
		expect(computeGroupGap(0, 1, 1)).toBe(0);
	});
});

describe("nodeRadius", () => {
	it("returns nodeSize when above the minNodeRadius floor", () => {
		// nodeSize=30, floor=18 → max(30, 18) = 30
		expect(nodeRadius(30, 0, 18)).toBe(30);
	});

	it("clamps to minNodeRadius floor when nodeSize is below", () => {
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("falls back to minNodeRadius when nodeSize is non-finite or non-positive", () => {
		// `isFinite(NaN)` → false; `isFinite(Infinity)` → false. Both fall back.
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
	});

	it("does not apply degree scaling when sizeByDegree=false", () => {
		// degree=10 ignored when sizeByDegree=false
		expect(nodeRadius(20, 10, 18, 10, false)).toBe(20);
	});

	it("applies sqrt-scaled boost at full degree when sizeByDegree=true", () => {
		// degree=max, t=1 → baseR * (0.7 + 1.3) = baseR * 2.0
		expect(nodeRadius(20, 10, 18, 10, true)).toBeCloseTo(40, 5);
	});

	it("scales by 0.7+sqrt(0.25)*1.3 = 1.35 at quarter degree", () => {
		// degree=2.5, max=10 → t=sqrt(0.25)=0.5 → 0.7 + 0.5*1.3 = 1.35
		expect(nodeRadius(20, 2.5, 18, 10, true)).toBeCloseTo(27, 5);
	});

	it("ignores degree scaling when degree is 0 even if sizeByDegree=true", () => {
		expect(nodeRadius(20, 0, 18, 10, true)).toBe(20);
	});

	it("ignores degree scaling when maxDegree is 0", () => {
		expect(nodeRadius(20, 10, 18, 0, true)).toBe(20);
	});
});

describe("effectiveRadius", () => {
	it("returns plain nodeRadius for non-super nodes with no body", () => {
		const n = makeNode("a");
		expect(effectiveRadius(n, 30, 0, 60, 18)).toBe(30);
	});

	it("inflates radius for super nodes proportional to sqrt(memberCount)", () => {
		const superN = makeNode("g", { collapsedMembers: ["x", "y", "z", "w"] });
		// baseR=30, factor = 1 + sqrt(4)*0.5 = 2.0 → 60
		expect(effectiveRadius(superN, 30, 0, 100, 18)).toBe(60);
	});

	it("caps at maxNodeRadius for very large super groups", () => {
		const superN = makeNode("g", { collapsedMembers: new Array(100).fill("x") });
		// Without cap baseR*(1+sqrt(100)*0.5) = 30*6 = 180; cap at 60
		expect(effectiveRadius(superN, 30, 0, 60, 18)).toBe(60);
	});

	it("treats maxNodeRadius=0 as no cap (Infinity)", () => {
		const superN = makeNode("g", { collapsedMembers: new Array(4).fill("x") });
		// 30 * (1 + 2*0.5) = 60, no cap
		expect(effectiveRadius(superN, 30, 0, 0, 18)).toBe(60);
	});

	it("enforces minNodeRadius floor even after cap", () => {
		const n = makeNode("a");
		// nodeSize=5 → baseR=18 (floor) → cap=10 → max(10, 18) = 18
		expect(effectiveRadius(n, 5, 0, 10, 18)).toBe(18);
	});

	it("applies content-proportional log scaling when cardContentScale > 0", () => {
		const n = makeNode("a");
		// bodyLength=maxBodyLength → t = log(N+1)/log(N+1) = 1
		// baseR=30, scale=0.5 → 30 * (1 + 0.5*1) = 45
		const r = effectiveRadius(n, 30, 0, 100, 18, 0, false, 100, 100, 0.5);
		expect(r).toBe(45);
	});

	it("ignores content scale when bodyLength is 0", () => {
		const n = makeNode("a");
		expect(effectiveRadius(n, 30, 0, 100, 18, 0, false, 0, 100, 0.5)).toBe(30);
	});

	it("ignores content scale when cardContentScale is 0", () => {
		const n = makeNode("a");
		expect(effectiveRadius(n, 30, 0, 100, 18, 0, false, 50, 100, 0)).toBe(30);
	});

	it("returns empty-collapsedMembers as plain (length 0)", () => {
		const n = makeNode("a", { collapsedMembers: [] });
		// Empty array → length 0 → falls through to non-super branch
		expect(effectiveRadius(n, 30, 0, 100, 18)).toBe(30);
	});
});

describe("estimateLabelWidth", () => {
	it("uses label when provided, with charWidth=7", () => {
		const n = makeNode("a", { label: "hello" });
		expect(estimateLabelWidth(n)).toBe(5 * 7); // "hello".length * 7
	});

	it("falls back to id when label is empty string", () => {
		const n = makeNode("nodeXYZ", { label: "" });
		expect(estimateLabelWidth(n)).toBe(7 * 7); // "nodeXYZ".length * 7
	});

	it("appends super-node suffix '(N)' to character count", () => {
		const n = makeNode("a", { label: "G", collapsedMembers: ["x", "y", "z"] });
		// "G".length=1 + " (3)".length=4 → 5*7 = 35
		expect(estimateLabelWidth(n)).toBe(5 * 7);
	});

	it("returns 0 when label, id, and suffix are all empty", () => {
		// Edge case: label and id both empty → 0 chars
		const n = makeNode("", { label: "" });
		expect(estimateLabelWidth(n)).toBe(0);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor is 0 (feature disabled)", () => {
		const n = makeNode("a", { label: "hello" });
		expect(estimateLabelExtent(n, 30, 1, 10, 0)).toBe(0);
	});

	it("returns 0 when label is empty", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 30, 1, 10, 1)).toBe(0);
	});

	it("scales linearly with label length and labelSpacingFactor", () => {
		const short = makeNode("s", { label: "ab" });
		const long = makeNode("l", { label: "abcdefgh" });
		const wShort = estimateLabelExtent(short, 30, 0, 10, 1);
		const wLong = estimateLabelExtent(long, 30, 0, 10, 1);
		// long.length=8, short.length=2 → wLong > wShort
		expect(wLong).toBeGreaterThan(wShort);
		// labelSpacingFactor=2 should double the extent
		const wDouble = estimateLabelExtent(short, 30, 0, 10, 2);
		expect(wDouble).toBeCloseTo(wShort * 2, 5);
	});

	it("uses larger super-node padding (10 vs 8) when collapsedMembers present", () => {
		const plain = makeNode("a", { label: "x" });
		const superN = makeNode("b", { label: "x", collapsedMembers: ["y", "z"] });
		const wPlain = estimateLabelExtent(plain, 30, 0, 10, 1);
		const wSuper = estimateLabelExtent(superN, 30, 0, 10, 1);
		// Same label "x", but super-node uses superFontSize=13 (vs fontMin=11) and padX=10 (vs 8)
		expect(wSuper).toBeGreaterThan(wPlain);
	});

	it("uses fontMin when degree is 0 (importance=0)", () => {
		const n = makeNode("a", { label: "ab" });
		// importance=0, fontSize=fontMin=11, charW=11*0.6=6.6, padX=8
		// rawWidth = 2*6.6 + 16 = 29.2, factor=1 → 29.2
		expect(estimateLabelExtent(n, 30, 0, 10, 1, 11, 14)).toBeCloseTo(29.2, 5);
	});

	it("uses fontMax when degree equals maxDeg (importance=1)", () => {
		const n = makeNode("a", { label: "ab" });
		// importance=1, fontSize=fontMax=14, charW=14*0.6=8.4, padX=8
		// rawWidth = 2*8.4 + 16 = 32.8
		expect(estimateLabelExtent(n, 30, 10, 10, 1, 11, 14)).toBeCloseTo(32.8, 5);
	});

	it("treats maxDeg=0 as importance=0 (no degree scaling)", () => {
		const n = makeNode("a", { label: "ab" });
		// maxDeg=0 branch → importance=0 → fontSize=fontMin=11
		expect(estimateLabelExtent(n, 30, 5, 0, 1, 11, 14)).toBeCloseTo(29.2, 5);
	});
});
