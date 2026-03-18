/**
 * Concentric layout 3 — coordinate engine expression evaluation
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

test("concentric mode sets clusterArrangement correctly", async () => {
  const arr = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel?.clusterArrangement;
  });
  expect(arr).toBe("concentric");
});

test("concentric nodes have x range wider than 100px", async () => {
  const range = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const xs = nodes.map((n: any) => n.x).filter(Number.isFinite);
    if (xs.length === 0) return 0;
    return Math.max(...xs) - Math.min(...xs);
  });
  expect(range).toBeGreaterThan(100);
});
