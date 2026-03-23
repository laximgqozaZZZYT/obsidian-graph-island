import { describe, it, expect, vi } from "vitest";

vi.mock("pixi.js", () => ({}));

import {
  deriveOneRule,
  deriveClusterRulesFromQueries,
  deriveClusterRules,
  blendThemeLabel,
  lightenHex,
  heatmapColor,
  COMMUNITY_PALETTE,
} from "../src/views/GraphViewContainer";
import { hexToRgb } from "../src/utils/color";
import type { GroupPreset } from "../src/types";

// ---------------------------------------------------------------------------
// deriveOneRule — query string → ClusterGroupRule
// ---------------------------------------------------------------------------
describe("deriveOneRule", () => {
  it("returns null for empty string", () => {
    expect(deriveOneRule("", false)).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(deriveOneRule("   ", true)).toBeNull();
  });

  it("handles wildcard pattern tag:*", () => {
    const rule = deriveOneRule("tag:*", false);
    expect(rule).not.toBeNull();
    expect(rule!.groupBy).toBe("tag:?");
    expect(rule!.recursive).toBe(false);
  });

  it("handles wildcard pattern category:*", () => {
    const rule = deriveOneRule("category:*", true);
    expect(rule).not.toBeNull();
    expect(rule!.groupBy).toBe("category:?");
    expect(rule!.recursive).toBe(true);
  });

  it("handles non-wildcard leaf query", () => {
    const rule = deriveOneRule("tag:character", false);
    expect(rule).not.toBeNull();
    expect(rule!.groupBy).toContain("tag:?");
  });

  it("preserves recursive flag", () => {
    const ruleTrue = deriveOneRule("tag:*", true);
    const ruleFalse = deriveOneRule("tag:*", false);
    expect(ruleTrue!.recursive).toBe(true);
    expect(ruleFalse!.recursive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveClusterRulesFromQueries — pipeline
// ---------------------------------------------------------------------------
describe("deriveClusterRulesFromQueries", () => {
  it("returns empty array for empty input", () => {
    expect(deriveClusterRulesFromQueries([])).toEqual([]);
  });

  it("filters out invalid queries", () => {
    const rules = deriveClusterRulesFromQueries([
      { query: "", recursive: false },
      { query: "tag:*", recursive: true },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].recursive).toBe(true);
  });

  it("processes multiple valid queries", () => {
    const rules = deriveClusterRulesFromQueries([
      { query: "tag:*", recursive: false },
      { query: "category:*", recursive: true },
    ]);
    expect(rules).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// deriveClusterRules — preset handler
// ---------------------------------------------------------------------------
describe("deriveClusterRules", () => {
  it("returns empty array for preset with no queries", () => {
    const preset: GroupPreset = {
      condition: {},
      groups: [],
    };
    expect(deriveClusterRules(preset)).toEqual([]);
  });

  it("uses commonQueries when present", () => {
    const preset: GroupPreset = {
      condition: {},
      groups: [],
      commonQueries: [{ query: "tag:*", recursive: true }],
    };
    const rules = deriveClusterRules(preset);
    expect(rules).toHaveLength(1);
    expect(rules[0].recursive).toBe(true);
  });

  it("prefers commonQueries over legacy commonQuery", () => {
    const preset: GroupPreset = {
      condition: {},
      groups: [],
      commonQueries: [{ query: "tag:*", recursive: false }],
      commonQuery: { expression: { type: "leaf", field: "category", value: "*" } },
    };
    const rules = deriveClusterRules(preset);
    // Should use commonQueries, not legacy
    expect(rules).toHaveLength(1);
    expect(rules[0].groupBy).toContain("tag");
  });

  it("falls back to legacy commonQuery when commonQueries is empty", () => {
    const preset: GroupPreset = {
      condition: {},
      groups: [],
      commonQueries: [],
      commonQuery: { expression: { type: "leaf", field: "tag", value: "*" } },
    };
    const rules = deriveClusterRules(preset);
    expect(rules).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// blendThemeLabel — 15% color blend
// ---------------------------------------------------------------------------
describe("blendThemeLabel", () => {
  it("blends black bg with white node → slight lightening", () => {
    const result = blendThemeLabel(0x000000, 0xffffff);
    const { r, g, b } = hexToRgb(result);
    // 0 + (255-0)*0.15 = 38.25 → 38
    expect(r).toBeCloseTo(38, 0);
    expect(g).toBeCloseTo(38, 0);
    expect(b).toBeCloseTo(38, 0);
  });

  it("blends white bg with black node → slight darkening", () => {
    const result = blendThemeLabel(0xffffff, 0x000000);
    const { r, g, b } = hexToRgb(result);
    // 255 + (0-255)*0.15 = 255 - 38.25 = 216.75 → 217
    expect(r).toBeCloseTo(217, 0);
    expect(g).toBeCloseTo(217, 0);
    expect(b).toBeCloseTo(217, 0);
  });

  it("same colors produce same color", () => {
    expect(blendThemeLabel(0x808080, 0x808080)).toBe(0x808080);
  });

  it("handles pure red channel blending", () => {
    const result = blendThemeLabel(0xff0000, 0x00ff00);
    const { r, g, b } = hexToRgb(result);
    // R: 255 + (0-255)*0.15 = 216.75 → 217
    // G: 0 + (255-0)*0.15 = 38.25 → 38
    expect(r).toBeCloseTo(217, 0);
    expect(g).toBeCloseTo(38, 0);
    expect(b).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// lightenHex — additive lightening
// ---------------------------------------------------------------------------
describe("lightenHex", () => {
  it("factor=0 returns original color", () => {
    expect(lightenHex(0x336699, 0)).toBe(0x336699);
  });

  it("factor=1 produces white", () => {
    expect(lightenHex(0x000000, 1)).toBe(0xffffff);
  });

  it("clamps at 255 for bright colors", () => {
    const result = lightenHex(0xffffff, 0.5);
    expect(result).toBe(0xffffff);
  });

  it("lightens dark color by 20%", () => {
    const result = lightenHex(0x000000, 0.2);
    const { r, g, b } = hexToRgb(result);
    // 0 + round(255*0.2) = 51
    expect(r).toBe(51);
    expect(g).toBe(51);
    expect(b).toBe(51);
  });

  it("partially lightens mid-tone color", () => {
    const orig = hexToRgb(0x808080);
    const result = lightenHex(0x808080, 0.1);
    const lit = hexToRgb(result);
    expect(lit.r).toBeGreaterThan(orig.r);
    expect(lit.g).toBeGreaterThan(orig.g);
    expect(lit.b).toBeGreaterThan(orig.b);
  });

  it("handles per-channel clamping independently", () => {
    // R=200, G=100, B=50 + factor=0.5 → R=min(255,200+128)=255, G=228, B=178
    const result = lightenHex(0xc86432, 0.5);
    const { r, g, b } = hexToRgb(result);
    expect(r).toBe(255); // clamped
    expect(g).toBeLessThan(255);
    expect(b).toBeLessThan(255);
  });
});

// ---------------------------------------------------------------------------
// heatmapColor — degree-based color ramp (blue → red)
// ---------------------------------------------------------------------------
describe("heatmapColor", () => {
  it("degree=0 returns cold blue (0x3b82f6)", () => {
    expect(heatmapColor(0, 100)).toBe(0x3b82f6);
  });

  it("degree=maxDegree returns warm red (0xef4444)", () => {
    expect(heatmapColor(100, 100)).toBe(0xef4444);
  });

  it("mid-degree produces intermediate color", () => {
    const mid = heatmapColor(50, 100);
    const { r, g, b } = hexToRgb(mid);
    // Between blue(59,130,246) and red(239,68,68)
    expect(r).toBeGreaterThan(59);
    expect(r).toBeLessThan(239);
  });

  it("clamps at maxDegree (overshooting degree)", () => {
    expect(heatmapColor(200, 100)).toBe(heatmapColor(100, 100));
  });

  it("maxDegree=0 doesn't divide by zero", () => {
    const result = heatmapColor(5, 0);
    // Should clamp t to 1 (maxDegree=0 → Math.max(1,0)=1, 5/1=5 → min(1,5)=1)
    expect(result).toBe(0xef4444);
  });

  it("color is monotonically shifting from blue to red as degree increases", () => {
    const colors = [0, 25, 50, 75, 100].map(d => heatmapColor(d, 100));
    // R should increase
    const rs = colors.map(c => (c >> 16) & 0xff);
    for (let i = 1; i < rs.length; i++) {
      expect(rs[i]).toBeGreaterThanOrEqual(rs[i - 1]);
    }
    // B should decrease
    const bs = colors.map(c => c & 0xff);
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i]).toBeLessThanOrEqual(bs[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// COMMUNITY_PALETTE — Tableau 20-inspired palette
// ---------------------------------------------------------------------------
describe("COMMUNITY_PALETTE", () => {
  it("has exactly 20 colors", () => {
    expect(COMMUNITY_PALETTE).toHaveLength(20);
  });

  it("all values are valid 24-bit hex colors", () => {
    for (const c of COMMUNITY_PALETTE) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });

  it("all colors are unique", () => {
    expect(new Set(COMMUNITY_PALETTE).size).toBe(20);
  });
});
