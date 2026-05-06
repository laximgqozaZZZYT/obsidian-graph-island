/**
 * Boundary tests for previously-uncovered pure helpers in cluster-force.ts:
 *   - getSpacing — per-node spacing lookup with 1.0 default
 *   - computeEffectiveColumnSpacing — column-spacing from unified offset map
 *   - estimateGroupRadius — group visual-radius estimate (with super-node bonus)
 *   - backlinkBucket — degree→bucket-name mapping
 *
 * These helpers are small but cover critical layout invariants
 * (spacing fallbacks, single-column degeneracy, super-node footprint).
 */
import { describe, it, expect } from "vitest";
import {
	getSpacing,
	computeEffectiveColumnSpacing,
	estimateGroupRadius,
	backlinkBucket,
	pairwiseGap,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// getSpacing — per-node spacing multiplier lookup
// ---------------------------------------------------------------------------

describe("getSpacing", () => {
	it("returns 1.0 when map is undefined", () => {
		expect(getSpacing("any-id")).toBe(1.0);
	});

	it("returns 1.0 when id is missing from map", () => {
		const map = new Map<string, number>([["other", 2.5]]);
		expect(getSpacing("missing", map)).toBe(1.0);
	});

	it("returns the mapped value when id is present", () => {
		const map = new Map<string, number>([["a.md", 2.5]]);
		expect(getSpacing("a.md", map)).toBe(2.5);
	});

	it("returns 0 (not the default) when explicitly mapped to 0", () => {
		// Important: distinguishes "missing" (→ 1.0) from "explicitly zero" (→ 0).
		const map = new Map<string, number>([["zero.md", 0]]);
		expect(getSpacing("zero.md", map)).toBe(0);
	});

	it("returns very small / very large values verbatim", () => {
		const map = new Map<string, number>([
			["tiny", 0.01],
			["huge", 100],
		]);
		expect(getSpacing("tiny", map)).toBe(0.01);
		expect(getSpacing("huge", map)).toBe(100);
	});

	it("treats empty map identically to missing key", () => {
		expect(getSpacing("anything", new Map())).toBe(1.0);
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveColumnSpacing — derive column spacing from unified offsets
// ---------------------------------------------------------------------------

describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize×2 for an empty offset map", () => {
		// 0 columns → uniqueXPositions.size = 0 → nCols = max(1, 0) = 1 < 2 → fallback
		expect(computeEffectiveColumnSpacing(new Map(), 10)).toBe(20);
	});

	it("returns nodeSize×2 when all nodes share one column", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 0, dy: 50 }],
			["c", { dx: 0, dy: 100 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(16);
	});

	it("computes (max - min) / (nCols - 1) for evenly spaced columns", () => {
		// 3 columns at dx = 0, 100, 200 → (200-0)/(3-1) = 100
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 100, dy: 0 }],
			["c", { dx: 200, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(100);
	});

	it("treats nearly-identical dx values (within 0.01) as the same column", () => {
		// Math.round(dx * 100) collapses sub-0.01 jitter into one bucket.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0.001, dy: 0 }], // round(0.1) = 0
			["b", { dx: 0.002, dy: 0 }], // round(0.2) = 0
			["c", { dx: 0.003, dy: 0 }], // round(0.3) = 0
		]);
		// All collapse to 1 column → fallback to nodeSize × 2
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(10);
	});

	it("handles two columns: spacing = (max - min) / 1", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: -50, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(100);
	});

	it("handles negative dx values correctly", () => {
		// Columns at dx = -100, 0, 100 → range 200, 3 cols → 200/2 = 100
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: -100, dy: 0 }],
			["b", { dx: 0, dy: 0 }],
			["c", { dx: 100, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// estimateGroupRadius — group visual-radius estimate
// ---------------------------------------------------------------------------

describe("estimateGroupRadius", () => {
	it("returns 0 (or near-0) for empty group with no super members", () => {
		// memberCount=0 → gap × 0 / 2 = 0; no super bonus
		expect(estimateGroupRadius(0, 10, 1, 1)).toBe(0);
	});

	it("scales as gap × √n / 2 for normal members", () => {
		// nodeSize=10, nodeSpacing=2, groupScale=1 → spacing = max(2,1) = 2
		// gap = pairwiseGap(10, 10, 2) = 10 × 2 × 2 = 40
		// 4 members → 40 × √4 / 2 = 40 × 2 / 2 = 40
		expect(estimateGroupRadius(4, 10, 2, 1)).toBe(40);
	});

	it("uses max(nodeSpacing, groupScale) for the gap", () => {
		// nodeSize=10, nodeSpacing=1, groupScale=3 → spacing = 3
		// gap = pairwiseGap(10, 10, 3) = 60
		// 1 member → 60 × 1 / 2 = 30
		expect(estimateGroupRadius(1, 10, 1, 3)).toBe(30);
	});

	it("ignores undefined members array (uses memberCount only)", () => {
		// Without `members`, no super bonus is applied even for large memberCount.
		const r = estimateGroupRadius(9, 10, 1, 1, "grid");
		const gap = pairwiseGap(10, 10, 1); // 20
		expect(r).toBe((gap * 3) / 2); // 20 × 3 / 2 = 30
	});

	it("ignores members without collapsedMembers (no super bonus)", () => {
		const members = [makeNode("a"), makeNode("b")];
		const r = estimateGroupRadius(2, 10, 1, 1, "grid", members);
		const expected = (pairwiseGap(10, 10, 1) * Math.sqrt(2)) / 2;
		expect(r).toBeCloseTo(expected, 6);
	});

	it("inflates radius when at least one member is a super node", () => {
		// A super node forces effectiveRadius > nodeSize → superBonus > 0
		const superMember = makeNode("super", {
			collapsedMembers: ["x", "y", "z", "w"],
			label: "super-collapsed",
		});
		const baseR = estimateGroupRadius(1, 10, 1, 1, "grid"); // no members → no bonus
		const inflatedR = estimateGroupRadius(1, 10, 1, 1, "grid", [superMember]);
		expect(inflatedR).toBeGreaterThan(baseR);
	});

	it("super bonus picks the largest super node, not the sum", () => {
		// Two super nodes: bonus = max(sr - nodeSize), not sum.
		const small = makeNode("s", { collapsedMembers: ["a", "b"], label: "small" });
		const big = makeNode("big", { collapsedMembers: Array.from({ length: 50 }, (_, i) => `m${i}`), label: "big" });
		const rBoth = estimateGroupRadius(2, 10, 1, 1, "grid", [small, big]);
		const rOnlyBig = estimateGroupRadius(2, 10, 1, 1, "grid", [big]);
		// With both members, bonus is dominated by the larger super node — equal to rOnlyBig
		expect(rBoth).toBeCloseTo(rOnlyBig, 6);
	});

	it("respects custom min/max node radius caps for super-bonus computation", () => {
		const superMember = makeNode("s", { collapsedMembers: ["a", "b", "c"], label: "s" });
		// With a tight maxNodeRadius=15, the super bonus is clamped smaller than with maxNodeRadius=200.
		const tightR = estimateGroupRadius(1, 10, 1, 1, "grid", [superMember], 15, 5);
		const looseR = estimateGroupRadius(1, 10, 1, 1, "grid", [superMember], 200, 5);
		expect(looseR).toBeGreaterThanOrEqual(tightR);
	});

	it("scales monotonically with memberCount (more members → larger radius)", () => {
		const r1 = estimateGroupRadius(1, 10, 1, 1);
		const r9 = estimateGroupRadius(9, 10, 1, 1);
		const r25 = estimateGroupRadius(25, 10, 1, 1);
		expect(r9).toBeGreaterThan(r1);
		expect(r25).toBeGreaterThan(r9);
	});
});

// ---------------------------------------------------------------------------
// backlinkBucket — degree→bucket label
// ---------------------------------------------------------------------------

describe("backlinkBucket", () => {
	it("returns '0' for degree 0 (orphan nodes)", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' for degrees 1 and 2 (boundary)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' for degrees 3, 4, 5 (boundary)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(4)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' for degrees 6 through 10 (boundary)", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' for degree 11 and above (overflow bucket)", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(100)).toBe("11+");
		expect(backlinkBucket(10_000)).toBe("11+");
	});

	it("buckets cover all non-negative integers without gaps", () => {
		// Sweep from 0 to 12 — every degree must yield a non-empty bucket label.
		for (let d = 0; d <= 12; d++) {
			expect(backlinkBucket(d)).toMatch(/^(0|1-2|3-5|6-10|11\+)$/);
		}
	});
});
