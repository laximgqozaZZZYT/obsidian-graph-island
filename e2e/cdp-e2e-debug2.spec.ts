/**
 * Node position verification — all positions are finite numbers after render
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

test("every node x coordinate is a finite number", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    return {
      total: nodes.length,
      finiteX: nodes.filter((n: any) => Number.isFinite(n.x)).length,
    };
  });
  expect(result.total).toBeGreaterThan(100);
  expect(result.finiteX).toBe(result.total);
});

test("every node y coordinate is a finite number", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    return {
      total: nodes.length,
      finiteY: nodes.filter((n: any) => Number.isFinite(n.y)).length,
    };
  });
  expect(result.total).toBeGreaterThan(100);
  expect(result.finiteY).toBe(result.total);
});
