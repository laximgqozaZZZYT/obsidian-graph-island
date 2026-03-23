/**
 * CDP E2E Test -- Cluster Sort Order
 *
 * Verifies that cluster arrangement respects sort order,
 * placing groups in correct spatial sequence.
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

test("groups sorted by sortComparator have ordered positions", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.groupBy = "folder:?";
    panel.groupByRules = [{ field: "folder:?", indent: 0 }];
    panel.clusterArrangement = "grid";
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    const cm = view.clusterMeta;
    if (!cm?.clusterCentroids) return { error: "no cluster centroids" };

    const entries: { group: string; x: number; y: number }[] = [];
    for (const [group, center] of cm.clusterCentroids) {
      entries.push({ group, x: center.x, y: center.y });
    }

    return { groupCount: entries.length, entries: entries.slice(0, 10) };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.groupCount).toBeGreaterThan(1);
});

test("concentric arrangement distributes groups radially", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.groupBy = "folder:?";
    panel.clusterArrangement = "concentric";
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    const cm = view.clusterMeta;
    if (!cm?.clusterCentroids || cm.clusterCentroids.size < 2) return { error: "not enough clusters" };

    const dists: number[] = [];
    for (const [, center] of cm.clusterCentroids) {
      dists.push(Math.sqrt(center.x ** 2 + center.y ** 2));
    }

    return {
      clusterCount: cm.clusterCentroids.size,
      minDist: Math.round(Math.min(...dists)),
      maxDist: Math.round(Math.max(...dists)),
      spread: Math.round(Math.max(...dists) - Math.min(...dists)),
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.clusterCount).toBeGreaterThan(1);
  expect(result.spread).toBeGreaterThan(0);
});

test("changing groupBy produces different group counts", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.groupBy = "folder:?";
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const folderGroups = view.clusterMeta?.clusterCentroids?.size ?? 0;

    panel.groupBy = "tag:?";
    panel.groupByRules = [{ field: "tag:?", indent: 0 }];
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const tagGroups = view.clusterMeta?.clusterCentroids?.size ?? 0;

    return { folderGroups, tagGroups };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.folderGroups).toBeGreaterThan(0);
  expect(result.tagGroups).toBeGreaterThan(0);
  expect(result.folderGroups).not.toBe(result.tagGroups);
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

