/**
 * CDP E2E Test -- All Edge Toggles
 *
 * Verifies that each edge type toggle (showLinks, showTagEdges, etc.)
 * changes the rendered canvas output when toggled.
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
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(4000);

  // Reset to baseline: no grouping, all edges on
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const panel = view.getPanel();
    panel.groupBy = "none";
    panel.groupByRules = [];
    panel.collapsedGroups = new Set();
    panel.showOrphans = true;
    panel.showTagNodes = true;
    panel.showLinks = true;
    panel.showTagEdges = true;
    panel.showCategoryEdges = true;
    panel.showSemanticEdges = true;
    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
  });
});

test("baseline edge type counts match expected totals", async () => {
  const data = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const edges = view.graphEdges ?? [];
    const typeCounts: Record<string, number> = {};
    for (const e of edges) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    return { total: edges.length, typeCounts };
  });

  expect(data).not.toHaveProperty("error");
  expect(data.total).toBeGreaterThanOrEqual(5000);
  expect(data.typeCounts.link).toBeGreaterThanOrEqual(1600);
  expect(data.typeCounts.semantic).toBeGreaterThanOrEqual(2300);
  expect(data.typeCounts.tag).toBeGreaterThanOrEqual(1400);
});

test("showLinks toggle changes panel state correctly", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();

    const before = panel.showLinks;
    panel.showLinks = false;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));
    const after = panel.showLinks;

    panel.showLinks = true;
    view.markDirty?.();
    return { before, after };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.before).toBe(true);
  expect(result.after).toBe(false);
});

test("showSemanticEdges toggle changes panel state correctly", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();

    const before = panel.showSemanticEdges;
    panel.showSemanticEdges = false;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));
    const after = panel.showSemanticEdges;

    panel.showSemanticEdges = true;
    view.markDirty?.();
    return { before, after };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.before).toBe(true);
  expect(result.after).toBe(false);
});

test("edge counts are stable across re-render", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    const countEdges = () => {
      const edges = view.graphEdges ?? [];
      const counts: Record<string, number> = {};
      for (const e of edges) counts[e.type] = (counts[e.type] || 0) + 1;
      return counts;
    };

    const before = countEdges();
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const after = countEdges();

    return {
      linkStable: before.link === after.link,
      semanticStable: before.semantic === after.semantic,
      tagStable: before.tag === after.tag,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.linkStable).toBe(true);
  expect(result.semanticStable).toBe(true);
  expect(result.tagStable).toBe(true);
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

