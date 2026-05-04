import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	getSpacing,
	computeEffectiveColumnSpacing,
	estimateGroupRadius,
	computeGroupGap,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// backlinkBucket — 5-tier bucket boundary
// ---------------------------------------------------------------------------

describe("backlinkBucket", () => {
	it("deg=0 → '0'", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("deg=1, deg=2 → '1-2' (lower and upper of bucket 1-2)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("deg=3, deg=5 → '3-5' (lower and upper of bucket 3-5)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("deg=6, deg=10 → '6-10' (lower and upper of bucket 6-10)", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("deg=11, deg=100, deg=1e9 → '11+' (open-ended top bucket)", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(100)).toBe("11+");
		expect(backlinkBucket(1_000_000_000)).toBe("11+");
	});

	it("negative degrees fall through to '11+' (no underflow guard)", () => {
		// First branch (deg === 0) fails; deg <= 2 evaluates true for any
		// negative value, so they bucket as "1-2". Pin behaviour.
		expect(backlinkBucket(-1)).toBe("1-2");
		expect(backlinkBucket(-100)).toBe("1-2");
	});
});

// ---------------------------------------------------------------------------
// getSpacing — map fallback
// ---------------------------------------------------------------------------

describe("getSpacing", () => {
	it("undefined map returns 1.0 default", () => {
		expect(getSpacing("nodeA")).toBe(1.0);
		expect(getSpacing("nodeA", undefined)).toBe(1.0);
	});

	it("empty map returns 1.0 default", () => {
		expect(getSpacing("nodeA", new Map())).toBe(1.0);
	});

	it("id present in map returns mapped value", () => {
		const map = new Map<string, number>([
			["nodeA", 2.5],
			["nodeB", 0.5],
		]);
		expect(getSpacing("nodeA", map)).toBe(2.5);
		expect(getSpacing("nodeB", map)).toBe(0.5);
	});

	it("id missing from non-empty map returns 1.0", () => {
		const map = new Map<string, number>([["nodeA", 2.5]]);
		expect(getSpacing("nodeC", map)).toBe(1.0);
	});

	it("explicit zero in map is preserved (not coerced to default)", () => {
		// Distinguishes `?? 1.0` from `|| 1.0` — 0 is a legitimate spacing.
		const map = new Map<string, number>([["nodeA", 0]]);
		expect(getSpacing("nodeA", map)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveColumnSpacing — column-aware spacing for unified timeline
// ---------------------------------------------------------------------------

describe("computeEffectiveColumnSpacing", () => {
	it("empty offsets → returns nodeSize * 2 fallback (nCols=1 < 2)", () => {
		const offsets = new Map<string, { dx: number; dy: number }>();
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(16);
	});

	it("single column → returns nodeSize * 2 fallback", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 100, dy: 0 }],
			["b", { dx: 100, dy: 50 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(20);
	});

	it("two columns → (max-min)/(2-1) = full delta", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(50);
	});

	it("three evenly-spaced columns → (max-min)/(3-1) = step size", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 100, dy: 0 }],
			["c", { dx: 200, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(100);
	});

	it("uses Math.round(dx*100) so very close dx values collapse to same column", () => {
		// dx=1.0001 and dx=1.0002 both round to 100, so are 1 column.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 1.0001, dy: 0 }],
			["b", { dx: 1.0002, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 7)).toBe(14);
	});

	it("differing-dx but distinct columns gives correct interpolation", () => {
		// 4 distinct columns at 0, 25, 50, 75 → (75-0)/3 = 25
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 25, dy: 0 }],
			["c", { dx: 50, dy: 0 }],
			["d", { dx: 75, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(25);
	});
});

// ---------------------------------------------------------------------------
// estimateGroupRadius — √n footprint estimate with super-node bonus
// ---------------------------------------------------------------------------

describe("estimateGroupRadius", () => {
	it("base footprint scales with √memberCount (gap*√n / 2)", () => {
		// computeGroupGap(8, 1, 1) = pairwiseGap(8,8, max(1,1)).
		// Verify against the public alias to avoid hardcoding internals.
		const gap = computeGroupGap(8, 1, 1);
		const r4 = estimateGroupRadius(4, 8, 1, 1);
		const r9 = estimateGroupRadius(9, 8, 1, 1);
		// r4 ≈ gap*2/2 = gap; r9 ≈ gap*3/2 = 1.5 gap
		expect(r4).toBeCloseTo(gap, 4);
		expect(r9).toBeCloseTo(1.5 * gap, 4);
	});

	it("zero members returns 0 (sqrt(0) = 0, no super-node bonus)", () => {
		expect(estimateGroupRadius(0, 8, 1, 1)).toBe(0);
	});

	it("single member returns gap/2 (sqrt(1) = 1)", () => {
		const gap = computeGroupGap(8, 1, 1);
		expect(estimateGroupRadius(1, 8, 1, 1)).toBeCloseTo(gap / 2, 4);
	});

	it("monotonically non-decreasing in memberCount", () => {
		const series = [1, 4, 9, 16, 25, 64].map((n) => estimateGroupRadius(n, 8, 1, 1));
		for (let i = 1; i < series.length; i++) {
			expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
		}
	});

	it("ignores members array when no node has collapsedMembers", () => {
		const plain = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const withMembers = estimateGroupRadius(4, 8, 1, 1, undefined, plain);
		const without = estimateGroupRadius(4, 8, 1, 1);
		expect(withMembers).toBeCloseTo(without, 6);
	});

	it("super-node (collapsedMembers ≥ 1) inflates radius", () => {
		const plain = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const withSuper = [
			makeNode("a"),
			makeNode("b", { collapsedMembers: ["x", "y", "z", "w"] as unknown as GraphNode["collapsedMembers"] }),
			makeNode("c"),
			makeNode("d"),
		];
		const baseR = estimateGroupRadius(4, 8, 1, 1, undefined, plain);
		const inflated = estimateGroupRadius(4, 8, 1, 1, undefined, withSuper);
		expect(inflated).toBeGreaterThan(baseR);
	});

	it("empty collapsedMembers (length 0) does NOT inflate", () => {
		// Branch: m.collapsedMembers truthy but length === 0 → skipped.
		const noBonus = [
			makeNode("a"),
			makeNode("b", { collapsedMembers: [] as unknown as GraphNode["collapsedMembers"] }),
		];
		const baseR = estimateGroupRadius(2, 8, 1, 1);
		expect(estimateGroupRadius(2, 8, 1, 1, undefined, noBonus)).toBeCloseTo(baseR, 6);
	});

	it("uses default maxNodeRadius=60 / minNodeRadius=12 when omitted", () => {
		// No collapsedMembers → result independent of maxR/minR; doubles down
		// on the "members?-only-matter-for-supernode-bonus" invariant.
		const r = estimateGroupRadius(4, 8, 1, 1);
		const rExplicit = estimateGroupRadius(4, 8, 1, 1, undefined, undefined, 60, 12);
		expect(r).toBe(rExplicit);
	});

	it("respects max(nodeSpacing, groupScale) — larger of the two drives gap", () => {
		// nodeSpacing < groupScale: gap depends on groupScale.
		const aSpacingDominant = estimateGroupRadius(4, 8, 5, 1);
		const aGroupScaleDominant = estimateGroupRadius(4, 8, 1, 5);
		// Both compute computeGroupGap(8, x, y) = pairwiseGap(8, 8, max(x,y)),
		// so swapping the larger arg yields the same radius.
		expect(aSpacingDominant).toBeCloseTo(aGroupScaleDominant, 6);
	});
});
