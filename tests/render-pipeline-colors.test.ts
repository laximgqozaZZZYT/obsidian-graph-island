/**
 * RenderPipeline — color manipulation, hash, truncation, zoom boundary tests
 */
import { describe, it, expect } from "vitest";
import {
	darkenColor,
	lightenColor,
	blendColors,
	desaturateColor,
	hashStringToHue,
	truncateLabel,
	computeZoomFadeAlpha,
	computeDensityScale,
	computeDensityMinDist,
	screenToWorld,
} from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// darkenColor — boundary cases
// ---------------------------------------------------------------------------
describe("darkenColor boundary", () => {
	it("factor 0 returns original", () => {
		expect(darkenColor(0xff8844, 0)).toBe(0xff8844);
	});

	it("factor 1 returns black", () => {
		expect(darkenColor(0xffffff, 1)).toBe(0x000000);
	});

	it("factor 0.5 halves each channel", () => {
		const result = darkenColor(0xff0000, 0.5);
		// R=255 → 128 (0x80), G=0, B=0
		const r = (result >> 16) & 0xff;
		expect(r).toBeCloseTo(128, -1);
	});

	it("darkening black stays black", () => {
		expect(darkenColor(0x000000, 0.5)).toBe(0x000000);
	});

	it("darkening pure white by 0.3", () => {
		const result = darkenColor(0xffffff, 0.3);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBe(g);
		expect(g).toBe(b);
		// 255 * 0.7 ≈ 179
		expect(r).toBeCloseTo(179, -1);
	});
});

// ---------------------------------------------------------------------------
// lightenColor — boundary cases
// ---------------------------------------------------------------------------
describe("lightenColor boundary", () => {
	it("factor 0 returns original", () => {
		expect(lightenColor(0x336699, 0)).toBe(0x336699);
	});

	it("factor 1 returns white", () => {
		expect(lightenColor(0x000000, 1)).toBe(0xffffff);
	});

	it("lightening white stays white", () => {
		expect(lightenColor(0xffffff, 0.5)).toBe(0xffffff);
	});

	it("factor 0.5 moves halfway to white", () => {
		const result = lightenColor(0x000000, 0.5);
		const r = (result >> 16) & 0xff;
		expect(r).toBeCloseTo(128, -1);
	});
});

// ---------------------------------------------------------------------------
// blendColors — interpolation
// ---------------------------------------------------------------------------
describe("blendColors boundary", () => {
	it("t=0 returns first color", () => {
		expect(blendColors(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
	});

	it("t=1 returns second color", () => {
		expect(blendColors(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
	});

	it("t=0.5 blends to midpoint", () => {
		const result = blendColors(0x000000, 0xffffff, 0.5);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		// each channel should be ~128
		expect(r).toBeCloseTo(128, -1);
		expect(g).toBeCloseTo(128, -1);
		expect(b).toBeCloseTo(128, -1);
	});

	it("blending same colors returns that color", () => {
		expect(blendColors(0xaabbcc, 0xaabbcc, 0.5)).toBe(0xaabbcc);
	});
});

// ---------------------------------------------------------------------------
// desaturateColor — gray conversion
// ---------------------------------------------------------------------------
describe("desaturateColor boundary", () => {
	it("factor >= 1 returns original color", () => {
		expect(desaturateColor(0xff0000, 1)).toBe(0xff0000);
		expect(desaturateColor(0xff0000, 2)).toBe(0xff0000);
	});

	it("factor 0 returns pure gray (same luminance)", () => {
		const result = desaturateColor(0xff0000, 0);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBe(g);
		expect(g).toBe(b);
	});

	it("desaturating gray stays gray", () => {
		const gray = 0x808080;
		const result = desaturateColor(gray, 0);
		// All channels should be equal
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		const b = result & 0xff;
		expect(r).toBe(g);
		expect(g).toBe(b);
	});

	it("partial desaturation is between original and gray", () => {
		const result = desaturateColor(0xff0000, 0.5);
		const r = (result >> 16) & 0xff;
		const g = (result >> 8) & 0xff;
		// Red channel should be partially reduced
		expect(r).toBeGreaterThan(g);
		// G and B should be partially increased from 0
		expect(g).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// hashStringToHue — deterministic hash
// ---------------------------------------------------------------------------
describe("hashStringToHue boundary", () => {
	it("returns same hue for same string", () => {
		expect(hashStringToHue("hello")).toBe(hashStringToHue("hello"));
	});

	it("returns value in [0, 360)", () => {
		for (const s of ["abc", "", "日本語", "very-long-string-with-lots-of-characters"]) {
			const hue = hashStringToHue(s);
			expect(hue).toBeGreaterThanOrEqual(0);
			expect(hue).toBeLessThan(360);
		}
	});

	it("different strings produce different hues (with high probability)", () => {
		const hues = new Set(["alpha", "beta", "gamma", "delta", "epsilon"].map(hashStringToHue));
		expect(hues.size).toBeGreaterThanOrEqual(3);
	});

	it("empty string returns valid hue", () => {
		const hue = hashStringToHue("");
		expect(hue).toBeGreaterThanOrEqual(0);
		expect(hue).toBeLessThan(360);
	});
});

// ---------------------------------------------------------------------------
// truncateLabel — boundary cases
// ---------------------------------------------------------------------------
describe("truncateLabel boundary", () => {
	it("returns original when under maxChars", () => {
		expect(truncateLabel("hello", 10)).toBe("hello");
	});

	it("truncates and adds ellipsis when over maxChars", () => {
		expect(truncateLabel("abcdefghij", 5)).toBe("abcde…");
	});

	it("does not truncate at exact length", () => {
		expect(truncateLabel("abcde", 5)).toBe("abcde");
	});

	it("no truncation when maxChars is 0", () => {
		expect(truncateLabel("hello", 0)).toBe("hello");
	});

	it("no truncation when maxChars is negative", () => {
		expect(truncateLabel("hello", -5)).toBe("hello");
	});

	it("empty string returns empty", () => {
		expect(truncateLabel("", 10)).toBe("");
	});

	it("single char with maxChars 1", () => {
		expect(truncateLabel("ab", 1)).toBe("a…");
	});
});

// ---------------------------------------------------------------------------
// computeZoomFadeAlpha — boundary conditions
// ---------------------------------------------------------------------------
describe("computeZoomFadeAlpha boundary", () => {
	it("returns 1.0 at zoom above fadeStart", () => {
		expect(computeZoomFadeAlpha(1.0)).toBe(1);
		expect(computeZoomFadeAlpha(0.8)).toBe(1);
	});

	it("returns fadeFloor at zoom at or below fadeEnd", () => {
		expect(computeZoomFadeAlpha(0.15)).toBe(0.03);
		expect(computeZoomFadeAlpha(0.0)).toBe(0.03);
	});

	it("linearly interpolates between fadeEnd and fadeStart", () => {
		const mid = computeZoomFadeAlpha(0.425); // midpoint of 0.15..0.7
		expect(mid).toBeGreaterThan(0.03);
		expect(mid).toBeLessThan(1.0);
		expect(mid).toBeCloseTo(0.515, 1);
	});

	it("respects custom fadeStart and fadeEnd", () => {
		expect(computeZoomFadeAlpha(2.0, 1.0, 0.5, 0.1)).toBe(1);
		expect(computeZoomFadeAlpha(0.3, 1.0, 0.5, 0.1)).toBe(0.1);
	});
});

// ---------------------------------------------------------------------------
// computeDensityScale — label density scaling
// ---------------------------------------------------------------------------
describe("computeDensityScale boundary", () => {
	it("returns >1 when zoom is below threshold", () => {
		expect(computeDensityScale(0.1, 0.5)).toBeGreaterThan(1);
	});

	it("returns ~1 at exact threshold", () => {
		expect(computeDensityScale(0.5, 0.5)).toBe(1);
	});

	it("returns <1 above threshold but minimum 0.3", () => {
		const scale = computeDensityScale(1.0, 0.5);
		expect(scale).toBeLessThanOrEqual(1);
		expect(scale).toBeGreaterThanOrEqual(0.3);
	});

	it("does not go below 0.3", () => {
		const scale = computeDensityScale(10.0, 0.5);
		expect(scale).toBe(0.3);
	});
});

// ---------------------------------------------------------------------------
// computeDensityMinDist — capped distance
// ---------------------------------------------------------------------------
describe("computeDensityMinDist boundary", () => {
	it("returns baseDist when zoom equals threshold", () => {
		expect(computeDensityMinDist(50, 200, 0.5, 0.5)).toBe(50);
	});

	it("caps at maxDist", () => {
		const result = computeDensityMinDist(50, 80, 0.01, 0.5);
		expect(result).toBeLessThanOrEqual(80);
	});

	it("returns baseDist scaled down above threshold", () => {
		const result = computeDensityMinDist(100, 200, 1.0, 0.5);
		expect(result).toBeLessThan(100);
	});
});

// ---------------------------------------------------------------------------
// screenToWorld — pixel-to-world conversion
// ---------------------------------------------------------------------------
describe("screenToWorld boundary", () => {
	it("returns floor when ws is 0", () => {
		expect(screenToWorld(100, 0, 5)).toBe(5);
	});

	it("returns floor when result would be below floor", () => {
		expect(screenToWorld(1, 100, 5)).toBe(5);
	});

	it("computes correct value above floor", () => {
		expect(screenToWorld(100, 2, 1)).toBe(50);
	});

	it("returns floor when negative ws", () => {
		expect(screenToWorld(100, -1, 5)).toBe(5);
	});
});
