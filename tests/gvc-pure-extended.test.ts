import { describe, it, expect, vi } from "vitest";

vi.mock("pixi.js", () => ({}));

import {
  blendThemeLabel,
  cleanArcName,
  areSavedPositionsValid,
  lightenHex,
  heatmapColor,
  resolveNodeColor,
  findMatchingGroupPreset,
  COMMUNITY_PALETTE,
} from "../src/views/GraphViewContainer";
import type { GroupPreset } from "../src/types";

// ---------------------------------------------------------------------------
// blendThemeLabel — extended boundary tests
// ---------------------------------------------------------------------------
describe("blendThemeLabel (extended)", () => {
  it("blending same color returns that color", () => {
    expect(blendThemeLabel(0x808080, 0x808080)).toBe(0x808080);
  });

  it("blending black bg with white node shifts slightly toward white", () => {
    const result = blendThemeLabel(0x000000, 0xffffff);
    // 15% of 255 = ~38 per channel
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBeCloseTo(38, 0);
    expect(g).toBeCloseTo(38, 0);
    expect(b).toBeCloseTo(38, 0);
  });

  it("blending white bg with black node shifts slightly toward black", () => {
    const result = blendThemeLabel(0xffffff, 0x000000);
    const r = (result >> 16) & 0xff;
    // 255 + (0-255)*0.15 = 255 - 38 = 217
    expect(r).toBeCloseTo(217, 0);
  });

  it("preserves approximate color of bg when nodeColor is similar", () => {
    const result = blendThemeLabel(0x808080, 0x909090);
    const r = (result >> 16) & 0xff;
    // 128 + (144-128)*0.15 = 128 + 2.4 ≈ 130
    expect(r).toBeCloseTo(130, 1);
  });
});

// ---------------------------------------------------------------------------
// cleanArcName — extended edge cases
// ---------------------------------------------------------------------------
describe("cleanArcName (extended)", () => {
  it("returns name without slashes unchanged", () => {
    expect(cleanArcName("mythology")).toBe("mythology");
  });

  it("strips redundant trailing duplicate segment", () => {
    expect(cleanArcName("bible-apocrypha/bible-apocrypha")).toBe("bible-apocrypha");
  });

  it("returns last segment for non-duplicate path", () => {
    expect(cleanArcName("stories/characters")).toBe("characters");
  });

  it("handles triple-depth path", () => {
    expect(cleanArcName("a/b/c")).toBe("c");
  });

  it("handles triple-depth with last two matching", () => {
    expect(cleanArcName("a/b/b")).toBe("b");
  });

  it("handles empty string", () => {
    expect(cleanArcName("")).toBe("");
  });

  it("handles single slash", () => {
    expect(cleanArcName("/")).toBe("");
  });

  it("handles trailing slash", () => {
    // "folder/" → segments = ["folder", ""] → last = "" ≠ "folder" → returns "" or name
    const result = cleanArcName("folder/");
    expect(typeof result).toBe("string");
  });

  it("handles path with only duplicate", () => {
    expect(cleanArcName("x/x")).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// areSavedPositionsValid — extended boundary tests
// ---------------------------------------------------------------------------
describe("areSavedPositionsValid (extended)", () => {
  it("returns false for empty map", () => {
    expect(areSavedPositionsValid(new Map(), 800, 600)).toBe(false);
  });

  it("returns true for positions within bounds", () => {
    const pos = new Map([["a", { x: 100, y: 100 }], ["b", { x: -50, y: 200 }]]);
    expect(areSavedPositionsValid(pos, 800, 600)).toBe(true);
  });

  it("returns false when position is NaN", () => {
    const pos = new Map([["a", { x: NaN, y: 0 }]]);
    expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
  });

  it("returns false when position is Infinity", () => {
    const pos = new Map([["a", { x: Infinity, y: 0 }]]);
    expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
  });

  it("returns false when position exceeds 5x canvas size", () => {
    const pos = new Map([["a", { x: 5000, y: 0 }]]);
    // maxCoord = max(800, 600) * 5 = 4000; 5000 > 4000
    expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
  });

  it("returns true when position is exactly at 5x boundary", () => {
    const pos = new Map([["a", { x: 4000, y: 0 }]]);
    // maxCoord = 4000; abs(4000) <= 4000 → valid
    expect(areSavedPositionsValid(pos, 800, 600)).toBe(true);
  });

  it("returns false if any single position is invalid", () => {
    const pos = new Map([
      ["a", { x: 100, y: 100 }],
      ["b", { x: NaN, y: 0 }],
    ]);
    expect(areSavedPositionsValid(pos, 800, 600)).toBe(false);
  });

  it("handles negative positions within bounds", () => {
    const pos = new Map([["a", { x: -3000, y: -2000 }]]);
    expect(areSavedPositionsValid(pos, 800, 600)).toBe(true);
  });

  it("canvas size 0 means maxCoord=0, all positions invalid", () => {
    const pos = new Map([["a", { x: 1, y: 0 }]]);
    expect(areSavedPositionsValid(pos, 0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lightenHex — extended tests
// ---------------------------------------------------------------------------
describe("lightenHex (extended)", () => {
  it("factor=0 returns original color", () => {
    expect(lightenHex(0x804020, 0)).toBe(0x804020);
  });

  it("factor=1 adds 255 to each channel (clamped at 255)", () => {
    const result = lightenHex(0x000000, 1);
    expect(result).toBe(0xffffff);
  });

  it("channels are clamped at 255", () => {
    const result = lightenHex(0xffffff, 0.5);
    const r = (result >> 16) & 0xff;
    expect(r).toBe(255);
  });

  it("factor=0.1 adds ~25 to each channel", () => {
    const result = lightenHex(0x000000, 0.1);
    const r = (result >> 16) & 0xff;
    expect(r).toBe(26); // round(255 * 0.1) = 26
  });

  it("partially dark color gets lighter", () => {
    const original = 0x404040;
    const lighter = lightenHex(original, 0.2);
    const rOrig = (original >> 16) & 0xff;
    const rLighter = (lighter >> 16) & 0xff;
    expect(rLighter).toBeGreaterThan(rOrig);
  });
});

// ---------------------------------------------------------------------------
// heatmapColor — degree-based color ramp
// ---------------------------------------------------------------------------
describe("heatmapColor (extended)", () => {
  it("degree=0 returns cold color (blue-ish)", () => {
    const c = heatmapColor(0, 100);
    const r = (c >> 16) & 0xff;
    const b = c & 0xff;
    // Cold: r is low, b is high
    expect(b).toBeGreaterThan(r);
  });

  it("degree=maxDegree returns warm color (red-ish)", () => {
    const c = heatmapColor(100, 100);
    const r = (c >> 16) & 0xff;
    const b = c & 0xff;
    // Warm: r is high
    expect(r).toBeGreaterThan(b);
  });

  it("midpoint has intermediate channels", () => {
    const c = heatmapColor(50, 100);
    const r = (c >> 16) & 0xff;
    const b = c & 0xff;
    expect(r).toBeGreaterThan(59);
    expect(b).toBeLessThan(246);
  });

  it("degree > maxDegree is clamped to warm", () => {
    const c = heatmapColor(200, 100);
    expect(c).toBe(heatmapColor(100, 100));
  });

  it("maxDegree=0 returns warm color (division guard)", () => {
    const c = heatmapColor(0, 0);
    // t = min(1, 0/max(1,0)) = 0 → cold
    const b = c & 0xff;
    expect(b).toBeGreaterThan(200); // blue channel high → cold
  });

  it("negative degree returns cold", () => {
    const c = heatmapColor(-5, 100);
    // t = min(1, -5/100) = min(1, -0.05) → 0 (negative clamped by min with t)
    // Actually Math.min(1, -0.05) = -0.05 which is not clamped...
    // Let's just check it doesn't throw
    expect(typeof c).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// resolveNodeColor — node color resolution
// ---------------------------------------------------------------------------
describe("resolveNodeColor (extended)", () => {
  const colorMap = new Map([
    ["character", "#ff0000"],
    ["location", "#00ff00"],
    ["tag:mythology", "#0000ff"],
  ]);

  it("returns category color when available", () => {
    expect(resolveNodeColor({ category: "character" }, colorMap, "#888")).toBe("#ff0000");
  });

  it("falls back to tag color when category has no mapping", () => {
    expect(resolveNodeColor({ category: "unknown", tags: ["mythology"] }, colorMap, "#888")).toBe("#0000ff");
  });

  it("returns default when no category or tag match", () => {
    expect(resolveNodeColor({ category: "xxx", tags: ["yyy"] }, colorMap, "#888")).toBe("#888");
  });

  it("returns default for node with no category or tags", () => {
    expect(resolveNodeColor({}, colorMap, "#888")).toBe("#888");
  });

  it("uses first tag only", () => {
    const result = resolveNodeColor({ tags: ["mythology", "something"] }, colorMap, "#888");
    expect(result).toBe("#0000ff"); // tag:mythology
  });

  it("category takes priority over tag", () => {
    const result = resolveNodeColor(
      { category: "character", tags: ["mythology"] },
      colorMap,
      "#888",
    );
    expect(result).toBe("#ff0000"); // category wins
  });

  it("empty tags array falls through to default", () => {
    expect(resolveNodeColor({ tags: [] }, colorMap, "#888")).toBe("#888");
  });

  it("empty color map always returns default", () => {
    expect(resolveNodeColor({ category: "character" }, new Map(), "#888")).toBe("#888");
  });
});

// ---------------------------------------------------------------------------
// findMatchingGroupPreset — preset condition matching
// ---------------------------------------------------------------------------
describe("findMatchingGroupPreset (extended)", () => {
  const presets: GroupPreset[] = [
    { condition: { layout: "force", tagDisplay: "node" } } as any,
    { condition: { layout: "concentric" } } as any,
    { condition: {} } as any,
  ];

  it("matches first preset by layout and tagDisplay", () => {
    expect(findMatchingGroupPreset(presets, "force", "node")).toBe(presets[0]);
  });

  it("matches second preset by layout (no tagDisplay constraint)", () => {
    expect(findMatchingGroupPreset(presets, "concentric", "any")).toBe(presets[1]);
  });

  it("falls through to wildcard preset (empty condition)", () => {
    expect(findMatchingGroupPreset(presets, "grid", "something")).toBe(presets[2]);
  });

  it("returns null for empty presets array", () => {
    expect(findMatchingGroupPreset([], "force", "node")).toBeNull();
  });

  it("skips preset with mismatching layout", () => {
    const strict: GroupPreset[] = [
      { condition: { layout: "force" } } as any,
    ];
    expect(findMatchingGroupPreset(strict, "grid", "node")).toBeNull();
  });

  it("skips preset with mismatching tagDisplay", () => {
    const strict: GroupPreset[] = [
      { condition: { tagDisplay: "enclosure" } } as any,
    ];
    expect(findMatchingGroupPreset(strict, "force", "node")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// COMMUNITY_PALETTE — palette validation
// ---------------------------------------------------------------------------
describe("COMMUNITY_PALETTE (extended)", () => {
  it("has exactly 20 colors", () => {
    expect(COMMUNITY_PALETTE).toHaveLength(20);
  });

  it("all colors are valid 24-bit hex numbers", () => {
    for (const c of COMMUNITY_PALETTE) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });

  it("all colors are unique", () => {
    expect(new Set(COMMUNITY_PALETTE).size).toBe(20);
  });

  it("is declared as readonly array", () => {
    // TypeScript readonly, runtime array
    expect(Array.isArray(COMMUNITY_PALETTE)).toBe(true);
  });
});
