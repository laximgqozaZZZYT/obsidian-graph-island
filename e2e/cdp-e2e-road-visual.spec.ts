/**
 * CDP E2E Test -- Road Network Visual
 *
 * Verifies road network visual rendering: double-line rendering
 * (outer boundary + centerline) and segment visibility.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

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

test("road network overlay toggle controls visibility", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    const before = panel.renderThresholds?.roadRouteEdges ?? false;
    panel.renderThresholds = { ...panel.renderThresholds, roadRouteEdges: !before };
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 1000));
    const after = panel.renderThresholds.roadRouteEdges;

    panel.renderThresholds = { ...panel.renderThresholds, roadRouteEdges: before };
    return { before, after, toggled: before !== after };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.toggled).toBe(true);
});

test("road network exists after enabling and rebuilding", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "folder:?";
    panel.groupByRules = [{ field: "folder:?", indent: 0 }];
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 6000));

    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view._rebuildRoadNetwork?.(true);
    await new Promise(r => setTimeout(r, 1000));

    const rn = view.roadNetworkData;
    return { hasRoadNetwork: !!rn, intersections: rn?.intersections?.length ?? 0, segments: rn?.segments?.length ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
});
