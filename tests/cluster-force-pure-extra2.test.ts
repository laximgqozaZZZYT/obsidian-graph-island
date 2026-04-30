/**
 * cluster-force-pure-extra2.test.ts
 *
 * Boundary-value tests for the small pure helpers in cluster-force.ts that
 * are exported but not exercised by the existing cluster-force suites
 * (cluster-force.test.ts, cluster-force-pure.test.ts,
 *  cluster-force-coverage.test.ts, cluster-force-extra.test.ts,
 *  cluster-force-blend.test.ts).
 *
 * Targets:
 *  - getSpacing                  — Map lookup with default fallback
 *  - backlinkBucket              — degree → bucket name (5 buckets)
 *  - computeEffectiveColumnSpacing — column spacing from X distribution
 *  - estimateGroupRadius         — group footprint estimation incl. super nodes
 */
import { describe, it, expect } from "vitest";
import {
	getSpacing,
	backlinkBucket,
	computeEffectiveColumnSpacing,
	estimateGroupRadius,
	computeGroupGap,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// getSpacing
// ---------------------------------------------------------------------------

describe("getSpacing", () => {
	it("returns 1.0 default when map is undefined", () => {
		expect(getSpacing("anyId")).toBe(1.0);
		expect(getSpacing("anyId", undefined)).toBe(1.0);
	});

	it("returns 1.0 default when key is missing from map", () => {
		const map = new Map<string, number>([["a", 2.5]]);
		expect(getSpacing("missing", map)).toBe(1.0);
	});

	it("returns the mapped value when key exists", () => {
		const map = new Map<string, number>([
			["small", 0.5],
			["large", 4.0],
		]);
		expect(getSpacing("small", map)).toBe(0.5);
		expect(getSpacing("large", map)).toBe(4.0);
	});

	it("returns 0 (not the 1.0 default) when explicit 0 is stored — nullish coalescing only triggers on null/undefined", () => {
		const map = new Map<string, number>([["zero", 0]]);
		expect(getSpacing("zero", map)).toBe(0);
	});

	it("handles negative spacing values (no clamping in getter)", () => {
		const map = new Map<string, number>([["neg", -1.5]]);
		expect(getSpacing("neg", map)).toBe(-1.5);
	});
});

// ---------------------------------------------------------------------------
// backlinkBucket
// ---------------------------------------------------------------------------

describe("backlinkBucket", () => {
	it("buckets degree 0 as '0'", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("buckets 1 and 2 as '1-2' (lower and upper boundary of first non-zero bucket)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("buckets 3 and 5 as '3-5' (boundaries of mid bucket)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("buckets 6 and 10 as '6-10'", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("buckets 11 and any larger degree as '11+'", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(100)).toBe("11+");
		expect(backlinkBucket(1000)).toBe("11+");
	});

	it("produces exactly 5 distinct buckets across the full degree spectrum", () => {
		const buckets = new Set<string>();
		for (const d of [0, 1, 3, 6, 11]) buckets.add(backlinkBucket(d));
		expect(buckets.size).toBe(5);
	});

	it("transitions at exact threshold values 2→3, 5→6, 10→11", () => {
		expect(backlinkBucket(2)).not.toBe(backlinkBucket(3));
		expect(backlinkBucket(5)).not.toBe(backlinkBucket(6));
		expect(backlinkBucket(10)).not.toBe(backlinkBucket(11));
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveColumnSpacing
// ---------------------------------------------------------------------------

describe("computeEffectiveColumnSpacing", () => {
	it("falls back to nodeSize × 2 when offsets is empty (nCols=1, < 2 branch)", () => {
		const offsets = new Map<string, { dx: number; dy: number }>();
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(20);
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(10);
	});

	it("falls back to nodeSize × 2 when all nodes share a single X column", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 50, dy: 0 }],
			["b", { dx: 50, dy: 100 }],
			["c", { dx: 50, dy: 200 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 7)).toBe(14);
	});

	it("computes (maxDx - minDx) / (nCols - 1) for two distinct columns", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 100, dy: 0 }],
		]);
		// 2 cols → (100 - 0) / (2 - 1) = 100
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(100);
	});

	it("computes uniform spacing across multiple equally-spaced columns", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
			["c", { dx: 100, dy: 0 }],
			["d", { dx: 150, dy: 0 }],
		]);
		// 4 cols → (150 - 0) / (4 - 1) = 50
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(50);
	});

	it("rounds to 2-decimal precision when bucketing X positions (dx*100 then Math.round)", () => {
		// 0.001 and 0.002 round to the same bucket (both → 0 after Math.round(dx*100))
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0.001, dy: 0 }],
			["b", { dx: 0.002, dy: 0 }],
		]);
		// Treated as 1 column → fallback nodeSize × 2
		expect(computeEffectiveColumnSpacing(offsets, 4)).toBe(8);
	});

	it("handles negative dx ranges (e.g., centered offsets)", () => {
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: -100, dy: 0 }],
			["b", { dx: 0, dy: 0 }],
			["c", { dx: 100, dy: 0 }],
		]);
		// (100 - (-100)) / (3 - 1) = 100
		expect(computeEffectiveColumnSpacing(offsets, 1)).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// estimateGroupRadius
// ---------------------------------------------------------------------------

describe("estimateGroupRadius", () => {
	it("returns 0 for an empty group (memberCount=0, no super nodes)", () => {
		expect(estimateGroupRadius(0, 10, 1.0, 1.0)).toBe(0);
	});

	it("scales with √memberCount (canonical √n footprint formula)", () => {
		const r1 = estimateGroupRadius(1, 10, 1.0, 1.0);
		const r4 = estimateGroupRadius(4, 10, 1.0, 1.0);
		const r9 = estimateGroupRadius(9, 10, 1.0, 1.0);
		// r_n = gap * √n / 2 — strictly increasing, ratio 1:2:3
		expect(r4).toBeCloseTo(r1 * 2, 5);
		expect(r9).toBeCloseTo(r1 * 3, 5);
	});

	it("matches gap * √n / 2 exactly when no super nodes are present", () => {
		const memberCount = 16;
		const nodeSize = 10;
		const nodeSpacing = 2.0;
		const groupScale = 1.0;
		const gap = computeGroupGap(nodeSize, nodeSpacing, groupScale);
		const expected = (gap * Math.sqrt(memberCount)) / 2;
		expect(estimateGroupRadius(memberCount, nodeSize, nodeSpacing, groupScale)).toBeCloseTo(expected, 5);
	});

	it("inflates result when a super node is present (collapsedMembers length > 0)", () => {
		const baseR = estimateGroupRadius(4, 10, 1.0, 1.0);
		const withSuper = estimateGroupRadius(4, 10, 1.0, 1.0, "grid", [
			makeNode("super1", { collapsedMembers: ["a", "b", "c", "d", "e"] }),
		]);
		expect(withSuper).toBeGreaterThan(baseR);
	});

	it("ignores members without collapsedMembers (no super-bonus)", () => {
		const baseR = estimateGroupRadius(4, 10, 1.0, 1.0);
		const withRegular = estimateGroupRadius(4, 10, 1.0, 1.0, "grid", [
			makeNode("a"),
			makeNode("b"),
			makeNode("c"),
			makeNode("d"),
		]);
		expect(withRegular).toBe(baseR);
	});

	it("ignores members with empty collapsedMembers array", () => {
		const baseR = estimateGroupRadius(2, 10, 1.0, 1.0);
		const withEmptyCollapsed = estimateGroupRadius(2, 10, 1.0, 1.0, "grid", [
			makeNode("a", { collapsedMembers: [] }),
			makeNode("b"),
		]);
		expect(withEmptyCollapsed).toBe(baseR);
	});

	it("uses the maximum super-node bonus when multiple super nodes are present", () => {
		const r1 = estimateGroupRadius(2, 10, 1.0, 1.0, "grid", [makeNode("small", { collapsedMembers: ["x", "y"] })]);
		const r2 = estimateGroupRadius(2, 10, 1.0, 1.0, "grid", [
			makeNode("small", { collapsedMembers: ["x", "y"] }),
			makeNode("big", { collapsedMembers: Array.from({ length: 50 }, (_, i) => `n${i}`) }),
		]);
		// Larger collapsed group → bigger super bonus → bigger group radius
		expect(r2).toBeGreaterThan(r1);
	});

	it("groupScale dominates when greater than nodeSpacing (Math.max in computeGroupGap)", () => {
		const tiny = estimateGroupRadius(4, 10, 0.1, 1.0);
		const same = estimateGroupRadius(4, 10, 1.0, 1.0);
		// nodeSpacing < groupScale → max is groupScale → both yield identical gap
		expect(tiny).toBeCloseTo(same, 5);
	});

	it("nodeSpacing dominates when greater than groupScale", () => {
		const small = estimateGroupRadius(4, 10, 1.0, 1.0);
		const large = estimateGroupRadius(4, 10, 4.0, 1.0);
		// Larger nodeSpacing → larger gap → larger group radius
		expect(large).toBeGreaterThan(small);
	});
});
