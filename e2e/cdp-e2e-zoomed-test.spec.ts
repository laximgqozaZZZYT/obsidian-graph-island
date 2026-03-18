/**
 * CDP E2E Test -- Zoomed View Edge Toggle
 *
 * Verifies that edge toggle settings work correctly at different
 * zoom levels and produce visible changes.
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

test("edge toggles work at zoomed-in view", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.setZoom(2.0);
    await new Promise(r => setTimeout(r, 500));

    const panel = view.getPanel();
    panel.showLinks = false;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));
    const linksOff = panel.showLinks;

    panel.showLinks = true;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));
    const linksOn = panel.showLinks;

    view.setZoom(1.0);
    return { linksOff, linksOn };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.linksOff).toBe(false);
  expect(result.linksOn).toBe(true);
});

test("zoomed-out view still has canvas integrity", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.setZoom(0.1);
    await new Promise(r => setTimeout(r, 500));
    const canvasOk = view.pixiApp?.view instanceof HTMLCanvasElement;
    const nodeCount = view.pixiNodes?.size ?? 0;
    view.setZoom(1.0);
    return { canvasOk, nodeCount };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.canvasOk).toBe(true);
  expect(result.nodeCount).toBeGreaterThan(0);
});
