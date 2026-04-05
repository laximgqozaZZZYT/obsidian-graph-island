import { describe, it, expect } from "vitest";

import {
  setFrontmatterField,
  addFrontmatterTag,
  countEdgeTypes,
  getPresetSummary,
  buildHoverTooltipText,
  buildTooltipMetadata,
  hasImageMetaNodes,
  computeViewportScaleFactor,
  computeAvgRadius,
  computeDegenerateSpread,
  generatePhantomNodes,
  resolveAnalysisOverlay,
  blendThemeLabel,
  lightenHex,
  heatmapColor,
  resolveNodeColor,
  cleanArcName,
  areSavedPositionsValid,
  findMatchingGroupPreset,
  COMMUNITY_PALETTE,
  AGGREGATE_ZOOM_THRESHOLD,
  ALL_PRESETS,
  type TooltipTextOptions,
} from "../src/views/RenderHelpers";

// ---------------------------------------------------------------------------
// setFrontmatterField
// ---------------------------------------------------------------------------
describe("setFrontmatterField", () => {
  it("creates frontmatter block when none exists", () => {
    expect(setFrontmatterField("hello", "key", "val"))
      .toBe("---\nkey: val\n---\nhello");
  });

  it("adds field to existing frontmatter", () => {
    const content = "---\ntitle: Test\n---\nbody";
    const result = setFrontmatterField(content, "key", "val");
    expect(result).toContain("key: val");
    expect(result).toContain("title: Test");
  });

  it("replaces existing field value", () => {
    const content = "---\nkey: old\n---\nbody";
    const result = setFrontmatterField(content, "key", "new");
    expect(result).toContain("key: new");
    expect(result).not.toContain("key: old");
  });
});

// ---------------------------------------------------------------------------
// addFrontmatterTag
// ---------------------------------------------------------------------------
describe("addFrontmatterTag", () => {
  it("creates frontmatter with tag when none exists", () => {
    const result = addFrontmatterTag("body", "mytag");
    expect(result).toBe("---\ntags: [mytag]\n---\nbody");
  });

  it("appends tag to existing inline array", () => {
    const content = "---\ntags: [existing]\n---\nbody";
    const result = addFrontmatterTag(content, "new");
    expect(result).toContain("tags: [existing, new]");
  });

  it("converts empty tags line to list format", () => {
    const content = "---\ntags:\n---\nbody";
    const result = addFrontmatterTag(content, "first");
    expect(result).toContain("tags:\n  - first");
  });

  it("adds tags field to existing frontmatter without tags", () => {
    const content = "---\ntitle: Test\n---\nbody";
    const result = addFrontmatterTag(content, "newtag");
    expect(result).toContain("tags: [newtag]");
    expect(result).toContain("title: Test");
  });
});

// ---------------------------------------------------------------------------
// countEdgeTypes
// ---------------------------------------------------------------------------
describe("countEdgeTypes", () => {
  it("returns empty object for no edges", () => {
    expect(countEdgeTypes([])).toEqual({});
  });

  it("counts edges by type", () => {
    const edges = [
      { source: "a", target: "b", type: "link" },
      { source: "a", target: "c", type: "tag" },
      { source: "b", target: "c", type: "link" },
    ] as any[];
    expect(countEdgeTypes(edges)).toEqual({ link: 2, tag: 1 });
  });

  it("defaults missing type to 'link'", () => {
    const edges = [{ source: "a", target: "b" }] as any[];
    expect(countEdgeTypes(edges)).toEqual({ link: 1 });
  });
});

// ---------------------------------------------------------------------------
// getPresetSummary
// ---------------------------------------------------------------------------
describe("getPresetSummary", () => {
  it("returns non-empty string for known preset", () => {
    expect(getPresetSummary("simple")).toContain("links only");
  });

  it("returns empty string for unknown preset", () => {
    expect(getPresetSummary("nonexistent")).toBe("");
  });

  it("includes multiple fields for analysis preset", () => {
    const summary = getPresetSummary("analysis");
    expect(summary).toContain("arrows");
    expect(summary).toContain("all types");
  });
});

// ---------------------------------------------------------------------------
// computeAvgRadius
// ---------------------------------------------------------------------------
describe("computeAvgRadius", () => {
  it("returns 12 for zero count", () => {
    expect(computeAvgRadius([], 0)).toBe(12);
  });

  it("computes average of given radii", () => {
    expect(computeAvgRadius([10, 20, 30], 3)).toBe(20);
  });

  it("falls back to 12 for falsy values", () => {
    expect(computeAvgRadius([0, 0], 2)).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// computeViewportScaleFactor
// ---------------------------------------------------------------------------
describe("computeViewportScaleFactor", () => {
  it("returns positive factor for reasonable inputs", () => {
    const factor = computeViewportScaleFactor(100, 100, 0.5, 640000, 0.01, 10);
    expect(factor).toBeGreaterThan(0);
  });

  it("uses fallback when discriminant is negative", () => {
    // When avgR dominates bbox, discriminant may be negative; fallback = sqrt(minUtil/util)
    const factor = computeViewportScaleFactor(1, 1, 0.99, 1, 0.001, 100);
    expect(isFinite(factor)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeDegenerateSpread
// ---------------------------------------------------------------------------
describe("computeDegenerateSpread", () => {
  it("returns null when both axes are above threshold", () => {
    expect(computeDegenerateSpread(100, 100, 20, 0.5, 100000)).toBeNull();
  });

  it("detects Y-degenerate (wide but flat)", () => {
    const result = computeDegenerateSpread(500, 5, 20, 0.5, 100000);
    expect(result).not.toBeNull();
    expect(result!.axis).toBe("y");
    expect(result!.targetSpan).toBeGreaterThan(0);
  });

  it("detects X-degenerate (tall but narrow)", () => {
    const result = computeDegenerateSpread(5, 500, 20, 0.5, 100000);
    expect(result).not.toBeNull();
    expect(result!.axis).toBe("x");
    expect(result!.targetSpan).toBeGreaterThan(0);
  });

  it("returns null when both axes below threshold", () => {
    expect(computeDegenerateSpread(5, 5, 20, 0.5, 100000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasImageMetaNodes
// ---------------------------------------------------------------------------
describe("hasImageMetaNodes", () => {
  it("returns false for empty iterable", () => {
    expect(hasImageMetaNodes([])).toBe(false);
  });

  it("returns true when image field exists", () => {
    const nodes = [{ meta: { image: "path.png" } }];
    expect(hasImageMetaNodes(nodes)).toBe(true);
  });

  it("returns true when thumbnail field exists", () => {
    const nodes = [{ meta: { thumbnail: "thumb.jpg" } }];
    expect(hasImageMetaNodes(nodes)).toBe(true);
  });

  it("returns true when cover field exists", () => {
    const nodes = [{ meta: { cover: "cover.png" } }];
    expect(hasImageMetaNodes(nodes)).toBe(true);
  });

  it("returns false when no image fields", () => {
    const nodes = [{ meta: { title: "test" } }, {}];
    expect(hasImageMetaNodes(nodes)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildHoverTooltipText
// ---------------------------------------------------------------------------
describe("buildHoverTooltipText", () => {
  const baseOpts: TooltipTextOptions = {
    label: "Node A",
    showTitle: true,
    showTooltip: true,
    showMeta: true,
    showBody: false,
    isKeyboardFocused: false,
    showSimilarSuggestions: false,
    degree: 5,
    isEnclosure: false,
    hasVisibleTagLabel: false,
    edgeTypeSummary: new Map(),
    similarNodes: [],
  };

  it("returns label when showTitle is true", () => {
    const text = buildHoverTooltipText(baseOpts);
    expect(text).toContain("Node A");
  });

  it("returns empty string when all content disabled", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      showTitle: false,
      showTooltip: false,
      showMeta: false,
    });
    expect(text.trim()).toBe("");
  });

  it("includes tags when available", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      tags: ["character", "hero"],
    });
    expect(text).toContain("#character");
    expect(text).toContain("#hero");
  });

  it("skips tags when tag label visible", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      tags: ["character"],
      hasVisibleTagLabel: true,
    });
    expect(text).not.toContain("#character");
  });

  it("includes category", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      category: "person",
    });
    expect(text).toContain("[person]");
  });

  it("includes degree", () => {
    const text = buildHoverTooltipText(baseOpts);
    expect(text).toContain("5");
  });

  it("includes body preview when enabled", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      showBody: true,
      bodyPreview: "Some content here",
    });
    expect(text).toContain("Some content here");
  });

  it("includes keyboard hints when focused", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      isKeyboardFocused: true,
    });
    expect(text).toContain("Enter");
  });

  it("includes similar nodes when enabled", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      showSimilarSuggestions: true,
      similarNodes: [{ label: "Node B", score: 0.85 }],
    });
    expect(text).toContain("Node B");
    expect(text).toContain("85%");
  });

  it("includes edge type summary", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      edgeTypeSummary: new Map([["link", 3], ["tag", 2]]),
    });
    expect(text).toContain("link:3");
    expect(text).toContain("tag:2");
  });
});

// ---------------------------------------------------------------------------
// buildTooltipMetadata
// ---------------------------------------------------------------------------
describe("buildTooltipMetadata", () => {
  const baseOpts: TooltipTextOptions = {
    label: "X",
    showTitle: false,
    showTooltip: true,
    showMeta: true,
    showBody: false,
    isKeyboardFocused: false,
    showSimilarSuggestions: false,
    degree: 3,
    isEnclosure: false,
    hasVisibleTagLabel: false,
    edgeTypeSummary: new Map(),
    similarNodes: [],
  };

  it("includes tags when not enclosure and no visible tag label", () => {
    const meta = buildTooltipMetadata({ ...baseOpts, tags: ["a", "b"] });
    expect(meta).toContain("#a");
    expect(meta).toContain("#b");
  });

  it("skips tags for enclosure nodes", () => {
    const meta = buildTooltipMetadata({ ...baseOpts, tags: ["a"], isEnclosure: true });
    expect(meta).not.toContain("#a");
  });

  it("includes custom field values", () => {
    const meta = buildTooltipMetadata({
      ...baseOpts,
      hoverTooltipFields: "status, priority",
      getFieldValue: (f) => (f === "status" ? "active" : undefined),
    });
    expect(meta).toContain("status: active");
    expect(meta).not.toContain("priority");
  });

  it("includes collapsed member count", () => {
    const meta = buildTooltipMetadata({ ...baseOpts, collapsedMembers: ["a", "b", "c"] });
    expect(meta).toContain("3 members");
  });

  it("always includes degree", () => {
    const meta = buildTooltipMetadata(baseOpts);
    expect(meta).toContain("3");
  });
});

// ---------------------------------------------------------------------------
// generatePhantomNodes
// ---------------------------------------------------------------------------
describe("generatePhantomNodes", () => {
  const nodes = [
    { x: 100, y: 100 },
    { x: 200, y: 200 },
    { x: 300, y: 300 },
  ];

  it("generates grid phantom nodes for cartesian", () => {
    const phantoms = generatePhantomNodes(nodes, 200, 200, false);
    expect(phantoms.length).toBeGreaterThan(0);
    expect(phantoms[0].isPhantom).toBe(true);
    expect(phantoms[0].id).toMatch(/^__phantom_/);
  });

  it("generates polar phantom nodes when isPolar is true", () => {
    const phantoms = generatePhantomNodes(nodes, 200, 200, true);
    expect(phantoms.length).toBeGreaterThan(0);
    expect(phantoms[0].id).toMatch(/^__phantom_r/);
  });

  it("handles empty real nodes gracefully", () => {
    const phantoms = generatePhantomNodes([], 0, 0, false);
    expect(phantoms.length).toBeGreaterThan(0);
  });

  it("all phantom nodes have required fields", () => {
    const phantoms = generatePhantomNodes(nodes, 0, 0, false);
    for (const p of phantoms) {
      expect(p.id).toBeTruthy();
      expect(typeof p.x).toBe("number");
      expect(typeof p.y).toBe("number");
      expect(p.vx).toBe(0);
      expect(p.vy).toBe(0);
      expect(p.isPhantom).toBe(true);
    }
  });

  it("skips phantom nodes in max radius calculation", () => {
    const nodesWithPhantom = [
      { x: 100, y: 100, isPhantom: true },
      { x: 50, y: 50 },
    ];
    const phantoms = generatePhantomNodes(nodesWithPhantom, 0, 0, true);
    // Should still generate phantoms without error
    expect(phantoms.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// resolveAnalysisOverlay
// ---------------------------------------------------------------------------
describe("resolveAnalysisOverlay", () => {
  it("returns all false for 'off'", () => {
    const flags = resolveAnalysisOverlay("off");
    expect(flags.showBridgeNodes).toBe(false);
    expect(flags.showEntropyOverlay).toBe(false);
    expect(flags.highlightMissingNeighbors).toBe(false);
    expect(flags.showGapEdges).toBe(false);
    expect(flags.showDensityHeatmap).toBe(false);
  });

  it("returns all true for 'all'", () => {
    const flags = resolveAnalysisOverlay("all");
    expect(flags.showBridgeNodes).toBe(true);
    expect(flags.showEntropyOverlay).toBe(true);
    expect(flags.highlightMissingNeighbors).toBe(true);
    expect(flags.showGapEdges).toBe(true);
    expect(flags.showDensityHeatmap).toBe(true);
  });

  it("enables only bridges for 'bridges'", () => {
    const flags = resolveAnalysisOverlay("bridges");
    expect(flags.showBridgeNodes).toBe(true);
    expect(flags.showEntropyOverlay).toBe(false);
    expect(flags.showDensityHeatmap).toBe(false);
  });

  it("enables only density for 'density'", () => {
    const flags = resolveAnalysisOverlay("density");
    expect(flags.showDensityHeatmap).toBe(true);
    expect(flags.showBridgeNodes).toBe(false);
  });

  it("enables only entropy for 'entropy'", () => {
    const flags = resolveAnalysisOverlay("entropy");
    expect(flags.showEntropyOverlay).toBe(true);
    expect(flags.showBridgeNodes).toBe(false);
  });

  it("enables only missing for 'missing'", () => {
    const flags = resolveAnalysisOverlay("missing");
    expect(flags.highlightMissingNeighbors).toBe(true);
    expect(flags.showBridgeNodes).toBe(false);
  });

  it("enables only gaps for 'gaps'", () => {
    const flags = resolveAnalysisOverlay("gaps");
    expect(flags.showGapEdges).toBe(true);
    expect(flags.showBridgeNodes).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// blendThemeLabel — blend bg toward nodeColor at 15%
// ---------------------------------------------------------------------------
describe("blendThemeLabel", () => {
  it("returns bg color when nodeColor equals bg", () => {
    expect(blendThemeLabel(0xffffff, 0xffffff)).toBe(0xffffff);
  });

  it("blends black bg toward white at 15%", () => {
    const result = blendThemeLabel(0x000000, 0xffffff);
    // 15% of 255 = ~38 for each channel
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBeCloseTo(38, 0);
    expect(g).toBeCloseTo(38, 0);
    expect(b).toBeCloseTo(38, 0);
  });

  it("blends white bg toward black at 15%", () => {
    const result = blendThemeLabel(0xffffff, 0x000000);
    const r = (result >> 16) & 0xff;
    expect(r).toBeCloseTo(217, 0); // 255 - 38
  });

  it("produces valid 24-bit color", () => {
    const result = blendThemeLabel(0x336699, 0xff0000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffff);
  });
});

// ---------------------------------------------------------------------------
// lightenHex — lighten a color by factor
// ---------------------------------------------------------------------------
describe("lightenHex", () => {
  it("returns same color at factor 0", () => {
    expect(lightenHex(0x336699, 0)).toBe(0x336699);
  });

  it("clamps to white at factor 1", () => {
    expect(lightenHex(0x000000, 1.0)).toBe(0xffffff);
  });

  it("lightens by partial factor", () => {
    const result = lightenHex(0x000000, 0.5);
    const r = (result >> 16) & 0xff;
    expect(r).toBe(128); // 0 + 255*0.5 = 127.5 -> 128
  });

  it("does not exceed 255 per channel", () => {
    const result = lightenHex(0xffffff, 0.5);
    expect(result).toBe(0xffffff);
  });
});

// ---------------------------------------------------------------------------
// heatmapColor — cold-to-warm gradient
// ---------------------------------------------------------------------------
describe("heatmapColor", () => {
  it("returns cold (blue) color at degree 0", () => {
    const result = heatmapColor(0, 100);
    const r = (result >> 16) & 0xff;
    const b = result & 0xff;
    expect(b).toBeGreaterThan(r); // blue-dominant
  });

  it("returns warm (red) color at max degree", () => {
    const result = heatmapColor(100, 100);
    const r = (result >> 16) & 0xff;
    const b = result & 0xff;
    expect(r).toBeGreaterThan(b); // red-dominant
  });

  it("clamps t to 1 when degree exceeds maxDegree", () => {
    const atMax = heatmapColor(100, 100);
    const beyond = heatmapColor(200, 100);
    expect(beyond).toBe(atMax);
  });

  it("handles maxDegree of 0 gracefully", () => {
    const result = heatmapColor(5, 0);
    // t = min(1, 5/max(1,0)) = min(1,5) = 1
    expect(result).toBe(heatmapColor(100, 100));
  });
});

// ---------------------------------------------------------------------------
// resolveNodeColor — category -> tag fallback -> default
// ---------------------------------------------------------------------------
describe("resolveNodeColor", () => {
  it("returns category color when available", () => {
    const colorMap = new Map([["character", "#ff0000"]]);
    expect(resolveNodeColor({ category: "character" }, colorMap, "#ccc")).toBe("#ff0000");
  });

  it("falls back to tag color when no category match", () => {
    const colorMap = new Map([["tag:hero", "#00ff00"]]);
    expect(resolveNodeColor({ tags: ["hero"] }, colorMap, "#ccc")).toBe("#00ff00");
  });

  it("returns default when no match", () => {
    expect(resolveNodeColor({}, new Map(), "#ccc")).toBe("#ccc");
  });

  it("prefers category over tag", () => {
    const colorMap = new Map([
      ["character", "#ff0000"],
      ["tag:hero", "#00ff00"],
    ]);
    expect(resolveNodeColor(
      { category: "character", tags: ["hero"] },
      colorMap,
      "#ccc",
    )).toBe("#ff0000");
  });

  it("uses first tag only", () => {
    const colorMap = new Map([["tag:second", "#00ff00"]]);
    expect(resolveNodeColor({ tags: ["first", "second"] }, colorMap, "#ccc")).toBe("#ccc");
  });
});

// ---------------------------------------------------------------------------
// cleanArcName — strip redundant path prefix
// ---------------------------------------------------------------------------
describe("cleanArcName", () => {
  it("returns name as-is when no slash", () => {
    expect(cleanArcName("simple")).toBe("simple");
  });

  it("strips duplicate last segment", () => {
    expect(cleanArcName("bible-apocrypha/bible-apocrypha")).toBe("bible-apocrypha");
  });

  it("returns last segment for non-duplicate path", () => {
    expect(cleanArcName("fiction/characters")).toBe("characters");
  });

  it("handles deeper paths", () => {
    expect(cleanArcName("a/b/c")).toBe("c");
  });

  it("handles trailing slash edge case", () => {
    // "a/" splits to ["a", ""], last is "", second-last is "a" — not equal
    const result = cleanArcName("a/");
    expect(result).toBe("a/"); // falls to last || name
  });
});

// ---------------------------------------------------------------------------
// areSavedPositionsValid
// ---------------------------------------------------------------------------
describe("areSavedPositionsValid", () => {
  it("returns false for empty map", () => {
    expect(areSavedPositionsValid(new Map(), 800, 600)).toBe(false);
  });

  it("returns true for valid positions", () => {
    const positions = new Map([
      ["a", { x: 100, y: 200 }],
      ["b", { x: -300, y: 400 }],
    ]);
    expect(areSavedPositionsValid(positions, 800, 600)).toBe(true);
  });

  it("returns false when position has NaN", () => {
    const positions = new Map([["a", { x: NaN, y: 100 }]]);
    expect(areSavedPositionsValid(positions, 800, 600)).toBe(false);
  });

  it("returns false when position has Infinity", () => {
    const positions = new Map([["a", { x: Infinity, y: 100 }]]);
    expect(areSavedPositionsValid(positions, 800, 600)).toBe(false);
  });

  it("returns false when position exceeds 5x canvas dimension", () => {
    const positions = new Map([["a", { x: 5000, y: 0 }]]);
    // maxCoord = max(800, 600) * 5 = 4000
    expect(areSavedPositionsValid(positions, 800, 600)).toBe(false);
  });

  it("returns true at boundary of 5x canvas dimension", () => {
    const positions = new Map([["a", { x: 4000, y: 0 }]]);
    expect(areSavedPositionsValid(positions, 800, 600)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findMatchingGroupPreset
// ---------------------------------------------------------------------------
describe("findMatchingGroupPreset", () => {
  const presets = [
    { condition: { layout: "force", tagDisplay: "label" }, name: "p1" },
    { condition: { layout: "concentric" }, name: "p2" },
    { condition: {}, name: "p3" },
  ] as any[];

  it("matches preset with matching layout and tagDisplay", () => {
    const result = findMatchingGroupPreset(presets, "force", "label");
    expect(result?.name).toBe("p1");
  });

  it("matches preset with only layout condition", () => {
    const result = findMatchingGroupPreset(presets, "concentric", "any");
    expect(result?.name).toBe("p2");
  });

  it("matches catch-all preset (empty condition)", () => {
    const result = findMatchingGroupPreset(presets, "timeline", "any");
    expect(result?.name).toBe("p3");
  });

  it("returns null for empty presets array", () => {
    expect(findMatchingGroupPreset([], "force", "label")).toBeNull();
  });

  it("skips preset when layout does not match", () => {
    // Only p3 (catch-all) should match for "grid" layout
    const result = findMatchingGroupPreset(
      [{ condition: { layout: "force" }, name: "p1" }] as any[],
      "grid",
      "label",
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("RenderHelpers constants", () => {
  it("COMMUNITY_PALETTE has 20 colors", () => {
    expect(COMMUNITY_PALETTE.length).toBe(20);
  });

  it("COMMUNITY_PALETTE entries are valid 24-bit colors", () => {
    for (const c of COMMUNITY_PALETTE) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });

  it("AGGREGATE_ZOOM_THRESHOLD is between 0 and 1", () => {
    expect(AGGREGATE_ZOOM_THRESHOLD).toBeGreaterThan(0);
    expect(AGGREGATE_ZOOM_THRESHOLD).toBeLessThan(1);
  });

  it("ALL_PRESETS contains expected preset keys", () => {
    expect(ALL_PRESETS).toHaveProperty("simple");
    expect(ALL_PRESETS).toHaveProperty("analysis");
    expect(ALL_PRESETS).toHaveProperty("creative");
    expect(ALL_PRESETS).toHaveProperty("explore");
    expect(ALL_PRESETS).toHaveProperty("analyze");
    expect(ALL_PRESETS).toHaveProperty("write");
  });

  it("ALL_PRESETS values are objects", () => {
    for (const [key, val] of Object.entries(ALL_PRESETS)) {
      expect(typeof val).toBe("object");
      expect(val).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// buildHoverTooltipText — custom fields and collapsed members
// ---------------------------------------------------------------------------
describe("buildHoverTooltipText (additional)", () => {
  const baseOpts: TooltipTextOptions = {
    label: "Node A",
    showTitle: true,
    showTooltip: true,
    showMeta: true,
    showBody: false,
    isKeyboardFocused: false,
    showSimilarSuggestions: false,
    degree: 5,
    isEnclosure: false,
    hasVisibleTagLabel: false,
    edgeTypeSummary: new Map(),
    similarNodes: [],
  };

  it("includes custom field values via getFieldValue", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      hoverTooltipFields: "status, priority",
      getFieldValue: (field: string) =>
        field === "status" ? "active" : field === "priority" ? "high" : undefined,
    });
    expect(text).toContain("status: active");
    expect(text).toContain("priority: high");
  });

  it("skips custom fields with no value", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      hoverTooltipFields: "missing",
      getFieldValue: () => undefined,
    });
    expect(text).not.toContain("missing:");
  });

  it("includes collapsed member count", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      collapsedMembers: ["a", "b", "c"],
    });
    expect(text).toContain("3 members");
  });

  it("skips tags for enclosure nodes", () => {
    const text = buildHoverTooltipText({
      ...baseOpts,
      tags: ["tag1"],
      isEnclosure: true,
    });
    expect(text).not.toContain("#tag1");
  });
});
