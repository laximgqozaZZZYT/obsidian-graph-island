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
