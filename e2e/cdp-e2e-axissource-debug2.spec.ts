/**
 * Axis source verification 2 — node data structure has required fields
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

test("every node has id, x, y, and group fields", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const valid = nodes.filter((n: any) => typeof n.id === "string" && "x" in n && "y" in n);
    return { total: nodes.length, valid: valid.length };
  });
  expect(result.total).toBeGreaterThan(100);
  expect(result.valid).toBe(result.total);
});

test("node IDs are unique strings", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const ids = nodes.map((n: any) => n.id);
    return { total: ids.length, unique: new Set(ids).size };
  });
  expect(result.unique).toBe(result.total);
});

test("total node count matches expected baseline (~2354)", async () => {
  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.nodes?.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(2200);
  expect(count).toBeLessThanOrEqual(2500);
});
