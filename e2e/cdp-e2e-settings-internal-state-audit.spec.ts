/**
 * Settings Internal State Audit — verify data-layer filtering via internal state
 *
 * Accesses rawData vs getGraphData() to verify that each filter setting
 * correctly removes nodes/edges at the data layer before rendering.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

interface DataLayerState {
  rawNodeCount: number;
  rawEdgeCount: number;
  filteredNodeCount: number;
  filteredEdgeCount: number;
  panelShowOrphans: boolean;
  panelShowTags: boolean;
  panelSearchQuery: string;
}

async function getDataLayerState(): Promise<DataLayerState> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { rawNodeCount: 0, rawEdgeCount: 0, filteredNodeCount: 0, filteredEdgeCount: 0, panelShowOrphans: true, panelShowTags: true, panelSearchQuery: "" };
    const view = leaf.view;
    const raw = view.rawData;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const filteredEdges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    return {
      rawNodeCount: raw?.nodes?.length ?? 0,
      rawEdgeCount: raw?.edges?.length ?? 0,
      filteredNodeCount: pixiNodes?.size ?? 0,
      filteredEdgeCount: filteredEdges.length,
      panelShowOrphans: p.showOrphans,
      panelShowTags: p.showTags,
      panelSearchQuery: p.searchQuery,
    };
  });
}

async function resetAndApply(settings: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (s: Record<string, unknown>) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    // Reset baseline
    p.showOrphans = true; p.showTags = true; p.showTagNodes = true;
    p.showSimilar = false; p.searchQuery = ""; p.groupBy = "none";
    p.groupByRules = []; p.collapsedGroups = new Set();
    // Apply overrides
    for (const [k, v] of Object.entries(s)) (p as any)[k] = v;
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
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

test.describe("Internal State Audit", () => {

  test("raw data is populated with vault content", async () => {
    await resetAndApply({});
    const state = await getDataLayerState();
    expect(state.rawNodeCount).toBeGreaterThan(2000);
    expect(state.rawEdgeCount).toBeGreaterThan(4000);
    console.log(`raw: ${state.rawNodeCount} nodes, ${state.rawEdgeCount} edges`);
  });

  test("showOrphans=false removes nodes at data layer", async () => {
    await resetAndApply({});
    const baseline = await getDataLayerState();

    await resetAndApply({ showOrphans: false });
    const filtered = await getDataLayerState();

    expect(filtered.filteredNodeCount).toBeLessThan(baseline.filteredNodeCount);
    expect(filtered.panelShowOrphans).toBe(false);
    console.log(`showOrphans: filtered ${baseline.filteredNodeCount}->${filtered.filteredNodeCount}`);
  });

  test("showTags=false removes tag nodes at data layer", async () => {
    await resetAndApply({});
    const baseline = await getDataLayerState();

    await resetAndApply({ showTags: false });
    const filtered = await getDataLayerState();

    expect(filtered.filteredNodeCount).toBeLessThan(baseline.filteredNodeCount);
    expect(filtered.filteredEdgeCount).toBeLessThan(baseline.filteredEdgeCount);
    expect(filtered.panelShowTags).toBe(false);
    console.log(`showTags: nodes ${baseline.filteredNodeCount}->${filtered.filteredNodeCount}`);
  });

  test("searchQuery persists in panel state", async () => {
    await resetAndApply({ searchQuery: "tag:battle" });
    const state = await getDataLayerState();
    expect(state.panelSearchQuery).toBe("tag:battle");
    expect(state.filteredNodeCount).toBeGreaterThan(10);
    expect(state.filteredNodeCount).toBeLessThan(state.rawNodeCount);
    console.log(`searchQuery: ${state.filteredNodeCount} filtered from ${state.rawNodeCount} raw`);
  });

  test("raw data count unchanged across filter changes", async () => {
    await resetAndApply({});
    const s1 = await getDataLayerState();

    await resetAndApply({ showOrphans: false, showTags: false, searchQuery: "folder:characters" });
    const s2 = await getDataLayerState();

    // Raw data should remain constant; only filtered counts change
    expect(s2.rawNodeCount).toBe(s1.rawNodeCount);
    expect(s2.rawEdgeCount).toBe(s1.rawEdgeCount);
    expect(s2.filteredNodeCount).toBeLessThan(s1.filteredNodeCount);
    console.log(`raw unchanged: ${s1.rawNodeCount}, filtered: ${s1.filteredNodeCount}->${s2.filteredNodeCount}`);
  });
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
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
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
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

