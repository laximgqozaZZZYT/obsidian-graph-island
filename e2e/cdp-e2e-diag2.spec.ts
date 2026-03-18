/**
 * Diagnostic 2 — raw data loading and node/edge baseline counts
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

test("rawData contains nodes array with expected count", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.rawData?.nodes?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(2200);
  expect(count).toBeLessThanOrEqual(2600);
});

test("rawData contains edges array with expected count", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.rawData?.edges?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(5000);
  expect(count).toBeLessThanOrEqual(6500);
});

test("graphData nodes is a subset of rawData nodes", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return {
      raw: v?.rawData?.nodes?.length ?? 0,
      graph: v?.graphData?.nodes?.length ?? 0,
    };
  });
  expect(result.graph).toBeLessThanOrEqual(result.raw);
  expect(result.graph).toBeGreaterThan(0);
});
