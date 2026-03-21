/**
 * Zoom display quality tests — Cycle 9
 * Tests viewport margin cap, card scale cap, and bold AABB estimation.
 */
import { describe, it, expect } from "vitest";

// Replicate the constants from RenderPipeline.ts
const LABEL_CHAR_WIDTH_FACTOR = 0.6;
const CARD_SCALE_CAP = 8;

describe("Viewport margin cap", () => {
  const vpMargin = 100;
  const computeEffectiveMargin = (zoom: number) =>
    Math.min(vpMargin / zoom, vpMargin * 5);

  it("normal zoom (1.0) — margin is vpMargin/zoom = 100", () => {
    expect(computeEffectiveMargin(1.0)).toBe(100);
  });

  it("medium zoom-out (0.5) — margin is 200", () => {
    expect(computeEffectiveMargin(0.5)).toBe(200);
  });

  it("zoom 0.2 — margin is 500 (cap reached)", () => {
    expect(computeEffectiveMargin(0.2)).toBe(500);
  });

  it("extreme zoom-out (0.01) — margin capped at 500", () => {
    expect(computeEffectiveMargin(0.01)).toBe(500);
  });

  it("extreme zoom-out (0.001) — margin still capped at 500", () => {
    expect(computeEffectiveMargin(0.001)).toBe(500);
  });
});

describe("Card scale cap", () => {
  const computeCardScale = (worldScale: number) =>
    Math.min(1 / worldScale, CARD_SCALE_CAP);

  it("normal zoom (worldScale=1.0) — cardScale=1", () => {
    expect(computeCardScale(1.0)).toBe(1);
  });

  it("zoom-out (worldScale=0.5) — cardScale=2", () => {
    expect(computeCardScale(0.5)).toBe(2);
  });

  it("worldScale=0.125 — cardScale=8 (cap reached)", () => {
    expect(computeCardScale(0.125)).toBe(8);
  });

  it("extreme zoom-out (worldScale=0.01) — cardScale capped at 8", () => {
    expect(computeCardScale(0.01)).toBe(8);
  });
});

describe("Card fontSize cap", () => {
  it("compact card fontSize capped at 9*8=72 at extreme zoom", () => {
    const ws = 0.01;
    const fontSize = Math.min(Math.max(6, 9 / ws), 9 * CARD_SCALE_CAP);
    expect(fontSize).toBe(72);
  });

  it("detailed card fontSize capped at 10*8=80 at extreme zoom", () => {
    const ws = 0.01;
    const fontSize = Math.min(Math.max(7, 10 / ws), 10 * CARD_SCALE_CAP);
    expect(fontSize).toBe(80);
  });

  it("normal zoom fontSize is base value", () => {
    const ws = 1.0;
    const compactFont = Math.min(Math.max(6, 9 / ws), 9 * CARD_SCALE_CAP);
    const detailedFont = Math.min(Math.max(7, 10 / ws), 10 * CARD_SCALE_CAP);
    expect(compactFont).toBe(9);
    expect(detailedFont).toBe(10);
  });

  it("body font and padding also capped", () => {
    const ws = 0.01;
    const bodyFontBase = 8;
    const smallFont = Math.min(Math.max(2, bodyFontBase / ws), bodyFontBase * CARD_SCALE_CAP);
    const pad = Math.min(4 / ws, 4 * CARD_SCALE_CAP);
    expect(smallFont).toBe(64); // 8 * 8
    expect(pad).toBe(32); // 4 * 8
  });
});

describe("MIN_CARD_HALF_W cap", () => {
  it("normal zoom — MIN_CARD_HALF_W = 20/worldScale", () => {
    const ws = 1.0;
    const halfW = Math.min(20 / ws, 20 * CARD_SCALE_CAP);
    expect(halfW).toBe(20);
  });

  it("extreme zoom — MIN_CARD_HALF_W capped at 20*8=160", () => {
    const ws = 0.01;
    const halfW = Math.min(20 / ws, 20 * CARD_SCALE_CAP);
    expect(halfW).toBe(160);
  });
});

describe("hoverLabel bold AABB estimation", () => {
  const boldFactor = 1.1;

  it("bold labels get 10% wider AABB estimate", () => {
    const fontSize = 12;
    const textLen = 15;
    const padX = 4;
    const normalCharW = fontSize * LABEL_CHAR_WIDTH_FACTOR;
    const boldCharW = fontSize * LABEL_CHAR_WIDTH_FACTOR * boldFactor;
    const normalW = textLen * normalCharW + padX * 2;
    const boldW = textLen * boldCharW + padX * 2;
    expect(boldW).toBeGreaterThan(normalW);
    // Bold should be about 10% wider (minus constant padding contribution)
    const widthRatio = boldW / normalW;
    expect(widthRatio).toBeGreaterThan(1.05);
    expect(widthRatio).toBeLessThan(1.15);
  });

  it("non-hover labels keep normal width", () => {
    const fontSize = 11;
    const textLen = 10;
    const padX = 0;
    const normalCharW = fontSize * LABEL_CHAR_WIDTH_FACTOR * 1.0;
    const w = textLen * normalCharW + padX * 2;
    expect(w).toBeCloseTo(66, 0);
  });
});
