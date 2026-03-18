/**
 * Card mode verification — card config values are applied correctly
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

test("panel has cardMode property defined", async () => {
  const hasCardMode = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel ? "cardMode" in v.panel : false;
  });
  expect(hasCardMode).toBe(true);
});

test("enabling cardMode preserves node count", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { before: 0, after: 0 };
    const before = v.graphData?.nodes?.length ?? 0;
    v.panel.cardMode = true;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const after = v.graphData?.nodes?.length ?? 0;
    v.panel.cardMode = false;
    v.doRender();
    return { before, after };
  });
  expect(result.before).toBeGreaterThan(100);
  expect(result.after).toBe(result.before);
});
