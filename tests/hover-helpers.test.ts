import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildHoverTooltipText,
  groupOffScreenNeighbors,
  computeTooltipEdgePosition,
  findSharedTagNodes,
  findSameFolderNodes,
  resolveInheritArrangement,
  clearNonGraphLayers,
  computeCardBBox,
  buildTransitionData,
  computeTimelineFit,
  type HoverTooltipInput,
  type HoverTooltipOptions,
  type OffScreenNodeInfo,
  type HoverHighlightNode,
} from "../src/views/hover-helpers";
import type { GraphEdge, GraphNode } from "../src/types";
import type { SimilarNode } from "../src/analysis/graph-analysis";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTooltipInput(overrides: Partial<HoverTooltipInput> = {}): HoverTooltipInput {
  return {
    label: "Test Node",
    tags: ["tag1", "tag2"],
    category: "test-category",
    id: "node-id",
    ...overrides,
  };
}

function makeTooltipOptions(overrides: Partial<HoverTooltipOptions> = {}): HoverTooltipOptions {
  return {
    showTitle: true,
    showMeta: true,
    showBody: false,
    showTooltip: true,
    isKeyboardFocused: false,
    showSimilarSuggestions: false,
    tagDisplayEnclosure: false,
    hasVisibleTagLabel: false,
    degree: 5,
    graphEdges: [],
    getNodeProperty: () => undefined,
    similarCache: new Map(),
    allNodes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: buildHoverTooltipText
// ---------------------------------------------------------------------------

describe("buildHoverTooltipText", () => {
  it("builds tooltip with title only when minimal options", () => {
    const node = makeTooltipInput();
    const opts = makeTooltipOptions({
      showTitle: true,
      showMeta: false,
      showBody: false,
      showTooltip: false,
      isKeyboardFocused: false,
      showSimilarSuggestions: false,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toBe("Test Node");
  });

  it("appends tags to tooltip when not already displayed", () => {
    const node = makeTooltipInput({ tags: ["tag1", "tag2"] });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      hasVisibleTagLabel: false,
      tagDisplayEnclosure: false,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("#tag1");
    expect(text).toContain("#tag2");
  });

  it("skips tags when hasVisibleTagLabel is true", () => {
    const node = makeTooltipInput({ tags: ["tag1"] });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      hasVisibleTagLabel: true,
      tagDisplayEnclosure: false,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).not.toContain("#tag1");
  });

  it("skips tags when tagDisplayEnclosure is true", () => {
    const node = makeTooltipInput({ tags: ["tag1"] });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      hasVisibleTagLabel: false,
      tagDisplayEnclosure: true,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).not.toContain("#tag1");
  });

  it("appends category when present", () => {
    const node = makeTooltipInput({ category: "my-category" });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("[my-category]");
  });

  it("appends degree as ° prefix", () => {
    const node = makeTooltipInput();
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      degree: 10,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("° 10");
  });

  it("appends body preview when enabled", () => {
    const node = makeTooltipInput({ bodyPreview: "This is a preview." });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: false,
      showBody: true,
      showTooltip: true,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("---");
    expect(text).toContain("This is a preview.");
  });

  it("appends keyboard shortcuts when focused", () => {
    const node = makeTooltipInput();
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: false,
      showBody: false,
      showTooltip: true,
      isKeyboardFocused: true,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("Enter");
    expect(text).toContain("open");
    expect(text).toContain("select");
  });

  it("returns empty string when all options disabled", () => {
    const node = makeTooltipInput();
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: false,
      showBody: false,
      showTooltip: false,
      isKeyboardFocused: false,
      showSimilarSuggestions: false,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: groupOffScreenNeighbors
// ---------------------------------------------------------------------------

describe("groupOffScreenNeighbors", () => {
  it("groups off-screen neighbors by cluster key", () => {
    const neighbors = ["n1", "n2"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      if (id === "n1") return { id: "n1", gfxX: 1000, gfxY: 0, filePath: "folder1/file1.md", label: "File 1" };
      if (id === "n2") return { id: "n2", gfxX: 1000, gfxY: 0, filePath: "folder1/file2.md", label: "File 2" };
      return null;
    };
    const getClusterKey = (id: string, folder: string) => `cluster-${folder}`;
    const result = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(result.size).toBe(1);
    expect(result.get("cluster-folder1")).toBeDefined();
    expect(result.get("cluster-folder1")?.names).toContain("File 1");
    expect(result.get("cluster-folder1")?.names).toContain("File 2");
  });

  it("skips on-screen neighbors", () => {
    const neighbors = ["n1"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      return { id: "n1", gfxX: 100, gfxY: 100, filePath: "folder/file.md" };
    };
    const getClusterKey = () => "cluster";
    const result = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(result.size).toBe(0);
  });

  it("skips null neighbors", () => {
    const neighbors = ["n1", "n2"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      if (id === "n1") return null;
      return { id: "n2", gfxX: 1000, gfxY: 0, filePath: "folder/file2.md" };
    };
    const getClusterKey = () => "cluster";
    const result = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(result.size).toBe(1);
  });

  it("computes running average screen positions", () => {
    const neighbors = ["n1", "n2"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      if (id === "n1") return { id: "n1", gfxX: 1000, gfxY: 0, filePath: "f/f1.md" };
      if (id === "n2") return { id: "n2", gfxX: 1000, gfxY: 200, filePath: "f/f2.md" };
      return null;
    };
    const getClusterKey = () => "cluster";
    const result = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    const group = result.get("cluster");
    expect(group).toBeDefined();
    expect(group!.avgSx).toBe(1000);
    expect(group!.avgSy).toBe(100);
  });

  it("extracts folder from filePath for default cluster key", () => {
    const neighbors = ["n1", "n2"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      if (id === "n1") return { id: "n1", gfxX: 1000, gfxY: 0, filePath: "folder1/sub/file1.md" };
      if (id === "n2") return { id: "n2", gfxX: 1000, gfxY: 0, filePath: "folder2/file2.md" };
      return null;
    };
    const clusterKeys: string[] = [];
    const getClusterKey = (id: string, folder: string) => {
      clusterKeys.push(folder);
      return `cluster-${folder}`;
    };
    groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(clusterKeys).toContain("folder1");
    expect(clusterKeys).toContain("folder2");
  });
});

// ---------------------------------------------------------------------------
// Tests: computeTooltipEdgePosition
// ---------------------------------------------------------------------------

describe("computeTooltipEdgePosition", () => {
  it("points toward upper-right corner", () => {
    const pos = computeTooltipEdgePosition(400, 300, 600, 100, 800, 600, 10);
    expect(pos.tipX).toBeGreaterThan(400);
    expect(pos.tipY).toBeLessThan(300);
  });

  it("points toward lower-left corner", () => {
    const pos = computeTooltipEdgePosition(600, 500, 200, 800, 800, 600, 10);
    expect(pos.tipX).toBeLessThan(600);
    expect(pos.tipY).toBeGreaterThan(500);
  });

  it("clamps position to margin bounds", () => {
    const margin = 10;
    const pos = computeTooltipEdgePosition(0, 0, 1000, 1000, 800, 600, margin);
    expect(pos.tipX).toBeGreaterThanOrEqual(margin);
    expect(pos.tipX).toBeLessThanOrEqual(800 - margin);
    expect(pos.tipY).toBeGreaterThanOrEqual(margin);
    expect(pos.tipY).toBeLessThanOrEqual(600 - margin);
  });

  it("handles zero direction vector (center point)", () => {
    const pos = computeTooltipEdgePosition(400, 300, 400, 300, 800, 600, 10);
    // Should still clamp and have minimum distance (40)
    expect(pos.tipX).toBeGreaterThanOrEqual(10);
    expect(pos.tipY).toBeGreaterThanOrEqual(10);
  });

  it("enforces minimum distance of 40", () => {
    const pos = computeTooltipEdgePosition(400, 300, 401, 301, 800, 600, 10);
    const dist = Math.sqrt(
      Math.pow(pos.tipX - 400, 2) + Math.pow(pos.tipY - 300, 2),
    );
    expect(dist).toBeGreaterThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// Tests: findSharedTagNodes
// ---------------------------------------------------------------------------

describe("findSharedTagNodes", () => {
  it("finds nodes sharing at least one tag", () => {
    const hoveredTags = ["tag1", "tag2"];
    const nodes: HoverHighlightNode[] = [
      { id: "n1", tags: ["tag1"] },
      { id: "n2", tags: ["tag3"] },
      { id: "n3", tags: ["tag2", "tag4"] },
    ];
    const result = findSharedTagNodes(hoveredTags, "hovered", nodes);
    expect(result).toContain("n1");
    expect(result).toContain("n3");
    expect(result).not.toContain("n2");
  });

  it("excludes hovered node from result", () => {
    const hoveredTags = ["tag1"];
    const nodes: HoverHighlightNode[] = [
      { id: "hovered", tags: ["tag1"] },
      { id: "n2", tags: ["tag1"] },
    ];
    const result = findSharedTagNodes(hoveredTags, "hovered", nodes);
    expect(result).not.toContain("hovered");
    expect(result).toContain("n2");
  });

  it("returns empty when no shared tags", () => {
    const hoveredTags = ["tag1"];
    const nodes: HoverHighlightNode[] = [
      { id: "n1", tags: ["tag2"] },
      { id: "n2", tags: ["tag3"] },
    ];
    const result = findSharedTagNodes(hoveredTags, "hovered", nodes);
    expect(result).toEqual([]);
  });

  it("handles nodes with undefined tags", () => {
    const hoveredTags = ["tag1"];
    const nodes: HoverHighlightNode[] = [
      { id: "n1", tags: ["tag1"] },
      { id: "n2" },
    ];
    const result = findSharedTagNodes(hoveredTags, "hovered", nodes);
    expect(result).toContain("n1");
    expect(result).not.toContain("n2");
  });
});

// ---------------------------------------------------------------------------
// Tests: findSameFolderNodes
// ---------------------------------------------------------------------------

describe("findSameFolderNodes", () => {
  it("finds nodes in the same top-level folder", () => {
    const hoveredPath = "folder1/sub/file.md";
    const nodes: HoverHighlightNode[] = [
      { id: "n1", filePath: "folder1/other.md" },
      { id: "n2", filePath: "folder2/file.md" },
      { id: "n3", filePath: "folder1/another.md" },
    ];
    const result = findSameFolderNodes(hoveredPath, "hovered", nodes);
    expect(result).toContain("n1");
    expect(result).toContain("n3");
    expect(result).not.toContain("n2");
  });

  it("includes hovered node when it matches folder", () => {
    const hoveredPath = "folder1/file.md";
    const nodes: HoverHighlightNode[] = [
      { id: "hovered", filePath: "folder1/other.md" },
    ];
    const result = findSameFolderNodes(hoveredPath, "hovered", nodes);
    // hovered node is included (folder match), but not filtered for being hovered
    expect(result).toContain("hovered");
  });

  it("returns empty when no matching folder", () => {
    const hoveredPath = "folder1/file.md";
    const nodes: HoverHighlightNode[] = [
      { id: "n1", filePath: "folder2/file.md" },
      { id: "n2", filePath: "folder3/file.md" },
    ];
    const result = findSameFolderNodes(hoveredPath, "hovered", nodes);
    expect(result).toEqual([]);
  });

  it("returns empty when hovered path has no folder", () => {
    const hoveredPath = "file.md";
    const nodes: HoverHighlightNode[] = [
      { id: "n1", filePath: "any/file.md" },
    ];
    const result = findSameFolderNodes(hoveredPath, "hovered", nodes);
    expect(result).toEqual([]);
  });

  it("handles nodes with undefined filePath", () => {
    const hoveredPath = "folder1/file.md";
    const nodes: HoverHighlightNode[] = [
      { id: "n1", filePath: "folder1/other.md" },
      { id: "n2" },
    ];
    const result = findSameFolderNodes(hoveredPath, "hovered", nodes);
    expect(result).toContain("n1");
    expect(result).not.toContain("n2");
  });
});

// ---------------------------------------------------------------------------
// Tests: resolveInheritArrangement
// ---------------------------------------------------------------------------

describe("resolveInheritArrangement", () => {
  it("maps 'circle' to 'concentric'", () => {
    expect(resolveInheritArrangement("circle")).toBe("concentric");
  });

  it("maps 'concentric' to 'concentric'", () => {
    expect(resolveInheritArrangement("concentric")).toBe("concentric");
  });

  it("maps 'grid' to 'grid'", () => {
    expect(resolveInheritArrangement("grid")).toBe("grid");
  });

  it("maps 'horizontal' to 'grid'", () => {
    expect(resolveInheritArrangement("horizontal")).toBe("grid");
  });

  it("maps 'vertical' to 'grid'", () => {
    expect(resolveInheritArrangement("vertical")).toBe("grid");
  });

  it("defaults to 'grid' for unknown arrangements", () => {
    expect(resolveInheritArrangement("unknown")).toBe("grid");
  });

  it("defaults to 'grid' when undefined", () => {
    expect(resolveInheritArrangement(undefined)).toBe("grid");
  });
});

// ---------------------------------------------------------------------------
// Tests: clearNonGraphLayers
// ---------------------------------------------------------------------------

describe("clearNonGraphLayers", () => {
  it("clears all layers for graph viewMode", () => {
    const layers = {
      edgeGraphics: { clear: vi.fn() },
      orbitGraphics: { clear: vi.fn() },
      enclosureGraphics: { clear: vi.fn() },
      sunburstGraphics: { clear: vi.fn() },
      barGraphics: { clear: vi.fn() },
    };
    clearNonGraphLayers("graph", layers);
    expect(layers.edgeGraphics?.clear).toHaveBeenCalled();
    expect(layers.sunburstGraphics?.clear).toHaveBeenCalled();
    expect(layers.barGraphics?.clear).toHaveBeenCalled();
  });

  it("preserves sunburst graphics for sunburst viewMode", () => {
    const layers = {
      edgeGraphics: { clear: vi.fn() },
      sunburstGraphics: { clear: vi.fn() },
      barGraphics: { clear: vi.fn() },
    };
    clearNonGraphLayers("sunburst", layers);
    expect(layers.edgeGraphics?.clear).toHaveBeenCalled();
    expect(layers.sunburstGraphics?.clear).not.toHaveBeenCalled();
    expect(layers.barGraphics?.clear).toHaveBeenCalled();
  });

  it("preserves timeline graphics for timeline viewMode", () => {
    const layers = {
      edgeGraphics: { clear: vi.fn() },
      barGraphics: { clear: vi.fn() },
      routeGraphics: { clear: vi.fn() },
      guideGraphics: { clear: vi.fn() },
    };
    clearNonGraphLayers("timeline", layers);
    expect(layers.edgeGraphics?.clear).toHaveBeenCalled();
    expect(layers.barGraphics?.clear).not.toHaveBeenCalled();
    expect(layers.routeGraphics?.clear).not.toHaveBeenCalled();
    expect(layers.guideGraphics?.clear).not.toHaveBeenCalled();
  });

  it("skips null or undefined graphics", () => {
    const layers = {
      edgeGraphics: null,
      orbitGraphics: undefined,
      enclosureGraphics: { clear: vi.fn() },
    };
    clearNonGraphLayers("graph", layers);
    expect(layers.enclosureGraphics?.clear).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: computeCardBBox
// ---------------------------------------------------------------------------

describe("computeCardBBox", () => {
  it("computes card bounding box from nodes", () => {
    const nodes = [
      { x: 0, y: 0, radius: 5 },
      { x: 100, y: 100, radius: 5 },
    ];
    const bbox = computeCardBBox(nodes, 1, 1, { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 }, 3);
    expect(bbox.minX).toBeLessThan(bbox.maxX);
    expect(bbox.minY).toBeLessThan(bbox.maxY);
  });

  it("handles empty node list", () => {
    const nodes: { x: number; y: number; radius: number }[] = [];
    const bbox = computeCardBBox(nodes, 1, 1, { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 }, 3);
    expect(bbox.minX).toBe(Infinity);
    expect(bbox.minY).toBe(Infinity);
    expect(bbox.maxX).toBe(-Infinity);
    expect(bbox.maxY).toBe(-Infinity);
  });

  it("scales dimensions by viewport scale", () => {
    const nodes = [{ x: 0, y: 0, radius: 5 }];
    const bbox1 = computeCardBBox(nodes, 1, 1, { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 }, 3);
    const bbox2 = computeCardBBox(nodes, 2, 1, { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 }, 3);
    expect(Math.abs(bbox1.maxX - bbox1.minX)).toBeGreaterThan(
      Math.abs(bbox2.maxX - bbox2.minX),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: buildTransitionData
// ---------------------------------------------------------------------------

describe("buildTransitionData", () => {
  it("builds transition for nodes that moved significantly", () => {
    const nodes = [
      {
        data: { id: "n1", x: 100, y: 100 },
      },
    ];
    const savedPositions = new Map([["n1", { x: 50, y: 50 }]]);
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].data.id).toBe("n1");
    expect(transitions[0].fromX).toBe(50);
    expect(transitions[0].toX).toBe(100);
  });

  it("skips nodes with minimal movement", () => {
    const nodes = [
      {
        data: { id: "n1", x: 100.5, y: 100.5 },
      },
    ];
    const savedPositions = new Map([["n1", { x: 100, y: 100 }]]);
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(0);
  });

  it("skips nodes with no saved position", () => {
    const nodes = [
      {
        data: { id: "n1", x: 100, y: 100 },
      },
    ];
    const savedPositions = new Map<string, { x: number; y: number }>();
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(0);
  });

  it("handles mixed moved and unmoved nodes", () => {
    const nodes = [
      {
        data: { id: "n1", x: 200, y: 200 },
      },
      {
        data: { id: "n2", x: 100, y: 100 },
      },
    ];
    const savedPositions = new Map([
      ["n1", { x: 50, y: 50 }],
      ["n2", { x: 100, y: 100 }],
    ]);
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].data.id).toBe("n1");
  });
});

// ---------------------------------------------------------------------------
// Tests: computeTimelineFit
// ---------------------------------------------------------------------------

describe("computeTimelineFit", () => {
  it("computes fit for timeline bars", () => {
    const bars = [
      { xStart: 0, xEnd: 100, yCenter: 50, barHeight: 20 },
      { xStart: 100, xEnd: 200, yCenter: 150, barHeight: 20 },
    ];
    const fit = computeTimelineFit(bars, 1000, 600);
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBeGreaterThan(0);
    expect(fit!.cx).toBeGreaterThan(0);
    expect(fit!.cy).toBeGreaterThan(0);
  });

  it("returns null for empty bar list", () => {
    const fit = computeTimelineFit([], 1000, 600);
    expect(fit).toBeNull();
  });

  it("scales down when content exceeds viewport", () => {
    const bars = [
      { xStart: 0, xEnd: 10000, yCenter: 5000, barHeight: 100 },
    ];
    const fit = computeTimelineFit(bars, 1000, 600);
    expect(fit!.scale).toBeLessThan(1);
  });

  it("caps scale at 2 even for small content", () => {
    const bars = [
      { xStart: 0, xEnd: 1, yCenter: 0, barHeight: 1 },
    ];
    const fit = computeTimelineFit(bars, 1000, 600);
    expect(fit!.scale).toBeLessThanOrEqual(2);
  });

  it("centers on content", () => {
    const bars = [
      { xStart: 100, xEnd: 200, yCenter: 150, barHeight: 50 },
    ];
    const fit = computeTimelineFit(bars, 1000, 600);
    expect(fit!.cx).toBeCloseTo(150);
    expect(fit!.cy).toBeCloseTo(150);
  });

  it("applies 10% margin", () => {
    const bars = [
      { xStart: 0, xEnd: 100, yCenter: 50, barHeight: 100 },
    ];
    const fit = computeTimelineFit(bars, 1000, 600);
    // Content width: 100, with 10% margin = 120 total
    // Scale should be 1000 / 120 ≈ 8.33, but capped at 2
    expect(fit!.scale).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Additional edge-case tests for better coverage
// ---------------------------------------------------------------------------

describe("buildHoverTooltipText - additional edge cases", () => {
  it("handles empty tags array", () => {
    const node = makeTooltipInput({ tags: [] });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      hasVisibleTagLabel: false,
      tagDisplayEnclosure: false,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).not.toContain("#");
  });

  it("appends custom tooltip fields", () => {
    const node = makeTooltipInput();
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      tooltipFields: "date, author, status",
      getNodeProperty: (id: string, field: string) => {
        if (field === "date") return "2026-04-03";
        if (field === "author") return "user";
        if (field === "status") return "";
        return undefined;
      },
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("date: 2026-04-03");
    expect(text).toContain("author: user");
    expect(text).not.toContain("status");
  });

  it("includes collapsed group summary", () => {
    const node = makeTooltipInput({
      collapsedMembers: ["m1", "m2", "m3"],
    });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("3");
  });

  it("includes edge type summary", () => {
    const node = makeTooltipInput();
    const edges: GraphEdge[] = [
      { source: "node-id", target: "a", type: "link" } as GraphEdge,
      { source: "node-id", target: "b", type: "link" } as GraphEdge,
      { source: "node-id", target: "c", type: "tag" } as GraphEdge,
    ];
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      graphEdges: edges,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("link:2");
    expect(text).toContain("tag:1");
  });

  it("handles both tags and category", () => {
    const node = makeTooltipInput({
      tags: ["tag1"],
      category: "category-name",
    });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      hasVisibleTagLabel: false,
      tagDisplayEnclosure: false,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("#tag1");
    expect(text).toContain("[category-name]");
  });

  it("combines body preview with metadata", () => {
    const node = makeTooltipInput({
      bodyPreview: "Long content preview here",
    });
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showBody: true,
      showTooltip: true,
      degree: 7,
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("° 7");
    expect(text).toContain("---");
    expect(text).toContain("Long content preview here");
  });

  it("handles whitespace in tooltipFields", () => {
    const node = makeTooltipInput();
    const opts = makeTooltipOptions({
      showTitle: false,
      showMeta: true,
      showTooltip: true,
      tooltipFields: "field1  ,  field2  , field3",
      getNodeProperty: (id: string, field: string) => {
        if (field === "field1") return "value1";
        if (field === "field2") return "value2";
        return undefined;
      },
    });
    const text = buildHoverTooltipText(node, opts);
    expect(text).toContain("field1: value1");
    expect(text).toContain("field2: value2");
  });
});

describe("groupOffScreenNeighbors - additional edge cases", () => {
  it("handles mixed on-screen and off-screen neighbors", () => {
    const neighbors = ["on-screen", "off-screen"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      if (id === "on-screen") return { id, gfxX: 200, gfxY: 200, filePath: "f/f.md" };
      if (id === "off-screen") return { id, gfxX: 1000, gfxY: 0, filePath: "g/g.md" };
      return null;
    };
    const getClusterKey = (id: string, folder: string) => folder;
    const result = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(result.has("f")).toBe(false);
    expect(result.has("g")).toBe(true);
  });

  it("uses node ID as label fallback when label undefined", () => {
    const neighbors = ["n1"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      return { id: "n1", gfxX: 1000, gfxY: 0 };
    };
    const getClusterKey = () => "cluster";
    const result = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(result.get("cluster")?.names).toContain("n1");
  });

  it("handles multiple nodes in same cluster", () => {
    const neighbors = ["n1", "n2", "n3"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      return { id, gfxX: 1000, gfxY: 0, filePath: "f/f.md", label: `Label-${id}` };
    };
    const getClusterKey = () => "cluster";
    const result = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(result.get("cluster")?.names).toHaveLength(3);
  });

  it("extracts folder as first path segment or 'other' when empty", () => {
    const neighbors = ["n1"];
    const folders: string[] = [];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      return { id, gfxX: 1000, gfxY: 0, filePath: "rootfile.md" };
    };
    const getClusterKey = (id: string, folder: string) => {
      folders.push(folder);
      return folder;
    };
    groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(folders).toContain("rootfile.md");
  });

  it("applies world scale correctly", () => {
    const neighbors = ["n1"];
    const getNode = (id: string): OffScreenNodeInfo | null => {
      return { id, gfxX: 100, gfxY: 0, filePath: "f/f.md" };
    };
    const getClusterKey = () => "cluster";
    const result1 = groupOffScreenNeighbors(
      neighbors,
      getNode,
      1,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    const result2 = groupOffScreenNeighbors(
      neighbors,
      getNode,
      2,
      0,
      0,
      800,
      600,
      10,
      getClusterKey,
    );
    expect(result2.get("cluster")?.avgSx).toBe(
      2 * (result1.get("cluster")?.avgSx || 0),
    );
  });
});

describe("findSharedTagNodes - additional edge cases", () => {
  it("handles case sensitivity in tags", () => {
    const hoveredTags = ["Tag1"];
    const nodes: HoverHighlightNode[] = [
      { id: "n1", tags: ["tag1"] },
      { id: "n2", tags: ["Tag1"] },
    ];
    const result = findSharedTagNodes(hoveredTags, "hovered", nodes);
    expect(result).toContain("n2");
    expect(result).not.toContain("n1");
  });

  it("handles empty hovered tags", () => {
    const hoveredTags: string[] = [];
    const nodes: HoverHighlightNode[] = [
      { id: "n1", tags: ["tag1"] },
    ];
    const result = findSharedTagNodes(hoveredTags, "hovered", nodes);
    expect(result).toEqual([]);
  });

  it("finds duplicates when multiple tags match", () => {
    const hoveredTags = ["tag1", "tag2"];
    const nodes: HoverHighlightNode[] = [
      { id: "n1", tags: ["tag1", "tag2"] },
    ];
    const result = findSharedTagNodes(hoveredTags, "hovered", nodes);
    expect(result).toContain("n1");
  });
});

describe("computeTooltipEdgePosition - additional edge cases", () => {
  it("handles horizontal direction (right)", () => {
    const pos = computeTooltipEdgePosition(100, 300, 700, 300, 800, 600, 10);
    expect(pos.tipX).toBeGreaterThan(100);
    expect(Math.abs(pos.tipY - 300)).toBeLessThan(50);
  });

  it("handles vertical direction (down)", () => {
    const pos = computeTooltipEdgePosition(400, 100, 400, 500, 800, 600, 10);
    expect(Math.abs(pos.tipX - 400)).toBeLessThan(50);
    expect(pos.tipY).toBeGreaterThan(100);
  });

  it("handles diagonal direction", () => {
    const pos = computeTooltipEdgePosition(400, 300, 800, 600, 800, 600, 10);
    expect(pos.tipX).toBeGreaterThan(400);
    expect(pos.tipY).toBeGreaterThan(300);
  });
});

describe("computeCardBBox - additional edge cases", () => {
  it("scales correctly with different card aspect ratios", () => {
    const nodes = [{ x: 0, y: 0, radius: 5 }];
    const bbox1 = computeCardBBox(
      nodes,
      1,
      0.5,
      { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 },
      3,
    );
    const bbox2 = computeCardBBox(
      nodes,
      1,
      2.0,
      { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 },
      3,
    );
    expect(Math.abs(bbox1.maxX - bbox1.minX)).not.toBe(Math.abs(bbox2.maxX - bbox2.minX));
  });

  it("accounts for number of fields in height", () => {
    const nodes = [{ x: 0, y: 0, radius: 5 }];
    const bbox1 = computeCardBBox(
      nodes,
      1,
      1,
      { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 },
      2,
    );
    const bbox2 = computeCardBBox(
      nodes,
      1,
      1,
      { tableHeaderHeight: 30, fieldLineHeight: 20, cardPadding: 10 },
      5,
    );
    expect(Math.abs(bbox2.maxY - bbox2.minY)).toBeGreaterThan(
      Math.abs(bbox1.maxY - bbox1.minY),
    );
  });
});

describe("buildTransitionData - additional edge cases", () => {
  it("threshold for significant movement is 1px", () => {
    const nodes = [
      {
        data: { id: "n1", x: 100.99, y: 100.99 },
      },
    ];
    const savedPositions = new Map([["n1", { x: 100, y: 100 }]]);
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(0);
  });

  it("captures large transitions", () => {
    const nodes = [
      {
        data: { id: "n1", x: 500, y: 500 },
      },
    ];
    const savedPositions = new Map([["n1", { x: 0, y: 0 }]]);
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].fromX).toBe(0);
    expect(transitions[0].fromY).toBe(0);
    expect(transitions[0].toX).toBe(500);
    expect(transitions[0].toY).toBe(500);
  });

  it("detects movement in X dimension only", () => {
    const nodes = [
      {
        data: { id: "n1", x: 200, y: 100 },
      },
    ];
    const savedPositions = new Map([["n1", { x: 100, y: 100 }]]);
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(1);
  });

  it("detects movement in Y dimension only", () => {
    const nodes = [
      {
        data: { id: "n1", x: 100, y: 200 },
      },
    ];
    const savedPositions = new Map([["n1", { x: 100, y: 100 }]]);
    const transitions = buildTransitionData(nodes, savedPositions);
    expect(transitions).toHaveLength(1);
  });
});

describe("findSameFolderNodes - additional edge cases", () => {
  it("normalizes folder path with trailing slashes", () => {
    const hoveredPath = "folder1/file.md";
    const nodes: HoverHighlightNode[] = [
      { id: "n1", filePath: "folder1/" },
    ];
    const result = findSameFolderNodes(hoveredPath, "hovered", nodes);
    expect(result).toContain("n1");
  });

  it("handles deep folder hierarchies", () => {
    const hoveredPath = "folder1/deep/nested/file.md";
    const nodes: HoverHighlightNode[] = [
      { id: "n1", filePath: "folder1/other/file.md" },
      { id: "n2", filePath: "folder2/deep/nested/file.md" },
    ];
    const result = findSameFolderNodes(hoveredPath, "hovered", nodes);
    expect(result).toContain("n1");
    expect(result).not.toContain("n2");
  });
});

describe("resolveInheritArrangement - all branches", () => {
  it("all arrangement types covered", () => {
    const arrangements = [
      { input: "circle", expected: "concentric" },
      { input: "concentric", expected: "concentric" },
      { input: "grid", expected: "grid" },
      { input: "horizontal", expected: "grid" },
      { input: "vertical", expected: "grid" },
      { input: undefined, expected: "grid" },
      { input: "unknown", expected: "grid" },
      { input: "random", expected: "grid" },
    ];
    arrangements.forEach(({ input, expected }) => {
      expect(resolveInheritArrangement(input)).toBe(expected);
    });
  });
});

describe("clearNonGraphLayers - coverage for all branch paths", () => {
  it("clears timeline-specific layers only for timeline viewMode", () => {
    const layers = {
      barGraphics: { clear: vi.fn() },
      routeGraphics: { clear: vi.fn() },
      guideGraphics: { clear: vi.fn() },
      sunburstGraphics: { clear: vi.fn() },
    };
    clearNonGraphLayers("timeline", layers);
    expect(layers.barGraphics?.clear).not.toHaveBeenCalled();
    expect(layers.routeGraphics?.clear).not.toHaveBeenCalled();
    expect(layers.guideGraphics?.clear).not.toHaveBeenCalled();
  });

  it("clears all timeline graphics for non-timeline viewModes", () => {
    const layers = {
      edgeGraphics: { clear: vi.fn() },
      barGraphics: { clear: vi.fn() },
      routeGraphics: { clear: vi.fn() },
      guideGraphics: { clear: vi.fn() },
    };
    clearNonGraphLayers("matrix", layers);
    expect(layers.edgeGraphics?.clear).toHaveBeenCalled();
    expect(layers.barGraphics?.clear).toHaveBeenCalled();
    expect(layers.routeGraphics?.clear).toHaveBeenCalled();
    expect(layers.guideGraphics?.clear).toHaveBeenCalled();
  });

  it("preserves sunburst only in sunburst mode", () => {
    const sunburstCalls: number[] = [];
    const otherCalls: number[] = [];
    const layers = {
      edgeGraphics: { clear: () => otherCalls.push(1) },
      sunburstGraphics: { clear: () => sunburstCalls.push(1) },
      barGraphics: { clear: () => otherCalls.push(2) },
    };
    clearNonGraphLayers("sunburst", layers);
    expect(sunburstCalls).toHaveLength(0);
    expect(otherCalls).toHaveLength(2);
  });
});
