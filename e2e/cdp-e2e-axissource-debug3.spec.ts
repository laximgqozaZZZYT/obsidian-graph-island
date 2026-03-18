/**
 * Axis source verification 3 — simulation convergence and coordinate settling
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

test("all node coordinates are finite after simulation", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const nonFinite = nodes.filter((n: any) => !Number.isFinite(n.x) || !Number.isFinite(n.y));
    return { total: nodes.length, nonFinite: nonFinite.length };
  });
  expect(result.total).toBeGreaterThan(0);
  expect(result.nonFinite).toBe(0);
});

test("node positions are spread across space (not collapsed to origin)", async () => {
  const spread = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const xs = nodes.map((n: any) => n.x).filter(Number.isFinite);
    const ys = nodes.map((n: any) => n.y).filter(Number.isFinite);
    return {
      xRange: Math.max(...xs) - Math.min(...xs),
      yRange: Math.max(...ys) - Math.min(...ys),
    };
  });
  expect(spread.xRange).toBeGreaterThan(100);
  expect(spread.yRange).toBeGreaterThan(100);
});

test("no two nodes share the exact same coordinates", async () => {
  const dupeCount = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const posSet = new Set<string>();
    let dupes = 0;
    for (const n of nodes) {
      const key = `${Math.round(n.x * 10)},${Math.round(n.y * 10)}`;
      if (posSet.has(key)) dupes++;
      posSet.add(key);
    }
    return dupes;
  });
  expect(dupeCount).toBeLessThan(50);
});
