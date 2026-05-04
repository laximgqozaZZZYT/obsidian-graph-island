import { describe, it, expect } from "vitest";
import {
	getSpacing,
	backlinkBucket,
	computeEffectiveColumnSpacing,
	estimateGroupRadius,
} from "../src/layouts/cluster-force";
import type { GraphNode } from "../src/types";

function mkNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
	return {
		id,
		label: id,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		filePath: `${id}.md`,
		...overrides,
	} as GraphNode;
}

// =========================================================================
// getSpacing — per-node spacing multiplier lookup
// =========================================================================
describe("getSpacing", () => {
	it("returns 1.0 default when map is undefined", () => {
		expect(getSpacing("a")).toBe(1.0);
	});

	it("returns 1.0 default when map is empty", () => {
		expect(getSpacing("a", new Map())).toBe(1.0);
	});

	it("returns 1.0 default when key is missing from map", () => {
		const map = new Map([["b", 2.5]]);
		expect(getSpacing("a", map)).toBe(1.0);
	});

	it("returns the stored value when key is present", () => {
		const map = new Map([
			["a", 1.5],
			["b", 2.0],
		]);
		expect(getSpacing("a", map)).toBe(1.5);
		expect(getSpacing("b", map)).toBe(2.0);
	});

	it("preserves zero (does not fall back to 1.0)", () => {
		const map = new Map([["a", 0]]);
		expect(getSpacing("a", map)).toBe(0);
	});

	it("preserves negative values without coercion", () => {
		const map = new Map([["a", -0.5]]);
		expect(getSpacing("a", map)).toBe(-0.5);
	});
});

// =========================================================================
// backlinkBucket — degree → bucket label
// =========================================================================
describe("backlinkBucket", () => {
	it("returns '0' for zero degree", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' at the lower boundary (deg=1)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
	});

	it("returns '1-2' at the upper boundary (deg=2)", () => {
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' at the lower boundary (deg=3)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
	});

	it("returns '3-5' at the upper boundary (deg=5)", () => {
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' at the lower boundary (deg=6)", () => {
		expect(backlinkBucket(6)).toBe("6-10");
	});

	it("returns '6-10' at the upper boundary (deg=10)", () => {
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' at the lower boundary (deg=11)", () => {
		expect(backlinkBucket(11)).toBe("11+");
	});

	it("returns '11+' for very high degrees", () => {
		expect(backlinkBucket(1000)).toBe("11+");
	});

	it("produces only 5 distinct buckets across degrees 0..50", () => {
		const seen = new Set<string>();
		for (let d = 0; d <= 50; d++) seen.add(backlinkBucket(d));
		expect(seen.size).toBe(5);
		expect(seen).toEqual(new Set(["0", "1-2", "3-5", "6-10", "11+"]));
	});
});

// =========================================================================
// computeEffectiveColumnSpacing — derived spacing from unified offsets
// =========================================================================
describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize * 2 fallback when offsets map is empty", () => {
		expect(computeEffectiveColumnSpacing(new Map(), 10)).toBe(20);
	});

	it("returns nodeSize * 2 fallback when only one column exists", () => {
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 0, dy: 50 }],
			["c", { dx: 0, dy: 100 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 7)).toBe(14);
	});

	it("computes (max-min)/(cols-1) for two columns", () => {
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 100, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(100);
	});

	it("computes uniform spacing for evenly distributed columns", () => {
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
			["c", { dx: 100, dy: 0 }],
		]);
		// (100 - 0) / (3 - 1) = 50
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(50);
	});

	it("treats sub-cent offset differences as the same column (rounding to 1/100)", () => {
		// Math.round(dx * 100) → both 0.001 and 0.002 round to 0
		const offsets = new Map([
			["a", { dx: 0.001, dy: 0 }],
			["b", { dx: 0.002, dy: 0 }],
		]);
		// Only one unique column → fallback to nodeSize * 2
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(10);
	});

	it("derives spacing from extrema even with multiple nodes per column", () => {
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 0, dy: 50 }],
			["c", { dx: 200, dy: 0 }],
			["d", { dx: 200, dy: 50 }],
		]);
		// uniqueXPositions = {0, 200}, (200-0)/(2-1) = 200
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(200);
	});

	it("handles negative dx values", () => {
		const offsets = new Map([
			["a", { dx: -50, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(100);
	});
});

// =========================================================================
// estimateGroupRadius — visual footprint estimation
// =========================================================================
describe("estimateGroupRadius", () => {
	it("returns 0 for zero members", () => {
		// gap * sqrt(0) / 2 = 0; no super bonus
		expect(estimateGroupRadius(0, 10, 1, 1)).toBe(0);
	});

	it("uses gap * sqrt(n) / 2 baseline when no super members", () => {
		// computeGroupGap = 10 * 2 * max(1, 1) = 20
		// estimate = 20 * sqrt(4) / 2 = 20
		expect(estimateGroupRadius(4, 10, 1, 1)).toBe(20);
	});

	it("scales with sqrt of member count (footprint area)", () => {
		const r4 = estimateGroupRadius(4, 10, 1, 1);
		const r16 = estimateGroupRadius(16, 10, 1, 1);
		// sqrt(16)/sqrt(4) = 2 → r16 should be 2x r4
		expect(r16).toBeCloseTo(r4 * 2, 5);
	});

	it("uses max(nodeSpacing, groupScale) for the gap", () => {
		// spacing=2, groupScale=1 → max=2 → gap=10*2*2=40 → 40*sqrt(4)/2 = 40
		const a = estimateGroupRadius(4, 10, 2, 1);
		// spacing=1, groupScale=2 → max=2 → same gap → same result
		const b = estimateGroupRadius(4, 10, 1, 2);
		expect(a).toBe(40);
		expect(b).toBe(40);
		expect(a).toBe(b);
	});

	it("ignores the members array when no member is a super node", () => {
		const baseline = estimateGroupRadius(2, 10, 1, 1);
		const withMembers = estimateGroupRadius(2, 10, 1, 1, undefined, [mkNode("a"), mkNode("b")]);
		expect(withMembers).toBe(baseline);
	});

	it("inflates the estimate when at least one member is a super node", () => {
		const baseline = estimateGroupRadius(2, 10, 1, 1);
		const withSuper = estimateGroupRadius(2, 10, 1, 1, undefined, [
			mkNode("a"),
			mkNode("super", { collapsedMembers: ["m1", "m2", "m3", "m4"] }),
		]);
		expect(withSuper).toBeGreaterThan(baseline);
	});

	it("uses the largest super-node bonus, not the cumulative one", () => {
		// Two super nodes with the same member count should produce the
		// same bonus as a single one (Math.max, not sum).
		const oneSuper = estimateGroupRadius(2, 10, 1, 1, undefined, [
			mkNode("a"),
			mkNode("s1", { collapsedMembers: ["m1", "m2", "m3"] }),
		]);
		const twoSupers = estimateGroupRadius(2, 10, 1, 1, undefined, [
			mkNode("s1", { collapsedMembers: ["m1", "m2", "m3"] }),
			mkNode("s2", { collapsedMembers: ["m4", "m5", "m6"] }),
		]);
		expect(twoSupers).toBe(oneSuper);
	});

	it("returns a non-negative value for typical inputs", () => {
		// Sanity: realistic params should never go negative.
		const r = estimateGroupRadius(10, 15, 1.2, 1.5);
		expect(r).toBeGreaterThan(0);
	});
});
