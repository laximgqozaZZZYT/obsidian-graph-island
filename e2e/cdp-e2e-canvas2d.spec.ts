/**
 * CDP E2E Test -- Canvas 2D Rendering
 *
 * Verifies Canvas 2D rendering context, canvas dimensions, node data,
 * and zoom interaction on the graph view.
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

test("canvas element exists with valid dimensions", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.pixiApp) return { error: "no pixiApp" };
    const canvas = view.pixiApp.view;
    if (!(canvas instanceof HTMLCanvasElement)) return { error: "not a canvas" };
    return { width: canvas.width, height: canvas.height, inDOM: canvas.parentElement !== null };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.inDOM).toBe(true);
});

test("canvas uses 2D rendering context", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.pixiApp) return { error: "no pixiApp" };
    return {
      hasStage: !!view.pixiApp.stage,
      contextType: view.pixiApp.getContext?.()?.constructor?.name ?? "unknown",
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.hasStage).toBe(true);
  expect(result.contextType).toBe("CanvasRenderingContext2D");
});

test("graph data has nodes and edges", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      nodeCount: view.pixiNodes instanceof Map ? view.pixiNodes.size : -1,
      edgeCount: view.graphEdges?.length ?? -1,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.edgeCount).toBeGreaterThan(0);
});

test("wheel zoom changes worldContainer scale", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.worldContainer) return { error: "no worldContainer" };

    view.setZoom(1.0);
    await new Promise(r => setTimeout(r, 100));
    const before = view.worldContainer.scale?.x ?? 1;

    view.zoomBy(1.5);
    await new Promise(r => setTimeout(r, 100));
    const after = view.worldContainer.scale?.x ?? 1;

    view.setZoom(1.0);
    return { before, after, changed: after > before };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.changed).toBe(true);
});
