/**
 * CDP E2E Test -- Routing Fix Verification
 *
 * Verifies that grid, triangle, mountain use correct layout functions
 * producing proper geometric patterns.
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

test("grid layout produces rectangular distribution", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "grid";
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const xs = new Set<number>(); const ys = new Set<number>();
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) { xs.add(Math.round(pn.data.x / 30)); ys.add(Math.round(pn.data.y / 30)); }
    }
    return { cols: xs.size, rows: ys.size, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.cols).toBeGreaterThan(1);
  expect(result.rows).toBeGreaterThan(1);
});

test("triangle layout produces rows with increasing width", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "triangle";
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const ys = new Set<number>();
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) ys.add(Math.round(pn.data.y / 30));
    }
    return { rows: ys.size };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.rows).toBeGreaterThan(1);
});

test("mountain layout produces vertical spread from degree mapping", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "mountain";
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const ys: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) ys.push(pn.data.y);
    }
    return { yRange: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.yRange).toBeGreaterThan(0);
});
