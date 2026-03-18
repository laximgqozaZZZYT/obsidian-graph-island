/**
 * Constants UI verification — panel settings are reflected in the UI controls
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

test("graph-island settings panel exists in DOM", async () => {
  const exists = await page.evaluate(() => {
    return document.querySelector(".graph-island-controls, .graph-island-panel, .gi-panel") !== null
      || document.querySelectorAll("[class*='graph-island']").length > 0;
  });
  expect(exists).toBe(true);
});

test("panel has numeric density property between 0 and 1", async () => {
  const density = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel?.density ?? null;
  });
  expect(density).not.toBeNull();
  expect(density).toBeGreaterThanOrEqual(0);
  expect(density).toBeLessThanOrEqual(1);
});

test("panel clusterArrangement is a valid string value", async () => {
  const arr = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel?.clusterArrangement ?? null;
  });
  expect(arr).not.toBeNull();
  expect(typeof arr).toBe("string");
  expect(arr!.length).toBeGreaterThan(0);
});
