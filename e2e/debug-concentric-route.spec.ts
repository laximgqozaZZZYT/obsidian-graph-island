/**
 * Concentric route — edge routing between concentric ring nodes
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

test("concentric edges connect existing nodes only", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodeIds = new Set((v?.graphData?.nodes ?? []).map((n: any) => n.id));
    const edges = v?.graphData?.edges ?? [];
    let invalid = 0;
    for (const e of edges) {
      const s = typeof e.source === "object" ? e.source.id : e.source;
      const t = typeof e.target === "object" ? e.target.id : e.target;
      if (!nodeIds.has(s) || !nodeIds.has(t)) invalid++;
    }
    return { totalEdges: edges.length, invalid };
  });
  expect(result.totalEdges).toBeGreaterThan(0);
  expect(result.invalid).toBe(0);
});

test("edges span multiple ring distances", async () => {
  const spanCount = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const nodes = v?.graphData?.nodes ?? [];
    const edges = v?.graphData?.edges ?? [];
    if (nodes.length === 0) return 0;
    const cx = nodes.reduce((s: number, n: any) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s: number, n: any) => s + n.y, 0) / nodes.length;
    const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));
    let crossRing = 0;
    for (const e of edges) {
      const sId = typeof e.source === "object" ? e.source.id : e.source;
      const tId = typeof e.target === "object" ? e.target.id : e.target;
      const sn = nodeMap.get(sId);
      const tn = nodeMap.get(tId);
      if (!sn || !tn) continue;
      const sd = Math.sqrt((sn.x - cx) ** 2 + (sn.y - cy) ** 2);
      const td = Math.sqrt((tn.x - cx) ** 2 + (tn.y - cy) ** 2);
      if (Math.abs(sd - td) > 20) crossRing++;
    }
    return crossRing;
  });
  expect(spanCount).toBeGreaterThan(0);
});
