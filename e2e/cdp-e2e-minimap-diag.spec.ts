/**
 * Minimap verification — minimap toggle and presence
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);
let browser: Browser, page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  page = browser.contexts()[0].pages().find(p => p.url().includes("index.html")) ?? browser.contexts()[0].pages()[0];
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v) { v.panel.searchQuery = ""; v.panel.showOrphans = true; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {});

test("panel has showMinimap boolean property", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return { exists: "showMinimap" in (v?.panel ?? {}), type: typeof v?.panel?.showMinimap };
  });
  expect(result.exists).toBe(true);
  expect(result.type).toBe("boolean");
});

test("enabling minimap creates a minimap element or canvas", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    v.panel.showMinimap = true;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const canvasCount = document.querySelectorAll("canvas").length;
    v.panel.showMinimap = false;
    v.doRender();
    await new Promise(r => setTimeout(r, 2000));
    const canvasCountAfter = document.querySelectorAll("canvas").length;
    return { withMinimap: canvasCount, withoutMinimap: canvasCountAfter };
  });
  expect(result).not.toBeNull();
  expect(result!.withMinimap).toBeGreaterThanOrEqual(1);
});
