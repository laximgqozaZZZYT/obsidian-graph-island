import { describe, it, expect } from "vitest";
import {
	getSemanticZoomTier,
	clampCardFontSize,
	computeNodeAlpha,
	SEMANTIC_TIER_DOT,
	SEMANTIC_TIER_CIRCLE,
	SEMANTIC_TIER_COMPACT,
	SEMANTIC_TIER_FULL,
} from "../src/views/semantic-zoom-utils";

describe("getSemanticZoomTier", () => {
	const dotPx = 4;
	const compactPx = 20;
	const fullPx = 80;

	it("returns DOT below dotPx", () => {
		expect(getSemanticZoomTier(0, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_DOT);
		expect(getSemanticZoomTier(3.99, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_DOT);
	});

	it("returns CIRCLE between dotPx and compactPx (inclusive lower, exclusive upper)", () => {
		expect(getSemanticZoomTier(dotPx, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_CIRCLE);
		expect(getSemanticZoomTier(10, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_CIRCLE);
		expect(getSemanticZoomTier(19.99, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_CIRCLE);
	});

	it("returns COMPACT between compactPx and fullPx", () => {
		expect(getSemanticZoomTier(compactPx, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_COMPACT);
		expect(getSemanticZoomTier(50, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_COMPACT);
		expect(getSemanticZoomTier(79.99, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_COMPACT);
	});

	it("returns FULL at and above fullPx", () => {
		expect(getSemanticZoomTier(fullPx, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_FULL);
		expect(getSemanticZoomTier(1000, dotPx, compactPx, fullPx)).toBe(SEMANTIC_TIER_FULL);
	});

	it("is monotonic across tier boundaries", () => {
		const samples = [0, 4, 5, 10, 20, 21, 50, 79, 80, 200];
		const tiers = samples.map((s) => getSemanticZoomTier(s, dotPx, compactPx, fullPx));
		for (let i = 1; i < tiers.length; i++) {
			expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]);
		}
	});

	it("handles degenerate threshold ordering by falling through to upper tier", () => {
		// when dotPx === compactPx === fullPx, screenPx >= them all → FULL
		expect(getSemanticZoomTier(10, 5, 5, 5)).toBe(SEMANTIC_TIER_FULL);
		// when screenPx < all, → DOT
		expect(getSemanticZoomTier(0, 5, 5, 5)).toBe(SEMANTIC_TIER_DOT);
	});
});

describe("clampCardFontSize", () => {
	const fontMin = 8;
	const fontBase = 14;
	const scaleCap = 2;

	it("returns fontBase / worldScale when within bounds", () => {
		// worldScale=1 → 14/1 = 14, between 8 and 28
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, 1)).toBe(14);
		// worldScale=0.7 → 20, between 8 and 28
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, 0.7)).toBeCloseTo(20);
	});

	it("clamps to fontMin when fontBase / worldScale is too small", () => {
		// worldScale=10 → 1.4, below min of 8 → clamped to 8
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, 10)).toBe(fontMin);
	});

	it("clamps to fontBase * scaleCap when fontBase / worldScale is too large", () => {
		// worldScale=0.1 → 140, above cap of 28 → clamped to 28
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, 0.1)).toBe(fontBase * scaleCap);
	});

	it("returns the cap when worldScale is zero (avoid Infinity)", () => {
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, 0)).toBe(fontBase * scaleCap);
	});

	it("returns the cap when worldScale is negative or non-finite", () => {
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, -1)).toBe(fontBase * scaleCap);
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, NaN)).toBe(fontBase * scaleCap);
		expect(clampCardFontSize(fontMin, fontBase, scaleCap, Infinity)).toBe(fontBase * scaleCap);
	});

	it("never returns below fontMin or above fontBase * scaleCap", () => {
		const samples = [0.05, 0.5, 1, 1.5, 5, 50];
		for (const ws of samples) {
			const v = clampCardFontSize(fontMin, fontBase, scaleCap, ws);
			expect(v).toBeGreaterThanOrEqual(fontMin);
			expect(v).toBeLessThanOrEqual(fontBase * scaleCap);
		}
	});
});

describe("computeNodeAlpha", () => {
	it("returns base when not filtered", () => {
		expect(computeNodeAlpha(0.8, false, 0.3)).toBe(0.8);
	});

	it("multiplies by filteredMultiplier when filtered", () => {
		expect(computeNodeAlpha(0.8, true, 0.5)).toBeCloseTo(0.4);
	});

	it("returns 0 when filtered and multiplier is 0", () => {
		expect(computeNodeAlpha(1, true, 0)).toBe(0);
	});

	it("preserves base alpha when filteredMultiplier is 1", () => {
		expect(computeNodeAlpha(0.6, true, 1)).toBe(0.6);
	});
});
