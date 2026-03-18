/**
 * Focused panel settings verification — specific panel properties are functional
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

test("showOrphans=false reduces visible node count by ~23", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    v.panel.showOrphans = true;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const withOrphans = v.graphData?.nodes?.length ?? 0;

    v.panel.showOrphans = false;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const withoutOrphans = v.graphData?.nodes?.length ?? 0;

    v.panel.showOrphans = true;
    v.rawData = null;
    v.doRender();
    return { withOrphans, withoutOrphans };
  });
  expect(result).not.toBeNull();
  expect(result!.withOrphans).toBeGreaterThan(result!.withoutOrphans);
  const orphanCount = result!.withOrphans - result!.withoutOrphans;
  expect(orphanCount).toBeGreaterThanOrEqual(10);
  expect(orphanCount).toBeLessThanOrEqual(50);
});

test("groupBy property is a string", async () => {
  const groupBy = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return typeof v?.panel?.groupBy;
  });
  expect(groupBy).toBe("string");
});
