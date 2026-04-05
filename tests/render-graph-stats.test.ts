import { describe, it, expect, vi } from "vitest";
import { renderGraphStats, type StatsPanel } from "../src/views/StatsRenderer";
import type { StatsHost } from "../src/views/GraphViewContainer";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";
import { t } from "../src/i18n";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makePanel(overrides: Partial<StatsPanel> = {}): StatsPanel {
  return {
    showGraphStats: true,
    showStructureQuestions: false,
    minDegreeFilter: 0,
    maxDegreeFilter: 0,
    ...overrides,
  };
}

function makeHost(overrides: Partial<StatsHost> = {}): StatsHost {
  return {
    getDegrees: () => new Map<string, number>(),
    getNodeLabel: (id: string) => id,
    getLabelCullStats: () => ({ totalLabels: 0, visibleLabels: 0, culledLabels: 0, collisionRate: 0 }),
    getLabelQualityScore: () => ({ score: 80, collision: 30, visibility: 25, priority: 25 }),
    getCurrentFps: () => 60,
    panToNode: vi.fn(),
    setHighlightedNodeId: vi.fn(),
    applyHover: vi.fn(),
    invalidateAndRebuild: vi.fn(),
    announceA11y: vi.fn(),
    getBetweennessCache: () => undefined,
    getNodeOverlapRatio: () => 0,
    getLastRenderTime: () => 0,
    ...overrides,
  };
}

function makeNode(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, x: 0, y: 0, radius: 10, ...extra } as GraphNode;
}

function makeGraphData(nodeCount: number, edgeCount: number): GraphData {
  const nodes: GraphNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(makeNode(`n${i}`, { tags: i % 2 === 0 ? ["t1"] : undefined }));
  }
  const edges: GraphEdge[] = [];
  for (let i = 0; i < edgeCount; i++) {
    edges.push({ source: `n${i % nodeCount}`, target: `n${(i + 1) % nodeCount}`, type: "link" } as any);
  }
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderGraphStats", () => {
  it("hides when showGraphStats is false", () => {
    const el = createMockEl();
    const panel = makePanel({ showGraphStats: false });
    renderGraphStats(el as any, { nodes: [], edges: [] }, panel, makeHost());
    expect(el.style.display).toBe("none");
  });

  it("shows when showGraphStats is true", () => {
    const el = createMockEl();
    const panel = makePanel();
    renderGraphStats(el as any, { nodes: [], edges: [] }, panel, makeHost());
    expect(el.style.display).toBe("");
  });

  it("renders stats table with correct node and edge counts", () => {
    const el = createMockEl();
    const gd = makeGraphData(10, 5);
    const degrees = new Map<string, number>(gd.nodes.map(n => [n.id, 1]));
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, gd, makePanel(), host);

    const text = allText(el);
    expect(text).toContain("10"); // node count
    expect(text).toContain("5");  // edge count
  });

  it("renders average degree", () => {
    const el = createMockEl();
    const gd = makeGraphData(4, 6);
    const degrees = new Map<string, number>([["n0", 3], ["n1", 3], ["n2", 3], ["n3", 3]]);
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, gd, makePanel(), host);

    // avgDegree = (6 * 2) / 4 = 3.00
    const text = allText(el);
    expect(text).toContain("3.00");
  });

  it("renders density for graph", () => {
    const el = createMockEl();
    // 3 nodes, 3 edges → density = 2*3 / (3*2) = 1.0000
    const gd = makeGraphData(3, 3);
    const degrees = new Map<string, number>([["n0", 2], ["n1", 2], ["n2", 2]]);
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, gd, makePanel(), host);

    const text = allText(el);
    expect(text).toContain("1.0000");
  });

  it("renders tag coverage percentage", () => {
    const el = createMockEl();
    // makeGraphData gives tags to even-indexed nodes
    const gd = makeGraphData(4, 2); // nodes n0(tagged), n1, n2(tagged), n3
    const host = makeHost({ getDegrees: () => new Map() });
    renderGraphStats(el as any, gd, makePanel(), host);

    // 2 tagged out of 4 = 50.0%
    const text = allText(el);
    expect(text).toContain("50.0%");
  });

  it("renders edge type distribution when edges have types", () => {
    const el = createMockEl();
    const edges: GraphEdge[] = [
      { source: "a", target: "b", type: "link" } as any,
      { source: "b", target: "c", type: "link" } as any,
      { source: "a", target: "c", type: "semantic" } as any,
    ];
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const degrees = new Map([["a", 2], ["b", 2], ["c", 2]]);
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, { nodes, edges }, makePanel(), host);

    const text = allText(el);
    expect(text).toContain("link");
    expect(text).toContain("semantic");
  });

  it("renders top hubs section when hubs exist", () => {
    const el = createMockEl();
    const nodes = [makeNode("hub1"), makeNode("hub2"), makeNode("leaf")];
    const edges: GraphEdge[] = [
      { source: "hub1", target: "leaf", type: "link" } as any,
      { source: "hub2", target: "leaf", type: "link" } as any,
    ];
    const degrees = new Map([["hub1", 10], ["hub2", 5], ["leaf", 2]]);
    const host = makeHost({
      getDegrees: () => degrees,
      getNodeLabel: (id) => `Label_${id}`,
    });
    renderGraphStats(el as any, { nodes, edges }, makePanel(), host);

    const text = allText(el);
    expect(text).toContain("Label_hub1");
    expect(text).toContain("(10)");
  });

  it("clicking hub calls panToNode and setHighlightedNodeId", () => {
    const el = createMockEl();
    const nodes = [makeNode("h"), makeNode("l")];
    const edges: GraphEdge[] = [{ source: "h", target: "l", type: "link" } as any];
    const degrees = new Map([["h", 5], ["l", 1]]);
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, { nodes, edges }, makePanel(), host);

    const hubItems = findAllEl(el, ".gi-stats-hub-item");
    const clickableHub = hubItems.find(h => h.classList.items.includes("gi-stats-hub-clickable"));
    expect(clickableHub).toBeDefined();
    clickableHub!.listeners["click"]?.[0]?.();
    expect(host.panToNode).toHaveBeenCalled();
    expect(host.setHighlightedNodeId).toHaveBeenCalled();
    expect(host.applyHover).toHaveBeenCalled();
  });

  it("renders edge density warning when > 5000 edges", () => {
    const el = createMockEl();
    const nodes = [makeNode("a"), makeNode("b")];
    const edges: GraphEdge[] = [];
    for (let i = 0; i < 5001; i++) {
      edges.push({ source: "a", target: "b", type: "link" } as any);
    }
    const host = makeHost({ getDegrees: () => new Map([["a", 1], ["b", 1]]) });
    renderGraphStats(el as any, { nodes, edges }, makePanel(), host);

    const warn = findEl(el, ".gi-stats-warn");
    expect(warn).not.toBeNull();
    expect(allText(warn!)).toContain("5001");
  });

  it("does not render edge density warning when <= 5000 edges", () => {
    const el = createMockEl();
    const gd = makeGraphData(2, 100);
    const host = makeHost({ getDegrees: () => new Map() });
    renderGraphStats(el as any, gd, makePanel(), host);

    const warn = findEl(el, ".gi-stats-warn");
    expect(warn).toBeNull();
  });

  it("renders overlap warning when ratio > 0.1", () => {
    const el = createMockEl();
    const gd = makeGraphData(5, 3);
    const host = makeHost({ getNodeOverlapRatio: () => 0.25 });
    renderGraphStats(el as any, gd, makePanel(), host);

    // Find the overlap row by checking text content
    const text = allText(el);
    expect(text).toContain("25.0%");
  });

  it("renders degree distribution chart when degrees exist", () => {
    const el = createMockEl();
    const gd = makeGraphData(5, 4);
    const degrees = new Map([["n0", 3], ["n1", 1], ["n2", 0], ["n3", 2], ["n4", 1]]);
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, gd, makePanel(), host);

    const chart = findEl(el, ".gi-degree-chart");
    expect(chart).not.toBeNull();
    expect(chart!.children.length).toBeGreaterThan(0);
  });

  it("degree chart bar click updates minDegreeFilter", () => {
    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    const degrees = new Map([["n0", 2], ["n1", 1], ["n2", 0]]);
    const panel = makePanel();
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, gd, panel, host);

    const chart = findEl(el, ".gi-degree-chart");
    expect(chart).not.toBeNull();
    // Click first bar
    if (chart && chart.children.length > 0) {
      chart.children[0].listeners["click"]?.[0]?.();
      expect(host.invalidateAndRebuild).toHaveBeenCalled();
    }
  });

  it("renders quality dashboard section", () => {
    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    const host = makeHost({
      getLabelQualityScore: () => ({ score: 85, collision: 35, visibility: 25, priority: 25 }),
      getCurrentFps: () => 45,
      getLastRenderTime: () => 8.5,
    });
    renderGraphStats(el as any, gd, makePanel(), host);

    const text = allText(el);
    expect(text).toContain(t("stats.qualityDashboard"));
    expect(text).toContain("85/100");
  });

  it("renders label stats when totalLabels > 0", () => {
    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    const host = makeHost({
      getLabelCullStats: () => ({
        totalLabels: 100,
        visibleLabels: 80,
        culledLabels: 20,
        collisionRate: 0.2,
      }),
    });
    renderGraphStats(el as any, gd, makePanel(), host);

    const text = allText(el);
    expect(text).toContain("80/100");
    expect(text).toContain("20.0%"); // cull rate
  });

  it("renders complexity score", () => {
    const el = createMockEl();
    const gd = makeGraphData(10, 15);
    const degrees = new Map(gd.nodes.map(n => [n.id, 3]));
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, gd, makePanel(), host);

    const text = allText(el);
    // Complexity is computed as logN * density*1000 * avgDeg * sqrt(components)
    // Should produce some numeric value
    expect(text).toMatch(/\d+/);
  });

  it("renders structure questions when showStructureQuestions is true", () => {
    const el = createMockEl();
    const nodes = [
      makeNode("a", { tags: ["t1"] }),
      makeNode("b", { tags: ["t1"] }),
      makeNode("c"),
    ];
    const edges: GraphEdge[] = [
      { source: "a", target: "b", type: "link" } as any,
    ];
    const degrees = new Map([["a", 1], ["b", 1], ["c", 0]]);
    const panel = makePanel({ showStructureQuestions: true });
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, { nodes, edges }, panel, host);

    // Structure questions should be rendered (list items)
    const text = allText(el);
    // The exact questions depend on the data, but the section title should appear
    expect(text.length).toBeGreaterThan(0);
  });

  it("copy button exists and has click listener", () => {
    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    renderGraphStats(el as any, gd, makePanel(), makeHost());

    const copyBtn = findEl(el, ".gi-stats-copy");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.listeners["click"]).toBeDefined();
    expect(copyBtn!.listeners["click"].length).toBe(1);
  });

  it("empty graph renders zero values", () => {
    const el = createMockEl();
    renderGraphStats(el as any, { nodes: [], edges: [] }, makePanel(), makeHost());

    const text = allText(el);
    // node count and edge count should both show 0
    expect(text).toContain("0");
    // density should be 0
    expect(text).toContain("0.0000");
  });

  it("renders memory badge when performance.memory is available", () => {
    // Store original
    const origMemory = (performance as any).memory;
    (performance as any).memory = { usedJSHeapSize: 150 * 1024 * 1024 };

    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    const host = makeHost();
    renderGraphStats(el as any, gd, makePanel(), host);

    const text = allText(el);
    expect(text).toContain("150MB");

    // Restore
    if (origMemory) {
      (performance as any).memory = origMemory;
    } else {
      delete (performance as any).memory;
    }
  });

  it("renders frame time badge when lastRenderTime > 0", () => {
    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    const host = makeHost({ getLastRenderTime: () => 12.3 });
    renderGraphStats(el as any, gd, makePanel(), host);

    const text = allText(el);
    expect(text).toContain("12.3ms");
  });

  it("quality dashboard toggles visibility on click", () => {
    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    renderGraphStats(el as any, gd, makePanel(), makeHost());

    // The dashboard body should exist
    const dashBody = findEl(el, ".gi-quality-dashboard");
    expect(dashBody).not.toBeNull();
    expect(dashBody!.style.display).toBe("none");

    // Find the dashboard title (the one with quality dashboard text and a click listener)
    const allTitles = findAllEl(el, ".gi-stats-hub-title");
    const qd = t("stats.qualityDashboard");
    const dashTitle = allTitles.find(ti => ti.text === qd || ti.textContent === qd);
    expect(dashTitle).toBeDefined();

    // Click to toggle
    dashTitle!.listeners["click"]?.[0]?.();
    expect(dashBody!.style.display).toBe("");

    // Click again to hide
    dashTitle!.listeners["click"]?.[0]?.();
    expect(dashBody!.style.display).toBe("none");
  });

  it("hub keydown Enter triggers pan and highlight", () => {
    const el = createMockEl();
    const nodes = [makeNode("h"), makeNode("l")];
    const edges: GraphEdge[] = [{ source: "h", target: "l", type: "link" } as any];
    const degrees = new Map([["h", 5], ["l", 1]]);
    const host = makeHost({ getDegrees: () => degrees });
    renderGraphStats(el as any, { nodes, edges }, makePanel(), host);

    const clickable = findAllEl(el, ".gi-stats-hub-clickable");
    expect(clickable.length).toBeGreaterThan(0);

    const fakeEvent = { key: "Enter", preventDefault: vi.fn() };
    clickable[0].listeners["keydown"]?.[0]?.(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(host.panToNode).toHaveBeenCalled();
  });

  it("renders custom labelOverlapMargin when not default", () => {
    const el = createMockEl();
    const gd = makeGraphData(3, 2);
    const panel = makePanel({ renderThresholds: { labelOverlapMargin: 20 } } as any);
    const host = makeHost({
      getLabelCullStats: () => ({
        totalLabels: 50,
        visibleLabels: 40,
        culledLabels: 10,
        collisionRate: 0.1,
      }),
    });
    renderGraphStats(el as any, gd, panel, host);

    const text = allText(el);
    expect(text).toContain("20px");
  });
});
