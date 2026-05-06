import { describe, it, expect } from "vitest";
import {
	getSpacing,
	backlinkBucket,
	computeEffectiveColumnSpacing,
	estimateGroupRadius,
	computeGroupGap,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

function mkNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, ...overrides } as GraphNode;
}

// =========================================================================
// getSpacing — Map lookup with default fallback
// =========================================================================
describe("getSpacing", () => {
	it("returns 1.0 when map is undefined", () => {
		expect(getSpacing("a")).toBe(1.0);
	});

	it("returns 1.0 when id is missing from map", () => {
		const m = new Map<string, number>([["b", 2.5]]);
		expect(getSpacing("a", m)).toBe(1.0);
	});

	it("returns mapped value when id exists", () => {
		const m = new Map<string, number>([["a", 2.5]]);
		expect(getSpacing("a", m)).toBe(2.5);
	});

	it("returns explicit zero (does not treat 0 as missing)", () => {
		const m = new Map<string, number>([["a", 0]]);
		expect(getSpacing("a", m)).toBe(0);
	});

	it("returns negative value when explicitly set", () => {
		const m = new Map<string, number>([["a", -1.5]]);
		expect(getSpacing("a", m)).toBe(-1.5);
	});
});

// =========================================================================
// backlinkBucket — degree threshold buckets
// =========================================================================
describe("backlinkBucket", () => {
	it("returns '0' for zero", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' at lower boundary (1)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
	});

	it("returns '1-2' at upper boundary (2)", () => {
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' at lower boundary (3)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
	});

	it("returns '3-5' at upper boundary (5)", () => {
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' at lower boundary (6)", () => {
		expect(backlinkBucket(6)).toBe("6-10");
	});

	it("returns '6-10' at upper boundary (10)", () => {
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' at lower boundary (11)", () => {
		expect(backlinkBucket(11)).toBe("11+");
	});

	it("returns '11+' for large values", () => {
		expect(backlinkBucket(100)).toBe("11+");
		expect(backlinkBucket(10000)).toBe("11+");
	});

	it("buckets are deterministic across same degree", () => {
		expect(backlinkBucket(7)).toBe(backlinkBucket(7));
		expect(backlinkBucket(15)).toBe(backlinkBucket(15));
	});
});

// =========================================================================
// computeEffectiveColumnSpacing — column-extent / (nCols-1)
// =========================================================================
describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize*2 floor when offsets is empty", () => {
		const offsets = new Map<string, { dx: number; dy: number }>();
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(20);
	});

	it("returns nodeSize*2 floor when only one unique column", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 0, dy: 50 }],
			["c", { dx: 0, dy: 100 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(16);
	});

	it("computes spacing for two columns: (max-min)/(n-1)", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 30, dy: 0 }],
		]);
		// nCols=2, so (30-0)/(2-1) = 30
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(30);
	});

	it("computes spacing for three evenly-spaced columns", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 10, dy: 0 }],
			["c", { dx: 20, dy: 0 }],
		]);
		// nCols=3, (20-0)/2 = 10
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(10);
	});

	it("treats columns within rounding tolerance as same column", () => {
		// Math.round(dx*100) buckets: 0.001 → 0, 0.002 → 0 → same column
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0.001, dy: 0 }],
			["b", { dx: 0.002, dy: 0 }],
		]);
		// All in single bucket → falls back to nodeSize*2
		expect(computeEffectiveColumnSpacing(offsets, 7)).toBe(14);
	});

	it("handles negative dx values correctly", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: -10, dy: 0 }],
			["b", { dx: 10, dy: 0 }],
		]);
		// (10 - (-10)) / 1 = 20
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(20);
	});

	it("ignores dy for column detection", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 5, dy: 0 }],
			["b", { dx: 5, dy: 999 }],
			["c", { dx: 5, dy: -42 }],
		]);
		// Only 1 unique x bucket → fallback nodeSize*2
		expect(computeEffectiveColumnSpacing(offsets, 6)).toBe(12);
	});
});

// =========================================================================
// estimateGroupRadius — footprint estimate from member count
// =========================================================================
describe("estimateGroupRadius", () => {
	it("returns 0 for empty group (sqrt(0) = 0)", () => {
		expect(estimateGroupRadius(0, 10, 1, 1)).toBe(0);
	});

	it("scales with sqrt of member count", () => {
		// gap = computeGroupGap(10, 1, 1) = pairwiseGap(10, 10, 1) = 10*2*1 = 20
		// r(n=4) = 20 * 2 / 2 = 20
		// r(n=16) = 20 * 4 / 2 = 40
		expect(estimateGroupRadius(4, 10, 1, 1)).toBe(20);
		expect(estimateGroupRadius(16, 10, 1, 1)).toBe(40);
	});

	it("is monotonic non-decreasing in member count", () => {
		const r1 = estimateGroupRadius(5, 10, 1, 1);
		const r2 = estimateGroupRadius(10, 10, 1, 1);
		const r3 = estimateGroupRadius(50, 10, 1, 1);
		expect(r1).toBeLessThan(r2);
		expect(r2).toBeLessThan(r3);
	});

	it("uses larger of nodeSpacing and groupScale (computeGroupGap behavior)", () => {
		// computeGroupGap takes max(nodeSpacing, groupScale)
		const r1 = estimateGroupRadius(9, 10, 2, 1);
		const r2 = estimateGroupRadius(9, 10, 1, 2);
		expect(r1).toBe(r2);
	});

	it("matches direct gap × sqrt(n) / 2 formula without super bonus", () => {
		const gap = computeGroupGap(8, 1.5, 1);
		const expected = (gap * Math.sqrt(25)) / 2;
		expect(estimateGroupRadius(25, 8, 1.5, 1)).toBe(expected);
	});

	it("ignores undefined members (no super bonus)", () => {
		const without = estimateGroupRadius(5, 10, 1, 1);
		const withEmpty = estimateGroupRadius(5, 10, 1, 1, undefined, []);
		expect(without).toBe(withEmpty);
	});

	it("ignores members with no collapsedMembers (regular nodes)", () => {
		const members = [mkNode("a"), mkNode("b"), mkNode("c")];
		const baseline = estimateGroupRadius(3, 10, 1, 1);
		const withRegular = estimateGroupRadius(3, 10, 1, 1, undefined, members);
		expect(withRegular).toBe(baseline);
	});

	it("inflates result when a member is a super node", () => {
		// Super node carries collapsedMembers — effectiveRadius will be > nodeSize
		const superNode = mkNode("super", { collapsedMembers: ["x", "y", "z"] });
		const baseline = estimateGroupRadius(3, 10, 1, 1);
		const withSuper = estimateGroupRadius(3, 10, 1, 1, undefined, [superNode]);
		expect(withSuper).toBeGreaterThan(baseline);
	});

	it("uses largest super-node bonus when multiple supers exist", () => {
		const small = mkNode("s1", { collapsedMembers: ["a", "b"] });
		const large = mkNode("s2", { collapsedMembers: ["a", "b", "c", "d", "e", "f", "g", "h"] });
		const onlySmall = estimateGroupRadius(2, 10, 1, 1, undefined, [small]);
		const both = estimateGroupRadius(2, 10, 1, 1, undefined, [small, large]);
		// Both should >= onlySmall, and the larger super pushes bonus higher
		expect(both).toBeGreaterThanOrEqual(onlySmall);
	});

	it("respects custom max/min radius caps for super bonus", () => {
		const superNode = mkNode("super", { collapsedMembers: Array(20).fill("x") });
		const lowCap = estimateGroupRadius(1, 10, 1, 1, undefined, [superNode], 30, 12);
		const highCap = estimateGroupRadius(1, 10, 1, 1, undefined, [superNode], 200, 12);
		// Higher cap allows bigger effectiveRadius → bigger bonus
		expect(highCap).toBeGreaterThanOrEqual(lowCap);
	});
});
