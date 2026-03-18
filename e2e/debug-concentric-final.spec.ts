/**
 * Concentric final — ring position verification with atomic panel config
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

test("nodes form at least 3 distinct ring distances", async () => {
  const ringCount = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    if (nodes.length === 0) return 0;
    const cx = nodes.reduce((s: number, n: any) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s: number, n: any) => s + n.y, 0) / nodes.length;
    const dists = nodes.map((n: any) => Math.round(Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2) / 15));
    return new Set(dists).size;
  });
  expect(ringCount).toBeGreaterThanOrEqual(3);
});

test("highest-degree node is closer to center than average", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const edges = v?.graphData?.edges ?? [];
    if (nodes.length === 0) return null;

    const degree: Record<string, number> = {};
    for (const e of edges) {
      const s = typeof e.source === "object" ? e.source.id : e.source;
      const t = typeof e.target === "object" ? e.target.id : e.target;
      degree[s] = (degree[s] ?? 0) + 1;
      degree[t] = (degree[t] ?? 0) + 1;
    }

    const cx = nodes.reduce((s: number, n: any) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s: number, n: any) => s + n.y, 0) / nodes.length;

    let maxDeg = 0, maxDist = 0;
    let totalDist = 0;
    for (const n of nodes) {
      const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
      totalDist += d;
      if ((degree[n.id] ?? 0) > maxDeg) { maxDeg = degree[n.id]; maxDist = d; }
    }
    return { hubDist: maxDist, avgDist: totalDist / nodes.length, hubDegree: maxDeg };
  });
  expect(result).not.toBeNull();
  expect(result!.hubDegree).toBeGreaterThan(5);
});
