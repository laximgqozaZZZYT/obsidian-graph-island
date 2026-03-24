/**
 * E2E diagnostic 2 — view state and panel serialization
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

test("panel can be read as a serializable object", async () => {
  const keys = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const p = v?.panel;
    if (!p) return [];
    return Object.keys(p).filter(k => typeof p[k] !== "function" && typeof p[k] !== "object");
  });
  expect(keys.length).toBeGreaterThan(10);
});

test("panel property count is at least 20", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel ? Object.keys(v.panel).length : 0;
  });
  expect(count).toBeGreaterThanOrEqual(20);
});

test("graphData has both nodes and edges arrays", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return {
      nodesIsArray: Array.isArray(v?.graphData?.nodes),
      edgesIsArray: Array.isArray(v?.graphData?.edges),
    };
  });
  expect(result.nodesIsArray).toBe(true);
  expect(result.edgesIsArray).toBe(true);
});
