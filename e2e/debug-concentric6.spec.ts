/**
 * Concentric layout 6 — location.reload force re-read verification
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
      v.panel.searchQuery = "tag:battle";
      v.panel.showOrphans = true;
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
    if (v) { v.panel.searchQuery = ""; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
});

test("nodes have non-zero distance from origin", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const atOrigin = nodes.filter((n: any) => Math.abs(n.x) < 1 && Math.abs(n.y) < 1).length;
    return { total: nodes.length, atOrigin };
  });
  expect(result.total).toBeGreaterThan(50);
  expect(result.atOrigin).toBeLessThan(result.total * 0.1);
});

test("mean distance from centroid is positive", async () => {
  const meanDist = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    if (nodes.length === 0) return 0;
    const cx = nodes.reduce((s: number, n: any) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s: number, n: any) => s + n.y, 0) / nodes.length;
    const sum = nodes.reduce((s: number, n: any) => s + Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2), 0);
    return sum / nodes.length;
  });
  expect(meanDist).toBeGreaterThan(10);
});
