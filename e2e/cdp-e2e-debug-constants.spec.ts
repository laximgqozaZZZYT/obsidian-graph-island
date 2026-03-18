/**
 * Constants verification — panel default values are within expected ranges
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

test("panel has boolean toggle properties", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const p = v?.panel;
    if (!p) return null;
    return {
      showOrphans: typeof p.showOrphans,
      showLinks: typeof p.showLinks,
    };
  });
  expect(result).not.toBeNull();
  expect(result!.showOrphans).toBe("boolean");
  expect(result!.showLinks).toBe("boolean");
});

test("panel searchQuery is a string", async () => {
  const sq = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return typeof v?.panel?.searchQuery;
  });
  expect(sq).toBe("string");
});

test("panel nodeSize is a positive number", async () => {
  const ns = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel?.nodeSize ?? 0;
  });
  expect(ns).toBeGreaterThan(0);
  expect(ns).toBeLessThan(100);
});
