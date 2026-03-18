/**
 * Polar layout verification — polar coordinate mode produces radial node spread
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
      v.panel.clusterArrangement = "polar";
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

test("polar layout produces nodes with finite coordinates", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const finite = nodes.filter((n: any) => Number.isFinite(n.x) && Number.isFinite(n.y));
    return { total: nodes.length, finite: finite.length };
  });
  expect(result.total).toBeGreaterThan(50);
  expect(result.finite).toBe(result.total);
});

test("polar nodes are distributed radially from center", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    if (nodes.length === 0) return { distinctDistances: 0 };
    const cx = nodes.reduce((s: number, n: any) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s: number, n: any) => s + n.y, 0) / nodes.length;
    const distances = nodes.map((n: any) => Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2));
    const rounded = new Set(distances.map((d: number) => Math.round(d / 10)));
    return { distinctDistances: rounded.size };
  });
  expect(result.distinctDistances).toBeGreaterThan(3);
});
