/**
 * CDP E2E Test -- Minimal Sanity Check
 *
 * Verifies the most basic functionality: plugin loaded, graph view
 * open, canvas present, nodes and edges positive.
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

test("plugin is loaded and enabled", async () => {
  const result = await page.evaluate(() => {
    const app = (window as any).app;
    return {
      loaded: "graph-island" in (app?.plugins?.plugins ?? {}),
      enabled: app?.plugins?.enabledPlugins?.has?.("graph-island") ?? false,
    };
  });
  expect(result.loaded).toBe(true);
  expect(result.enabled).toBe(true);
});

test("graph view has canvas with nodes and edges", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      hasCanvas: view?.pixiApp?.view instanceof HTMLCanvasElement,
      nodeCount: view.pixiNodes instanceof Map ? view.pixiNodes.size : -1,
      edgeCount: view.graphEdges?.length ?? -1,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCanvas).toBe(true);
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.edgeCount).toBeGreaterThan(0);
});

test("total nodes approximately 2354 and edges approximately 5558", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "none";
    panel.showOrphans = true;
    panel.showTagNodes = true;
    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    return { nodes: view.pixiNodes?.size ?? 0, edges: view.graphEdges?.length ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodes).toBeGreaterThanOrEqual(2300);
  expect(result.edges).toBeGreaterThanOrEqual(5000);
});
