import { describe, it, expect } from "vitest";
import {
	RING_STROKE_DARKEN,
	RING_STROKE_ALPHA,
	SUNBURST_SEGMENT_ARC_DEG,
	renderSunburstSegmentMode,
	type DonutRenderCtx,
} from "../../src/views/donut-renderer";

/** Minimal CanvasGraphics mock that records calls. */
function mockGraphics() {
	return {
		lineStyle: () => {},
		beginFill: () => {},
		endFill: () => {},
		moveTo: () => {},
		arc: () => {},
		lineTo: () => {},
		drawCircle: () => {},
		clear: () => {},
	} as any;
}

describe("donut-renderer constants", () => {
	it("RING_STROKE_DARKEN is between 0 and 1", () => {
		expect(RING_STROKE_DARKEN).toBeGreaterThan(0);
		expect(RING_STROKE_DARKEN).toBeLessThanOrEqual(1);
	});

	it("RING_STROKE_ALPHA is between 0 and 1", () => {
		expect(RING_STROKE_ALPHA).toBeGreaterThan(0);
		expect(RING_STROKE_ALPHA).toBeLessThanOrEqual(1);
	});

	it("SUNBURST_SEGMENT_ARC_DEG is positive", () => {
		expect(SUNBURST_SEGMENT_ARC_DEG).toBeGreaterThan(0);
		expect(SUNBURST_SEGMENT_ARC_DEG).toBeLessThanOrEqual(360);
	});
});

describe("renderSunburstSegmentMode", () => {
	it("renders arcs for each visible node", () => {
		const arcCalls: number[][] = [];
		const g = {
			...mockGraphics(),
			arc: (...args: number[]) => arcCalls.push(args),
		};
		const visible = [
			{ data: { id: "a", x: 10, y: 20 }, radius: 5, color: 0xff0000 },
			{ data: { id: "b", x: 30, y: 40 }, radius: 8, color: 0x00ff00 },
		] as any;

		const ctx: DonutRenderCtx = {
			visible,
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 3,
		};
		renderSunburstSegmentMode(g as any, ctx, { filteredNodeAlpha: 0.3 });

		expect(arcCalls).toHaveLength(2);
		// First node at (10,20) with radius max(5,3)=5
		expect(arcCalls[0][0]).toBe(10);
		expect(arcCalls[0][1]).toBe(20);
		expect(arcCalls[0][2]).toBe(5);
	});

	it("uses minWorldRadius when node radius is smaller", () => {
		const arcCalls: number[][] = [];
		const g = {
			...mockGraphics(),
			arc: (...args: number[]) => arcCalls.push(args),
		};
		const visible = [
			{ data: { id: "a", x: 0, y: 0 }, radius: 1, color: 0xffffff },
		] as any;

		renderSunburstSegmentMode(
			g as any,
			{ visible, tlFilteredOut: null, alpha: 1, minWorldRadius: 10 },
			{ filteredNodeAlpha: 0.5 },
		);

		expect(arcCalls[0][2]).toBe(10);
	});

	it("applies filtered alpha for timeline-filtered nodes", () => {
		const fills: [number, number][] = [];
		const g = {
			...mockGraphics(),
			beginFill: (color: number, alpha: number) => fills.push([color, alpha]),
		};
		const visible = [
			{ data: { id: "filtered", x: 0, y: 0 }, radius: 5, color: 0xaabbcc },
		] as any;

		renderSunburstSegmentMode(
			g as any,
			{ visible, tlFilteredOut: new Set(["filtered"]), alpha: 0.8, minWorldRadius: 1 },
			{ filteredNodeAlpha: 0.25 },
		);

		// alpha should be 0.8 * 0.25 = 0.2
		expect(fills[0][1]).toBeCloseTo(0.2);
	});

	it("handles empty visible array", () => {
		const g = mockGraphics();
		renderSunburstSegmentMode(
			g as any,
			{ visible: [], tlFilteredOut: null, alpha: 1, minWorldRadius: 3 },
			{ filteredNodeAlpha: 0.5 },
		);
		// No error, no calls
	});
});
