/**
 * CDP E2E Test -- Preset Backward Compatibility
 *
 * Verifies that all standard arrangements (spiral, concentric, tree,
 * grid, triangle, random, mountain, sunburst, timeline) render without errors.
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

const ARRANGEMENTS = ["spiral", "concentric", "tree", "grid", "triangle", "random", "mountain", "sunburst", "timeline"];

test("all standard arrangements render with positive node count", async () => {
  test.setTimeout(120_000);
  for (const arr of ARRANGEMENTS) {
    const result = await page.evaluate(async (arrangement: string) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      panel.clusterArrangement = arrangement;
      panel.coordinateLayout = null;
      if (typeof view.doRender === "function") view.doRender();
      await new Promise(r => setTimeout(r, 3000));
      return { arrangement, nodeCount: view.pixiNodes?.size ?? 0, canvasOk: !!view.pixiApp?.view };
    }, arr);

    console.log(`[${arr}] nodes=${result.nodeCount}`);
    expect(result.canvasOk).toBe(true);
    expect(result.nodeCount).toBeGreaterThan(0);
  }
});

test("switching between arrangements preserves canvas integrity", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    for (const arr of ["spiral", "grid", "concentric", "tree"]) {
      panel.clusterArrangement = arr;
      if (typeof view.doRender === "function") view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    }
    return { canvasOk: view.pixiApp?.view instanceof HTMLCanvasElement, nodeCount: view.pixiNodes?.size ?? 0 };
  });

  expect(result.canvasOk).toBe(true);
  expect(result.nodeCount).toBeGreaterThan(0);
});
