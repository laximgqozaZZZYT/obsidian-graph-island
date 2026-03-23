import { describe, it, expect } from "vitest";
import { DEFAULT_RENDER_THRESHOLDS, mergeRenderThresholds } from "../src/types";

describe("mergeRenderThresholds", () => {
  it("returns all fields from DEFAULT when no user overrides", () => {
    const rt = mergeRenderThresholds();
    // Spot-check key fields
    expect(rt.edgeMinZoom).toBe(0);
    expect(rt.edgeZoomFadeThreshold).toBe(0.5);
    expect(rt.labelOverlapCulling).toBe(true);
    expect(rt.cardBodyMaxLines).toBe(3);
    expect(rt.gradientNodeCount).toBe(500);
    expect(rt.labelCullCooldown).toBe(6);
  });

  it("returns all fields from DEFAULT when user is undefined", () => {
    const rt = mergeRenderThresholds(undefined);
    expect(rt.edgeFadeMinAlpha).toBe(0.1);
    expect(rt.showRoadNetwork).toBe(true);
  });

  it("returns all fields from DEFAULT when user is empty object", () => {
    const rt = mergeRenderThresholds({});
    expect(rt.edgeBidirectionalBoost).toBe(0.2);
    expect(rt.edgeHierarchyBoost).toBe(0.3);
  });

  it("user overrides take precedence", () => {
    const rt = mergeRenderThresholds({
      edgeMinZoom: 0.05,
      labelCullCooldown: 2,
      cardBodyMaxLines: 5,
    });
    expect(rt.edgeMinZoom).toBe(0.05);
    expect(rt.labelCullCooldown).toBe(2);
    expect(rt.cardBodyMaxLines).toBe(5);
    // Non-overridden fields retain defaults
    expect(rt.edgeZoomFadeThreshold).toBe(0.5);
  });

  it("user can set values to 0 (falsy but valid)", () => {
    const rt = mergeRenderThresholds({
      edgeMinZoom: 0,
      labelMaxChars: 0,
      autoFitMinScale: 0,
    });
    expect(rt.edgeMinZoom).toBe(0);
    expect(rt.labelMaxChars).toBe(0);
    expect(rt.autoFitMinScale).toBe(0);
  });

  it("user can set boolean fields to false", () => {
    const rt = mergeRenderThresholds({
      labelOverlapCulling: false,
      showRoadNetwork: false,
      nodeSizeByDegree: false,
    });
    expect(rt.labelOverlapCulling).toBe(false);
    expect(rt.showRoadNetwork).toBe(false);
    expect(rt.nodeSizeByDegree).toBe(false);
  });

  it("DEFAULT_RENDER_THRESHOLDS has no undefined values", () => {
    const keys = Object.keys(DEFAULT_RENDER_THRESHOLDS) as (keyof typeof DEFAULT_RENDER_THRESHOLDS)[];
    for (const key of keys) {
      expect(DEFAULT_RENDER_THRESHOLDS[key]).not.toBeUndefined();
    }
  });

  it("result type is assignable to Required<RenderThresholds>", () => {
    const rt = mergeRenderThresholds({ edgeMinZoom: 0.1 });
    // Access fields without ?? — should not throw
    const _v1: number = rt.edgeMinZoom;
    const _v2: boolean = rt.labelOverlapCulling;
    const _v3: string = rt.labelModeOverride;
    expect(_v1).toBe(0.1);
    expect(_v2).toBe(true);
    expect(_v3).toBe("auto");
  });

  it("new edge config fields have correct defaults", () => {
    const rt = mergeRenderThresholds();
    expect(rt.edgeFadeMinAlpha).toBe(0.1);
    expect(rt.edgeLabelZoomHide).toBe(0.15);
    expect(rt.edgeLabelZoomFade).toBe(0.3);
    expect(rt.edgeBidirectionalBoost).toBe(0.2);
    expect(rt.edgeUnidirectionalDim).toBe(0.15);
    expect(rt.edgeHierarchyBoost).toBe(0.3);
    expect(rt.edgeBidirectionalThickFactor).toBe(1.5);
    expect(rt.edgeHierarchyThickFactor).toBe(2.5);
    expect(rt.arcMaxEdgeCount).toBe(500);
    expect(rt.edgeHoverFalloffMinAlpha).toBe(0.08);
    expect(rt.enclosureZoomOutThreshold).toBe(0.45);
    expect(rt.labelFadeRate).toBe(0.15);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_RENDER_THRESHOLDS completeness (cycle116)
// ---------------------------------------------------------------------------
describe("DEFAULT_RENDER_THRESHOLDS completeness", () => {
  it("has 200+ fields (guard against accidental removal)", () => {
    const count = Object.keys(DEFAULT_RENDER_THRESHOLDS).length;
    expect(count).toBeGreaterThan(200);
  });

  it("all numeric fields are finite", () => {
    for (const [key, val] of Object.entries(DEFAULT_RENDER_THRESHOLDS)) {
      if (typeof val === "number") {
        expect(isFinite(val), `${key} should be finite`).toBe(true);
      }
    }
  });

  it("all boolean fields are actually booleans", () => {
    const boolKeys = Object.entries(DEFAULT_RENDER_THRESHOLDS)
      .filter(([, v]) => v === true || v === false)
      .map(([k]) => k);
    expect(boolKeys.length).toBeGreaterThan(5);
    for (const key of boolKeys) {
      expect(typeof (DEFAULT_RENDER_THRESHOLDS as any)[key]).toBe("boolean");
    }
  });

  it("LOD thresholds are in ascending order", () => {
    const rt = DEFAULT_RENDER_THRESHOLDS;
    // cardLODExtremePx < cardLODMidLabelPx < cardLODNormalPx < cardLODCompactPx < cardLODFullCardPx
    expect(rt.cardLODExtremePx).toBeLessThan(rt.cardLODMidLabelPx);
    expect(rt.cardLODMidLabelPx).toBeLessThan(rt.cardLODNormalPx);
    expect(rt.cardLODNormalPx).toBeLessThan(rt.cardLODCompactPx);
    expect(rt.cardLODCompactPx).toBeLessThan(rt.cardLODFullCardPx);
  });

  it("label zoom tiers are in ascending order", () => {
    const rt = DEFAULT_RENDER_THRESHOLDS;
    expect(rt.labelZoomTier1).toBeLessThan(rt.labelZoomTier2);
    expect(rt.labelZoomTier2).toBeLessThan(rt.labelZoomTier3);
  });

  it("alpha values are in [0, 1] range", () => {
    const alphaKeys = Object.entries(DEFAULT_RENDER_THRESHOLDS)
      .filter(([k]) => k.toLowerCase().includes("alpha"))
      .filter(([, v]) => typeof v === "number");
    expect(alphaKeys.length).toBeGreaterThan(10);
    for (const [key, val] of alphaKeys) {
      expect((val as number) >= 0, `${key} >= 0`).toBe(true);
      expect((val as number) <= 1, `${key} <= 1`).toBe(true);
    }
  });

  it("color values are valid hex numbers", () => {
    const colorKeys = Object.entries(DEFAULT_RENDER_THRESHOLDS)
      .filter(([k]) => k.toLowerCase().includes("color") && !k.includes("sync"))
      .filter(([, v]) => typeof v === "number");
    for (const [key, val] of colorKeys) {
      expect((val as number) >= 0x000000, `${key} >= 0x000000`).toBe(true);
      expect((val as number) <= 0xffffff, `${key} <= 0xffffff`).toBe(true);
    }
  });

  it("donutSectorColors is a non-empty array of hex colors", () => {
    const colors = DEFAULT_RENDER_THRESHOLDS.donutSectorColors;
    expect(Array.isArray(colors)).toBe(true);
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });
});
