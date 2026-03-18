/**
 * Node filter verification — search query reduces node count correctly
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

test("searchQuery tag:battle filters to ~132 nodes", async () => {
  const count = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return 0;
    v.panel.searchQuery = "tag:battle";
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const c = v.graphData?.nodes?.length ?? 0;
    v.panel.searchQuery = "";
    v.rawData = null;
    v.doRender();
    return c;
  });
  expect(count).toBeGreaterThanOrEqual(100);
  expect(count).toBeLessThanOrEqual(200);
});

test("searchQuery path:classic-macbeth filters to ~172 nodes", async () => {
  const count = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return 0;
    v.panel.searchQuery = "path:classic-macbeth";
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const c = v.graphData?.nodes?.length ?? 0;
    v.panel.searchQuery = "";
    v.rawData = null;
    v.doRender();
    return c;
  });
  expect(count).toBeGreaterThanOrEqual(130);
  expect(count).toBeLessThanOrEqual(220);
});

test("empty searchQuery returns all nodes (~2354)", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.nodes?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(2200);
  expect(count).toBeLessThanOrEqual(2500);
});
