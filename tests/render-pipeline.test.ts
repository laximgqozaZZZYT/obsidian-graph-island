import { describe, it, expect } from "vitest";
import { computeLodLevel, darkenColor } from "../src/views/RenderPipeline";

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
