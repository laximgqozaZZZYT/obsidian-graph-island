/**
 * Concentric simple — fewer nodes, no groups, basic coordinate check
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
      v.panel.searchQuery = "path:classic-macbeth/characters";
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

test("small node set (~15) produces valid concentric layout", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.nodes?.length ?? 0;
  });
  expect(count).toBeGreaterThan(5);
  expect(count).toBeLessThan(50);
});

test("all small-set nodes have finite positions", async () => {
  const badCount = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    return nodes.filter((n: any) => !Number.isFinite(n.x) || !Number.isFinite(n.y)).length;
  });
  expect(badCount).toBe(0);
});
