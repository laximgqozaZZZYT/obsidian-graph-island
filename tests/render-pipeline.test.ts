import { describe, it, expect } from "vitest";
import {
  computeLodLevel, darkenColor,
  lightenColor, blendColors, desaturateColor, hashStringToHue,
  truncateLabel, screenToWorld, computeZoomFadeAlpha,
} from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// Default LOD thresholds (from DEFAULT_RENDER_THRESHOLDS in types.ts)
// ---------------------------------------------------------------------------
const defaultThresholds = {
  cardLODExtremePx: 1.5,
  cardLODMidLabelPx: 3.0,
  cardLODNormalPx: 4.0,
  cardLODCompactPx: 8.0,
  cardLODFullCardPx: 15.0,
};

// ---------------------------------------------------------------------------
// computeLodLevel — zoom-dependent level of detail
// ---------------------------------------------------------------------------
describe("computeLodLevel", () => {
  it("returns 0 (extreme) for very small screen px", () => {
    expect(computeLodLevel(0.5, defaultThresholds)).toBe(0);
    expect(computeLodLevel(1.0, defaultThresholds)).toBe(0);
  });

  it("returns 1 (mid-label) between extreme and mid-label thresholds", () => {
    expect(computeLodLevel(2.0, defaultThresholds)).toBe(1);
  });

  it("returns 2 (normal) between mid-label and normal thresholds", () => {
    expect(computeLodLevel(3.5, defaultThresholds)).toBe(2);
  });

  it("returns 3 (compact) between normal and compact thresholds", () => {
    expect(computeLodLevel(6.0, defaultThresholds)).toBe(3);
  });

  it("returns 4 (full card entry) between compact and full-card thresholds", () => {
    expect(computeLodLevel(10.0, defaultThresholds)).toBe(4);
  });

  it("returns 5 (full card) above full-card threshold", () => {
    expect(computeLodLevel(20.0, defaultThresholds)).toBe(5);
    expect(computeLodLevel(100.0, defaultThresholds)).toBe(5);
  });

  it("returns correct level at exact boundary values", () => {
    // At exact threshold, value is NOT less than threshold → next tier
    expect(computeLodLevel(1.5, defaultThresholds)).toBe(1); // exactly at extreme → tier 1
    expect(computeLodLevel(3.0, defaultThresholds)).toBe(2); // exactly at midLabel → tier 2
    expect(computeLodLevel(4.0, defaultThresholds)).toBe(3); // exactly at normal → tier 3
    expect(computeLodLevel(8.0, defaultThresholds)).toBe(4); // exactly at compact → tier 4
    expect(computeLodLevel(15.0, defaultThresholds)).toBe(5); // exactly at fullCard → tier 5
  });

  it("level increases monotonically with screen px", () => {
    const levels = [0.5, 2.0, 3.5, 6.0, 10.0, 20.0].map(
      px => computeLodLevel(px, defaultThresholds)
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });

  it("handles custom thresholds", () => {
    const custom = {
      cardLODExtremePx: 5,
      cardLODMidLabelPx: 10,
      cardLODNormalPx: 20,
      cardLODCompactPx: 40,
      cardLODFullCardPx: 80,
    };
    expect(computeLodLevel(3, custom)).toBe(0);
    expect(computeLodLevel(15, custom)).toBe(2);
    expect(computeLodLevel(100, custom)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// darkenColor — color manipulation
// ---------------------------------------------------------------------------
describe("darkenColor", () => {
  it("factor 0 returns original color", () => {
    expect(darkenColor(0xff8040, 0)).toBe(0xff8040);
  });

  it("factor 1 returns black", () => {
    expect(darkenColor(0xff8040, 1)).toBe(0x000000);
  });

  it("factor 0.5 halves each channel", () => {
    // 0xff0000 → r=255, g=0, b=0 → r=128, g=0, b=0 → 0x800000
    expect(darkenColor(0xff0000, 0.5)).toBe(0x800000);
  });

  it("handles white", () => {
    const result = darkenColor(0xffffff, 0.5);
    // Each channel: 255 * 0.5 = 128 → 0x808080
    expect(result).toBe(0x808080);
  });

  it("handles black (already darkened)", () => {
    expect(darkenColor(0x000000, 0.5)).toBe(0x000000);
  });
});

// ---------------------------------------------------------------------------
// lightenColor — mix toward white
// ---------------------------------------------------------------------------
describe("lightenColor", () => {
  it("factor 0 returns original color", () => {
    expect(lightenColor(0xff8040, 0)).toBe(0xff8040);
  });

  it("factor 1 returns white", () => {
    expect(lightenColor(0x000000, 1)).toBe(0xffffff);
    expect(lightenColor(0xff0000, 1)).toBe(0xffffff);
  });

  it("factor 0.5 moves halfway toward white", () => {
    // 0x000000 → each channel: 0 + (255 - 0) * 0.5 = 128
    expect(lightenColor(0x000000, 0.5)).toBe(0x808080);
  });

  it("already white stays white", () => {
    expect(lightenColor(0xffffff, 0.5)).toBe(0xffffff);
  });
});

// ---------------------------------------------------------------------------
// blendColors — linear interpolation between two colors
// ---------------------------------------------------------------------------
describe("blendColors", () => {
  it("t=0 returns first color", () => {
    expect(blendColors(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
  });

  it("t=1 returns second color", () => {
    expect(blendColors(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it("t=0.5 blends to midpoint", () => {
    // Red + Blue: (128, 0, 128)
    expect(blendColors(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });

  it("blending same color returns that color", () => {
    expect(blendColors(0x336699, 0x336699, 0.5)).toBe(0x336699);
  });
});

// ---------------------------------------------------------------------------
// desaturateColor — reduce saturation toward gray
// ---------------------------------------------------------------------------
describe("desaturateColor", () => {
  it("factor >= 1 returns original", () => {
    expect(desaturateColor(0xff0000, 1)).toBe(0xff0000);
    expect(desaturateColor(0xff0000, 2)).toBe(0xff0000);
  });

  it("factor 0 returns grayscale", () => {
    const result = desaturateColor(0xff0000, 0);
    // Pure red → luminance gray: all channels equal
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("already gray stays gray", () => {
    const gray = 0x808080;
    expect(desaturateColor(gray, 0)).toBe(gray);
  });
});

// ---------------------------------------------------------------------------
// hashStringToHue — deterministic string → hue
// ---------------------------------------------------------------------------
describe("hashStringToHue", () => {
  it("returns value in [0, 360) range", () => {
    const hues = ["hello", "world", "test", "日本語", ""].map(hashStringToHue);
    for (const h of hues) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("same string returns same hue (deterministic)", () => {
    expect(hashStringToHue("alpha")).toBe(hashStringToHue("alpha"));
  });

  it("different strings usually return different hues", () => {
    const a = hashStringToHue("character");
    const b = hashStringToHue("location");
    expect(a).not.toBe(b);
  });

  it("empty string returns 0", () => {
    expect(hashStringToHue("")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// truncateLabel — label text truncation with ellipsis
// ---------------------------------------------------------------------------
describe("truncateLabel", () => {
  it("returns full label when maxChars is 0 (disabled)", () => {
    expect(truncateLabel("Hello World", 0)).toBe("Hello World");
  });

  it("returns full label when maxChars is negative", () => {
    expect(truncateLabel("Hello World", -5)).toBe("Hello World");
  });

  it("returns full label when under limit", () => {
    expect(truncateLabel("short", 10)).toBe("short");
  });

  it("truncates and adds ellipsis when over limit", () => {
    expect(truncateLabel("Hello World", 5)).toBe("Hello…");
  });

  it("returns exactly maxChars + ellipsis", () => {
    const result = truncateLabel("abcdefghij", 3);
    expect(result).toBe("abc…");
    expect(result.length).toBe(4); // 3 chars + ellipsis
  });

  it("handles empty label", () => {
    expect(truncateLabel("", 5)).toBe("");
  });

  it("handles label length exactly at limit", () => {
    expect(truncateLabel("12345", 5)).toBe("12345"); // not truncated
  });

  it("handles label length one over limit", () => {
    expect(truncateLabel("123456", 5)).toBe("12345…");
  });
});

// ---------------------------------------------------------------------------
// screenToWorld — screen-pixel to world-unit conversion with floor
// ---------------------------------------------------------------------------
describe("screenToWorld", () => {
  it("returns screenPx / ws when result exceeds floor", () => {
    // 6px / 0.5 scale = 12 world units, floor=3 → 12
    expect(screenToWorld(6, 0.5, 3)).toBe(12);
  });

  it("returns floor when screenPx / ws is below floor", () => {
    // 2px / 2.0 scale = 1 world unit, floor=3 → 3
    expect(screenToWorld(2, 2.0, 3)).toBe(3);
  });

  it("returns floor when ws is 0 (division guard)", () => {
    expect(screenToWorld(10, 0, 5)).toBe(5);
  });

  it("returns floor when ws is negative", () => {
    expect(screenToWorld(10, -1, 5)).toBe(5);
  });

  it("returns exact floor when screenPx/ws equals floor", () => {
    // 6px / 2.0 = 3, floor=3 → 3
    expect(screenToWorld(6, 2.0, 3)).toBe(3);
  });

  it("scales inversely with worldScale at zoom-out", () => {
    const a = screenToWorld(4, 0.1, 1); // 40
    const b = screenToWorld(4, 1.0, 1); // 4
    expect(a).toBeGreaterThan(b);
  });

  it("at ws=1 returns max of screenPx and floor", () => {
    expect(screenToWorld(10, 1, 3)).toBe(10);
    expect(screenToWorld(2, 1, 3)).toBe(3);
  });

  it("handles fractional screenPx", () => {
    expect(screenToWorld(1.5, 0.5, 1)).toBe(3);
  });
});

// ===========================================================================
// computeZoomFadeAlpha — zoom-out fade for nodes/intra-group cables
// ===========================================================================
describe("computeZoomFadeAlpha", () => {
  it("returns 1 at zoom >= fadeStart (0.7)", () => {
    expect(computeZoomFadeAlpha(0.7)).toBe(1);
    expect(computeZoomFadeAlpha(1.0)).toBe(1);
    expect(computeZoomFadeAlpha(5.0)).toBe(1);
  });

  it("returns fadeFloor at zoom <= fadeEnd", () => {
    expect(computeZoomFadeAlpha(0.15)).toBe(0.03);
    expect(computeZoomFadeAlpha(0.1)).toBe(0.03);
    expect(computeZoomFadeAlpha(0.01)).toBe(0.03);
  });

  it("returns intermediate values between fadeEnd and fadeStart", () => {
    const mid = computeZoomFadeAlpha(0.425); // midpoint of [0.15, 0.7]
    expect(mid).toBeGreaterThan(0.03);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeCloseTo(0.515, 1);
  });

  it("is monotonically increasing", () => {
    let prev = computeZoomFadeAlpha(0);
    for (let z = 0.01; z <= 1; z += 0.01) {
      const cur = computeZoomFadeAlpha(z);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it("respects custom fadeStart", () => {
    expect(computeZoomFadeAlpha(0.8, 1.0)).toBeLessThan(1);
    expect(computeZoomFadeAlpha(1.0, 1.0)).toBe(1);
  });

  it("respects custom fadeEnd", () => {
    expect(computeZoomFadeAlpha(0.3, 0.5, 0.3)).toBe(0.03);
    expect(computeZoomFadeAlpha(0.31, 0.5, 0.3)).toBeGreaterThan(0.03);
  });

  it("respects custom fadeFloor", () => {
    expect(computeZoomFadeAlpha(0, 0.5, 0.15, 0.2)).toBe(0.2);
  });

  it("fades individual nodes more at mid-zoom than default", () => {
    // At zoom 0.5 (just below new fadeStart 0.7), fade should be active
    expect(computeZoomFadeAlpha(0.5)).toBeLessThan(1);
  });
});
