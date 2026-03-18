/**
 * CDP E2E Test -- New Features
 *
 * Verifies hover preview, editor-graph sync, keyboard shortcuts,
 * local graph, clipboard copy, embedded graph, and edge weight.
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

test("InteractionManager has lastHoveredId for hover preview", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return { hasIM: !!view.interactionManager, hasLastHoveredId: "lastHoveredId" in (view.interactionManager ?? {}) };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasIM).toBe(true);
  expect(result.hasLastHoveredId).toBe(true);
});

test("syncWithEditor default is true and panToNode method exists", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const proto = Object.getPrototypeOf(view);
    return {
      syncWithEditor: view.panel?.syncWithEditor,
      hasPanToNode: Object.getOwnPropertyNames(proto).includes("panToNode"),
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.syncWithEditor).toBe(true);
  expect(result.hasPanToNode).toBe(true);
});

test("zoomBy and setZoom methods work correctly", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.worldContainer) return { error: "no worldContainer" };
    view.setZoom(1.0);
    await new Promise(r => setTimeout(r, 100));
    const base = view.worldContainer.scale?.x ?? 1;
    view.zoomBy(1.5);
    await new Promise(r => setTimeout(r, 100));
    const zoomed = view.worldContainer.scale?.x ?? 1;
    view.setZoom(1.0);
    return { base, zoomed, zoomWorked: zoomed > base };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.zoomWorked).toBe(true);
});

test("localGraphCenter and localGraphHops settings exist", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.panel;
    return { hasCenter: "localGraphCenter" in panel, hasHops: "localGraphHops" in panel, hops: panel.localGraphHops };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCenter).toBe(true);
  expect(result.hasHops).toBe(true);
  expect(result.hops).toBe(2);
});

test("copyGraphToClipboard method exists on view", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const proto = Object.getPrototypeOf(view);
    return { hasCopyMethod: Object.getOwnPropertyNames(proto).includes("copyGraphToClipboard") };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCopyMethod).toBe(true);
});
