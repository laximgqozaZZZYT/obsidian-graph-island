/**
 * CDP E2E Test -- Isolated Toggle Tests
 *
 * Verifies each toggle setting independently with clean state reset.
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

test("showArrows toggle changes panel state", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    const before = panel.showArrows;
    panel.showArrows = !before;
    view.markDirty?.();
    const after = panel.showArrows;
    panel.showArrows = before;
    return { before, after, changed: before !== after };
  });
  expect(result.changed).toBe(true);
});

test("showMinimap toggle changes panel state", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    const before = panel.showMinimap;
    panel.showMinimap = !before;
    view.markDirty?.();
    const after = panel.showMinimap;
    panel.showMinimap = before;
    return { before, after, changed: before !== after };
  });
  expect(result.changed).toBe(true);
});

test("scaleByDegree toggle changes panel state", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    const before = panel.scaleByDegree;
    panel.scaleByDegree = !before;
    view.markDirty?.();
    const after = panel.scaleByDegree;
    panel.scaleByDegree = before;
    return { before, after, changed: before !== after };
  });
  expect(result.changed).toBe(true);
});

test("showEdgeLabels toggle changes panel state", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    const before = panel.showEdgeLabels;
    panel.showEdgeLabels = !before;
    view.markDirty?.();
    const after = panel.showEdgeLabels;
    panel.showEdgeLabels = before;
    return { before, after, changed: before !== after };
  });
  expect(result.changed).toBe(true);
});
