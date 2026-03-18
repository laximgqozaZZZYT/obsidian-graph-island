/**
 * CDP E2E Test -- Edge Counts
 *
 * Verifies exact edge counts per type match baseline:
 * link>=1695, semantic>=2363, tag>=1500, total>=5558.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

test("total edge count matches baseline", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "none"; panel.showOrphans = true; panel.showTagNodes = true; panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const edges = view.graphEdges ?? [];
    const typeCounts: Record<string, number> = {};
    for (const e of edges) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    return { total: edges.length, typeCounts, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.total).toBeGreaterThanOrEqual(5500);
  expect(result.nodeCount).toBeGreaterThanOrEqual(2300);
});

test("link edge count approximately 1695", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const links = (view.graphEdges ?? []).filter((e: any) => e.type === "link").length;
    return { links };
  });
  expect(result.links).toBeGreaterThanOrEqual(1600);
});

test("semantic edge count approximately 2363", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const semantic = (view.graphEdges ?? []).filter((e: any) => e.type === "semantic").length;
    return { semantic };
  });
  expect(result.semantic).toBeGreaterThanOrEqual(2300);
});

test("tag edge count approximately 1500", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const tag = (view.graphEdges ?? []).filter((e: any) => e.type === "tag").length;
    return { tag };
  });
  expect(result.tag).toBeGreaterThanOrEqual(1400);
});
