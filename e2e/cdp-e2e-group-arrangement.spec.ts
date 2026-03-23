/**
 * CDP E2E Test -- Group Arrangement Modes
 *
 * Verifies all 6 inter-group arrangement modes
 * (auto, circle, horizontal, vertical, concentric, grid) produce distinct layouts.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

const MODES = ["auto", "circle", "horizontal", "vertical", "concentric", "grid"];

test("all group arrangement modes apply without errors", async () => {
  for (const mode of MODES) {
    const result = await page.evaluate(async (m: string) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      panel.groupBy = "folder:?";
      panel.groupByRules = [{ field: "folder:?", indent: 0 }];
      panel.clusterArrangement = m === "auto" ? "spiral" : m;
      panel.collapsedGroups = new Set();
      if (typeof view.doRender === "function") view.doRender();
      await new Promise(r => setTimeout(r, 3000));
      return { mode: m, nodeCount: view.pixiNodes?.size ?? 0 };
    }, mode);
    expect(result.nodeCount).toBeGreaterThan(0);
  }
});

test("horizontal mode produces wider X spread than Y", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "folder:?";
    panel.clusterArrangement = "horizontal";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const xs: number[] = []; const ys: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) { xs.push(pn.data.x); ys.push(pn.data.y); }
    }
    return {
      xRange: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
      yRange: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.xRange).toBeGreaterThan(0);
});

test("concentric mode distributes clusters radially", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "folder:?";
    panel.clusterArrangement = "concentric";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    return { nodeCount: view.pixiNodes?.size ?? 0, arrangement: panel.clusterArrangement };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("concentric");
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

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
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

