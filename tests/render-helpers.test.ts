import { describe, it, expect } from "vitest";

import {
  setFrontmatterField,
  addFrontmatterTag,
  countEdgeTypes,
  getPresetSummary,
  buildHoverTooltipText,
  hasImageMetaNodes,
  computeViewportScaleFactor,
  computeAvgRadius,
  computeDegenerateSpread,
  generatePhantomNodes,
  resolveAnalysisOverlay,
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
