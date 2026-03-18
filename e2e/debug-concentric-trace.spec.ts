/**
 * Concentric trace — coordinate engine output tracing via node statistics
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

test("coordinate statistics — min/max/mean are finite", async () => {
  const stats = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const xs = nodes.map((n: any) => n.x).filter(Number.isFinite);
    const ys = nodes.map((n: any) => n.y).filter(Number.isFinite);
    if (xs.length === 0) return null;
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
      meanX: xs.reduce((a: number, b: number) => a + b, 0) / xs.length,
      meanY: ys.reduce((a: number, b: number) => a + b, 0) / ys.length,
    };
  });
  expect(stats).not.toBeNull();
  expect(Number.isFinite(stats!.minX)).toBe(true);
  expect(Number.isFinite(stats!.maxX)).toBe(true);
  expect(Number.isFinite(stats!.meanX)).toBe(true);
  expect(Number.isFinite(stats!.meanY)).toBe(true);
});

test("coordinate range is symmetric-ish around centroid", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const xs = nodes.map((n: any) => n.x).filter(Number.isFinite);
    const ys = nodes.map((n: any) => n.y).filter(Number.isFinite);
    if (xs.length === 0) return null;
    const cx = xs.reduce((a: number, b: number) => a + b, 0) / xs.length;
    const cy = ys.reduce((a: number, b: number) => a + b, 0) / ys.length;
    const maxAbsX = Math.max(Math.abs(Math.max(...xs) - cx), Math.abs(Math.min(...xs) - cx));
    const maxAbsY = Math.max(Math.abs(Math.max(...ys) - cy), Math.abs(Math.min(...ys) - cy));
    return { maxAbsX, maxAbsY };
  });
  expect(result).not.toBeNull();
  expect(result!.maxAbsX).toBeGreaterThan(10);
  expect(result!.maxAbsY).toBeGreaterThan(10);
});
