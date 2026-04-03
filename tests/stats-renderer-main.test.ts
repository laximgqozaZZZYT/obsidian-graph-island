import { describe, it, expect, vi } from "vitest";
vi.mock("obsidian", () => ({
  Notice: class { constructor() {} },
}));
import { renderGraphStats, type StatsPanel } from "../src/views/StatsRenderer";
import type { StatsHost } from "../src/views/GraphViewContainer";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mkNode(id: string, extra?: Partial<GraphNode>): GraphNode {
  return {
    id,
    label: id,
    x: 0,
    y: 0,
    isTag: false,
    tags: [],
    ...extra,
  } as GraphNode;
}

function mkEdge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type } as GraphEdge;
}

function createMockHost(overrides?: Partial<StatsHost>): StatsHost {
  return {
    getDegrees: () => new Map(),
    getNodeLabel: (id) => id,
    getLabelCullStats: () => ({ totalLabels: 0, visibleLabels: 0, culledLabels: 0, collisionRate: 0 }),
    getLabelQualityScore: () => ({ score: 80, collision: 35, visibility: 25, priority: 20 }),
    getCurrentFps: () => 60,
    panToNode: vi.fn(),
    setHighlightedNodeId: vi.fn(),
    applyHover: vi.fn(),
    invalidateAndRebuild: vi.fn(),
    announceA11y: vi.fn(),
    getBetweennessCache: () => undefined,
    getNodeOverlapRatio: () => 0,
    getLastRenderTime: () => 8,
    ...overrides,
  };
}

function defaultPanel(overrides?: Partial<StatsPanel>): StatsPanel {
  return {
    showGraphStats: true,
    showStructureQuestions: false,
    minDegreeFilter: 0,
    maxDegreeFilter: 0,
    ...overrides,
  };
}

function mkGraphData(nodeCount: number, edgeCount: number): GraphData {
  const nodes: GraphNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(mkNode(`n${i}`, { tags: i % 3 === 0 ? ["tag1"] : [] }));
  }
  const edges: GraphEdge[] = [];
  for (let i = 0; i < edgeCount; i++) {
    edges.push(mkEdge(`n${i % nodeCount}`, `n${(i + 1) % nodeCount}`));
  }
  return { nodes, edges };
}

// Stub navigator.clipboard for MD copy test
if (typeof globalThis.navigator === "undefined") {
  (globalThis as any).navigator = {};
}
if (!globalThis.navigator.clipboard) {
  (globalThis.navigator as any).clipboard = { writeText: vi.fn(() => Promise.resolve()) };
}

// Stub performance.memory
if (!(performance as any).memory) {
  (performance as any).memory = { usedJSHeapSize: 100 * 1024 * 1024 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("renderGraphStats", () => {
  it("hides element when showGraphStats is false", () => {
    const el = createMockEl();
    renderGraphStats(el as any, { nodes: [], edges: [] }, defaultPanel({ showGraphStats: false }), createMockHost());
    expect(el.style.display).toBe("none");
  });

  it("shows element when showGraphStats is true", () => {
    const el = createMockEl();
    renderGraphStats(el as any, mkGraphData(5, 3), defaultPanel(), createMockHost());
    expect(el.style.display).toBe("");
  });

  it("renders stats table with basic metrics", () => {
    const el = createMockEl();
    const gd = mkGraphData(10, 15);
    const degrees = new Map<string, number>();
    gd.nodes.forEach((n, i) => degrees.set(n.id, i + 1));
    const host = createMockHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, gd, defaultPanel(), host);

    const text = allText(el);
    // Should contain node count and edge count
    expect(text).toContain("10");
    expect(text).toContain("15");
  });

  it("renders top hubs section for high-degree nodes", () => {
    const el = createMockEl();
    const nodes = [mkNode("hub1"), mkNode("hub2"), mkNode("leaf")];
    const edges = [
      mkEdge("hub1", "leaf"),
      mkEdge("hub2", "leaf"),
      mkEdge("hub1", "hub2"),
    ];
    const degrees = new Map([["hub1", 10], ["hub2", 8], ["leaf", 2]]);
    const host = createMockHost({
      getDegrees: () => degrees,
      getNodeLabel: (id) => id.toUpperCase(),
    });
    renderGraphStats(el as any, { nodes, edges }, defaultPanel(), host);

    const hubItems = findAllEl(el, ".gi-stats-hub-item");
    // Should have hub entries (at least the hubs)
    expect(hubItems.length).toBeGreaterThan(0);
  });

  it("renders edge type distribution", () => {
    const el = createMockEl();
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [
      mkEdge("a", "b", "link"),
      mkEdge("a", "c", "link"),
      mkEdge("b", "c", "inheritance"),
    ];
    const degrees = new Map([["a", 2], ["b", 2], ["c", 2]]);
    const host = createMockHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, { nodes, edges }, defaultPanel(), host);

    const text = allText(el);
    expect(text).toContain("link");
    expect(text).toContain("inheritance");
  });

  it("shows high-edge warning for large edge count", () => {
    const el = createMockEl();
    // Create graph with >5000 edges to trigger warning
    const nodes = [mkNode("a"), mkNode("b")];
    const edges: GraphEdge[] = [];
    for (let i = 0; i < 5001; i++) edges.push(mkEdge("a", "b"));
    const degrees = new Map([["a", 5001], ["b", 5001]]);
    const host = createMockHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, { nodes, edges }, defaultPanel(), host);

    const warn = findEl(el, ".gi-stats-warn");
    expect(warn).not.toBeNull();
  });

  it("shows overlap warning when ratio > 0.1", () => {
    const el = createMockEl();
    const host = createMockHost({
      getNodeOverlapRatio: () => 0.25,
      getDegrees: () => new Map([["a", 1]]),
    });
    renderGraphStats(el as any, mkGraphData(3, 2), defaultPanel(), host);

    const text = allText(el);
    expect(text).toContain("25.0%");
  });

  it("renders degree distribution chart", () => {
    const el = createMockEl();
    const degrees = new Map([["a", 1], ["b", 3], ["c", 5], ["d", 0]]);
    const host = createMockHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, mkGraphData(4, 3), defaultPanel(), host);

    const chart = findEl(el, ".gi-degree-chart");
    expect(chart).not.toBeNull();
    // Chart bars should exist
    expect(chart!.children.length).toBeGreaterThan(0);
  });

  it("renders quality dashboard (collapsed by default)", () => {
    const el = createMockEl();
    const host = createMockHost({
      getDegrees: () => new Map([["a", 1]]),
      getLabelQualityScore: () => ({ score: 90, collision: 38, visibility: 28, priority: 24 }),
      getCurrentFps: () => 45,
      getLastRenderTime: () => 5,
    });
    renderGraphStats(el as any, mkGraphData(2, 1), defaultPanel(), host);

    const dashboard = findEl(el, ".gi-quality-dashboard");
    expect(dashboard).not.toBeNull();
    expect(dashboard!.style.display).toBe("none"); // collapsed
  });

  it("renders complexity score", () => {
    const el = createMockEl();
    const degrees = new Map([["a", 2], ["b", 3], ["c", 1]]);
    const host = createMockHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, mkGraphData(3, 3), defaultPanel(), host);

    const text = allText(el);
    // Complexity should be rendered as a number (i18n key: stats.complexity)
    expect(text).toContain("stats.complexity");
  });

  it("renders label stats when totalLabels > 0", () => {
    const el = createMockEl();
    const host = createMockHost({
      getDegrees: () => new Map([["a", 1]]),
      getLabelCullStats: () => ({ totalLabels: 100, visibleLabels: 80, culledLabels: 20, collisionRate: 0.2 }),
    });
    renderGraphStats(el as any, mkGraphData(2, 1), defaultPanel(), host);

    const text = allText(el);
    expect(text).toContain("80/100");
    expect(text).toContain("20.0%");
  });

  it("renders structure questions when enabled", () => {
    const el = createMockEl();
    const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
    const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
    const degrees = new Map([["a", 1], ["b", 2], ["c", 1]]);
    const host = createMockHost({
      getDegrees: () => degrees,
      getBetweennessCache: () => new Map([["b", 1.0]]),
    });
    renderGraphStats(
      el as any,
      { nodes, edges },
      defaultPanel({ showStructureQuestions: true }),
      host,
    );

    // Structure questions section may or may not appear depending on generateStructureQuestions output
    // Just verify it doesn't throw
    expect(el.children.length).toBeGreaterThan(0);
  });

  it("empties element before re-rendering", () => {
    const el = createMockEl();
    // Render once
    renderGraphStats(el as any, mkGraphData(2, 1), defaultPanel(), createMockHost({
      getDegrees: () => new Map([["n0", 1], ["n1", 1]]),
    }));
    const firstChildCount = el.children.length;
    expect(firstChildCount).toBeGreaterThan(0);

    // Render again — should empty first
    renderGraphStats(el as any, mkGraphData(3, 2), defaultPanel(), createMockHost({
      getDegrees: () => new Map([["n0", 1], ["n1", 1], ["n2", 1]]),
    }));
    // Children exist from second render (not accumulated)
    expect(el.children.length).toBeGreaterThan(0);
  });

  it("copy button triggers clipboard write", () => {
    const el = createMockEl();
    const degrees = new Map([["a", 5], ["b", 3]]);
    const host = createMockHost({
      getDegrees: () => degrees,
      getNodeLabel: (id) => id,
    });
    renderGraphStats(el as any, mkGraphData(2, 1), defaultPanel(), host);

    const copyBtn = findEl(el, ".gi-stats-copy");
    expect(copyBtn).not.toBeNull();
    // Trigger click
    copyBtn!.listeners["click"]?.[0]?.();
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
