/**
 * Deep edge type verification — edge type counts match expected baseline
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

test("edge type distribution matches baseline", async () => {
  const counts = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const edges = v?.graphData?.edges ?? [];
    const byType: Record<string, number> = {};
    for (const e of edges) {
      const t = e.type ?? "unknown";
      byType[t] = (byType[t] ?? 0) + 1;
    }
    return byType;
  });
  expect(counts["link"]).toBeGreaterThanOrEqual(1500);
  expect(counts["link"]).toBeLessThanOrEqual(1900);
  expect(counts["semantic"]).toBeGreaterThanOrEqual(2100);
  expect(counts["semantic"]).toBeLessThanOrEqual(2600);
  expect(counts["tag"]).toBeGreaterThanOrEqual(1300);
  expect(counts["tag"]).toBeLessThanOrEqual(1700);
});

test("total edge count is approximately 5558", async () => {
  const total = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.graphData?.edges?.length ?? 0;
  });
  expect(total).toBeGreaterThanOrEqual(5000);
  expect(total).toBeLessThanOrEqual(6200);
});

test("every edge has valid source and target IDs", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const edges = v?.graphData?.edges ?? [];
    const nodeIds = new Set((v?.graphData?.nodes ?? []).map((n: any) => n.id));
    const invalid = edges.filter((e: any) => {
      const src = typeof e.source === "object" ? e.source.id : e.source;
      const tgt = typeof e.target === "object" ? e.target.id : e.target;
      return !nodeIds.has(src) || !nodeIds.has(tgt);
    });
    return { total: edges.length, invalid: invalid.length };
  });
  expect(result.total).toBeGreaterThan(0);
  expect(result.invalid).toBe(0);
});
