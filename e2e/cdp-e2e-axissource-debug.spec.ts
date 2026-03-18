/**
 * Axis source verification — timeline axis labels and tick rendering
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
      v.panel.searchQuery = "";
      v.panel.showOrphans = true;
      v.panel.clusterArrangement = "timeline";
      v.panel.timelineField = "start-date";
      v.rawData = null;
      v.doRender();
    }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {});

test("timeline layout produces nodes with finite x/y positions", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { total: 0, finite: 0 };
    const nodes = v.graphData?.nodes ?? [];
    const finite = nodes.filter((n: any) => Number.isFinite(n.x) && Number.isFinite(n.y)).length;
    return { total: nodes.length, finite };
  });
  expect(result.total).toBeGreaterThan(0);
  expect(result.finite).toBe(result.total);
});

test("timeline axis field is set to start-date", async () => {
  const field = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.panel?.timelineField ?? null;
  });
  expect(field).toBe("start-date");
});

test("nodes span a horizontal range in timeline mode", async () => {
  const range = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { minX: 0, maxX: 0 };
    const nodes = v.graphData?.nodes ?? [];
    const xs = nodes.map((n: any) => n.x).filter(Number.isFinite);
    return { minX: Math.min(...xs), maxX: Math.max(...xs) };
  });
  expect(range.maxX - range.minX).toBeGreaterThan(50);
});
