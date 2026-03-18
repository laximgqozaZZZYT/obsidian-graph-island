/**
 * Rebuild verification — density parameter affects layout spacing
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

test("changing density and rebuilding produces different layouts", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;

    v.panel.density = 0.3;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const nodes1 = v.graphData?.nodes ?? [];
    const spread1 = Math.max(...nodes1.map((n: any) => n.x)) - Math.min(...nodes1.map((n: any) => n.x));

    v.panel.density = 0.9;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const nodes2 = v.graphData?.nodes ?? [];
    const spread2 = Math.max(...nodes2.map((n: any) => n.x)) - Math.min(...nodes2.map((n: any) => n.x));

    v.panel.density = 0.5;
    v.rawData = null;
    v.doRender();
    return { spread1, spread2, count1: nodes1.length, count2: nodes2.length };
  });
  expect(result).not.toBeNull();
  expect(result!.count1).toBeGreaterThan(100);
  expect(result!.count2).toBeGreaterThan(100);
  // Different density should produce different spatial spread
  expect(result!.spread1).not.toBe(result!.spread2);
});

test("rebuild preserves total node count", async () => {
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
  expect(result!.after).toBe(result!.before);
});
