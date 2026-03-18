/**
 * Concentric layout 5 — plugin reload and force run verification
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
      v.panel.searchQuery = "tag:battle";
      v.panel.showOrphans = true;
      v.panel.clusterArrangement = "concentric";
      v.rawData = null;
      v.doRender();
    }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v) { v.panel.searchQuery = ""; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
});

test("concentric x-y spread is roughly circular (aspect ratio near 1)", async () => {
  const ratio = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const xs = nodes.map((n: any) => n.x).filter(Number.isFinite);
    const ys = nodes.map((n: any) => n.y).filter(Number.isFinite);
    if (xs.length === 0) return 0;
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    return xRange > 0 && yRange > 0 ? Math.min(xRange, yRange) / Math.max(xRange, yRange) : 0;
  });
  expect(ratio).toBeGreaterThan(0.3);
});

test("concentric edge sources and targets exist in node set", async () => {
  const invalid = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodeIds = new Set((v?.graphData?.nodes ?? []).map((n: any) => n.id));
    const edges = v?.graphData?.edges ?? [];
    return edges.filter((e: any) => {
      const s = typeof e.source === "object" ? e.source.id : e.source;
      const t = typeof e.target === "object" ? e.target.id : e.target;
      return !nodeIds.has(s) || !nodeIds.has(t);
    }).length;
  });
  expect(invalid).toBe(0);
});
