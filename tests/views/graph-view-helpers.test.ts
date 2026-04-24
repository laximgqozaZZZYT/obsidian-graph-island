import { describe, it, expect } from "vitest";
import { computeViewportScaleFactor } from "../../src/views/graph-view-helpers";

describe("computeViewportScaleFactor", () => {
	it("returns a scale factor that makes a tiny bbox meet minUtil", () => {
		// Typical case: bbox much smaller than the target area → factor > 1.
		const bboxW = 200;
		const bboxH = 200;
		const vpW = 1000;
		const vpH = 800;
		const vpArea = vpW * vpH;
		const minUtil = 0.5;
		const util = (bboxW * bboxH) / vpArea; // 0.05
		const avgR = 10;

		const factor = computeViewportScaleFactor(bboxW, bboxH, minUtil, vpArea, util, avgR);

		expect(factor).toBeGreaterThan(1);
		expect(Number.isFinite(factor)).toBe(true);

		// Verify the quadratic identity: after scaling, (positions + radii) bbox
		// must be ≥ sqrt(minUtil * vpArea) on each side (roughly square target).
		const posSpanW = bboxW - 2 * avgR;
		const posSpanH = bboxH - 2 * avgR;
		const newW = posSpanW * factor + 2 * avgR;
		const newH = posSpanH * factor + 2 * avgR;
		expect(newW * newH).toBeGreaterThanOrEqual(minUtil * vpArea - 1e-6);
	});

	it("is monotonic in minUtil: stricter utilization → larger factor", () => {
		// Same bbox/viewport, only minUtil changes. A stricter (larger) minUtil
		// must demand a larger-or-equal scale factor.
		const bboxW = 300;
		const bboxH = 200;
		const vpArea = 1_000_000;
		const util = (bboxW * bboxH) / vpArea;
		const avgR = 12;

		const low = computeViewportScaleFactor(bboxW, bboxH, 0.3, vpArea, util, avgR);
		const high = computeViewportScaleFactor(bboxW, bboxH, 0.6, vpArea, util, avgR);

		expect(Number.isFinite(low)).toBe(true);
		expect(Number.isFinite(high)).toBe(true);
		expect(high).toBeGreaterThan(low);
	});

	it("clamps tiny position spans to avoid division-by-zero (degenerate bbox)", () => {
		// bboxW < 2*avgR → posSpanW clamps to 1 (same for H).
		const avgR = 100;
		const factor = computeViewportScaleFactor(10, 10, 0.3, 10000 * 10000, 0.01, avgR);
		expect(Number.isFinite(factor)).toBe(true);
		expect(factor).toBeGreaterThan(0);
	});
});
