/**
 * Sparse Graph Audit v2 — verify rendering pipeline with invalidateData + doRender
 *
 * Tests that the full render pipeline correctly processes small datasets
 * and that switching between filter states produces correct results.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

async function applyAndCount(settings: Record<string, unknown>): Promise<{ nodeCount: number; edgeCount: number }> {
  return page.evaluate(async (s: Record<string, unknown>) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, edgeCount: 0 };
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(s)) {
      if (k === "collapsedGroups") (p as any)[k] = new Set(v as string[]);
      else (p as any)[k] = v;
    }
    // Force full re-render
    view.rawData = null;
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2500));
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    return { nodeCount: pn?.size ?? 0, edgeCount: edges.length };
  }, settings);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
});

test.afterAll(async () => {});

test.describe("Sparse Audit v2 — Full Pipeline", () => {

  test("full graph renders >2000 nodes", async () => {
    const result = await applyAndCount({
      searchQuery: "", showOrphans: true, showTags: true,
      showTagNodes: true, groupBy: "none", collapsedGroups: [],
    });
    expect(result.nodeCount).toBeGreaterThan(2000);
    expect(result.edgeCount).toBeGreaterThan(4000);
    console.log(`full: ${result.nodeCount} nodes, ${result.edgeCount} edges`);

  });

  test("characters folder filter gives controlled count", async () => {
    const result = await applyAndCount({
      searchQuery: "folder:characters", showOrphans: true,
      showTags: false, showTagNodes: false, groupBy: "none", collapsedGroups: [],
    });
    expect(result.nodeCount).toBeGreaterThan(50);
    expect(result.nodeCount).toBeLessThan(500);
    console.log(`characters: ${result.nodeCount} nodes, ${result.edgeCount} edges`);

  });

  test("switching from sparse to full restores all nodes", async () => {
    // Go sparse
    const sparse = await applyAndCount({
      searchQuery: "path:classic-macbeth/characters", showOrphans: true,
      showTags: false, groupBy: "none", collapsedGroups: [],
    });
    expect(sparse.nodeCount).toBeLessThan(100);

    // Go full
    const full = await applyAndCount({
      searchQuery: "", showOrphans: true, showTags: true,
      showTagNodes: true, groupBy: "none", collapsedGroups: [],

    });
    expect(full.nodeCount).toBeGreaterThan(2000);
    expect(full.nodeCount).toBeGreaterThan(sparse.nodeCount * 10);
    console.log(`sparse->full: ${sparse.nodeCount} -> ${full.nodeCount}`);
  });

  test("doRender produces consistent results on repeated calls", async () => {
    const r1 = await applyAndCount({
      searchQuery: "folder:characters", showOrphans: true,
      showTags: false, groupBy: "none", collapsedGroups: [],
    });
    const r2 = await applyAndCount({
      searchQuery: "folder:characters", showOrphans: true,
      showTags: false, groupBy: "none", collapsedGroups: [],
    });
    expect(r1.nodeCount).toBe(r2.nodeCount);
    expect(r1.edgeCount).toBe(r2.edgeCount);
    console.log(`consistency: ${r1.nodeCount}==${r2.nodeCount}, ${r1.edgeCount}==${r2.edgeCount}`);

  });
});



// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety}`);
  // Nodes should not be excessively piled up
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
  }
  // Labels that are visible should be mostly readable
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.80);
  }
  // Edges should be visible with some color variety
  if (edges.totalEdges > 10) {
    expect(edges.visibleEdges).toBeGreaterThan(0);
  }
});

// =========================================================================
// Screen-Space Visual Quality (auto-generated)
// =========================================================================
test("SCREEN-QUALITY: no node pile-up and labels readable", async () => {
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) return;

  // 1. Screen-space density — detect node pile-up
  const density = await measureScreenDensity(page);
  console.log(`[SCREEN-Q] nodes=${density.totalNodes} hotspot=${density.worstCellCount} viewport=${density.viewportUtilization}% rightBias=${density.rightHalfRatio}%`);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  console.log(`[SCREEN-Q] labels=${labels.totalVisible} overlap=${labels.overlapRate} tooSmall=${labels.tooSmallCount} avgFont=${labels.avgScreenFontSize}px`);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.70);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.5);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  console.log(`[SCREEN-Q] edges=${edges.totalEdges} visible=${edges.visibleEdges} tooThin=${edges.tooThinCount} lowAlpha=${edges.lowAlphaCount} colors=${edges.colorVariety}`);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.8);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    console.log(`[SCREEN-Q] enclosures=${enclosures.totalEnclosures} overlapping=${enclosures.overlappingPairs} rate=${enclosures.overlapRate}`);
    expect(enclosures.overlapRate).toBeLessThan(0.70);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    console.log(`[SCREEN-Q] cards=${cards.totalCards} overlapping=${cards.overlappingCards} tooSmall=${cards.tooSmallCards} avgW=${cards.avgCardWidth} avgH=${cards.avgCardHeight}`);
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.5);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.7);
  }
});

// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }

  // 4. Screen-space density (detect actual visual pile-up)
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

});

