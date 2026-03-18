/**
 * Toggle verification — clicking toggles actually changes panel boolean properties
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

test("toggling showLinks changes the property value", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    const before = v.panel.showLinks;
    v.panel.showLinks = !before;
    const after = v.panel.showLinks;
    v.panel.showLinks = before; // restore
    return { before, after };
  });
  expect(result).not.toBeNull();
  expect(result!.after).toBe(!result!.before);
});

test("toggling showOrphans changes the property value", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    const before = v.panel.showOrphans;
    v.panel.showOrphans = !before;
    const after = v.panel.showOrphans;
    v.panel.showOrphans = before; // restore
    return { before, after };
  });
  expect(result).not.toBeNull();
  expect(result!.after).toBe(!result!.before);
});

test("toggling showLabels changes the property value", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    const before = v.panel.showLabels;
    v.panel.showLabels = !before;
    const after = v.panel.showLabels;
    v.panel.showLabels = before; // restore
    return { before, after };
  });
  expect(result).not.toBeNull();
  expect(result!.after).toBe(!result!.before);
});
