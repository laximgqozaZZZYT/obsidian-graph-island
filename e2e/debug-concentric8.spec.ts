/**
 * Concentric layout 8 — expression evaluation tracing via node coordinates
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

test("concentric y-range is positive (nodes spread vertically)", async () => {
  const range = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const ys = nodes.map((n: any) => n.y).filter(Number.isFinite);
    if (ys.length === 0) return 0;
    return Math.max(...ys) - Math.min(...ys);
  });
  expect(range).toBeGreaterThan(100);
});

test("standard deviation of distances from center is positive", async () => {
  const stddev = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    if (nodes.length < 2) return 0;
    const cx = nodes.reduce((s: number, n: any) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s: number, n: any) => s + n.y, 0) / nodes.length;
    const dists = nodes.map((n: any) => Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2));
    const mean = dists.reduce((a: number, b: number) => a + b, 0) / dists.length;
    const variance = dists.reduce((s: number, d: number) => s + (d - mean) ** 2, 0) / dists.length;
    return Math.sqrt(variance);
  });
  expect(stddev).toBeGreaterThan(1);
});
