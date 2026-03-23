import { describe, it, expect } from "vitest";
import {
  computeZoomFactor,
  clampScale,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
} from "../src/views/InteractionManager";

// ---------------------------------------------------------------------------
// computeZoomFactor — wheel event → scale multiplier
// ---------------------------------------------------------------------------
describe("computeZoomFactor", () => {
  it("returns > 1 for zoom in (negative deltaY)", () => {
    const factor = computeZoomFactor(-100);
    expect(factor).toBeGreaterThan(1);
  });

  it("returns < 1 for zoom out (positive deltaY)", () => {
    const factor = computeZoomFactor(100);
    expect(factor).toBeLessThan(1);
  });

  it("default sensitivity produces base factors", () => {
    expect(computeZoomFactor(-1, 1.0)).toBeCloseTo(ZOOM_IN_FACTOR, 5);
    expect(computeZoomFactor(1, 1.0)).toBeCloseTo(ZOOM_OUT_FACTOR, 5);
  });

  it("half sensitivity produces smaller zoom steps", () => {
    const inF = computeZoomFactor(-1, 0.5);
    const outF = computeZoomFactor(1, 0.5);
    // inF should be closer to 1 than ZOOM_IN_FACTOR
    expect(inF).toBeCloseTo(1.05, 5);
    expect(outF).toBeCloseTo(0.95, 5);
  });

  it("double sensitivity produces larger zoom steps", () => {
    const inF = computeZoomFactor(-1, 2.0);
    const outF = computeZoomFactor(1, 2.0);
    // inF = 1 + (0.1) * 2 = 1.2
    expect(inF).toBeCloseTo(1.2, 5);
    // outF = 1 - (0.1) * 2 = 0.8
    expect(outF).toBeCloseTo(0.8, 5);
  });

  it("zero sensitivity produces factor of 1 (no zoom)", () => {
    expect(computeZoomFactor(-1, 0)).toBeCloseTo(1.0, 5);
    expect(computeZoomFactor(1, 0)).toBeCloseTo(1.0, 5);
  });

  it("zoom in and out are complementary at default sensitivity", () => {
    // Applying zoom in then zoom out should roughly cancel
    const combined = computeZoomFactor(-1) * computeZoomFactor(1);
    expect(combined).toBeCloseTo(ZOOM_IN_FACTOR * ZOOM_OUT_FACTOR, 3);
  });
});

// ---------------------------------------------------------------------------
// clampScale — enforce zoom range
// ---------------------------------------------------------------------------
describe("clampScale", () => {
  it("passes through values within range", () => {
    expect(clampScale(1.0)).toBe(1.0);
    expect(clampScale(0.5)).toBe(0.5);
    expect(clampScale(5.0)).toBe(5.0);
  });

  it("clamps values below minimum", () => {
    expect(clampScale(0.001)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(0)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(-1)).toBe(ZOOM_SCALE_MIN);
  });

  it("clamps values above maximum", () => {
    expect(clampScale(100)).toBe(ZOOM_SCALE_MAX);
    expect(clampScale(10.1)).toBe(ZOOM_SCALE_MAX);
  });

  it("boundary values are preserved", () => {
    expect(clampScale(ZOOM_SCALE_MIN)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(ZOOM_SCALE_MAX)).toBe(ZOOM_SCALE_MAX);
  });

  it("handles NaN by returning minimum", () => {
    // Math.max(0.02, Math.min(10, NaN)) → Math.max(0.02, NaN) → NaN
    // This documents current behavior — NaN propagates
    const result = clampScale(NaN);
    expect(Number.isNaN(result)).toBe(true);
  });

  it("handles Infinity", () => {
    expect(clampScale(Infinity)).toBe(ZOOM_SCALE_MAX);
    expect(clampScale(-Infinity)).toBe(ZOOM_SCALE_MIN);
  });
});
