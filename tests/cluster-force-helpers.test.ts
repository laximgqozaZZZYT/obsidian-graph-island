/**
 * Boundary-value tests for previously untested pure helpers in
 * src/layouts/cluster-force.ts:
 *   - getSpacing                  — Map fallback to 1.0
 *   - backlinkBucket              — degree → bucket label
 *   - computeEffectiveColumnSpacing — column-spacing derivation from offsets
 *
 * These three are leaf utilities (no side effects, no DOM/Canvas), so we
 * exercise their branches and edge cases directly without going through
 * buildClusterForce.
 */
import { describe, it, expect } from "vitest";
import { getSpacing, backlinkBucket, computeEffectiveColumnSpacing } from "../src/layouts/cluster-force";

// ---------------------------------------------------------------------------
// getSpacing — id lookup with default 1.0
// ---------------------------------------------------------------------------
describe("getSpacing", () => {
	it("returns 1.0 when map is undefined", () => {
		expect(getSpacing("anyId")).toBe(1.0);
	});

	it("returns 1.0 when map is empty", () => {
		expect(getSpacing("anyId", new Map())).toBe(1.0);
	});

	it("returns mapped value when id is present", () => {
		const map = new Map([["a", 2.5]]);
		expect(getSpacing("a", map)).toBe(2.5);
	});

	it("falls back to 1.0 when id is missing from a non-empty map", () => {
		const map = new Map([["other", 4.0]]);
		expect(getSpacing("missing", map)).toBe(1.0);
	});

	it("preserves zero as a valid mapped value (does not fallback)", () => {
		// 0 is a real spacing override and must NOT trip the ?? fallback
		const map = new Map([["a", 0]]);
		expect(getSpacing("a", map)).toBe(0);
	});

	it("preserves negative values as a valid mapped value", () => {
		const map = new Map([["a", -1.5]]);
		expect(getSpacing("a", map)).toBe(-1.5);
	});
});

// ---------------------------------------------------------------------------
// backlinkBucket — degree → bucket label
// ---------------------------------------------------------------------------
describe("backlinkBucket", () => {
	it("returns '0' for degree 0", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' for low-degree boundary (1 and 2)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' for mid-low boundary (3, 4, 5)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(4)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' for mid-high boundary (6 and 10)", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' for any degree >= 11", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(50)).toBe("11+");
		expect(backlinkBucket(1_000_000)).toBe("11+");
	});

	it("buckets monotonically increase across the boundary transitions", () => {
		// Verify each transition returns a distinct bucket label
		const buckets = [0, 1, 3, 6, 11].map(backlinkBucket);
		expect(new Set(buckets).size).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveColumnSpacing — derive column gap from unified offsets
// ---------------------------------------------------------------------------
describe("computeEffectiveColumnSpacing", () => {
	it("falls back to nodeSize*2 when offsets is empty (single virtual column)", () => {
		expect(computeEffectiveColumnSpacing(new Map(), 8)).toBe(16);
	});

	it("falls back to nodeSize*2 when all nodes share a single column", () => {
		const offsets = new Map([
			["a", { dx: 100, dy: 0 }],
			["b", { dx: 100, dy: 50 }],
			["c", { dx: 100, dy: -50 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 5)).toBe(10);
	});

	it("returns the average column spacing for an even multi-column layout", () => {
		// 3 columns at dx = 0, 50, 100 → (100-0)/(3-1) = 50
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
			["c", { dx: 100, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(50);
	});

	it("returns the average column spacing for an uneven layout", () => {
		// dx range 0..120 across 4 columns → (120-0)/(4-1) = 40
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 30, dy: 0 }],
			["c", { dx: 80, dy: 0 }],
			["d", { dx: 120, dy: 0 }],
		]);
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(40);
	});

	it("collapses near-identical dx values into one column via Math.round(dx*100)", () => {
		// dx differs by < 0.005 → after *100 + round they share a column key
		const offsets = new Map([
			["a", { dx: 1.001, dy: 0 }],
			["b", { dx: 1.0009, dy: 0 }],
		]);
		// Both round to 100 → 1 column → fallback
		expect(computeEffectiveColumnSpacing(offsets, 6)).toBe(12);
	});

	it("treats two distinct columns as the spacing itself", () => {
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 25, dy: 0 }],
		]);
		// (25-0)/(2-1) = 25
		expect(computeEffectiveColumnSpacing(offsets, 4)).toBe(25);
	});

	it("handles negative dx values via straightforward range arithmetic", () => {
		const offsets = new Map([
			["a", { dx: -50, dy: 0 }],
			["b", { dx: 0, dy: 0 }],
			["c", { dx: 50, dy: 0 }],
		]);
		// (50 - (-50))/(3-1) = 50
		expect(computeEffectiveColumnSpacing(offsets, 8)).toBe(50);
	});

	it("falls back to nodeSize*2 with nodeSize=0 (zero spacing edge case)", () => {
		// Single column branch returns 0*2 = 0
		expect(computeEffectiveColumnSpacing(new Map(), 0)).toBe(0);
	});
});
