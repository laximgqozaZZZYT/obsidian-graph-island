/**
 * E2E diagnostic — view structure and workspace state
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

test("workspace has at least one leaf", async () => {
  const count = await page.evaluate(() => {
    return (window as any).app.workspace.getLeavesOfType("graph-view").length;
  });
  expect(count).toBeGreaterThanOrEqual(1);
});

test("view object has expected shape", async () => {
  const shape = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return {
      hasDoRender: typeof v?.doRender === "function",
      hasPanel: v?.panel !== undefined,
      hasGraphData: v?.graphData !== undefined,
    };
  });
  expect(shape.hasDoRender).toBe(true);
  expect(shape.hasPanel).toBe(true);
  expect(shape.hasGraphData).toBe(true);
});

test("page URL contains index.html", async () => {
  const url = page.url();
  expect(url).toContain("index.html");
});
