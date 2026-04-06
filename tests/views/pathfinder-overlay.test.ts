import { describe, it, expect } from "vitest";
import {
	computePathfinderPulse,
	buildPathSegments,
	computePathfinderDrawData,
	PATHFINDER_PULSE_SPEED,
	PATHFINDER_PULSE_AMPLITUDE,
	PATHFINDER_GLOW_ALPHA_BASE,
	PATHFINDER_SOLID_ALPHA_BASE,
	PATHFINDER_LABEL_OFFSET_X,
	PATHFINDER_LABEL_OFFSET_Y,
} from "../../src/views/pathfinder-overlay";

// Helper: simple position map
function posMap(entries: [string, number, number][]): (id: string) => { x: number; y: number } | undefined {
	const m = new Map(entries.map(([id, x, y]) => [id, { x, y }]));
	return (id) => m.get(id);
}

describe("computePathfinderPulse", () => {
	it("returns base values at frame 0", () => {
		const p = computePathfinderPulse(0);
		// sin(0) = 0 → no pulse offset
		expect(p.glowAlpha).toBeCloseTo(PATHFINDER_GLOW_ALPHA_BASE, 5);
		expect(p.solidAlpha).toBeCloseTo(PATHFINDER_SOLID_ALPHA_BASE, 5);
	});

	it("varies with frame", () => {
		const p0 = computePathfinderPulse(0);
		const p10 = computePathfinderPulse(10);
		// Should differ because sin(10 * speed) != 0
		expect(p10.glowAlpha).not.toBeCloseTo(p0.glowAlpha, 5);
	});

	it("stays within amplitude range", () => {
		for (let f = 0; f < 200; f++) {
			const p = computePathfinderPulse(f);
			expect(p.glowAlpha).toBeGreaterThanOrEqual(PATHFINDER_GLOW_ALPHA_BASE - PATHFINDER_PULSE_AMPLITUDE - 0.001);
			expect(p.glowAlpha).toBeLessThanOrEqual(PATHFINDER_GLOW_ALPHA_BASE + PATHFINDER_PULSE_AMPLITUDE + 0.001);
			expect(p.solidAlpha).toBeGreaterThanOrEqual(PATHFINDER_SOLID_ALPHA_BASE - PATHFINDER_PULSE_AMPLITUDE - 0.001);
			expect(p.solidAlpha).toBeLessThanOrEqual(PATHFINDER_SOLID_ALPHA_BASE + PATHFINDER_PULSE_AMPLITUDE + 0.001);
		}
	});

	it("pulse is periodic (sin-based)", () => {
		// Full period = 2π / PULSE_SPEED
		const period = Math.round((2 * Math.PI) / PATHFINDER_PULSE_SPEED);
		const p0 = computePathfinderPulse(0);
		const pPeriod = computePathfinderPulse(period);
		expect(pPeriod.glowAlpha).toBeCloseTo(p0.glowAlpha, 2);
	});
});

describe("buildPathSegments", () => {
	it("builds segments from consecutive pairs", () => {
		const pos = posMap([
			["a", 0, 0],
			["b", 10, 20],
			["c", 30, 40],
		]);
		const segs = buildPathSegments(["a", "b", "c"], pos);
		expect(segs).toHaveLength(2);
		expect(segs[0]).toEqual({ ax: 0, ay: 0, bx: 10, by: 20 });
		expect(segs[1]).toEqual({ ax: 10, ay: 20, bx: 30, by: 40 });
	});

	it("skips segments with missing nodes", () => {
		const pos = posMap([
			["a", 0, 0],
			["c", 30, 40],
		]);
		// b is missing
		const segs = buildPathSegments(["a", "b", "c"], pos);
		expect(segs).toHaveLength(0); // a→b missing, b→c missing
	});

	it("returns empty for single-node path", () => {
		const pos = posMap([["a", 0, 0]]);
		expect(buildPathSegments(["a"], pos)).toHaveLength(0);
	});

	it("returns empty for empty path", () => {
		expect(buildPathSegments([], () => undefined)).toHaveLength(0);
	});
});

describe("computePathfinderDrawData", () => {
	it("returns null for fewer than 2 nodes", () => {
		expect(computePathfinderDrawData(["a"], 0, () => ({ x: 0, y: 0 }))).toBeNull();
		expect(computePathfinderDrawData([], 0, () => ({ x: 0, y: 0 }))).toBeNull();
	});

	it("returns null when all positions are missing", () => {
		expect(computePathfinderDrawData(["a", "b"], 0, () => undefined)).toBeNull();
	});

	it("returns valid draw data for a 2-node path", () => {
		const pos = posMap([
			["a", 0, 0],
			["b", 100, 0],
		]);
		const dd = computePathfinderDrawData(["a", "b"], 5, pos);
		expect(dd).not.toBeNull();
		expect(dd!.segments).toHaveLength(1);
		expect(dd!.dots).toHaveLength(2);
		expect(dd!.label.text).toBe("1 hop");
	});

	it("computes correct label for multi-hop path", () => {
		const pos = posMap([
			["a", 0, 0],
			["b", 10, 0],
			["c", 20, 0],
			["d", 30, 0],
		]);
		const dd = computePathfinderDrawData(["a", "b", "c", "d"], 0, pos);
		expect(dd).not.toBeNull();
		expect(dd!.label.text).toBe("3 hops");
		expect(dd!.segments).toHaveLength(3);
	});

	it("places label at midpoint segment with offset", () => {
		const pos = posMap([
			["a", 0, 0],
			["b", 100, 0],
		]);
		const dd = computePathfinderDrawData(["a", "b"], 0, pos)!;
		// Midpoint of segment: (50, 0) + offset
		expect(dd.label.x).toBeCloseTo(50 + PATHFINDER_LABEL_OFFSET_X);
		expect(dd.label.y).toBeCloseTo(0 + PATHFINDER_LABEL_OFFSET_Y);
	});

	it("includes pulse alpha values", () => {
		const pos = posMap([
			["a", 0, 0],
			["b", 10, 0],
		]);
		const dd = computePathfinderDrawData(["a", "b"], 0, pos)!;
		expect(dd.glowAlpha).toBeCloseTo(PATHFINDER_GLOW_ALPHA_BASE);
		expect(dd.solidAlpha).toBeCloseTo(PATHFINDER_SOLID_ALPHA_BASE);
	});
});
