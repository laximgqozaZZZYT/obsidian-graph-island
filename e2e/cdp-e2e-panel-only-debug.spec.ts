/**
 * Panel-only settings verification — settings work with full node set (no groupBy)
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
    if (v) { v.panel.searchQuery = ""; v.panel.showOrphans = true; v.panel.groupBy = "none"; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {});

test("groupBy=none shows all nodes without collapsing", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.nodes?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(2200);
});

test("panel showLabels is a boolean", async () => {
  const t = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return typeof v?.panel?.showLabels;
  });
  expect(t).toBe("boolean");
});

test("panel nodeColorMode is a valid string", async () => {
  const mode = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel?.nodeColorMode ?? null;
  });
  expect(mode).not.toBeNull();
  expect(["default", "category", "heatmap"]).toContain(mode);
});
