/**
 * Unit tests for src/views/viewport-utilization.ts
 *
 * Three pure helpers extracted from GraphViewContainer.ensureViewportUtilization
 * so the math (radius averaging, degenerate-axis spread, quadratic scale solve)
 * can be exercised without a Pixi/Canvas runtime.
 */
import { describe, it, expect } from "vitest";
import {
	computeAvgNodeRadius,
	computeViewportScaleFactor,
	spreadDegenerateAxis,
	type MutablePoint,
} from "../../src/views/viewport-utilization";

describe("computeAvgNodeRadius", () => {
	it("returns the default radius when the list is empty (no division by zero)", () => {
		expect(computeAvgNodeRadius([])).toBe(12);
	});

	it("honors a caller-supplied default for an empty list", () => {
		expect(computeAvgNodeRadius([], 7)).toBe(7);
	});

	it("averages explicit radii", () => {
		expect(computeAvgNodeRadius([{ radius: 10 }, { radius: 20 }, { radius: 30 }])).toBe(20);
	});

	it("substitutes the default for nodes whose radius is undefined", () => {
		// (12 + 24) / 2 = 18 — first uses default, second is explicit
		expect(computeAvgNodeRadius([{}, { radius: 24 }])).toBe(18);
	});

	it("uses the supplied default when radius is missing on every node", () => {
		expect(computeAvgNodeRadius([{}, {}, {}], 5)).toBe(5);
	});
});

describe("spreadDegenerateAxis", () => {
	function makeNodes(count: number): MutablePoint[] {
		return Array.from({ length: count }, () => ({ x: 100, y: 100 }));
	}

	it("is a no-op when both axes already exceed the degenerate threshold", () => {
		const nodes = makeNodes(3);
		const before = nodes.map((n) => ({ ...n }));
		spreadDegenerateAxis(nodes, 0, 0, 200, 200, /* threshold */ 50, 0.5, 10000);
		expect(nodes).toEqual(before);
	});

	it("is a no-op when both axes are below the degenerate threshold", () => {
		// bboxW=20, bboxH=20, threshold=50 — neither side qualifies as the "wide" one
		const nodes = makeNodes(3);
		const before = nodes.map((n) => ({ ...n }));
		spreadDegenerateAxis(nodes, 0, 0, 20, 20, 50, 0.5, 10000);
		expect(nodes).toEqual(before);
	});

	it("spreads along Y when bboxW > threshold and bboxH < threshold", () => {
		const nodes = makeNodes(3);
		// bboxW=400 (wide), bboxH=10 (collapsed), threshold=50
		// targetH = max(400*0.3, 0.5*10000/400) = max(120, 12.5) = 120
		// t values: -0.5, 0, 0.5 -> y = 0 + t*120
		spreadDegenerateAxis(nodes, /* cx */ 0, /* cy */ 0, 400, 10, 50, 0.5, 10000);
		expect(nodes[0].y).toBeCloseTo(-60);
		expect(nodes[1].y).toBeCloseTo(0);
		expect(nodes[2].y).toBeCloseTo(60);
		// X coordinates are untouched
		expect(nodes.every((n) => n.x === 100)).toBe(true);
	});

	it("spreads along X when bboxH > threshold and bboxW < threshold", () => {
		const nodes = makeNodes(3);
		spreadDegenerateAxis(nodes, /* cx */ 0, /* cy */ 0, /* bboxW */ 10, /* bboxH */ 400, 50, 0.5, 10000);
		// targetW = max(400*0.3, 0.5*10000/400) = 120
		expect(nodes[0].x).toBeCloseTo(-60);
		expect(nodes[1].x).toBeCloseTo(0);
		expect(nodes[2].x).toBeCloseTo(60);
		// Y coordinates are untouched
		expect(nodes.every((n) => n.y === 100)).toBe(true);
	});

	it("centers a single node on the supplied (cx,cy) — t=0 branch", () => {
		const nodes: MutablePoint[] = [{ x: 100, y: 100 }];
		spreadDegenerateAxis(nodes, /* cx */ 50, /* cy */ 25, 400, 10, 50, 0.5, 10000);
		// n=1 -> t=0 -> y = cy + 0 = 25
		expect(nodes[0].y).toBe(25);
	});

	it("uses (minUtil*vpArea)/bboxW when that exceeds bboxW*0.3", () => {
		const nodes = makeNodes(2);
		// bboxW=100, vpArea=1e6, minUtil=0.5 ⇒ minUtil*vpArea/bboxW = 5000 ≫ 100*0.3 = 30
		spreadDegenerateAxis(nodes, 0, 0, 100, 5, 50, 0.5, 1_000_000);
		// targetH = 5000, t = -0.5 / +0.5 ⇒ y = ±2500
		expect(nodes[0].y).toBeCloseTo(-2500);
		expect(nodes[1].y).toBeCloseTo(2500);
	});
});

describe("computeViewportScaleFactor", () => {
	it("returns the positive quadratic root that hits the minUtil target (typical case)", () => {
		// Choose tiny avgR so the quadratic ≈ A x^2 = minUtil*vpArea
		// bboxW=bboxH=100, avgR=1, minUtil=0.25, vpArea=10000
		// posSpan = 98, A = 9604, B = 4*98 = 392, C = 4 - 2500 = -2496
		// disc = 392^2 - 4*9604*-2496 = 153664 + 95893632 ≈ 96047296
		// scale = (-392 + sqrt(96047296))/(2*9604) ≈ (-392 + 9800.4)/19208 ≈ 0.4898
		const scale = computeViewportScaleFactor(100, 100, 0.25, 10000, 0.1, 1);
		expect(scale).toBeGreaterThan(0.48);
		expect(scale).toBeLessThan(0.5);
	});

	it("returns a positive, finite scale for realistic call-site inputs (minUtil·vpArea dominates radius padding)", () => {
		// Real call sites use minUtil ≈ 0.3-0.5 with viewport areas in the millions of px².
		// That makes C = 4·avgR² - minUtil·vpArea strongly negative, which keeps both
		// quadratic roots' larger value in the positive regime. (When C > 0 — i.e.
		// node radii alone overflow the target area — the formula degenerates to a
		// negative root; that pathological branch is exercised only by the fallback
		// `sqrt(minUtil/util)` in the source, which is mathematically unreachable
		// because disc = 4·avgR²·(W-H)² + 4·W·H·minUtil·vpArea ≥ 0.)
		const cases: Array<[number, number, number, number, number, number]> = [
			[100, 50, 0.5, 10_000, 0.05, 5],
			[1000, 1000, 0.8, 1_000_000, 0.001, 20],
			[200, 200, 0.3, 500_000, 0.08, 10],
		];
		for (const args of cases) {
			const scale = computeViewportScaleFactor(...args);
			expect(Number.isFinite(scale)).toBe(true);
			expect(scale).toBeGreaterThan(0);
		}
	});

	it("clamps posSpan to 1 when bboxW <= 2*avgR (avoids zero divisor)", () => {
		// bboxW = 2*avgR exactly -> posSpanW would be 0, clamped to 1
		// Should still return a finite, positive number rather than NaN/Infinity.
		const scale = computeViewportScaleFactor(/* bboxW */ 20, /* bboxH */ 100, 0.5, 10000, 0.02, 10);
		expect(Number.isFinite(scale)).toBe(true);
		expect(scale).toBeGreaterThan(0);
	});

	it("returned scale grows monotonically as the minUtil target rises", () => {
		const lo = computeViewportScaleFactor(100, 100, 0.1, 10000, 0.1, 1);
		const hi = computeViewportScaleFactor(100, 100, 0.5, 10000, 0.1, 1);
		expect(hi).toBeGreaterThan(lo);
	});
});
