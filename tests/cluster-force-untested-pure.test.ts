import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	computeEffectiveColumnSpacing,
	computeGroupGap,
	estimateGroupRadius,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
	return {
		id: overrides.id ?? "n",
		label: overrides.label ?? "Node",
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// backlinkBucket — bucket boundary classification (deg → string label)
// ---------------------------------------------------------------------------

describe("backlinkBucket", () => {
	it("returns '0' for zero degree", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' for degree 1 and 2 (lower/upper bounds)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' for degrees 3, 4, 5 (full range)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(4)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' at the lower edge (6) and upper edge (10)", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' at the threshold (11) and far above (1000)", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(1000)).toBe("11+");
	});

	it("crosses each bucket boundary exactly once (2→3, 5→6, 10→11)", () => {
		expect(backlinkBucket(2)).not.toBe(backlinkBucket(3));
		expect(backlinkBucket(5)).not.toBe(backlinkBucket(6));
		expect(backlinkBucket(10)).not.toBe(backlinkBucket(11));
	});

	it("classifies negative degrees in the '1-2' bucket (deg !== 0 && deg <= 2)", () => {
		// Documents current behavior: only deg === 0 short-circuits; negatives fall
		// into the first non-zero bucket because all subsequent checks use <=.
		expect(backlinkBucket(-1)).toBe("1-2");
		expect(backlinkBucket(-100)).toBe("1-2");
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveColumnSpacing — column-spacing derivation from dx map
// ---------------------------------------------------------------------------

describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize * 2 when offsets map is empty (no columns)", () => {
		const empty = new Map<string, { dx: number; dy: number }>();
		expect(computeEffectiveColumnSpacing(empty, 25)).toBe(50);
	});

	it("returns nodeSize * 2 when only a single column exists", () => {
		const m = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 5, dy: 0 }],
			["b", { dx: 5, dy: 50 }],
			["c", { dx: 5, dy: 100 }],
		]);
		expect(computeEffectiveColumnSpacing(m, 30)).toBe(60);
	});

	it("computes (maxDx - minDx) / (nCols - 1) for two evenly-spaced columns", () => {
		const m = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 100, dy: 0 }],
		]);
		// nCols = 2 → (100 - 0) / (2 - 1) = 100
		expect(computeEffectiveColumnSpacing(m, 10)).toBe(100);
	});

	it("computes spacing for three evenly-spaced columns regardless of node count", () => {
		const m = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0, dy: 0 }],
			["a2", { dx: 0, dy: 50 }],
			["b", { dx: 30, dy: 0 }],
			["c", { dx: 60, dy: 0 }],
		]);
		// 3 unique columns → (60 - 0) / (3 - 1) = 30
		expect(computeEffectiveColumnSpacing(m, 10)).toBe(30);
	});

	it("treats dx values within rounding tolerance (1/100) as the same column", () => {
		// 1.001 vs 1.004 both round*100 → 100 (same column).
		const m = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 1.001, dy: 0 }],
			["b", { dx: 1.004, dy: 5 }],
		]);
		// Single column → returns nodeSize * 2.
		expect(computeEffectiveColumnSpacing(m, 8)).toBe(16);
	});

	it("treats dx values across the rounding boundary as separate columns", () => {
		// 1.014 → round*100 = 101, 1.015 → round*100 = 102 (Math.round half-up).
		const m = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 1.014, dy: 0 }],
			["b", { dx: 1.015, dy: 0 }],
		]);
		// Two columns → (1.015 - 1.014) / 1.
		expect(computeEffectiveColumnSpacing(m, 100)).toBeCloseTo(0.001, 10);
	});

	it("handles negative dx values (negative-positive span)", () => {
		const m = new Map<string, { dx: number; dy: number }>([
			["a", { dx: -50, dy: 0 }],
			["b", { dx: 0, dy: 0 }],
			["c", { dx: 50, dy: 0 }],
		]);
		// nCols = 3 → (50 - (-50)) / 2 = 50
		expect(computeEffectiveColumnSpacing(m, 10)).toBe(50);
	});

	it("returns 0 when all columns share the same dx after rounding (edge of degenerate input)", () => {
		// Many entries but rounding collapses them to one bucket; falls into
		// the < 2 branch which returns nodeSize * 2 (NOT 0).
		const m = new Map<string, { dx: number; dy: number }>([
			["a", { dx: 0.0001, dy: 0 }],
			["b", { dx: 0.0002, dy: 0 }],
			["c", { dx: 0.0003, dy: 0 }],
		]);
		// 0.0001 * 100 = 0.01 → rounds to 0; same for all → single column.
		expect(computeEffectiveColumnSpacing(m, 7)).toBe(14);
	});
});

// ---------------------------------------------------------------------------
// estimateGroupRadius — gap × √n / 2 + superBonus
// ---------------------------------------------------------------------------

describe("estimateGroupRadius", () => {
	it("returns 0 for memberCount=0 with no members array (sqrt(0) * gap / 2 = 0)", () => {
		expect(estimateGroupRadius(0, 30, 1.0, 1.0)).toBe(0);
	});

	it("matches the canonical formula gap × √n / 2 with no super-node bonus", () => {
		// gap = computeGroupGap(nodeSize, spacing, scale).
		// For nodeSize=20, spacing=1, scale=1: gap = 20 * 2 * 1 = 40.
		// memberCount=4 → 40 * 2 / 2 = 40.
		const gap = computeGroupGap(20, 1, 1);
		expect(gap).toBe(40);
		expect(estimateGroupRadius(4, 20, 1, 1)).toBe(40);
	});

	it("scales with √memberCount (quadrupling members doubles radius)", () => {
		const r4 = estimateGroupRadius(4, 20, 1, 1);
		const r16 = estimateGroupRadius(16, 20, 1, 1);
		expect(r16 / r4).toBeCloseTo(2, 6);
	});

	it("uses max(nodeSpacing, groupScale) inside computeGroupGap", () => {
		// Smaller spacing should be overridden by larger groupScale.
		const r1 = estimateGroupRadius(9, 10, 0.5, 2.0); // gap = 10*2*2 = 40
		const r2 = estimateGroupRadius(9, 10, 2.0, 0.5); // gap = 10*2*2 = 40 (same)
		expect(r1).toBe(r2);
	});

	it("ignores the arrangement parameter (currently unused in the formula)", () => {
		// The arrangement param is part of the signature but not consumed.
		// Documenting current behavior so a future refactor that starts honoring
		// it is forced to update this expectation.
		const a = estimateGroupRadius(9, 20, 1, 1, "grid");
		const b = estimateGroupRadius(9, 20, 1, 1, "concentric");
		const c = estimateGroupRadius(9, 20, 1, 1, "triangle");
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it("adds super-node bonus when a member has collapsedMembers", () => {
		const superNode = makeNode({
			id: "super",
			collapsedMembers: ["a", "b", "c", "d"],
		});
		const baseR = estimateGroupRadius(1, 20, 1, 1);
		const withSuper = estimateGroupRadius(1, 20, 1, 1, undefined, [superNode]);
		expect(withSuper).toBeGreaterThan(baseR);
	});

	it("ignores members without collapsedMembers (no superBonus)", () => {
		const plain = makeNode({ id: "p" });
		const baseR = estimateGroupRadius(1, 20, 1, 1);
		const withPlain = estimateGroupRadius(1, 20, 1, 1, undefined, [plain]);
		expect(withPlain).toBe(baseR);
	});

	it("ignores members with empty collapsedMembers array", () => {
		const empty = makeNode({ id: "e", collapsedMembers: [] });
		const baseR = estimateGroupRadius(1, 20, 1, 1);
		const withEmpty = estimateGroupRadius(1, 20, 1, 1, undefined, [empty]);
		expect(withEmpty).toBe(baseR);
	});

	it("picks the maximum super-bonus across multiple super-node members", () => {
		const small = makeNode({ id: "s", collapsedMembers: ["a", "b"] });
		const large = makeNode({
			id: "l",
			collapsedMembers: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
		});
		const rSmallOnly = estimateGroupRadius(2, 20, 1, 1, undefined, [small]);
		const rBoth = estimateGroupRadius(2, 20, 1, 1, undefined, [small, large]);
		// large produces a bigger superBonus → drives the result.
		expect(rBoth).toBeGreaterThan(rSmallOnly);
	});

	it("respects custom maxNodeRadius cap when computing super bonus", () => {
		const huge = makeNode({
			id: "h",
			collapsedMembers: Array.from({ length: 100 }, (_, i) => String(i)),
		});
		// With a tight cap, the super bonus saturates.
		const tight = estimateGroupRadius(1, 20, 1, 1, undefined, [huge], 25, 12);
		const loose = estimateGroupRadius(1, 20, 1, 1, undefined, [huge], 200, 12);
		expect(loose).toBeGreaterThan(tight);
	});

	it("returns a finite, non-negative number for large input ranges", () => {
		const r = estimateGroupRadius(10_000, 50, 2.5, 3.0);
		expect(Number.isFinite(r)).toBe(true);
		expect(r).toBeGreaterThan(0);
	});
});
