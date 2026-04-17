import { describe, it, expect } from "vitest";
import {
	darkenColor,
	lightenColor,
	blendColors,
	desaturateColor,
	hashStringToHue,
	truncateLabel,
	quickSelect,
	screenToWorld,
	computeZoomFadeAlpha,
	computeLodLevel,
} from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// darkenColor — extended boundary tests
// ---------------------------------------------------------------------------
describe("darkenColor (extended)", () => {
	it("factor=0 returns original color", () => {
		expect(darkenColor(0xff0000, 0)).toBe(0xff0000);
		expect(darkenColor(0x00ff00, 0)).toBe(0x00ff00);
		expect(darkenColor(0x0000ff, 0)).toBe(0x0000ff);
	});

	it("factor=1 returns black (0x000000)", () => {
		expect(darkenColor(0xff0000, 1)).toBe(0x000000);
		expect(darkenColor(0xffffff, 1)).toBe(0x000000);
	});

	it("factor=0.5 halves each channel", () => {
		// 0xff = 255, half = 128 = 0x80
		const result = darkenColor(0xffffff, 0.5);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBeCloseTo(128, 0);
		expect(g).toBeCloseTo(128, 0);
		expect(b).toBeCloseTo(128, 0);
	});

	it("black stays black regardless of factor", () => {
		expect(darkenColor(0x000000, 0)).toBe(0x000000);
		expect(darkenColor(0x000000, 0.5)).toBe(0x000000);
		expect(darkenColor(0x000000, 1)).toBe(0x000000);
	});

	it("preserves channel ratios for non-uniform colors", () => {
		const original = 0x804020; // r=128 g=64 b=32
		const result = darkenColor(original, 0.5);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBeCloseTo(64, 0);
		expect(g).toBeCloseTo(32, 0);
		expect(b).toBeCloseTo(16, 0);
	});
});

// ---------------------------------------------------------------------------
// lightenColor — extended boundary tests
// ---------------------------------------------------------------------------
describe("lightenColor (extended)", () => {
	it("factor=0 returns original color", () => {
		expect(lightenColor(0xff0000, 0)).toBe(0xff0000);
		expect(lightenColor(0x000000, 0)).toBe(0x000000);
	});

	it("factor=1 returns white (0xffffff)", () => {
		expect(lightenColor(0x000000, 1)).toBe(0xffffff);
		expect(lightenColor(0x804020, 1)).toBe(0xffffff);
	});

	it("white stays white regardless of factor", () => {
		expect(lightenColor(0xffffff, 0)).toBe(0xffffff);
		expect(lightenColor(0xffffff, 0.5)).toBe(0xffffff);
		expect(lightenColor(0xffffff, 1)).toBe(0xffffff);
	});

	it("factor=0.5 moves halfway toward white", () => {
		// 0x000000 + 0.5 * (255-0) = 128 each => 0x808080
		const result = lightenColor(0x000000, 0.5);
		const r = (result >> 16) & 0xff;
		expect(r).toBeCloseTo(128, 0);
	});

	it("result channels never exceed 255", () => {
		const result = lightenColor(0xfefefe, 0.9);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBeLessThanOrEqual(255);
		expect(g).toBeLessThanOrEqual(255);
		expect(b).toBeLessThanOrEqual(255);
	});
});

// ---------------------------------------------------------------------------
// blendColors — extended boundary tests
// ---------------------------------------------------------------------------
describe("blendColors (extended)", () => {
	it("t=0 returns color a", () => {
		expect(blendColors(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
	});

	it("t=1 returns color b", () => {
		expect(blendColors(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
	});

	it("t=0.5 returns midpoint", () => {
		const mid = blendColors(0x000000, 0xffffff, 0.5);
		const r = (mid >> 16) & 0xff;
		const g = (mid >> 8) & 0xff;
		const b = mid & 0xff;
		expect(r).toBeCloseTo(128, 0);
		expect(g).toBeCloseTo(128, 0);
		expect(b).toBeCloseTo(128, 0);
	});

	it("blending same color returns that color", () => {
		expect(blendColors(0x123456, 0x123456, 0.3)).toBe(0x123456);
		expect(blendColors(0x123456, 0x123456, 0.7)).toBe(0x123456);
	});

	it("blending with t=0.25 gives 25% b / 75% a", () => {
		// a=0 b=200 t=0.25 → 50 per channel
		const result = blendColors(0x000000, 0xc8c8c8, 0.25);
		const r = (result >> 16) & 0xff;
		expect(r).toBeCloseTo(50, 0);
	});
});

// ---------------------------------------------------------------------------
// desaturateColor — extended boundary tests
// ---------------------------------------------------------------------------
describe("desaturateColor (extended)", () => {
	it("factor=1 returns original color", () => {
		expect(desaturateColor(0xff0000, 1)).toBe(0xff0000);
		expect(desaturateColor(0x00ff00, 1)).toBe(0x00ff00);
	});

	it("factor=0 returns grayscale", () => {
		const gray = desaturateColor(0xff0000, 0);
		const r = (gray >> 16) & 0xff;
		const g = (gray >> 8) & 0xff;
		const b = gray & 0xff;
		// All channels should be equal (gray)
		expect(r).toBe(g);
		expect(g).toBe(b);
	});

	it("already gray color is unchanged at any factor", () => {
		const gray = 0x808080;
		expect(desaturateColor(gray, 0.5)).toBe(gray);
		expect(desaturateColor(gray, 0)).toBe(gray);
	});

	it("factor=0.5 partially desaturates", () => {
		const partial = desaturateColor(0xff0000, 0.5);
		const r = (partial >> 16) & 0xff;
		const g = (partial >> 8) & 0xff;
		// Red channel should be less than 255 but more than the gray value
		expect(r).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(0); // Some green from desaturation
	});

	it("factor > 1 returns original (guard clause)", () => {
		expect(desaturateColor(0xff0000, 1.5)).toBe(0xff0000);
	});
});

// ---------------------------------------------------------------------------
// hashStringToHue — deterministic hashing
// ---------------------------------------------------------------------------
describe("hashStringToHue (extended)", () => {
	it("returns value in [0, 360)", () => {
		for (const s of ["hello", "world", "", "a", "very long string with many characters"]) {
			const h = hashStringToHue(s);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(360);
		}
	});

	it("is deterministic (same input = same output)", () => {
		expect(hashStringToHue("test")).toBe(hashStringToHue("test"));
		expect(hashStringToHue("")).toBe(hashStringToHue(""));
	});

	it("different strings usually produce different hues", () => {
		const h1 = hashStringToHue("alice");
		const h2 = hashStringToHue("bob");
		const h3 = hashStringToHue("charlie");
		// At least 2 of 3 should differ
		const unique = new Set([h1, h2, h3]);
		expect(unique.size).toBeGreaterThanOrEqual(2);
	});

	it("empty string returns 0 (hash starts at 0)", () => {
		expect(hashStringToHue("")).toBe(0);
	});

	it("single character produces valid hue", () => {
		const h = hashStringToHue("x");
		expect(h).toBeGreaterThanOrEqual(0);
		expect(h).toBeLessThan(360);
	});
});

// ---------------------------------------------------------------------------
// truncateLabel — string truncation
// ---------------------------------------------------------------------------
describe("truncateLabel (extended)", () => {
	it("does not truncate when label fits", () => {
		expect(truncateLabel("short", 10)).toBe("short");
	});

	it("truncates and appends ellipsis when too long", () => {
		expect(truncateLabel("a long label here", 5)).toBe("a lon\u2026");
	});

	it("maxChars=0 means no truncation", () => {
		expect(truncateLabel("anything", 0)).toBe("anything");
	});

	it("negative maxChars means no truncation", () => {
		expect(truncateLabel("anything", -5)).toBe("anything");
	});

	it("exact length is not truncated", () => {
		expect(truncateLabel("12345", 5)).toBe("12345");
	});

	it("length maxChars+1 is truncated", () => {
		expect(truncateLabel("123456", 5)).toBe("12345\u2026");
	});

	it("maxChars=1 truncates to single char + ellipsis", () => {
		expect(truncateLabel("hello", 1)).toBe("h\u2026");
	});

	it("empty string returns empty string", () => {
		expect(truncateLabel("", 10)).toBe("");
	});

	it("unicode characters are handled by character count", () => {
		expect(truncateLabel("日本語テスト", 3)).toBe("日本語\u2026");
	});
});

// ---------------------------------------------------------------------------
// quickSelect — O(n) k-th smallest
// ---------------------------------------------------------------------------
describe("quickSelect (extended)", () => {
	it("returns single element for single-element array", () => {
		expect(quickSelect([42], 0)).toBe(42);
	});

	it("returns 0 for empty array", () => {
		expect(quickSelect([], 0)).toBe(0);
	});

	it("returns minimum for k=0", () => {
		const arr = [5, 3, 1, 4, 2];
		expect(quickSelect([...arr], 0)).toBe(1);
	});

	it("returns maximum for k=length-1", () => {
		const arr = [5, 3, 1, 4, 2];
		expect(quickSelect([...arr], 4)).toBe(5);
	});

	it("returns median for k=length/2", () => {
		const arr = [5, 3, 1, 4, 2];
		expect(quickSelect([...arr], 2)).toBe(3);
	});

	it("handles already sorted array", () => {
		expect(quickSelect([1, 2, 3, 4, 5], 2)).toBe(3);
	});

	it("handles reverse sorted array", () => {
		expect(quickSelect([5, 4, 3, 2, 1], 2)).toBe(3);
	});

	it("handles duplicate values", () => {
		expect(quickSelect([3, 1, 3, 1, 3], 2)).toBe(3);
		expect(quickSelect([3, 1, 3, 1, 3], 0)).toBe(1);
	});

	it("handles all same values", () => {
		expect(quickSelect([7, 7, 7, 7], 0)).toBe(7);
		expect(quickSelect([7, 7, 7, 7], 3)).toBe(7);
	});

	it("handles negative values", () => {
		expect(quickSelect([-5, -3, -1, -4, -2], 0)).toBe(-5);
		expect(quickSelect([-5, -3, -1, -4, -2], 4)).toBe(-1);
	});

	it("returns 0 for out-of-bounds k", () => {
		expect(quickSelect([1, 2, 3], 5)).toBe(0);
		expect(quickSelect([1, 2, 3], -1)).toBe(0);
	});

	it("handles two-element array", () => {
		expect(quickSelect([10, 5], 0)).toBe(5);
		expect(quickSelect([10, 5], 1)).toBe(10);
	});
});

// ---------------------------------------------------------------------------
// screenToWorld — coordinate conversion
// ---------------------------------------------------------------------------
describe("screenToWorld (extended)", () => {
	it("converts screen pixels to world units", () => {
		expect(screenToWorld(100, 2, 0)).toBe(50);
	});

	it("respects floor when result would be smaller", () => {
		expect(screenToWorld(1, 10, 5)).toBe(5); // 1/10 = 0.1, floor = 5
	});

	it("handles ws=0 by returning floor", () => {
		expect(screenToWorld(100, 0, 10)).toBe(10);
	});

	it("handles negative ws by returning floor", () => {
		expect(screenToWorld(100, -1, 5)).toBe(5);
	});

	it("ws=1 returns screenPx directly (if above floor)", () => {
		expect(screenToWorld(50, 1, 0)).toBe(50);
	});

	it("floor=0 allows any positive result", () => {
		expect(screenToWorld(1, 100, 0)).toBeCloseTo(0.01, 5);
	});

	it("large ws gives small world units", () => {
		expect(screenToWorld(10, 1000, 0)).toBeCloseTo(0.01, 5);
	});
});

// ---------------------------------------------------------------------------
// computeZoomFadeAlpha — zoom-dependent fade
// ---------------------------------------------------------------------------
describe("computeZoomFadeAlpha (extended)", () => {
	it("returns 1 at zoom >= fadeStart (default 0.7)", () => {
		expect(computeZoomFadeAlpha(0.7)).toBe(1);
		expect(computeZoomFadeAlpha(1.0)).toBe(1);
		expect(computeZoomFadeAlpha(5.0)).toBe(1);
	});

	it("returns fadeFloor at zoom <= fadeEnd (default 0.15)", () => {
		expect(computeZoomFadeAlpha(0.15)).toBeCloseTo(0.03, 5);
		expect(computeZoomFadeAlpha(0.01)).toBeCloseTo(0.03, 5);
		expect(computeZoomFadeAlpha(0)).toBeCloseTo(0.03, 5);
	});

	it("returns intermediate value between fadeEnd and fadeStart", () => {
		const alpha = computeZoomFadeAlpha(0.425); // midpoint of 0.15..0.7
		expect(alpha).toBeGreaterThan(0.03);
		expect(alpha).toBeLessThan(1);
		expect(alpha).toBeCloseTo(0.515, 1); // roughly midpoint
	});

	it("is monotonically increasing in the transition range", () => {
		let prev = 0;
		for (let z = 0.15; z <= 0.7; z += 0.01) {
			const a = computeZoomFadeAlpha(z);
			expect(a).toBeGreaterThanOrEqual(prev);
			prev = a;
		}
	});

	it("custom fadeStart/fadeEnd/fadeFloor", () => {
		// Custom: fadeStart=2, fadeEnd=0.5, fadeFloor=0.1
		expect(computeZoomFadeAlpha(3, 2, 0.5, 0.1)).toBe(1);
		expect(computeZoomFadeAlpha(0.1, 2, 0.5, 0.1)).toBeCloseTo(0.1, 5);
		const mid = computeZoomFadeAlpha(1.25, 2, 0.5, 0.1);
		expect(mid).toBeGreaterThan(0.1);
		expect(mid).toBeLessThan(1);
	});
});

// ---------------------------------------------------------------------------
// computeLodLevel — level of detail determination (returns 0-5)
// ---------------------------------------------------------------------------
describe("computeLodLevel (extended)", () => {
	const thresholds = {
		cardLODExtremePx: 1.5,
		cardLODMidLabelPx: 3.0,
		cardLODNormalPx: 4.0,
		cardLODCompactPx: 8.0,
		cardLODFullCardPx: 15.0,
	};

	it("returns 0 (dot) at very small screenR", () => {
		expect(computeLodLevel(0.5, thresholds)).toBe(0);
	});

	it("returns 1 (extreme) just above dot threshold", () => {
		expect(computeLodLevel(2.0, thresholds)).toBe(1);
	});

	it("returns 2 (midLabel) at mid range", () => {
		expect(computeLodLevel(3.5, thresholds)).toBe(2);
	});

	it("returns 3 (normal) at normal range", () => {
		expect(computeLodLevel(5.0, thresholds)).toBe(3);
	});

	it("returns 4 (compact) at compact range", () => {
		expect(computeLodLevel(10.0, thresholds)).toBe(4);
	});

	it("returns 5 (fullCard) at large screenR", () => {
		expect(computeLodLevel(20.0, thresholds)).toBe(5);
	});

	it("boundary: exactly at extreme threshold returns 1", () => {
		expect(computeLodLevel(1.5, thresholds)).toBe(1);
	});

	it("boundary: exactly at midLabel threshold returns 2", () => {
		expect(computeLodLevel(3.0, thresholds)).toBe(2);
	});

	it("boundary: exactly at normal threshold returns 3", () => {
		expect(computeLodLevel(4.0, thresholds)).toBe(3);
	});

	it("boundary: exactly at compact threshold returns 4", () => {
		expect(computeLodLevel(8.0, thresholds)).toBe(4);
	});

	it("boundary: exactly at fullCard threshold returns 5", () => {
		expect(computeLodLevel(15.0, thresholds)).toBe(5);
	});

	it("returns 0 for screenR=0", () => {
		expect(computeLodLevel(0, thresholds)).toBe(0);
	});

	it("negative screenR returns 0", () => {
		expect(computeLodLevel(-5, thresholds)).toBe(0);
	});
});
