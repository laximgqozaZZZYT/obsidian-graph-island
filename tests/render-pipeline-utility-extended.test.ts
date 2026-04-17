import { describe, it, expect } from "vitest";
import {
	generateDisplacementOffsets,
	computeDensityMinDist,
	computeDensityScale,
	quickSelect,
	darkenColor,
	lightenColor,
	blendColors,
	desaturateColor,
	hashStringToHue,
	truncateLabel,
	screenToWorld,
	computeZoomFadeAlpha,
	computeLodLevel,
} from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// quickSelect — extended boundary/stress tests
// ---------------------------------------------------------------------------
describe("quickSelect — extended", () => {
	it("returns the only element when array has 1 element", () => {
		expect(quickSelect([42], 0)).toBe(42);
	});

	it("returns 0 for empty array", () => {
		expect(quickSelect([], 0)).toBe(0);
	});

	it("finds minimum (k=0) in sorted array", () => {
		expect(quickSelect([1, 2, 3, 4, 5], 0)).toBe(1);
	});

	it("finds maximum (k=n-1) in sorted array", () => {
		expect(quickSelect([1, 2, 3, 4, 5], 4)).toBe(5);
	});

	it("finds median in odd-length array", () => {
		expect(quickSelect([5, 3, 1, 4, 2], 2)).toBe(3);
	});

	it("handles all-same values", () => {
		expect(quickSelect([7, 7, 7, 7, 7], 2)).toBe(7);
	});

	it("handles two elements", () => {
		expect(quickSelect([10, 3], 0)).toBe(3);
		expect(quickSelect([10, 3], 1)).toBe(10);
	});

	it("handles reverse-sorted array", () => {
		expect(quickSelect([5, 4, 3, 2, 1], 2)).toBe(3);
	});

	it("handles negative values", () => {
		expect(quickSelect([-5, -1, -10, -3], 0)).toBe(-10);
		expect(quickSelect([-5, -1, -10, -3], 3)).toBe(-1);
	});

	it("handles mixed positive and negative", () => {
		expect(quickSelect([-2, 5, 0, -7, 3], 2)).toBe(0);
	});

	it("returns 0 for k out of bounds (negative)", () => {
		expect(quickSelect([1, 2, 3], -1)).toBe(0);
	});

	it("returns 0 for k out of bounds (too large)", () => {
		expect(quickSelect([1, 2, 3], 10)).toBe(0);
	});

	it("handles large array (1000 elements)", () => {
		const arr = Array.from({ length: 1000 }, (_, i) => 1000 - i);
		expect(quickSelect(arr, 499)).toBe(500);
	});

	it("handles duplicates with k pointing to duplicate", () => {
		expect(quickSelect([1, 3, 3, 3, 5], 1)).toBe(3);
		expect(quickSelect([1, 3, 3, 3, 5], 2)).toBe(3);
		expect(quickSelect([1, 3, 3, 3, 5], 3)).toBe(3);
	});

	it("handles array with zeros", () => {
		expect(quickSelect([0, 0, 0, 1], 0)).toBe(0);
		expect(quickSelect([0, 0, 0, 1], 3)).toBe(1);
	});

	it("handles float values", () => {
		const result = quickSelect([1.5, 0.5, 2.5, 1.0], 1);
		expect(result).toBe(1.0);
	});
});

// ---------------------------------------------------------------------------
// generateDisplacementOffsets — extended
// ---------------------------------------------------------------------------
describe("generateDisplacementOffsets — extended", () => {
	it("offsets include both positive and negative dx", () => {
		const offsets = generateDisplacementOffsets(100, 20, 10);
		expect(offsets.some((o) => o.dx > 0)).toBe(true);
		expect(offsets.some((o) => o.dx < 0)).toBe(true);
	});

	it("offsets include both positive and negative dy", () => {
		const offsets = generateDisplacementOffsets(100, 20, 10);
		expect(offsets.some((o) => o.dy > 0)).toBe(true);
		expect(offsets.some((o) => o.dy < 0)).toBe(true);
	});

	it("large nodeScreenR produces larger offsets", () => {
		const small = generateDisplacementOffsets(100, 20, 5);
		const large = generateDisplacementOffsets(100, 20, 50);
		const maxSmall = Math.max(...small.map((o) => Math.abs(o.dx) + Math.abs(o.dy)));
		const maxLarge = Math.max(...large.map((o) => Math.abs(o.dx) + Math.abs(o.dy)));
		expect(maxLarge).toBeGreaterThan(maxSmall);
	});

	it("zero dimensions produce small but non-zero offsets", () => {
		const offsets = generateDisplacementOffsets(0, 0, 0);
		expect(offsets).toHaveLength(12);
		// pad = 0 + 2 = 2, so offsets are non-zero
		for (const o of offsets) {
			expect(Math.abs(o.dx) + Math.abs(o.dy)).toBeGreaterThan(0);
		}
	});

	it("returns different offsets for narrow vs wide labels", () => {
		const narrow = generateDisplacementOffsets(20, 10, 5);
		const wide = generateDisplacementOffsets(200, 10, 5);
		// The rightmost offset should be larger for wider labels
		const maxDxNarrow = Math.max(...narrow.map((o) => o.dx));
		const maxDxWide = Math.max(...wide.map((o) => o.dx));
		expect(maxDxWide).toBeGreaterThan(maxDxNarrow);
	});
});

// ---------------------------------------------------------------------------
// Color manipulation — round-trip tests
// ---------------------------------------------------------------------------
describe("color round-trip properties", () => {
	it("darken(0) then lighten(0) preserves color", () => {
		const original = 0x336699;
		expect(darkenColor(lightenColor(original, 0), 0)).toBe(original);
	});

	it("blend(a, b, 0) = a and blend(a, b, 1) = b", () => {
		expect(blendColors(0x112233, 0x445566, 0)).toBe(0x112233);
		expect(blendColors(0x112233, 0x445566, 1)).toBe(0x445566);
	});

	it("desaturate(1.0) preserves original", () => {
		expect(desaturateColor(0xff4400, 1.0)).toBe(0xff4400);
	});

	it("lighten to white then back: factor 1 always gives white", () => {
		expect(lightenColor(0x000000, 1)).toBe(0xffffff);
		expect(lightenColor(0x112233, 1)).toBe(0xffffff);
		expect(lightenColor(0xaabbcc, 1)).toBe(0xffffff);
	});

	it("darken to black: factor 1 always gives black", () => {
		expect(darkenColor(0xffffff, 1)).toBe(0x000000);
		expect(darkenColor(0x112233, 1)).toBe(0x000000);
		expect(darkenColor(0xaabbcc, 1)).toBe(0x000000);
	});
});

// ---------------------------------------------------------------------------
// truncateLabel — stress tests
// ---------------------------------------------------------------------------
describe("truncateLabel — stress", () => {
	it("handles very long string", () => {
		const longStr = "a".repeat(10000);
		const result = truncateLabel(longStr, 10);
		expect(result.length).toBe(11); // 10 + ellipsis
	});

	it("maxChars=0 returns full string regardless of length", () => {
		const longStr = "x".repeat(500);
		expect(truncateLabel(longStr, 0)).toBe(longStr);
	});
});

// ---------------------------------------------------------------------------
// hashStringToHue — distribution test
// ---------------------------------------------------------------------------
describe("hashStringToHue — distribution", () => {
	it("produces reasonably distributed hues across alphabet", () => {
		const hues = "abcdefghijklmnopqrstuvwxyz".split("").map(hashStringToHue);
		const unique = new Set(hues);
		// Should produce at least 10 unique hues out of 26 letters
		expect(unique.size).toBeGreaterThanOrEqual(10);
	});

	it("numeric strings produce different hues", () => {
		const hues = Array.from({ length: 20 }, (_, i) => hashStringToHue(String(i)));
		const unique = new Set(hues);
		expect(unique.size).toBeGreaterThanOrEqual(10);
	});
});

// ---------------------------------------------------------------------------
// computeLodLevel — fine-grained boundary tests
// ---------------------------------------------------------------------------
describe("computeLodLevel — fine boundaries", () => {
	const t = {
		cardLODExtremePx: 2,
		cardLODMidLabelPx: 4,
		cardLODNormalPx: 8,
		cardLODCompactPx: 16,
		cardLODFullCardPx: 32,
	};

	it("just below each threshold returns prior level", () => {
		expect(computeLodLevel(1.99, t)).toBe(0);
		expect(computeLodLevel(3.99, t)).toBe(1);
		expect(computeLodLevel(7.99, t)).toBe(2);
		expect(computeLodLevel(15.99, t)).toBe(3);
		expect(computeLodLevel(31.99, t)).toBe(4);
	});

	it("exactly at each threshold returns next level", () => {
		expect(computeLodLevel(2, t)).toBe(1);
		expect(computeLodLevel(4, t)).toBe(2);
		expect(computeLodLevel(8, t)).toBe(3);
		expect(computeLodLevel(16, t)).toBe(4);
		expect(computeLodLevel(32, t)).toBe(5);
	});

	it("very large value returns 5", () => {
		expect(computeLodLevel(1e6, t)).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// screenToWorld — property tests
// ---------------------------------------------------------------------------
describe("screenToWorld — property tests", () => {
	it("doubling worldScale halves world result", () => {
		const a = screenToWorld(100, 1, 0.1);
		const b = screenToWorld(100, 2, 0.1);
		expect(b).toBeCloseTo(a / 2, 4);
	});

	it("doubling screenPx doubles world result (when above floor)", () => {
		const a = screenToWorld(50, 1, 0.1);
		const b = screenToWorld(100, 1, 0.1);
		expect(b).toBeCloseTo(a * 2, 4);
	});

	it("floor dominates when screenPx is tiny", () => {
		expect(screenToWorld(0.001, 100, 5)).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// computeZoomFadeAlpha — property tests
// ---------------------------------------------------------------------------
describe("computeZoomFadeAlpha — property tests", () => {
	it("output is always in [fadeFloor, 1]", () => {
		for (let z = 0; z <= 2; z += 0.05) {
			const alpha = computeZoomFadeAlpha(z);
			expect(alpha).toBeGreaterThanOrEqual(0.03);
			expect(alpha).toBeLessThanOrEqual(1);
		}
	});

	it("never exceeds 1", () => {
		expect(computeZoomFadeAlpha(100)).toBe(1);
	});

	it("never goes below fadeFloor", () => {
		expect(computeZoomFadeAlpha(-100)).toBe(0.03);
	});
});
