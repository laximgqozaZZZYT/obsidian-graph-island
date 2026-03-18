/**
 * Concentric pure — no group rules, fewer nodes, pure ring layout
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
    if (v) {
      v.panel.searchQuery = "path:classic-macbeth";
      v.panel.showOrphans = true;
      v.panel.groupBy = "none";
      v.panel.clusterArrangement = "concentric";
      v.rawData = null;
      v.doRender();
    }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v) { v.panel.searchQuery = ""; v.panel.groupBy = "none"; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
});

test("pure concentric with path filter yields ~172 nodes", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.nodes?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(130);
  expect(count).toBeLessThanOrEqual(220);
});

test("pure concentric node spread covers both axes", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const xs = nodes.map((n: any) => n.x).filter(Number.isFinite);
    const ys = nodes.map((n: any) => n.y).filter(Number.isFinite);
    return {
      xRange: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
      yRange: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0,
    };
  });
  expect(result.xRange).toBeGreaterThan(50);
  expect(result.yRange).toBeGreaterThan(50);
});
