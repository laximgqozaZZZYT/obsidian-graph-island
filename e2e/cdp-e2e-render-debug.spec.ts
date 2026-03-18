/**
 * Render pipeline verification — doRender produces visible nodes and edges
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

test("render produces graphData with nodes", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.nodes?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(2200);
});

test("render produces graphData with edges", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.edges?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(5000);
});

test("re-render with rawData=null rebuilds data correctly", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    const before = v.graphData?.nodes?.length ?? 0;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const after = v.graphData?.nodes?.length ?? 0;
    return { before, after };
  });
  expect(result).not.toBeNull();
  expect(result!.before).toBeGreaterThan(0);
  expect(result!.after).toBe(result!.before);
});

test("view has a doRender method", async () => {
  const hasMethod = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return typeof v?.doRender === "function";
  });
  expect(hasMethod).toBe(true);
});
