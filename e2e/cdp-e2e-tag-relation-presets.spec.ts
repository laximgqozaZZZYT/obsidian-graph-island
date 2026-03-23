/**
 * CDP E2E Test -- Tag Relation Presets
 *
 * Verifies tag relation auto-detection from vault content
 * and tag-based grouping functionality.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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

test("tag:battle search query filters to ~132 nodes", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.searchQuery = "tag:battle";
    panel.groupBy = "none";
    panel.showOrphans = true;
    panel.showTagNodes = true;
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const nodeCount = view.pixiNodes?.size ?? 0;
    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    return { filtered: nodeCount };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.filtered).toBeGreaterThanOrEqual(100);
  expect(result.filtered).toBeLessThanOrEqual(200);
});

test("tag:? groupBy creates tag-based collapsed groups", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "tag:?";
    panel.groupByRules = [{ field: "tag:?", indent: 0 }];
    panel.collapsedGroups = new Set();
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));
    return { groupBy: panel.groupBy, collapsed: panel.collapsedGroups.size };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.groupBy).toBe("tag:?");
  expect(result.collapsed).toBeGreaterThan(0);
});

test("tag memberships exceed 200 across vault", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const edges = view.graphEdges ?? [];
    const hasTagCount = edges.filter((e: any) => e.type === "has-tag").length;
    return { hasTagCount };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasTagCount).toBeGreaterThanOrEqual(200);
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
});

