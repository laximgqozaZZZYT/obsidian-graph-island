import { describe, it, expect } from "vitest";
import { dashifyLineStrip } from "../src/views/webgl/tessellator";

describe("dashifyLineStrip", () => {
	it("returns empty array for fewer than 2 points", () => {
		expect(dashifyLineStrip([{ x: 0, y: 0 }], [5, 5])).toEqual([]);
		expect(dashifyLineStrip([], [5, 5])).toEqual([]);
	});

	it("returns whole strip when pattern is empty", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
		];
		const result = dashifyLineStrip(pts, []);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual(pts);
	});

	it("returns whole strip when pattern is all zeros", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
		];
		const result = dashifyLineStrip(pts, [0, 0]);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual(pts);
	});

	it("produces correct number of dash segments for uniform pattern", () => {
		// 100px line with [10, 10] pattern → 5 dash segments
		const pts = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
		];
		const result = dashifyLineStrip(pts, [10, 10]);
		expect(result).toHaveLength(5);
	});

	it("dash segments have correct start/end x positions", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 40, y: 0 },
		];
		const result = dashifyLineStrip(pts, [10, 10]);
		// dash 0-10, gap 10-20, dash 20-30, gap 30-40
		expect(result).toHaveLength(2);
		expect(result[0][0].x).toBeCloseTo(0);
		expect(result[0][result[0].length - 1].x).toBeCloseTo(10);
		expect(result[1][0].x).toBeCloseTo(20);
		expect(result[1][result[1].length - 1].x).toBeCloseTo(30);
	});

	it("handles diagonal lines", () => {
		// Diagonal 3-4-5 triangle: length = 5
		const pts = [
			{ x: 0, y: 0 },
			{ x: 3, y: 4 },
		];
		const result = dashifyLineStrip(pts, [2, 1]);
		// dash 0-2, gap 2-3, dash 3-5
		expect(result).toHaveLength(2);
		// First dash endpoint
		expect(result[0][result[0].length - 1].x).toBeCloseTo((3 * 2) / 5);
		expect(result[0][result[0].length - 1].y).toBeCloseTo((4 * 2) / 5);
	});

	it("handles multi-segment polyline", () => {
		// Two segments: (0,0)→(10,0)→(10,10), total length 20
		const pts = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
		];
		const result = dashifyLineStrip(pts, [5, 5]);
		// dash 0-5, gap 5-10, dash 10-15, gap 15-20
		expect(result).toHaveLength(2);
	});

	it("each visible segment has at least 2 points", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
		];
		const result = dashifyLineStrip(pts, [8, 6]);
		for (const seg of result) {
			expect(seg.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("total visible length equals sum of dash portions", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
		];
		const result = dashifyLineStrip(pts, [10, 5]);
		// pattern cycle = 15, fits 6 times in 100 → 6 dashes of 10 + partial
		// 6*15 = 90, remaining 10 is dash → 7 dash segments
		let totalLen = 0;
		for (const seg of result) {
			for (let i = 0; i < seg.length - 1; i++) {
				const dx = seg[i + 1].x - seg[i].x;
				const dy = seg[i + 1].y - seg[i].y;
				totalLen += Math.sqrt(dx * dx + dy * dy);
			}
		}
		// 6 full dashes + 1 partial (10) = 70
		expect(totalLen).toBeCloseTo(70, 1);
	});

	it("works with asymmetric dash pattern [dash, gap, dash, gap]", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 30, y: 0 },
		];
		// pattern [5,3,2,4] → cycle=14; dash 0-5, gap 5-8, dash 8-10, gap 10-14, dash 14-19, ...
		const result = dashifyLineStrip(pts, [5, 3, 2, 4]);
		expect(result.length).toBeGreaterThanOrEqual(3);
	});

	it("handles very short line relative to dash pattern", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
		];
		const result = dashifyLineStrip(pts, [10, 10]);
		// Entire line fits within first dash
		expect(result).toHaveLength(1);
		expect(result[0][result[0].length - 1].x).toBeCloseTo(2);
	});

	it("handles zero-length segments in polyline", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 0, y: 0 }, // zero-length
			{ x: 10, y: 0 },
		];
		const result = dashifyLineStrip(pts, [5, 5]);
		expect(result).toHaveLength(1);
	});
});
