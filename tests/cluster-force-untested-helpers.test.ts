// ----------------------------------------------------------------------------
// Tests for previously-uncovered pure helpers in cluster-force.ts:
//   - getSpacing                       (per-node spacing override lookup)
//   - backlinkBucket                   (degree → label bucket)
//   - computeEffectiveColumnSpacing    (uniform column gap from offsets)
//   - estimateGroupRadius              (group footprint estimate)
// All four were exported but had zero direct test coverage prior to this file.
// Boundary values + degenerate inputs are exercised to lock current behaviour.
// ----------------------------------------------------------------------------
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
	it("returns 1.0 when the map argument is omitted", () => {
		expect(getSpacing("anyId")).toBe(1.0);
	});

	it("returns 1.0 when the map is empty", () => {
		expect(getSpacing("anyId", new Map())).toBe(1.0);
	});

	it("returns 1.0 for ids missing from the map", () => {
		const m = new Map<string, number>([["other", 5]]);
		expect(getSpacing("missing", m)).toBe(1.0);
	});

	it("returns the mapped value when present", () => {
		const m = new Map<string, number>([["a", 2.5]]);
		expect(getSpacing("a", m)).toBe(2.5);
	});

	it("preserves zero as a real override (does not fall back to 1.0)", () => {
		// 0 is falsy but Map.get() returns it so ?? must NOT replace it.
		const m = new Map<string, number>([["zero", 0]]);
		expect(getSpacing("zero", m)).toBe(0);
	});

	it("preserves negative overrides verbatim", () => {
		const m = new Map<string, number>([["neg", -1.5]]);
		expect(getSpacing("neg", m)).toBe(-1.5);
	});
});

// ---------------------------------------------------------------------------
// backlinkBucket
// ---------------------------------------------------------------------------

describe("backlinkBucket", () => {
	it("maps zero to '0'", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("maps 1 and 2 to '1-2'", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("maps 3, 4, 5 to '3-5'", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(4)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("maps 6 through 10 to '6-10'", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("maps 11 and above to '11+'", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(100)).toBe("11+");
		expect(backlinkBucket(99999)).toBe("11+");
	});

	it("handles boundary transitions exactly (2→1-2, 3→3-5, 5→3-5, 6→6-10, 10→6-10, 11→11+)", () => {
		// Lock the precise boundaries — easy to break with off-by-one edits.
		expect(backlinkBucket(2)).toBe("1-2");
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
		expect(backlinkBucket(11)).toBe("11+");
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveColumnSpacing
// ---------------------------------------------------------------------------

describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize * 2 for an empty offsets map (no columns)", () => {
		expect(computeEffectiveColumnSpacing(new Map(), 8)).toBe(16);
	});

	it("returns nodeSize * 2 when only one unique X position exists", () => {
		// All members share dx=10 → 1 column → fallback formula.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 10, dy: 0 }],
			["b", { dx: 10, dy: 5 }],
			["c", { dx: 10, dy: -5 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 12)).toBe(24);
	});

	it("computes uniform spacing across evenly-spread columns", () => {
		// Columns at -10, 0, 10 → range=20, nCols=3 → spacing=20/2=10.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: -10, dy: 0 }],
			["b", { dx: 0, dy: 0 }],
			["c", { dx: 10, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(10);
	});

	it("uses (maxDx - minDx) / (nCols - 1) for arbitrary positions", () => {
		// Columns at -50, -10, 0, 30 → range=80, nCols=4 → spacing=80/3 ≈ 26.667.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: -50, dy: 0 }],
			["b", { dx: -10, dy: 0 }],
			["c", { dx: 0, dy: 0 }],
			["d", { dx: 30, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBeCloseTo(80 / 3, 6);
	});

	it("treats dx values within ~0.01 of each other as the same column (Math.round * 100)", () => {
		// 10.001 and 10.002 both round to 1000 → single column → fallback to nodeSize*2.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 10.001, dy: 0 }],
			["b", { dx: 10.002, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(10);
	});

	it("treats dx values differing by ≥0.01 as separate columns", () => {
		// 10.00 → 1000, 10.01 → 1001 → distinct rounded keys.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 10.0, dy: 0 }],
			["b", { dx: 10.01, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBeCloseTo(0.01, 6);
	});

	it("ignores dy entirely (only dx values matter)", () => {
		// Same dx, wildly different dy → still 1 column.
		const offsets = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: -1000 }],
			["b", { dx: 0, dy: 1000 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 7)).toBe(14);
	});
});

// ---------------------------------------------------------------------------
// estimateGroupRadius
// ---------------------------------------------------------------------------

describe("estimateGroupRadius", () => {
	it("scales with sqrt(memberCount): single member produces gap/2", () => {
		// gap = nodeSize*2*max(nodeSpacing, groupScale) = 10*2*2 = 40
		// radius = (40 * sqrt(1))/2 = 20.
		const r = estimateGroupRadius(1, 10, 1.0, 2.0);
		expect(r).toBeCloseTo(20, 6);
	});

	it("grows monotonically as memberCount increases", () => {
		const r1 = estimateGroupRadius(1, 10, 1.0, 2.0);
		const r4 = estimateGroupRadius(4, 10, 1.0, 2.0);
		const r16 = estimateGroupRadius(16, 10, 1.0, 2.0);
		// sqrt(1)=1, sqrt(4)=2, sqrt(16)=4 → radii are 20, 40, 80 with gap=40.
		expect(r4).toBeCloseTo(40, 6);
		expect(r16).toBeCloseTo(80, 6);
		expect(r4).toBeGreaterThan(r1);
		expect(r16).toBeGreaterThan(r4);
	});

	it("uses the larger of nodeSpacing and groupScale (matches computeGroupGap)", () => {
		const gapDirect = computeGroupGap(8, 1.5, 3.0);
		// memberCount=4 → sqrt=2 → expected = (gap*2)/2 = gap.
		expect(estimateGroupRadius(4, 8, 1.5, 3.0)).toBeCloseTo(gapDirect, 6);
		// Reverse: nodeSpacing > groupScale.
		const gapDirect2 = computeGroupGap(8, 4.0, 1.0);
		expect(estimateGroupRadius(4, 8, 4.0, 1.0)).toBeCloseTo(gapDirect2, 6);
	});

	it("returns zero when memberCount is zero (no nodes → no footprint)", () => {
		// sqrt(0)=0 → (gap*0)/2 = 0, no superBonus when members undefined.
		expect(estimateGroupRadius(0, 10, 1.0, 2.0)).toBe(0);
	});

	it("ignores members without collapsedMembers (no super bonus)", () => {
		const members = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const without = estimateGroupRadius(4, 10, 1.0, 2.0);
		const withPlain = estimateGroupRadius(4, 10, 1.0, 2.0, "grid", members);
		expect(withPlain).toBeCloseTo(without, 6);
	});

	it("inflates the radius when at least one member is a super node", () => {
		// One supernode member → superBonus is added; result strictly > baseline.
		const baseline = estimateGroupRadius(4, 10, 1.0, 2.0);
		const members = [
			makeNode("a"),
			makeNode("super", { collapsedMembers: [makeNode("c1"), makeNode("c2"), makeNode("c3")] }),
			makeNode("b"),
		];
		const inflated = estimateGroupRadius(4, 10, 1.0, 2.0, "grid", members);
		expect(inflated).toBeGreaterThan(baseline);
	});

	it("uses the LARGEST super-bonus when multiple super nodes are present", () => {
		// Two supernodes; the larger collapsedMembers count wins.
		const small = [makeNode("s1", { collapsedMembers: [makeNode("c1")] })];
		const large = [
			makeNode("s1", { collapsedMembers: [makeNode("c1")] }),
			makeNode("s2", { collapsedMembers: Array.from({ length: 25 }, (_, i) => makeNode(`c${i}`)) }),
		];
		const rSmall = estimateGroupRadius(2, 10, 1.0, 2.0, "grid", small);
		const rLarge = estimateGroupRadius(2, 10, 1.0, 2.0, "grid", large);
		expect(rLarge).toBeGreaterThan(rSmall);
	});

	it("respects custom maxNodeRadius / minNodeRadius bounds for super-bonus calculation", () => {
		const members = [makeNode("super", { collapsedMembers: [makeNode("c1"), makeNode("c2")] })];
		// Tiny maxNodeRadius caps the super-bonus.
		const capped = estimateGroupRadius(1, 10, 1.0, 2.0, "grid", members, /*maxNodeRadius*/ 12);
		// Default maxNodeRadius=60 lets the super-bonus grow.
		const uncapped = estimateGroupRadius(1, 10, 1.0, 2.0, "grid", members);
		expect(uncapped).toBeGreaterThanOrEqual(capped);
	});
});
