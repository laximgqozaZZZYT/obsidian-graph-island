import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	computeEffectiveColumnSpacing,
	estimateGroupRadius,
	computeGroupGap,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

function mkNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
	return {
		id,
		label: id,
		filePath: `${id}.md`,
		x: 0,
		y: 0,
		...overrides,
	} as GraphNode;
}

// ===========================================================================
// backlinkBucket — degree → categorical bucket
// ===========================================================================
describe("backlinkBucket", () => {
	it('returns "0" for zero degree', () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it('returns "1-2" for low degree boundary values', () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it('returns "3-5" for the 3-5 band boundaries', () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(4)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it('returns "6-10" for the 6-10 band boundaries', () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it('returns "11+" for any degree above 10', () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(100)).toBe("11+");
		expect(backlinkBucket(1_000_000)).toBe("11+");
	});

	it("partitions all small non-negative integers into exactly 5 distinct buckets", () => {
		const buckets = new Set<string>();
		for (let d = 0; d <= 50; d++) buckets.add(backlinkBucket(d));
		expect(buckets.size).toBe(5);
		expect(buckets).toEqual(new Set(["0", "1-2", "3-5", "6-10", "11+"]));
	});
});

// ===========================================================================
// computeEffectiveColumnSpacing — unified-timeline column step
// ===========================================================================
describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize * 2 when there are no offsets (single virtual column)", () => {
		const result = computeEffectiveColumnSpacing(new Map(), 30);
		expect(result).toBe(60);
	});

	it("returns nodeSize * 2 when all nodes share the same dx (single column)", () => {
		const offsets = new Map([
			["a", { dx: 5, dy: 0 }],
			["b", { dx: 5, dy: 10 }],
			["c", { dx: 5, dy: 20 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 25)).toBe(50);
	});

	it("computes (max-min)/(nCols-1) for evenly spaced columns", () => {
		// dx = 0, 100, 200 → 3 cols, range 200, step = 100
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 100, dy: 0 }],
			["c", { dx: 200, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 30)).toBe(100);
	});

	it("uses the dx range / (nCols-1) for two columns", () => {
		const offsets = new Map([
			["a", { dx: -50, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
		]);
		// 2 cols, (50 - -50) / (2-1) = 100
		expect(computeEffectiveColumnSpacing(offsets, 30)).toBe(100);
	});

	it("treats dx values within 0.01 of each other as the same column (rounded * 100)", () => {
		// 0.001 and 0.0049 both round to 0 — count as 1 unique column
		const offsets = new Map([
			["a", { dx: 0.001, dy: 0 }],
			["b", { dx: 0.0049, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 20)).toBe(40); // single-column fallback
	});

	it("counts distinct rounded dx values as separate columns", () => {
		// 0.01 → 1, 0.02 → 2 (distinct after Math.round(dx*100))
		const offsets = new Map([
			["a", { dx: 0.01, dy: 0 }],
			["b", { dx: 0.02, dy: 0 }],
		]);
		// 2 cols, range = 0.01, step = 0.01
		expect(computeEffectiveColumnSpacing(offsets, 30)).toBeCloseTo(0.01, 6);
	});

	it("handles negative dx offsets", () => {
		const offsets = new Map([
			["a", { dx: -200, dy: 0 }],
			["b", { dx: -100, dy: 0 }],
			["c", { dx: 0, dy: 0 }],
		]);
		// 3 cols, range = 200, step = 100
		expect(computeEffectiveColumnSpacing(offsets, 30)).toBe(100);
	});
});

// ===========================================================================
// estimateGroupRadius — visual radius approximation
// ===========================================================================
describe("estimateGroupRadius", () => {
	it("returns 0 for empty group (memberCount=0)", () => {
		// gap * sqrt(0) / 2 = 0
		expect(estimateGroupRadius(0, 30, 1, 1)).toBe(0);
	});

	it("scales as sqrt(memberCount) for a fixed gap", () => {
		// gap = computeGroupGap(20, 1, 1) = pairwiseGap(20, 20, 1) = 40
		const gap = computeGroupGap(20, 1, 1);
		const r1 = estimateGroupRadius(1, 20, 1, 1);
		const r4 = estimateGroupRadius(4, 20, 1, 1);
		const r9 = estimateGroupRadius(9, 20, 1, 1);
		expect(r1).toBeCloseTo((gap * 1) / 2, 6);
		expect(r4).toBeCloseTo((gap * 2) / 2, 6);
		expect(r9).toBeCloseTo((gap * 3) / 2, 6);
	});

	it("scales linearly with nodeSize through computeGroupGap", () => {
		// gap = nodeSize * 2 * spacing, so doubling nodeSize doubles result
		const r1 = estimateGroupRadius(16, 20, 1, 1);
		const r2 = estimateGroupRadius(16, 40, 1, 1);
		expect(r2).toBeCloseTo(r1 * 2, 6);
	});

	it("uses max(nodeSpacing, groupScale) for the gap calculation", () => {
		// pairwiseGap uses max(nodeSpacing, groupScale)
		const a = estimateGroupRadius(4, 20, 2, 0.5); // max=2
		const b = estimateGroupRadius(4, 20, 0.5, 2); // max=2
		expect(a).toBeCloseTo(b, 6);
	});

	it("ignores members array when no member is a super node", () => {
		const baseline = estimateGroupRadius(3, 20, 1, 1);
		const members = [mkNode("a"), mkNode("b"), mkNode("c")];
		const withMembers = estimateGroupRadius(3, 20, 1, 1, undefined, members);
		expect(withMembers).toBeCloseTo(baseline, 6);
	});

	it("inflates the estimate when a member is a super node (collapsedMembers)", () => {
		const baseline = estimateGroupRadius(2, 20, 1, 1);
		const members = [
			mkNode("a"),
			mkNode("super", { collapsedMembers: [mkNode("c1"), mkNode("c2"), mkNode("c3"), mkNode("c4")] }),
		];
		const withSuper = estimateGroupRadius(2, 20, 1, 1, undefined, members);
		expect(withSuper).toBeGreaterThan(baseline);
	});

	it("uses the largest super-node bonus across multiple super members", () => {
		const small = [mkNode("s", { collapsedMembers: [mkNode("c1"), mkNode("c2")] })];
		const big = [
			mkNode("s", { collapsedMembers: [mkNode("c1"), mkNode("c2")] }),
			mkNode("L", { collapsedMembers: Array.from({ length: 25 }, (_, i) => mkNode(`c${i}`)) }),
		];
		const withSmall = estimateGroupRadius(2, 20, 1, 1, undefined, small);
		const withBig = estimateGroupRadius(2, 20, 1, 1, undefined, big);
		expect(withBig).toBeGreaterThan(withSmall);
	});

	it("respects custom maxNodeRadius (cap on super-node bonus)", () => {
		const huge = [mkNode("L", { collapsedMembers: Array.from({ length: 100 }, (_, i) => mkNode(`c${i}`)) })];
		const cappedLow = estimateGroupRadius(1, 20, 1, 1, undefined, huge, 30, 12);
		const cappedHigh = estimateGroupRadius(1, 20, 1, 1, undefined, huge, 200, 12);
		// Lower cap → smaller super bonus → smaller total
		expect(cappedLow).toBeLessThan(cappedHigh);
	});

	it("does not apply a super bonus for members with empty collapsedMembers", () => {
		const baseline = estimateGroupRadius(2, 20, 1, 1);
		const members = [mkNode("a"), mkNode("b", { collapsedMembers: [] })];
		const result = estimateGroupRadius(2, 20, 1, 1, undefined, members);
		expect(result).toBeCloseTo(baseline, 6);
	});
});
